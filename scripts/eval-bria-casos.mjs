// Que Bria se mida (Rodny, 14 de octubre de 2026): corre el conjunto de preguntas reales de `tests/evals/briaCases.js`
// contra el modelo real, con herramientas ficticias (ningún dato de la agencia ni de un cliente sale de aquí) y sin
// tocar ninguna base de datos. Se corre a mano, nunca en CI:
//
//   BRIA_EVAL_OUTPUT=tmp/bria-casos.json npm run eval:bria-casos -- [--solo <id>] [--repeticiones 2]
//
// Lee OPENAI_API_KEY (y el modelo de chat, si está) de `.env` o de BRIA_PROJECT_ENV. Escribe un informe JSON con cada
// respuesta y su veredicto, imprime el resumen y termina con código 1 si algún caso falló.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { loadResearchConfig } from './lib/briaResearchRuntime.js';
import { EVAL_CASES, checkEvalAnswer } from '../tests/evals/briaCases.js';

const root = new URL('../', import.meta.url).href;
const argv = process.argv.slice(2);
const option = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
const only = option('--solo');
const repetitions = Math.max(1, Number(option('--repeticiones')) || 1);
const output = process.env.BRIA_EVAL_OUTPUT;
if (!output) throw new Error('Indica BRIA_EVAL_OUTPUT (ruta del informe JSON).');

const config = await loadResearchConfig(process.env.BRIA_PROJECT_ENV || '.env');
if (!config.OPENAI_API_KEY) throw new Error('No hay OPENAI_API_KEY en el archivo de entorno.');
// Solo la llave y el modelo: ninguna conexión a base de datos entra al proceso.
process.env.OPENAI_API_KEY = config.OPENAI_API_KEY;
if (config.OPENAI_MODEL_CHAT) process.env.OPENAI_MODEL_CHAT = config.OPENAI_MODEL_CHAT;
if (config.OPENAI_MODEL) process.env.OPENAI_MODEL = config.OPENAI_MODEL;

