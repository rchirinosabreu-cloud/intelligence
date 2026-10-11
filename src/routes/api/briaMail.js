import express from 'express';
import { canUseBria } from '../../lib/briaLivingMemory.js';
import { isManagerRole } from '../../config/security.js';
import { getMailboxService } from '../../services/mailboxService.js';

// Los buzones compartidos que lee Bria (11 de octubre de 2026). Ver la lista es de administradores y project
// managers con Bria; conectar, probar y quitar es solo de administradores. La contraseña de aplicación entra por
// POST una vez, se sella en el servidor y ninguna respuesta la devuelve. Vive bajo /api/bria, fuera del mapa de la
// plataforma: Bria no se conecta buzones a sí misma.
const managers = (req, res, next) => canUseBria(req.user) && isManagerRole(req.user?.role) ? next() : res.status(403).json({ message: 'Bria no está activada para tu cuenta.' });
managers.permission = { role: 'MANAGER', modules: ['bria'] };
const admins = (req, res, next) => String(req.user?.role || '').toUpperCase() === 'ADMIN' ? next() : res.status(403).json({ message: 'Conectar un buzón es de administradores.' });
admins.permission = { role: 'ADMIN' };

export const createBriaMailRouter = ({ service } = {}) => {
  const router = express.Router();
  const resolve = () => service || getMailboxService();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(managers);
  const handle = (work) => async (req, res) => {
    try { res.json(await work(req, resolve())); }
    catch (failure) {
      const status = Number.isInteger(failure.status) ? failure.status : 500;
      if (status === 500) console.error('[BriaMail]', failure?.message || failure);
      res.status(status).json({ message: status === 500 ? 'No se pudo completar la operación con el buzón.' : failure.message, ...(failure.code && status !== 500 ? { code: failure.code } : {}) });
    }
  };
  router.get('/accounts', handle(async (_req, instance) => ({ accounts: await instance.list() })));
  router.post('/accounts', admins, handle((req, instance) => instance.connect({ email: req.body?.email, label: req.body?.label, appPassword: req.body?.appPassword, actor: { ref: req.user?.userId || req.user?.id, name: req.user?.name || null } })));
  router.post('/accounts/:id/test', admins, handle((req, instance) => instance.test(req.params.id)));
  router.delete('/accounts/:id', admins, handle((req, instance) => instance.remove(req.params.id)));
  return router;
};
