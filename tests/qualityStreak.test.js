import test from 'node:test';
import assert from 'node:assert';
import { getSafeTestDatabaseUrl } from './helpers/testDatabase.js';

const testDatabaseUrl = getSafeTestDatabaseUrl();
if (testDatabaseUrl) process.env.DATABASE_URL = testDatabaseUrl;
const prisma = testDatabaseUrl ? (await import('../src/lib/prisma.js')).default : null;
const taskService = testDatabaseUrl ? await import('../src/services/nativeTaskService.js') : {};
const { getQualityStreak } = taskService;

test('Quality Streak Backend Calculation Integration Tests', { skip: !testDatabaseUrl }, async (t) => {
    let testAdmin;
    let testClient;
    let testTaskNormal;
    let testTaskReturned;

    t.before(async () => {
        if (!testDatabaseUrl) {
            console.warn('Skipping actual DB Quality Streak tests as DATABASE_URL is missing.');
            return;
        }

        // 1. Setup clean state for tests
        // Clean any existing test streak records to have predictable behavior
        await prisma.agencyContext.deleteMany({
            where: { type: 'STREAK_RECORD' }
        }).catch(() => {});

        // Clean any test tasks or users
        await prisma.task.deleteMany({
            where: { title: { startsWith: 'STREAK_TEST_' } }
        }).catch(() => {});

        // 2. Create test Client
        testClient = await prisma.client.create({
            data: {
                name: 'Streak Test Client',
                slug: 'streak-test-client-' + Date.now()
            }
        });

        // 3. Create test ADMIN user (workspace base date)
        testAdmin = await prisma.user.create({
            data: {
                name: 'Streak Admin',
                email: 'streak-admin-' + Date.now() + '@example.com',
                password: 'password123',
                role: 'ADMIN',
                createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) // 10 days ago
            }
        });
    });

    t.after(async () => {
        if (!testDatabaseUrl) return;

        // Cleanup
        await prisma.task.deleteMany({
            where: { title: { startsWith: 'STREAK_TEST_' } }
        }).catch(() => {});

        if (testAdmin) {
            await prisma.user.delete({ where: { id: testAdmin.id } }).catch(() => {});
        }
        if (testClient) {
            await prisma.client.delete({ where: { id: testClient.id } }).catch(() => {});
        }

        await prisma.agencyContext.deleteMany({
            where: { type: 'STREAK_RECORD' }
        }).catch(() => {});
    });

    await t.test('Test Case 1: No returned tasks at all (Streak calculated since Admin creation)', async () => {
        if (!testDatabaseUrl) return;

        const streakResult = await getQualityStreak();

        // Admin was created 10 days ago, so currentStreak should be exactly 10 days
        assert.strictEqual(streakResult.currentStreak, 10);
        assert.strictEqual(streakResult.currentReturnedTasksCount, 0);
        // maxStreak should also be updated to 10
        assert.strictEqual(streakResult.maxStreak, 10);
    });

    await t.test('Test Case 2: Active returned task forces currentStreak to 0 immediately', async () => {
        if (!testDatabaseUrl) return;

        // Create a task that is currently in DEVUELTA status
        testTaskReturned = await prisma.task.create({
            data: {
                title: 'STREAK_TEST_Returned_Task',
                clientId: testClient.id,
                status: 'DEVUELTA',
                returnedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) // Returned 3 days ago
            }
        });

        const streakResult = await getQualityStreak();

        assert.strictEqual(streakResult.currentStreak, 0);
        assert.strictEqual(streakResult.currentReturnedTasksCount, 1);
        // maxStreak remains 10 (historical record is never lost!)
        assert.strictEqual(streakResult.maxStreak, 10);

        // Delete returned task
        await prisma.task.delete({ where: { id: testTaskReturned.id } });
    });

    await t.test('Test Case 3: Same day return event forces currentStreak to 0', async () => {
        if (!testDatabaseUrl) return;

        // Create a task that was returned TODAY, but is now back to EN_CURSO
        const testTaskReturnedToday = await prisma.task.create({
            data: {
                title: 'STREAK_TEST_Returned_Today',
                clientId: testClient.id,
                status: 'EN_CURSO',
                returnedAt: new Date() // Returned today (NOW)
            }
        });

        const streakResult = await getQualityStreak();

        // Since it was returned today, currentStreak should be forced to 0
        assert.strictEqual(streakResult.currentStreak, 0);
        assert.strictEqual(streakResult.currentReturnedTasksCount, 0);
        assert.strictEqual(streakResult.maxStreak, 10);

        // Delete task
        await prisma.task.delete({ where: { id: testTaskReturnedToday.id } });
    });

    await t.test('Test Case 4: Return event in the past (e.g., 5 days ago) calculates streak from that timestamp', async () => {
        if (!testDatabaseUrl) return;

        // Create a task that was returned exactly 5 days ago, and is currently EN_CURSO
        const testTaskReturnedPast = await prisma.task.create({
            data: {
                title: 'STREAK_TEST_Returned_Past',
                clientId: testClient.id,
                status: 'EN_CURSO',
                returnedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // Returned 5 days ago
            }
        });

        const streakResult = await getQualityStreak();

        // Five days since last return
        assert.strictEqual(streakResult.currentStreak, 5);
        assert.strictEqual(streakResult.currentReturnedTasksCount, 0);
        assert.strictEqual(streakResult.maxStreak, 10); // remains 10

        // Delete task
        await prisma.task.delete({ where: { id: testTaskReturnedPast.id } });
    });

    await t.test('Test Case 5: Setting a new historical record', async () => {
        if (!testDatabaseUrl) return;

        // Let's manually set a high streak record by modifying the Admin's creation date to 15 days ago
        await prisma.user.update({
            where: { id: testAdmin.id },
            data: {
                createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000) // 15 days ago
            }
        });

        const streakResult = await getQualityStreak();

        // Should update maxStreak to 15
        assert.strictEqual(streakResult.currentStreak, 15);
        assert.strictEqual(streakResult.maxStreak, 15);
    });
});
