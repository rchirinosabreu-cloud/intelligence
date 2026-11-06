import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const moduleUrl = new URL('../src/lib/taskParticipationBoard.js', import.meta.url);
const api = async () => {
  assert.ok(existsSync(moduleUrl), 'el tablero necesita una proyección por participante sin duplicar tareas');
  return import(moduleUrl.href);
};
const participant = (memberId, status) => ({ memberId, member: { id: memberId, userId: `user-${memberId}`, name: memberId }, status,
  revision: 4, accumulatedWorkMs: 12000, startedAt: status === 'EN_CURSO' ? '2026-11-05T15:00:00Z' : null,
  completedAt: status === 'REALIZADA' ? '2026-11-05T16:00:00Z' : null, permissions: { canChangeStatus: memberId === 'ana' } });
const fixture = () => ({ id: 'task-one', sharedProgress: true, rosterVersion: 2, status: 'EN_CURSO', assigneeId: 'ana',
  collaborators: [{ id: 'luis', name: 'luis' }], participants: [participant('ana', 'REALIZADA'), participant('luis', 'EN_CURSO')],
  openSessions: [{ id: 'session-luis', workerId: 'luis', endedAt: null }] });

test('dos tarjetas comparten Task ID pero conservan estado, reloj y clave de persona distintos', async () => {
  const { projectTaskParticipations, taskCardKey } = await api();
  const task = fixture();
  const [ana, luis] = projectTaskParticipations([task]);
  assert.equal(ana.id, task.id); assert.equal(luis.id, task.id);
  assert.notEqual(taskCardKey(ana), taskCardKey(luis));
  assert.equal(ana.status, 'REALIZADA'); assert.equal(luis.status, 'EN_CURSO');
  assert.equal(ana.startedAt, null); assert.equal(luis.startedAt, task.participants[1].startedAt);
  assert.equal(ana.canonicalTask, task); assert.equal(task.status, 'EN_CURSO');
  assert.equal(ana.assigneeUserId, 'user-ana'); assert.equal(luis.assigneeUserId, 'user-luis');
  assert.deepEqual(ana.collaborators, [], 'el filtro por persona no incluye las partes de sus compañeros');
});

test('la mutación identifica participante y versiones sin enviar estado global, fechas ni posición común', async () => {
  const { projectTaskParticipations, participationRequest } = await api();
  const [, luis] = projectTaskParticipations([fixture()]);
  assert.deepEqual(participationRequest(luis, { status: 'REALIZADA', isReturned: false, orderBeforeId: 'otra' }), {
    path: '/api/tasks/task-one/participants/luis',
    body: { status: 'REALIZADA', expectedRevision: 4, expectedRosterVersion: 2 }
  });
});

test('el recibo de una parte realizada conserva el reloj ajeno exactamente como lo entrega el servidor', async () => {
  const { applyParticipationReceipt } = await api();
  const task = fixture();
  const saved = { id: task.id, status: 'PENDIENTE', sharedProgress: true, rosterVersion: 2,
    participants: task.participants, workSessions: task.openSessions };
  const [updated] = applyParticipationReceipt([task], saved);
  assert.deepEqual(updated.openSessions, task.openSessions);
  assert.equal(updated.collaborators, task.collaborators, 'conserva las relaciones normalizadas del tablero');
  assert.equal(updated.participants, saved.participants);
});

test('solo un recibo que confirma una transición nueva de esa persona permite celebrar', async () => {
  const { didCompleteParticipation } = await api();
  const saved = { participationTransition: { memberId: 'ana', changed: true, completed: true, globalCompleted: false } };
  assert.equal(didCompleteParticipation(saved, 'ana'), true);
  assert.equal(didCompleteParticipation(saved, 'luis'), false);
  assert.equal(didCompleteParticipation({ participationTransition: { ...saved.participationTransition, changed: false } }, 'ana'), false);
});

test('el compromiso con hora pertenece al responsable, no se replica al colaborador', async () => {
  const { projectTaskParticipations } = await api();
  const task = fixture(); task.focusDeadlineAt = '2026-11-05T20:00:00Z';
  task.participants[0].role = 'ASSIGNEE'; task.participants[1].role = 'COLLABORATOR';
  const [owner, collaborator] = projectTaskParticipations([task]);
  assert.equal(owner.focusDeadlineAt, task.focusDeadlineAt);
  assert.equal(collaborator.focusDeadlineAt, null);
});

test('el lote de prioridad individual excluye participaciones y tareas compartidas', async () => {
  const { individualPriorityCards } = await api();
  assert.equal(typeof individualPriorityCards, 'function');
  const individual = { id: 'individual' };
  assert.deepEqual(individualPriorityCards([individual, fixture(), { id: 'card', participation: { memberId: 'ana' } }]), [individual]);
});

test('el enlace de tarea aplica bloqueos a la participación abierta o propia, nunca al estado global ajeno', async () => {
  const { projectTaskParticipations, taskCardForDeepLink } = await api();
  assert.equal(typeof taskCardForDeepLink, 'function');
  const cards = projectTaskParticipations([fixture(), { id: 'single' }]);
  assert.equal(taskCardForDeepLink(cards, 'task-one', null, 'user-ana').status, 'REALIZADA');
  assert.equal(taskCardForDeepLink(cards, 'task-one', 'luis', 'user-ana').status, 'EN_CURSO');
  assert.equal(taskCardForDeepLink(cards, 'single', null, 'user-ana').id, 'single');
});

test('al entrar a una columna individual el ancla salta tarjetas compartidas sin incluirlas en la prioridad', async () => {
  const { individualPriorityAnchor } = await api();
  assert.equal(typeof individualPriorityAnchor, 'function');
  const cards = [fixture(), { id: 'second' }, fixture(), { id: 'fourth' }];
  assert.equal(individualPriorityAnchor(cards, 0), 'second');
  assert.equal(individualPriorityAnchor(cards, 2), 'fourth');
  assert.equal(individualPriorityAnchor(cards, 4), null);
});
