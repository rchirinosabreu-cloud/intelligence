import express from 'express';
import { getClientByIdentifier } from '../../services/clientService.js';

const router = express.Router();

// Get specific client details (supports ID or Slug)
router.get('/clients/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const client = await getClientByIdentifier(id);
        if (!client) return res.status(404).json({ error: 'Cliente no encontrado' });
        return res.json(client);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

// La lista (GET /api/db/clients) la atiende clientController.listClients, registrada
// en src/routes/index.js antes de este router: un manejador aquí nunca se alcanzaría.

export default router;
