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
  const links = new Map(), codes = new Map(), seen = new Set(), unknown = [], alerts = new Map();
  return {
    links,
    async createCode({ userId, code, expiresAt }) { for (const [k, v] of codes) if (v.userId === userId) codes.delete(k); codes.set(code, { userId, expiresAt }); return true; },
    async consumeCode({ code, waId, phone = null, profileName, now }) {
      const row = codes.get(code); if (!row) return { ok: false, reason: 'unknown' }; codes.delete(code);
      if (row.expiresAt.getTime() < now.getTime()) return { ok: false, reason: 'expired' };
      links.set(row.userId, { userId: row.userId, waId, phone, profileName, conversationId: null, linkedAt: now, lastMessageAt: null, lastInboundAt: now, alertsOff: links.get(row.userId)?.alertsOff || [] });
      return { ok: true, userId: row.userId };
    },
    async linkByWaId(waId) { return [...links.values()].find((link) => link.waId === waId) || null; },
    async linkByUser(userId) { return links.get(userId) || null; },
    async setPhone(userId, phone) { links.get(userId).phone = phone; },
    async setConversation(userId, conversationId) { links.get(userId).conversationId = conversationId; },
    async touch(userId, at) { links.get(userId).lastMessageAt = at; },
    async markInbound(userId, at) { links.get(userId).lastInboundAt = at; },
    async setAlertsOff(userId, kinds) { links.get(userId).alertsOff = kinds; },
    async unlink(userId) { links.delete(userId); for (const [k, v] of codes) if (v.userId === userId) codes.delete(k); },
    async rememberInbound(messageId) { if (seen.has(messageId)) return false; seen.add(messageId); return true; },
    async unknownRepliesSince(waId, since) { return unknown.filter((row) => row.waId === waId && row.at >= since).length; },
    async rememberUnknownReply(waId, at) { unknown.push({ waId, at }); },
    async alertsSince(userId, since) { return [...alerts.values()].filter((row) => row.userId === userId && row.createdAt >= since).length; },
    async saveAlert(row) { const saved = { ...row, id: crypto.randomUUID(), status: 'PENDING' }; alerts.set(saved.id, saved); return saved; },
    async alertById(id) { return alerts.get(id) || null; },
    async markAlertSent(id, via) { Object.assign(alerts.get(id), { status: 'SENT', via }); },
    async markAlertFailed(id, error) { Object.assign(alerts.get(id), { status: 'FAILED', error }); },
    async markAlertOpened(id, at) { alerts.get(id).openedAt = at; }
  };
};

// Lo que Bria le mandaría a Meta, como se vería en el celular: texto, botones, lista o la plantilla de aviso.
const phoneMessage = (body) => {
  if (body.type === 'text') return { text: body.text.body };
  if (body.type === 'interactive') {
    const { interactive } = body;
    const buttons = interactive.type === 'button'
      ? interactive.action.buttons.map((row) => ({ id: row.reply.id, title: row.reply.title }))
      : interactive.action.sections.flatMap((section) => section.rows.map((row) => ({ id: row.id, title: row.title, description: row.description || null, list: true })));
    return { text: interactive.body.text, footer: interactive.footer?.text || null, buttons, listButton: interactive.type === 'list' ? interactive.action.button : null };
  }
  if (body.type === 'template') {
    const [name, topic] = body.template.components[0].parameters.map((row) => row.text);
    const payload = body.template.components[1].parameters[0].payload;
    return { text: `Hola ${name}, tienes un aviso nuevo de Bria sobre ${topic}. Tócalo para verlo aquí mismo.`, buttons: [{ id: payload, title: 'Ver aviso', template: true }], template: true };
  }
  return null;
};

