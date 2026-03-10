import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';

export const getUserProfile = async (userId) => {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            name: true,
            email: true,
            bio: true,
            avatarUrl: true,
            role: true,
            createdAt: true
        }
    });
    return user;
};

export const updateUserProfile = async (userId, { name, bio }) => {
    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { name, bio },
        select: {
            id: true,
            name: true,
            email: true,
            bio: true,
            avatarUrl: true,
            role: true
        }
    });
    return updatedUser;
};

export const updateUserPassword = async (userId, currentPassword, newPassword) => {
    const user = await prisma.user.findUnique({
        where: { id: userId }
    });

    if (!user) {
        throw new Error('Usuario no encontrado');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
        throw new Error('Contraseña actual incorrecta');
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword }
    });

    return { success: true };
};
