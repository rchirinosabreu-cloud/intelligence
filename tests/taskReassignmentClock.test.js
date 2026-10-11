// Reasignar una tarea en proceso (Rodny, 11 de octubre de 2026, «me voy por la primera también»): el reloj del
// responsable anterior se cierra y la tarea vuelve a Pendiente, para que el nuevo responsable la arranque cuando la
// tome; el tiempo medido queda a nombre de quien trabajó. Si quien reasigna pide además «En proceso», el reloj
// anterior se cierra igual y el nuevo arranca el suyo en el acto. Vale para la pantalla y para Bria: la regla vive
// en el servicio de tareas, por donde pasan las dos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reassignmentEffect } from '../src/lib/taskTiming.js';

const inProgress = { status: 'EN_CURSO', assigneeId: 'm-jarlan' };

test('reassigning a task in progress sends it back to Pendiente; nothing else changes the rule', () => {
  assert.deepEqual(reassignmentEffect(inProgress, { assigneeChanged: true, assigneeId: 'm-kamila' }), { status: 'PENDIENTE', handover: false });
  assert.deepEqual(reassignmentEffect(inProgress, { assigneeChanged: true, assigneeId: null }), { status: 'PENDIENTE', handover: false }, 'leaving it without a person also stops the clock');
  assert.equal(reassignmentEffect(inProgress, { assigneeChanged: true, assigneeId: 'm-jarlan' }), null, 'the same person is not a reassignment');
  assert.equal(reassignmentEffect(inProgress, { assigneeChanged: false, assigneeId: 'm-kamila' }), null, 'a payload that does not touch the assignee never triggers it');
  assert.equal(reassignmentEffect({ status: 'PENDIENTE', assigneeId: 'm-jarlan' }, { assigneeChanged: true, assigneeId: 'm-kamila' }), null, 'a task that is not in progress has no clock to close');
  assert.equal(reassignmentEffect({ status: 'DEVUELTA', assigneeId: 'm-jarlan' }, { assigneeChanged: true, assigneeId: 'm-kamila' }), null);
  assert.equal(reassignmentEffect({ status: 'en_curso', assigneeId: 'm-jarlan' }, { assigneeChanged: true, assigneeId: 'm-kamila' })?.status, 'PENDIENTE', 'status is compared without case');
});

test('an explicit status travels with the reassignment: closing or returning already stops the clock; «En proceso» hands it over', () => {
  assert.equal(reassignmentEffect(inProgress, { assigneeChanged: true, assigneeId: 'm-kamila', status: 'REALIZADA' }), null);
  assert.equal(reassignmentEffect(inProgress, { assigneeChanged: true, assigneeId: 'm-kamila', status: 'DEVUELTA' }), null);
  assert.equal(reassignmentEffect(inProgress, { assigneeChanged: true, assigneeId: 'm-kamila', status: 'PENDIENTE' }), null);
  assert.deepEqual(reassignmentEffect(inProgress, { assigneeChanged: true, assigneeId: 'm-kamila', status: 'EN_CURSO' }), { status: 'EN_CURSO', handover: true });
});

test('the task service applies the rule before the status transition, for the screen and for Bria alike', () => {
  const source = readFileSync('src/services/nativeTaskService.js', 'utf8');
  const update = source.slice(source.indexOf('export const updateTask'), source.indexOf('export const auditAndDeleteTask'));
  assert.match(source, /import \{ closeTaskWorkSession, formatTaskReturnEventContent, reassignmentEffect \} from '\.\.\/lib\/taskTiming\.js'/);
  assert.match(update, /const reassignment = reassignmentEffect\(currentTask, \{ assigneeChanged: 'assigneeId' in updateData, assigneeId: nextAssigneeId, status: requestedStatus \}\)/);
  assert.match(update, /if \(reassignment\) updateData\.status = reassignment\.status;/);
  assert.ok(update.indexOf('const reassignment = reassignmentEffect(') < update.indexOf("if ('status' in updateData) {"), 'the rule decides the status before the lifecycle block closes the clock');
  // El relevo en caliente: se cierra la sesión de quien trabajaba y arranca la del nuevo responsable, nunca la del anterior.
  assert.match(update, /else if \(reassignment\?\.handover\) \{/);
  const handover = update.slice(update.indexOf('else if (reassignment?.handover) {'), update.indexOf('if (isReopened) {'));
  assert.match(handover, /closeActiveTaskWorkSession\(tx, \{ taskId: id, actorId: updaterId, at: transitionAt, closeReason: 'PAUSED' \}\)/);
  assert.match(handover, /updateData\.accumulatedWorkMs = closeTaskWorkSession\(currentTask, transitionAt\)/);
  assert.match(handover, /task: \{ \.\.\.currentTask, id, assigneeId: nextAssigneeId \}/, 'the new session belongs to the new assignee');
  assert.match(handover, /if \(isTeamTask\)/, 'with collaborators nobody starts a clock by themselves');
});

test('Bria says what will happen to the clock before the person confirms, one task or fifty', () => {
  const actions = readFileSync('src/services/briaActionService.js', 'utf8');
  assert.match(actions, /vuelve a Pendiente y el reloj de .* se cierra/);
  assert.match(actions, /el reloj pasa a/, 'with «en proceso» the clock is handed over');
  assert.doesNotMatch(actions, /quien la trabaja la pierde|quien las trabaja las pierde/, 'the old warning described the old behaviour');
  const docs = readFileSync('AGENTS.md', 'utf8');
  assert.match(docs, /reassignmentEffect/);
});
