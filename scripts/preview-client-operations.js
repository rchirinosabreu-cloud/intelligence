import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { dashboardDemoTeam, dashboardDemoUser } from '../tests/fixtures/dashboardPreviewData.js';
import { clients as previewClients } from '../tests/fixtures/clientOperationsPreviewData.js';

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
          // La vista rápida de una pieza (30 de octubre de 2026): la parrilla de la plataforma y el espejo de la hoja de MIO.
          const plan = pathname.match(/^\/api\/content\/plans\/plan-([\w-]+)$/);
          const sheet = pathname.match(/^\/api\/content\/external-plans\/([\w-]+)\/[\w-]+$/);
          if (plan) {
            const client = previewClients.find((c) => c.slug === plan[1]);
            const items = (client?.cycles?.current?.pieces || []).map((piece, index) => ({
              id: piece.id, objective: piece.title, format: piece.format, status: piece.status, finalAssets: [],
              copyText: index % 3 === 2 ? '' : `ESCENA 1: ${piece.title}.\nVOZ: «Así se ve una tarde en el club».\nCIERRE: logo y llamado.`,
              captionText: index % 3 === 2 ? '' : `${piece.title} 💚\n\nTe esperamos este fin de semana.\n\n#Deporte #Comunidad`,
              comments: index === 1 ? 'Me encanta, pero cambien la canción por algo más tranquilo.' : null,
              internalNotes: index === 0 ? 'Usar las fotos de la sesión del martes.' : null,
            }));
            res.end(JSON.stringify({ id: `plan-${plan[1]}`, items }));
            return;
          }
          if (sheet) {
            const client = previewClients.find((c) => c.slug === sheet[1]);
            const sheetStatus = { EN_REVISION: 'EN REVISIÓN', BORRADOR: 'SIN REALIZAR' };
            const pieces = (client?.cycles?.current?.pieces || []).filter((piece) => piece.row).map((piece, index) => ({
              row: piece.row, format: piece.format, number: String(index + 1), date: piece.date, status: sheetStatus[piece.status] || piece.status,
              objective: 'POSICIONAMIENTO', copy: `¿Quién soy?\n\n${piece.title}`, caption: 'La cocina está llena de ingredientes con personalidad. 🥬',
              content: 'https://drive.google.com/drive/folders/muestra', comment: index === 0 ? 'Sale en Instagram y Facebook.' : '', comments: [],
              cellUrl: `${client.externalPlanUrl}#gid=0&range=A${piece.row}`,
            }));
            res.end(JSON.stringify({ editable: false, pieces }));
            return;
          }
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
