import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getUserProfile, updateUserProfile, updateUserPassword } from '../services/userService.js';
import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';

// Mock prisma
vi.mock('../lib/prisma.js', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

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
                data: { name: 'Jules Updated', bio: 'Senior Dev' }
            }));
            expect(result).toEqual(mockUpdatedUser);
        });
    });

    describe('updateUserPassword', () => {
        it('debería actualizar la contraseña si la actual es correcta', async () => {
            prisma.user.findUnique.mockResolvedValue({ id: 'u1', password: 'old_hash' });
            bcrypt.compare.mockResolvedValue(true);
            bcrypt.hash.mockResolvedValue('new_hash');
            prisma.user.update.mockResolvedValue({ id: 'u1' });

            const result = await updateUserPassword('u1', 'old_pass', 'new_pass');

            expect(bcrypt.compare).toHaveBeenCalledWith('old_pass', 'old_hash');
            expect(bcrypt.hash).toHaveBeenCalledWith('new_pass', 10);
            expect(prisma.user.update).toHaveBeenCalledWith({
                where: { id: 'u1' },
                data: { password: 'new_hash' }
            });
            expect(result).toEqual({ success: true });
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
