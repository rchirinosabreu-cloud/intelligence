// «Bria se adelanta» (Rodny, 10 de octubre de 2026): avisos discretos para quien dirige, con lenguaje sobrio y sin
// juicios. La regla es pura y solo habla en horario laboral de Bogotá.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNudges, isWorkingTime, bogotaClock, bogotaDayEnd, workdayStart, dismissUntil, isValidNudgeKey, formatIdle, IDLE_MINUTES } from '../src/lib/briaNudges.js';

const MIN = 60_000;
const tuesday1030 = new Date('2026-10-13T15:30:00Z'); // martes 13 de octubre, 10:30 de Bogotá
const melissa = { personId: 'm-mel', personName: 'Melissa Castaño', inProgress: [], pendingCount: 3, lastActivityAt: new Date(tuesday1030.getTime() - 35 * MIN), dueToday: [] };

test('the Bogotá clock, the working window and the day end are read at UTC−5 on business days only', () => {
  assert.deepEqual(bogotaClock(tuesday1030), { day: '2026-10-13', minutes: 630, weekday: 2 });
  assert.equal(isWorkingTime(tuesday1030), true);
  assert.equal(isWorkingTime(new Date('2026-10-13T12:30:00Z')), false, '7:30 is before the day starts');
  assert.equal(isWorkingTime(new Date('2026-10-13T23:30:00Z')), false, '18:30 is after it ends');
  assert.equal(isWorkingTime(new Date('2026-10-17T15:30:00Z')), false, 'Saturday');
  assert.equal(isWorkingTime(new Date('2026-10-12T15:30:00Z')), false, 'Monday 12 October 2026 is a holiday in Colombia');
  assert.equal(bogotaDayEnd(tuesday1030).toISOString(), '2026-10-14T05:00:00.000Z');
  assert.equal(workdayStart(tuesday1030).toISOString(), '2026-10-13T13:00:00.000Z');
  assert.equal(formatIdle(35 * MIN), '35 minutos');
  assert.equal(formatIdle(125 * MIN), '2 h 5 min');
});

test('someone with pending work and nothing in progress for 30 minutes gets a sober, friendly nudge with a message ready for Bria', () => {
  const [nudge] = buildNudges({ people: [melissa], now: tuesday1030 });
  assert.equal(nudge.kind, 'SIN_PROCESO');
  assert.equal(nudge.key, 'SIN_PROCESO:m-mel');
  assert.equal(nudge.title, 'Melissa lleva 35 minutos sin una tarea en proceso.');
  assert.match(nudge.body, /Tiene 3 pendientes por empezar\. Puede ser un buen momento para preguntarle en qué está\./);
  assert.match(nudge.ask, /escribirle a Melissa para preguntarle, con amabilidad, en qué está trabajando/);
  assert.equal(nudge.url, '/gestion');
  for (const word of ['lento', 'floj', 'mal', 'perezos']) assert.doesNotMatch(`${nudge.title} ${nudge.body} ${nudge.ask}`, new RegExp(word, 'i'));
  assert.equal(buildNudges({ people: [{ ...melissa, lastActivityAt: new Date(tuesday1030.getTime() - (IDLE_MINUTES - 1) * MIN) }], now: tuesday1030 }).length, 0, 'under 30 minutes nothing is said');
  assert.equal(buildNudges({ people: [{ ...melissa, inProgress: [{ id: 't1', title: 'Reel' }] }], now: tuesday1030 }).length, 0, 'with a task in progress nothing is said');
  assert.equal(buildNudges({ people: [{ ...melissa, pendingCount: 0 }], now: tuesday1030 }).length, 0, 'without pending work there is nothing to ask');
});

