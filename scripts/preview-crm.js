import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import express from 'express';
import { createServer } from 'vite';
import { createCrmRouter } from '../src/routes/api/crm.js';
import { createCrmMemoryDb } from '../tests/fixtures/crmMemoryDb.js';
import { crmDemoLeads, crmDemoActivities, crmDemoMembers, crmDemoUsers, crmDemoUser, crmDemoRequests } from '../tests/fixtures/crmData.js';
import { createImportantNoticeRouter } from '../src/routes/api/importantNotices.js';

// Two notices for the demo user: the coral review goes first; the green follow-up comes five minutes after deciding.
// With `cartera`, the demo user is the administrative area and sees a collection notice (28 de octubre de 2026) instead.
const createImportantNoticeMemory = (crmDb, userId, { cartera = false, now = null } = {}) => {
  let offset = 0;
  const fixedNow = now === null ? null : new Date(now).getTime();
  const clock = () => new Date((fixedNow ?? Date.now()) + offset);
  const rows = (cartera ? [
    { id: 'aviso-cartera', kind: 'CARTERA_MENSUAL', level: 'IMPORTANTE', subjectId: 'cliente-nuva', label: 'Cartera vencida', message: 'Cliente de prueba A tiene 2 cuentas vencidas en 2 períodos desde agosto: $3.200.000 pendientes', url: '/financiero?tab=cartera' },
    { id: 'aviso-puntual', kind: 'CARTERA_UNICO', level: 'SEGUIMIENTO', subjectId: 'cuenta-grit', label: 'Cartera · cuenta vencida', message: 'Cliente de prueba B lleva 22 días vencida la cuenta de cobro No. 0395: $1.500.000 pendientes', url: '/financiero?tab=cartera' }
  ] : [
    { id: 'aviso-revision', kind: 'CRM_REVIEW', level: 'IMPORTANTE', subjectId: 'lead-centro', label: 'Revisión · 30 días', message: 'Centro Andino lleva 30 días sin responder: ¿sigue o no?' },
    { id: 'aviso-seguimiento', kind: 'CRM_FOLLOW_UP', level: 'SEGUIMIENTO', subjectId: 'lead-calzado', label: 'Seguimiento comercial', message: 'Calzado Andino lleva 10 días sin responder la propuesta' }
  ]).map((row) => ({ userId, url: `/crm/oportunidades/${row.subjectId}`, createdAt: clock(), snoozedUntil: null, decidedAt: null, resolvedAt: null, resolution: null, notificationId: null, ...row }));
  // Two overdue periods and an individual obligation, all fictitious. The live service recalculates their notices.
  const owed = (id, period) => ({ id, kind: 'CLIENTE', status: 'DEBE', amount: 1600000, period, issuedAt: null, dueDate: null, number: null, payments: [] });
  const collectionClients = [
    { id: 'cliente-nuva', name: 'Cliente de prueba A', contracts: [{ serviceType: 'PARRILLA', startDate: '2026-08-01' }], accountsReceivables: [owed('n-ago', '2026-08-01'), owed('n-sep', '2026-09-01')] },
    { id: 'cliente-grit', name: 'Cliente de prueba B', contracts: [], accountsReceivables: [] }
  ];
  const collectionActivities = [];
  const collection = cartera ? {
    teamMember: { findFirst: async () => ({ role: 'Coordinadora Administrativa y Contable', areas: ['ADMINISTRATIVA', 'COMERCIAL'] }) },
    // Los avisos de cartera exigen permiso financiero vigente, releído de la cuenta (6 de noviembre de 2026): sin
    // `user.findUnique` el servicio no puede comprobarlo y no muestra ninguno.
    user: { ...crmDb.user, findUnique: async ({ where }) => (where.id === userId
      ? { id: userId, isActive: true, role: 'ADMIN', modulePermissions: { dashboard: true, crm: true, financiero: true }, teamMember: { isActive: true } }
      : null) },
    collectionSetting: { findUnique: async () => null },
    client: { findUnique: async ({ where }) => collectionClients.find(client => client.id === where.id) || null },
    accountsReceivable: { findUnique: async ({ where }) => {
      if (where.id === 'cuenta-grit') return { ...owed('cuenta-grit', '2026-09-01'), amount: 1500000, number: 395, clientId: 'cliente-grit', client: collectionClients[1] };
      const client = collectionClients.find(item => item.accountsReceivables.some(receivable => receivable.id === where.id));
      return client ? { ...client.accountsReceivables.find(item => item.id === where.id), clientId: client.id, client } : null;
    } },
    collectionActivity: {
      findFirst: async ({ where }) => collectionActivities.find(activity => activity.clientId === where.clientId && (activity.receivableId || null) === where.receivableId && activity.occurredAt > where.occurredAt.gt) || null,
      upsert: async ({ where, create }) => {
        const previous = collectionActivities.find(activity => activity.noticeId === where.noticeId);
        if (previous) return previous;
        const activity = { id: `gestion-${collectionActivities.length + 1}`, ...create };
        collectionActivities.push(activity);
        return activity;
      },
      create: async ({ data }) => {
        if (data.noticeId && collectionActivities.some(activity => activity.noticeId === data.noticeId)) throw Object.assign(new Error('Gestión ya registrada'), { code: 'P2002' });
        const activity = { id: `gestion-${collectionActivities.length + 1}`, ...data };
        collectionActivities.push(activity);
        return activity;
      }
    }
  } : {};
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'not' in value) return row[key] !== value.not;
    if (value && typeof value === 'object' && Array.isArray(value.in)) return value.in.includes(row[key]);
    return row[key] === value;
  });
  const contact = new Set(['LLAMADA', 'CORREO', 'WHATSAPP', 'MENSAJE_LINKEDIN', 'REUNION', 'PROPUESTA_ENVIADA', 'RESPUESTA_CLIENTE']);
  const db = Object.create(crmDb);
  Object.assign(db, {
    $transaction: async (work) => work(db),
    importantNotice: {
      findMany: async ({ where }) => rows.filter((row) => matches(row, where)),
      findFirst: async ({ where, orderBy }) => rows.filter((row) => matches(row, where)).sort((a, b) => (orderBy?.decidedAt ? b.decidedAt - a.decidedAt : 0))[0] || null,
      update: async ({ where, data }) => Object.assign(rows.find((row) => row.id === where.id), data),
      // Una decisión compartida retira los avisos equivalentes de las demás personas (`resolve` en el servicio).
      updateMany: async ({ where, data }) => {
        const hits = rows.filter((row) => matches(row, where));
        hits.forEach((row) => Object.assign(row, data));
        return { count: hits.length };
      }
    },
    // The memory CRM ignores relation filters: only contact activities after the notice count as «already handled».
    crmLead: {
      ...crmDb.crmLead,
      findUnique: async (args) => {
        const lead = await crmDb.crmLead.findUnique(args);
        const after = args.select?.activities?.where?.occurredAt?.gt;
        if (!lead || !after) return lead;
        return { ...lead, activities: (lead.activities || []).filter((item) => contact.has(item.type) && new Date(item.occurredAt) > new Date(after)) };
      }
    },
    notification: { updateMany: async () => ({ count: 0 }) },
    ...collection
  });
  return { db, clock, advance: (minutes) => { offset += minutes * 60 * 1000; } };
};

