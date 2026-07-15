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

    await t.test('Prueba 4: Creación Unificada con Insumos y Comentarios', async () => {
        if (!process.env.DATABASE_URL) return;

        const unifiedTaskData = {
            title: 'Unified Task Creation',
            comments: 'Unified body description',
            clientId: testClient.id,
            creatorId: testUser.id,
            status: 'PENDIENTE',
            initial_references: [
                { url: 'https://figma.com/design-file', name: 'Figma de la Campaña' }
            ],
            initial_inputs: [
                { url: 'https://docs.google.com/doc', name: 'Brief de Contenido' }
            ],
            initial_comments: [
                { content: 'Este es el primer comentario inicial' },
                { content: 'Segundo comentario inicial automatizado' }
            ]
        };

        const createdTask = await createTask(unifiedTaskData);

        assert.ok(createdTask.id);
        assert.strictEqual(createdTask.title, unifiedTaskData.title);

        // Fetch task from database to verify all attachments and comments were saved
        const dbTask = await prisma.task.findUnique({
            where: { id: createdTask.id },
            include: {
                taskAttachments: true,
                taskComments: true
            }
        });

        assert.strictEqual(dbTask.taskAttachments.length, 2);
        assert.strictEqual(dbTask.taskComments.length, 2);

        // Verify categories
        const refAttachment = dbTask.taskAttachments.find(a => a.category === 'REFERENCIA');
        const inpAttachment = dbTask.taskAttachments.find(a => a.category === 'INSUMO');

        assert.ok(refAttachment);
        assert.strictEqual(refAttachment.url, 'https://figma.com/design-file');

        assert.ok(inpAttachment);
        assert.strictEqual(inpAttachment.url, 'https://docs.google.com/doc');

        const commentContents = dbTask.taskComments.map(c => c.content);
        assert.ok(commentContents.includes('Este es el primer comentario inicial'));
        assert.ok(commentContents.includes('Segundo comentario inicial automatizado'));

        // Clean up
        await prisma.task.delete({ where: { id: createdTask.id } }).catch(() => {});
    });

    await t.test('Prueba 5: Transaccionalidad de Base de Datos (Atomicidad/Rollback en Fallo)', async () => {
        if (!process.env.DATABASE_URL) return;

        const invalidUnifiedTaskData = {
            title: 'Should Rollback Task',
            comments: 'This creation must completely fail and rollback',
            clientId: testClient.id,
            creatorId: testUser.id,
            status: 'PENDIENTE',
            initial_references: [
                // Providing invalid fields (url is required, name can be null but url must be present)
                // We pass null for url to trigger database exception / validation error
                { url: null, name: 'Invalid Link' }
            ]
        };

        let didThrow = false;
        try {
            await createTask(invalidUnifiedTaskData);
        } catch (error) {
            didThrow = true;
        }

        assert.strictEqual(didThrow, true);

        // Verify no task was created with title 'Should Rollback Task'
        const dbTasks = await prisma.task.findMany({
            where: { title: 'Should Rollback Task' }
        });

        assert.strictEqual(dbTasks.length, 0);
    });
});
