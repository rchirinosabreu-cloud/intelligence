import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { dashboardDemoTeam, dashboardDemoUser } from '../tests/fixtures/dashboardPreviewData.js';

// Muestra local de «Operación de clientes» (2 de octubre de 2026): la plataforma real (barra lateral y
// header) con la pantalla propuesta de Clientes. API simulada de solo lectura: sin .env, sin base de
// datos, sin almacenamiento y sin contacto con producción. Los datos de la pantalla viven en la propia
// muestra (`tests/fixtures/client-operations-preview.jsx`).
export async function createClientOperationsPreview({ port = 3700 } = {}) {
  const server = await createServer({
    configFile: false,
    root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, `../node_modules/.vite-client-operations-${port || process.pid}`),
    appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/client-operations-preview.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-client-operations'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-client-operations-preview', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname.startsWith('/api/')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          if (req.method !== 'GET') {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Muestra de solo lectura: no se guardan cambios ni se contacta producción.' }));
            return;
          }
          const routes = {
            '/api/auth/me': dashboardDemoUser,
            '/api/user/profile': dashboardDemoUser,
            '/api/user/onboarding': { user: dashboardDemoUser, autoOnboarding: false, progress: { welcome: true, cotizaciones: true } },
            '/api/team': dashboardDemoTeam,
            '/api/notifications': [],
            '/api/tasks/returned-alerts': { tasks: [] }, '/api/tasks/work-alerts': { tasks: [] },
            '/api/push/status': { enabled: false, configured: false },
            '/api/metrics/quality-streak': { currentStreak: 12, maxStreak: 21, currentStreakDays: 12, currentReturnedTasksCount: 0 },
          };
          if (Object.hasOwn(routes, pathname)) res.end(JSON.stringify(routes[pathname]));
          else { res.statusCode = 404; res.end(JSON.stringify({ error: `Consulta no disponible en esta muestra local: ${pathname}` })); }
          return;
        }
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/client-operations-preview.html';
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
  const preview = await createClientOperationsPreview({ port: Number(portArg || 3700) });
  console.log(`Operación de clientes (muestra): ${preview.origin}/clientes\nDatos de ejemplo en memoria. No hay conexión a producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
