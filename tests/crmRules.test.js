import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRM_STAGES, CRM_THRESHOLDS, CRM_ORIGINS, CRM_ACTIVITY_TYPES,
  stageGroup, isOpenStage, isClosedStage, formatLeadCode,
  bogotaDateKey, followUpBucket, computeTrafficLight, computeMetrics, deriveOutcome
} from '../src/lib/crmRules.js';

const day = (iso, hour = 15) => new Date(`${iso}T${String(hour).padStart(2, '0')}:00:00-05:00`);
const NOW = day('2026-09-18');

test('stages are a closed catalog grouped into open, approved, won and closed', () => {
  assert.equal(CRM_STAGES.length, 12);
  assert.equal(stageGroup('POR_GESTIONAR'), 'ABIERTO');
  assert.equal(stageGroup('SIN_RESPUESTA'), 'ABIERTO');
  assert.equal(stageGroup('APROBADA'), 'APROBADO');
  assert.equal(stageGroup('GANADO'), 'GANADO');
  assert.equal(stageGroup('PERDIDO'), 'CERRADO');
  assert.equal(stageGroup('DESCARTADO'), 'CERRADO');
  assert.equal(stageGroup('INVENTADA'), null);
  assert.equal(isOpenStage('NEGOCIACION'), true);
  assert.equal(isOpenStage('APROBADA'), false);
  assert.equal(isClosedStage('GANADO'), true);
  assert.equal(isClosedStage('APROBADA'), false);
  assert.equal(deriveOutcome('APROBADA'), 'APROBADO');
  assert.equal(deriveOutcome('DESCARTADO'), 'DESCARTADO');
  assert.equal(deriveOutcome('CONTACTADO'), 'ABIERTO');
  assert.ok(CRM_ORIGINS.some(origin => origin.value === 'LINKEDIN'));
  assert.ok(CRM_ACTIVITY_TYPES.some(type => type.value === 'CAMBIO_ETAPA'));
  assert.equal(formatLeadCode(7), 'CRM-0007');
});

test('bogota date keys ignore the server timezone', () => {
  assert.equal(bogotaDateKey(new Date('2026-09-18T03:30:00Z')), '2026-09-17');
  assert.equal(bogotaDateKey(new Date('2026-09-18T05:00:00Z')), '2026-09-18');
  assert.equal(bogotaDateKey('2026-09-18'), '2026-09-18');
  assert.equal(bogotaDateKey(null), null);
});

test('follow-up buckets: overdue, today, this week, later, none, and nothing for closed leads', () => {
  const open = (nextFollowUpAt, stage = 'CONTACTADO') => ({ stage, nextFollowUpAt });
  assert.equal(followUpBucket(open('2026-09-17'), NOW), 'VENCIDO');
  assert.equal(followUpBucket(open('2026-09-18'), NOW), 'HOY');
  assert.equal(followUpBucket(open('2026-09-20'), NOW), 'SEMANA'); // Sunday of the same Bogotá week
  assert.equal(followUpBucket(open('2026-09-21'), NOW), 'FUTURO'); // next Monday
  assert.equal(followUpBucket(open(null), NOW), 'SIN_FECHA');
  assert.equal(followUpBucket(open('2026-09-18', 'APROBADA'), NOW), 'HOY');
  assert.equal(followUpBucket(open('2026-09-10', 'GANADO'), NOW), null);
  assert.equal(followUpBucket(open(null, 'PERDIDO'), NOW), null);
  // Just after midnight in Bogotá is still "today" there even if the UTC day moved on.
  assert.equal(followUpBucket(open('2026-09-18'), new Date('2026-09-19T04:59:00Z')), 'HOY');
});

const activity = (type, iso) => ({ type, occurredAt: day(iso) });

