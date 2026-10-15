import test from 'node:test';
import assert from 'node:assert/strict';
import { buildContextProfiles, contextualBaseline } from '../src/lib/workPrediction.js';
import { buildTeamForecast } from '../src/lib/teamForecast.js';
import { buildLoadMap, loadSignals } from '../src/lib/teamLoad.js';
import { collectFacts } from '../src/lib/briaPulse.js';
import { workTypeOf } from '../src/services/teamRhythmService.js';
import { createWeeklyReadingService } from '../src/services/weeklyReadingService.js';
import { isCurrentPredictionMessage, fingerprintOf } from '../src/lib/briaPulse.js';
import { buildRhythmRecords } from '../src/services/teamRhythmService.js';
import { toolByName } from '../src/services/briaAssistantTools.js';
import { createTeamRhythmService } from '../src/services/teamRhythmService.js';

const H = 3600000, now = new Date('2026-10-16T20:00:00Z');
const people = [{ personId: 'a', personName: 'Ana' }];
const task = (extra = {}) => ({ id: 'reel', title: '[Producción] Reel: X', personId: 'a', clientId: 'x', complexity: 'MEDIA', workType: 'Reel', dueDay: '2026-10-16', ...extra });
const profiles = (extra = {}, durations = [H,H,H]) => buildContextProfiles(durations.map((measuredMs, i) => ({ ...task(extra), id: String(i), measuredMs })));
const forecast = (tasks, p = profiles(), extra = {}) => buildTeamForecast({ people, tasks, rhythm: { profiles: p }, now, ...extra }).people[0];

test('broad categories and cross-client fallbacks have no predictive duration or risk', () => {
  for (const [t, p] of [[task({ workType: 'Operaciones & Reuniones' }), profiles({ workType: 'Operaciones & Reuniones' })], [task({ clientId: 'other' }), profiles()]]) {
    const out = forecast([t], p);
    assert.equal(out.tasks[0].remainingMs, null);
    assert.equal(out.tasks[0].risk, null);
    assert.equal(out.remainingMs, null);
    assert.equal(out.riskCount, 0);
    assert.equal(out.canReceive, false);
  }
});

test('a highly variable exact sample cannot become a duration just because it contains three tasks', () => {
  const out = forecast([task()], profiles({}, [H/4,H,4*H]));
  assert.equal(out.tasks[0].remainingMs, null);
});

test('a truncated query cannot expose an individual duration as a reliable prediction', () => {
  const out = forecast([task()], profiles(), { incomplete: true });
  assert.equal(out.tasks[0].remainingMs, null);
  assert.equal(out.riskCount, 0);
});

test('declared, incomplete, overlapping and partial measurements never teach full production time', () => {
  for (const extra of [{ declaredMs: H }, { overlappedMs: H }, { timingIncomplete: true }, { partialResponsibility: true }]) {
    assert.equal(profiles(extra).reduce((n,p) => n + p.measured, 0), 0);
  }
});

test('a reliable task after an unknown earlier commitment cannot trigger a cumulative delivery alert', () => {
  const out = forecast([task({ id: 'unknown', workType: 'Operaciones & Reuniones' }), task()], profiles({}, [2*H,2*H,2*H]));
  const known = out.tasks.find(t => t.id === 'reel');
  assert.equal(known.risk, null);
  assert.equal(known.queueComplete, false);
  assert.equal(out.remainingMs, null);
});

test('reaching the historical duration does not manufacture a remaining 25 percent estimate', () => {
  const out = forecast([task({ workSessions: [{ workerId: 'a', endedAt: now, durationMs: H }] })]);
  assert.equal(out.tasks[0].remainingMs, null);
  assert.equal(out.tasks[0].needsReview, true);
});

test('a Sunday deadline never gains Monday capacity and stays inside the current week', () => {
  const out = forecast([task({ dueDay: '2026-10-18' })], profiles({}, [4*H,4*H,4*H]));
  assert.equal(out.tasks[0].scheduledDay, '2026-10-18');
  assert.equal(out.tasks[0].capacityToDeadlineMs, 2.4*H);
  assert.equal(out.riskCount, 1);
});

test('linked review and script tasks are not full production tasks of the piece format', () => {
  for (const title of ['Revisar el reel con cliente', 'Redactar guion', 'Ajustar video', 'Enviar insumos al cliente']) {
    assert.notEqual(workTypeOf({ title, contentItem: { format: 'Reel' } }), 'Reel');
  }
});

test('collaborative work and an untrustworthy open clock do not produce a personal forecast', () => {
  for (const extra of [{ sharedWork: true }, { workSessions: [{ workerId: 'a', startedAt: '2026-10-16T08:00:00Z', endedAt: null }] }]) {
    assert.equal(forecast([task(extra)]).tasks[0].remainingMs, null);
  }
});

test('the delivery map does not resurrect a team median or a one-hour assumption', () => {
  const map = buildLoadMap({ people, tasks: [task()], today: '2026-10-16', estimates: { byType: { Reel: H } } });
  assert.equal(map.people[0].cells[0].ms, null);
  assert.equal(map.people[0].cells[0].level, 'sin_datos');
  assert.equal(loadSignals(map).some(s => s.kind === 'CON_ESPACIO'), false);
});

