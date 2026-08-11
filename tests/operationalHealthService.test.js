import test from 'node:test';
import assert from 'node:assert/strict';

const service = await import('../src/services/operationalHealthService.js').catch(() => ({}));

test('operational health is restricted to administrators', () => {
  assert.equal(typeof service.assertOperationalHealthAccess, 'function');
  assert.doesNotThrow(() => service.assertOperationalHealthAccess({ role: 'ADMIN' }));
  assert.throws(
    () => service.assertOperationalHealthAccess({ role: 'PROJECT_MANAGER' }),
    (error) => error?.statusCode === 403
  );
});

test('operational health turns real work into adoption, quality and actionable issues', () => {
  assert.equal(typeof service.buildOperationalHealthSnapshot, 'function');

  const snapshot = service.buildOperationalHealthSnapshot({
    now: new Date('2026-08-12T15:00:00.000Z'),
    users: [
      { id: 'u1', name: 'Ana', role: 'EDITOR', isActive: true, teamMember: { id: 'm1' } },
      { id: 'u2', name: 'Luis', role: 'EDITOR', isActive: true, teamMember: { id: 'm2' } },
      { id: 'u3', name: 'Sara', role: 'PROJECT_MANAGER', isActive: true, teamMember: { id: 'm3' } },
      { id: 'u4', name: 'Meli', role: 'VIEWER', isActive: true, teamMember: { id: 'm4' } }
    ],
    tasks: [
      {
        id: 't1', title: 'Redactar propuesta', status: 'PENDIENTE', creatorId: 'u1',
        createdAt: new Date('2026-08-11T14:00:00.000Z'), dueDate: null, assigneeId: null,
        comments: '', taskComments: [], client: { id: 'c1', name: 'Cliente Uno' }
      },
      {
        id: 't2', title: 'Revisar parrilla', status: 'EN_CURSO', creatorId: 'u2',
        createdAt: new Date('2026-08-10T16:00:00.000Z'), dueDate: new Date('2026-08-15T17:00:00.000Z'),
        assigneeId: 'm2', comments: 'Objetivo y referencias', taskComments: [{ id: 'tc1' }],
        client: { id: 'c2', name: 'Cliente Dos' }
      },
      {
        id: 't3', title: 'Pendiente vencido', status: 'PENDIENTE', creatorId: 'u1',
        createdAt: new Date('2026-08-08T14:00:00.000Z'), dueDate: new Date('2026-08-08T17:00:00.000Z'),
        assigneeId: 'm1', comments: 'Contexto', taskComments: [], client: { id: 'c1', name: 'Cliente Uno' }
      }
    ],
    taskComments: [
      { id: 'tc1', authorId: 'u2', createdAt: new Date('2026-08-11T18:00:00.000Z'), type: 'human' }
    ],
    operationalEvents: [
      { id: 'e1', createdById: 'u3', createdAt: new Date('2026-08-12T13:00:00.000Z') }
    ],
    contentPlans: [
      { id: 'p1', ownerId: 'm1', createdAt: new Date('2026-08-11T12:00:00.000Z') }
    ],
    contentItems: [],
    quotations: [
      { id: 'q1', created_at: new Date('2026-08-12T12:00:00.000Z') }
    ],
    globalAnnouncements: [],
    targetedAnnouncements: [],
    flowMessages: [],
    clients: [
      { id: 'c1', name: 'Cliente Uno', slug: 'cliente-uno', isArchived: false, responsibleId: null, logoUrl: null, aiInstructions: null },
      { id: 'c2', name: 'Cliente Dos', slug: 'cliente-dos', isArchived: false, responsibleId: 'm2', logoUrl: '/logo.png', aiInstructions: 'Contexto de marca' }
    ]
  });

  assert.deepEqual(snapshot.adoption, {
    activeUsers: 3,
    totalUsers: 4,
    rate: 75,
    previousActiveUsers: 1,
    trend: 200
  });
  assert.equal(snapshot.quality.tasksWithoutAssignee, 1);
  assert.equal(snapshot.quality.tasksWithoutDate, 1);
  assert.equal(snapshot.quality.tasksWithoutContext, 1);
  assert.equal(snapshot.quality.overdueTasks, 1);
  assert.equal(snapshot.clients.incomplete, 1);
  assert.ok(snapshot.score >= 0 && snapshot.score <= 100);
  assert.ok(snapshot.modules.some((module) => module.id === 'gestion' && module.current > 0));
  assert.ok(snapshot.modules.some((module) => module.id === 'cotizaciones' && module.current === 1));

  const missingAssignee = snapshot.issues.find((issue) => issue.id === 'tasks-without-assignee');
  assert.equal(missingAssignee.count, 1);
  assert.equal(missingAssignee.items[0].url, '/gestion?taskId=t1');

  const incompleteClients = snapshot.issues.find((issue) => issue.id === 'incomplete-clients');
  assert.equal(incompleteClients.items[0].url, '/cliente/c1');
});

test('Bogota week windows begin on Monday and include the previous week', () => {
  assert.equal(typeof service.getBogotaWeekWindows, 'function');
  const windows = service.getBogotaWeekWindows(new Date('2026-08-12T15:00:00.000Z'));

  assert.equal(windows.current.start.toISOString(), '2026-08-10T05:00:00.000Z');
  assert.equal(windows.current.end.toISOString(), '2026-08-17T05:00:00.000Z');
  assert.equal(windows.previous.start.toISOString(), '2026-08-03T05:00:00.000Z');
  assert.equal(windows.previous.end.toISOString(), '2026-08-10T05:00:00.000Z');
});