test('traffic light: manual override wins and is reported as manual', () => {
  const lead = { stage: 'PERDIDO', trafficLightOverride: 'VERDE', trafficLightReason: 'Volverá en enero' };
  assert.deepEqual(computeTrafficLight(lead, [], NOW), { value: 'VERDE', mode: 'MANUAL', reason: 'Volverá en enero' });
});

test('traffic light: closed, lost and unanswered stages are red; approved and won are green', () => {
  assert.equal(computeTrafficLight({ stage: 'PERDIDO' }, [], NOW).value, 'ROJO');
  assert.equal(computeTrafficLight({ stage: 'DESCARTADO' }, [], NOW).value, 'ROJO');
  assert.equal(computeTrafficLight({ stage: 'SIN_RESPUESTA', lastActivityAt: NOW }, [], NOW).value, 'ROJO');
  assert.equal(computeTrafficLight({ stage: 'APROBADA', lastActivityAt: day('2026-01-01') }, [], NOW).value, 'VERDE');
  assert.equal(computeTrafficLight({ stage: 'GANADO' }, [], NOW).value, 'VERDE');
});

test('traffic light: overdue follow-ups and stale leads turn red with the configured thresholds', () => {
  assert.equal(CRM_THRESHOLDS.overdueDays, 7);
  assert.equal(CRM_THRESHOLDS.staleDays, 21);
  assert.equal(CRM_THRESHOLDS.unansweredFollowUps, 3);
  const fresh = { stage: 'PROPUESTA_ENVIADA', lastActivityAt: day('2026-09-15') };
  assert.equal(computeTrafficLight({ ...fresh, nextFollowUpAt: '2026-09-12' }, [], NOW).value, 'AMARILLO');
  const overdue = computeTrafficLight({ ...fresh, nextFollowUpAt: '2026-09-10' }, [], NOW);
  assert.equal(overdue.value, 'ROJO');
  assert.match(overdue.reason, /vencid/i);
  const stale = computeTrafficLight({ stage: 'CONTACTADO', lastActivityAt: day('2026-08-20') }, [], NOW);
  assert.equal(stale.value, 'ROJO');
  assert.match(stale.reason, /21/);
  assert.equal(computeTrafficLight({ stage: 'CONTACTADO', lastActivityAt: day('2026-08-29') }, [], NOW).value, 'AMARILLO');
  // Without any activity the entry date is the reference.
  assert.equal(computeTrafficLight({ stage: 'POR_GESTIONAR', enteredAt: day('2026-08-01') }, [], NOW).value, 'ROJO');
  assert.equal(computeTrafficLight({ stage: 'POR_GESTIONAR', enteredAt: day('2026-09-10') }, [], NOW).value, 'AMARILLO');
});

test('traffic light: three outbound follow-ups without a client answer are red', () => {
  const lead = { stage: 'PROPUESTA_ENVIADA', lastActivityAt: day('2026-09-17') };
  const unanswered = [activity('CORREO', '2026-09-17'), activity('NOTA', '2026-09-16'), activity('WHATSAPP', '2026-09-15'), activity('LLAMADA', '2026-09-12'), activity('RESPUESTA_CLIENTE', '2026-09-01')];
  const result = computeTrafficLight(lead, unanswered, NOW);
  assert.equal(result.value, 'ROJO');
  assert.match(result.reason, /sin respuesta/i);
  const answered = [activity('CORREO', '2026-09-17'), activity('RESPUESTA_CLIENTE', '2026-09-15'), activity('LLAMADA', '2026-09-12')];
  assert.equal(computeTrafficLight(lead, answered, NOW).value, 'VERDE');
});

test('traffic light: a recent client answer or meeting is green, anything else alive is yellow', () => {
  const lead = { stage: 'NEGOCIACION', lastActivityAt: day('2026-09-16') };
  assert.equal(computeTrafficLight(lead, [activity('RESPUESTA_CLIENTE', '2026-09-14')], NOW).value, 'VERDE');
  assert.equal(computeTrafficLight(lead, [activity('REUNION', '2026-09-12')], NOW).value, 'VERDE');
  assert.equal(computeTrafficLight(lead, [activity('RESPUESTA_CLIENTE', '2026-09-05')], NOW).value, 'AMARILLO');
  assert.equal(computeTrafficLight(lead, [activity('CAMBIO_ETAPA', '2026-09-16')], NOW).mode, 'AUTO');
});

