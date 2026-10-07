// Bria a la que se le pregunta (Rodny, 6 de octubre de 2026: «un asistente completo de acompañamiento y
// ayuda según su rol»). Lo que convierte a Bria en asistente no es un chat: es que pueda buscar en la
// plataforma con los permisos de quien pregunta y responder con evidencia.
//
// Tres reglas que viven aquí y no en el modelo:
// 1. Los permisos van en las herramientas. Una herramienta que la persona no puede usar no se le ofrece al
//    modelo y, si la pide igual, no corre: el modelo nunca sabe más que quien le pregunta.
// 2. Una herramienta que falla no tumba la respuesta: el modelo recibe «esa parte falló» y responde con lo
//    demás; el fallo queda anotado para el registro.
// 3. Lo que una herramienta no devuelve no existe. Sin fuente, Bria dice que no sabe.
//
// Lógica pura: el modelo y la base entran inyectados. Detalle: docs/PLAN_BRIA_SIGUIENTE_NIVEL_2026-10-06.md.

export const ASSISTANT_USE_CASE = 'bria.assistant';
export const MAX_QUESTION_LENGTH = 1000;
export const MAX_HISTORY_TURNS = 10;
export const MAX_HISTORY_TURN_LENGTH = 2000;
export const MAX_TOOL_ROUNDS = 4;
export const MAX_ANSWER_TOKENS = 900;

const FALLBACK_ANSWER = 'No pude armar una respuesta con lo que encontré. Intenta preguntarlo de otra forma.';
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «2026-10-06» → «6 de octubre de 2026». Se lee el texto, nunca un Date: el día no se corre con la zona. */
export const humanDate = (key) => {
  const [year, month, day] = String(key || '').split('-').map(Number);
  if (!year || !month || !day) return String(key || '');
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
};

export const normalizeQuestion = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION_LENGTH);

export const normalizeHistory = (history) => (Array.isArray(history) ? history : [])
  .filter((turn) => turn && typeof turn === 'object' && ['user', 'assistant'].includes(turn.role) && typeof turn.text === 'string' && turn.text.trim())
  .slice(-MAX_HISTORY_TURNS)
  .map((turn) => ({ role: turn.role, text: turn.text.trim().slice(0, MAX_HISTORY_TURN_LENGTH) }));

/** Las herramientas que esta persona puede usar. Un `allowed` que falla cuenta como «no». */
export const visibleTools = (tools = [], user) => tools.filter((tool) => {
  try { return tool?.allowed?.(user) === true; } catch { return false; }
});

export const toolDeclarations = (tools = []) => tools.map(({ name, description, parameters }) => ({
  name,
  description: description || '',
  parameters: parameters || { type: 'object', properties: {} }
}));

export const buildInstructions = ({ person, today, tools = [] }) => {
  const who = [person?.name || 'colega', person?.jobTitle].filter(Boolean).join(', ');
  const toolLines = tools.length
    ? tools.map((tool) => `- ${tool.name}: ${tool.description}`).join('\n')
    : '- (ninguna: esta persona no tiene permisos para consultar datos; responde solo con lo que ella misma te cuente y dile qué pantallas podría pedir que le habiliten)';
  return [
    'Eres Bria, la asistente de Brainstudio Intelligence, la plataforma interna de la agencia Brain Studio.',
    `Hoy es ${humanDate(today)} (hora de Bogotá). Hablas con ${who}.`,
    'Reglas:',
    '1. Escribe en español de Latinoamérica: trata de tú y, en plural, de ustedes. Nunca uses la forma peninsular de la segunda persona del plural.',
    '2. Responde corto y concreto: lo que preguntaron y nada más. Usa una lista cuando hay varios elementos; sin encabezados ni adornos.',
    '3. Solo sabes lo que devuelven las herramientas de esta conversación. Nunca inventes nombres, fechas, cifras, estados ni citas. Si las herramientas no traen lo que hace falta, di que no tienes esa información y en qué pantalla de la plataforma se puede ver.',
    '4. Antes de hablar de un cliente, búscalo con buscar_cliente para tener su id y su slug. Si hay varios parecidos, pregunta cuál.',
    '5. Si una herramienta responde que la persona no tiene permiso, dile que esa información no está disponible para ella aquí; no la deduzcas por otro camino.',
    '6. No repitas la lista de fuentes al final: la plataforma la muestra aparte.',
    '7. Fechas como «6 de octubre»; horas en reloj de Bogotá.',
    `Herramientas disponibles para ${person?.name || 'esta persona'}:`,
    toolLines
  ].join('\n');
};

