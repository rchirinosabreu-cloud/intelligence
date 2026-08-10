import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersonalDashboard,
  assertPersonalDashboardAccess,
  assertDashboardManagerAccess
} from '../src/services/personalDashboardService.js';

const fixedNow = new Date('2026-08-08T15:00:00.000Z');

const makeTask = (overrides = {}) => ({
  id: overrides.id || 'task-1',
  title: overrides.title || 'Preparar entregable',
  status: overrides.status || 'PENDIENTE',
  dueDate: overrides.dueDate === undefined ? fixedNow : overrides.dueDate,
  completedAt: overrides.completedAt || null,
  isPriority: overrides.isPriority || false,
  priority: overrides.priority || null,
  isSpecial: overrides.isSpecial || false,
  creatorId: overrides.creatorId || null,
  assigneeId: overrides.assigneeId || null,
  assignee: overrides.assignee || null,
  updatedAt: overrides.updatedAt || fixedNow,
  client: overrides.client || { id: 'client-1', name: 'Cliente Uno', slug: 'cliente-uno', logoUrl: null, healthRecords: [{ score: 72 }] },
  taskComments: overrides.taskComments || []
});

test('personal dashboard access allows own dashboard and restricts other dashboards to admins', () => {
  assert.doesNotThrow(() => assertPersonalDashboardAccess({
    requester: { role: 'PROJECT_MANAGER', userId: 'pm-1' },
    targetUserId: 'pm-1'
  }));
  assert.doesNotThrow(() => assertPersonalDashboardAccess({
    requester: { role: 'MEMBER', userId: 'member-1' },
    targetUserId: 'member-1'
  }));
  assert.throws(
    () => assertPersonalDashboardAccess({
      requester: { role: 'PROJECT_MANAGER', userId: 'pm-1' },
      targetUserId: 'member-1'
    }),
    /Solo administradores/
  );
  assert.doesNotThrow(() => assertPersonalDashboardAccess({
    requester: { role: 'ADMIN', userId: 'admin-1' },
    targetUserId: 'member-1'
  }));
});

test('dashboard management access is limited to admins and project managers', () => {
  assert.doesNotThrow(() => assertDashboardManagerAccess({ role: 'ADMIN' }));
  assert.doesNotThrow(() => assertDashboardManagerAccess({ role: 'PROJECT_MANAGER' }));
  assert.throws(
    () => assertDashboardManagerAccess({ role: 'MEMBER' }),
    /Solo administradores o project managers/
  );
});

test('buildPersonalDashboard returns actionable focus cards for overdue and returned work', () => {
  const dashboard = buildPersonalDashboard({
    now: fixedNow,
    member: {
      id: 'member-1',
      userId: 'user-1',
      name: 'Sara Brain',
      role: 'Diseñadora',
      avatarUrl: null,
      nativeTasks: [
        makeTask({
          id: 'overdue-1',
          title: 'Cerrar carrusel',
          dueDate: new Date('2026-08-07T12:00:00.000Z'),
          isPriority: true
        }),
        makeTask({
          id: 'returned-1',
          title: 'Ajustar copy',
          status: 'DEVUELTA',
          dueDate: new Date('2026-08-08T18:00:00.000Z'),
          taskComments: [{ content: 'Hace falta aterrizar el CTA.', authorId: 'pm-1', createdAt: fixedNow }]
        }),
        makeTask({
          id: 'done-1',
          title: 'Publicar reel',
          status: 'REALIZADA',
          completedAt: new Date('2026-08-08T14:00:00.000Z')
        })
      ]
    }
  });

  assert.equal(dashboard.member.name, 'Sara Brain');
  assert.equal(dashboard.stats.overdue, 1);
  assert.equal(dashboard.stats.returned, 1);
  assert.equal(dashboard.stats.completedToday, 1);
  assert.equal(dashboard.focusCards[0].type, 'URGENTE');
  assert.match(dashboard.focusCards[0].title, /tarea vencida/);
  assert.equal(dashboard.focusCards[1].type, 'BLOQUEO');
  assert.match(dashboard.focusCards[1].title, /correcci/);
  assert.equal(dashboard.todayTasks.length, 1);
  assert.equal(dashboard.returnedTasks[0].lastFeedback, 'Hace falta aterrizar el CTA.');
});

test('buildPersonalDashboard accepts global achievements history apart from selected member tasks', () => {
  const dashboard = buildPersonalDashboard({
    now: fixedNow,
    globalAchievements: [
      makeTask({
        id: 'global-done-1',
        title: 'Campana lanzada',
        status: 'REALIZADA',
        completedAt: new Date('2026-08-08T13:00:00.000Z'),
        assignee: { id: 'member-other', name: 'Helen Hernandez', role: 'Community Manager', avatarUrl: null }
      }),
      makeTask({
        id: 'global-done-2',
        title: 'Reporte cerrado',
        status: 'REALIZADA',
        completedAt: new Date('2026-08-07T13:00:00.000Z'),
        assignee: { id: 'member-pm', name: 'Rodny', role: 'Project Manager', avatarUrl: null }
      })
    ],
    member: {
      id: 'member-1',
      userId: 'user-1',
      name: 'Sara Brain',
      role: 'Project Manager',
      avatarUrl: null,
      nativeTasks: []
    }
  });

  assert.equal(dashboard.achievements.length, 2);
  assert.equal(dashboard.achievements[0].id, 'global-done-1');
  assert.equal(dashboard.achievements[0].assignee.name, 'Helen Hernandez');
  assert.equal(dashboard.stats.completedToday, 1);
});

