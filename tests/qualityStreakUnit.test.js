import test from 'node:test';
import assert from 'node:assert';
import prisma from '../src/lib/prisma.js';
import {
    getOrCreateSystemStreak,
    resetSystemStreak,
    processSystemStreakDailyIncrement,
    getQualityStreak,
    createTask,
    updateTask
} from '../src/services/nativeTaskService.js';

test('SystemStreak Decoupled Quality Streak Tests', async (t) => {
    // Backup and restore Prisma methods
    const originalFindUniqueSystemStreak = prisma.systemStreak.findUnique;
    const originalCreateSystemStreak = prisma.systemStreak.create;
    const originalUpdateSystemStreak = prisma.systemStreak.update;
    const originalCountTask = prisma.task.count;
    const originalCreateTask = prisma.task.create;
    const originalUpdateTask = prisma.task.update;
    const originalFindUniqueTask = prisma.task.findUnique;
    const originalTransaction = prisma.$transaction;

    prisma.$transaction = async (callback) => callback(prisma);

    t.after(() => {
        prisma.systemStreak.findUnique = originalFindUniqueSystemStreak;
        prisma.systemStreak.create = originalCreateSystemStreak;
        prisma.systemStreak.update = originalUpdateSystemStreak;
        prisma.task.count = originalCountTask;
        prisma.task.create = originalCreateTask;
        prisma.task.update = originalUpdateTask;
        prisma.task.findUnique = originalFindUniqueTask;
        prisma.$transaction = originalTransaction;
    });

    await t.test('Test 1: getOrCreateSystemStreak creates record if not exists', async () => {
        let createdRecord = null;
        prisma.systemStreak.findUnique = async () => null;
        prisma.systemStreak.create = async ({ data }) => {
            createdRecord = data;
            return { id: 'global', ...data };
        };

        const result = await getOrCreateSystemStreak();
        assert.ok(result);
        assert.strictEqual(result.id, 'global');
        assert.strictEqual(result.currentStreak, 0);
        assert.strictEqual(result.highestStreak, 0);
        assert.strictEqual(createdRecord.id, 'global');
    });

    await t.test('Test 2: resetSystemStreak resets currentStreak and sets lastResetAt', async () => {
        let updatedRecord = null;
        prisma.systemStreak.findUnique = async () => ({
            id: 'global',
            currentStreak: 12,
            highestStreak: 15,
            lastResetAt: null,
            lastIncrementedAt: null
        });
        prisma.systemStreak.update = async ({ where, data }) => {
            updatedRecord = data;
            return { id: 'global', ...data };
        };

        await resetSystemStreak();
        assert.ok(updatedRecord);
        assert.strictEqual(updatedRecord.currentStreak, 0);
        assert.ok(updatedRecord.lastResetAt);
    });

    await t.test('Test 3: Daily increment processes completed days cleanly', async () => {
        const lastInc = new Date(Date.UTC(2026, 6, 15, 12, 0, 0)); // July 15, 2026
        const now = new Date(Date.UTC(2026, 6, 18, 12, 0, 0)); // July 18, 2026 (3 completed days: July 15, 16, 17)

        // Mock current time
        const originalDate = Date;
        global.Date = class extends originalDate {
            constructor(...args) {
                if (args.length === 0) return new originalDate(now.getTime());
                return new originalDate(...args);
            }
            static now() {
                return now.getTime();
            }
        };

        try {
            let updatedRecord = null;
            prisma.systemStreak.findUnique = async () => ({
                id: 'global',
                currentStreak: 5,
                highestStreak: 10,
                lastResetAt: null,
                lastIncrementedAt: lastInc
            });
            prisma.systemStreak.update = async ({ data }) => {
                updatedRecord = data;
                return { id: 'global', ...data };
            };

            await processSystemStreakDailyIncrement();

            assert.ok(updatedRecord);
            // From July 15 to July 18 is 2 full UTC days completed: July 16, 17.
            // No resetAt was set, so currentStreak increases by 2 (from 5 to 7).
            assert.strictEqual(updatedRecord.currentStreak, 7);
            assert.strictEqual(updatedRecord.highestStreak, 10); // Still 10 since 8 < 10
        } finally {
            global.Date = originalDate;
        }
    });

    await t.test('Test 4: Daily increment respects reset day', async () => {
        const lastInc = new Date(Date.UTC(2026, 6, 15, 12, 0, 0)); // July 15
        const lastReset = new Date(Date.UTC(2026, 6, 16, 10, 0, 0)); // Reset on July 16
        const now = new Date(Date.UTC(2026, 6, 18, 12, 0, 0)); // July 18 (Completed days: July 15, 16, 17)

        const originalDate = Date;
        global.Date = class extends originalDate {
            constructor(...args) {
                if (args.length === 0) return new originalDate(now.getTime());
                return new originalDate(...args);
            }
            static now() {
                return now.getTime();
            }
        };

        try {
            let updatedRecord = null;
            prisma.systemStreak.findUnique = async () => ({
                id: 'global',
                currentStreak: 5,
                highestStreak: 10,
                lastResetAt: lastReset,
                lastIncrementedAt: lastInc
            });
            prisma.systemStreak.update = async ({ data }) => {
                updatedRecord = data;
                return { id: 'global', ...data };
            };

            await processSystemStreakDailyIncrement();

            assert.ok(updatedRecord);
            // Day 15: completed, no resets -> Streak = 5 + 1 = 6
            // Day 16: completed, reset on 16 -> Streak reset to 0
            // Day 17: completed, no resets -> Streak = 0 + 1 = 1
            assert.strictEqual(updatedRecord.currentStreak, 1);
        } finally {
            global.Date = originalDate;
        }
    });

    await t.test('Test 5: updateTask to DEVUELTA triggers streak reset', async () => {
        prisma.task.findUnique = async () => ({
            id: 'task-123',
            status: 'PENDIENTE',
            isReturned: false,
            comments: '',
            contentItemId: null
        });

        let updatedTaskPayload = null;
        prisma.task.update = async ({ data }) => {
            updatedTaskPayload = data;
            return {
                id: 'task-123',
                status: 'DEVUELTA',
                isReturned: true,
                title: 'Transition Task'
            };
        };

        let streakUpdated = null;
        prisma.systemStreak.findUnique = async () => ({
            id: 'global',
            currentStreak: 10,
            highestStreak: 12
        });
        prisma.systemStreak.update = async ({ data }) => {
            streakUpdated = data;
            return { id: 'global', ...data };
        };

        await updateTask('task-123', { status: 'DEVUELTA' }, 'user-456');

        assert.ok(updatedTaskPayload);
        assert.strictEqual(updatedTaskPayload.status, 'DEVUELTA');
        assert.strictEqual(updatedTaskPayload.isReturned, true);

        // Confirm streak was reset to 0 immediately
        assert.ok(streakUpdated);
        assert.strictEqual(streakUpdated.currentStreak, 0);
        assert.ok(streakUpdated.lastResetAt);
    });
});
