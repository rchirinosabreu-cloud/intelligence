// Evaluación de redacción, no de búsqueda: las lecturas ficticias ya están resueltas.
// No importa chats privados, no conecta una base y no valida efectos operativos.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildInstructions } from '../src/lib/briaAssistant.js';
import { briaInvestigationTools } from '../src/services/briaInvestigationTools.js';
import { createCaseEvalProvider } from './lib/briaResearchRuntime.js';

if (process.env.DATABASE_URL || process.env.DIRECT_URL) throw new Error('Esta evaluación no admite base de datos.');
const { OPENAI_API_KEY: apiKey, BRIA_EVAL_MODEL: model, BRIA_CHAT_REASONING_EFFORT: effort, BRIA_EVAL_OUTPUT: output } = process.env;
if (!apiKey || !model || !effort || !output) throw new Error('Inyecta credencial, modelo, razonamiento, salida y límites explícitos.');
const usage = [], modelRequests = [], turns = [];
let sent = 0;
const ai = await createCaseEvalProvider({ apiKey, models: { chat: model }, usage, fetchImpl: async (url, init) => {
  if (String(url) !== 'https://api.openai.com/v1/responses') throw new Error('Proveedor no permitido.');
  if (JSON.parse(init.body).reasoning?.effort !== effort) throw new Error('Razonamiento diferente al declarado.');
  // Una petición por caso: ningún reintento automático sale a la red.
  if (++sent > modelRequests.length) throw new Error('No se reintentan llamadas de evaluación.');
  return fetch(url, init);
} });
const task = { id: 'demo-task', titulo: 'Portal de Ladera Ficticia', responsable: 'Elena Sol', estado: 'EN_PROCESO', fechaRegistrada: '2026-10-23',
  tiempoRegistrado: '05:20:00', sesiones: [{ dia: '2026-10-21', tiempo: '03:00:00' }, { dia: '2026-10-23', tiempo: '02:20:00', simultanea: true }],
  comentarioActual: 'El acceso de clientes pasó las pruebas; la exportación sigue fallando en cuentas vacías.',
  compromisoExterno: null, estimacionRestante: null, porcentajeVerificado: null };
const common = { tarea: task, actividad: { estado: 'LIBRE', consultadoEn: '2026-10-25T15:00:00Z', alcance: 'Estado puntual, no capacidad futura.' },
  carga: { estimacionComparable: null }, documento: { leido: false, motivo: 'La lectura autorizada devolvió un fallo temporal.' } };
const cases = [
  { id: 'recorded-time', question: '¿Entonces no se ha trabajado nada en el portal?', data: common,
    review: 'Reconoce 5 h 20 min registradas, distingue pruebas del acceso y exportación pendiente; no convierte horas en porcentaje ni dedicación exclusiva.' },
  { id: 'recommendation', question: 'Me preocupa la entrega del portal. ¿Cómo lo ves y qué camino recomiendas? No cambies nada.', data: common, narrative: true,
    review: 'Respuesta primero, motivo cercano, alternativa útil sin inventar plazos/costos. Fecha registrada vencida no prueba incumplimiento externo; no descarta progreso conocido.' },
  { id: 'follow-up', question: 'Retomemos lo de ayer. ¿Ya podemos darlo por resuelto?', narrative: true,
    history: [{ role: 'user', content: 'Acordamos comprobar la exportación y que el cliente pudiera validar el portal antes de cerrar el asunto.' }],
    data: { ...common, tarea: { ...task, comentarioActual: 'La exportación ya pasó las pruebas. El cliente todavía no ha validado la entrega.' } },
    review: 'Abre con qué cambió y qué falta respecto del acuerdo; no cierra por haber pasado pruebas ni promete aviso automático.' },
  { id: 'correction', question: 'No eran ocho horas. Revisa el registro y dime cuánto hay realmente.',
    history: [{ role: 'assistant', content: 'El portal registra ocho horas de trabajo.' }], data: common,
    review: 'Corrige a 5 h 20 min con brevedad, sin repetir disculpas, sin extrapolar avance.' },
  { id: 'customer-draft', question: 'Redacta un mensaje corto para el cliente con el estado del portal. Quiero revisarlo antes de enviarlo.', data: common,
    review: 'Borrador cortés, comprensible, comunica lo validado y lo pendiente sin exponer discusión interna, culpar a Elena, prometer fecha ni afirmar envío.' },
  { id: 'ambiguity', question: '¿Cómo va lo de Ladera?', data: { coincidencias: [{ id: 'demo-task', titulo: 'Portal de Ladera Ficticia' }, { id: 'demo-campaign', titulo: 'Campaña de Ladera Ficticia' }] },
    review: 'Una aclaración breve entre los dos asuntos, sin inventar estado ni pedir otra vez toda la información.' }
];
const narrative = briaInvestigationTools.find(row => row.name === 'actualizar_seguimiento').parameters.properties.relato;
const selected = process.env.BRIA_EVAL_VOICE_CASES?.split(',') || cases.map(row => row.id);
if (!selected.length || new Set(selected).size !== selected.length || selected.some(id => !cases.some(row => row.id === id))) throw new Error('Selección de casos desconocida o repetida.');
let failure = null;
try {
  for (const scenario of cases.filter(row => selected.includes(row.id))) {
    const instructions = buildInstructions({ person: { name: 'Iván', jobTitle: 'Dirección' }, today: '2026-10-25', tools: [{ name: 'consultar_caso' }] });
    const request = { instructions, model, reasoningEffort: effort, maxOutputTokens: 4800,
      governanceContext: { useCase: 'bria.assistant' },
      input: [...(scenario.history || []), { role: 'user', content: scenario.question },
        { type: 'function_call', call_id: 'reading', name: 'consultar_caso', arguments: '{}' },
        { type: 'function_call_output', call_id: 'reading', output: JSON.stringify({ ...scenario.data, comprobanteConsulta: { id: 'consulta-1', consultadoEn: '2026-10-25T15:00:00Z' } }) }],
      ...(scenario.narrative ? { responseSchema: { type: 'object', properties: { relato: narrative }, required: ['relato'], additionalProperties: false }, strictSchema: true } : {}) };
    modelRequests.push({ id: scenario.id, maxOutputTokens: request.maxOutputTokens });
    const result = await ai.generate(request);
    turns.push({ id: scenario.id, question: scenario.question, evidence: scenario.data, answer: result.text, review: scenario.review });
    assert.equal(result.functionCalls.length, 0, 'esta prueba solo redacta sobre lecturas ya resueltas');
    assert.ok(result.text?.trim(), 'respuesta vacía');
    if (scenario.narrative) {
      // El formato estricto produce JSON, no un bloque Markdown ni un parser de intención.
      const parsed = JSON.parse(result.text);
      assert.ok(parsed.relato.length > 0);
      assert.ok(parsed.relato.every(row => row.consultas.length > 0 && row.consultas.every(id => id === 'consulta-1')), 'citas ajenas a la lectura del caso');
      assert.ok(parsed.relato.map(row => row.texto).join('\n').length <= 4000);
    }
  }
} catch (error) { failure = String(error.message).replaceAll(apiKey, '[REDACTADO]'); }
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify({ fictional: true, scenario: 'voice', scope: 'redacción sobre lecturas ficticias, revisión cualitativa pendiente', model, effort, pass: !failure, failure, modelRequests, turns, usage }, null, 2));
console.log(failure ? `FALLA: ${failure}` : `OK: ${turns.length} respuestas generadas; revisar contenido y voz antes de aceptar.`);
process.exitCode = failure ? 1 : 0;