test('buildPersonalDashboard recommends a documentation habit when assigned work lacks comments', () => {
  const dashboard = buildPersonalDashboard({
    now: fixedNow,
    member: {
      id: 'member-1',
      userId: 'user-1',
      name: 'Sara Brain',
      role: 'Project Manager',
      avatarUrl: null,
      nativeTasks: [
        makeTask({ id: 'open-1', title: 'Coordinar pauta', dueDate: new Date('2026-08-09T12:00:00.000Z'), taskComments: [] }),
        makeTask({ id: 'open-2', title: 'Revisar informe', dueDate: new Date('2026-08-10T12:00:00.000Z'), taskComments: [] })
      ]
    }
  });

  assert.notEqual(dashboard.weeklyHabit.id, 'document-progress');
  assert.equal(dashboard.focusCards.some((card) => card.id === 'habit-document-progress'), false);
});

test('buildPersonalDashboard only asks community managers to document tasks they created', () => {
  const dashboard = buildPersonalDashboard({
    now: fixedNow,
    member: {
      id: 'member-cm',
      userId: 'user-cm',
      name: 'Camila CM',
      role: 'Community Manager',
      avatarUrl: null,
      responsibleClients: [
        {
          id: 'client-1',
          name: 'Marca Norte',
          slug: 'marca-norte',
          logoUrl: null,
          healthRecords: [{ score: 86, contentStatus: 'APROBADA', reportStatus: 'COMPLETA' }],
          contentPlans: [{ id: 'plan-1', status: 'ACTIVO', month: 8, year: 2026, updatedAt: fixedNow }],
          nativeTasks: []
        }
      ],
      nativeTasks: [
        makeTask({
          id: 'created-without-context',
          title: 'Brief campana Q3',
          creatorId: 'user-cm',
          assigneeId: 'member-other',
          dueDate: new Date('2026-08-09T12:00:00.000Z'),
          taskComments: []
        }),
        makeTask({
          id: 'assigned-without-context',
          title: 'Diseno carrusel',
          creatorId: 'pm-user',
          assigneeId: 'member-cm',
          dueDate: new Date('2026-08-09T12:00:00.000Z'),
          taskComments: []
        })
      ]
    }
  });

  const habitCard = dashboard.focusCards.find((card) => card.id === 'habit-document-progress');
  assert.equal(habitCard.type, 'HABITO');
  assert.match(habitCard.content, /1 tarea/);
  assert.equal(habitCard.items.length, 1);
  assert.equal(habitCard.items[0].id, 'created-without-context');
});

test('buildPersonalDashboard frames community manager work around assigned clients', () => {
  const dashboard = buildPersonalDashboard({
    now: fixedNow,
    member: {
      id: 'member-cm',
      userId: 'user-cm',
      name: 'Camila CM',
      role: 'Community Manager',
      avatarUrl: null,
      responsibleClients: [
        {
          id: 'client-1',
          name: 'Marca Norte',
          slug: 'marca-norte',
          logoUrl: null,
          healthRecords: [{ score: 58, contentStatus: 'SIN_PARRILLA', reportStatus: 'EN_PROCESO' }],
          contentPlans: [],
          nativeTasks: [
            makeTask({ id: 'client-task-1', status: 'PENDIENTE', dueDate: new Date('2026-08-09T12:00:00.000Z') }),
            makeTask({ id: 'client-task-2', status: 'DEVUELTA', dueDate: new Date('2026-08-07T12:00:00.000Z') })
          ]
        },
        {
          id: 'client-2',
          name: 'Marca Sur',
          slug: 'marca-sur',
          logoUrl: null,
          healthRecords: [{ score: 86, contentStatus: 'APROBADA', reportStatus: 'COMPLETA' }],
          contentPlans: [{ id: 'plan-1', status: 'ACTIVO', month: 8, year: 2026, updatedAt: fixedNow }],
          nativeTasks: []
        }
      ],
      nativeTasks: []
    }
  });

  assert.equal(dashboard.member.isCommunityManager, true);
  assert.equal(dashboard.clients.length, 2);
  assert.equal(dashboard.clients[0].name, 'Marca Norte');
  assert.equal(dashboard.clients[0].activeTasks, 2);
  assert.equal(dashboard.weeklyHabit.id, 'lead-account-growth');
  assert.match(dashboard.weeklyHabit.title, /propuestas/i);
  assert.equal(dashboard.focusCards.some((card) => card.id === 'cm-client-health'), true);
  assert.equal(dashboard.focusCards.some((card) => card.id === 'cm-content-plan'), true);
  assert.ok(dashboard.focusCards.find((card) => card.id === 'cm-client-health').items.length > 0);
});
