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
      const index = this.decisions.findIndex((e) => e.decisionId === decision.id && e.userRef === user.ref);
      const previous = this.decisions[index];
      if (previous && previous.verdict === verdict && previous.note === note) return { ...previous };
      const revision = previous ? previous.revision + 1 : 1;
      const history = [...(previous?.history || []), { type: 'VERDICT', revision, verdict, note, decidedAt }];
      const entry = { id: previous?.id || `e${this.decisions.length + 1}`, decisionId: decision.id, dayKey, userRef: user.ref, userName: user.name, title: decision.title, kind: decision.kind, subjectType: decision.subjectType, subjectId: decision.subjectId, subjectName: decision.subjectName, evidence: decision.evidence, verdict, note, decidedAt, outcome: null, outcomeDay: null, outcomeText: null, revision, history };
      if (index >= 0) this.decisions[index] = entry; else this.decisions.push(entry);
      return entry;
    },
    async pendingOutcomes(today, { fromDays = 1, untilDays = 14 } = {}) {
      return this.decisions.filter((e) => {
        const age = (Date.parse(`${today}T12:00:00Z`) - Date.parse(`${e.dayKey}T12:00:00Z`)) / 86_400_000;
        return e.kind !== 'NO_HACER' && age >= fromDays && age <= untilDays && (!e.outcomeDay || e.outcomeDay < today);
      }).map((e) => ({ ...e, history: [...e.history] }));
    },
    async setOutcome(id, { outcome, text, day, expectedRevision }) {
      const e = this.decisions.find((row) => row.id === id);
      if (!e || !Number.isInteger(expectedRevision) || e.revision !== expectedRevision || (e.outcomeDay && e.outcomeDay >= day)) return false;
      e.history.push({ type: 'OUTCOME', revision: e.revision, outcome, text, day });
      Object.assign(e, { outcome, outcomeText: text, outcomeDay: day });
      return true;
    },
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
const RODNY = { id: 'u-rodny', name: 'Rodny Chirinos', role: 'ADMIN', modulePermissions: { bria: true }, teamMember: { id: 'admin-member', name: 'Rodny Chirinos' } };
const CAMILA = { id: 'u-camila', name: 'Camila Torres', role: 'PROJECT_MANAGER', modulePermissions: { manager: false, bria: true }, teamMember: { id: 'pm-camila', name: 'Camila Torres' } };

const setup = ({ generate, seed } = {}) => {
  const repository = memoryRepo(seed);
  const proactive = memoryDeliveries();
  const notes = [], notifications = [], requests = [], whatsappMessages = [];
  let clock = at('05:50');
  const service = createDailyReadingService({
    db: fakeDb(), repository, proactive,
    conversations: { postAssistantNote: async (actor, note) => { notes.push({ actor, note }); return { id: `chat-${notes.length}` }; } },
    operations: { listOperations: async () => OPERATIONS },
    memoryContext: async ({ clients }) => ({ accounts: clients.map(client => ({ clientId: client.id, state: 'CONSULTADO', partial: false, facts: [], contract: null })) }),
    // El manual de criterio (20 de octubre de 2026), como lo entrega la memoria de la agencia.
    criteria: async () => [{ id: 'equipo-r4', text: 'Regla 4. Días sin publicar: 3 días es alerta para cualquier cliente; 6 días es grave.', purpose: 'operacion' }],
    generate: generate || (async (request) => { requests.push(request); return { text: JSON.stringify({ resumen: 'Foobespain se puso en rojo desde ayer.', decisiones: [
      { titulo: 'Revisar Foobespain hoy', porque: 'Pasó de verde a rojo de un día para otro.', tipo: 'HACER', evidencia: ['CUENTA_EMPEORO:c1'], pedido: '¿Qué le falta a Foobespain para volver a verde?', regla: 'equipo-r4' },
      { titulo: 'Contarle a Aristea que volvió a verde', porque: 'Salió del rojo y conviene decírselo.', tipo: 'CONVERSAR', evidencia: ['CUENTA_MEJORO:c2'], pedido: null }
    ], cuentas: [{ clientId: 'c1', lectura: 'Se atrasó en publicaciones esta semana.' }] }), model: 'gpt-test', usage: { total_tokens: 900 } }; }),
    now: () => clock, notify: async (row) => { notifications.push(row); },
    whatsapp: (row) => { whatsappMessages.push(row); },
    listPeople: async () => [RODNY, CAMILA], logger: { error: () => {}, log: () => {} }
  });
  return { service, repository, proactive, notes, notifications, requests, whatsappMessages, setClock: (value) => { clock = value; } };
};

