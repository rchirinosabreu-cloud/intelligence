import path from 'node:path';
import { Readable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createServer } from 'vite';
import { dashboardDemoTeam, dashboardDemoUser } from '../tests/fixtures/dashboardPreviewData.js';
import { createBrandsDb } from '../tests/fixtures/brandsMemoryDb.js';
import { createClientBrandRouter } from '../src/routes/api/clientBrands.js';
import { clientBrandService } from '../src/services/clientBrandService.js';
import { matchBrandToClient, normalizeBrandInput } from '../src/lib/clientBrand.js';

// Muestra local de Marcas (18 de noviembre de 2026): la ruta y el servicio de verdad sobre una base en memoria, con las
// fichas extraídas de los manuales (data/client-brands.json). Sin .env, sin base de datos, sin producción. Los archivos
// que se suben viven en memoria y se pierden al apagar. `?ver=1` en `/api/__preview/permisos` deja a la persona solo viendo.

export async function createBrandsPreview({ port = 3870, empty = process.argv.includes('--vacio') } = {}) {
  process.chdir(path.resolve(import.meta.dirname, '..'));
  const dataset = JSON.parse(readFileSync('data/client-brands.json', 'utf8'));
  const clients = dataset.brands.map((entry, index) => ({ id: `c${index + 1}`, name: entry.aliases[0], slug: entry.aliases[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-'), logoUrl: null, status: 'ACTIVO', isArchived: false }));
  clients.push({ id: 'c-wine', name: 'Wine Summit', slug: 'wine-summit', logoUrl: null, status: 'ACTIVO', isArchived: false });
  clients.push({ id: 'c-bonsai', name: 'Bonsai', slug: 'bonsai', logoUrl: null, status: 'CERRADO', isArchived: true });
  const db = createBrandsDb(clients);
  for (const entry of empty ? [] : dataset.brands) {
    const { client } = matchBrandToClient(entry, clients);
    const { brand } = normalizeBrandInput(entry);
    if (client) await db.clientBrand.create({ data: { ...brand, clientId: client.id, source: entry.source } });
  }
  const objects = new Map();
  const storage = () => ({
    uploadToS3: async (file, folder) => { const key = `${folder}/${Date.now()}_${file.originalname}`; objects.set(key, file.buffer); return { key, name: file.originalname, size: file.size, mimeType: file.mimetype }; },
    getFromS3Stream: async (key) => ({ Body: Readable.from(objects.get(key) || Buffer.alloc(0)) })
  });
  if (empty) {
    const { runBrandImport } = await import('../src/services/clientBrandImport.js');
    const result = await runBrandImport({ db, service: clientBrandService({ db, storage }), dataset, apply: true });
    console.log(`Carga de los manuales: ${result.totals.created} fichas, ${result.totals.logos} logos, ${result.totals.manuals} manuales.`);
  }
  const access = { edit: true };
  const api = express();
  api.use(express.json());
  // Como producción: sin sesión no hay nada (en producción una <img> directa respondía «No token provided»).
  api.use((req, res, next) => (req.headers.authorization ? next() : res.status(401).json({ error: 'No token provided' })));
  api.use((req, _res, next) => { req.user = empty ? { userId: 'u-rodny', name: 'Rodny', role: 'ADMIN' } : { userId: 'u-keila', name: 'Keila', role: 'EDITOR', modulePermissions: { clientes: access.edit } }; next(); });
  api.use(createClientBrandRouter({ service: clientBrandService({ db, storage }) }));

  const server = await createServer({
    configFile: false,
    root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, `../output/.vite-brands-${port}`),
    appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/brands-preview.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-brands'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-brands-preview', configureServer(vite) {
      vite.middlewares.use('/api/brands', api);
      vite.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname.startsWith('/api/')) {
          res.setHeader('Content-Type', 'application/json');
          if (pathname === '/api/__preview/permisos') {
            access.edit = new URL(req.url, 'http://localhost').searchParams.get('ver') !== '1';
            res.end(JSON.stringify({ edit: access.edit }));
            return;
          }
          const user = { ...dashboardDemoUser, role: 'EDITOR', modulePermissions: { clientes: true } };
          const routes = {
            '/api/auth/me': user, '/api/user/profile': user,
            '/api/user/onboarding': { user, autoOnboarding: false, progress: { welcome: true } },
            '/api/team': dashboardDemoTeam, '/api/notifications': [],
            '/api/tasks/returned-alerts': { tasks: [] }, '/api/tasks/work-alerts': { tasks: [] },
            '/api/push/status': { enabled: false, configured: false },
            '/api/important-notices/current': { notice: null },
            '/api/metrics/quality-streak': { currentStreak: 0, maxStreak: 0, currentStreakDays: 0, currentReturnedTasksCount: 0 }
          };
          if (req.method !== 'GET') { res.end('{"ok":true}'); return; }
          if (Object.hasOwn(routes, pathname)) res.end(JSON.stringify(routes[pathname]));
          else { res.statusCode = 404; res.end(JSON.stringify({ error: `Consulta no disponible en esta muestra local: ${pathname}` })); }
          return;
        }
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/brands-preview.html';
        next();
      });
    } }]
  });
  await server.listen();
  return { origin: `http://127.0.0.1:${server.httpServer.address().port}`, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const portArg = process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1];
  const preview = await createBrandsPreview({ port: Number(portArg || 3870) });
  console.log(`Marcas (muestra): ${preview.origin}/clientes?tab=marcas\nDatos en memoria. No hay conexión a producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
