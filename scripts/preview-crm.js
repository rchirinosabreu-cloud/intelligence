import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createServer } from 'vite';
import { createCrmRouter } from '../src/routes/api/crm.js';
import { createCrmMemoryDb } from '../tests/fixtures/crmMemoryDb.js';
import { crmDemoLeads, crmDemoActivities, crmDemoMembers, crmDemoUsers, crmDemoUser } from '../tests/fixtures/crmData.js';

// Local laboratory for the CRM screens: the real router and service run over an in-memory store.
// No dotenv, no database, no production server, no external calls.
export async function createCrmPreview({ port = 3100 } = {}) {
  const db = createCrmMemoryDb({ leads: crmDemoLeads, activities: crmDemoActivities, members: crmDemoMembers, users: crmDemoUsers });
  const api = express();
  api.use(express.json());
  api.use((req, _res, next) => { req.user = { userId: crmDemoUser.id, role: crmDemoUser.role }; next(); });
  api.use('/api/crm', createCrmRouter({ db }));
  api.get('/api/auth/me', (_req, res) => res.json(crmDemoUser));
  api.get('/api/user/profile', (_req, res) => res.json(crmDemoUser));
  api.get('/api/team', (_req, res) => res.json(crmDemoMembers));
  api.get('/api/notifications', (_req, res) => res.json([]));
  api.get('/api/notifications/unread-count', (_req, res) => res.json({ count: 0 }));
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
  const preview = await createCrmPreview({ port: Number(process.env.CRM_PREVIEW_PORT || 3100) });
  console.log(`CRM local: ${preview.origin}/crm\nDatos de ejemplo en memoria. No hay conexión a base de datos ni a producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
