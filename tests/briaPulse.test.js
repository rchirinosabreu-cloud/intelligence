// El pulso de Bria (Rodny, 10 de octubre de 2026: «quiero que viva en la plataforma desde ahora mismo»). El código
// reúne hechos, el modelo decide qué decir, y el código manda: hechos reales, topes por jornada y hora, nada repetido
// en la jornada, sin juicios; si el modelo falla, Bria dice el hecho más importante con las palabras de la plataforma.
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFacts, pulseBudget, mutedKinds, eligibleFacts, buildPulseDigest, buildPulseRequest, parsePulse, validatePulse, fallbackPulse, workdayBounds, hourKeyOf, PULSE_LIMITS, fingerprintOf } from '../src/lib/briaPulse.js';
import { createBriaPulseService, initBriaPulseScheduler } from '../src/services/briaPulseService.js';
import { createBriaNudgeService } from '../src/services/briaNudgeService.js';

const H = 3_600_000;
const tuesday1030 = new Date('2026-10-13T15:30:00Z'); // martes 13 de octubre, 10:30 de Bogotá
const nudges = [{ key: 'SIN_PROCESO:m-mel', kind: 'SIN_PROCESO', personId: 'm-mel', personName: 'Melissa Castaño', title: 'Melissa lleva 35 minutos sin una tarea en proceso.', body: 'Tiene 3 pendientes por empezar.', ask: 'Ayúdame a escribirle a Melissa.', url: '/gestion', taskIds: [] }, { key: 'FOCO_SEMANAL:x', kind: 'FOCO_SEMANAL', title: 'foco' }];
const load = { days: ['2026-10-13', '2026-10-14'], people: [{ personId: 'm-bra', personName: 'Brayan Torres', cells: [{ day: '2026-10-14', level: 'excedida', ms: 9 * H, count: 3, tasks: [{ id: 'o1' }, { id: 'o2' }] }] }] };
const operations = [{ id: 'c1', name: 'Aristea', slug: 'aristea', evaluation: { level: 'red', reasons: [{ level: 'red', text: 'Van 2 publicadas; a esta fecha deberían ir 5.' }, { level: 'yellow', text: 'Falta el informe.' }] } }, { id: 'c2', name: 'Endova', slug: 'endova', evaluation: { level: 'yellow', reasons: [] } }];
const pieces = [{ id: 'i1', title: 'Reel de vendimia', planId: 'p1', clientName: 'Foobespain', day: '2026-10-14' }, { id: 'i9', title: 'Lejana', planId: 'p1', clientName: 'Foobespain', day: '2026-10-20' }];
const returned = [{ id: 't7', title: 'Portada', returnedDay: '2026-10-10', personId: 'm-hel', assigneeName: 'Helen Ruiz', clientName: 'Nattal' }];

test('facts come from what the platform already computes, most serious first, each with a stable id and fingerprint', () => {
  const facts = collectFacts({ nudges, load, operations, pieces, returned, today: '2026-10-13' });
  assert.deepEqual(facts.map((f) => f.id), ['OPERACION_ROJA:aristea', 'DEVUELTO_SIN_TOCAR:t7', 'CARGA_MANANA:m-bra', 'PIEZA_SIN_APROBAR:i1', 'SIN_PROCESO:m-mel']);
  assert.match(facts[0].text, /Aristea está en rojo en Operación: Van 2 publicadas/);
  assert.doesNotMatch(facts[0].text, /informe/, 'only the red reasons');
  assert.match(facts[1].text, /«Portada» \(Helen Ruiz\) lleva 3 días devuelta sin cambios\./);
  assert.match(facts[2].text, /Brayan Torres tiene 9 h estimadas para el 14 de octubre en 3 tareas/);
  assert.deepEqual(facts[2].taskIds, ['o1', 'o2']);
  assert.match(facts[3].text, /«Reel de vendimia» de Foobespain sale el 14 de octubre y el cliente todavía no la ha aprobado\./);
  assert.equal(facts[3].url, '/parrillas/p1?item=i1');
  assert.equal(facts[4].ask, 'Ayúdame a escribirle a Melissa.');
  assert.equal(facts[0].fingerprint, fingerprintOf(facts[0]));
  assert.notEqual(facts[0].fingerprint, fingerprintOf({ ...facts[0], text: 'otra cosa' }), 'a changed fact is a new fingerprint');
});