test('with no activity today the nudge waits 30 minutes after the day starts and says it differently', () => {
  const fresh = { ...melissa, lastActivityAt: null };
  assert.equal(buildNudges({ people: [fresh], now: new Date('2026-10-13T13:20:00Z') }).length, 0, '8:20 is still grace time');
  const [nudge] = buildNudges({ people: [fresh], now: new Date('2026-10-13T13:31:00Z') });
  assert.equal(nudge.title, 'Melissa no ha puesto ninguna tarea en proceso hoy.');
});

test('outside working hours, for the viewer, or once hidden, there is no nudge', () => {
  assert.equal(buildNudges({ people: [melissa], now: new Date('2026-10-13T23:30:00Z') }).length, 0);
  assert.equal(buildNudges({ people: [melissa], now: tuesday1030, viewerPersonId: 'm-mel' }).length, 0);
  assert.equal(buildNudges({ people: [melissa], now: tuesday1030, dismissedKeys: new Set(['SIN_PROCESO:m-mel']) }).length, 0);
});

test('in the afternoon, tasks due today that have not started are flagged with their titles and a link', () => {
  const brayan = { personId: 'm-bra', personName: 'Brayan Torres', inProgress: [{ id: 'x', title: 'Otra' }], pendingCount: 4, lastActivityAt: null, dueToday: [{ id: 't1', title: 'Portada de octubre', status: 'PENDIENTE' }, { id: 't2', title: 'Reel de lanzamiento', status: 'EN_CURSO' }] };
  assert.equal(buildNudges({ people: [brayan], now: tuesday1030 }).length, 0, 'in the morning the day is still young');
  const [nudge] = buildNudges({ people: [brayan], now: new Date('2026-10-13T19:05:00Z') }); // 14:05
  assert.deepEqual([nudge.kind, nudge.key, nudge.taskIds, nudge.url], ['VENCE_HOY', 'VENCE_HOY:m-bra', ['t1'], '/gestion?taskId=t1']);
  assert.equal(nudge.title, 'A Brayan le vence hoy una tarea que todavía no está en proceso.');
  assert.match(nudge.body, /«Portada de octubre»\. Vale la pena confirmar/);
  const many = buildNudges({ people: [{ ...brayan, dueToday: Array.from({ length: 5 }, (_, i) => ({ id: `d${i}`, title: `Tarea ${i}`, status: 'PENDIENTE' })) }], now: new Date('2026-10-13T19:05:00Z') })[0];
  assert.match(many.title, /vencen hoy 5 tareas/);
  assert.match(many.body, /y 2 más/);
  assert.equal(many.url, '/gestion');
});

test('the weekly focus comes first, longer idleness before shorter, at most five, and hidden keys expire by kind', () => {
  const people = Array.from({ length: 7 }, (_, i) => ({ personId: `p${i}`, personName: `Persona ${i}`, inProgress: [], pendingCount: 1, lastActivityAt: new Date(tuesday1030.getTime() - (40 + i * 10) * MIN), dueToday: [] }));
  const out = buildNudges({ people, now: tuesday1030, weeklyFocus: { conversationId: 'c-1', weekKey: '2026-W42' } });
  assert.equal(out.length, 5);
  assert.deepEqual([out[0].kind, out[0].key, out[0].conversationId], ['FOCO_SEMANAL', 'FOCO_SEMANAL:2026-W42', 'c-1']);
  assert.deepEqual(out.slice(1).map((n) => n.personId), ['p6', 'p5', 'p4', 'p3']);
  assert.equal(out[0].weight, undefined);
  assert.equal(dismissUntil('SIN_PROCESO:p1', tuesday1030).toISOString(), '2026-10-14T05:00:00.000Z');
  assert.equal(dismissUntil('FOCO_SEMANAL:2026-W42', tuesday1030).toISOString(), '2026-10-20T15:30:00.000Z');
  assert.equal(isValidNudgeKey('SIN_PROCESO:m-mel'), true);
  assert.equal(isValidNudgeKey('OTRA:x'), false);
  assert.equal(isValidNudgeKey('SIN_PROCESO:'), false);
});
