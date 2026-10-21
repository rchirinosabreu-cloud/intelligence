import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createServer } from 'vite';
import { createWhatsAppBridgeService } from '../src/services/whatsappBridgeService.js';
import { createWhatsAppWebhookRouter, createBriaWhatsAppRouter } from '../src/routes/api/whatsapp.js';

// Bria en WhatsApp, laboratorio local (20 de octubre de 2026). Sin dotenv, sin base de datos y sin Meta: el
// servicio y las rutas reales sobre un repositorio en memoria, una Bria de muestra que contesta sin modelo y un
// «celular» que recoge lo que Bria le mandaría a Meta. La página enseña la tarjeta del perfil y ese celular.

const APP_SECRET = 'secreto-de-muestra-que-no-es-de-produccion';
const ENV = { META_APP_SECRET: APP_SECRET, META_WHATSAPP_TOKEN: 'token-de-muestra', META_WHATSAPP_PHONE_NUMBER_ID: '1319887801213730', META_WHATSAPP_VERIFY_TOKEN: 'verificacion-de-muestra', META_WHATSAPP_NUMBER: '+573043786298' };
const PERSON = { id: 'u-rodny', name: 'Rodny Muestra', email: 'rodny@example.test', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true, parrillas: true }, sessionVersion: 0, teamMember: { isActive: true } };

const memoryRepository = () => {
  const links = new Map(), codes = new Map(), seen = new Set(), unknown = [];
  return {
    async createCode({ userId, code, expiresAt }) { for (const [k, v] of codes) if (v.userId === userId) codes.delete(k); codes.set(code, { userId, expiresAt }); return true; },
    async consumeCode({ code, waId, profileName, now }) {
      const row = codes.get(code); if (!row) return { ok: false, reason: 'unknown' }; codes.delete(code);
      if (row.expiresAt.getTime() < now.getTime()) return { ok: false, reason: 'expired' };
      links.set(row.userId, { userId: row.userId, waId, profileName, conversationId: null, linkedAt: now, lastMessageAt: null });
      return { ok: true, userId: row.userId };
    },
    async linkByWaId(waId) { return [...links.values()].find((link) => link.waId === waId) || null; },
    async linkByUser(userId) { return links.get(userId) || null; },
    async setConversation(userId, conversationId) { links.get(userId).conversationId = conversationId; },
    async touch(userId, at) { links.get(userId).lastMessageAt = at; },
    async unlink(userId) { links.delete(userId); for (const [k, v] of codes) if (v.userId === userId) codes.delete(k); },
    async rememberInbound(messageId) { if (seen.has(messageId)) return false; seen.add(messageId); return true; },
    async unknownRepliesSince(waId, since) { return unknown.filter((row) => row.waId === waId && row.at >= since).length; },
    async rememberUnknownReply(waId, at) { unknown.push({ waId, at }); }
  };
};

// Una Bria sin modelo: responde con la forma de siempre (Markdown, botones) para ver cómo llega a WhatsApp.
const sampleBria = () => {
  const chats = new Map();
  const answer = (question) => {
    const text = question.toLowerCase();
    if (/pendiente/.test(text)) return { text: 'Así quedaría el pendiente:\n\n**Reel de octubre** · Aristea · Melissa · mañana · Normal\n\n¿Lo creo?', quickReplies: ['Crear pendiente', 'Cancelar pendiente'] };
    if (/crear pendiente/.test(text)) return { text: 'Listo. Creé el pendiente **Reel de octubre** para Melissa: [abrirlo](https://labs.brainstudioagencia.com/gestion?taskId=muestra).' };
    if (/clave|contraseña|acceso/.test(text)) return { text: 'Aquí está el acceso.', accessCards: [{ id: 'muestra' }] };
    return { text: `Hoy tienes **tres** pendientes:\n- Reel de Aristea (vence hoy)\n- Informe de Pablo Hoff\n- Parrilla de Wine & Wonder\n\nMe dijiste: «${question}».` };
  };
  return {
    async create(user) { const id = crypto.randomUUID(); chats.set(id, { id, owner: user.userId, turns: [], revision: 0 }); return { id, turns: [] }; },
    async read(user, id) { const chat = chats.get(id); if (!chat || chat.owner !== user.userId) throw Object.assign(new Error('No encontramos esa conversación.'), { status: 404 }); return chat; },
    async send({ id, question }) { const chat = chats.get(id); chat.turns.push({ role: 'user', text: question }, { role: 'assistant', ...answer(question) }); chat.revision += 1; return chat; }
  };
};