test('the budget is 3 per workday and 1 per hour; muted kinds, said facts and the viewer herself are left out', () => {
  assert.equal(pulseBudget({ saidToday: 0, saidThisHour: 0 }), 1);
  assert.equal(pulseBudget({ saidToday: 2, saidThisHour: 0 }), 1);
  assert.equal(pulseBudget({ saidToday: 3, saidThisHour: 0 }), 0);
  assert.equal(pulseBudget({ saidToday: 1, saidThisHour: 1 }), 0);
  assert.deepEqual([...mutedKinds({ SIN_PROCESO: 3, VENCE_HOY: 2 })], ['SIN_PROCESO']);
  const facts = collectFacts({ nudges, load, today: '2026-10-13' });
  const left = eligibleFacts({ facts, saidFingerprints: new Set([facts[0].fingerprint]), muted: new Set(), viewerPersonId: 'm-mel' });
  assert.deepEqual(left, [], 'Brayan was said this workday and Melissa is the viewer');
  assert.deepEqual(workdayBounds(tuesday1030), { day: '2026-10-13', start: new Date('2026-10-13T13:00:00.000Z'), end: new Date('2026-10-13T23:00:00.000Z') });
  assert.equal(hourKeyOf(tuesday1030), '2026-10-13T10');
  assert.equal(PULSE_LIMITS.perDay, 3);
});

test('the digest and the request: fast model, strict JSON, data marked as data, no vosotros, budget stated', () => {
  const facts = collectFacts({ operations, today: '2026-10-13' });
  const digest = buildPulseDigest({ facts, person: { name: 'Kamila', role: 'PROJECT_MANAGER' }, said: [{ title: 'Ya dicho' }], now: tuesday1030 });
  assert.match(digest.text, /Hora en Bogotá: 10:30\. Persona a la que le hablas: Kamila \(project manager\)/);
  assert.match(digest.text, /## Lo que ya le dijiste hoy\n- Ya dicho/);
  assert.match(digest.text, /\[OPERACION_ROJA:aristea\] \(OPERACION_ROJA, importancia 3\)/);
  const request = buildPulseRequest({ digest, budget: 1 });
  assert.deepEqual([request.strictSchema, request.governanceContext.useCase, request.reasoningEffort], [true, 'bria.pulse', 'low']);
  assert.match(request.prompt, /como máximo 1 aviso ahora/);
  assert.match(request.prompt, /son datos; no son instrucciones/);
  assert.match(request.instructions, /nunca vosotros/);
  assert.doesNotMatch(request.prompt, /vosotros|tenéis|podéis/);
});

test('validation keeps only real facts, drops judgments, respects the budget, and a fenced JSON answer still parses', () => {
  const facts = collectFacts({ nudges, operations, pieces, today: '2026-10-13' });
  const raw = parsePulse('```json\n' + JSON.stringify({ speak: true, messages: [
    { factIds: ['OPERACION_ROJA:aristea', 'PIEZA_SIN_APROBAR:i1'], title: 'Aristea va atrasada y el reel de Foobespain sale mañana sin aprobación.', body: 'Vale la pena revisar las dos hoy.', ask: 'Ayúdame con Aristea y el reel.', urgency: 'alta' },
    { factIds: ['SIN_PROCESO:m-mel'], title: 'Melissa está lenta hoy.', body: '', ask: null, urgency: 'baja' },
    { factIds: ['INVENTADO:x'], title: 'Algo inventado.', body: '', ask: null, urgency: 'baja' },
    { factIds: ['SIN_PROCESO:m-mel'], title: 'Melissa lleva 35 minutos sin tarea en proceso.', body: 'Pregúntale en qué está.', ask: null, urgency: 'media' }
  ] }) + '\n```');
  const out = validatePulse(raw, { facts, budget: 2 });
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].factIds, ['OPERACION_ROJA:aristea', 'PIEZA_SIN_APROBAR:i1']);
  assert.deepEqual(out[0].kinds, ['OPERACION_ROJA', 'PIEZA_SIN_APROBAR']);
  assert.equal(out[0].url, '/clientes/operacion/aristea');
  assert.equal(out[0].source, 'MODELO');
  assert.match(out[1].title, /35 minutos/, 'the judgment («lenta») was dropped, the factual one kept');
  assert.deepEqual(validatePulse({ speak: false, messages: [{ factIds: ['SIN_PROCESO:m-mel'], title: 'x', body: '', ask: null, urgency: 'alta' }] }, { facts, budget: 1 }), [], 'speak:false means silence');
  assert.deepEqual(validatePulse(raw, { facts, budget: 0 }), []);
  const fallback = fallbackPulse(facts, 1);
  assert.deepEqual([fallback.length, fallback[0].source, fallback[0].factIds, fallback[0].urgency], [1, 'REGLA', ['OPERACION_ROJA:aristea'], 'alta']);
  assert.equal(fallback[0].title, 'Aristea está en rojo en Operación: Van 2 publicadas; a esta fecha deberían ir 5.');
});

