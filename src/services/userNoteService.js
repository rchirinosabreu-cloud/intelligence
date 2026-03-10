import prisma from '../lib/prisma.js';

export const getUserNotes = async (userId) => {
    return await prisma.userNote.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' }
    });
};

export const createUserNote = async (userId, { title, content }) => {
    return await prisma.userNote.create({
        data: {
            userId,
            title,
            content
        }
    });
};

export const updateUserNote = async (userId, noteId, { title, content }) => {
    const note = await prisma.userNote.findUnique({
        where: { id: noteId }
    });

    if (!note) {
        throw new Error('Nota no encontrada');
    }

    if (note.userId !== userId) {
        throw new Error('No tienes permiso para editar esta nota');
    }

    return await prisma.userNote.update({
        where: { id: noteId },
        data: { title, content }
    });
};

export const deleteUserNote = async (userId, noteId) => {
    const note = await prisma.userNote.findUnique({
        where: { id: noteId }
    });

    if (!note) {
        throw new Error('Nota no encontrada');
    }

    if (note.userId !== userId) {
        throw new Error('No tienes permiso para eliminar esta nota');
    }

    return await prisma.userNote.delete({
        where: { id: noteId }
    });
};
