import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { recognitionDemoCompletedTasks, recognitionDemoDashboard, recognitionDemoMember, recognitionDemoTasks, recognitionDemoUser } from '../tests/fixtures/recognitionData.js';

// No dotenv, production server, database, storage, scheduler or proxy in this local laboratory.
export async function createRecognitionPreview({ port = 3000 } = {}) {
  const server = await createServer({
    configFile: false,
    root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, `../node_modules/.vite-recognitions-${port || process.pid}`),
    appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/recognitions.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-recognitions'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-recognitions-preview', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        // Prevent any browser request from silently using real services or remote media.
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
          const completedTasks = recognitionDemoCompletedTasks().filter(task => {
            const search = requestUrl.searchParams.get('search')?.trim().toLowerCase();
            if (search) return [task.title, task.client.name, task.assignee.name].some(value => value.toLowerCase().includes(search));
            const date = requestUrl.searchParams.get('date');
            return !date || new Date(task.completedAt).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) === date;
          });
          const routes = {
            '/api/auth/me': recognitionDemoUser,
            '/api/user/profile': recognitionDemoUser,
            '/api/team': [recognitionDemoMember],
            '/api/clients': [], '/api/db/clients': [],
            '/api/notifications': [],
            '/api/tasks/returned-alerts': { tasks: [] }, '/api/tasks/work-alerts': { tasks: [] },
            '/api/push/status': { enabled: false, configured: false },
            '/api/metrics/quality-streak': { currentStreak: 0, maxStreak: 0, currentStreakDays: 0, currentReturnedTasksCount: 0 },
            '/api/tasks': recognitionDemoTasks(),
            '/api/tasks/completed': completedTasks,
            [`/api/dashboard/personal/${recognitionDemoUser.id}`]: recognitionDemoDashboard(),
          };
          if (Object.hasOwn(routes, pathname)) res.end(JSON.stringify(routes[pathname]));
          else { res.statusCode = 404; res.end(JSON.stringify({ error: `Consulta no disponible en esta muestra local: ${pathname}` })); }
          return;
        }
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/recognitions.html';
        next();
      });
    } }],
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  return { origin, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createRecognitionPreview({ port: Number(process.env.RECOGNITION_PREVIEW_PORT || 3000) });
  console.log(`Brain local: ${preview.origin}\nDashboard y Gestión reales con datos de ejemplo. No hay conexión a producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
