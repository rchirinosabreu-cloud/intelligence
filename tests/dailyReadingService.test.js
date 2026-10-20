import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDailyReadingService, initDailyReadingScheduler, MORNING_BRIEF_NOTIFICATION } from '../src/services/dailyReadingService.js';
import { createDailyReadingTools } from '../src/services/dailyReadingTools.js';
import { buildNudges, isValidNudgeKey, nudgeActions } from '../src/lib/briaNudges.js';
import { buildInstructions, toolProgressLabel } from '../src/lib/briaAssistant.js';

// La memoria del tiempo y la mañana de dirección, de punta a punta con dobles (19 de octubre de 2026): foto a las
// 6:00 todos los días, lectura a las 6:30 y mensaje a las 7:30 en días hábiles, una vez cada cosa.

const H = 3_600_000;
const at = (bogotaTime, day = '2026-10-20') => new Date(Date.parse(`${day}T${bogotaTime}:00Z`) + 5 * H);

const memoryRepo = (seed = {}) => {
  const snapshots = new Map(Object.entries(seed)); // day -> { clients, people }
  const readings = new Map();
  return {
    snapshots, readings,
    async hasSnapshot(day) { return snapshots.has(day); },
    async saveSnapshot(day, value) { snapshots.set(day, value); return value.clients.length + value.people.length; },
    async snapshot(day) { return snapshots.get(day) || { clients: [], people: [] }; },
    async history(before) {
      return [...snapshots.entries()].filter(([day]) => day < before).sort().map(([day, value]) => ({
        day, clients: Object.fromEntries(value.clients.map((c) => [c.id, c.metrics])), people: Object.fromEntries(value.people.map((p) => [p.id, p.metrics]))
      }));
    },
    async series(type, id, { until }) {
      return [...snapshots.entries()].filter(([day]) => day <= until).sort().map(([day, value]) => {
        const row = (type === 'CLIENT' ? value.clients : value.people).find((r) => r.id === id);
        return row ? { day, name: row.name, metrics: row.metrics } : null;
      }).filter(Boolean);
    },
    async saveReading(day, reading) { if (!readings.has(day)) readings.set(day, reading); return readings.get(day); },
    async reading(day) { return readings.get(day) || null; },
    async latestReading() { return [...readings.entries()].sort().at(-1)?.[1] || null; },
    async readingsBefore(before) { return [...readings.entries()].filter(([day]) => day < before).sort().reverse().map(([, r]) => r); },
    // El libro de decisiones, en memoria.
    decisions: [],
    async recordDecision({ decision, dayKey, user, verdict, note, decidedAt }) {
      const entry = { id: `e${this.decisions.length + 1}`, decisionId: decision.id, dayKey, userRef: user.ref, userName: user.name, title: decision.title, kind: decision.kind, subjectType: decision.subjectType, subjectId: decision.subjectId, subjectName: decision.subjectName, evidence: decision.evidence, verdict, note, decidedAt, outcome: null, outcomeDay: null, outcomeText: null };
      const index = this.decisions.findIndex((e) => e.decisionId === decision.id && e.userRef === user.ref);
      if (index >= 0) this.decisions[index] = { ...entry, id: this.decisions[index].id }; else this.decisions.push(entry);
      return entry;
    },
    async pendingOutcomes(today) { return this.decisions.filter((e) => !e.outcome && e.dayKey < today); },
    async setOutcome(id, { outcome, text, day }) { const e = this.decisions.find((row) => row.id === id); if (!e || e.outcome) return false; Object.assign(e, { outcome, outcomeText: text, outcomeDay: day }); return true; },
    async recentDecisions(today, { userRef = null } = {}) { return this.decisions.filter((e) => e.dayKey <= today && (!userRef || e.userRef === userRef)); }
  };
};
const memoryDeliveries = () => {
  const rows = new Map();
  return { rows, async morningBriefDelivery(day, ref) { return rows.get(`${day}|${ref}`) || null; }, async recordMorningBriefDelivery(day, ref, conversationId) { const row = { dayKey: day, userRef: ref, conversationId }; rows.set(`${day}|${ref}`, row); return row; } };
};

