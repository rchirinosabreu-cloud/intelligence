import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import { dashboardDemoClients, dashboardDemoCompletedTasks, dashboardDemoDashboard, dashboardDemoKanbanTasks, dashboardDemoLeague, dashboardDemoTaskComments, dashboardDemoTeam, dashboardDemoUser } from '../tests/fixtures/dashboardPreviewData.js';
import { LEAGUE_ROSTER, leagueDemoRecognitions } from '../tests/fixtures/leaguePreviewData.js';

// Local laboratory for the personal dashboard and the sidebar: the real App over a read-only mock API.
// No dotenv, production server, database, storage, scheduler or proxy.
const DEMO_IMAGE_STYLES = [
  ['#0f3d5e', '#22d3ee', 'Reunión 2:00 pm'],
  ['#3b1d6e', '#f472b6', 'Bienvenida, Franci'],
  ['#14532d', '#facc15', 'Equipo comercial'],
  ['#7c2d12', '#fb923c', '¡Ya eres Brain!'],
  ['#1e293b', '#60a5fa', 'Almuerzo del viernes']
];
const demoAnnouncementImage = (id) => {
  const index = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % DEMO_IMAGE_STYLES.length;
  const [from, to, label] = id === 'demo-agenda' ? DEMO_IMAGE_STYLES[0] : DEMO_IMAGE_STYLES[index];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="1200" height="760" fill="url(#g)"/><circle cx="980" cy="160" r="220" fill="#fff" opacity=".12"/><circle cx="160" cy="680" r="260" fill="#000" opacity=".12"/><text x="80" y="420" font-family="Arial, sans-serif" font-size="92" font-weight="700" fill="#fff">${label}</text><text x="84" y="500" font-family="Arial, sans-serif" font-size="40" fill="#fff" opacity=".8">Brain Studio · imagen de ejemplo</text></svg>`;
};

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
        // La tipografía del negocio (Roboto Condensed) viene de Google Fonts: sin permitirla aquí, la muestra se veía con la letra del sistema.
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
        const requestUrl = new URL(req.url, 'http://localhost');
        const pathname = requestUrl.pathname;
        if (pathname.startsWith('/api/')) {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          // El regalo del mes de la liga (3 de noviembre de 2026): la muestra lo acepta y responde como el servidor, sin guardar nada.
          if (req.method === 'POST' && pathname === '/api/league/kudos') {
            let raw = '';
            req.on('data', (chunk) => { raw += chunk; });
            req.on('end', () => {
              const body = (() => { try { return JSON.parse(raw || '{}'); } catch { return {}; } })();
              const person = LEAGUE_ROSTER.find((row) => row.id === body.memberId);
              if (!person) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Esa persona no está en el equipo activo.' })); return; }
              res.end(JSON.stringify({ id: 'kudos-demo', weekKey: '2026-W45', points: 5, to: { id: person.id, name: person.name }, note: String(body.note || '').slice(0, 120) }));
            });
            return;
          }
          // Imágenes de los anuncios (27 de noviembre de 2026): carteles de ejemplo dibujados aquí, sin archivos ni bucket.
          const announcementImage = pathname.match(/^\/api\/announcement-images\/([^/]+)$/);
          if (announcementImage) {
            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Cache-Control', 'private, max-age=3600');
            res.end(demoAnnouncementImage(announcementImage[1]));
            return;
          }
          if (req.method === 'POST' && pathname === '/api/dashboard/announcements/images') {
            req.resume();
            req.on('end', () => {
              const id = `demo-subida-${Date.now()}`;
              setTimeout(() => {
                res.statusCode = 201;
                res.end(JSON.stringify({ id, name: 'Imagen.png', mimeType: 'image/png', size: 1, removed: false, url: `/api/announcement-images/${id}?access_token=demo` }));
              }, 900);
            });
            return;
          }
          // Abrir un anuncio en la muestra: se responde como el servidor, sin guardar nada.
          if (req.method === 'POST' && /^\/api\/dashboard\/announcements\/[^/]+\/response$/.test(pathname)) { req.resume(); req.on('end', () => res.end('{}')); return; }
          if (req.method !== 'GET') {
            res.statusCode = 403;
            res.end(JSON.stringify({ error: 'Laboratorio de solo lectura: no se guardan cambios ni se contacta producción.' }));
            return;
          }
          // `?role=EDITOR` on the page lets the lab show the board as a non-manager (focus lock, no hour selector).
          const asEditor = /[?&]role=EDITOR/.test(req.headers.referer || '');
          // `?future` keeps the commitment from having expired, so the mandatory dialog stays closed.
          const focusFuture = /[?&]future/.test(req.headers.referer || '');
          // La liga del buen uso (27 de octubre y 3 de noviembre de 2026): la copa asomada a la derecha lee `/api/league`.
          // `?ganador` enseña a quien ganó el mes anterior, `?liga=completa` un mes perfecto y `?liga=no` una cuenta sin ficha (sin copa).
          const referer = String(req.headers.referer || '');
          const league = /[?&]liga=no\b/.test(referer) ? null : dashboardDemoLeague({ winner: /[?&]ganador/.test(referer), perfect: /[?&]liga=completa\b/.test(referer) });
          if (pathname === '/api/user/onboarding') {
            res.end(JSON.stringify({ user: dashboardDemoUser, autoOnboarding: false, progress: { liga: 'COMPLETED' } }));
            return;
          }
          if (pathname === '/api/league') {
            if (!league) { res.statusCode = 404; res.end(JSON.stringify({ error: 'Esta cuenta no tiene ficha en Equipo.' })); return; }
            res.end(JSON.stringify(league));
            return;
          }
          if (pathname === '/api/league/recognitions') { res.end(JSON.stringify(leagueDemoRecognitions)); return; }
          const demoUser = asEditor ? { ...dashboardDemoUser, role: 'EDITOR' } : dashboardDemoUser;
          const taskCommentsMatch = pathname.match(/^\/api\/tasks\/([^/]+)\/comments$/);
          if (taskCommentsMatch) { res.end(JSON.stringify(dashboardDemoTaskComments(taskCommentsMatch[1]))); return; }
          // El dashboard de otra persona del equipo de ejemplo (9 de octubre de 2026): sus recordatorios con sus permisos.
          const otherDashboard = pathname.match(/^\/api\/dashboard\/personal\/([^/]+)$/);
          if (otherDashboard && otherDashboard[1] !== dashboardDemoUser.id) {
            const person = (Array.isArray(dashboardDemoTeam) ? dashboardDemoTeam : []).find((row) => (row.userId || row.user?.id) === otherDashboard[1]);
            const base = dashboardDemoDashboard();
            res.end(JSON.stringify({ ...base, crmAttention: { enabled: false, counts: {}, items: [] }, member: { ...base.member, id: person?.id || 'member-other', userId: otherDashboard[1], name: person?.name || 'Persona del equipo', accountRole: 'EDITOR', modulePermissions: { gestion: true, minutas: true } } }));
            return;
          }
          const announcementPreview = pathname.match(/^\/api\/dashboard\/announcements\/([^/]+)\/preview$/);
          if (announcementPreview) {
            const row = dashboardDemoDashboard().announcements.find((entry) => entry.id === announcementPreview[1]);
            if (!row) { res.statusCode = 404; res.end(JSON.stringify({ error: 'El anuncio no existe.' })); return; }
            res.end(JSON.stringify({ id: row.id, content: row.content, author: row.author?.name || 'Equipo Brainstudio', createdAt: row.createdAt, revision: 1, archivedAt: null, images: row.images || [] }));
            return;
          }
          const routes = {
            '/api/auth/me': demoUser,
            '/api/user/profile': demoUser,
            '/api/team': dashboardDemoTeam,
            '/api/clients': dashboardDemoClients, '/api/db/clients': dashboardDemoClients,
            '/api/notifications': [],
            '/api/tasks/returned-alerts': { tasks: [] }, '/api/tasks/work-alerts': { tasks: [] },
            '/api/push/status': { enabled: false, configured: false },
            '/api/metrics/quality-streak': { currentStreak: 12, maxStreak: 21, currentStreakDays: 12, currentReturnedTasksCount: Number(requestUrl.searchParams.get('returned') || 0) },
            '/api/tasks': dashboardDemoKanbanTasks(new Date(), { focusFuture }),
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
  // `--port=3201` lets a worktree run its own copy beside the main checkout's preview.
  const portArg = process.argv.find((arg) => arg.startsWith('--port='))?.split('=')[1];
  const preview = await createDashboardPreview({ port: Number(portArg || process.env.DASHBOARD_PREVIEW_PORT || 3200) });
  console.log(`Dashboard local: ${preview.origin}\nDatos de ejemplo en memoria. No hay conexión a producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
