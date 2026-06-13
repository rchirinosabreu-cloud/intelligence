import test from 'node:test';
import assert from 'node:assert';
import prisma from '../src/lib/prisma.js';
import { createTask, updateTask } from '../src/services/nativeTaskService.js';

test('Kanban Critical Flow Integration', async (t) => {
    let testClient;
    let testUser;
    let testTask;

    // Use environment variables for project-wide consistency or fallback for local
    const clientSlug = 'test-kanban-flow-' + Date.now();
    const userEmail = 'test-kanban-' + Date.now() + '@example.com';

    t.before(async () => {
        // Only run if we have a DB
        if (!process.env.DATABASE_URL) {
            console.warn('Skipping actual DB integration tests as DATABASE_URL is missing.');
            return;
        }

        testClient = await prisma.client.create({
            data: {
                name: 'Test Kanban Client',
                slug: clientSlug,
            }
        });

        testUser = await prisma.user.create({
            data: {
                name: 'Test User',
                email: userEmail,
                password: 'password123',
                role: 'ADMIN'
            }
        });
    });

    t.after(async () => {
        if (!process.env.DATABASE_URL) return;

        // Cleanup
        if (testTask) {
            await prisma.task.delete({ where: { id: testTask.id } }).catch(() => {});
        }
        if (testUser) {
            await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
        }
        if (testClient) {
            await prisma.client.delete({ where: { id: testClient.id } }).catch(() => {});
        }
    });

    await t.test('Prueba 1: Creación Exitosa', async () => {
        if (!process.env.DATABASE_URL) return;

        const taskData = {
            title: 'Integration Test Task',
            comments: 'Testing the lifecycle',
            clientId: testClient.id,
            creatorId: testUser.id,
            status: 'PENDIENTE'
        };

        testTask = await createTask(taskData);

        assert.ok(testTask.id);
        assert.strictEqual(testTask.title, taskData.title);
        assert.strictEqual(testTask.status, 'PENDIENTE');
    });

    await t.test('Prueba 2: Persistencia en DB', async () => {
        if (!process.env.DATABASE_URL) return;

        const dbTask = await prisma.task.findUnique({
            where: { id: testTask.id }
        });

        assert.ok(dbTask);
        assert.strictEqual(dbTask.title, testTask.title);
        assert.strictEqual(dbTask.clientId, testClient.id);
    });

    await t.test('Prueba 3: Mutación de Estado (Kanban Flow)', async () => {
        if (!process.env.DATABASE_URL) return;

        // Move to EN_CURSO (In Process)
        const updated = await updateTask(testTask.id, { status: 'EN_CURSO' }, testUser.id);

        assert.strictEqual(updated.status, 'EN_CURSO');

        const dbTask = await prisma.task.findUnique({
            where: { id: testTask.id },
            select: { status: true }
        });

        assert.strictEqual(dbTask.status, 'EN_CURSO');
    });
});
