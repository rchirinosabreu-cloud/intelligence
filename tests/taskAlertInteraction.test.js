import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as interactions from '../src/services/taskAlertInteractionService.js';
import { finishTaskRecognition } from '../src/services/recognitionService.js';
import * as controllers from '../src/controllers/operationalTraceController.js';

const at = new Date('2026-09-14T16:00:00Z');
const taskId = randomUUID();
const userId = 'helen';
function database() {
  const rows = new Map();
  const user = { id: userId, isActive: true, role: 'EDITOR', modulePermissions: { gestion: true } };
  const task = { id: taskId, title: 'Diseñar parrilla', status: 'EN_CURSO', assignee: { userId, isActive: true },
    creatorId: userId, startedAt: new Date(at.getTime() - 16 * 3600000), accumulatedWorkMs: 0, returnedAt: new Date(at.getTime() - 7200000) };
  const db = { user: { findUnique: async () => user }, task: { findUnique: async () => task },
    operationalTraceEvent: {
      findUnique: async ({ where }) => rows.get(where.id) || null,
      upsert: async ({ where, create }) => { if (!rows.has(where.id)) rows.set(where.id, create); return rows.get(where.id); },
    },
    $transaction: async fn => fn(db),
    $executeRaw: async () => 1,
  };
  return { db, rows, user, task };
}
const send = (db, noticeId, action = 'SHOWN', kind = 'EXCESSIVE') => interactions.recordTaskAlertInteraction({ db, userId, taskId, noticeId, action, kind, at });

test('interaction API rejects forged identity, free-form descriptions and invalid choices', async () => {
  assert.equal(typeof controllers.createTaskAlertInteractionHandler, 'function');
  const handler = controllers.createTaskAlertInteractionHandler({ db: {} });
  const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
  const base = { noticeId: randomUUID(), kind: 'EXCESSIVE', action: 'SHOWN' };
  const missing = response(); await handler({ params: { taskId }, body: base }, missing); assert.equal(missing.code, 401);
  for (const body of [{ ...base, userId: 'someone-else' }, { ...base, text: 'forged' }, { ...base, action: 'ANY' }, { ...base, noticeId: 'invalid' }]) {
    const res = response(); await handler({ user: { userId }, params: { taskId }, body }, res); assert.equal(res.code, 400);
  }
});

test('shown and reviewed are distinct, correlated and idempotent', async () => {
  const { db, rows } = database(); const noticeId = randomUUID();
  await assert.rejects(() => send(db, noticeId, 'REVIEW'), error => error.statusCode === 409);
  await send(db, noticeId); await send(db, noticeId);
  assert.equal(rows.size, 1);
  assert.equal([...rows.values()][0].eventType, 'TASK_ALERT_SHOWN');
  await send(db, noticeId, 'REVIEW'); await send(db, noticeId, 'REVIEW');
  assert.equal(rows.size, 2);
  assert.equal([...rows.values()][1].eventType, 'TASK_ALERT_REVIEWED');
  assert.equal([...rows.values()][1].metadata.noticeId, noticeId);
  assert.equal([...rows.values()][1].actorId, userId);
});

test('rejects other people, inactive accounts, revoked permissions and tasks below threshold', async () => {
  for (const change of [
    ({ task }) => { task.assignee.userId = 'someone-else'; },
    ({ user }) => { user.isActive = false; },
    ({ user }) => { user.modulePermissions = {}; },
    ({ task }) => { task.startedAt = at; },
  ]) {
    const state = database(); change(state);
    await assert.rejects(() => send(state.db, randomUUID()), error => [401, 403, 409].includes(error.statusCode));
    assert.equal(state.rows.size, 0);
  }
});

test('returned notices belong to the creator and require at least an hour returned', async () => {
  const { db, task, rows } = database(); task.status = 'DEVUELTA';
  await send(db, randomUUID(), 'SHOWN', 'RETURNED'); assert.equal(rows.size, 1);
  task.creatorId = 'someone-else';
  await assert.rejects(() => send(db, randomUUID(), 'SHOWN', 'RETURNED'), error => error.statusCode === 403);
  task.creatorId = userId; task.returnedAt = at;
  await assert.rejects(() => send(db, randomUUID(), 'SHOWN', 'RETURNED'), error => error.statusCode === 409);
});

test('only a newly persisted award creates a recognition history entry in the same transaction', async () => {
  let inserted = false;
  const traces = [];
  const tx = {
    user: { findUnique: async () => ({ isActive: true }) },
    recognitionTaskState: { update: async () => {}, count: async () => 1 },
    recognitionDebtState: { findUnique: async () => null },
    recognitionAward: { createMany: async () => { const count = inserted ? 0 : 1; inserted = true; return { count }; } },
    operationalTraceEvent: { create: async ({ data }) => { traces.push(data); return data; } },
  };
  const before = { task: { id: taskId, status: 'PENDIENTE', assigneeId: 'member', assignee: { userId, isActive: true } }, state: {} };
  const after = { id: taskId, status: 'REALIZADA', assigneeId: 'member' };
  await finishTaskRecognition(tx, before, after, at);
  await finishTaskRecognition(tx, before, after, at);
  assert.equal(traces.length, 1);
  assert.equal(traces[0].eventType, 'RECOGNITION_GRANTED');
  assert.equal(traces[0].subjectUserId, userId);
  assert.equal(traces[0].actorId, null, 'award recipient did not manually issue their own award');
  assert.equal(traces[0].metadata.kind, 'FIRST_TASK');
});
