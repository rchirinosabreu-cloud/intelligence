// El seguimiento de los avisos de Bria (Rodny, 14 de octubre de 2026, primer punto del plan: «hoy Bria dice “Melissa
// no tiene nada en proceso” y se olvida; que a la hora mire si cambió algo y lo diga»). Un aviso no termina al
// decirse: el pulso lo vuelve a mirar cada tramo; si el hecho se resolvió, lo dice («Melissa arrancó “Reel” a las
// 10:40») y si a la hora sigue igual lo dice una sola vez. Ni lo uno ni lo otro cuenta como aviso nuevo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateFollowUp, isFollowable, FOLLOW_UP_AFTER_MS, FOLLOWABLE_KINDS } from '../src/lib/briaFollowUp.js';
import { createBriaPulseService } from '../src/services/briaPulseService.js';
import { createBriaNudgeService } from '../src/services/briaNudgeService.js';

const at = new Date('2026-10-13T15:40:00Z'); // martes 10:40 en Bogotá
const message = (over = {}) => ({ id: 'msg-1', userRef: 'u-kam', kinds: ['SIN_PROCESO'], factIds: ['SIN_PROCESO:m-mel'], taskIds: [], createdAt: new Date('2026-10-13T14:55:00Z'), followedUpAt: null, resolvedAt: null, dismissedAt: null, expiresAt: new Date('2026-10-13T23:00:00Z'), ...over });
const melissa = (over = {}) => ({ personId: 'm-mel', personName: 'Melissa Castaño', inProgress: [], pendingCount: 3, lastActivityAt: null, dueToday: [], ...over });

test('a person without a task in progress: resolved when she starts one (with the hour), or her own clock; pending says she is still without one', () => {
  assert.deepEqual(FOLLOWABLE_KINDS, ['SIN_PROCESO', 'VENCE_HOY', 'DEVUELTO_SIN_TOCAR', 'PIEZA_SIN_APROBAR']);
  assert.equal(FOLLOW_UP_AFTER_MS, 60 * 60 * 1000);
  assert.equal(isFollowable(message()), true);
  assert.equal(isFollowable(message({ factIds: ['OPERACION_ROJA:aristea', 'CARGA_MANANA:m-bra'] })), false);
  const started = evaluateFollowUp(message(), { people: [melissa({ inProgress: [{ id: 't9', title: 'Reel de lanzamiento', since: new Date('2026-10-13T15:40:00Z') }] })], now: at });
  assert.deepEqual(started, { status: 'RESOLVED', text: 'Melissa arrancó «Reel de lanzamiento» a las 10:40.' });
  assert.deepEqual(evaluateFollowUp(message(), { people: [melissa({ inProgress: [{ id: 'reloj', title: 'Reloj propio en marcha' }] })], now: at }), { status: 'RESOLVED', text: 'Melissa puso su reloj en marcha.' });
  assert.deepEqual(evaluateFollowUp(message(), { people: [melissa()], now: at }), { status: 'PENDING', text: 'Melissa sigue sin una tarea en proceso a las 10:40.' });
  assert.deepEqual(evaluateFollowUp(message(), { people: [], now: at }), { status: 'NONE' }, 'without data about the person nothing is claimed');
});

