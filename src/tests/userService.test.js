import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getUserProfile, updateUserProfile, updateUserPassword } from '../services/userService.js';
import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';

// Mock prisma
vi.mock('../lib/prisma.js', () => {
  const mockP = {
    $transaction: vi.fn(),
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    teamMember: {
        findUnique: vi.fn(),
        update: vi.fn(),
    }
  };
  mockP.$transaction.mockImplementation((callback) => callback(mockP));
  return { default: mockP };
});

// Mock bcrypt
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
}));

describe('userService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getUserProfile', () => {
        it('debería devolver el perfil del usuario sin la contraseña', async () => {
            const mockUser = { id: 'u1', name: 'Jules', email: 'j@b.com', bio: 'Dev' };
            prisma.user.findUnique.mockResolvedValue(mockUser);

            const result = await getUserProfile('u1');

            expect(result).toEqual({ id: 'u1', name: 'Jules', email: 'j@b.com', bio: 'Dev' });
            expect(result.password).toBeUndefined();
        });
    });

    describe('updateUserProfile', () => {
        it('debería actualizar el nombre y la biografía', async () => {
            const mockUpdatedUser = { id: 'u1', name: 'Jules Updated', bio: 'Senior Dev' };
            prisma.user.update.mockResolvedValue(mockUpdatedUser);

            const result = await updateUserProfile('u1', { name: 'Jules Updated', bio: 'Senior Dev' });

            expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
                where: { id: 'u1' },
                data: expect.objectContaining({ name: 'Jules Updated', bio: 'Senior Dev' })
            }));
            expect(result).toEqual(mockUpdatedUser);
        });

        it('debería sincronizar con TeamMember si existe', async () => {
            const mockUser = { id: 'u1', name: 'Admin', avatarUrl: 'new_url' };
            prisma.user.update.mockResolvedValue(mockUser);
            prisma.teamMember.findUnique.mockResolvedValue({ id: 'tm1', userId: 'u1' });

            await updateUserProfile('u1', { name: 'Admin', avatarUrl: 'new_url' });

            expect(prisma.teamMember.update).toHaveBeenCalledWith({
                where: { id: 'tm1' },
                data: { name: 'Admin', avatarUrl: 'new_url', isActive: undefined }
            });
        });
    });

    describe('updateUserPassword', () => {
        it('debería actualizar la contraseña si la actual es correcta', async () => {
            prisma.user.findUnique.mockResolvedValue({ id: 'u1', password: 'old_hash' });
            bcrypt.compare
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(false);
            bcrypt.hash.mockResolvedValue('new_hash');
            prisma.user.update.mockResolvedValue({ id: 'u1' });

            const result = await updateUserPassword('u1', 'old_pass', 'new_pass');

            expect(bcrypt.compare).toHaveBeenCalledWith('old_pass', 'old_hash');
            expect(bcrypt.compare).toHaveBeenCalledWith('new_pass', 'old_hash');
            expect(bcrypt.hash).toHaveBeenCalledWith('new_pass', 10);
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'u1' },
                data: {
                    password: 'new_hash',
                    mustChangePassword: false,
                    passwordChangedAt: expect.any(Date),
                    sessionVersion: { increment: 1 }
                }
            });
            expect(result).toEqual({ success: true });
        });

        it('deberia rechazar una contrasena nueva igual a la actual', async () => {
            prisma.user.findUnique.mockResolvedValue({ id: 'u1', password: 'old_hash' });
            bcrypt.compare
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce(true);

            await expect(updateUserPassword('u1', 'old_pass', 'old_pass'))
                .rejects.toThrow('La nueva contrasena debe ser diferente a la actual');

            expect(prisma.user.update).not.toHaveBeenCalled();
        });

        it('debería lanzar error si la contraseña actual es incorrecta', async () => {
            prisma.user.findUnique.mockResolvedValue({ id: 'u1', password: 'old_hash' });
            bcrypt.compare.mockResolvedValue(false);

            await expect(updateUserPassword('u1', 'wrong_pass', 'new_pass'))
                .rejects.toThrow('Contraseña actual incorrecta');

            expect(prisma.user.update).not.toHaveBeenCalled();
        });
    });
});