const operation = (id, name, level, pmId, reason) => ({
  id, name, slug: name.toLowerCase(), projectManager: pmId ? { id: pmId } : null, communityManager: null,
  contract: { status: 'ACTIVO' }, openTasks: [{ overdue: false }], cycles: {},
  evaluation: { level, reasons: reason ? [{ text: reason }] : [] }
});
const OPERATIONS = [
  operation('c1', 'Foobespain', 'red', 'pm-camila', '2 piezas con fecha pasada y sin publicar.'),
  operation('c2', 'Aristea', 'green', 'pm-otro'),
  operation('c3', 'Endova', 'yellow', 'pm-camila', 'Octubre: 9 de 12 piezas creadas, faltan 3.')
];
const fakeDb = () => {
  const calls = [];
  return {
    calls,
    contentItem: { findMany: async (args) => { calls.push(['items', args]); return [
      { status: 'EN_REVISION', revisionRequestedAt: null, plan: { clientId: 'c1' } },
      { status: 'APROBADO', revisionRequestedAt: new Date(), plan: { clientId: 'c1' } },
      { status: 'BORRADOR', revisionRequestedAt: null, plan: { clientId: 'c1' } },
      { status: 'DEVUELTO', revisionRequestedAt: null, plan: { clientId: 'c3' } }
    ]; } },
    task: { findMany: async (args) => {
      calls.push(['tasks', args]);
      if (args.where.status === 'REALIZADA') return [{ assigneeId: 'm1', clientId: 'c2' }, { assigneeId: 'm1', clientId: 'c2' }];
      return [
        { status: 'PENDIENTE', dueDate: new Date('2026-10-15T17:00:00Z'), assigneeId: 'm1', clientId: 'c1' },
        { status: 'DEVUELTA', dueDate: new Date('2026-10-14T17:00:00Z'), assigneeId: 'm1', clientId: 'c1' },
        { status: 'EN_CURSO', dueDate: new Date('2026-10-25T17:00:00Z'), assigneeId: 'm2', clientId: 'c3' },
        { status: 'PENDIENTE', dueDate: null, assigneeId: 'admin-member', clientId: 'c3' }
      ];
    } },
    taskWorkSession: { findMany: async (args) => { calls.push(['sessions', args]); return [
      { workerId: 'm1', durationMs: 2 * H, task: { clientId: 'c2' } },
      { workerId: 'm2', durationMs: 9 * H, task: { clientId: 'c3' } }
    ]; } },
    teamMember: { findMany: async () => [
      { id: 'm1', name: 'Melissa Ruiz', user: { role: 'EDITOR' } },
      { id: 'm2', name: 'Jesús Pérez', user: { role: 'EDITOR' } },
      { id: 'admin-member', name: 'Rodny Chirinos', user: { role: 'ADMIN' } }
    ] }
  };
};
const RODNY = { id: 'u-rodny', name: 'Rodny Chirinos', role: 'ADMIN', modulePermissions: {}, teamMember: { id: 'admin-member', name: 'Rodny Chirinos' } };
const CAMILA = { id: 'u-camila', name: 'Camila Torres', role: 'PROJECT_MANAGER', modulePermissions: { manager: false, bria: true }, teamMember: { id: 'pm-camila', name: 'Camila Torres' } };

