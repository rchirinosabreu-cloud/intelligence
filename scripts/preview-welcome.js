import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../tailwind.config.js';

// No dotenv, backend, proxy, credentials, schedulers or database in this preview.
export async function createWelcomePreview({ port = 3092 } = {}) {
  const root = path.resolve(import.meta.dirname, '..');
  const server = await createServer({
    configFile: false, root, envDir: path.join(root, 'tests/fixtures'), appType: 'mpa',
    cacheDir: path.join(root, `node_modules/.vite-welcome-${port || process.pid}`),
    optimizeDeps: { entries: ['tests/fixtures/welcome-preview.html', 'tests/fixtures/first-access.html'] },
    esbuild: { jsx: 'automatic' }, logLevel: 'warn',
    define: { __BUILD_SHA__: JSON.stringify('local-welcome'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.join(root, 'src') } },
    css: { postcss: { plugins: [tailwindcss({ ...tailwindConfig, content: [...tailwindConfig.content, './tests/fixtures/welcome/**/*.{js,jsx}', './tests/fixtures/welcome-preview.jsx', './tests/fixtures/first-access.jsx'] }), autoprefixer()] } },
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-welcome', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
        if (req.url.startsWith('/api/') || !['GET', 'HEAD'].includes(req.method)) {
          res.statusCode = 403;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Muestra local: no se ejecutan operaciones reales.' }));
          return;
        }
        next();
      });
    } }],
  });
  await server.listen();
  return { origin: `http://127.0.0.1:${server.httpServer.address().port}`, close: () => server.close() };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createWelcomePreview();
  console.log(`Bienvenida de prueba: ${preview.origin}/tests/fixtures/welcome-preview.html\nSin conexión a producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