export async function createWhatsAppPreview({ port = 3114 } = {}) {
  const phone = []; // lo que Bria le manda al celular de muestra
  const bria = sampleBria();
  const service = createWhatsAppBridgeService({
    repository: memoryRepository(), conversations: () => bria, env: ENV,
    db: { user: { findUnique: async ({ where }) => (where.id === PERSON.id ? { ...PERSON } : null) } },
    fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); if (body.type === 'text') phone.push({ from: 'bria', text: body.text.body, at: Date.now() }); return { ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.out.${phone.length}` }] }) }; },
    logger: console
  });

  const api = express();
  api.use(express.json({ limit: '50kb', verify: (req, _res, buffer) => { if (req.originalUrl.startsWith('/api/whatsapp/webhook')) req.rawBody = buffer; } }));
  api.use('/api/whatsapp', createWhatsAppWebhookRouter({ service }));
  api.use('/api', (req, _res, next) => { if (req.headers.authorization) req.user = { userId: PERSON.id, role: PERSON.role, modulePermissions: PERSON.modulePermissions }; next(); });
  api.get('/api/auth/me', (_req, res) => res.json({ id: PERSON.id, name: PERSON.name, email: PERSON.email, role: PERSON.role, modulePermissions: PERSON.modulePermissions }));
  api.use('/api/bria/whatsapp', createBriaWhatsAppRouter({ service }));
  // El celular de muestra: lo que la persona escribe llega como un aviso firmado de Meta, igual que en producción.
  api.post('/api/preview/phone', async (req, res) => {
    const text = String(req.body?.text || '').trim(); if (!text) return res.status(400).json({ message: 'Escribe algo.' });
    phone.push({ from: 'me', text, at: Date.now() });
    const body = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: ENV.META_WHATSAPP_PHONE_NUMBER_ID }, contacts: [{ profile: { name: 'Rodny' }, wa_id: '573001234567' }], messages: [{ from: '573001234567', id: `wamid.${crypto.randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }] };
    const raw = Buffer.from(JSON.stringify(body));
    const outcome = await service.handleWebhook({ rawBody: raw, signature: `sha256=${crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`, body });
    await new Promise((resolve) => setTimeout(resolve, 50));
    return res.json({ webhook: outcome, phone });
  });
  api.get('/api/preview/phone', (_req, res) => res.json({ phone }));
  // El perfil completo en /perfil (21 de octubre de 2026), para ver la tarjeta en su sitio: tres columnas.
  api.get('/api/user/profile', (_req, res) => res.json({ id: PERSON.id, name: PERSON.name, email: PERSON.email, role: PERSON.role, bio: 'Director de Brain Studio.', avatarUrl: '' }));
  api.get('/api/user/mfa', (_req, res) => res.json({ enabled: true, required: true, enabledAt: '2026-10-12T15:00:00.000Z', recoveryCodesRemaining: 10 }));
  api.get('/api/user/notes', (_req, res) => res.json([]));
  api.get('/api/user/onboarding', (_req, res) => res.json({ guides: [] }));
  api.all('/api/*', (_req, res) => res.status(404).json({ message: 'Solo Bria en WhatsApp está disponible en esta muestra.' }));

  const root = path.resolve(import.meta.dirname, '..');
  const server = await createServer({
    configFile: false, root, envDir: path.resolve(root, 'tests/fixtures'),
    cacheDir: path.resolve(root, 'node_modules/.vite-whatsapp'), appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/whatsapp-preview.html', 'tests/fixtures/profile-preview.html'] }, esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-whatsapp'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(root, 'src') } }, logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: port !== 0, proxy: {} },
    plugins: [{ name: 'isolated-whatsapp-preview', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
        const { pathname } = new URL(req.url, 'http://localhost');
        if (pathname.startsWith('/api/')) return api(req, res, next);
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = pathname.startsWith('/perfil') ? '/tests/fixtures/profile-preview.html' : '/tests/fixtures/whatsapp-preview.html';
        return next();
      });
    } }]
  });
  await server.listen();
  return { origin: `http://127.0.0.1:${server.httpServer.address().port}`, phone, service, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createWhatsAppPreview();
  console.log(`Bria en WhatsApp local: ${preview.origin}/`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
