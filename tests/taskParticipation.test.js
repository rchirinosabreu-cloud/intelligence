import test from 'node:test';
import assert from 'node:assert/strict';

const rules = await import('../src/lib/taskParticipation.js').catch(() => ({}));
const use = name => {
  assert.equal(typeof rules[name], 'function', `${name} debe representar participaciones sin duplicar tareas`);
  return rules[name];
};
const team = {
  id: 'task', status: 'EN_CURSO', sharedProgress: true, assigneeId: 'a', creatorId: 'creator',
  assignee: { id: 'a', userId: 'ua', name: 'Ana' }, assigneeStatus: 'REALIZADA',
  assigneeCompletedAt: '2026-11-05T15:00:00Z', assigneeRevision: 2,
  collaborators: [
    { memberId: 'b', member: { id: 'b', userId: 'ub', name: 'Bea' }, status: 'EN_CURSO', revision: 1 },
    { memberId: 'c', member: { id: 'c', userId: 'uc', name: 'Carlos' }, status: 'PENDIENTE', revision: 0 },
  ],
};

test('una tarea entrega tres participaciones con identidad, estado y fecha propios', () => {
  const rows = use('taskParticipations')(team);
  assert.deepEqual(rows.map(row => [row.memberId, row.status, row.completedAt]), [
    ['a', 'REALIZADA', team.assigneeCompletedAt], ['b', 'EN_CURSO', null], ['c', 'PENDIENTE', null],
  ]);
  assert.deepEqual(rows.map(row => row.revision), [2, 1, 0]);
  assert.equal(rows[0].role, 'ASSIGNEE');
  assert.equal(rows[1].role, 'COLLABORATOR');
});

test('el cierre global espera a todos; una devolución se mantiene visible aunque otro trabaje', () => {
  const aggregate = use('aggregateParticipationStatus');
  const status = states => aggregate(states.map(status => ({ status })));
  assert.equal(status(['REALIZADA', 'EN_CURSO', 'PENDIENTE']), 'EN_CURSO');
  assert.equal(status(['REALIZADA', 'REALIZADA', 'PENDIENTE']), 'PENDIENTE');
  assert.equal(status(['REALIZADA', 'REALIZADA', 'REALIZADA']), 'REALIZADA');
  assert.equal(status(['REALIZADA', 'DEVUELTA', 'EN_CURSO']), 'DEVUELTA');
  assert.equal(status([]), 'PENDIENTE');
});

test('los cierres legados se conservan sin inventar fechas ni logros personales', () => {
  const legacy = { ...team, sharedProgress: false, assigneeStatus: null, status: 'REALIZADA', completedAt: '2026-10-01',
    collaborators: team.collaborators.map(({ status, revision, ...row }) => row) };
  const rows = use('taskParticipations')(legacy);
  assert.ok(rows.every(row => row.status === 'REALIZADA' && row.completedAt === null && row.legacy));
  assert.equal(use('hasTaskParticipations')(legacy), true);
});

test('en tareas compartidas anteriores solo un reloj realmente abierto acredita trabajo activo', () => {
  const legacy = { ...team, sharedProgress: false, assigneeStatus: null,
    collaborators: team.collaborators.map(({ status, ...row }) => row),
    workSessions: [{ workerId: 'c', startedAt: '2026-11-05T16:00:00Z', endedAt: null }] };
  assert.deepEqual(use('taskParticipations')(legacy).map(row => row.status), ['PENDIENTE', 'PENDIENTE', 'EN_CURSO']);
});

test('una tarea individual conserva las fechas y el comportamiento anteriores', () => {
  const task = { ...team, sharedProgress: false, collaborators: [], status: 'REALIZADA', completedAt: '2026-11-03' };
  assert.equal(use('hasTaskParticipations')(task), false);
  const [row] = use('taskParticipations')(task);
  assert.equal(row.completedAt, task.completedAt);
  assert.equal(row.legacy, false);
});

test('progreso propio, intervención de dirección y acceso privado se evalúan por usuario', () => {
  const [a, b] = use('taskParticipations')(team);
  const permissions = use('participationPermissions');
  assert.equal(permissions(team, b, { userId: 'ub', role: 'EDITOR' }).canChangeStatus, true);
  assert.equal(permissions(team, a, { userId: 'ub', role: 'EDITOR' }).canChangeStatus, false);
  assert.equal(permissions(team, b, { userId: 'boss', role: 'ADMIN' }).canChangeStatus, true);
  assert.equal(permissions({ ...team, isPrivate: true }, b, { userId: 'boss', role: 'ADMIN' }).canChangeStatus, false);
  assert.equal(permissions(team, b, { userId: 'creator', role: 'EDITOR' }).canReturn, true);
  assert.equal(permissions(team, b, { userId: 'ub', role: 'EDITOR' }).canReintegrate, false);
});

test('cada camino de retorno exige su explicación sin volver a completar desde Devuelta', () => {
  const problem = use('participationTransitionProblem');
  assert.equal(problem('PENDIENTE', { status: 'EN_CURSO' }), null);
  assert.equal(problem('EN_CURSO', { status: 'REALIZADA' }), null);
  assert.ok(problem('REALIZADA', { status: 'EN_CURSO' }));
  assert.ok(problem('REALIZADA', { status: 'PENDIENTE' }));
  assert.equal(problem('REALIZADA', { status: 'PENDIENTE', reopenReason: 'CLIENT_CORRECTION', reopenNote: 'Cambiar color' }), null);
  assert.ok(problem('EN_CURSO', { status: 'DEVUELTA' }));
  assert.equal(problem('EN_CURSO', { status: 'DEVUELTA', returnReason: 'ERROR', returnNote: 'Corregir medidas' }), null);
  assert.ok(problem('DEVUELTA', { status: 'REALIZADA' }));
  assert.ok(problem('DEVUELTA', { status: 'PENDIENTE' }));
  assert.equal(problem('DEVUELTA', { status: 'EN_CURSO', reintegrateReason: 'Medidas aclaradas' }), null);
  assert.ok(problem('EN_CURSO', { status: 'INVENTADO' }));
});

test('un recibo ya normalizado conserva su selección y las personas sin volver a inferir estados', () => {
  const participants = [{ memberId: 'b', status: 'REALIZADA', completedAt: '2026-11-05', revision: 5 }];
  assert.deepEqual(use('taskParticipations')({ ...team, participants }), participants);
});