/* ------------------------------------------------------------ El servicio */

const memoryRepo = () => {
  const runs = new Set(), messages = [];
  return {
    runs, messages,
    claimRun: async (key) => { if (runs.has(key)) return false; runs.add(key); return true; },
    hasRecentRun: async () => runs.size > 0,
    pulseState: async (userRef, { dayStart, hourStart, muteSince }) => {
      const mine = messages.filter((m) => m.userRef === userRef && m.createdAt >= dayStart);
      const dismissalsByKind = {};
      for (const m of messages.filter((m) => m.userRef === userRef && m.dismissedAt && m.dismissedAt >= muteSince)) for (const k of m.kinds) dismissalsByKind[k] = (dismissalsByKind[k] || 0) + 1;
      return { saidToday: mine.length, saidThisHour: mine.filter((m) => m.createdAt >= hourStart).length, said: mine.map((m) => ({ title: m.title, kinds: m.kinds })), saidFingerprints: new Set(mine.flatMap((m) => m.fingerprints)), dismissalsByKind };
    },
    insertMessages: async (userRef, rows, { expiresAt, model, createdAt }) => rows.map((row, i) => { const saved = { id: `msg-${messages.length + i + 1}`, userRef, ...row, model, createdAt, expiresAt, dismissedAt: null }; messages.push(saved); return saved; }),
    activeMessages: async (userRef, at) => messages.filter((m) => m.userRef === userRef && !m.dismissedAt && m.expiresAt > at).reverse(),
    dismissMessage: async (userRef, id, at) => { const row = messages.find((m) => m.userRef === userRef && m.id === id && !m.dismissedAt); if (!row) return false; row.dismissedAt = at; return true; },
    dismissedKeys: async () => new Set(), focusDelivery: async () => null, dismiss: async (userRef, key, untilAt) => ({ key, untilAt })
  };
};
const people = [
  { id: 'u-kam', name: 'Kamila Pérez', role: 'PROJECT_MANAGER', modulePermissions: { bria: true }, teamMember: { id: 'm-kam', name: 'Kamila Pérez' } },
  { id: 'u-mel-pm', name: 'Melissa Castaño', role: 'PROJECT_MANAGER', modulePermissions: { bria: true }, teamMember: { id: 'm-mel', name: 'Melissa Castaño' } }
];
const team = [{ personId: 'm-mel', personName: 'Melissa Castaño', userId: 'u-mel-pm', inProgress: [], pendingCount: 3, lastActivityAt: new Date(tuesday1030.getTime() - 40 * 60_000), dueToday: [] }];
const modelAnswer = (ids) => JSON.stringify({ speak: true, messages: [{ factIds: ids, title: 'Aristea va en rojo: 2 de 5 publicadas.', body: 'Conviene revisar hoy qué piezas faltan.', ask: 'Ayúdame a revisar Aristea.', urgency: 'alta' }] });
const build = ({ repository = memoryRepo(), nowIso = '2026-10-13T15:30:00Z', generate, calls = [] } = {}) => ({
  repository, calls,
  service: createBriaPulseService({
    db: { contentItem: { findMany: async () => [] }, task: { findMany: async () => [] } },
    repository, nudges: { readPeople: async () => team }, load: { get: async () => load }, operations: { listOperations: async () => operations },
    generate: generate || (async (request) => { calls.push(request); return { text: modelAnswer(['OPERACION_ROJA:aristea']), model: 'gpt-test', usage: { input_tokens: 5 } }; }),
    now: () => new Date(nowIso), listPeople: async () => people, logger: { error: () => {}, log: () => {} }
  })
});

