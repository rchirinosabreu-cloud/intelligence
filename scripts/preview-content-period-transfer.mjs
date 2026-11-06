// Real application and API, isolated PostgreSQL and fictional storage. No scheduler or external writes.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vite';
import { createTaskPieceFixture, finalPiecePng } from '../tests/support/taskPieceFixture.js';

const output = path.resolve('output/content-period-transfer');
await mkdir(path.join(output, 'empty-env'), { recursive: true });
process.env.VITE_API_URL = '';
const fixture = await createTaskPieceFixture({ port: 8092 });
await fixture.upload('ana', fixture.pieces.previous.approved.id, 'entrega-original.png');
await writeFile(path.join(output, 'pieza.png'), finalPiecePng);
const web = await createServer({ envDir: path.join(output, 'empty-env'), server: {
  host: '127.0.0.1', port: 3183, strictPort: true, proxy: { '/api': { target: fixture.api.origin, changeOrigin: true } }
} });
await web.listen();
await writeFile(path.join(output, 'access.json'), JSON.stringify({ origin: 'http://127.0.0.1:3183', apiOrigin: fixture.api.origin,
  client: fixture.client, pieces: fixture.pieces, plans: fixture.plans,
  users: Object.fromEntries(Object.entries(fixture.actors).map(([key, actor]) => [key, { email: actor.email, password: actor.password }])) }, null, 2));
console.log('PERIOD_TRANSFER_PREVIEW_READY http://127.0.0.1:3183');
const close = async () => { await web.close(); await fixture.close(); process.exit(0); };
process.once('SIGINT', close); process.once('SIGTERM', close);
