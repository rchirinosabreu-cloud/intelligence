import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createServer } from 'vite';
import { buildLeadDraft } from '../src/lib/commercialRequestForm.js';

// Local laboratory for the public commercial request form. The submit endpoint is a double:
// it runs the real answers→lead mapping and returns a fake reference. No database, no production.
export async function createCommercialRequestPreview({ port = 3300 } = {}) {
  const received = [];
  const api = express();
  api.use(express.json({ limit: '200kb' }));
  api.post('/api/public/commercial-request', (req, res) => {
    const { answers = {} } = req.body || {};
    const draft = buildLeadDraft(answers);
    received.push({ ...draft, meta: req.body?.meta || null });
    console.log(`[solicitud] ${draft.lead.company || draft.lead.contactName} · ${draft.lead.serviceInterest} · ${draft.request.suggestedItems.length} líneas sugeridas`);
    res.status(201).json({ ok: true, reference: `CRM-${String(170 + received.length).padStart(4, '0')}`, lead: draft.lead, request: draft.request });
  });
  api.get('/api/public/commercial-request/received', (_req, res) => res.json(received));
  api.all('/api/*', (req, res) => res.status(404).json({ error: `Consulta no disponible en esta muestra local: ${req.path}` }));

  const server = await createServer({
    configFile: false,
    root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, `../node_modules/.vite-solicitud-${port || process.pid}`),
    appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/commercial-request-preview.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-solicitud'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-commercial-request-preview', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname.startsWith('/api/')) return api(req, res, next);
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/commercial-request-preview.html';
        return next();
      });
    } }]
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  return { origin, received, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createCommercialRequestPreview({ port: Number(process.env.SOLICITUD_PREVIEW_PORT || 3300) });
  console.log(`Formulario local: ${preview.origin}/solicitud\nLos envíos se muestran en consola y en ${preview.origin}/api/public/commercial-request/received. No hay base de datos ni producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
