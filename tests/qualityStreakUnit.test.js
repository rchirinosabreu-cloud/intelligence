import test from 'node:test';
import assert from 'node:assert';
import prisma from '../src/lib/prisma.js';
import { getQualityStreak, updateTask } from '../src/services/nativeTaskService.js';

test('Quality Streak Unit Tests with Prisma Mocks', async (t) => {
    // Save original update method
    const originalUpdateTask = prisma.task.update;
    const originalFindUniqueTask = prisma.task.findUnique;
    // Save original prisma methods
    const originalAggregate = prisma.task.aggregate;
    const originalFindFirstUser = prisma.user.findFirst;
    const originalFindFirstTask = prisma.task.findFirst;
    const originalCount = prisma.task.count;
    const originalFindFirstContext = prisma.agencyContext.findFirst;
    const originalUpdateContext = prisma.agencyContext.update;
    const originalCreateContext = prisma.agencyContext.create;

    t.after(() => {
        // Restore original prisma methods
        prisma.task.aggregate = originalAggregate;
        prisma.user.findFirst = originalFindFirstUser;
        prisma.task.findFirst = originalFindFirstTask;
        prisma.task.count = originalCount;
        prisma.agencyContext.findFirst = originalFindFirstContext;
        prisma.agencyContext.update = originalUpdateContext;
        prisma.agencyContext.create = originalCreateContext;
        prisma.task.update = originalUpdateTask;
        prisma.task.findUnique = originalFindUniqueTask;
    });

    await t.test('Case A: Empty database (No task returned, no admins, no tasks)', async () => {
        prisma.task.aggregate = async () => ({ _max: { returnedAt: null } });
        prisma.user.findFirst = async () => null;
        prisma.task.findFirst = async () => null;
        prisma.task.count = async () => 0;
        prisma.agencyContext.findFirst = async () => null;

        let createdRecord = null;
        prisma.agencyContext.create = async ({ data }) => {
            createdRecord = data;
            return { id: 'new-id', ...data };
        };

        const result = await getQualityStreak();

        // Since everything is empty, workspaceCreatedAt falls back to NOW, so currentStreak is 0
        assert.strictEqual(result.currentStreak, 0);
        assert.strictEqual(result.maxStreak, 0);
        assert.strictEqual(result.currentReturnedTasksCount, 0);
    });

    await t.test('Case B: Active returned tasks force streak to 0', async () => {
        prisma.task.aggregate = async () => ({ _max: { returnedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) } }); // last return 5 days ago
        prisma.user.findFirst = async () => ({ createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) });
        prisma.task.count = async () => 1; // 1 active returned task
        prisma.agencyContext.findFirst = async () => ({ id: 'record-id', maxStreak: 12 });

        const result = await getQualityStreak();

        assert.strictEqual(result.currentStreak, 0); // Forced to 0 due to active count > 0
        assert.strictEqual(result.maxStreak, 12); // Remains at 12
        assert.strictEqual(result.currentReturnedTasksCount, 1);
    });

    await t.test('Case C: Same-day return event forces streak to 0', async () => {
        prisma.task.aggregate = async () => ({ _max: { returnedAt: new Date() } }); // last return today
        prisma.user.findFirst = async () => ({ createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) });
        prisma.task.count = async () => 0; // 0 active returned tasks
        prisma.agencyContext.findFirst = async () => ({ id: 'record-id', maxStreak: 12 });

        const result = await getQualityStreak();

        assert.strictEqual(result.currentStreak, 0); // Forced to 0 due to same-day return
        assert.strictEqual(result.maxStreak, 12);
    });

    await t.test('Case D: Return event in the past (e.g., 6 days ago) calculates streak correctly and updates maxStreak', async () => {
        const sixDaysAgo = new Date();
        sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

        prisma.task.aggregate = async () => ({ _max: { returnedAt: sixDaysAgo } });
        prisma.user.findFirst = async () => ({ createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) });
        prisma.task.count = async () => 0;
        prisma.agencyContext.findFirst = async () => ({ id: 'record-id', maxStreak: 4 });

        let updatedRecord = null;
        prisma.agencyContext.update = async ({ where, data }) => {
            updatedRecord = { where, data };
            return { id: 'record-id', ...data };
        };

        const result = await getQualityStreak();

        assert.strictEqual(result.currentStreak, 6);
        assert.strictEqual(result.maxStreak, 6); // Updated because 6 > 4
        assert.ok(updatedRecord);
        assert.strictEqual(updatedRecord.data.maxStreak, 6);
    });

    await t.test('Case E: Clean history (never returned), calculates streak since workspace creation', async () => {
        const fifteenDaysAgo = new Date();
        fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

        prisma.task.aggregate = async () => ({ _max: { returnedAt: null } });
        prisma.user.findFirst = async () => ({ createdAt: fifteenDaysAgo });
        prisma.task.count = async () => 0;
        prisma.agencyContext.findFirst = async () => ({ id: 'record-id', maxStreak: 10 });

        let updatedRecord = null;
        prisma.agencyContext.update = async ({ where, data }) => {
            updatedRecord = { where, data };
            return { id: 'record-id', ...data };
        };

        const result = await getQualityStreak();

        assert.strictEqual(result.currentStreak, 15);
        assert.strictEqual(result.maxStreak, 15); // Updated because 15 > 10
        assert.ok(updatedRecord);
        assert.strictEqual(updatedRecord.data.maxStreak, 15);
    });

    await t.test('Case F: updateTask preserves returnedAt when transitioning out of DEVUELTA state', async () => {
        const returnTimestamp = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000); // returned 4 days ago

        prisma.task.findUnique = async () => ({
            id: 'task-123',
            title: 'Transition Task',
            status: 'DEVUELTA',
            isReturned: true,
            returnedAt: returnTimestamp,
            comments: '',
            contentItemId: null
        });

        let updatedTaskPayload = null;
        prisma.task.update = async ({ where, data }) => {
            updatedTaskPayload = data;
            return {
                id: 'task-123',
                status: 'EN_CURSO',
                isReturned: false,
                returnedAt: returnTimestamp, // mock response returning intact timestamp
                title: 'Transition Task'
            };
        };

        // Transition task out of DEVUELTA state to EN_CURSO
        const result = await updateTask('task-123', { status: 'EN_CURSO' }, 'user-456');

        assert.strictEqual(result.status, 'EN_CURSO');
        assert.strictEqual(result.isReturned, false);
        // Ensure that update payload did NOT contain `returnedAt: null` or `returnedAt: undefined`
        assert.ok(updatedTaskPayload);
        assert.strictEqual(updatedTaskPayload.returnedAt, undefined); // Should not try to write null/overwrite it
        assert.strictEqual(updatedTaskPayload.isReturned, false);
    });
});
