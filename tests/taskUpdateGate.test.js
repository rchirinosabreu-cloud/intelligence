// La puerta que comparten la pantalla de Gestión y Bria para cambiar una tarea (9 de octubre de 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkTaskUpdate } from '../src/services/taskUpdateGate.js';

const fakeDb = (task, { focusTask = null } = {}) => ({
  task: {
    findUnique: async () => task,
    findFirst: async ({ where } = {}) => (where?.status === 'EN_CURSO' ? null : focusTask)
  }
});
const base = { creatorId: 'creator', status: 'PENDIENTE', assignee: { userId: 'assignee' }, collaborators: [{ member: { userId: 'collab' } }] };
const editor = (userId) => ({ userId, role: 'EDITOR' });

const gateStatus = async (promise) => {
  try { await promise; return 200; } catch (error) { return error.gateStatus || 500; }
};

test('managers, creator and assignee may change the task; strangers may not', async () => {
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(base), user: { userId: 'boss', role: 'ADMIN' }, taskId: 't', payload: { priority: 'ALTA' } })), 200);
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(base), user: editor('creator'), taskId: 't', payload: { priority: 'ALTA' } })), 200);
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(base), user: editor('assignee'), taskId: 't', payload: { dueDate: '2026-10-20' } })), 200);
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(base), user: editor('stranger'), taskId: 't', payload: { priority: 'ALTA' } })), 403);
});

test('a collaborator only moves the task between Pendiente and En proceso', async () => {
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(base), user: editor('collab'), taskId: 't', payload: { status: 'EN_CURSO' } })), 200);
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(base), user: editor('collab'), taskId: 't', payload: { assigneeId: 'x' } })), 403);
});

test('anyone may reopen a closed task, and only reopen it', async () => {
  const closed = { ...base, status: 'REALIZADA' };
  const reopen = { status: 'PENDIENTE', reopenReason: 'CLIENT_CORRECTION', reopenNote: 'El cliente pidió otro color.' };
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(closed), user: editor('stranger'), taskId: 't', payload: reopen })), 200);
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(closed), user: editor('stranger'), taskId: 't', payload: { ...reopen, assigneeId: 'x' } })), 403);
});

test('manager-only fields, privacy, the commitment lock and a missing task keep their answers', async () => {
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(base), user: editor('creator'), taskId: 't', payload: { sortOrder: 2 } })), 403);
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(base), user: editor('creator'), taskId: 't', payload: { focusDeadlineAt: null } })), 403);
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(base), user: { userId: 'boss', role: 'ADMIN' }, taskId: 't', payload: { isPrivate: true } })), 403, 'privacy is of whoever created it, not of a role');
  assert.equal(await gateStatus(checkTaskUpdate({ db: fakeDb(null), user: { userId: 'boss', role: 'ADMIN' }, taskId: 't', payload: {} })), 404);
  const locked = fakeDb({ ...base, assignee: { userId: 'assignee' } }, { focusTask: { id: 'focus', title: 'Compromiso', focusDeadlineAt: new Date('2026-10-09T20:00:00Z') } });
  const error = await checkTaskUpdate({ db: locked, user: editor('assignee'), taskId: 't', payload: { priority: 'ALTA' } }).catch((caught) => caught);
  assert.equal(error.gateStatus, 423);
  assert.equal(error.focusTask.id, 'focus');
});

test('the controller hands the gate exactly what it received, and answers with its status', () => {
  const controller = readFileSync('src/controllers/taskController.js', 'utf8');
  assert.match(controller, /await checkTaskUpdate\(\{ db: prisma, user: req\.user, taskId: req\.params\.taskId, payload: req\.body \}\)/);
  assert.match(controller, /if \(gate\.gateStatus\) return res\.status\(gate\.gateStatus\)\.json\(\{ error: gate\.message, \.\.\.\(gate\.focusTask \? \{ focusTask: gate\.focusTask \} : \{\}\) \}\)/);
});
