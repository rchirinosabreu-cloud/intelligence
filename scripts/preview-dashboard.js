import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { dashboardDemoCompletedTasks, dashboardDemoDashboard, dashboardDemoTeam, dashboardDemoUser } from '../tests/fixtures/dashboardPreviewData.js';

// Local laboratory for the personal dashboard and the sidebar: the real App over a read-only mock API.
// No dotenv, production server, database, storage, scheduler or proxy.
export async function createDashboardPreview({ port = 3200 } = {}) {
  const server = await createServer({
    configFile: false,
    root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, `../node_modules/.vite-dashboard-${port || process.pid}`),
    appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/dashboard-preview.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-dashboard'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-dashboard-preview', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
        const requestUrl = new URL(req.url, 'http://localhost');
        const pathname = requestUrl.pathname;
        if (pathname.startsWith('/api/')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          if (req.method !== 'GET') {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Laboratorio de solo lectura: no se guardan cambios ni se contacta producción.' }));
            return;
          }
          const routes = {
            '/api/auth/me': dashboardDemoUser,
            '/api/user/profile': dashboardDemoUser,
            '/api/team': dashboardDemoTeam,
            '/api/clients': [], '/api/db/clients': [],
            '/api/notifications': [],
            '/api/tasks/returned-alerts': { tasks: [] }, '/api/tasks/work-alerts': { tasks: [] },
            '/api/push/status': { enabled: false, configured: false },
            '/api/metrics/quality-streak': { currentStreak: 12, maxStreak: 21, currentStreakDays: 12, currentReturnedTasksCount: Number(requestUrl.searchParams.get('returned') || 0) },
            '/api/tasks': [],
            '/api/tasks/completed': dashboardDemoCompletedTasks(),
            [`/api/dashboard/personal/${dashboardDemoUser.id}`]: dashboardDemoDashboard(),
          };
          if (Object.hasOwn(routes, pathname)) res.end(JSON.stringify(routes[pathname]));
          else { res.statusCode = 404; res.end(JSON.stringify({ error: `Consulta no disponible en esta muestra local: ${pathname}` })); }
          return;
        }
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/dashboard-preview.html';
        next();
      });
    } }],
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  return { origin, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createDashboardPreview({ port: Number(process.env.DASHBOARD_PREVIEW_PORT || 3200) });
  console.log(`Dashboard local: ${preview.origin}\nDatos de ejemplo en memoria. No hay conexión a producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
