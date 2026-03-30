import express from 'express';
import {
    getFeedbackForCollaborator,
    createFeedbackRecord,
    updateFeedbackRecord,
    softDeleteFeedbackRecord,
    getFeedbackById
} from '../../services/feedbackService.js';

const router = express.Router();

// Middleware to ensure user is ADMIN
const isAdmin = (req, res, next) => {
    if (req.user?.role === 'ADMIN') {
        next();
    } else {
        res.status(403).json({ error: 'Acceso denegado: Se requieren permisos de Administrador' });
    }
};

// GET feedback for a specific collaborator
router.get('/:collaboratorId', async (req, res) => {
    try {
        const { collaboratorId } = req.params;
        const requesterId = req.user.userId;
        const requesterRole = req.user.role;

        // EDITORS can only see their own feedback
        if (requesterRole !== 'ADMIN' && requesterId !== collaboratorId) {
            return res.status(403).json({ error: 'No tienes permiso para ver este historial' });
        }

        const feedback = await getFeedbackForCollaborator(collaboratorId, requesterRole === 'ADMIN');
        return res.json(feedback);
    } catch (error) {
        console.error('[Feedback API] Error fetching feedback:', error);
        return res.status(500).json({ error: 'Error al obtener el historial de feedback', details: error.message });
    }
});

// POST new feedback record (ADMIN only)
router.post('/', isAdmin, async (req, res) => {
    try {
        const { collaboratorId, type, date, strengths, improvementAreas, actionItems, privateNote } = req.body;
        const authorId = req.user.userId;

        if (!collaboratorId || !type || !date || !strengths || !improvementAreas || !actionItems) {
            return res.status(400).json({ error: 'Faltan campos obligatorios' });
        }

        const newRecord = await createFeedbackRecord({
            collaboratorId,
            authorId,
            type,
            date: new Date(date),
            strengths,
            improvementAreas,
            actionItems,
            privateNote
        });

        return res.status(201).json(newRecord);
    } catch (error) {
        console.error('[Feedback API] Error creating feedback:', error);
        return res.status(500).json({ error: 'Error al crear el registro de feedback', details: error.message });
    }
});

// PATCH update feedback record (ADMIN only)
router.patch('/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { type, date, strengths, improvementAreas, actionItems, privateNote } = req.body;

        const updatedRecord = await updateFeedbackRecord(id, {
            type,
            date: date ? new Date(date) : undefined,
            strengths,
            improvementAreas,
            actionItems,
            privateNote
        });

        return res.json(updatedRecord);
    } catch (error) {
        console.error('[Feedback API] Error updating feedback:', error);
        return res.status(500).json({ error: 'Error al actualizar el registro de feedback', details: error.message });
    }
});

// DELETE (Soft delete) feedback record (ADMIN only)
router.delete('/:id', isAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        await softDeleteFeedbackRecord(id);
        return res.json({ success: true, message: 'Registro eliminado (soft-delete) correctamente' });
    } catch (error) {
        console.error('[Feedback API] Error deleting feedback:', error);
        return res.status(500).json({ error: 'Error al eliminar el registro de feedback', details: error.message });
    }
});

export default router;