test('metrics: counts, funnel, values, averages and follow-up buckets', () => {
  const leads = [
    { id: '1', origin: 'LINKEDIN', stage: 'POR_GESTIONAR', priority: 'ALTA', enteredAt: day('2026-09-10'), nextFollowUpAt: null, activities: [] },
    { id: '2', origin: 'CONTACTO_DIRECTO', stage: 'PROPUESTA_ENVIADA', priority: 'MEDIA', enteredAt: day('2026-09-01'), firstContactAt: day('2026-09-03'), proposalSentAt: day('2026-09-05'), quotedValue: '1000000', nextFollowUpAt: '2026-09-17', lastActivityAt: day('2026-09-16'), ownerId: 'tm1', activities: [activity('REUNION', '2026-09-04')] },
    { id: '3', origin: 'REFERIDO', stage: 'GANADO', priority: 'MEDIA', enteredAt: day('2026-08-01'), firstContactAt: day('2026-08-03'), proposalSentAt: day('2026-08-10'), closedAt: day('2026-08-21'), quotedValue: '2000000', ownerId: 'tm1', activities: [{ type: 'CAMBIO_ETAPA', toStage: 'CITA_REALIZADA', occurredAt: day('2026-08-05') }] },
    { id: '4', origin: 'LINKEDIN', stage: 'PERDIDO', priority: 'BAJA', enteredAt: day('2026-07-01'), enteredAtEstimated: true, firstContactAt: day('2026-07-20'), quotedValue: '500000', activities: [] },
    { id: '5', origin: 'WHATSAPP', stage: 'APROBADA', priority: 'ALTA', enteredAt: day('2026-09-12'), firstContactAt: day('2026-09-12'), proposalSentAt: day('2026-09-13'), quotedValue: '300000', nextFollowUpAt: '2026-09-18', lastActivityAt: day('2026-09-17'), ownerId: 'tm2', activities: [activity('RESPUESTA_CLIENTE', '2026-09-17')] }
  ];
  const metrics = computeMetrics(leads, NOW);
  assert.equal(metrics.total, 5);
  assert.equal(metrics.linkedin, 2);
  assert.equal(metrics.brainStudio, 3);
  assert.equal(metrics.open, 2);
  assert.equal(metrics.approved, 1);
  assert.equal(metrics.won, 1);
  assert.equal(metrics.lost, 1);
  assert.deepEqual(metrics.byTrafficLight, { VERDE: 2, AMARILLO: 2, ROJO: 1 });
  assert.equal(metrics.byOrigin.LINKEDIN, 2);
  assert.equal(metrics.byStage.GANADO, 1);
  assert.equal(metrics.byPriority.ALTA, 2);
  assert.equal(metrics.byOwner.tm1, 2);
  assert.deepEqual(metrics.funnel.counts, { entered: 5, contacted: 4, meeting: 2, proposal: 3, won: 1 });
  assert.equal(metrics.funnel.rates.contacted, 0.8);
  assert.equal(metrics.funnel.rates.won, 0.2);
  assert.equal(metrics.quotedOpenValue, 1000000);
  assert.equal(metrics.quotedTotalValue, 3800000);
  assert.equal(metrics.wonValue, 2000000);
  assert.equal(metrics.avgDaysToFirstContact, 1.33); // (2 + 2 + 0) / 3, the estimated entry is excluded
  assert.equal(metrics.avgDaysToWin, 20);
  assert.deepEqual(metrics.followUps, { VENCIDO: 1, HOY: 1, SEMANA: 0, SIN_FECHA: 1 });
});
