import test from 'node:test';
import assert from 'node:assert/strict';
const service = await import('../src/services/taskParticipationService.js').catch(() => ({}));
const task = { id: 'one', status: 'PENDIENTE', sharedProgress: true, rosterVersion: 3,
  creatorId: 'creator', assigneeId: 'member', assigneeStatus: 'PENDIENTE', assigneeRevision: 2,
  assignee: { id: 'member', userId: 'owner', isActive: true }, collaborators: [], workSessions: [] };
const run = (payload, user = { userId: 'owner', role: 'DESIGNER' }, value = task) => {
  assert.equal(typeof service.changeTaskParticipation, 'function');
  return service.changeTaskParticipation({ db: { task: { findUnique: async () => value } },
    transaction: work => work({ task: { findUnique: async () => value } }), taskId: 'one', memberId: 'member', user, payload });
};
test('una revisión antigua no cambia estados ni relojes', async () => {
  await assert.rejects(() => run({ status: 'EN_CURSO', expectedRevision: 1, expectedRosterVersion: 3 }), e => e.statusCode === 409);
});
test('la revisión del equipo protege ante retirada y reincorporación', async () => {
  await assert.rejects(() => run({ status: 'EN_CURSO', expectedRevision: 2, expectedRosterVersion: 2 }), e => e.statusCode === 409);
});
test('no mezcla ediciones comunes con permiso personal', async () => {
  await assert.rejects(() => run({ status: 'EN_CURSO', expectedRevision: 2, expectedRosterVersion: 3, assigneeId: 'another' }), e => e.statusCode === 400);
});
test('un compañero no puede cerrar la participación ajena', async () => {
  await assert.rejects(() => run({ status: 'REALIZADA', expectedRevision: 2, expectedRosterVersion: 3 }, { userId: 'peer', role: 'DESIGNER' }), e => e.statusCode === 403);
});

test('la cabecera legada conserva su reloj con inicio conocido aunque aún no haya tramos', async () => {
  const { hydrateTaskParticipations } = await import('../src/services/taskParticipationStore.js');
  const startedAt = new Date('2026-11-05T14:00:00Z');
  const legacy = { ...task, assigneeStatus: null, status: 'EN_CURSO', startedAt, accumulatedWorkMs: 90000 };
  const [view] = await hydrateTaskParticipations({ taskWorkSession: { groupBy: async () => [] }, taskParticipationArchive: { groupBy: async () => [] } }, [legacy], { id: 'owner' });
  assert.equal(view.participants[0].startedAt, startedAt);
  assert.equal(view.participants[0].accumulatedWorkMs, 90000);
});

test('un responsable legado no hereda las horas registradas de quien lo precedió', async () => {
  const { hydrateTaskParticipations } = await import('../src/services/taskParticipationStore.js');
  const legacy = { ...task, assigneeStatus: null, accumulatedWorkMs: 3600000 };
  const [view] = await hydrateTaskParticipations({ taskWorkSession: { groupBy: async () => [
    { taskId: task.id, workerId: 'previous', isCollaborator: false, _sum: { durationMs: 3600000 } }
  ] }, taskParticipationArchive: { groupBy: async () => [] } }, [legacy], { id: 'owner' });
  assert.equal(view.participants[0].accumulatedWorkMs, 0);
});
