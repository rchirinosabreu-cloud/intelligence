import { validateClientEdit } from '../lib/clientEdit.js';

export function createUpdateClientHandler({ db, logger = console }) {
  return async (req, res) => {
    try {
      const data = validateClientEdit(req.body);
      const updated = await db.client.update({ where: { id: req.params.id }, data });
      return res.json(updated);
    } catch (error) {
      logger.error('[ClientController] Failed to update client:', error.response?.data || error);
      if (error.statusCode === 400) return res.status(400).json({ error: error.message });
      if (error.code === 'P2002') return res.status(409).json({ error: 'Ese slug ya está en uso. Elige otro.' });
      if (error.code === 'P2025') return res.status(404).json({ error: 'El cliente ya no existe.' });
      return res.status(500).json({ error: 'No se pudieron guardar los cambios del cliente. Inténtalo nuevamente.' });
    }
  };
}
