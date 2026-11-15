import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createServer } from 'vite';
import { dashboardDemoTeam, dashboardDemoUser } from '../tests/fixtures/dashboardPreviewData.js';
import { createAdBudgetsDb } from '../tests/fixtures/adBudgetsMemoryDb.js';
import { budgets, campaigns, clients, cycles, previewMeta, previewMetaBudgets, readings, setPreviewMetaBudget, team, users } from '../tests/fixtures/adBudgetsPreviewData.js';
import { createAdBudgetRouter } from '../src/routes/api/adBudgets.js';
import { adBudgetService } from '../src/services/adBudgetService.js';
import { adBudgetMetaService } from '../src/services/adBudgetMetaService.js';
import { runAdBudgetAlerts } from '../src/services/adBudgetNoticeService.js';
import { currentImportantNotice } from '../src/services/importantNoticeService.js';

// Muestra local de Pautas (6 de noviembre de 2026): la plataforma real con el servicio y las rutas de verdad sobre una base
// en memoria. Sin .env, sin base de datos y sin contacto con producción. La banda se muestra como la vería Keila.
const VIEWER = 'u-keila';

export async function createAdBudgetsPreview({ port = 3848, today = null } = {}) {
  // Con `--hoy=AAAA-MM-DD` la muestra vive en ese día (a media mañana en Bogotá): el recorrido no depende de la fecha real.
  const clock = () => (today ? new Date(`${today}T15:00:00Z`) : new Date());
  // Tailwind busca las clases relativo a la carpeta de trabajo: desde otra carpeta las clases nuevas no existirían.
  process.chdir(path.resolve(import.meta.dirname, '..'));
  const db = createAdBudgetsDb({ clients, team, users, budgets, cycles, readings, campaigns });
  const silent = { log: () => {}, info: () => {} };
  // Keila edita. `POST /api/__preview/permisos?editar=0` la deja solo viendo, para revisar la pantalla de quien solo ve.
  const access = { edit: true };
  const permissions = () => ({ pautas: true, pautas_editar: access.edit });
  await runAdBudgetAlerts(db, { now: clock(), notify: async () => {}, ...silent });

  const api = express();
  api.use(express.json());
  api.use((req, _res, next) => { req.user = { userId: VIEWER, name: 'Keila', role: 'EDITOR', modulePermissions: permissions() }; next(); });
  const metaService = adBudgetMetaService(db, { meta: previewMeta, budgetClient: previewMetaBudgets, token: () => 'muestra', clock, log: () => {} });
  api.use(createAdBudgetRouter({ service: adBudgetService(db, { clock }), metaService }));

  const server = await createServer({
    configFile: false,
    root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, `../output/.vite-ad-budgets-${port || process.pid}`),
    appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/ad-budgets-preview.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-ad-budgets'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-ad-budgets-preview', configureServer(vite) {
      vite.middlewares.use('/api/ad-budgets', api);
      vite.middlewares.use(async (req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname.startsWith('/api/')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          // Un cambio hecho «en el Administrador de anuncios» de la muestra: `POST /api/__preview/meta-presupuesto?campana=ID&diario=4500`.
          if (pathname === '/api/__preview/meta-presupuesto' && req.method === 'POST') {
            const params = new URL(req.url, 'http://localhost').searchParams;
            const row = setPreviewMetaBudget(params.get('campana'), { daily_budget: String(Number(params.get('diario')) || 0) });
            // Con el reloj fijo de la muestra, «Actualizar ahora» se da por recién hecho; aquí corre la siguiente lectura.
            if (row) await metaService.syncBudgets();
            res.statusCode = row ? 200 : 404;
            res.end(JSON.stringify(row || { error: 'No existe esa campaña en la muestra.' }));
            return;
          }
          if (pathname === '/api/__preview/permisos' && req.method === 'POST') {
            access.edit = new URL(req.url, 'http://localhost').searchParams.get('editar') !== '0';
            res.end(JSON.stringify({ edit: access.edit }));
            return;
          }
          if (pathname === '/api/important-notices/current') {
            res.end(JSON.stringify(await currentImportantNotice(db, VIEWER, clock(), { log: () => {} })));
            return;
          }
          const user = { ...dashboardDemoUser, modulePermissions: { ...dashboardDemoUser.modulePermissions, ...permissions() } };
          const routes = {
            '/api/auth/me': user,
            '/api/user/profile': user,
            '/api/user/onboarding': { user, autoOnboarding: false, progress: { welcome: true, cotizaciones: true } },
            '/api/team': dashboardDemoTeam,
            '/api/notifications': [],
            '/api/tasks/returned-alerts': { tasks: [] }, '/api/tasks/work-alerts': { tasks: [] },
            '/api/push/status': { enabled: false, configured: false },
            '/api/metrics/quality-streak': { currentStreak: 12, maxStreak: 21, currentStreakDays: 12, currentReturnedTasksCount: 0 },
          };
          if (req.method !== 'GET') { res.end('{"ok":true}'); return; }
          if (Object.hasOwn(routes, pathname)) res.end(JSON.stringify(routes[pathname]));
          else { res.statusCode = 404; res.end(JSON.stringify({ error: `Consulta no disponible en esta muestra local: ${pathname}` })); }
          return;
        }
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/ad-budgets-preview.html';
        next();
      });
    } }],
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  return { origin, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const portArg = process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1];
  const todayArg = process.argv.find((arg) => arg.startsWith('--hoy='))?.split('=')[1] || null;
  const preview = await createAdBudgetsPreview({ port: Number(portArg || 3848), today: todayArg });
  console.log(`Pautas (muestra): ${preview.origin}/pautas\nDatos de ejemplo en memoria. No hay conexión a producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
