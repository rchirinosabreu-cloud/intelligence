import express from 'express';
import multer from 'multer';
import { getUserProfile, updateUserProfile, updateUserPassword } from '../../services/userService.js';
import { getUserNotes, createUserNote, updateUserNote, deleteUserNote } from '../../services/userNoteService.js';
import { getOnboarding, acknowledgeOnboarding } from '../../services/onboardingService.js';
import { replaceProfileAvatar } from '../../services/avatarService.js';
import { mfaService } from '../../services/mfa.js';
import { MfaError } from '../../services/mfaService.js';

const router = express.Router();

// Own profile photo (any authenticated member): the image arrives already framed by the client.
const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

router.put('/avatar', avatarUpload.single('avatar'), async (req, res) => {
    const file = req.file;
    if (!file) {
        return res.status(400).json({ error: 'No se proporcionó ninguna imagen.' });
    }
    if (!file.mimetype.startsWith('image/') || file.mimetype === 'image/svg+xml') {
        return res.status(415).json({ error: 'La foto debe ser una imagen segura (JPG, PNG o WEBP).' });
    }
    try {
        const { avatarUrl } = await replaceProfileAvatar({ userId: req.user.userId, file });
        return res.json({ success: true, avatarUrl });
    } catch (error) {
        const status = error.statusCode || 500;
        if (status >= 500) console.error('[Avatar] Upload failed:', error);
        return res.status(status).json({ error: status >= 500 ? 'No se pudo guardar la foto. Inténtalo de nuevo.' : error.message });
    }
});

router.get('/onboarding', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    try { return res.json(await getOnboarding(req.user.userId)); }
    catch (error) { console.error('[Onboarding] Read failed:', error.message); return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'No se pudo consultar la bienvenida.' }); }
});
router.post('/onboarding', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    try { return res.json(await acknowledgeOnboarding(req.user.userId, req.body)); }
    catch (error) { console.error('[Onboarding] Save failed:', error.message); return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'No se pudo guardar el avance. Inténtalo de nuevo.' }); }
});

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
        return res.json({ message: 'Contraseña actualizada correctamente', requiresLogin: true });
    } catch (error) {
        const status = error.message === 'Contraseña actual incorrecta' ? 400 : 500;
        return res.status(status).json({ error: error.message });
    }
});

// Verificación en dos pasos (27 de septiembre de 2026). Siempre sobre la cuenta de la
// sesión; el restablecimiento de otra persona es solo de administradores.
const sendMfaError = (res, error, action) => {
    if (error instanceof MfaError) return res.status(error.status).json({ code: error.code, error: error.message });
    console.error(`[MFA] ${action} failed:`, error?.message || error);
    return res.status(500).json({ error: 'No se pudo completar la verificación en dos pasos. Inténtalo de nuevo.' });
};

router.get('/mfa', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    try { return res.json(await mfaService.getStatus(req.user.userId)); }
    catch (error) { return sendMfaError(res, error, 'Status'); }
});

router.post('/mfa/setup', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    try { return res.json(await mfaService.beginEnrollment(req.user.userId)); }
    catch (error) { return sendMfaError(res, error, 'Setup'); }
});

router.post('/mfa/confirm', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    try {
        const result = await mfaService.confirmEnrollment(req.user.userId, req.body?.code);
        return res.json(result);
    } catch (error) { return sendMfaError(res, error, 'Confirm'); }
});

router.post('/mfa/recovery-codes', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, private');
    try {
        const result = await mfaService.regenerateRecoveryCodes(req.user.userId, req.body?.code);
        return res.json(result);
    } catch (error) { return sendMfaError(res, error, 'Recovery codes'); }
});

router.delete('/mfa', async (req, res) => {
    try {
        const result = await mfaService.disable(req.user.userId, { password: req.body?.password, code: req.body?.code });
        return res.json(result);
    } catch (error) { return sendMfaError(res, error, 'Disable'); }
});

router.post('/mfa/reset/:userId', async (req, res) => {
    try {
        const result = await mfaService.adminReset(req.user, req.params.userId);
        return res.json(result);
    } catch (error) { return sendMfaError(res, error, 'Admin reset'); }
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
