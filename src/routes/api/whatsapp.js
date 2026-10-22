import express from 'express';
import { canUseBria } from '../../lib/briaLivingMemory.js';
import { getWhatsAppBridgeService } from '../../services/whatsappBridgeService.js';

// Bria en WhatsApp (20 de octubre de 2026). Dos puertas:
// - `/api/whatsapp/webhook`, pública a propósito: Meta no puede iniciar sesión, así que la cerradura es la firma
//   HMAC-SHA256 con el secreto de la app sobre los bytes originales (server.js conserva `req.rawBody` solo para
//   esta ruta). El GET es la verificación de Meta al registrar el webhook. Se responde 200 y se trabaja después.
// - `/api/bria/whatsapp`, con sesión y Bria activa: el estado del vínculo, el código para vincular y desvincular.
//   Vive bajo /api/bria, fuera del mapa de la plataforma: Bria no se vincula números a sí misma.

export const createWhatsAppWebhookRouter = ({ service } = {}) => {
  const router = express.Router();
  const resolve = () => service || getWhatsAppBridgeService();
  router.get('/webhook', (req, res) => {
    const challenge = resolve().verificationChallenge(req.query);
    if (!challenge) return res.status(403).json({ error: 'WHATSAPP_VERIFY_TOKEN_INVALID' });
    return res.status(200).type('text/plain').send(challenge);
  });
  router.post('/webhook', async (req, res) => {
    try {
      const outcome = await resolve().handleWebhook({ rawBody: req.rawBody, signature: req.headers['x-hub-signature-256'], body: req.body });
      return res.status(outcome.status).json(outcome.body);
    } catch (failure) {
      console.error('[WhatsApp] Error procesando el aviso:', failure.code || failure.message || failure);
      return res.status(500).json({ error: 'WHATSAPP_WEBHOOK_FAILED' });
    }
  });
  return router;
};

const briaUsers = (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Inicia sesión.' });
  return canUseBria(req.user) ? next() : res.status(403).json({ message: 'Bria no está activada para tu cuenta.' });
};
briaUsers.permission = { modules: ['bria'] };

export const createBriaWhatsAppRouter = ({ service } = {}) => {
  const router = express.Router();
  const resolve = () => service || getWhatsAppBridgeService();
  router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(briaUsers);
  const handle = (work) => async (req, res) => {
    try { res.json(await work(req, resolve())); }
    catch (failure) {
      const status = Number.isInteger(failure.status) ? failure.status : 500;
      if (status === 500) console.error('[WhatsApp]', failure?.message || failure);
      res.status(status).json({ message: status === 500 ? 'No se pudo completar la operación.' : failure.message, ...(failure.code && status !== 500 ? { code: failure.code } : {}) });
    }
  };
  const userId = (req) => req.user.userId || req.user.id;
  router.get('/', handle((req, instance) => instance.status(userId(req))));
  router.post('/link-code', handle((req, instance) => instance.createLinkCode(userId(req))));
  router.delete('/', handle((req, instance) => instance.unlink(userId(req))));
  return router;
};
