import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import pg from 'pg';
import { createServer } from 'vite';
import { createGovernanceService } from '../src/services/aiGovernanceService.js';
import { createAiGovernanceRouter } from '../src/routes/api/aiGovernance.js';
// No dotenv, no production connection, no provider calls. Exact isolated DB only.
export async function createGovernancePreview({ port = 3112 } = {}) {
  const connectionString = 'postgresql://governance_test@127.0.0.1:55449/governance_test';
  const pool = new pg.Pool({ connectionString });
  await pool.query('SELECT 1');
  const api = express(); api.use(express.json({ limit: '100kb' }));
  api.use((req, res, next) => { req.user = { userId: 'gov-admin' }; next(); });
  api.use('/api/ai-governance', createAiGovernanceRouter({ service: createGovernanceService({ pool }) }));
  api.all('/api/*', (req, res) => res.status(404).json({ error: 'Solo gobierno de IA está disponible en esta muestra.' }));
  const server = await createServer({
    configFile: false, root: path.resolve(import.meta.dirname, '..'), envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, '../node_modules/.vite-governance'), appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/governance-preview.html'] }, esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-governance'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } }, logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-governance-preview', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
        if (new URL(req.url, 'http://localhost').pathname.startsWith('/api/')) return api(req, res, next);
        if (req.headers.accept?.includes('text/html') && !new URL(req.url, 'http://localhost').pathname.includes('.')) req.url = '/tests/fixtures/governance-preview.html';
        next();
      });
    } }]
  });
  await server.listen();
  return { origin: `http://127.0.0.1:${server.httpServer.address().port}`, close: async () => { await server.close(); await pool.end(); } };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createGovernancePreview();
  console.log(`Gobierno de IA local: ${preview.origin}/gobierno-ia`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
