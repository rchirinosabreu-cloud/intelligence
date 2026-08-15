import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildPersonalDashboard,
  buildContextChallengeTaskWhere,
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
  createdAt: overrides.createdAt || fixedNow,
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
    requester: { role: 'ADMIN', userId: 'user-admin' },
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
  assert.equal(writes[0].payload.data.authorId, 'user-admin');
  assert.match(writes[0].payload.data.content, /🚀/);
  assert.doesNotMatch(writes[0].payload.data.content, /script|alert\(1\)/i);
  assert.equal(writes[1].payload.data.userId, 'user-helen');
  assert.equal(writes[1].payload.data.type, 'TEAM_ANNOUNCEMENT');
  assert.equal(writes[1].payload.data.relatedId, 'user-rodny');
  assert.match(writes[1].payload.data.message, /<em>personal<\/em>/);
});

test('global dashboard announcements create a notification for each active teammate except the author', async () => {
  const notifications = [];
  const db = {
    globalAnnouncement: {
      create: async (payload) => ({ id: 'global-created', ...payload.data })
    },
    user: {
      findMany: async () => [
        { id: 'user-admin' },
        { id: 'user-helen' },
        { id: 'user-francisco' }
      ]
    }
  };

  await createDashboardAnnouncement({
    requester: { role: 'ADMIN', userId: 'user-admin' },
    scope: 'GLOBAL',
    content: '<p>Reunion general a las 4:00 p. m.</p>'
  }, {
    db,
    notificationCreator: async (data) => notifications.push(data)
  });

  assert.deepEqual(notifications.map(({ userId }) => userId), ['user-helen', 'user-francisco']);
  assert.ok(notifications.every(({ type }) => type === 'ANNOUNCEMENT_GLOBAL'));
  assert.ok(notifications.every(({ relatedId }) => relatedId === 'global-created'));
});