test('the delivery map never relabels a Sunday delivery as a Monday delivery', () => {
  const map = buildLoadMap({ people, tasks: [task({ dueDay: '2026-10-18' })], today: '2026-10-16' });
  assert.equal(map.people[0].cells.find(c => c.day === '2026-10-19').count, 0);
  assert.equal(map.people[0].nonWorking[0].dueDay, '2026-10-18');
});

test('Bria refuses legacy overloaded cells and a risky task with an incomplete predecessor queue', () => {
  const legacy = { days: ['2026-10-16','2026-10-19'], people: [{ ...people[0], cells: [{ day: '2026-10-19', level: 'excedida', ms: 20*H, count: 2, tasks: [task()] }] }] };
  assert.equal(collectFacts({ load: legacy, today: '2026-10-16' }).length, 0);
  const load = { ...legacy, forecast: { people: [{ ...people[0], tasks: [task({ risk: 'riesgo', confidence: 'suficiente', queueComplete: false, remainingMs: H, capacityToDeadlineMs: 0 })] }] } };
  assert.equal(collectFacts({ load, today: '2026-10-16' }).length, 0);
});

test('stored weekly readings from the previous prediction policy are not served as current advice', async () => {
  const service = createWeeklyReadingService({ repository: { latest: async () => ({ id: 'old', weekKey: '2026-W42', reading: { summary: 'Mucho trabajo supuesto' } }) }, now: () => now });
  const out = await service.current();
  assert.equal(out.reading, null);
  assert.equal(out.needsRefresh, true);
});

test('past predictive messages need a current policy fingerprint, while factual notices remain visible', () => {
  assert.equal(isCurrentPredictionMessage({ kinds: ['CARGA_MANANA'], fingerprints: ['old'] }), false);
  assert.equal(isCurrentPredictionMessage({ kinds: ['ENTREGA_EN_RIESGO'], fingerprints: [fingerprintOf({ kind: 'ENTREGA_EN_RIESGO', subject: 't', text: 'Actual' })] }), true);
  assert.equal(isCurrentPredictionMessage({ kinds: ['VENCE_HOY'] }), true);
});

test('a stored zero duration is not replaced with elapsed wall-clock time, nor is an invalid session learned', () => {
  const closed = [{ id: 't', title: 'Reel', completedAt: now, assigneeId: 'a', clientId: 'x', aiComplexity: 'MEDIA' }];
  const sessions = [{ taskId: 't', workerId: 'a', startedAt: '2026-10-16T13:00:00Z', endedAt: '2026-10-16T14:00:00Z', durationMs: 0 }];
  const records = buildRhythmRecords({ tasks: closed, sessions });
  assert.equal(records[0].measuredMs, 0);
  const bad = buildRhythmRecords({ tasks: closed, sessions: [{ ...sessions[0], durationMs: H, endedAt: null }] });
  assert.equal(buildContextProfiles(bad)[0].measured, 0);
});

test('an earlier assignee clock is not learned as the full task when the final assignee never measured their part', () => {
  const records = buildRhythmRecords({ tasks: [{ id: 't', title: 'Reel', assigneeId: 'b', completedAt: now }], sessions: [{ taskId: 't', workerId: 'a', durationMs: H, startedAt: '2026-10-16T13:00:00Z', endedAt: '2026-10-16T14:00:00Z' }] });
  assert.equal(buildContextProfiles(records).some(p => p.personId === 'a' && p.measured > 0), false);
});

test('Bria does not turn an unknown forecast into zero minutes or legacy occupied hours', async () => {
  const unknown = forecast([task({ workType: 'Operaciones & Reuniones' })]);
  const map = buildLoadMap({ people, tasks: [task()], today: '2026-10-16' });
  map.forecast = { policy: 'ritmo-contexto-v2', days: ['2026-10-16'], people: [unknown] }; map.signals = [];
  const out = await toolByName('carga_del_equipo').run({}, { load: { get: async () => map } });
  assert.equal(out.data.prevision.personas[0].trabajoRestante, null);
  assert.equal(out.data.personas[0].horasComprometidas, null);
});

test('the live historical service does not turn completion-day totals or different-client medians into findings', async () => {
  const tasks = [1,2,3,4].map(i => ({ id: String(i), title: 'Video', status: 'REALIZADA', completedAt: now, assigneeId: i < 3 ? 'a' : 'b', clientId: 'x', aiComplexity: 'MEDIA' }));
  const sessions = tasks.map(t => ({ taskId: t.id, workerId: t.assigneeId, durationMs: t.assigneeId === 'a' ? 6*H : H, startedAt: '2026-10-13T13:00:00Z', endedAt: '2026-10-13T19:00:00Z' }));
  const service = createTeamRhythmService({ now: () => now, db: { task: { findMany: async () => tasks }, taskWorkSession: { findMany: async () => sessions }, teamMember: { findMany: async () => people.map(p => ({ id: p.personId, name: p.personName })) } } });
  const out = await service.get();
  assert.equal(out.people.flatMap(p => p.findings).some(f => ['HEAVY_DAY','LONG_DAY','SLOWER_THAN_TEAM','FASTER_THAN_TEAM'].includes(f.kind)), false);
});
