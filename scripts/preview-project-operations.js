import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';

// Laboratorio local: componentes reales, datos ficticios en memoria, ninguna API ni base de datos.
export async function createProjectOperationsPreview({ port = 0 } = {}) {
  const server = await createServer({
    configFile: false,
    root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, `../node_modules/.vite-project-operations-${process.pid}`),
    appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/project-operations.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-project-operations'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
    logLevel: 'error',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-project-operations', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname.startsWith('/api/')) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'La muestra de proyectos no tiene conexión a ninguna API.' }));
          return;
        }
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/project-operations.html';
        next();
      });
    } }],
  });
  await server.listen();
  return { origin: `http://127.0.0.1:${server.httpServer.address().port}`, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.argv.find(arg => arg.startsWith('--port='))?.split('=')[1] || 3711);
  const preview = await createProjectOperationsPreview({ port });
  console.log(`Proyectos del cliente: ${preview.origin}/clientes/operacion/aurora\nDatos ficticios en memoria; sin producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
