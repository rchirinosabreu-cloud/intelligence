import express from 'express';
import { getUserProfile, updateUserProfile, updateUserPassword } from '../../services/userService.js';
import { getUserNotes, createUserNote, updateUserNote, deleteUserNote } from '../../services/userNoteService.js';

const router = express.Router();

// Profile Endpoints
router.get('/profile', async (req, res) => {
    try {
        const profile = await getUserProfile(req.user.userId);
        res.json(profile);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/profile', async (req, res) => {
    try {
        const { name, bio } = req.body;
        const updatedProfile = await updateUserProfile(req.user.userId, { name, bio });
        res.json(updatedProfile);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
        }
        await updateUserPassword(req.user.userId, currentPassword, newPassword);
        res.json({ message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        const status = error.message === 'Contraseña actual incorrecta' ? 400 : 500;
        res.status(status).json({ error: error.message });
    }
});

// Notes Endpoints
router.get('/notes', async (req, res) => {
    try {
        const notes = await getUserNotes(req.user.userId);
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/notes', async (req, res) => {
    try {
        const { title, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Título y contenido son requeridos' });
        }
        const note = await createUserNote(req.user.userId, { title, content });
        res.status(201).json(note);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.put('/notes/:id', async (req, res) => {
    try {
        const { title, content } = req.body;
        const note = await updateUserNote(req.user.userId, req.params.id, { title, content });
        res.json(note);
    } catch (error) {
        const status = error.message.includes('permiso') ? 403 : 404;
        res.status(status).json({ error: error.message });
    }
});

router.delete('/notes/:id', async (req, res) => {
    try {
        await deleteUserNote(req.user.userId, req.params.id);
        res.json({ message: 'Nota eliminada correctamente' });
    } catch (error) {
        const status = error.message.includes('permiso') ? 403 : 404;
        res.status(status).json({ error: error.message });
    }
});

export default router;