test('what is due today: resolved when every task started or closed; a returned task: when it leaves DEVUELTA or changes; a piece: when the client decided', () => {
  const due = message({ kinds: ['VENCE_HOY'], factIds: ['VENCE_HOY:m-mel'], taskIds: ['t1', 't2'] });
  assert.deepEqual(evaluateFollowUp(due, { people: [melissa({ dueToday: [{ id: 't1', title: 'Portada', status: 'PENDIENTE' }, { id: 't2', title: 'Reel', status: 'EN_CURSO' }] })], now: at }), { status: 'PENDING', text: 'Lo que le vence hoy a Melissa sigue sin empezar a las 10:40: «Portada».' });
  assert.deepEqual(evaluateFollowUp(due, { people: [melissa({ dueToday: [{ id: 't2', title: 'Reel', status: 'EN_CURSO' }] })], now: at }), { status: 'RESOLVED', text: 'Melissa ya atendió lo que le vencía hoy (1 en proceso, 1 cerrada).' });
  const returned = message({ kinds: ['DEVUELTO_SIN_TOCAR'], factIds: ['DEVUELTO_SIN_TOCAR:t7'], taskIds: ['t7'] });
  const tasksById = (task) => new Map([['t7', { id: 't7', title: 'Carrusel de Endova', status: 'DEVUELTA', updatedAt: new Date('2026-10-12T15:00:00Z'), ...task }]]);
  assert.deepEqual(evaluateFollowUp(returned, { tasksById: tasksById({}), now: at }), { status: 'PENDING', text: '«Carrusel de Endova» sigue devuelta sin cambios a las 10:40.' });
  assert.deepEqual(evaluateFollowUp(returned, { tasksById: tasksById({ status: 'EN_CURSO' }), now: at }), { status: 'RESOLVED', text: '«Carrusel de Endova» ya salió de devuelta: está en proceso.' });
  assert.deepEqual(evaluateFollowUp(returned, { tasksById: tasksById({ updatedAt: new Date('2026-10-13T15:10:00Z') }), now: at }), { status: 'RESOLVED', text: '«Carrusel de Endova» ya tuvo cambios.' });
  const piece = message({ kinds: ['PIEZA_SIN_APROBAR'], factIds: ['PIEZA_SIN_APROBAR:i4'] });
  const itemsById = (item) => new Map([['i4', { id: 'i4', objective: 'Promo del mes', status: 'POR_APROBAR', revisionRequestedAt: null, ...item }]]);
  assert.deepEqual(evaluateFollowUp(piece, { itemsById: itemsById({}), now: at }), { status: 'PENDING', text: '«Promo del mes» sigue sin aprobación del cliente a las 10:40.' });
  assert.deepEqual(evaluateFollowUp(piece, { itemsById: itemsById({ status: 'APROBADO' }), now: at }), { status: 'RESOLVED', text: '«Promo del mes» ya no está pendiente del cliente.' });
  // Un aviso que juntó dos hechos se resuelve cuando se resuelven los dos; mientras tanto se dice lo que falta.
  const both = message({ kinds: ['SIN_PROCESO', 'DEVUELTO_SIN_TOCAR'], factIds: ['SIN_PROCESO:m-mel', 'DEVUELTO_SIN_TOCAR:t7'], taskIds: ['t7'] });
  assert.deepEqual(evaluateFollowUp(both, { people: [melissa({ inProgress: [{ id: 't9', title: 'Reel' }] })], tasksById: tasksById({}), now: at }), { status: 'PENDING', text: '«Carrusel de Endova» sigue devuelta sin cambios a las 10:40.' });
  assert.equal(evaluateFollowUp(both, { people: [melissa({ inProgress: [{ id: 't9', title: 'Reel' }] })], tasksById: tasksById({ status: 'PENDIENTE' }), now: at }).status, 'RESOLVED');
  assert.doesNotMatch(JSON.stringify([started => started]), /lent|floj|mal/);
});

/* ---------------------------------------------------------------- El pulso vuelve a mirar */