const setup = ({ generate, seed } = {}) => {
  const repository = memoryRepo(seed);
  const proactive = memoryDeliveries();
  const notes = [], notifications = [], requests = [];
  let clock = at('05:50');
  const service = createDailyReadingService({
    db: fakeDb(), repository, proactive,
    conversations: { postAssistantNote: async (actor, note) => { notes.push({ actor, note }); return { id: `chat-${notes.length}` }; } },
    operations: { listOperations: async () => OPERATIONS },
    // El manual de criterio (20 de octubre de 2026), como lo entrega la memoria de la agencia.
    criteria: async () => [{ id: 'equipo-r4', text: 'Regla 4. Días sin publicar: 3 días es alerta para cualquier cliente; 6 días es grave.', purpose: 'operacion' }],
    generate: generate || (async (request) => { requests.push(request); return { text: JSON.stringify({ resumen: 'Foobespain se puso en rojo desde ayer.', decisiones: [
      { titulo: 'Revisar Foobespain hoy', porque: 'Pasó de verde a rojo de un día para otro.', tipo: 'HACER', evidencia: ['CUENTA_EMPEORO:c1'], pedido: '¿Qué le falta a Foobespain para volver a verde?', regla: 'equipo-r4' },
      { titulo: 'Contarle a Aristea que volvió a verde', porque: 'Salió del rojo y conviene decírselo.', tipo: 'CONVERSAR', evidencia: ['CUENTA_MEJORO:c2'], pedido: null }
    ], cuentas: [{ clientId: 'c1', lectura: 'Se atrasó en publicaciones esta semana.' }] }), model: 'gpt-test', usage: { total_tokens: 900 } }; }),
    now: () => clock, notify: async (row) => { notifications.push(row); },
    listPeople: async () => [RODNY, CAMILA], logger: { error: () => {}, log: () => {} }
  });
  return { service, repository, proactive, notes, notifications, requests, setClock: (value) => { clock = value; } };
};

const clientDay = (id, name, level, pmId) => ({ id, name, slug: name.toLowerCase(), pmId, metrics: { level, reasons: [], contract: 'ACTIVO', cycle: null, awaitingApproval: 0, returnedPieces: 0, openTasks: 1, overdueTasks: 0, returnedTasks: 0, closedTasks: 0, hoursMs: 0 } });
const YESTERDAY = { clients: [clientDay('c1', 'Foobespain', 'green', 'pm-camila'), clientDay('c2', 'Aristea', 'red', 'pm-otro')], people: [] };

test('the photo of the day: what waits for the client, returns, overdue and yesterday’s hours, without admins or forgotten clocks', async () => {
  const { service } = setup();
  const { today, clients, people } = await service.readToday(at('06:05'));
  assert.equal(today, '2026-10-20');
  const c1 = clients.find((c) => c.id === 'c1').metrics, c3 = clients.find((c) => c.id === 'c3').metrics, c2 = clients.find((c) => c.id === 'c2').metrics;
  assert.equal(c1.awaitingApproval, 2, 'one in review and one approved with new material; a draft does not wait for the client');
  assert.equal(c1.returnedTasks, 1);
  assert.equal(c3.returnedPieces, 1);
  assert.equal(c2.closedTasks, 2);
  assert.equal(c2.hoursMs, 2 * H);
  assert.equal(c3.hoursMs, 0, 'a nine-hour session is a forgotten clock and does not count');
  assert.deepEqual(people.map((p) => p.id), ['m1', 'm2'], 'the team without admins');
  assert.deepEqual(people[0].metrics, { open: 2, inProgress: 0, overdue: 2, returned: 1, closedTasks: 2, hoursMs: 2 * H });
});