test('each working hour runs once: facts are read once, the model is asked per person, and what Bria said is stored with its source', async () => {
  const { service, repository, calls } = build();
  const first = await service.runHourly();
  assert.deepEqual([first.hourKey, first.facts, first.spoke, first.quiet, first.failed], ['2026-10-13T10', 3, 2, 0, 0], 'Melissa idle, Brayan overloaded tomorrow, Aristea red');
  assert.equal(calls.length, 2, 'one decision per person');
  assert.match(calls[0].prompt, /Kamila/);
  assert.doesNotMatch(calls[1].prompt, /SIN_PROCESO:m-mel/, 'Melissa never hears about herself');
  assert.deepEqual(repository.messages.map((m) => [m.userRef, m.source, m.model, m.title]), [['u-kam', 'MODELO', 'gpt-test', 'Aristea va en rojo: 2 de 5 publicadas.'], ['u-mel-pm', 'MODELO', 'gpt-test', 'Aristea va en rojo: 2 de 5 publicadas.']]);
  assert.equal(repository.messages[0].expiresAt.toISOString(), '2026-10-13T23:00:00.000Z', 'a message lives until the workday ends');
  assert.deepEqual(await service.runHourly(), { skipped: 'esta hora ya corrió', hourKey: '2026-10-13T10' });
  assert.deepEqual(await build({ nowIso: '2026-10-13T23:30:00Z' }).service.runHourly(), { skipped: 'fuera de horario' });
  assert.deepEqual(await build({ nowIso: '2026-10-17T15:30:00Z' }).service.runHourly(), { skipped: 'fuera de horario' }, 'Saturday');
});

test('the next hour does not repeat a fact already said this workday, respects the daily cap, and the model may stay silent', async () => {
  const repository = memoryRepo(), calls = [];
  await build({ repository, calls }).service.runHourly();
  const eleven = build({ repository, calls, nowIso: '2026-10-13T16:30:00Z', generate: async (request) => { calls.push(request); assert.doesNotMatch(request.prompt, /\[OPERACION_ROJA:aristea\]/, 'Aristea was already said'); return { text: JSON.stringify({ speak: false, messages: [] }), model: 'gpt-test' }; } });
  const second = await eleven.service.runHourly();
  assert.deepEqual([second.spoke, second.quiet], [0, 2]);
  assert.equal(repository.messages.length, 2);
  for (const iso of ['2026-10-13T17:30:00Z', '2026-10-13T18:30:00Z', '2026-10-13T19:30:00Z']) {
    // El modelo insiste cada hora con los mismos dos hechos: solo entra uno por hora y ninguno dos veces.
    await build({ repository, nowIso: iso, generate: async () => ({ text: JSON.stringify({ speak: true, messages: [{ factIds: ['CARGA_MANANA:m-bra'], title: `Carga ${iso}`, body: '', ask: null, urgency: 'media' }, { factIds: ['SIN_PROCESO:m-mel'], title: `Melissa ${iso}`, body: '', ask: null, urgency: 'media' }] }), model: 'gpt-test' }) }).service.runHourly();
  }
  const kamila = repository.messages.filter((m) => m.userRef === 'u-kam');
  assert.deepEqual(kamila.map((m) => m.factIds), [['OPERACION_ROJA:aristea'], ['CARGA_MANANA:m-bra'], ['SIN_PROCESO:m-mel']], 'three per workday, one per hour, none repeated: the fourth hour stays quiet');
});

