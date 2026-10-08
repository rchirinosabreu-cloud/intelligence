import express from 'express';
import { canUseBria } from '../../lib/briaLivingMemory.js';
import { knowledgeError } from '../../lib/briaKnowledge.js';
import { createRateLimiter } from '../../config/security.js';
const uuid = value => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value || '');
export const createBriaKnowledgeRouter = ({ service } = {}) => {
  const router = express.Router();
  const resolve = async () => service || (await import('../../services/briaKnowledgeApplication.js')).getApplicationKnowledgeService();
  router.use((req, res, next) => canUseBria(req.user) ? next() : res.status(403).json({ message: 'Bria no está activada para tu cuenta.' }));
  router.use(createRateLimiter({ windowMs: 60000, max: 40, keyGenerator: req => req.user?.userId || req.user?.id || req.ip }));
  const handle = work => async (req, res) => {
    try { res.json(await work(req, await resolve())); }
    catch (failure) { const status = Number.isInteger(failure.status) ? failure.status : 500; res.status(status).json({ message: status === 500 ? 'No se pudo guardar o consultar el aprendizaje.' : failure.message, error: status === 500 ? 'KNOWLEDGE_FAILED' : failure.code }); }
  };
  const adminRegistry = (req, res, next) => req.user?.role === 'ADMIN' ? next() : res.status(403).json({ message: 'El Registro está disponible solo para administradores.' });
  router.get('/', adminRegistry, handle((req, instance) => instance.registry(req.user, req.query.q)));
  router.post('/', handle((req, instance) => {
    if (req.body?.id && !uuid(req.body.id)) throw knowledgeError('Aprendizaje no válido.');
    if (req.body?.id && (!Number.isSafeInteger(req.body.expectedRevision) || req.body.expectedRevision < 1)) throw knowledgeError('Recarga el aprendizaje antes de ajustarlo.');
    return instance.save(req.user, req.body);
  }));
  router.get('/:id/history', adminRegistry, handle((req, instance) => { if (!uuid(req.params.id)) throw knowledgeError('Aprendizaje no válido.'); return instance.registryHistory(req.user, req.params.id); }));
  router.post('/:id/undo', handle((req, instance) => {
    if (!uuid(req.params.id) || !Number.isSafeInteger(req.body?.expectedRevision) || req.body.expectedRevision < 1) throw knowledgeError('Recarga el aprendizaje antes de deshacerlo.');
    return instance.undo(req.user, req.params.id, req.body.expectedRevision);
  }));
  router.post('/:id/revoke', handle((req, instance) => {
    if (!uuid(req.params.id) || !Number.isSafeInteger(req.body?.expectedRevision) || req.body.expectedRevision < 1) throw knowledgeError('Recarga el aprendizaje antes de retirarlo.');
    return instance.revoke(req.user, req.params.id, req.body.expectedRevision);
  }));
  return router;
};
