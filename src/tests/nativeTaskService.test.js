import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateTask, getQualityStreak } from '../services/nativeTaskService.js';
import prisma from '../lib/prisma.js';

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    task: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
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
  },
}));

describe('nativeTaskService - updateTask', () => {

    beforeEach(() => {
        vi.clearAllMocks();
    });

    /**
     * Test 1 (Transición a Completado)
     */
    it('debería registrar completedAt con la fecha actual cuando cambia a estado "Realizado"', async () => {
        // Mock de tarea existente en estado Pendiente
        prisma.task.findUnique.mockResolvedValue({ id: 1, status: 'Pendiente', completedAt: null });
        prisma.task.update.mockResolvedValue({ id: 1, status: 'Realizado', completedAt: new Date() });

        const payload = { status: 'Realizado' };
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
        prisma.task.findUnique.mockResolvedValue({ id: 1, status: 'Realizado', completedAt: new Date() });
        prisma.task.update.mockResolvedValue({ id: 1, status: 'Pendiente', completedAt: null });

        const payload = { status: 'Pendiente' };
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
        prisma.task.findUnique.mockResolvedValue({ id: 1, status: 'Realizado', completedAt: pastDate });
        prisma.task.update.mockResolvedValue({ id: 1, status: 'Realizado', completedAt: pastDate, title: 'Nuevo Título' });

        const payload = { status: 'Realizado', title: 'Nuevo Título' }; // Mismo estado, cambia título
        await updateTask(1, payload);

        // No debe mandar un nuevo completedAt en el payload de update
        const updateCall = prisma.task.update.mock.calls[0][0];
        expect(updateCall.data.completedAt).toBeUndefined(); // Se ignora para no sobrescribir
    });

    /**
     * Caso Borde B (Payload sin campo de estado)
     */
    it('debería ignorar completedAt si no se incluye "status" en el payload de actualización', async () => {
        prisma.task.findUnique.mockResolvedValue({ id: 1, status: 'Pendiente', completedAt: null });
        prisma.task.update.mockResolvedValue({ id: 1, status: 'Pendiente', completedAt: null, title: 'Solo Título' });

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
            const result = await getQualityStreak();
            expect(result.currentStreakDays).toBe(0);
        });

        it('debería calcular la racha desde la última tarea devuelta', async () => {
            const fiveDaysAgo = new Date();
            fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

            prisma.task.findFirst.mockResolvedValueOnce({ updatedAt: fiveDaysAgo });
            const result = await getQualityStreak();
            expect(result.currentStreakDays).toBe(5);
        });

        it('debería calcular la racha desde la primera tarea si nunca hubo devoluciones', async () => {
            const tenDaysAgo = new Date();
            tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

            prisma.task.findFirst
                .mockResolvedValueOnce(null) // no last returned
                .mockResolvedValueOnce({ createdAt: tenDaysAgo }); // first task

            const result = await getQualityStreak();
            expect(result.currentStreakDays).toBe(10);
        });
    });

    /**
     * Lógica de Cierre de Ciclo (Notificación de Corrección)
     */
    it('debería crear una notificación si una tarea pasa de "Devuelto" a "Pendiente"', async () => {
        const taskId = 123;
        prisma.task.findUnique
            .mockResolvedValueOnce({ id: taskId, status: 'Devuelto', completedAt: null }) // first call in updateTask
            .mockResolvedValueOnce({ id: taskId, title: 'Tarea Devuelta', assigneeId: 'member-1' }); // second call in notification logic

        prisma.teamMember.findUnique.mockResolvedValue({ id: 'member-1', email: 'test@example.com' });
        prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'test@example.com' });
        prisma.task.update.mockResolvedValue({ id: taskId, status: 'Pendiente' });

        const payload = { status: 'Pendiente' };
        await updateTask(taskId, payload);

        expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                type: 'TASK_CORRECTED',
                userId: 'user-1'
            })
        }));
    });

});