const memoryRepo = () => {
  const runs = new Set(), messages = [];
  return {
    runs, messages,
    claimRun: async (key) => { if (runs.has(key)) return false; runs.add(key); return true; },
    hasRecentRun: async () => runs.size > 0,
    pulseState: async (userRef, { dayStart, hourStart }) => { const mine = messages.filter((m) => m.userRef === userRef && m.createdAt >= dayStart); return { saidToday: mine.length, saidThisHour: mine.filter((m) => m.createdAt >= hourStart).length, said: [], saidFingerprints: new Set(mine.flatMap((m) => m.fingerprints)), dismissalsByKind: {} }; },
    insertMessages: async (userRef, rows, { expiresAt, createdAt }) => rows.map((row, i) => { const saved = { id: `msg-${messages.length + i + 1}`, userRef, ...row, createdAt, expiresAt, dismissedAt: null, resolvedAt: null, resolution: null, followedUpAt: null, followUp: null }; messages.push(saved); return saved; }),
    activeMessages: async (userRef, now) => messages.filter((m) => m.userRef === userRef && !m.dismissedAt && m.expiresAt > now).reverse(),
    dismissMessage: async () => true, dismissedKeys: async () => new Set(), focusDelivery: async () => null, dailyCloseDelivery: async () => null, dismiss: async () => ({}),
    pendingFollowUps: async (now) => messages.filter((m) => !m.resolvedAt && !m.dismissedAt && m.expiresAt > now),
    resolveMessage: async (id, text, when) => { const row = messages.find((m) => m.id === id && !m.resolvedAt); if (!row) return false; row.resolvedAt = when; row.resolution = text; return true; },
    markFollowedUp: async (id, text, when) => { const row = messages.find((m) => m.id === id && !m.followedUpAt); if (!row) return false; row.followedUpAt = when; row.followUp = text; return true; }
  };
};
const kamila = { id: 'u-kam', name: 'Kamila Pérez', role: 'PROJECT_MANAGER', modulePermissions: { bria: true }, teamMember: { id: 'm-kam', name: 'Kamila Pérez' } };
const idleMelissa = { personId: 'm-mel', personName: 'Melissa Castaño', userId: 'u-mel', inProgress: [], pendingCount: 3, lastActivityAt: new Date('2026-10-13T14:55:00Z'), dueToday: [] };
const build = ({ repository, nowIso, team, tasks = [] }) => createBriaPulseService({
  db: { contentItem: { findMany: async () => [] }, task: { findMany: async () => tasks } },
  repository, nudges: { readPeople: async () => team }, load: { get: async () => ({ days: [], people: [] }) }, operations: { listOperations: async () => [] },
  generate: async () => ({ text: JSON.stringify({ speak: true, messages: [{ factIds: ['SIN_PROCESO:m-mel'], title: 'Melissa no tiene una tarea en proceso desde las 9:55.', body: 'Tiene 3 pendientes por empezar.', urgency: 'media' }] }), model: 'gpt-test' }),
  now: () => new Date(nowIso), listPeople: async () => [kamila], logger: { error: () => {}, log: () => {} }
});

test('each slot the pulse re-reads what it said: a resolved fact gets its outcome written, a pending one is said again once after an hour, and neither counts as a new notice', async () => {
  const repository = memoryRepo();
  await build({ repository, nowIso: '2026-10-13T15:30:00Z', team: [idleMelissa] }).run();
  assert.equal(repository.messages.length, 1);
  // 15 minutos después sigue igual: todavía no se insiste (la hora no pasó) y no se dice nada nuevo.
  await build({ repository, nowIso: '2026-10-13T15:45:00Z', team: [idleMelissa] }).run();
  assert.deepEqual([repository.messages.length, repository.messages[0].followUp, repository.messages[0].resolution], [1, null, null]);
  // A la hora sigue igual: se dice una sola vez.
  const hour = await build({ repository, nowIso: '2026-10-13T16:31:00Z', team: [idleMelissa] }).run();
  assert.deepEqual([hour.followedUp, hour.resolved], [1, 0]);
  assert.equal(repository.messages[0].followUp, 'Melissa sigue sin una tarea en proceso a las 11:31.');
  await build({ repository, nowIso: '2026-10-13T16:46:00Z', team: [idleMelissa] }).run();
  assert.equal(repository.messages[0].followUp, 'Melissa sigue sin una tarea en proceso a las 11:31.', 'the second reminder does not repeat');
  assert.equal(repository.messages.length, 1, 'the same fact is never a new notice in the workday');
  // Melissa arranca: el aviso queda resuelto con la hora, y el cierre lo contará.
  const started = await build({ repository, nowIso: '2026-10-13T17:01:00Z', team: [{ ...idleMelissa, inProgress: [{ id: 't9', title: 'Reel de lanzamiento', since: new Date('2026-10-13T16:58:00Z') }] }] }).run();
  assert.deepEqual([started.resolved, started.followedUp], [1, 0]);
  assert.equal(repository.messages[0].resolution, 'Melissa arrancó «Reel de lanzamiento» a las 11:58.');
  assert.equal(repository.messages[0].resolvedAt.toISOString(), '2026-10-13T17:01:00.000Z');
  // Un aviso resuelto no se vuelve a mirar, aunque Melissa vuelva a quedar sin nada.
  await build({ repository, nowIso: '2026-10-13T18:01:00Z', team: [idleMelissa] }).run();
  assert.equal(repository.messages[0].resolution, 'Melissa arrancó «Reel de lanzamiento» a las 11:58.');
});

