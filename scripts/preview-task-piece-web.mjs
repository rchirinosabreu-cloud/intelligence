import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, build } from 'vite';
import react from '@vitejs/plugin-react';

// Aplicación completa contra la API aislada. No lee el .env del proyecto.
const root = fileURLToPath(new URL('..', import.meta.url));
const envDir = path.join(root, 'output/task-piece-local/empty-env');
await mkdir(envDir, { recursive: true });
const config = {
  root, configFile: false, envDir, plugins: [react()],
  resolve: { alias: { '@': path.join(root, 'src') } },
  define: { __BUILD_SHA__: JSON.stringify('task-piece-local'), 'import.meta.env.VITE_API_URL': JSON.stringify('') },
  build: { outDir: path.join(root, 'output/task-piece-local/build'), emptyOutDir: true },
  server: { host: '127.0.0.1', port: 3183, strictPort: true, proxy: { '/api': { target: 'http://127.0.0.1:8092', changeOrigin: true } } },
};
if (process.argv.includes('--build')) {
  await build(config);
} else {
  const health = await fetch('http://127.0.0.1:8092/api/health').then(response => response.json());
  if (health.isolatedTaskPieceTest !== true) throw new Error('La API de tareas y piezas aislada debe estar encendida.');
  const server = await createServer(config);
  await server.listen();
  console.log('TASK_PIECE_WEB_READY http://127.0.0.1:3183');
  const close = async () => { await server.close(); process.exit(0); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}
