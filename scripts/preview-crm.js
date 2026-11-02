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
const createImportantNoticeMemory = (crmDb, userId, { cartera = false } = {}) => {
  let offset = 0;
  const clock = () => new Date(Date.now() + offset);
  const rows = (cartera ? [
    { id: 'aviso-cartera', kind: 'CARTERA_MENSUAL', level: 'IMPORTANTE', subjectId: 'cliente-nuva', label: 'Cartera vencida', message: 'Muebles Nuva tiene 2 mensualidades vencidas desde agosto: $3.200.000 pendientes', url: '/financiero?tab=cartera' },
    { id: 'aviso-puntual', kind: 'CARTERA_UNICO', level: 'SEGUIMIENTO', subjectId: 'cuenta-grit', label: 'Cartera · servicio puntual', message: 'Fundación Grit lleva 22 días vencida la cuenta de cobro No. 0395: $1.500.000 pendientes', url: '/financiero?tab=cartera' }
  ] : [
    { id: 'aviso-revision', kind: 'CRM_REVIEW', level: 'IMPORTANTE', subjectId: 'lead-centro', label: 'Revisión · 30 días', message: 'Centro Andino lleva 30 días sin responder: ¿sigue o no?' },
    { id: 'aviso-seguimiento', kind: 'CRM_FOLLOW_UP', level: 'SEGUIMIENTO', subjectId: 'lead-calzado', label: 'Seguimiento comercial', message: 'Calzado Andino lleva 10 días sin responder la propuesta' }
  ]).map((row) => ({ userId, url: `/crm/oportunidades/${row.subjectId}`, createdAt: clock(), snoozedUntil: null, decidedAt: null, resolvedAt: null, resolution: null, notificationId: null, ...row }));
  // Two overdue months for Muebles Nuva and an open one-off account for Grit, so the notices are still due.
  const owed = (id, period) => ({ id, kind: 'CLIENTE', status: 'DEBE', amount: 1600000, period, issuedAt: null, dueDate: null, number: null, payments: [] });
  const collection = cartera ? {
    teamMember: { findFirst: async () => ({ role: 'Coordinadora Administrativa y Contable', areas: ['ADMINISTRATIVA', 'COMERCIAL'] }) },
    collectionSetting: { findUnique: async () => null },
    client: { findUnique: async () => ({ name: 'Muebles Nuva', accountsReceivables: [owed('n-ago', '2026-08-01'), owed('n-sep', '2026-09-01')] }) },
    accountsReceivable: { findUnique: async () => ({ ...owed('cuenta-grit', '2026-09-01'), number: 395, client: { name: 'Fundación Grit' } }) }
  } : {};
  const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => (value && typeof value === 'object' && 'not' in value ? row[key] !== value.not : row[key] === value));
  const contact = new Set(['LLAMADA', 'CORREO', 'WHATSAPP', 'MENSAJE_LINKEDIN', 'REUNION', 'PROPUESTA_ENVIADA', 'RESPUESTA_CLIENTE']);
  const db = Object.create(crmDb);
  Object.assign(db, {
    importantNotice: {
      findMany: async ({ where }) => rows.filter((row) => matches(row, where)),
      findFirst: async ({ where, orderBy }) => rows.filter((row) => matches(row, where)).sort((a, b) => (orderBy?.decidedAt ? b.decidedAt - a.decidedAt : 0))[0] || null,
      update: async ({ where, data }) => Object.assign(rows.find((row) => row.id === where.id), data)
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
export async function createCrmPreview({ port = 3100, cartera = false } = {}) {
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
  api.use('/api/crm', createCrmRouter({ db }));
  // La banda de avisos importantes, con el servicio real sobre la misma memoria. El reloj se puede adelantar
  // (POST /api/__preview/clock?minutes=5) para ver salir el siguiente aviso sin esperar los cinco minutos.
  const notices = createImportantNoticeMemory(db, crmDemoUser.id, { cartera });
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