const turnToInput = (turn) => (turn.role === 'assistant'
  ? { role: 'assistant', content: [{ type: 'output_text', text: turn.text }] }
  : { role: 'user', content: [{ type: 'input_text', text: turn.text }] });

const describeError = (error) => (error && typeof error.message === 'string' ? error.message : String(error || 'error'));

/**
 * Una pregunta, de principio a fin: el modelo pide herramientas, se ejecutan con la identidad de quien
 * pregunta, y el ciclo sigue hasta que el modelo responde con texto o se agotan las vueltas (la última va
 * sin herramientas para que siempre haya respuesta). Devuelve la respuesta, las fuentes que la sostienen,
 * qué herramientas se usaron y cuáles fallaron.
 */
export const runAssistant = async ({
  question,
  history = [],
  user,
  person,
  tools = [],
  ai,
  today,
  maxRounds = MAX_TOOL_ROUNDS,
  context = {},
  logger = console
}) => {
  const offered = visibleTools(tools, user);
  const byName = new Map(offered.map((tool) => [tool.name, tool]));
  const declarations = toolDeclarations(offered);
  const instructions = buildInstructions({ person, today, tools: offered });
  const governanceContext = { useCase: ASSISTANT_USE_CASE };
  const input = [...history.map(turnToInput), { role: 'user', content: [{ type: 'input_text', text: question }] }];
  const sources = new Map();
  const toolsUsed = [];
  const failures = [];
  let rounds = 0;

  const execute = async (call) => {
    const tool = byName.get(call.name);
    if (!tool) {
      return { error: `${person?.name || 'La persona'} no tiene permiso para usar «${call.name}» en la plataforma, o esa herramienta no existe. Dile que esa información no está disponible para ella aquí; no la inventes.` };
    }
    try {
      const outcome = await tool.run(call.args || {}, { user, person, today, ...context });
      if (!toolsUsed.includes(call.name)) toolsUsed.push(call.name);
      for (const source of outcome?.sources || []) {
        if (source?.kind && source?.id) sources.set(`${source.kind}:${source.id}`, source);
      }
      return outcome?.data ?? null;
    } catch (error) {
      logger.error(`[BriaAssistant] La herramienta ${call.name} falló:`, error?.response?.data || describeError(error));
      failures.push({ tool: call.name, message: describeError(error) });
      return { error: `No se pudo consultar ${call.name} ahora mismo. Dile a la persona que esa parte falló y responde con lo demás.` };
    }
  };

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const lastRound = rounds >= maxRounds;
    const result = await ai.generate({
      // Una copia por llamada: lo que se añade después (llamadas y resultados) no cambia lo ya enviado.
      input: [...input],
      instructions,
      tools: lastRound ? [] : declarations,
      governanceContext,
      maxOutputTokens: MAX_ANSWER_TOKENS
    });
    const calls = lastRound ? [] : (result?.functionCalls || []);
    if (!calls.length) {
      return {
        answer: String(result?.text || '').trim() || FALLBACK_ANSWER,
        sources: [...sources.values()],
        toolsUsed,
        failures,
        rounds
      };
    }
    rounds += 1;
    input.push(...(result.output || []));
    for (const call of calls) {
      const output = await execute(call);
      input.push({ type: 'function_call_output', call_id: call.id, output: JSON.stringify(output) });
    }
  }
};