const clientDay = (id, name, level, pmId) => ({ id, name, slug: name.toLowerCase(), pmId, metrics: { level, reasons: [], contract: 'ACTIVO', cycle: null, awaitingApproval: 0, returnedPieces: 0, openTasks: 1, overdueTasks: 0, returnedTasks: 0, closedTasks: 0, hoursMs: 0 } });
const YESTERDAY = { clients: [clientDay('c1', 'Foobespain', 'green', 'pm-camila'), clientDay('c2', 'Aristea', 'red', 'pm-otro')], people: [] };

test('reviewing a proposal exposes its saved evidence and human corrections without authorizing execution', async () => {
  const { service, repository, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  const reading = await repository.latestReading();
  const proposal = reading.decisions[0];
  await service.recordVerdict({ user: RODNY, ref: proposal.id, veredicto: 'después', nota: 'Primero revisar el material.' });
  await service.recordVerdict({ user: RODNY, ref: proposal.id, veredicto: 'hecho', nota: 'Lo revisé; falta hablar con el cliente.' });
  const data = await service.explain({ user: RODNY });
  const review = data.decisiones.find(row => row.id === proposal.id);
  assert.ok(review, 'the full review keeps the persisted identity, not only a position');
  assert.equal(review.fecha, reading.day);
  assert.equal(review.origen, 'MODELO');
  assert.deepEqual(review.alcance, [{ tipo: 'CLIENT', id: 'c1', nombre: 'Foobespain' }]);
  assert.equal(review.fuentes[0].id, 'CUENTA_EMPEORO:c1');
  assert.equal(review.fuentes[0].fecha, reading.day);
  assert.equal(review.fuentes[0].comparadaCon, reading.baseDay);
  assert.equal(review.fuentes[0].texto, reading.signals.find(row => row.id === 'CUENTA_EMPEORO:c1').text);
  assert.match(review.faltaVerificar, /situación actual/i);
  assert.equal(review.ejecucionAutorizada, false, 'a reported HECHO is never a permission to run anything');
  assert.equal(review.quienDecide, RODNY.teamMember.name);
  assert.equal(review.anotacion.nota, 'Lo revisé; falta hablar con el cliente.');
  assert.equal(review.anotacion.revision, 2);
  assert.deepEqual(review.anotacion.historia.filter(event => event.type === 'VERDICT').map(event => event.verdict), ['DESPUES', 'HECHO']);
  assert.match(data.revisionHumana, /resumen.*confirmación/i);
  assert.ok(data.opcionesDeRevision.some(option => option.opcion === 'Ajustar'));
  assert.ok(data.opcionesDeRevision.every(option => option.efecto && !/aprobado/i.test(option.efecto)));
});

test('a complete review can return fifty proposals and calculates coverage only within the viewer scope', async () => {
  const { service, repository, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  const reading = await repository.latestReading();
  const base = reading.decisions[0];
  reading.signals = Array.from({ length: 51 }, (_, i) => ({ id: `APROBACION_DETENIDA:c${i}`, kind: 'APROBACION_DETENIDA', direction: 'peor', subjectType: 'CLIENT', subjectId: `c${i}`, subjectName: `Cuenta ${i}`, text: `Cuenta ${i}: aprobación detenida.`, url: `/clientes/operacion/c${i}` }));
  reading.decisions = reading.signals.slice(0, 50).map((signal, i) => ({ ...base, id: `${reading.day}:${i + 1}`, title: `Revisar Cuenta ${i}`, subjectId: signal.subjectId, subjectName: signal.subjectName, evidence: [signal.id], source: i ? 'REGLA' : 'MODELO' }));
  reading.owners = Object.fromEntries(reading.signals.map((signal, i) => [signal.subjectId, i < 3 ? CAMILA.teamMember.id : 'pm-otro']));
  // These agency-wide counters must never be returned as a scoped PM's coverage.
  reading.coverage = { worseSignals: 999, representedSignals: 998, suppressedSignals: 0, unrepresentedSignals: 1 };
  const admin = await service.explain({ user: RODNY });
  assert.equal(admin.decisiones.length, 50);
  assert.deepEqual(admin.cobertura, { propuestas: 50, senalesVisibles: 51, senalesConPropuesta: 50, senalesSinPropuesta: 1, listaCompleta: true });
  assert.equal(admin.senalesSinPropuesta[0].id, 'APROBACION_DETENIDA:c50');
  assert.equal(admin.decisiones.at(-1).origen, 'REGLA');
  const pm = await service.explain({ user: CAMILA });
  assert.deepEqual(pm.cobertura, { propuestas: 3, senalesVisibles: 3, senalesConPropuesta: 3, senalesSinPropuesta: 0, listaCompleta: true });
  assert.equal(pm.decisiones.length, 3);
  assert.doesNotMatch(JSON.stringify(pm.decisiones), /Cuenta (?:[3-9]|[1-9][0-9])/);
  const verdict = await service.recordVerdict({ user: RODNY, ref: '50', veredicto: 'después', nota: 'Primero confirmar los insumos.' });
  assert.equal(verdict.saved, true);
  assert.equal(repository.decisions[0].decisionId, `${reading.day}:50`);
  const reviewed = await service.explain({ user: RODNY });
  assert.equal(reviewed.decisiones.at(-1).anotacion.nota, 'Primero confirmar los insumos.');
  assert.equal(reviewed.decisiones.at(-1).ejecucionAutorizada, false);
});

test('historical proposals distinguish missing provenance from a confirmed recommendation', async () => {
  const { service, repository, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  const reading = await repository.latestReading();
  const proposal = reading.decisions[0];
  delete proposal.source;
  proposal.evidence.push('missing-source');
  const data = await service.explain({ user: RODNY });
  const review = data.decisiones.find(row => row.id === proposal.id);
  assert.ok(review, 'historical proposal remains available with its persisted identity');
  assert.equal(review.origen, 'NO_REGISTRADO');
  assert.deepEqual(review.fuentesFaltantes, ['missing-source']);
  assert.equal(review.ejecucionAutorizada, false);
  assert.equal(review.anotacion, null);
});

test('the next morning cannot reintroduce mixed or inaccessible proposals through yesterday’s verdicts', async () => {
  const { service, repository, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  const previous = await repository.latestReading();
  const [mine, foreign] = previous.decisions;
  const mixed = { ...mine, id: 'mixed', title: 'Cruzar Foobespain con Aristea', evidence: [...mine.evidence, ...foreign.evidence] };
  const people = { ...mine, id: 'people', title: 'Mover la carga de la persona privada', evidence: [...mine.evidence, 'CARGA_INUSUAL:p-private'] };
  previous.signals.push({ id: 'CARGA_INUSUAL:p-private', kind: 'CARGA_INUSUAL', subjectType: 'PERSON', subjectId: 'p-private', subjectName: 'Persona privada', text: 'Carga privada.' });
  previous.decisions = [mine, mixed, { ...mixed, id: 'mixed-without-verdict' }, people, foreign];
  for (const decision of [mixed, people, foreign]) repository.decisions.push({ ...decision, decisionId: decision.id, dayKey: previous.day, userRef: CAMILA.id, verdict: 'NO' });
  const summary = await service.decisionsFor({ ...CAMILA, modulePermissions: { bria: true, manager: false } }, { day: '2026-10-21' });
  assert.deepEqual(summary.decided, []);
  assert.deepEqual(summary.undecided.map(row => row.id), [mine.id]);
});

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
  assert.equal(rodny.metadata.note, 'LECTURA_MANANA');
  assert.equal(rodny.metadata.dayKey, '2026-10-20');
  assert.ok(rodny.metadata.sources.some(source => source.kind === 'hecho_agencia' && source.id === 'equipo-r4'));
  assert.match(rodny.text, /Foobespain se puso en rojo desde ayer\./);
  assert.equal(service.scopeFor(RODNY, await repository.latestReading()).people, true, 'an admin can review team data even when the brief does not repeat its counters');
  const camila = notes.find((n) => n.actor.ref === 'u-camila').note;
  assert.match(camila.text, /Así amanecieron tus cuentas/);
  assert.match(camila.text, /- Tus cuentas: 1 en rojo y 1 en amarillo\./, 'Foobespain and Endova are hers; Aristea is not');
  assert.doesNotMatch(camila.text, /Equipo:/, 'without Manager, no team load');
  assert.deepEqual(notifications.map((n) => [n.userId, n.type, n.relatedId]), [['u-rodny', MORNING_BRIEF_NOTIFICATION, 'chat-1'], ['u-camila', MORNING_BRIEF_NOTIFICATION, 'chat-2']]);
});

test('the WhatsApp morning alert points to the same conversation and only invites review', async () => {
  const { service, whatsappMessages, proactive, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('07:40'));
  await service.runAutomatic();
  assert.equal(whatsappMessages.length, 2);
  for (const alert of whatsappMessages) {
    const delivery = await proactive.morningBriefDelivery('2026-10-20', alert.userId);
    assert.equal(alert.conversationId, delivery.conversationId);
    assert.equal(alert.sourceRef, 'LECTURA_MANANA:2026-10-20');
    assert.equal(alert.buttons[0].label, 'Revisar lectura');
    assert.match(alert.buttons[0].ask, /antes de hacer cambios/);
  }
  await service.runAutomatic();
  assert.equal(whatsappMessages.length, 2, 'an already delivered reading does not send a second alert');
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
  assert.equal(foreign.data.saved, false, 'a PM only notes decisions about her accounts');
  assert.doesNotMatch(foreign.data.motivo, /Aristea/, 'a missing reference never lists other accounts');
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

test('the number in the morning brief, the explanation and the verdict refers to the same visible decision', async () => {
  const { service, repository, notes, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  const reading = await repository.latestReading();
  const [mine, foreign] = reading.decisions;
  reading.decisions = [foreign, { ...mine, id: `${reading.day}:avoid`, title: 'No cambiar fechas', kind: 'NO_HACER' }, mine];
  await service.deliver(CAMILA, reading);
  assert.match(notes[0].note.text, /1\. \*\*Revisar Foobespain hoy/);
  const explained = await service.explain({ user: CAMILA });
  assert.deepEqual(explained.decisiones.map((d) => [d.numero, d.titulo]), [[1, mine.title], [2, 'No cambiar fechas']]);
  const result = await service.recordVerdict({ user: CAMILA, ref: '1', veredicto: 'HECHO' });
  assert.equal(result.saved, true);
  assert.equal(repository.decisions[0].decisionId, mine.id);
  const missing = await service.recordVerdict({ user: CAMILA, ref: '9', veredicto: 'NO' });
  assert.equal(missing.saved, false);
  assert.doesNotMatch(missing.motivo, /Aristea/);
});

test('tools in a morning-reading conversation keep its date when a newer reading exists', async () => {
  const { service, repository, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  const original = await repository.latestReading();
  const newer = { ...original, day: '2026-10-21', decisions: original.decisions.map((d, i) => ({ ...d, id: `2026-10-21:${i + 1}`, title: `Nueva propuesta ${i + 1}` })) };
  await repository.saveReading(newer.day, newer);
  const [read, note] = createDailyReadingTools(service, { readingDay: original.day });
  assert.equal((await read.run({}, { user: RODNY })).data.fecha, original.day);
  const result = await note.run({ decision: '1', veredicto: 'hecho' }, { user: RODNY });
  assert.equal(result.data.dia, original.day);
  assert.equal(repository.decisions[0].decisionId, original.decisions[0].id);
  const explicit = await note.run({ decision: '1', dia: newer.day, veredicto: 'no' }, { user: RODNY });
  assert.equal(explicit.data.dia, newer.day, 'an explicit date still selects that reading');
  const [latest] = createDailyReadingTools(service);
  assert.equal((await latest.run({}, { user: RODNY })).data.fecha, newer.day, 'ordinary chats still read the latest');
});

test('a saved reading retries a failed outcome write without generating the reading again', async () => {
  const { service, repository, requests, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  await service.recordVerdict({ user: RODNY, ref: '1', veredicto: 'HECHO' });
  const setOutcome = repository.setOutcome.bind(repository);
  let attempts = 0;
  repository.setOutcome = async (...args) => {
    if (attempts++ === 0) throw new Error('No se pudo guardar el desenlace');
    return setOutcome(...args);
  };
  setClock(at('06:40', '2026-10-21'));
  await assert.rejects(service.runAutomatic(), /No se pudo guardar el desenlace/);
  const savedReading = repository.readings.get('2026-10-21');
  assert.ok(savedReading, 'the reading is already durable when the outcome fails');
  assert.equal(repository.decisions[0].outcome, null);
  const generated = requests.length;
  const restored = await service.generateReading(at('06:50', '2026-10-21'));
  assert.equal(restored, savedReading);
  assert.equal(requests.length, generated, 'retrying persistence does not call the model again');
  assert.equal(repository.decisions[0].outcome, 'SIGUE');
  assert.equal(repository.decisions[0].outcomeDay, '2026-10-21');
  assert.equal(attempts, 2);
});

test('outcomes keep following the same decision once a day through improvement, missing data and relapse', async () => {
  const { service, repository, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  await service.recordVerdict({ user: RODNY, ref: '1', veredicto: 'HECHO', nota: 'Lo revisamos' });
  const observations = [
    ['2026-10-21', 'red', 'SIGUE'], ['2026-10-22', 'green', 'MEJORO'],
    ['2026-10-23', null, 'SIN_EVIDENCIA'], ['2026-10-24', 'red', 'SIGUE']
  ];
  for (const [day, level, expected] of observations) {
    const current = { clients: level ? [clientDay('c1', 'Foobespain', level, 'pm-camila')] : [], people: [] };
    assert.equal(await service.settleOutcomes(day, [], current), 1);
    assert.equal(repository.decisions[0].outcome, expected);
    assert.equal(await service.settleOutcomes(day, [], current), 0, 'the same day is not written twice');
  }
  const row = repository.decisions[0];
  assert.deepEqual(row.history.filter((event) => event.type === 'OUTCOME').map((event) => [event.day, event.outcome]), observations.map(([day, , expected]) => [day, expected]));
  const history = structuredClone(row.history), revision = row.revision, decidedAt = row.decidedAt;
  setClock(at('09:00', '2026-10-24'));
  await service.recordVerdict({ user: RODNY, ref: '1', dia: '2026-10-20', veredicto: 'HECHO', nota: 'Lo revisamos' });
  assert.deepEqual(repository.decisions[0].history, history, 'repeating the same words does not erase the observations');
  assert.equal(repository.decisions[0].revision, revision);
  assert.equal(repository.decisions[0].decidedAt, decidedAt);
  assert.equal(repository.decisions[0].outcome, 'SIGUE');
  assert.equal(await service.settleOutcomes('2026-11-04', [], { clients: [clientDay('c1', 'Foobespain', 'green', 'pm-camila')], people: [] }), 0, 'after fourteen days the automatic window has ended');
});

test('an outcome read before a human correction cannot overwrite the corrected decision', async () => {
  const { service, repository, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  await service.recordVerdict({ user: RODNY, ref: '1', veredicto: 'HECHO' });
  const pending = repository.pendingOutcomes.bind(repository);
  const setOutcome = repository.setOutcome.bind(repository);
  const attemptedRevisions = [];
  repository.setOutcome = async (id, args) => { attemptedRevisions.push(args.expectedRevision); return setOutcome(id, args); };
  repository.pendingOutcomes = async (...args) => {
    const rows = await pending(...args);
    await service.recordVerdict({ user: RODNY, ref: '1', veredicto: 'NO', nota: 'Cambiamos de camino' });
    return rows;
  };
  assert.equal(await service.settleOutcomes('2026-10-21', [], { clients: [clientDay('c1', 'Foobespain', 'green', 'pm-camila')], people: [] }), 0);
  assert.deepEqual(attemptedRevisions, [1], 'the version read with the observation is the one sent to the compare-and-set');
  assert.equal(repository.decisions[0].verdict, 'NO');
  assert.equal(repository.decisions[0].outcome, null);
  assert.equal(repository.decisions[0].revision, 2);
  assert.deepEqual(repository.decisions[0].history.map((event) => event.type), ['VERDICT', 'VERDICT']);
});

test('only an administrator reads other people’s verdicts, even when a PM has no assigned accounts', async () => {
  const { service, repository, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  await service.recordVerdict({ user: RODNY, ref: '1', veredicto: 'HECHO' });
  await service.recordVerdict({ user: CAMILA, ref: '1', veredicto: 'NO' });
  const noAccounts = { ...CAMILA, id: 'pm-without-accounts', teamMember: { id: 'unassigned', name: 'Otro project' } };
  const lookedUp = [];
  const recent = repository.recentDecisions.bind(repository);
  repository.recentDecisions = async (day, options) => { lookedUp.push(options.userRef || null); return recent(day, options); };
  const pm = await service.explain({ user: noAccounts });
  assert.equal(pm.decisiones.length, 2, 'the existing agency-reading scope for an unassigned PM is preserved');
  assert.equal(pm.libroDeDecisiones.anotadas, 0, 'an agency reading is not authority to inspect others’ verdicts');
  assert.equal(pm.libroDeDecisiones.hechas, 0);
  assert.deepEqual(lookedUp, ['pm-without-accounts']);
  const assigned = await service.explain({ user: CAMILA });
  assert.equal(assigned.libroDeDecisiones.anotadas, 1);
  assert.equal(assigned.libroDeDecisiones.descartadas, 1);
  const admin = await service.explain({ user: RODNY });
  assert.equal(admin.libroDeDecisiones.anotadas, 2);
  assert.equal(admin.libroDeDecisiones.hechas, 1);
  assert.equal(admin.libroDeDecisiones.descartadas, 1);
});

test('the adoption denominator counts the decisions visible in each historical reading', async () => {
  const { service, repository, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  const current = repository.readings.get('2026-10-20');
  const teamDecision = { id: '2026-10-19:3', title: 'Revisar vencidas del equipo', kind: 'CONVERSAR', subjectType: 'PERSON', subjectId: 'm1', evidence: [] };
  repository.readings.set('2026-10-19', {
    ...current, day: '2026-10-19', owners: { c1: 'pm-otro', c2: 'pm-camila' },
    decisions: [...current.decisions.map((decision, index) => ({ ...decision, id: `2026-10-19:${index + 1}` })), teamDecision]
  });
  await service.recordVerdict({ user: CAMILA, ref: '1', veredicto: 'HECHO' });
  const pm = await service.explain({ user: CAMILA });
  assert.equal(pm.libroDeDecisiones.propuestas, 2, 'one current account decision and one previously owned account decision; no team permission');
  assert.equal(pm.libroDeDecisiones.tasaDeAdopcion, 0.5);
  const admin = await service.explain({ user: RODNY });
  assert.equal(admin.libroDeDecisiones.propuestas, 5);
});

test('the manual of criteria is read from the agency memory, shown to the model, and cited in the morning', async () => {
  const { service, repository, notes, requests, setClock } = setup({ seed: { '2026-10-19': YESTERDAY } });
  setClock(at('06:40'));
  await service.runAutomatic();
  assert.match(requests[0].prompt, /## Criterio de la dirección \(confirmado por Rodny\)\n\[R:equipo-r4\]/);
  assert.equal(repository.readings.get('2026-10-20').decisions[0].rule.id, 'equipo-r4');
  setClock(at('07:40'));
  await service.runAutomatic();
  // La regla guía la decisión y queda en el libro, pero el mensaje no la recita (Rodny, 20 de octubre de 2026).
  const rodny = notes.find((n) => n.actor.ref === 'u-rodny').note.text;
  assert.doesNotMatch(rodny, /Regla 4|criterio/);
});

test('if the model fails, Bria reads with the platform’s rules instead of going quiet', async () => {
  const { service, repository, setClock } = setup({ seed: { '2026-10-19': YESTERDAY }, generate: async () => { throw new Error('429'); } });
  setClock(at('06:40'));
  await service.runAutomatic();
  const reading = repository.readings.get('2026-10-20');
  assert.equal(reading.source, 'REGLA');
  assert.equal(reading.decisions[0].title, 'Revisar el compromiso de Foobespain');
  assert.equal(reading.decisions[0].kind, 'VIGILAR');
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
  assert.match(instructions, /aplícalo al recomendar sin recitarlo ni citar números de regla/);
  assert.match(instructions, /Nunca recomiendes contra una regla, y si la persona te corrige o precisa algo que una regla dice, no cambies la regla por tu cuenta/);
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
