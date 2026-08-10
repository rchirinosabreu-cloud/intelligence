import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersonalDashboard,
  assertPersonalDashboardAccess,
  assertDashboardManagerAccess,
  createDashboardAnnouncement,
  deleteDashboardAnnouncement,
  getDashboardAnnouncements,
  updateDashboardAnnouncement
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

test('dashboard announcement history only queries personal announcements for the requested user', async () => {
  const queries = [];
  const db = {
    globalAnnouncement: {
      findMany: async (query) => {
        queries.push({ model: 'global', query });
        return [
          { id: 'global-1', content: '<p>Mensaje general</p>', type: 'DASHBOARD', createdAt: new Date('2026-08-08T13:00:00.000Z') }
        ];
      }
    },
    notification: {
      findMany: async (query) => {
        queries.push({ model: 'notification', query });
        return [
          {
            id: 'member-1',
            message: '<p>Mensaje personal</p>',
            type: 'TEAM_ANNOUNCEMENT',
            createdAt: new Date('2026-08-08T14:00:00.000Z'),
            isRead: false,
            relatedId: 'user-rodny'
          }
        ];
      }
    },
    user: {
      findMany: async (query) => {
        queries.push({ model: 'user', query });
        return [{ id: 'user-rodny', name: 'Rodny Chirinos', avatarUrl: '/rodny.jpg' }];
      }
    }
  };

  const announcements = await getDashboardAnnouncements('user-helen', { db });

  assert.deepEqual(queries[1].query.where, {
    userId: 'user-helen',
    type: 'TEAM_ANNOUNCEMENT'
  });
  assert.equal(queries[0].query.take, 50);
  assert.equal(queries[1].query.take, 50);
  assert.equal(announcements.length, 2);
  assert.equal(announcements[0].scope, 'MEMBER');
  assert.deepEqual(announcements[0].author, {
    id: 'user-rodny',
    name: 'Rodny Chirinos',
    avatarUrl: '/rodny.jpg'
  });
  assert.equal(announcements[1].scope, 'GLOBAL');
});

test('dashboard announcements preserve safe rich text and target only the selected person', async () => {
  const writes = [];
  const db = {
    globalAnnouncement: {
      create: async (payload) => {
        writes.push({ model: 'global', payload });
        return { id: 'global-created', ...payload.data };
      }
    },
    notification: {
      create: async (payload) => {
        writes.push({ model: 'notification', payload });
        return { id: 'member-created', ...payload.data };
      }
    }
  };

  await createDashboardAnnouncement({
    requester: { role: 'ADMIN' },
    scope: 'GLOBAL',
    content: '<p>Hola <strong>equipo</strong> 🚀<script>alert(1)</script></p>'
  }, { db });
  await createDashboardAnnouncement({
    requester: { role: 'PROJECT_MANAGER', userId: 'user-rodny' },
    scope: 'MEMBER',
    targetUserId: 'user-helen',
    content: '<p>Mensaje <em>personal</em></p>'
  }, { db });

  assert.match(writes[0].payload.data.content, /<strong>equipo<\/strong>/);
  assert.match(writes[0].payload.data.content, /🚀/);
  assert.doesNotMatch(writes[0].payload.data.content, /script|alert\(1\)/i);
  assert.equal(writes[1].payload.data.userId, 'user-helen');
  assert.equal(writes[1].payload.data.type, 'TEAM_ANNOUNCEMENT');
  assert.equal(writes[1].payload.data.relatedId, 'user-rodny');
  assert.match(writes[1].payload.data.message, /<em>personal<\/em>/);
});

test('only admins and project managers can edit and delete dashboard announcements', async () => {
  const writes = [];
  const db = {
    globalAnnouncement: {
      update: async (payload) => {
        writes.push({ action: 'update-global', payload });
        return { id: payload.where.id, ...payload.data };
      },
      delete: async (payload) => {
        writes.push({ action: 'delete-global', payload });
        return { id: payload.where.id };
      }
    },
    notification: {
      findFirst: async (payload) => {
        writes.push({ action: 'find-member', payload });
        return { id: payload.where.id, type: 'TEAM_ANNOUNCEMENT' };
      },
      update: async (payload) => {
        writes.push({ action: 'update-member', payload });
        return { id: payload.where.id, ...payload.data };
      },
      delete: async (payload) => {
        writes.push({ action: 'delete-member', payload });
        return { id: payload.where.id };
      }
    }
  };

  await assert.rejects(
    updateDashboardAnnouncement({
      requester: { role: 'MEMBER' },
      scope: 'GLOBAL',
      id: 'global-1',
      content: '<p>No autorizado</p>'
    }, { db }),
    /Solo administradores o project managers/
  );

  await updateDashboardAnnouncement({
    requester: { role: 'PROJECT_MANAGER' },
    scope: 'MEMBER',
    id: 'member-1',
    content: '<p>Mensaje <strong>actualizado</strong><script>bad()</script></p>'
  }, { db });
  await deleteDashboardAnnouncement({
    requester: { role: 'ADMIN' },
    scope: 'GLOBAL',
    id: 'global-1'
  }, { db });

  assert.deepEqual(writes[0].payload.where, { id: 'member-1', type: 'TEAM_ANNOUNCEMENT' });
  assert.match(writes[1].payload.data.message, /<strong>actualizado<\/strong>/);
  assert.doesNotMatch(writes[1].payload.data.message, /script|bad\(\)/i);
  assert.deepEqual(writes[2], {
    action: 'delete-global',
    payload: { where: { id: 'global-1' } }
  });
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
  assert.deepEqual(dashboard.clients, [], 'Non-community-manager dashboards should not expose a client widget payload.');
});

test('buildPersonalDashboard keeps the achievement feed global and the daily stat personal', () => {
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
      nativeTasks: [
        makeTask({
          id: 'personal-done-yesterday',
          title: 'Entrega personal anterior',
          status: 'REALIZADA',
          completedAt: new Date('2026-08-07T15:00:00.000Z'),
          assignee: { id: 'member-1', name: 'Sara Brain', role: 'Project Manager', avatarUrl: null }
        })
      ]
    }
  });

  assert.equal(dashboard.achievements.length, 2);
  assert.equal(dashboard.achievements[0].id, 'global-done-1');
  assert.equal(dashboard.achievements[0].assignee.name, 'Helen Hernandez');
  assert.equal(dashboard.stats.completedToday, 0);
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