test('global announcements keep an optional author relation for role-based challenges', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const model = schema.match(/model GlobalAnnouncement \{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(model, /authorId\s+String\?/);
  assert.match(model, /author\s+User\?/);
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
          creatorId: 'user-1',
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
  assert.equal(dashboard.todayTasks.length, 0, 'Returned corrections must stay out of the normal due-today queue.');
  assert.equal(dashboard.returnedTasks[0].lastFeedback, 'Hace falta aterrizar el CTA.');
  assert.deepEqual(dashboard.clients, [], 'Non-community-manager dashboards should not expose a client widget payload.');
});

test('buildPersonalDashboard attributes returned work to the creator instead of the reviewer who returned it', () => {
  const returnedTask = makeTask({
    id: 'returned-to-jarlan',
    title: 'Corregir pieza devuelta',
    status: 'DEVUELTA',
    creatorId: 'user-jarlan',
    assigneeId: 'member-rodny',
    dueDate: new Date('2026-08-01T12:00:00.000Z')
  });

  const rodnyDashboard = buildPersonalDashboard({
    now: fixedNow,
    member: {
      id: 'member-rodny',
      userId: 'user-rodny',
      name: 'Rodny',
      role: 'Project Manager',
      nativeTasks: [returnedTask],
      returnedTasks: []
    }
  });

  const jarlanDashboard = buildPersonalDashboard({
    now: fixedNow,
    member: {
      id: 'member-jarlan',
      userId: 'user-jarlan',
      name: 'Jarlan',
      role: 'Disenador',
      nativeTasks: [],
      returnedTasks: [returnedTask]
    }
  });

  assert.equal(rodnyDashboard.stats.returned, 0);
  assert.equal(rodnyDashboard.stats.overdue, 0, 'Returned corrections must not also inflate the reviewer overdue count.');
  assert.equal(rodnyDashboard.focusCards.some(({ id }) => id === 'returned-focus'), false);
  assert.equal(jarlanDashboard.stats.returned, 1);
  assert.equal(jarlanDashboard.stats.overdue, 0, 'Returned corrections have their own category and must not be counted twice.');
  assert.equal(jarlanDashboard.returnedTasks[0].id, 'returned-to-jarlan');
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

test('buildPersonalDashboard leaves the weekly challenge empty for non-community-manager roles', () => {
  const dashboard = buildPersonalDashboard({
    now: fixedNow,
    member: {
      id: 'member-1',
      userId: 'user-1',
      name: 'Sara Brain',
      role: 'Diseñador gráfico',
      avatarUrl: null,
      nativeTasks: [
        makeTask({ id: 'open-1', title: 'Coordinar pauta', dueDate: new Date('2026-08-09T12:00:00.000Z'), taskComments: [] }),
        makeTask({ id: 'open-2', title: 'Revisar informe', dueDate: new Date('2026-08-10T12:00:00.000Z'), taskComments: [] })
      ]
    }
  });

  assert.equal(dashboard.weeklyHabit.id, 'no-weekly-challenge');
  assert.equal(dashboard.weeklyHabit.isEmpty, true);
  assert.match(dashboard.weeklyHabit.title.normalize('NFD').replace(/\p{Diacritic}/gu, ''), /aun no tienes retos/i);
  assert.equal(dashboard.weeklyHabit.progress, null);
  assert.equal(dashboard.focusCards.some((card) => card.id === 'habit-document-progress'), false);
});

test('buildPersonalDashboard gives project managers a daily announcement challenge', () => {
  const dashboard = buildPersonalDashboard({
    now: new Date('2026-08-12T15:00:00.000Z'),
    member: {
      id: 'member-pm',
      userId: 'user-pm',
      name: 'Paula PM',
      role: 'Project Manager',
      avatarUrl: null,
      nativeTasks: [],
      authoredAnnouncements: [
        { id: 'global-mon', scope: 'GLOBAL', createdAt: new Date('2026-08-10T14:00:00.000Z') },
        { id: 'member-tue', scope: 'MEMBER', createdAt: new Date('2026-08-11T15:00:00.000Z') },
        { id: 'member-tue-2', scope: 'MEMBER', createdAt: new Date('2026-08-11T18:00:00.000Z') },
        { id: 'previous-week', scope: 'GLOBAL', createdAt: new Date('2026-08-07T14:00:00.000Z') }
      ]
    }
  });

  assert.equal(dashboard.weeklyHabit.id, 'daily-team-announcement');
  assert.equal(dashboard.weeklyHabit.progress, 40);
  assert.equal(dashboard.weeklyHabit.targetLabel, '2 de 5 días con anuncio');
  assert.match(dashboard.weeklyHabit.description, /general o personal/i);
});

test('buildPersonalDashboard gives accountants a weekly operational calendar challenge', () => {
  const dashboard = buildPersonalDashboard({
    now: fixedNow,
    member: {
      id: 'member-accountant',
      userId: 'user-accountant',
      name: 'Elisa Contadora',
      role: 'Contadora',
      avatarUrl: null,
      nativeTasks: [],
      authoredOperationalEvents: [
        { id: 'event-mon-1', createdAt: new Date('2026-08-03T14:00:00.000Z') },
        { id: 'event-mon-2', createdAt: new Date('2026-08-03T18:00:00.000Z') },
        { id: 'event-mon-extra', createdAt: new Date('2026-08-03T20:00:00.000Z') },
        { id: 'event-tue-1', createdAt: new Date('2026-08-04T15:00:00.000Z') },
        { id: 'event-saturday', createdAt: new Date('2026-08-08T15:00:00.000Z') },
        { id: 'previous-week', createdAt: new Date('2026-07-31T15:00:00.000Z') },
        { id: 'next-week', createdAt: new Date('2026-08-10T15:00:00.000Z') }
      ]
    }
  });

  assert.equal(dashboard.weeklyHabit.id, 'weekly-operational-calendar');
  assert.equal(dashboard.weeklyHabit.title, 'Registrar 10 eventos en el calendario');
  assert.equal(dashboard.weeklyHabit.progress, 30);
  assert.equal(dashboard.weeklyHabit.targetLabel, '3 de 10 eventos registrados esta semana');
  assert.match(dashboard.weeklyHabit.description, /dos eventos por d[ií]a h[aá]bil/i);
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
      createdTasks: [
        makeTask({
          id: 'created-without-context',
          title: 'Brief campana Q3',
          creatorId: 'user-cm',
          assigneeId: 'member-other',
          status: 'PENDIENTE',
          createdAt: new Date('2026-08-07T12:00:00.000Z'),
          dueDate: new Date('2026-08-09T12:00:00.000Z'),
          taskComments: []
        }),
        makeTask({
          id: 'created-with-context',
          title: 'Propuesta de campana',
          creatorId: 'user-cm',
          assigneeId: 'member-other',
          status: 'PENDIENTE',
          createdAt: new Date('2026-08-06T12:00:00.000Z'),
          dueDate: new Date('2026-08-09T12:00:00.000Z'),
          taskComments: [{ content: 'Objetivo, audiencia y siguiente paso.', authorId: 'user-cm', createdAt: fixedNow }]
        }),
        makeTask({
          id: 'july-without-context',
          title: 'Tarea anterior',
          creatorId: 'user-cm',
          status: 'PENDIENTE',
          createdAt: new Date('2026-07-31T12:00:00.000Z'),
          taskComments: []
        }),
        makeTask({
          id: 'in-progress-without-context',
          title: 'Tarea ya iniciada',
          creatorId: 'user-cm',
          status: 'EN_CURSO',
          createdAt: new Date('2026-08-05T12:00:00.000Z'),
          taskComments: []
        }),
        makeTask({
          id: 'completed-with-context',
          title: 'Tarea completada esta semana',
          creatorId: 'user-cm',
          status: 'REALIZADA',
          createdAt: new Date('2026-08-04T12:00:00.000Z'),
          taskComments: [{ content: '<p>Entregar el reporte con hallazgos y próximos pasos.</p>', authorId: 'user-cm', type: 'human', createdAt: fixedNow }]
        }),
        makeTask({
          id: 'returned-with-external-comment',
          title: 'Tarea devuelta con comentario ajeno',
          creatorId: 'user-cm',
          status: 'DEVUELTA',
          createdAt: new Date('2026-08-03T12:00:00.000Z'),
          taskComments: [{ content: 'Debes ajustar el formato.', authorId: 'reviewer-user', type: 'human', createdAt: fixedNow }]
        })
      ],
      nativeTasks: [
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
  assert.equal(dashboard.weeklyHabit.id, 'keep-context-fresh');
  assert.equal(dashboard.weeklyHabit.progress, 40);
  assert.equal(dashboard.weeklyHabit.targetLabel, '2 de 5 tareas creadas esta semana con contexto');
  assert.match(dashboard.weeklyHabit.description, /esta semana/i);
  assert.equal(habitCard.type, 'HABITO');
  assert.match(habitCard.content, /3 tareas/);
  assert.equal(habitCard.items.length, 3);
  assert.equal(habitCard.items[0].id, 'created-without-context');
  assert.deepEqual(
    habitCard.items.map((task) => task.id),
    ['created-without-context', 'in-progress-without-context', 'returned-with-external-comment'],
    'Changing status or receiving a reviewer comment must not distort the creator context challenge.'
  );
});

test('community manager context challenge queries the current Bogota week without filtering by status', () => {
  assert.deepEqual(buildContextChallengeTaskWhere({
    userId: 'user-cm',
    now: fixedNow
  }), {
    creatorId: 'user-cm',
    createdAt: {
      gte: new Date('2026-08-03T05:00:00.000Z'),
      lt: new Date('2026-08-10T05:00:00.000Z')
    }
  });
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
      createdTasks: [],
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
  assert.equal(dashboard.weeklyHabit.id, 'keep-context-fresh');
  assert.match(dashboard.weeklyHabit.title, /contexto/i);
  assert.equal(dashboard.weeklyHabit.progress, null);
  assert.equal(dashboard.weeklyHabit.targetLabel, 'Aún no has creado tareas esta semana');
  assert.equal(dashboard.focusCards.some((card) => card.id === 'cm-client-health'), true);
  assert.equal(dashboard.focusCards.some((card) => card.id === 'cm-content-plan'), true);
  assert.ok(dashboard.focusCards.find((card) => card.id === 'cm-client-health').items.length > 0);
});
