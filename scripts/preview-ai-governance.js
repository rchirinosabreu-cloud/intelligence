import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import pg from 'pg';
import { createServer } from 'vite';
import { createGovernanceService } from '../src/services/aiGovernanceService.js';
import { createAiGovernanceRouter } from '../src/routes/api/aiGovernance.js';
import { createIncidentReportRouter } from '../src/routes/api/incidentReports.js';
import { ensureAiGovernanceSchema } from './ensure-ai-governance-schema.js';
// No dotenv, no production connection, no provider calls. Exact isolated DB only.
const PREVIEW_PEOPLE = [['gov-admin', 'Prueba Admin', 'ADMIN'], ['gov-editor', 'Prueba Editor', 'EDITOR']];
// La identidad de la muestra sale del token de prueba que pone cada página (sin firma: solo local).
const previewUserOf = (req) => {
  try { return JSON.parse(Buffer.from(String(req.headers.authorization || '').split('.')[1], 'base64url').toString()).userId || 'gov-admin'; }
  catch { return 'gov-admin'; }
};
async function seed(pool) {
  // Las mismas tablas mínimas que crea tests/aiGovernancePostgres.integration.mjs, idempotentes.
  await pool.query('CREATE TABLE IF NOT EXISTS "User" (id TEXT PRIMARY KEY, name TEXT, "isActive" BOOLEAN, role TEXT)');
  await pool.query('CREATE TABLE IF NOT EXISTS "TeamMember" (id TEXT PRIMARY KEY, "userId" TEXT, "isActive" BOOLEAN)');
  await pool.query('CREATE TABLE IF NOT EXISTS "Client" (id TEXT PRIMARY KEY, name TEXT, "isArchived" BOOLEAN DEFAULT false)');
  for (const [id, name, role] of PREVIEW_PEOPLE) {
    await pool.query('INSERT INTO "User" VALUES ($1,$2,true,$3) ON CONFLICT DO NOTHING', [id, name, role]);
    await pool.query('INSERT INTO "TeamMember" SELECT $1,$2,true WHERE NOT EXISTS (SELECT 1 FROM "TeamMember" WHERE "userId"=$2)', [`${id}-team`, id]);
  }
  for (const [id, name] of [['preview-client-a', 'Cliente de muestra A'], ['preview-client-b', 'Cliente de muestra B']]) {
    await pool.query('INSERT INTO "Client" (id,name) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, name]);
  }
  const client = await pool.connect();
  try { await ensureAiGovernanceSchema(client); } finally { client.release(); }
}
export async function createGovernancePreview({ port = 3112 } = {}) {
  const connectionString = 'postgresql://governance_test@127.0.0.1:55449/governance_test';
  const pool = new pg.Pool({ connectionString });
  await pool.query('SELECT 1');
  await seed(pool);
  const service = createGovernanceService({ pool });
  // Los avisos a administración se guardan aquí en vez de ir a la campana o al celular.
  const notifications = [];
  const api = express(); api.use(express.json({ limit: '100kb' }));
  api.use((req, res, next) => { req.user = { userId: previewUserOf(req) }; next(); });
  api.get('/api/preview/notifications', (req, res) => res.json(notifications));
  api.get(['/api/auth/me', '/api/user/profile'], async (req, res) => {
    const user = (await pool.query('SELECT id,name,role FROM "User" WHERE id=$1', [req.user.userId])).rows[0];
    res.json({ ...user, email: `${user.id}@brainstudio.test`, teamRole: user.role === 'ADMIN' ? 'Director' : 'Community Manager' });
  });
  api.get('/api/clients', async (req, res) => res.json((await pool.query('SELECT id,name FROM "Client" ORDER BY name')).rows));
  api.use('/api/incident-reports', createIncidentReportRouter({
    service,
    limit: { windowMs: 60_000, max: 50 },
    notify: async ({ incidentId, reporterId, reporterName }) => {
      const admins = (await pool.query(`SELECT id FROM "User" WHERE role='ADMIN' AND "isActive"=true AND id<>$1`, [reporterId])).rows;
      for (const admin of admins) notifications.push({ userId: admin.id, type: 'SECURITY_INCIDENT_REPORTED', relatedId: incidentId, url: '/gobierno-ia?tab=incidents', message: `${reporterName} reportó un incidente de seguridad. Revísalo en Gobierno de IA.` });
    }
  }));
  api.use('/api/ai-governance', createAiGovernanceRouter({ service }));
  api.all('/api/*', (req, res) => res.status(404).json({ error: 'Solo gobierno de IA está disponible en esta muestra.' }));
  const server = await createServer({
    configFile: false, root: path.resolve(import.meta.dirname, '..'), envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, '../node_modules/.vite-governance'), appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/governance-preview.html', 'tests/fixtures/incident-report-preview.html'] }, esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-governance'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } }, logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-governance-preview', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname.startsWith('/api/')) return api(req, res, next);
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = pathname.startsWith('/reportar-incidente') ? '/tests/fixtures/incident-report-preview.html' : '/tests/fixtures/governance-preview.html';
        next();
      });
    } }]
  });
  await server.listen();
  return { origin: `http://127.0.0.1:${server.httpServer.address().port}`, close: async () => { await server.close(); await pool.end(); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createGovernancePreview();
  console.log(`Gobierno de IA local: ${preview.origin}/gobierno-ia`);
  console.log(`Reportar un incidente (equipo): ${preview.origin}/reportar-incidente`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
