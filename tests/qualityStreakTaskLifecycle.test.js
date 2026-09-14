import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/lib/prisma.js';

process.env.NODE_ENV = 'test';
const { auditAndDeleteTask, deleteTask } = await import('../src/services/nativeTaskService.js');

for (const audited of [true, false]) {
  test(`${audited ? 'audited' : 'plain'} task deletion starts a new clean period at zero`, async t => {
    const now = new Date('2026-09-14T18:00:00Z');
    t.mock.timers.enable({ apis: ['Date'], now });
    let task = { id: 'returned', title: 'Returned task', clientId: null, assigneeId: null, status: 'DEVUELTA' };
    let streak = { id: 'global', currentStreak: 3, highestStreak: 10, trackingStartedAt: now, cleanSinceAt: new Date('2026-09-10T18:00:00Z') };
    const originals = [];
    const replace = (object, key, value) => { originals.push(() => { object[key] = value; }); object[key] = value; };
    t.after(() => originals.reverse().forEach(restore => restore()));
    const tx = Object.create(prisma);
    Object.defineProperty(tx, '$transaction', { value: undefined });
    replace(prisma, '$transaction', async work => work(tx));
    replace(prisma, '$executeRaw', async () => 1);
    replace(prisma.task, 'findUnique', async () => task);
    replace(prisma.task, 'count', async () => task?.status === 'DEVUELTA' ? 1 : 0);
    replace(prisma.task, 'delete', async () => { const deleted = task; task = null; return deleted; });
    replace(prisma.recognitionTaskState, 'upsert', async () => ({ originalDueDate: null }));
    replace(prisma.deletedTaskLog, 'create', async ({ data }) => data);
    replace(prisma.systemStreak, 'findUnique', async () => streak);
    replace(prisma.systemStreak, 'update', async ({ data }) => (streak = { ...streak, ...data }));
    await (audited ? auditAndDeleteTask('returned', 'Tarea cancelada') : deleteTask('returned'));
    assert.equal(task, null);
    assert.equal(streak.currentStreak, 0);
    assert.equal(streak.cleanSinceAt.toISOString(), now.toISOString());
    assert.equal(streak.highestStreak, 10);
  });
}
