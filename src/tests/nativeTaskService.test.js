import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateTask, getQualityStreak, auditAndDeleteTask } from '../services/nativeTaskService.js';
import prisma from '../lib/prisma.js';

// Mock prisma
vi.mock('../lib/prisma.js', () => {
  const mockPrisma = {
    $transaction: vi.fn((cb) => cb(mockPrisma)),
    task: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
      delete: vi.fn(),
    },
    deletedTaskLog: {
      create: vi.fn(),
    },
    teamMember: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    }
  };
  return { default: mockPrisma };
});

describe('nativeTaskService - updateTask', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * Test 1 (Transición a Completado)
     */
    it('debería registrar completedAt con la fecha actual cuando cambia a estado "Realizado"', async () => {
        // Mock de tarea existente en estado Pendiente
        prisma.task.findUnique.mockResolvedValue({ id: 1, status: 'PENDIENTE', completedAt: null, comments: '' });
        prisma.task.update.mockResolvedValue({ id: 1, status: 'REALIZADA', completedAt: new Date() });

        const payload = { status: 'REALIZADA' };
        await updateTask(1, payload);

        expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ completedAt: expect.any(Date) })
        }));
    });

    /**
     * Test 2 (Reversión a Pendiente/En Proceso)
     */
    it('debería forzar completedAt a null si cambia de "Realizado" a "Pendiente"', async () => {
        // Mock de tarea existente en estado Realizado
        prisma.task.findUnique.mockResolvedValue({ id: 1, status: 'REALIZADA', completedAt: new Date(), comments: '' });
        prisma.task.update.mockResolvedValue({ id: 1, status: 'PENDIENTE', completedAt: null });

        const payload = { status: 'PENDIENTE' };
        await updateTask(1, payload);

        expect(prisma.task.update).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ completedAt: null })
        }));
    });

    /**
     * Caso Borde A (Actualización sin cambio de estado Realizado)
     */
    it('no debería sobrescribir completedAt si la tarea ya era "Realizada" y solo se editó otro campo', async () => {
        const pastDate = new Date('2023-01-01');
        prisma.task.findUnique.mockResolvedValue({ id: 1, status: 'REALIZADA', completedAt: pastDate, comments: '' });
        prisma.task.update.mockResolvedValue({ id: 1, status: 'REALIZADA', completedAt: pastDate, title: 'Nuevo Título' });

        const payload = { status: 'REALIZADA', title: 'Nuevo Título' }; // Mismo estado, cambia título
        await updateTask(1, payload);

        // No debe mandar un nuevo completedAt en el payload de update
        const updateCall = prisma.task.update.mock.calls[0][0];
        expect(updateCall.data.completedAt).toBeUndefined(); // Se ignora para no sobrescribir
    });

    /**
     * Caso Borde B (Payload sin campo de estado)
     */
    it('debería ignorar completedAt si no se incluye "status" en el payload de actualización', async () => {
        prisma.task.findUnique.mockResolvedValue({ id: 1, status: 'PENDIENTE', completedAt: null, comments: '' });
        prisma.task.update.mockResolvedValue({ id: 1, status: 'PENDIENTE', completedAt: null, title: 'Solo Título' });

        const payload = { title: 'Solo Título' }; // Sin campo status
        await updateTask(1, payload);

        const updateCall = prisma.task.update.mock.calls[0][0];
        expect(updateCall.data.completedAt).toBeUndefined();
    });

    /**
     * Lógica de Racha de Calidad (Quality Streak)
     */
    describe('getQualityStreak', () => {
        it('debería calcular 0 días si no hay tareas devueltas ni creadas', async () => {
            prisma.task.findFirst.mockResolvedValue(null);
            prisma.task.count.mockResolvedValue(0);
            const result = await getQualityStreak();
            expect(result.currentStreakDays).toBe(0);
            expect(result.currentReturnedTasksCount).toBe(0);
        });

        it('debería calcular la racha desde la última tarea devuelta', async () => {
            const fiveDaysAgo = new Date();
            fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

            prisma.task.findFirst.mockResolvedValueOnce({ updatedAt: fiveDaysAgo });
            prisma.task.count.mockResolvedValue(2);
            const result = await getQualityStreak();
            expect(result.currentStreakDays).toBe(5);
            expect(result.currentReturnedTasksCount).toBe(2);
        });

        it('debería calcular la racha desde la primera tarea si nunca hubo devoluciones', async () => {
            const tenDaysAgo = new Date();
            tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

            prisma.task.findFirst
                .mockResolvedValueOnce(null) // no last returned
                .mockResolvedValueOnce({ createdAt: tenDaysAgo }); // first task

            prisma.task.count.mockResolvedValue(0);

            const result = await getQualityStreak();
            expect(result.currentStreakDays).toBe(10);
            expect(result.currentReturnedTasksCount).toBe(0);
        });
    });

    /**
     * Lógica de Cierre de Ciclo (Notificación de Corrección)
     */
    it('debería notificar al responsable si el creador reintegra la tarea', async () => {
        const taskId = "task-123";
        const creatorUserId = "user-creator";
        const assigneeTMId = "tm-assignee";
        const assigneeUserId = "user-assignee";

        // Setup initial state
        prisma.task.findUnique.mockResolvedValue({
            id: taskId,
            status: 'DEVUELTA',
            completedAt: null,
            comments: 'Some comments'
        });

        // Mock update result
        prisma.task.update.mockResolvedValue({
            id: taskId,
            status: 'PENDIENTE',
            title: 'Tarea Corregida',
            assigneeId: assigneeTMId,
            creatorId: creatorUserId
        });

        // Mocks para resolución de usuario
        prisma.teamMember.findUnique.mockResolvedValue({ id: assigneeTMId, email: 'assignee@test.com' });
        prisma.user.findUnique.mockResolvedValue({ id: assigneeUserId, email: 'assignee@test.com' });

        const payload = { status: 'PENDIENTE' };
        // El creador es el que hace el update
        await updateTask(taskId, payload, creatorUserId);

        // Verification
        expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                type: 'TASK_CORRECTED',
                userId: assigneeUserId,
                message: expect.stringContaining("que devolviste ya ha sido corregida")
            })
        }));
    });

    it('debería notificar al creador como fallback si el updater no es el creador', async () => {
        const taskId = "task-123";
        const creatorUserId = "user-creator";
        const otherUserId = "user-other";

        // Setup initial state
        prisma.task.findUnique.mockResolvedValue({
            id: taskId,
            status: 'DEVUELTA',
            completedAt: null,
            comments: 'Some comments'
        });

        prisma.task.update.mockResolvedValue({
            id: taskId,
            status: 'PENDIENTE',
            title: 'Tarea Corregida',
            creatorId: creatorUserId
        });

        const payload = { status: 'PENDIENTE' };
        await updateTask(taskId, payload, otherUserId);

        // Verification: Notifica al creador (comportamiento legacy/fallback)
        expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                type: 'TASK_CORRECTED',
                userId: creatorUserId,
                message: "La tarea \"Tarea Corregida\" ha sido corregida y reintegrada."
            })
        }));
    });

    describe('auditAndDeleteTask', () => {
        it('debería crear un registro de auditoría y eliminar la tarea en una transacción', async () => {
            const taskId = "task-to-delete-123";
            const reason = "Duplicada";
            const userId = "user-admin";

            prisma.task.findUnique.mockResolvedValue({
                id: taskId,
                title: "Tarea Duplicada",
                clientId: "client-abc"
            });

            const result = await auditAndDeleteTask(taskId, reason, userId);

            expect(prisma.$transaction).toHaveBeenCalled();
            expect(prisma.deletedTaskLog.create).toHaveBeenCalledWith({
                data: {
                    originalTaskId: taskId,
                    taskTitle: "Tarea Duplicada",
                    clientId: "client-abc",
                    reason: reason,
                    deletedById: userId
                }
            });
            expect(prisma.task.delete).toHaveBeenCalledWith({
                where: { id: taskId }
            });
            expect(result.success).toBe(true);
        });

        it('debería fallar si la tarea no existe', async () => {
            prisma.task.findUnique.mockResolvedValue(null);
            await expect(auditAndDeleteTask("invalid-id", "reason")).rejects.toThrow();
        });
    });

});