// Local laboratory for the CRM screens: the real router and service run over an in-memory store.
// No dotenv, no database, no production server, no external calls.
export async function createCrmPreview({ port = 3100, cartera = false, now = null } = {}) {
  // The real catalog, so «Crear borrador» prices the lines exactly as production would.
  const catalog = JSON.parse(await readFile(path.resolve(import.meta.dirname, '../data/service_catalog_2026.json'), 'utf8'))
    .map((service, index) => ({ id: `svc-${index + 1}`, category: service.category, name: service.name, description: service.description, costo_real_estimado: service.estimatedCost, valor_neto: service.finalPrice, activo: true }));
  const db = createCrmMemoryDb({ leads: crmDemoLeads, activities: crmDemoActivities, members: crmDemoMembers, users: crmDemoUsers, requests: crmDemoRequests, catalog });
  const api = express();
  api.use(express.json());
  api.use((req, _res, next) => {
    req.user = { userId: crmDemoUser.id, role: crmDemoUser.role, modulePermissions: { ...crmDemoUser.modulePermissions, ...(cartera ? { financiero: true } : {}) } };
    next();
  });
  // La conversación de WhatsApp de ejemplo (26 de noviembre de 2026): un prospecto que llegó por un anuncio, con
  // la bienvenida de Bria y una respuesta del equipo. Nada sale a Meta; responder la suma a la lista.
  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000);
  const waMessages = [
    { id: 'wa-1', direction: 'IN', author: 'CONTACT', type: 'text', text: 'Hola, vi su anuncio. Quiero cotizar el manejo de redes para mi centro de estética.', referral: { sourceType: 'ad', headline: 'Redes que venden' }, occurredAt: minutesAgo(42) },
    { id: 'wa-2', direction: 'OUT', author: 'BRIA', authorName: 'Bria', type: 'text', text: '¡Hola, Rous! Gracias por escribir a Brain Studio. Soy Bria, la asistente de la agencia.\n\nYa le avisé a nuestro equipo comercial y una persona te responde muy pronto. Mientras tanto, cuéntanos qué necesitas para tu marca y para cuándo.\n\nPara atenderte guardamos tu nombre, tu número y esta conversación según nuestra política de datos. ¿Nos autorizas?', status: 'READ', occurredAt: minutesAgo(42) },
    { id: 'wa-2b', direction: 'IN', author: 'CONTACT', type: 'interactive', text: 'Acepto', occurredAt: minutesAgo(41) },
    { id: 'wa-2c', direction: 'OUT', author: 'BRIA', authorName: 'Bria', type: 'text', text: '¡Gracias, Rous! Para tu centro de estética te puede servir *Gestión de redes sociales*: incluye la parrilla mensual, el diseño de las piezas y la publicación. Su precio de referencia es desde $1.800.000 al mes; la propuesta final la confirma el equipo según el alcance. ¿Para cuándo te gustaría empezar y en qué ciudad estás?', status: 'READ', occurredAt: minutesAgo(41) },
    { id: 'wa-3', direction: 'IN', author: 'CONTACT', type: 'text', text: 'En Cartagena, quisiera empezar en enero. Tengo como 2 millones al mes', occurredAt: minutesAgo(40) },
    { id: 'wa-3b', direction: 'OUT', author: 'BRIA', authorName: 'Bria', type: 'text', text: 'Perfecto, con eso ya podemos armarte una propuesta. Le paso tu mensaje a una persona del equipo comercial y te escribe muy pronto por aquí.', status: 'READ', occurredAt: minutesAgo(40) },
    { id: 'wa-4', direction: 'OUT', author: 'TEAM', authorName: 'Francys Pérez', type: 'text', text: 'Hola Rous, soy Francys. ¿Te puedo llamar hoy a las 3 para entender lo que necesitas?', status: 'DELIVERED', occurredAt: minutesAgo(25) }
  ];
  const rousBria = { pausedAt: minutesAgo(40), reason: 'Bria pasó la conversación: quiere propuesta para enero, presupuesto de unos 2 millones al mes.' };
  const whatsapp = {
    prospects: async () => ({
      conversationForLead: async (leadId) => (leadId === 'lead-rous'
        ? { contacts: [{ id: 'c1', phone: '+57 310 000 0004', profileName: 'Rous Ruiz', lastInboundAt: minutesAgo(40), canReply: true, authorizationPending: false, dataAuthorizedAt: minutesAgo(41), botPausedAt: rousBria.pausedAt, botPausedReason: rousBria.reason, brief: { serviceInterest: 'Gestión de redes sociales', company: 'Centro de estética Rous', sector: 'Belleza y estética', city: 'Cartagena', timeline: 'Enero', budget: 'Unos $2.000.000 al mes', summary: 'Quiere manejo de redes para su centro de estética desde enero, con unos 2 millones al mes.' }, windowClosesAt: new Date(minutesAgo(40).getTime() + (24 * 60 - 15) * 60 * 1000) }], messages: waMessages, maxLength: 4096, briaAvailable: true }
        : { contacts: [], messages: [], maxLength: 4096, briaAvailable: true }),
      setBria: async (leadId, payload) => {
        Object.assign(rousBria, payload.active ? { pausedAt: null, reason: null } : { pausedAt: new Date(), reason: 'Francys Pérez tomó la conversación.' });
        return { contact: { id: 'c1' } };
      },
      reply: async (leadId, payload) => {
        const message = { id: `wa-${waMessages.length + 1}`, direction: 'OUT', author: 'TEAM', authorName: 'Francys Pérez', type: 'text', text: String(payload.text || '').trim(), status: 'SENT', occurredAt: new Date() };
        if (!message.text) throw Object.assign(new Error('Escribe el mensaje antes de enviarlo.'), { statusCode: 400 });
        waMessages.push(message);
        return { message };
      }
    }),
    sendMessage: async () => async () => null
  };
  api.use('/api/crm', createCrmRouter({ db, whatsapp }));
  // La banda de avisos importantes, con el servicio real sobre la misma memoria. El reloj se puede adelantar
  // (POST /api/__preview/clock?minutes=5) para ver salir el siguiente aviso sin esperar los cinco minutos.
  const notices = createImportantNoticeMemory(db, crmDemoUser.id, { cartera, now });
  api.post('/api/__preview/clock', (req, res) => { notices.advance(Number(req.query.minutes || 0)); res.json({ now: notices.clock() }); });
  api.use('/api/important-notices', createImportantNoticeRouter({ db: notices.db, clock: notices.clock }));
  api.get('/api/auth/me', (_req, res) => res.json(crmDemoUser));
  api.get('/api/user/profile', (_req, res) => res.json(crmDemoUser));
  api.get('/api/team', (_req, res) => res.json(crmDemoMembers));
  api.get('/api/notifications', (_req, res) => res.json([]));
  api.all('/api/*', (req, res) => res.status(404).json({ error: `Consulta no disponible en esta muestra local: ${req.path}` }));

  const server = await createServer({
    configFile: false,
    root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, `../node_modules/.vite-crm-${port || process.pid}`),
    appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/crm-preview.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-crm'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-crm-preview', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname.startsWith('/api/')) return api(req, res, next);
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/crm-preview.html';
        return next();
      });
    } }]
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  return { origin, db, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createCrmPreview({ port: Number(process.env.CRM_PREVIEW_PORT || 3100), cartera: process.argv.includes('--cartera') });
  console.log(`CRM local: ${preview.origin}/crm\nDatos de ejemplo en memoria. No hay conexión a base de datos ni a producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