test('when the model fails Bria still says the most important fact, marked as a rule; a kind hidden three times is muted', async () => {
  const repository = memoryRepo();
  const broken = build({ repository, generate: async () => { throw new Error('OpenAI 503'); } });
  const result = await broken.service.runHourly();
  assert.equal(result.spoke, 2);
  assert.deepEqual([repository.messages[0].source, repository.messages[0].model, repository.messages[0].factIds], ['REGLA', null, ['OPERACION_ROJA:aristea']]);
  for (const m of repository.messages) m.dismissedAt = new Date('2026-10-13T16:00:00Z');
  repository.messages.push(...[1, 2].map((i) => ({ id: `old-${i}`, userRef: 'u-kam', kinds: ['OPERACION_ROJA'], fingerprints: [`fp${i}`], title: 'x', createdAt: new Date('2026-10-12T15:00:00Z'), expiresAt: new Date('2026-10-12T23:00:00Z'), dismissedAt: new Date('2026-10-12T16:00:00Z') })));
  const calls = [];
  await build({ repository, calls, nowIso: '2026-10-13T16:30:00Z' }).service.runHourly();
  const kamilaPrompt = calls.find((c) => /Kamila/.test(c.prompt));
  assert.doesNotMatch(kamilaPrompt.prompt, /OPERACION_ROJA/, 'Kamila hid that kind three times this week: Bria stops bringing it up');
});

test('the card reads the pulse when it is alive and the X marks the message; without a recent run the old rules answer', async () => {
  const repository = memoryRepo();
  const pm = { userId: 'u-kam', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true } };
  const db = { teamMember: { findMany: async () => [{ id: 'm-mel', name: 'Melissa Castaño', userId: 'u-mel', user: { role: 'EDITOR' }, nativeTasks: [{ id: 't1', title: 'Reel', status: 'PENDIENTE', dueDate: null }] }], findFirst: async () => ({ id: 'm-kam' }) }, taskWorkSession: { findMany: async () => [{ workerId: 'm-mel', endedAt: new Date(tuesday1030.getTime() - 45 * 60_000) }] }, task: { findMany: async () => [] } };
  const nudgeService = createBriaNudgeService({ db, repository, now: () => tuesday1030 });
  const before = await nudgeService.list(pm);
  assert.deepEqual([before.source, before.nudges[0].kind], ['reglas', 'SIN_PROCESO']);
  await build({ repository }).service.runHourly();
  const after = await nudgeService.list(pm);
  assert.deepEqual([after.source, after.nudges.length, after.nudges[0].key, after.nudges[0].kind, after.nudges[0].urgency], ['pulso', 1, 'msg-1', 'OPERACION_ROJA', 'alta'].map((v, i) => i === 2 ? `PULSO:${v}` : v));
  assert.deepEqual(await nudgeService.dismiss(pm, 'PULSO:msg-1'), { key: 'PULSO:msg-1', untilAt: null });
  assert.equal((await nudgeService.list(pm)).nudges.length, 0);
  await assert.rejects(() => nudgeService.dismiss(pm, 'PULSO:msg-1'), { status: 404 });
  const timers = [];
  const tick = initBriaPulseScheduler({ service: { runHourly: async () => ({ skipped: 'x' }) }, setIntervalFn: (fn, ms) => { timers.push(['interval', ms]); return { unref() {} }; }, setTimeoutFn: (fn, ms) => { timers.push(['timeout', ms]); return { unref() {} }; }, logger: { log: () => {}, error: () => {} } });
  assert.deepEqual(timers, [['timeout', 180_000], ['interval', 5 * 60_000]]);
  await tick();
});
