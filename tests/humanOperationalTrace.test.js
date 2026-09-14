import test from 'node:test';
import assert from 'node:assert/strict';
import * as labels from '../src/lib/operationalMutationLabels.js';
import { getOperationalTrace, recordTaskListSync } from '../src/services/operationalTraceService.js';

const actor = { id: 'helen', name: 'Helen' };
const row = (eventType, metadata = {}) => ({ id: eventType, eventType, actorId: actor.id,
  subjectUserId: actor.id, actor, subjectUser: actor, taskId: null, metadata, occurredAt: new Date() });

test('only an explicit manual task refresh produces a history entry', async () => {
  const writes = [];
  const db = { operationalTraceEvent: { findFirst: async () => null, create: async ({ data }) => { writes.push(data); return data; } } };
  for (const source of ['AUTOMATIC', undefined, 'UNKNOWN', 'made-up']) {
    assert.equal(await recordTaskListSync({ userId: actor.id, source, db }), null);
  }
  await recordTaskListSync({ userId: actor.id, source: 'MANUAL', db });
  assert.equal(writes.length, 1);
});

test('the timeline hides checks and duplicate automatic entries without deleting stored history', async () => {
  const rows = [
    row('PLATFORM_MUTATION', { path: '/api/recognitions/claim', method: 'POST' }),
    row('PLATFORM_MUTATION', { path: '/api/recognitions/:id/acknowledge', method: 'POST' }),
    row('PLATFORM_MUTATION', { path: '/api/fireflies/graphql', method: 'POST' }),
    row('PLATFORM_MUTATION', { path: '/api/tasks/:id/trace-open', method: 'POST' }),
    row('NOTIFICATION_CREATED'), row('TASK_LIST_SYNCED', { source: 'AUTOMATIC' }),
    row('TASK_LIST_SYNCED'), row('TASK_LIST_SYNCED', { source: 'MANUAL', taskCount: 8 }),
    row('RECOGNITION_GRANTED', { kind: 'FIRST_TASK' }),
    row('TASK_ALERT_SHOWN', { kind: 'EXCESSIVE', taskTitle: 'Diseñar parrilla' }),
    row('TASK_ALERT_REVIEWED', { kind: 'EXCESSIVE', taskTitle: 'Diseñar parrilla' }),
    row('TASK_EXCESSIVE_WORK_CONFIRMED', { taskTitle: 'Diseñar parrilla' }),
    row('TASK_RETURNED_REMINDER_SNOOZED', { taskTitle: 'Diseñar parrilla' }),
    row('PLATFORM_MUTATION', { path: '/api/clients/:id', method: 'PATCH' }),
  ];
  const copy = structuredClone(rows);
  let query;
  const result = await getOperationalTrace({ requester: { role: 'ADMIN' }, db: {
    user: { findMany: async () => [actor] }, operationalTraceEvent: { findMany: async args => { query = args; return rows; } },
  } });
  assert.equal(result.timeline.length, 7);
  assert.deepEqual(rows, copy);
  assert.equal(result.summary.totalEvents, 7);
  assert.deepEqual(result.timeline.map(event => event.description), [
    'Helen actualizó la lista de tareas.',
    'Helen recibió el reconocimiento “Buen comienzo”.',
    'Se le mostró a Helen un aviso porque “Diseñar parrilla” superó las 15 horas de trabajo.',
    'Helen seleccionó “Revisar tarea” en el aviso de más de 15 horas de “Diseñar parrilla”.',
    'Helen seleccionó “Sigo trabajando” en el aviso de más de 15 horas de “Diseñar parrilla”.',
    'Helen seleccionó “Recordarme más tarde” en el aviso de tarea devuelta de “Diseñar parrilla”.',
    'Helen actualizó los datos de un cliente.',
  ]);
  assert.ok(query.where.AND, 'filter human events in the database BEFORE applying take');
  assert.ok(!JSON.stringify(query.where.AND).includes('/api/recognitions/claim'));
});

test('human action catalog does not invent actions for unclassified endpoints or request bodies', () => {
  for (const [method, path, expected] of [
    ['POST', '/api/tasks/123/comments', 'Helen envió un comentario.'],
    ['PATCH', '/api/clients/123', 'Helen actualizó los datos de un cliente.'],
    ['POST', '/api/dashboard/announcements', 'Helen publicó un anuncio.'],
    ['POST', '/api/content/plans/123/share-token', 'Helen creó un enlace para revisar una parrilla.'],
  ]) {
    const metadata = { ...labels.describePlatformMutation({ method, pathname: path }), method };
    assert.equal(labels.presentPlatformMutation(metadata, 'Helen').description, expected);
  }
  for (const path of ['/api/recognitions/claim', '/api/recognitions/claim-settings', '/api/unknown', '/api/push/subscriptions']) {
    assert.equal(labels.presentPlatformMutation({ path, method: 'POST' }, 'Helen').visible, false);
  }
});

test('automatic task updates without a person are hidden, but granted awards remain visible', async () => {
  const result = await getOperationalTrace({ requester: { role: 'ADMIN' }, db: {
    user: { findMany: async () => [actor] }, operationalTraceEvent: { findMany: async () => [
      { ...row('TASK_UPDATED'), actorId: null, actor: null },
      { ...row('RECOGNITION_GRANTED', { kind: 'FIRST_TASK' }), actorId: null, actor: null },
    ] },
  } });
  assert.equal(result.timeline.length, 1);
  assert.equal(result.timeline[0].eventType, 'RECOGNITION_GRANTED');
});

test('existing comment paths with normalized ids still use the human vocabulary', () => {
  const metadata = { method: 'PATCH', path: '/api/tasks/:id/comments/:id' };
  assert.equal(labels.presentPlatformMutation(metadata, 'Helen').description, 'Helen editó un comentario.');
  assert.ok(JSON.stringify(labels.humanMutationWhere()).includes('"/api/tasks/:id/comments/:id"'));
});
