// Que Bria se mida (Rodny, 14 de octubre de 2026): corre el conjunto de preguntas reales de `tests/evals/briaCases.js`
// contra el modelo real, con herramientas ficticias (ningún dato de la agencia ni de un cliente sale de aquí) y sin
// tocar ninguna base de datos. Se corre a mano, nunca en CI:
//
//   BRIA_EVAL_OUTPUT=tmp/bria-casos.json npm run eval:bria-casos -- [--solo <id>] [--repeticiones 2]
//
// Usa OPENAI_API_KEY inyectada (y el modelo de chat); si falta, lee `.env` o BRIA_PROJECT_ENV. Escribe un informe JSON con cada
// respuesta y su veredicto, imprime el resumen y termina con código 1 si algún caso falló.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadCaseEvalConfig, createCaseEvalProvider } from './lib/briaResearchRuntime.js';
import { createSettledEvalFetch } from './lib/briaEvalBudget.js';
import { EVAL_CASES, checkEvalAnswer } from '../tests/evals/briaCases.js';

const root = new URL('../', import.meta.url).href;
const argv = process.argv.slice(2);
const option = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
const only = option('--solo');
const repetitions = Math.max(1, Number(option('--repeticiones')) || 1);
const output = process.env.BRIA_EVAL_OUTPUT;
if (!output) throw new Error('Indica BRIA_EVAL_OUTPUT (ruta del informe JSON).');

const config = await loadCaseEvalConfig();
if (!config.OPENAI_API_KEY) throw new Error('No hay OPENAI_API_KEY en el archivo de entorno.');
// Solo la llave y el modelo: ninguna conexión a base de datos entra al proceso.
process.env.OPENAI_API_KEY = config.OPENAI_API_KEY;
// El modelo declarado en el presupuesto manda sobre el del archivo de entorno: así se compara otro modelo sin tocar `.env`.
if (process.env.BRIA_EVAL_MODEL) process.env.OPENAI_MODEL_CHAT = process.env.BRIA_EVAL_MODEL;
else if (config.OPENAI_MODEL_CHAT) process.env.OPENAI_MODEL_CHAT = config.OPENAI_MODEL_CHAT;
if (config.OPENAI_MODEL) process.env.OPENAI_MODEL = config.OPENAI_MODEL;

const { createReadingEvalFixture } = await import(root + 'tests/evals/briaReadingFixture.js');
const { runAssistant } = await import(root + 'src/lib/briaAssistant.js');
const { briaAssistantTools } = await import(root + 'src/services/briaAssistantTools.js');
const { createBriaActionTools } = await import(root + 'src/services/briaActionTools.js');
const { createDailyReadingTools } = await import(root + 'src/services/dailyReadingTools.js');
const { createAgencyFactTools } = await import(root + 'src/services/briaAgencyFactTools.js');
const { createBriaTaskDraftService } = await import(root + 'src/services/briaTaskDraftService.js');
const { createBriaTaskTools } = await import(root + 'src/services/briaTaskTools.js');
const { briaClientUpdateTools } = await import(root + 'src/services/briaClientUpdateTools.js');
const { runWithAiContext } = await import(root + 'src/lib/aiRequestContext.js');
const { AI_MODELS } = await import(root + 'src/config/aiConfig.js');

const today = '2026-10-15';
const user = { userId: 'eval-ficticio', id: 'eval-ficticio', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true, parrillas: true, clientes: true, minutas: true } };
const person = { name: 'Evaluador Ficticio', memberId: 'm-eval', jobTitle: 'Coordinación' };

