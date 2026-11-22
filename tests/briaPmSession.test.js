import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPmDigest, buildPmRequest, parsePmSession, validatePmSession, pmSessionMessage, pmSessionSection, pmSessionText, PM_SESSION_SCHEMA } from '../src/lib/briaPmSession.js';
import { createPmBrain } from '../src/services/briaPmBrain.js';
import { createPmSessionService, PM_MAX_ATTEMPTS } from '../src/services/briaPmSessionService.js';
import { buildMorningBrief } from '../src/lib/dailyReading.js';

const TODAY = '2026-11-23'; // lunes
const tasks = [
  { id: 'a', title: 'Reel de lanzamiento', status: 'EN_CURSO', due: '2026-11-20', client: 'Aristea', assignee: 'Brayan' },
  { id: 'b', title: 'Carrusel de precios', status: 'PENDIENTE', due: '2026-11-23', client: 'Aristea', assignee: 'Brayan' },
  { id: 'c', title: 'Informe mensual', status: 'DEVUELTA', due: '2026-11-24', client: 'Foobespain', assignee: 'Camila' },
  { id: 'd', title: 'Guion de video', status: 'PENDIENTE', due: '2026-11-25', client: 'Foobespain', assignee: null }
];
const people = [{ name: 'Brayan', open: 14 }, { name: 'Camila', open: 3 }, { name: 'Laura', open: 0 }];
const digest = () => buildPmDigest({ today: TODAY, tasks, people, reading: { overview: 'Dos cuentas en amarillo.', decisions: [{ title: 'Destrabar aprobaciones de Aristea', why: 'Hay 4 piezas esperando.' }] }, book: '- 18 de noviembre: «Llamar a Foobespain». Rodny: la descartaste.' });

