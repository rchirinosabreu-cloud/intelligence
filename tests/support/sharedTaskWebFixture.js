import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer, request as proxyRequest } from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import tailwindConfig from '../../tailwind.config.js';
import { sharedTaskRoot } from './sharedTaskSandbox.js';

// Tablero de producción y autenticación reales; la fixture solo limita los módulos montados.
export async function startSharedTaskWebFixture(apiOrigin, { port = 3181 } = {}) {
  if (apiOrigin !== 'http://127.0.0.1:8091') throw new Error('El preview solo conecta con la API aislada de compartidas.');
  const bundled = await build({ entryPoints: [path.join(sharedTaskRoot, 'tests/fixtures/shared-tasks-real.jsx')], write: false,
    bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', minify: true, alias: { '@': path.join(sharedTaskRoot, 'src') },
    loader: { '.css': 'empty', '.svg': 'dataurl', '.png': 'dataurl', '.webp': 'dataurl', '.jpg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}', '__BUILD_SHA__': '"shared-task-local"' } });
  const css = (await postcss([tailwindcss({ ...tailwindConfig, content: [path.join(sharedTaskRoot, 'src/**/*.{js,jsx}'), path.join(sharedTaskRoot, 'tests/fixtures/shared-tasks-real.jsx')] }), autoprefixer()])
    .process(await readFile(path.join(sharedTaskRoot, 'src/index.css'), 'utf8'), { from: path.join(sharedTaskRoot, 'src/index.css') })).css;
  const html = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Compartidas · aceptación real</title><link rel="stylesheet" href="/shared-real.css"></head><body><div id="root"></div><script type="module" src="/shared-real.js"></script></body></html>';
  const server = createServer((req, res) => {
    if (req.url.startsWith('/api/')) {
      const upstream = proxyRequest(new URL(req.url, apiOrigin), { method: req.method, headers: req.headers }, response => { res.writeHead(response.statusCode, response.headers); response.pipe(res); });
      upstream.on('error', error => { res.writeHead(502); res.end(error.message); }); req.pipe(upstream); return;
    }
    const asset = req.url === '/shared-real.js' ? ['text/javascript', bundled.outputFiles[0].text] : req.url === '/shared-real.css' ? ['text/css', css] : ['text/html', html];
    res.writeHead(200, { 'Content-Type': asset[0], 'Cache-Control': 'no-store' }); res.end(asset[1]);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