test('6:00 photo every day, 6:30 reading and 7:30 message on business days, each once', async () => {
  const { service, repository, notes, notifications, requests, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  assert.deepEqual(await service.runAutomatic(), { skipped: 'fuera de horario' });

  setClock(at('06:10', '2026-10-18'));
  const sunday = await service.runAutomatic();
  assert.equal(sunday.snapshot.dayKey, '2026-10-18', 'a Sunday still gets its photo');
  assert.equal(sunday.reading, undefined, 'but no reading');

  setClock(at('06:40'));
  const reading = await service.runAutomatic();
  assert.equal(reading.reading, 'MODELO');
  assert.equal(notes.length, 0, 'nobody gets a message before 7:30');
  assert.equal(requests.length, 1);
  assert.match(requests[0].prompt, /\[CUENTA_EMPEORO:c1\]/);
  const saved = repository.readings.get('2026-10-20');
  assert.equal(saved.decisions[0].title, 'Revisar Foobespain hoy');
  assert.equal(saved.accounts.c1.lectura, 'Se atrasó en publicaciones esta semana.');

  setClock(at('07:40'));
  const first = await service.runAutomatic();
  assert.equal(first.delivered, 2);
  assert.equal(requests.length, 1, 'the reading is written once');
  const second = await service.runAutomatic();
  assert.deepEqual([second.delivered, second.already], [0, 2], 'once per day and person, even after a restart');

  const rodny = notes.find((n) => n.actor.ref === 'u-rodny').note;
  assert.equal(rodny.title, 'Lectura de la mañana · martes 20 de octubre');
  assert.deepEqual(rodny.metadata, { note: 'LECTURA_MANANA', dayKey: '2026-10-20' });
  assert.match(rodny.text, /Foobespain se puso en rojo desde ayer\./);
  assert.match(rodny.text, /- Equipo: /, 'an admin sees the team');
  const camila = notes.find((n) => n.actor.ref === 'u-camila').note;
  assert.match(camila.text, /Así amanecieron tus cuentas/);
  assert.match(camila.text, /- Tus cuentas: 1 en rojo y 1 en amarillo\./, 'Foobespain and Endova are hers; Aristea is not');
  assert.doesNotMatch(camila.text, /Equipo:/, 'without Manager, no team load');
  assert.deepEqual(notifications.map((n) => [n.userId, n.type, n.relatedId]), [['u-rodny', MORNING_BRIEF_NOTIFICATION, 'chat-1'], ['u-camila', MORNING_BRIEF_NOTIFICATION, 'chat-2']]);
});

test('the decision log: natural verdicts are noted, outcomes are read the next day, and the morning tells both', async () => {
  const { service, repository, notes, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  const [reading, note] = createDailyReadingTools(service);
  assert.equal(note.name, 'anotar_decision');
  assert.equal(note.allowed({ role: 'EDITOR' }), false);

  // Rodny cuenta de pasada qué hizo; Bria lo anota con sus palabras, sin formulario.
  const noted = await note.run({ decision: 'Foobespain', veredicto: 'ya lo revisé con Kamila', nota: 'faltaban dos piezas' }, { user: RODNY });
  assert.equal(noted.data.saved, true);
  assert.deepEqual([noted.data.decision, noted.data.veredicto, noted.data.dia], ['Revisar Foobespain hoy', 'HECHO', '2026-10-20']);
  assert.match(noted.data.instruccion, /nunca «gracias por enseñarme»/);
  assert.match(noted.data.instruccion, /Listo, lo de Aristea ya quedó/);
  const unclear = await note.run({ decision: '9', veredicto: 'no' }, { user: RODNY });
  assert.equal(unclear.data.saved, false);
  assert.match(unclear.data.motivo, /No sé a cuál decisión .* 1\. Revisar Foobespain hoy · 2\. Contarle a Aristea/);
  const vague = await note.run({ decision: '1', veredicto: 'tal vez' }, { user: RODNY });
  assert.match(vague.data.motivo, /No me quedó claro/);
  const foreign = await note.run({ decision: '2', veredicto: 'no' }, { user: CAMILA });
  assert.equal(foreign.data.motivo, 'Esa decisión no es de tus cuentas.', 'a PM only notes decisions about her accounts');
  const again = await note.run({ decision: '1', veredicto: 'la dejo para la otra semana' }, { user: RODNY });
  assert.equal(again.data.veredicto, 'DESPUES');
  assert.equal(repository.decisions.length, 1, 'noting it again replaces the verdict, never duplicates');

  const explained = await reading.run({}, { user: RODNY });
  assert.deepEqual(explained.data.decisiones.map((d) => [d.numero, d.anotada]), [[1, 'DESPUES'], [2, null]]);
  assert.equal(explained.data.libroDeDecisiones.anotadas, 1);
  assert.equal(explained.data.libroDeDecisiones.propuestas, 2);
  assert.match(explained.data.instruccion, /mide tus decisiones, no a las personas/);

  // Al día siguiente: el desenlace se lee de las señales, y el mensaje de la mañana cuenta qué decidiste y qué pasó.
  await repository.saveSnapshot('2026-10-20', await service.readToday(at('06:05')));
  repository.decisions[0].verdict = 'HECHO';
  setClock(at('06:40', '2026-10-21'));
  await service.runAutomatic();
  assert.equal(repository.decisions[0].outcome, 'SIGUE', 'Foobespain is still red the next day');
  assert.match(repository.decisions[0].outcomeText, /Foobespain sigue en rojo: 2 piezas con fecha pasada/);
  setClock(at('07:40', '2026-10-21'));
  await service.runAutomatic();
  const rodny = notes.find((n) => n.actor.ref === 'u-rodny' && n.note.metadata.dayKey === '2026-10-21').note.text;
  assert.match(rodny, /\*\*Lo que decidiste ayer\*\*\n\n- \*\*Revisar Foobespain hoy\*\*: la hiciste\. Hoy sigue: Foobespain/);
  assert.match(rodny, /De ayer no supe qué pasó con «Contarle a Aristea que volvió a verde»; si la trabajaste o la descartaste, cuéntamelo cuando puedas\./);
  assert.doesNotMatch(rodny, /dime «hice/, 'never a form');
  const camila = notes.find((n) => n.actor.ref === 'u-camila' && n.note.metadata.dayKey === '2026-10-21').note.text;
  assert.match(camila, /De ayer no supe qué pasó con «Revisar Foobespain hoy»/, 'Camila sees only her account’s decision');
  assert.doesNotMatch(camila, /Aristea/);
});

test('the manual of criteria is read from the agency memory, shown to the model, and cited in the morning', async () => {
  const { service, repository, notes, requests, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  assert.match(requests[0].prompt, /## Criterio de la dirección \(confirmado por Rodny\)\n\[R:equipo-r4\]/);
  assert.equal(repository.readings.get('2026-10-20').decisions[0].rule.id, 'equipo-r4');
  setClock(at('07:40'));
  await service.runAutomatic();
  const rodny = notes.find((n) => n.actor.ref === 'u-rodny').note.text;
  assert.match(rodny, /Según tu criterio: «Regla 4\. Días sin publicar/);
});

test('if the model fails, Bria reads with the platform’s rules instead of going quiet', async () => {
  const { service, repository, setClock } = setup({ seed: { '2026-10-19': YESTERDAY }, generate: async () => { throw new Error('429'); } });
  setClock(at('06:40'));
  await service.runAutomatic();
  const reading = repository.readings.get('2026-10-20');
  assert.equal(reading.source, 'REGLA');
  assert.equal(reading.decisions[0].title, 'Revisar la cuenta de Foobespain');
});

test('in the chat, Bria reads the day and a history, inside the same scope as the morning message', async () => {
  const { service, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  const [tool] = createDailyReadingTools(service);
  assert.equal(tool.name, 'lectura_de_la_agencia');
  assert.equal(tool.allowed(RODNY), true);
  assert.equal(tool.allowed({ role: 'EDITOR' }), false, 'direction only');
  const out = await tool.run({ cliente: 'foobes' }, { user: RODNY });
  assert.equal(out.data.cuenta.nombre, 'Foobespain');
  assert.deepEqual(out.data.cuenta.serie.map((row) => [row.fecha, row.color]), [['2026-10-19', 'verde'], ['2026-10-20', 'rojo']]);
  assert.match(out.data.cuenta.senales[0], /pasó de verde a rojo/);
  assert.match(out.data.instruccion, /compara con su propia historia/);
  const camila = await tool.run({ cliente: 'aristea', persona: 'Melissa' }, { user: CAMILA });
  assert.match(camila.data.cuenta.mensaje, /no está entre las tuyas/);
  assert.match(camila.data.persona.mensaje, /módulo Manager/);
  assert.equal(camila.data.resumen, null, 'the agency summary is for direction');
  const person = await tool.run({ persona: 'melissa' }, { user: RODNY });
  assert.equal(person.data.persona.serie.at(-1).vencidas, 2);
  assert.deepEqual(createDailyReadingTools(null), []);
});

test('before the first reading, the tool says when it starts instead of inventing', async () => {
  const { service } = setup();
  const [tool] = createDailyReadingTools(service);
  assert.match((await tool.run({}, { user: RODNY })).data.mensaje, /Todavía no hay una lectura guardada/);
});

test('the morning message shows above the mascot after the close and before the weekly focus', () => {
  const rows = buildNudges({ people: [], now: new Date('2026-10-20T12:40:00Z'), morningBrief: { conversationId: 'c-7', dayKey: '2026-10-20' }, weeklyFocus: { conversationId: 'c-1', weekKey: '2026-W43' } });
  assert.deepEqual(rows.map((r) => [r.kind, r.key]), [['LECTURA_DIA', 'LECTURA_DIA:2026-10-20'], ['FOCO_SEMANAL', 'FOCO_SEMANAL:2026-W43']]);
  assert.deepEqual(nudgeActions({ kind: 'LECTURA_DIA', conversationId: 'c-7' }), [{ label: 'Leer en Bria', conversationId: 'c-7' }]);
  assert.equal(isValidNudgeKey('LECTURA_DIA:2026-10-20'), true);
  const withClose = buildNudges({ people: [], now: new Date('2026-10-20T22:10:00Z'), morningBrief: { conversationId: 'c-7', dayKey: '2026-10-20' }, dailyClose: { conversationId: 'c-9', dayKey: '2026-10-20' } });
  assert.deepEqual(withClose.map((r) => r.kind), ['CIERRE_DIA', 'LECTURA_DIA']);
});

test('Bria is told how to use its memory of time, and the platform runs it on its own', () => {
  const instructions = buildInstructions({ person: { name: 'Rodny' }, today: '2026-10-20', tools: [{ name: 'lectura_de_la_agencia', description: 'x' }], user: { role: 'ADMIN' } });
  assert.match(instructions, /24\. Eres los ojos de la dirección/);
  assert.match(instructions, /nunca recomiendes contra una regla, y si la persona te corrige en algo que una regla dice, no cambies la regla por tu cuenta/);
  assert.match(instructions, /lo que conviene no hacer y por qué/);
  assert.equal(toolProgressLabel('lectura_de_la_agencia'), 'Repasando cómo viene la agencia…');
  assert.match(readFileSync('server.js', 'utf8'), /initDailyReadingScheduler\(\);/);
  assert.match(readFileSync('src/utils/notificationUtils.js', 'utf8'), /BRIA_LECTURA_MANANA[\s\S]*Tu lectura de la mañana está lista/);
  assert.match(readFileSync('src/components/layout/AppLayout.jsx', 'utf8'), /notif\.type === 'BRIA_LECTURA_MANANA'/);
  assert.match(readFileSync('src/services/briaAssistantService.js', 'utf8'), /createDailyReadingTools\(/);
  assert.match(readFileSync('scripts/ensure-bria-knowledge-schema.js', 'utf8'), /bria-daily-reading\.sql/);
  const sql = readFileSync('scripts/sql/bria-daily-reading.sql', 'utf8');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS bria_memory\.agency_snapshots/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS bria_memory\.daily_readings/);
  assert.match(readFileSync('scripts/sql/bria-proactive.sql', 'utf8'), /CREATE TABLE IF NOT EXISTS bria_memory\.morning_brief_deliveries/);
  for (const table of ['agency_snapshots', 'daily_readings', 'morning_brief_deliveries']) {
    assert.match(readFileSync('prisma/schema.prisma', 'utf8'), new RegExp(table));
    assert.match(readFileSync('docs/BASE_DE_DATOS_LATERAL.md', 'utf8'), new RegExp(`\`${table}\``));
  }
  const timers = [];
  initDailyReadingScheduler({ service: { runAutomatic: async () => ({}) }, setIntervalFn: (fn, ms) => { timers.push(['interval', ms]); return { unref() {} }; }, setTimeoutFn: (fn, ms) => { timers.push(['timeout', ms]); return { unref() {} }; }, logger: { log: () => {}, error: () => {} } });
  assert.deepEqual(timers, [['timeout', 240000], ['interval', 600000]]);
});
