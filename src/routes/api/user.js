import express from 'express';
import { getUserProfile, updateUserProfile, updateUserPassword } from '../../services/userService.js';
import { getUserNotes, createUserNote, updateUserNote, deleteUserNote } from '../../services/userNoteService.js';

const router = express.Router();

// Profile Endpoints
router.get('/profile', async (req, res) => {
    try {
        const profile = await getUserProfile(req.user.userId);
        return res.json(profile);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// Admin can fetch any user's profile
router.get('/profile/:userId', async (req, res) => {
    try {
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Solo los administradores pueden ver otros perfiles' });
        }
        const profile = await getUserProfile(req.params.userId);
        if (!profile) {
            return res.status(404).json({ error: 'Usuario no encontrado' });
        }
        return res.json(profile);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.put('/profile', async (req, res) => {
    try {
        const { name, bio, avatarUrl } = req.body;
        // Basic users can only update name, bio, and avatarUrl of their own profile
        const updatedProfile = await updateUserProfile(req.user.userId, { name, bio, avatarUrl });
        return res.json(updatedProfile);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// Admin can update any user's profile
router.put('/profile/:userId', async (req, res) => {
    try {
        if (req.user?.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Solo los administradores pueden actualizar otros perfiles' });
        }

        const { name, bio, avatarUrl, role, isActive, modulePermissions } = req.body;
        const updatedProfile = await updateUserProfile(req.params.userId, {
            name,
            bio,
            avatarUrl,
            role,
            isActive,
            modulePermissions
        });

        return res.json(updatedProfile);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.put('/password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Contraseña actual y nueva son requeridas' });
        }
        await updateUserPassword(req.user.userId, currentPassword, newPassword);
        return res.json({ message: 'Contraseña actualizada correctamente' });
    } catch (error) {
        const status = error.message === 'Contraseña actual incorrecta' ? 400 : 500;
        return res.status(status).json({ error: error.message });
    }
});

// Notes Endpoints
router.get('/notes', async (req, res) => {
    try {
        const notes = await getUserNotes(req.user.userId);
        return res.json(notes);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.post('/notes', async (req, res) => {
    try {
        const { title, content } = req.body;
        if (!title || !content) {
            return res.status(400).json({ error: 'Título y contenido son requeridos' });
        }
        const note = await createUserNote(req.user.userId, { title, content });
        return res.status(201).json(note);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

router.put('/notes/:id', async (req, res) => {
    try {
        const { title, content } = req.body;
        const note = await updateUserNote(req.user.userId, req.params.id, { title, content });
        return res.json(note);
    } catch (error) {
        const status = error.message.includes('permiso') ? 403 : 404;
        return res.status(status).json({ error: error.message });
    }
});

router.delete('/notes/:id', async (req, res) => {
    try {
        await deleteUserNote(req.user.userId, req.params.id);
        return res.json({ message: 'Nota eliminada correctamente' });
    } catch (error) {
        const status = error.message.includes('permiso') ? 403 : 404;
        return res.status(status).json({ error: error.message });
    }
});

export default router;