// Datos ficticios. Nada de esto existe en la plataforma.
const clients = [
  { id: 'cli-aristea', nombre: 'Aristea Ficticia', slug: 'aristea-ficticia', estado: 'ACTIVO', archivado: false, communityManager: 'Kamila Ficticia', projectManager: 'Evaluador Ficticio' },
  { id: 'cli-nube-azul', nombre: 'Nube Azul Ficticia', slug: 'nube-azul', estado: 'ACTIVO', archivado: false, communityManager: 'Jarlan Ficticio', projectManager: 'Evaluador Ficticio' },
  { id: 'cli-nube-verde', nombre: 'Nube Verde Ficticia', slug: 'nube-verde', estado: 'ACTIVO', archivado: false, communityManager: 'Jarlan Ficticio', projectManager: 'Evaluador Ficticio' },
  // Una cuenta de la lectura también existe al buscarla: ambas herramientas comparten el inventario ficticio.
  ...createReadingEvalFixture({ today }).clients.filter(({ id }) => id !== 'cli-aristea').map(({ id, name, slug }) => ({ id, nombre: name, slug, estado: 'ACTIVO', archivado: false, communityManager: 'Kamila Ficticia', projectManager: 'Evaluador Ficticio' }))
];
const tasks = [
  { id: 't-1', titulo: 'Portada de octubre para Aristea Ficticia', estado: 'PENDIENTE', cliente: 'Aristea Ficticia', responsable: 'Evaluador Ficticio', vence: '2026-10-17', vencida: false, prioridad: 'alta', privada: false },
  { id: 't-2', titulo: 'Guion del reel de bienvenida', estado: 'EN_CURSO', cliente: 'Nube Azul Ficticia', responsable: 'Evaluador Ficticio', vence: today, vencida: false, prioridad: null, privada: false },
  { id: 't-3', titulo: 'Carrusel de datos para Nube Verde', estado: 'PENDIENTE', cliente: 'Nube Verde Ficticia', responsable: 'Jarlan Ficticio', vence: '2026-10-20', vencida: false, prioridad: null, privada: false },
  { id: 't-4', titulo: 'Historias de la semana', estado: 'PENDIENTE', cliente: 'Nube Azul Ficticia', responsable: 'Jarlan Ficticio', vence: '2026-10-16', vencida: false, prioridad: null, privada: false },
  { id: 't-5', titulo: 'Ajustes del logo animado', estado: 'DEVUELTA', cliente: 'Aristea Ficticia', responsable: 'Jarlan Ficticio', vence: '2026-10-14', vencida: true, prioridad: null, privada: false },
  ...[6, 7, 8, 9].map((n) => ({ id: `t-${n}`, titulo: `Pieza sin dueño ${n}`, estado: 'PENDIENTE', cliente: 'Nube Verde Ficticia', responsable: null, vence: '2026-10-22', vencida: false, prioridad: null, privada: false }))
];
const pieces = [
  { id: 'p-1', titulo: 'Reel de bienvenida ficticio', fecha: '2026-10-06', formato: 'Reel', estado: 'APROBADO' },
  { id: 'p-2', titulo: 'Carrusel de datos ficticio', fecha: '2026-10-13', formato: 'Carrusel', estado: 'BORRADOR' },
  { id: 'p-3', titulo: 'Post de cierre ficticio', fecha: '2026-10-27', formato: 'Post', estado: 'BORRADOR' }
];
const plain = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const fixtureRuns = {
  buscar_cliente: ({ nombre }) => {
    const term = plain(nombre);
    const exact = clients.filter((row) => plain(row.nombre).includes(term));
    if (exact.length) return { clientes: exact };
    if (term.startsWith('arist')) return { clientes: [clients[0]], aproximado: true, instruccion: 'No había un cliente con ese nombre exacto; estos son los de nombre más parecido. Si el primero es claramente lo que la persona quiso decir, úsalo sin preguntar; si hay dudas entre varios, pregunta cuál.' };
    return { clientes: [] };
  },
  mis_tareas: () => ({ tareas: tasks.filter((task) => task.responsable === person.name) }),
  tareas_de_cliente: ({ clientId }) => { const client = clients.find((row) => row.id === clientId); return { tareas: client ? tasks.filter((task) => task.cliente === client.nombre) : [] }; },
  buscar_pendientes: (args = {}) => {
    let rows = tasks.filter((task) => task.estado !== 'REALIZADA');
    if (args.sinResponsable) rows = rows.filter((task) => !task.responsable);
    if (args.responsable) rows = rows.filter((task) => plain(task.responsable).includes(plain(args.responsable).split(' ')[0]));
    if (args.cliente) rows = rows.filter((task) => plain(task.cliente).includes(plain(args.cliente)) || clients.find((row) => row.id === args.cliente)?.nombre === task.cliente);
    if (args.vencidas) rows = rows.filter((task) => task.vencida);
    return { total: rows.length, descripcion: 'tareas ficticias que cumplen el filtro', tareas: rows };
  },
  parrilla_de_cliente: ({ clientId, mes, anio }) => {
    if (clientId !== 'cli-aristea') return { parrilla: null, mensaje: 'Este cliente no tiene parrilla registrada.' };
    const month = Number(mes) || 10, year = Number(anio) || 2026;
    if (year !== 2026 || month !== 10) return { parrilla: null, mensaje: `No hay parrilla de ${month}/${year} para este cliente.` };
    return { parrilla: { id: 'plan-aristea-10', mes: 10, anio: 2026, estado: 'EN_PRODUCCION', objetivo: 'Dar a conocer la nueva sede (ficticio)', piezas: pieces } };
  },
  carga_del_equipo: () => ({
    periodo: 'del jueves 15 al miércoles 28 de octubre de 2026 (10 días hábiles)', capacidadHoras: 80, nota: 'Son estimaciones a partir de lo que cada persona suele tardar.',
    personas: [
      { nombre: 'Kamila Ficticia', horasEstimadas: 14, ocupacion: 18, lectura: 'tiene espacio', diasExcedidos: [] },
      { nombre: 'Jarlan Ficticio', horasEstimadas: 74, ocupacion: 93, lectura: 'al límite', diasExcedidos: ['viernes 16 de octubre'] }
    ]
  })
};
const titles = { TASK_UPDATE: 'Cambiar un pendiente', TASKS_STATUS: 'Cambiar varios pendientes', CLIENT_NOTE: 'Registrar una observación' };
const fakeActionService = { prepare: async ({ type, args }) => ({ type, title: titles[type] || type, status: 'PENDING', summary: Object.entries(args || {}).filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length)).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`), missing: [], warnings: [] }) };
const readTools = briaAssistantTools.filter((tool) => fixtureRuns[tool.name]).map((tool) => ({ ...tool, allowed: () => true, run: async (args) => ({ data: fixtureRuns[tool.name](args || {}), sources: [] }) }));
const actionTools = createBriaActionTools(fakeActionService).filter((tool) => ['cambiar_pendiente', 'cambiar_pendientes', 'registrar_observacion'].includes(tool.name)).map((tool) => ({ ...tool, allowed: () => true }));
// Escribirle al cliente (19 de octubre de 2026): la herramienta real, sobre una parrilla ficticia, para probar también
// su instrucción y que nunca se cuele lo que el cliente no ve.
const noon = (day) => new Date(`${day}T12:00:00.000Z`);
const clientPlanItems = [
  { id: 'cp-1', objective: 'Reel de la nueva sede', format: 'Reel', publishDate: noon('2026-10-10'), publishTime: '11:00', status: 'PUBLICADO', comments: '', revisionRequestedAt: null, publications: [{ status: 'PUBLISHED', platform: 'INSTAGRAM', permalink: 'https://www.instagram.com/p/demo/', publishedAt: new Date('2026-10-10T16:01:00Z'), scheduledAt: null }] },
  { id: 'cp-2', objective: 'Carrusel de horarios', format: 'Carrusel', publishDate: noon('2026-10-17'), publishTime: null, status: 'EN_REVISION', comments: '', revisionRequestedAt: null, publications: [], copyText: 'GUION INTERNO: escena del parqueadero' },
  { id: 'cp-3', objective: 'Post de bienvenida', format: 'Post', publishDate: noon('2026-10-20'), publishTime: null, status: 'DEVUELTO', comments: '[Cliente - 14/10/2026]: Usen la foto de la fachada', revisionRequestedAt: null, publications: [] }
];
const clientUpdateDb = { contentPlan: { findFirst: async ({ where }) => (where.clientId === 'cli-aristea' ? { id: 'plan-aristea-10', month: 10, year: 2026, shareToken: 'demo-token', client: { name: 'Aristea Ficticia', contactName: 'Laura Ficticia' }, contentItems: clientPlanItems } : null) } };
const clientTools = briaClientUpdateTools.map((tool) => ({ ...tool, allowed: () => true, run: (args, ctx) => tool.run(args, { ...ctx, db: clientUpdateDb, today }) }));
// Las fichas del equipo (20 de octubre de 2026): una ficha ficticia con la forma que entrega el servicio. Solo la de
// cómo trabajar con alguien; la memoria de la agencia completa no entra en estos casos.
const fichaTools = createAgencyFactTools({
  consult: async () => ({ hechos: [], dudas: [], nota: 'Sin hechos ficticios.' }),
  record: async () => { throw new Error('No se guarda nada en la evaluación.'); },
  retire: async () => { throw new Error('No se retira nada en la evaluación.'); },
  howToWorkWith: async ({}, { nombre }) => (/helen/i.test(nombre) ? {
    persona: { nombre: 'Helen Ficticia', rol: 'Estratega digital' },
    ficha: [
      'Confiar: la comunicación con el cliente, cortés y argumentada; el ojo para el texto y la coherencia de marca.',
      'Revisar: la versión que sale: errores de versión o destinatario en semanas de pico.',
      'Cómo decírselo: con la decisión que se le pide al inicio y en la plataforma, no en el grupo. Acepta la corrección enseguida; bajo presión se defiende con el contexto y suele tenerlo.',
      'Qué le pesa: heredar cuentas sin empalme y los días sin computador o sin conexión.',
      'Dónde roza: a sus pares les dice las cosas de frente y reconoce su parte.'
    ],
    nota: 'Úsala sin recitarla: nunca digas «según tu ficha» ni cuentes a nadie qué dice.'
  } : { persona: null, ficha: null, nota: 'No hay nadie en el equipo con ese nombre.' })
}).filter((tool) => tool.name === 'como_trabajar_con').map((tool) => ({ ...tool, allowed: () => true }));
// Crear pendientes en una sola vuelta (20 de octubre de 2026): el servicio real de borradores sobre un equipo y
// unos clientes ficticios; nunca crea nada, porque en la evaluación nadie confirma.
const members = [{ id: 'm-kamila', name: 'Kamila Ficticia', role: 'Project Manager', isActive: true, userId: 'u-kamila' }, { id: 'm-jarlan', name: 'Jarlan Ficticio', role: 'Community Manager', isActive: true, userId: 'u-jarlan' }];
const like = (value, term) => plain(value).includes(plain(term));
const taskDrafts = createBriaTaskDraftService({
  db: {
    client: { findMany: async ({ where }) => clients.filter((row) => where.OR.some((c) => (c.name?.contains && like(row.nombre, c.name.contains)) || (c.slug?.equals && plain(row.slug) === plain(c.slug.equals)))).map((row) => ({ id: row.id, name: row.nombre, slug: row.slug, isArchived: false })), findUnique: async () => null },
    teamMember: { findMany: async ({ where }) => members.filter((m) => where.OR.some((c) => c.name?.contains && like(m.name, c.name.contains))), findUnique: async () => null },
    task: { findUnique: async () => null }
  },
  now: () => new Date(`${today}T17:00:00Z`), createTask: async () => { throw new Error('En la evaluación no se crea ningún pendiente.'); }
});
const taskTools = createBriaTaskTools(taskDrafts).map((tool) => ({ ...tool, allowed: () => true, run: (args, ctx) => tool.run(args, { ...ctx, taskEvidence: ctx.question || '' }) }));
const baseTools = [...readTools, ...actionTools, ...clientTools, ...fichaTools, ...taskTools];

const usage = [];
// Comparar modelos (1 de noviembre de 2026): el mismo conjunto de casos con otro modelo o esfuerzo, con tope en dólares
// reservado antes de cada llamada (`createSettledEvalFetch`) y el costo real de cada respuesta en el informe. Sin tope
// en dólares se corre como siempre, con los topes de llamadas, bytes y tokens.
const effort = process.env.BRIA_EVAL_EFFORT || null;
if (effort && !['low', 'medium', 'high'].includes(effort)) throw new Error('BRIA_EVAL_EFFORT: low, medium o high.');
const prices = ['BRIA_EVAL_INPUT_USD_PER_MILLION', 'BRIA_EVAL_CACHED_INPUT_USD_PER_MILLION', 'BRIA_EVAL_CACHE_WRITE_USD_PER_MILLION', 'BRIA_EVAL_OUTPUT_USD_PER_MILLION'].map((key) => Number(process.env[key]));
const maxUsd = Number(process.env.BRIA_EVAL_MAX_USD);
const budget = Number.isFinite(maxUsd) && maxUsd > 0
  ? createSettledEvalFetch({ model: process.env.BRIA_EVAL_MODEL, maxUsd, inputUsdPerMillion: prices[0], cachedInputUsdPerMillion: prices[1], cacheWriteUsdPerMillion: prices[2], outputUsdPerMillion: prices[3] })
  : null;
const usdOf = (u) => (!u || !prices.every(Number.isFinite) ? null
  : ((u.inputTokens - (u.cachedTokens || 0) - (u.cacheWriteTokens || 0)) * prices[0] + (u.cachedTokens || 0) * prices[1] + (u.cacheWriteTokens || 0) * prices[2] + u.outputTokens * prices[3]) / 1e6);
const provider = await createCaseEvalProvider({ apiKey: config.OPENAI_API_KEY, models: AI_MODELS, usage, ...(budget ? { fetchImpl: budget.fetch } : {}) });
const ai = { generate: (request) => provider.generate({ ...request, ...(effort ? { reasoningEffort: effort } : {}) }) };
const selected = EVAL_CASES.filter((item) => !only || item.id === only);
if (!selected.length) throw new Error(`No hay un caso con id «${only}».`);
const results = [];
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
const summary = () => {
  const passed = results.filter((row) => row.pass).length;
  const usd = results.reduce((sum, row) => sum + (row.usd || 0), 0);
  const ms = results.length ? Math.round(results.reduce((sum, row) => sum + row.ms, 0) / results.length) : 0;
  return { passed, total: results.length, usd: Number(usd.toFixed(4)), committedUsd: budget ? Number(budget.committedUsd().toFixed(4)) : null, meanMs: ms, calls: results.reduce((sum, row) => sum + (row.usage?.calls || 0), 0) };
};
const save = () => writeFile(path.resolve(output), JSON.stringify({ createdAt: new Date().toISOString(), fictional: true, model: AI_MODELS.chat, effort: effort || 'medium (runAssistant)', maxUsd: budget ? maxUsd : null, today, summary: summary(), cases: selected.map(({ id, question, why }) => ({ id, question, why })), results, usage }, null, 2));

for (let repeat = 0; repeat < repetitions; repeat += 1) for (const item of selected) {
  const start = Date.now();
  const toolCalls = [];
  // El servicio real lee una memoria nueva por caso y repetición; nada anotado contamina el siguiente caso.
  const readingFixture = createReadingEvalFixture({ today, userRef: user.id });
  const readingTools = createDailyReadingTools(readingFixture.service, { readingDay: item.readingDay || null });
  const tools = [...baseTools, ...readingTools].map((tool) => ({ ...tool, run: async (args, ctx) => { toolCalls.push({ name: tool.name, args }); return tool.run(args, ctx); } }));
  try {
    const answer = await runWithAiContext({ actorId: user.userId, module: 'bria', route: 'MAINTENANCE FICTIONAL CASE EVAL' }, () => runAssistant({ question: item.question, attachments: item.attachments || [], user, person, tools, ai, today }));
    const verdict = checkEvalAnswer(item, { answer: answer.answer, toolsUsed: answer.toolsUsed || [], toolCalls, decisionRecords: readingFixture.records, pendingAction: answer.pendingAction || null, today });
    const usd = usdOf(answer.usage);
    results.push({ case: item.id, repeat, ms: Date.now() - start, usage: answer.usage || null, usd: usd === null ? null : Number(usd.toFixed(5)), toolsUsed: answer.toolsUsed, toolCalls, decisionRecords: readingFixture.records, answer: answer.answer, ...verdict });
    console.log(`${verdict.pass ? 'OK ' : 'FALLA'} ${item.id}${repetitions > 1 ? ` #${repeat + 1}` : ''} (${Date.now() - start} ms${usd === null ? '' : `, USD ${usd.toFixed(4)}`})${verdict.failures.length ? `\n   - ${verdict.failures.join('\n   - ')}` : ''}`);
  } catch (error) {
    const errorText = `${error.code || error.status || error.name}: ${error.message}`.replaceAll(config.OPENAI_API_KEY, '[REDACTADO]').replace(/\bsk-[\w-]+\b/g, '[REDACTADO]');
    results.push({ case: item.id, repeat, ms: Date.now() - start, toolCalls, decisionRecords: readingFixture.records, pass: false, failures: [`error: ${errorText}`] });
    console.log(`ERROR ${item.id}: ${errorText}`);
  }
  await save();
}
const { passed, total, usd, committedUsd, meanMs } = summary();
console.log(`\n${passed} de ${total} respuestas pasaron · ${AI_MODELS.chat}/${effort || 'medium'} · ${meanMs} ms por caso${prices.every(Number.isFinite) ? ` · USD ${usd.toFixed(4)}${committedUsd !== null ? ` (reservado ${committedUsd.toFixed(4)} de ${maxUsd})` : ''}` : ''}. Informe: ${path.resolve(output)}`);
process.exitCode = passed === total ? 0 : 1;
setTimeout(() => process.exit(process.exitCode), 500).unref();
