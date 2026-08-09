import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPersonalDashboard, assertAdminDashboardAccess } from '../src/services/personalDashboardService.js';

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
  updatedAt: overrides.updatedAt || fixedNow,
  client: overrides.client || { id: 'client-1', name: 'Cliente Uno', slug: 'cliente-uno', logoUrl: null, healthRecords: [{ score: 72 }] },
  taskComments: overrides.taskComments || []
});

test('personal dashboard access is restricted to admins', () => {
  assert.throws(
    () => assertAdminDashboardAccess({ role: 'PROJECT_MANAGER' }),
    /Solo administradores/
  );
  assert.throws(
    () => assertAdminDashboardAccess({ role: 'EDITOR' }),
    /Solo administradores/
  );
  assert.doesNotThrow(() => assertAdminDashboardAccess({ role: 'ADMIN' }));
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

  assert.equal(dashboard.weeklyHabit.id, 'document-progress');
  assert.equal(dashboard.focusCards.some((card) => card.type === 'HABITO'), true);
});