// Una Bria sin modelo: responde con la forma de siempre (Markdown, botones) para ver cómo llega a WhatsApp.
const sampleBria = () => {
  const chats = new Map();
  const answer = (question) => {
    const text = question.toLowerCase();
    if (/^(crear pendiente|dale|sí|si)\b/.test(text)) return { text: 'Listo. Creé el pendiente **Reel de octubre** para Melissa: [abrirlo](https://labs.brainstudioagencia.com/gestion?taskId=muestra).' };
    if (/asign|quién/.test(text)) return { text: '¿A quién se lo asignamos?', quickReplies: ['Melissa Castaño', 'Kamila Pérez', 'Helen Ruiz', 'Jarlan Gómez', 'Camila Pérez'] };
    if (/resúmeme|resumen/.test(text)) return { text: 'Melissa tiene **dos** pendientes para hoy: el reel de Aristea y las historias de Endova.' };
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
  const repository = memoryRepository();
  // Las decisiones de los botones de un aviso, sin bóveda real: lo que diría la plataforma.
  const actions = {
    vault: async () => ({ decideRequest: async (_user, _id, decision) => ({ decided: true, message: decision === 'APPROVE' ? 'Compartiste la contraseña de CapCut con Camila.' : 'Denegaste el acceso de Camila a la contraseña de CapCut.' }) }),
    permissions: async () => ({ decide: async (_user, _id, decision) => ({ decided: true, message: decision === 'APPROVE' ? 'Le diste acceso a Financiero a Camila.' : 'Denegaste el acceso de Camila a Financiero.' }) }),
    pulse: async () => ({ dismissMessage: async () => true })
  };
  const service = createWhatsAppBridgeService({
    repository, conversations: () => bria, env: ENV, actions,
    db: { user: { findUnique: async ({ where }) => (where.id === PERSON.id ? { ...PERSON } : null) } },
    fetchImpl: async (_url, options) => { const body = JSON.parse(options.body); const shown = phoneMessage(body); if (shown) phone.push({ from: 'bria', ...shown, at: Date.now() }); return { ok: true, status: 200, json: async () => ({ messages: [{ id: `wamid.out.${phone.length}` }] }) }; },
    logger: console
  });

  const api = express();
  api.use(express.json({ limit: '50kb', verify: (req, _res, buffer) => { if (req.originalUrl.startsWith('/api/whatsapp/webhook')) req.rawBody = buffer; } }));
  api.use('/api/whatsapp', createWhatsAppWebhookRouter({ service }));
  api.use('/api', (req, _res, next) => { if (req.headers.authorization) req.user = { userId: PERSON.id, role: PERSON.role, modulePermissions: PERSON.modulePermissions }; next(); });
  api.get('/api/auth/me', (_req, res) => res.json({ id: PERSON.id, name: PERSON.name, email: PERSON.email, role: PERSON.role, modulePermissions: PERSON.modulePermissions }));
  api.use('/api/bria/whatsapp', createBriaWhatsAppRouter({ service }));
  // El celular de muestra: lo que la persona escribe llega como un aviso firmado de Meta, igual que en producción.
  // Tocar un botón llega como en producción: un botón o una fila de lista (interactive) o el botón de una plantilla.
  api.post('/api/preview/phone', async (req, res) => {
    const text = String(req.body?.text || '').trim(); if (!text) return res.status(400).json({ message: 'Escribe algo.' });
    const replyId = req.body?.replyId ? String(req.body.replyId) : null;
    phone.push({ from: 'me', text, at: Date.now() });
    const kind = !replyId ? { type: 'text', text: { body: text } }
      : req.body.template ? { type: 'button', button: { text, payload: replyId } }
        : { type: 'interactive', interactive: req.body.list ? { type: 'list_reply', list_reply: { id: replyId, title: text } } : { type: 'button_reply', button_reply: { id: replyId, title: text } } };
    const body = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: ENV.META_WHATSAPP_PHONE_NUMBER_ID }, contacts: [{ profile: { name: 'Rodny' }, wa_id: '573001234567' }], messages: [{ from: '573001234567', id: `wamid.${crypto.randomUUID()}`, timestamp: String(Math.floor(Date.now() / 1000)), ...kind }] } }] }] };
    const raw = Buffer.from(JSON.stringify(body));
    const outcome = await service.handleWebhook({ rawBody: raw, signature: `sha256=${crypto.createHmac('sha256', APP_SECRET).update(raw).digest('hex')}`, body });
    await new Promise((resolve) => setTimeout(resolve, 50));
    return res.json({ webhook: outcome, phone });
  });
  api.get('/api/preview/phone', (_req, res) => res.json({ phone }));
  // Un aviso de muestra: un pedido de acceso o un aviso del pulso; `fuera` simula que pasó más de un día sin escribir.
  api.post('/api/preview/alert', async (req, res) => {
    const link = repository.links.get(PERSON.id);
    if (!link) return res.status(409).json({ message: 'Primero vincula el WhatsApp de muestra.' });
    if (req.body?.fuera) link.lastInboundAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const { accessAlert, pulseAlert } = await import('../src/lib/whatsappAlerts.js');
    const alert = req.body?.kind === 'PULSE'
      ? pulseAlert({ id: crypto.randomUUID(), title: 'Melissa no tiene una tarea en proceso desde las 10:05', body: 'Tiene tres pendientes para hoy; conviene preguntarle en qué está.', actions: [{ label: 'Ver sus pendientes', to: '/gestion?responsable=Melissa%20Casta%C3%B1o' }, { label: 'Que Bria me resuma lo que tiene', ask: 'Resúmeme qué tiene pendiente Melissa hoy y qué le vence pronto.' }] })
      : accessAlert({ type: 'VAULT', request: { id: crypto.randomUUID() }, text: 'Camila necesita la contraseña de CapCut (Brain Studio).' });
    return res.json({ result: await service.deliverAlert({ userId: PERSON.id, ...alert }), phone });
  });
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
