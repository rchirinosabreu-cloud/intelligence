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
            createdAt: true,
            modulePermissions: true
        }
    });
    return user;
};

export const updateUserProfile = async (userId, data) => {
    // Basic fields that ANY user can update on their own profile
    // Or that an ADMIN can update for anyone.
    const { name, bio, avatarUrl, role, isActive, modulePermissions } = data;

    const defaultPermissions = {
        dashboard: true,
        manager: false,
        gestion: false,
        actividad: false,
        reportes: false,
        inspiracion: false,
        parrillas: false,
        minutas: false,
        cotizaciones: false,
        financiero: false,
        radar: false,
        clientes: false,
        equipo: false
    };

    let sanitizedPermissions = undefined;
    if (modulePermissions) {
        sanitizedPermissions = { ...defaultPermissions };
        Object.keys(modulePermissions).forEach(key => {
            const lowerKey = key.toLowerCase();
            let targetKey = lowerKey;
            if (lowerKey === 'inicio') targetKey = 'dashboard';
            if (lowerKey === 'tareas') targetKey = 'gestion';

            if (targetKey in defaultPermissions) {
                sanitizedPermissions[targetKey] = !!modulePermissions[key];
            }
        });
        sanitizedPermissions.dashboard = true;
    }

    const updatedUser = await prisma.$transaction(async (tx) => {
        const user = await tx.user.update({
            where: { id: userId },
            data: {
                name,
                bio,
                avatarUrl,
                role,
                isActive,
                modulePermissions: sanitizedPermissions
            },
            select: {
                id: true,
                name: true,
                email: true,
                bio: true,
                avatarUrl: true,
                role: true,
                isActive: true,
                modulePermissions: true
            }
        });

        // Synchronize with TeamMember if it exists
        // We only sync 'name' and 'avatarUrl' for now
        const teamMember = await tx.teamMember.findUnique({
            where: { userId: user.id }
        });

        if (teamMember) {
            await tx.teamMember.update({
                where: { id: teamMember.id },
                data: {
                    name: name !== undefined ? name : undefined,
                    avatarUrl: avatarUrl !== undefined ? avatarUrl : undefined,
                    isActive: isActive !== undefined ? isActive : undefined
                }
            });
        }

        return user;
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