const { createOpenAIClient } = await import(root + 'src/services/openAIClient.js');
const { runAssistant } = await import(root + 'src/lib/briaAssistant.js');
const { briaAssistantTools } = await import(root + 'src/services/briaAssistantTools.js');
const { createBriaActionTools } = await import(root + 'src/services/briaActionTools.js');
const { createDailyReadingTools } = await import(root + 'src/services/dailyReadingTools.js');
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
  { id: 'cli-nube-verde', nombre: 'Nube Verde Ficticia', slug: 'nube-verde', estado: 'ACTIVO', archivado: false, communityManager: 'Jarlan Ficticio', projectManager: 'Evaluador Ficticio' }
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
    periodo: 'del jueves 15 al martes 28 de octubre de 2026 (10 días hábiles)', capacidadHoras: 80, nota: 'Son estimaciones a partir de lo que cada persona suele tardar.',
    personas: [
      { nombre: 'Kamila Ficticia', horasEstimadas: 14, ocupacion: 18, lectura: 'tiene espacio', diasExcedidos: [] },
      { nombre: 'Jarlan Ficticio', horasEstimadas: 74, ocupacion: 93, lectura: 'al límite', diasExcedidos: ['viernes 16 de octubre'] }
    ]
  })
};
// La memoria del tiempo (19 de octubre de 2026): una lectura ficticia con la forma que entrega el servicio.
const readingFixture = ({ cliente = '' } = {}) => ({
  fecha: today, comparadaCon: '2026-10-14', escritaPor: 'Bria', historia: '12 fotos diarias desde el 2026-10-04',
  resumen: 'Aristea Ficticia sigue en rojo y sus aprobaciones no se mueven; Jarlan Ficticio acumula vencidas desde el viernes.',
  decisiones: [
    { numero: 1, titulo: 'Destrabar las aprobaciones de Aristea Ficticia', porque: 'Cuatro piezas llevan ocho días esperando y el mes va atrasado.', tipo: 'HACER', sobre: 'Aristea Ficticia', pedido: 'Redáctame un mensaje por WhatsApp para Aristea Ficticia para que apruebe lo pendiente.', seVeEn: ['Aristea Ficticia lleva 8 días seguidos con piezas esperando su aprobación (hoy 4).'], anotada: null },
    { numero: 2, titulo: 'No cargarle más trabajo a Jarlan Ficticio esta semana', porque: 'Lleva cinco días con tareas vencidas y pasó de 2 a 5 desde la última lectura.', tipo: 'NO_HACER', sobre: 'Jarlan Ficticio', pedido: null, seVeEn: ['Jarlan Ficticio lleva 5 días con tareas vencidas (hoy 5).', 'Jarlan Ficticio pasó de 2 a 5 tareas vencidas desde la última lectura.'], anotada: null }
  ],
  libroDeDecisiones: { propuestas: 9, anotadas: 4, hechas: 3, descartadas: 1, aplazadas: 0, hechasQueSeResolvieron: 2, hechasQueSiguen: 1, descartadasQueSeResolvieronSolas: 0, descartadasQueSiguen: 1, tasaDeAdopcion: 0.33, tasaDeAcierto: 0.67, pendientesDeDesenlace: 0, lectura: 'De 9 decisiones propuestas se anotaron 4: 3 hechas, 1 descartada y 0 aplazadas. De las hechas con desenlace, 2 de 3 se resolvieron. De las descartadas, 0 se resolvieron solas y 1 sigue.' },
  senales: [
    { sobre: 'Aristea Ficticia', cambio: 'peor', texto: 'Aristea Ficticia lleva 6 días en rojo: Van 3 publicadas; a esta fecha deberían ir 6.' },
    { sobre: 'Aristea Ficticia', cambio: 'peor', texto: 'Aristea Ficticia lleva 8 días seguidos con piezas esperando su aprobación (hoy 4).' },
    { sobre: 'Jarlan Ficticio', cambio: 'peor', texto: 'Jarlan Ficticio lleva 5 días con tareas vencidas (hoy 5).' },
    { sobre: 'Nube Azul Ficticia', cambio: 'mejor', texto: 'Nube Azul Ficticia volvió a verde: estaba en amarillo.' }
  ],
  ...(plain(cliente).includes('arist') ? { cuenta: {
    nombre: 'Aristea Ficticia', enlace: '/clientes/operacion/aristea-ficticia', color: 'rojo', motivos: ['Van 3 publicadas; a esta fecha deberían ir 6.'],
    lectura: 'Publica por debajo del ritmo del mes y las aprobaciones llevan más de una semana sin moverse.',
    senales: ['Aristea Ficticia lleva 6 días en rojo: Van 3 publicadas; a esta fecha deberían ir 6.', 'Aristea Ficticia lleva 8 días seguidos con piezas esperando su aprobación (hoy 4).'],
    serie: ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15'].map((fecha, i) => ({ fecha, color: i === 0 ? 'amarillo' : 'rojo', publicadas: `${i < 4 ? 2 : 3} de 12 (deberían ir ${3 + Math.floor(i / 2)})`, esperanAprobacion: 4, devoluciones: 1, tareasAbiertas: 6, vencidas: i < 3 ? 0 : 1, horasDelDiaAnterior: i % 2 ? 1.5 : 0 }))
  } } : {})
});
const titles = { TASK_UPDATE: 'Cambiar un pendiente', TASKS_STATUS: 'Cambiar varios pendientes', CLIENT_NOTE: 'Registrar una observación' };
const fakeActionService = { prepare: async ({ type, args }) => ({ type, title: titles[type] || type, status: 'PENDING', summary: Object.entries(args || {}).filter(([, value]) => value != null && value !== '' && (!Array.isArray(value) || value.length)).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`), missing: [], warnings: [] }) };
const readTools = briaAssistantTools.filter((tool) => fixtureRuns[tool.name]).map((tool) => ({ ...tool, allowed: () => true, run: async (args) => ({ data: fixtureRuns[tool.name](args || {}), sources: [] }) }));
const actionTools = createBriaActionTools(fakeActionService).filter((tool) => ['cambiar_pendiente', 'cambiar_pendientes', 'registrar_observacion'].includes(tool.name)).map((tool) => ({ ...tool, allowed: () => true }));
const readingTools = createDailyReadingTools({
  explain: async (args) => readingFixture(args),
  // El libro de decisiones (19 de octubre de 2026): la anotación ficticia responde como el servicio real.
  recordVerdict: async ({ ref, veredicto }) => (/^1$|arist|aprobaci/i.test(String(ref)) ? { saved: true, decision: 'Destrabar las aprobaciones de Aristea Ficticia', veredicto: /no\b/i.test(veredicto) ? 'NO' : 'HECHO', dia: today } : { saved: false, motivo: 'No sé a cuál decisión de la lectura te refieres: 1. Destrabar las aprobaciones de Aristea Ficticia · 2. No cargarle más trabajo a Jarlan Ficticio esta semana.' })
}).map((tool) => ({ ...tool, allowed: () => true }));
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
const baseTools = [...readTools, ...actionTools, ...clientTools, ...readingTools];

const provider = createOpenAIClient({ apiKey: config.OPENAI_API_KEY, models: AI_MODELS });
const selected = EVAL_CASES.filter((item) => !only || item.id === only);
if (!selected.length) throw new Error(`No hay un caso con id «${only}».`);
const results = [];
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
const save = () => writeFile(path.resolve(output), JSON.stringify({ createdAt: new Date().toISOString(), fictional: true, model: AI_MODELS.chat, today, cases: selected.map(({ id, question, why }) => ({ id, question, why })), results }, null, 2));

for (let repeat = 0; repeat < repetitions; repeat += 1) for (const item of selected) {
  const start = Date.now();
  const toolCalls = [];
  const tools = baseTools.map((tool) => ({ ...tool, run: async (args, ctx) => { toolCalls.push({ name: tool.name, args }); return tool.run(args, ctx); } }));
  try {
    const answer = await runWithAiContext({ actorId: user.userId, module: 'bria', route: 'MAINTENANCE FICTIONAL CASE EVAL' }, () => runAssistant({ question: item.question, attachments: item.attachments || [], user, person, tools, ai: provider, today }));
    const verdict = checkEvalAnswer(item, { answer: answer.answer, toolsUsed: answer.toolsUsed || [] });
    results.push({ case: item.id, repeat, ms: Date.now() - start, toolsUsed: answer.toolsUsed, toolCalls, answer: answer.answer, ...verdict });
    console.log(`${verdict.pass ? 'OK ' : 'FALLA'} ${item.id}${repetitions > 1 ? ` #${repeat + 1}` : ''} (${Date.now() - start} ms)${verdict.failures.length ? `\n   - ${verdict.failures.join('\n   - ')}` : ''}`);
  } catch (error) {
    results.push({ case: item.id, repeat, ms: Date.now() - start, toolCalls, pass: false, failures: [`error: ${error.code || error.status || error.name}: ${error.message}`] });
    console.log(`ERROR ${item.id}: ${error.code || error.status || error.name} ${error.message}`);
  }
  await save();
}
const passed = results.filter((row) => row.pass).length;
console.log(`\n${passed} de ${results.length} respuestas pasaron. Informe: ${path.resolve(output)}`);
setTimeout(() => process.exit(passed === results.length ? 0 : 1), 500).unref();
