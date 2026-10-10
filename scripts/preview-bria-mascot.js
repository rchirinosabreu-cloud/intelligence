import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { createBriaPreview } from './preview-bria.js';
import { dashboardDemoTeam, dashboardDemoUser } from '../tests/fixtures/dashboardPreviewData.js';

// Real AppLayout + the existing Clients fixture. All APIs are local simulations;
// no dotenv, database, external AI, production credentials or schema changes.
export async function createBriaMascotPreview({ port = 3730 } = {}) {
  const bria = await createBriaPreview({ port: 0 });
  const user = { ...dashboardDemoUser, modulePermissions: { ...dashboardDemoUser.modulePermissions, bria: true } };
  const routes = {
    '/api/auth/me': user, '/api/user/profile': user,
    '/api/user/onboarding': { user, autoOnboarding: false, progress: { welcome: true, cotizaciones: true } },
    '/api/team': dashboardDemoTeam, '/api/notifications': [],
    '/api/tasks/returned-alerts': { tasks: [] }, '/api/tasks/work-alerts': { tasks: [] },
    '/api/push/status': { enabled: false, configured: false },
    '/api/service-health/summary': { overall: 'GREEN', troubled: [] },
    '/api/metrics/quality-streak': { currentStreak: 12, maxStreak: 21, currentStreakDays: 12, currentReturnedTasksCount: 0 },
  };
  const channels = [{ id: 'general', name: 'General', type: 'GENERAL', unread: 2 }];
  const server = await createServer({
    configFile: false, root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, '../node_modules/.vite-bria-mascot'),
    appType: 'mpa', optimizeDeps: { entries: ['tests/fixtures/client-operations-preview.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-bria-mascot'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } }, logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: { '/api/bria': { target: bria.origin } } },
    plugins: [{ name: 'isolated-bria-mascot', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/api/team-chat/events') {
          res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-store');
          res.write(`data: ${JSON.stringify({ type: 'ready', cursor: '0', channels })}\n\n`);
          const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15000);
          res.once('close', () => clearInterval(heartbeat));
          return;
        }
        if (pathname.startsWith('/api/bria/')) {
          // Extra time only in this visual preview makes the seated pose easy to inspect.
          if (req.method === 'POST' && pathname.endsWith('/messages')) return setTimeout(next, 1300);
          return next();
        }
        if (pathname.startsWith('/api/')) {
          res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
          if (pathname === '/api/recognitions/claim') return res.end(JSON.stringify({ recognition: null }));
          if (pathname === '/api/team-chat/channels') return res.end(JSON.stringify(channels));
          if (pathname === '/api/team-chat/roster') return res.end(JSON.stringify(dashboardDemoTeam));
          if (pathname === '/api/team-chat/channels/general/messages' && req.method === 'GET') return res.end(JSON.stringify({ messages: [], before: null }));
          if (pathname === '/api/team-chat/channels/general/read' && req.method === 'POST') return res.end(JSON.stringify({ ok: true }));
          if (Object.hasOwn(routes, pathname) && req.method === 'GET') return res.end(JSON.stringify(routes[pathname]));
          res.statusCode = 404; return res.end(JSON.stringify({ error: 'Consulta no disponible en esta muestra local.' }));
        }
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/client-operations-preview.html';
        next();
      });
    } }],
  });
  try { await server.listen(); }
  catch (error) { await server.close(); await bria.close(); throw error; }
  return { origin: `http://127.0.0.1:${server.httpServer.address().port}`, close: async () => { await server.close(); await bria.close(); } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.argv.find(arg => arg.startsWith('--port='))?.split('=')[1] || 3730);
  const preview = await createBriaMascotPreview({ port });
  console.log(`Bria pequeña en la plataforma: ${preview.origin}/clientes\nPregunta «¿Qué tengo pendiente hoy?» para verla trabajar y celebrar.\nDatos y respuestas simuladas. Sin conexión a producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