test('the digest gives every task a short reference and every person their load', () => {
  const data = digest();
  assert.equal(data.refs.get('T1').id, 'a');
  assert.match(data.text, /### Brayan · 14 abiertas en total · 1 vencida · 1 por vencer/);
  assert.match(data.text, /\[T1\] Reel de lanzamiento · Aristea · vencida hace 3 días · en curso/);
  assert.match(data.text, /\[T2\] Carrusel de precios · Aristea · vence hoy · pendiente/);
  assert.match(data.text, /### Laura · 0 abiertas en total/);
  assert.match(data.text, /### Sin responsable\n\[T4\] Guion de video/);
  assert.match(data.text, /## Libro de decisiones/);
  assert.deepEqual(data.clients, ['Aristea', 'Foobespain']);
  const request = buildPmRequest({ digest: data });
  assert.equal(request.schema, PM_SESSION_SCHEMA);
  assert.match(request.user, /^DATOS/);
  assert.doesNotMatch(request.system, /2026/, 'the stable instructions carry no date');
});

const answer = {
  resumen: 'Aristea tiene una entrega vencida y otra para hoy, las dos con Brayan.',
  riesgos: [
    { titulo: 'Aristea: dos entregas con la misma persona', porque: 'El reel venció el viernes y el carrusel vence hoy.', tareas: ['T1', '[T2]'], persona: 'brayan', cliente: 'Aristea' },
    { titulo: 'Riesgo inventado', porque: 'No existe.', tareas: ['T99'], persona: '', cliente: '' },
    { titulo: 'Brayan es lento', porque: 'Su rendimiento es bajo.', tareas: ['T3'], persona: 'Brayan', cliente: '' }
  ],
  movimientos: [
    { tarea: 'T2', de: 'Brayan', a: 'Laura', porque: 'Laura no tiene tareas abiertas y Brayan tiene 14.' },
    { tarea: 'T3', de: 'Brayan', a: 'Laura', porque: 'La tarea no es de Brayan.' },
    { tarea: 'T1', de: 'Brayan', a: 'Nadie Conocido', porque: 'No existe esa persona.' },
    { tarea: 'T1', de: 'Brayan', a: 'Brayan', porque: 'Misma persona.' }
  ],
  clientes: [
    { cliente: 'Foobespain', debe: 'El informe mensual, devuelto y con fecha de mañana.', tareas: ['T3'] },
    { cliente: 'Cliente Fantasma', debe: 'Algo.', tareas: ['T3'] },
    { cliente: 'Aristea', debe: 'Con tarea ajena.', tareas: ['T3'] }
  ],
  pregunta: '¿Laura puede tomar el carrusel de Aristea hoy?'
};

test('only proposals grounded in the data survive, and nothing judges a person', () => {
  const session = validatePmSession(parsePmSession(JSON.stringify(answer)), digest());
  assert.deepEqual(session.risks.map(risk => risk.title), ['Aristea: dos entregas con la misma persona']);
  assert.deepEqual(session.risks[0].tasks.map(task => task.id), ['a', 'b']);
  assert.equal(session.risks[0].person, 'Brayan', 'names come back exactly as in the data');
  assert.deepEqual(session.moves.map(move => [move.task.id, move.from, move.to]), [['b', 'Brayan', 'Laura']]);
  assert.deepEqual(session.clients.map(row => row.client), ['Foobespain']);
  assert.equal(session.rejected, 7);
  assert.equal(session.empty, false);
  assert.equal(parsePmSession('no es json'), null);
  assert.equal(validatePmSession(null, digest()).empty, true);
});

test('the session reaches Bria as her own review and the director in the morning brief', () => {
  const session = validatePmSession(answer, digest());
  const text = pmSessionText(session);
  assert.match(text, /Movimiento 1: pasar «Carrusel de precios» de Aristea \(Brayan, vence hoy\) de Brayan a Laura\./);
  const message = pmSessionMessage(session);
  assert.equal(message.role, 'developer');
  assert.match(message.content, /no cambios hechos/);
  assert.equal(pmSessionMessage(validatePmSession({}, digest())), null);
  const section = pmSessionSection(session).join('\n');
  assert.match(section, /\*\*Mi revisión de hoy como project manager\*\*/);
  assert.match(section, /\*\*Mover «Carrusel de precios» de Brayan a Laura\.\*\*/);
  const reading = { day: TODAY, source: 'REGLA', summary: { clients: { red: 0, yellow: 0, green: 1, gray: 0 }, team: { overdue: 1, returned: 1, open: 17 } }, signals: [{ id: 's' }], decisions: [] };
  assert.match(buildMorningBrief({ recipientName: 'Rodny', reading, pm: session }).text, /Mi revisión de hoy como project manager/);
  assert.doesNotMatch(buildMorningBrief({ recipientName: 'Camila', reading }).text, /project manager/);
});

const fakeRepo = () => ({
  saved: new Map(),
  async pmSession(day) { return this.saved.get(day) || null; },
  async savePmSession(day, session) { if (!this.saved.has(day)) this.saved.set(day, session); return this.saved.get(day); },
  async reading() { return null; },
  async recentDecisions() { return []; }
});
const fakeDb = (seen = {}) => ({
  task: {
    findMany: async (query) => { seen.tasks = query; return tasks.map(task => ({ id: task.id, title: task.title, status: task.status, dueDate: new Date(`${task.due}T12:00:00Z`), client: { name: task.client }, assignee: task.assignee ? { id: task.assignee, name: task.assignee, isActive: true } : null })); },
    groupBy: async () => [{ assigneeId: 'm-brayan', _count: { _all: 14 } }]
  },
  teamMember: { findMany: async () => [{ id: 'm-brayan', name: 'Brayan' }, { id: 'm-camila', name: 'Camila' }, { id: 'm-laura', name: 'Laura' }] }
});
const quiet = { warn() {}, info() {}, error() {} };

test('one session per business day: read, ask once, validate, save, and serve it only to administration', async () => {
  const repository = fakeRepo(), seen = {};
  let calls = 0;
  const service = createPmSessionService({ db: fakeDb(seen), repository, logger: quiet, now: () => new Date('2026-11-23T12:00:00Z'),
    brain: { plan: async (request) => { calls += 1; assert.match(request.user, /\[T1\] Reel de lanzamiento/); return { text: JSON.stringify(answer), model: 'modelo-de-prueba', usage: { input_tokens: 10 } }; } } });
  const session = await service.ensure();
  assert.equal(session.moves.length, 1);
  assert.equal(session.model, 'modelo-de-prueba');
  assert.equal(seen.tasks.where.isPrivate, false, 'private tasks never leave the platform');
  assert.equal(seen.tasks.where.dueDate.lt.toISOString(), '2026-11-27T05:00:00.000Z');
  await service.ensure();
  assert.equal(calls, 1, 'the saved session is reused');
  assert.equal((await service.today({ role: 'ADMIN' })).day, TODAY);
  assert.equal(await service.today({ role: 'PROJECT_MANAGER' }), null);
});

test('a failing model is tried a few times and never throws; weekends and a missing key do nothing', async () => {
  let calls = 0;
  const failing = createPmSessionService({ db: fakeDb(), repository: fakeRepo(), logger: quiet, now: () => new Date('2026-11-23T12:00:00Z'), brain: { plan: async () => { calls += 1; throw new Error('sin red'); } } });
  for (let i = 0; i < PM_MAX_ATTEMPTS + 2; i += 1) assert.equal(await failing.ensure(), null);
  assert.equal(calls, PM_MAX_ATTEMPTS);
  const weekend = createPmSessionService({ db: fakeDb(), repository: fakeRepo(), logger: quiet, now: () => new Date('2026-11-22T15:00:00Z'), brain: { plan: async () => { throw new Error('no debe llamarse'); } } });
  assert.equal(await weekend.ensure(), null);
  assert.equal(await createPmSessionService({ db: fakeDb(), repository: fakeRepo(), logger: quiet, brain: null, now: () => new Date('2026-11-23T12:00:00Z') }).ensure(), null);
});

test('the brain is off without a key, and asks the strong model for the schema through the governed exit', async () => {
  assert.equal(createPmBrain({ env: {} }), null);
  assert.equal(createPmBrain({ env: { ANTHROPIC_API_KEY: 'k', BRIA_PM: 'off' } }), null);
  let sent, context;
  const sse = (events) => new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
  const brain = createPmBrain({ env: { ANTHROPIC_API_KEY: 'k' }, fetchImpl: async (url, init) => {
    sent = JSON.parse(init.body); context = init.governanceContext;
    assert.equal(String(url), 'https://api.anthropic.com/v1/messages');
    return sse([
      { type: 'message_start', message: { id: 'm', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"resumen":"ok"}' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 7 } },
      { type: 'message_stop' }
    ]);
  } });
  const result = await brain.plan({ system: 'sistema', user: 'DATOS', schema: PM_SESSION_SCHEMA });
  assert.equal(result.text, '{"resumen":"ok"}');
  assert.equal(sent.model, 'claude-opus-5-5');
  assert.deepEqual(sent.output_config, { effort: 'high', format: { type: 'json_schema', schema: PM_SESSION_SCHEMA } });
  assert.equal(sent.thinking, undefined, 'this model always thinks; depth is set by effort');
  assert.equal(sent.stream, true);
  assert.deepEqual(context, { useCase: 'bria.pm-session' });
});