test('a returned task is followed by reading it again, and the card shows the outcome and the reminder', async () => {
  const repository = memoryRepo();
  repository.messages.push({ id: 'msg-dev', userRef: 'u-kam', kinds: ['DEVUELTO_SIN_TOCAR'], factIds: ['DEVUELTO_SIN_TOCAR:t7'], fingerprints: ['x'], taskIds: ['t7'], title: '«Carrusel de Endova» lleva 1 día devuelta sin cambios.', body: '', urgency: 'media', actions: [], createdAt: new Date('2026-10-13T13:00:00Z'), expiresAt: new Date('2026-10-13T23:00:00Z'), dismissedAt: null, resolvedAt: null, resolution: null, followedUpAt: null, followUp: null });
  const service = build({ repository, nowIso: '2026-10-13T15:30:00Z', team: [], tasks: [{ id: 't7', title: 'Carrusel de Endova', status: 'EN_CURSO', updatedAt: new Date('2026-10-13T15:10:00Z') }] });
  const result = await service.run();
  assert.equal(result.resolved, 1);
  assert.equal(repository.messages[0].resolution, '«Carrusel de Endova» ya salió de devuelta: está en proceso.');
  const nudges = createBriaNudgeService({ db: {}, repository, now: () => new Date('2026-10-13T15:31:00Z') });
  const { nudges: rows, source } = await nudges.list({ userId: 'u-kam', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true } });
  assert.equal(source, 'pulso');
  assert.deepEqual([rows[0].key, rows[0].resolution, rows[0].followUp], ['PULSO:msg-dev', '«Carrusel de Endova» ya salió de devuelta: está en proceso.', null]);
  const card = readFileSync('src/components/bria/BriaNudge.jsx', 'utf8');
  assert.match(card, /data-bria-nudge-resolution/);
  assert.match(card, /nudge\.resolution/);
  assert.match(card, /data-bria-nudge-follow-up/);
  assert.match(card, /nudge\.followUp/);
  assert.match(card, /text-status-positive-fg/, 'the outcome is green only in its icon and text, like a success');
  const sql = readFileSync('scripts/sql/bria-proactive.sql', 'utf8');
  for (const column of ['follow_up TEXT', 'followed_up_at TIMESTAMPTZ', 'resolution TEXT', 'resolved_at TIMESTAMPTZ']) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}`));
  const repo = readFileSync('src/services/briaProactiveRepository.js', 'utf8');
  assert.match(repo, /resolved_at IS NULL AND dismissed_at IS NULL AND expires_at > \$1/, 'only live, unresolved, not hidden notices are followed');
  assert.match(repo, /SET followed_up_at=\$2, follow_up=\$3 WHERE id=\$1 AND followed_up_at IS NULL/, 'the reminder is written once');
});
