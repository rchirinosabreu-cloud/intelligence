import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getUserNotes, createUserNote, updateUserNote, deleteUserNote } from '../services/userNoteService.js';
import prisma from '../lib/prisma.js';

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    userNote: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

describe('userNoteService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getUserNotes', () => {
        it('debería devolver todas las notas del usuario ordenadas por fecha', async () => {
            const mockNotes = [{ id: 'n1', title: 'Nota 1' }, { id: 'n2', title: 'Nota 2' }];
            prisma.userNote.findMany.mockResolvedValue(mockNotes);

            const result = await getUserNotes('u1');

            expect(prisma.userNote.findMany).toHaveBeenCalledWith({
                where: { userId: 'u1' },
                orderBy: { createdAt: 'desc' }
            });
            expect(result).toEqual(mockNotes);
        });
    });

    describe('createUserNote', () => {
        it('debería crear una nueva nota', async () => {
            const noteData = { title: 'Nueva Nota', content: 'Contenido' };
            prisma.userNote.create.mockResolvedValue({ id: 'n1', ...noteData, userId: 'u1' });

            const result = await createUserNote('u1', noteData);

            expect(prisma.userNote.create).toHaveBeenCalledWith({
                data: {
                    ...noteData,
                    userId: 'u1'
                }
            });
            expect(result.id).toBe('n1');
        });
    });

    describe('updateUserNote', () => {
        it('debería actualizar una nota si pertenece al usuario', async () => {
            prisma.userNote.findUnique.mockResolvedValue({ id: 'n1', userId: 'u1' });
            prisma.userNote.update.mockResolvedValue({ id: 'n1', title: 'Editada' });

            const result = await updateUserNote('u1', 'n1', { title: 'Editada' });

            expect(prisma.userNote.update).toHaveBeenCalledWith({
                where: { id: 'n1' },
                data: { title: 'Editada' }
            });
            expect(result.title).toBe('Editada');
        });

        it('debería lanzar error si la nota no pertenece al usuario', async () => {
            prisma.userNote.findUnique.mockResolvedValue({ id: 'n1', userId: 'u2' });

            await expect(updateUserNote('u1', 'n1', { title: 'Editada' }))
                .rejects.toThrow('No tienes permiso para editar esta nota');
        });
    });

    describe('deleteUserNote', () => {
        it('debería eliminar una nota si pertenece al usuario', async () => {
            prisma.userNote.findUnique.mockResolvedValue({ id: 'n1', userId: 'u1' });
            prisma.userNote.delete.mockResolvedValue({ id: 'n1' });

            await deleteUserNote('u1', 'n1');

            expect(prisma.userNote.delete).toHaveBeenCalledWith({
                where: { id: 'n1' }
            });
        });
    });
});
