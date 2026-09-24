import express from 'express';
import { readFile } from 'node:fs/promises';
import { getGovernanceService } from '../../services/aiGovernanceService.js';
import { GOVERNANCE_DOCUMENTS } from '../../lib/aiGovernance.js';

export function createAiGovernanceRouter({ service } = {}) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!req.user?.userId) return res.status(401).json({ error: 'Inicia sesión.' });
    next();
  });
  const run = fn => async (req, res) => {
    try { await fn(req, res, service || getGovernanceService()); }
    catch (error) {
      console.error('[Gobierno IA]', error.response?.data || error.message);
      const status = [400, 403, 404, 409].includes(error.status) ? error.status : 500;
      res.status(status).json({ error: status === 500 ? 'No se pudo completar la operación. Intenta de nuevo.' : error.message, code: status === 500 ? 'GOVERNANCE_UNAVAILABLE' : error.code });
    }
  };
  router.get('/options', run(async (req, res, s) => res.json(await s.options(req.user.userId))));
  router.get('/documents/:id', run(async (req, res, s) => {
    // Check membership before reading private documents. Filenames only come from this allowlist.
    await s.options(req.user.userId);
    const doc = GOVERNANCE_DOCUMENTS.find(d => d.id === req.params.id);
    if (!doc) return res.status(404).json({ error: 'Documento no encontrado.' });
    const content = await readFile(new URL(`../../../docs/seguridad-ia/${doc.id}.md`, import.meta.url), 'utf8');
    res.attachment(`${doc.id}.md`).type('text/markdown').send(content);
  }));
  router.put('/policy/:clientId', run(async (req, res, s) => res.json(await s.setPolicy(req.user.userId, req.params.clientId, req.body))));
  router.get('/:kind/:id/history', run(async (req, res, s) => res.json(await s.history(req.user.userId, req.params.kind, req.params.id))));
  router.get('/:kind', run(async (req, res, s) => res.json(await s.list(req.user.userId, req.params.kind, req.query))));
  router.post('/:kind', run(async (req, res, s) => res.status(201).json(await s.save(req.user.userId, req.params.kind, null, req.body))));
  router.patch('/:kind/:id', run(async (req, res, s) => res.json(await s.save(req.user.userId, req.params.kind, req.params.id, req.body))));
  return router;
}
