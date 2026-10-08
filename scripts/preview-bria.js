import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { createServer } from 'vite';

// Muestra local de «Preguntarle a Bria» (6 de octubre de 2026): el componente real contra una API
// simulada que responde según la pregunta. No hay dotenv, ni base de datos, ni llamada a OpenAI.

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ANSWERS = [
  {
    match: /pendiente|tareas|tengo/i,
    answer: 'Tienes tres tareas sin cerrar:\n- [**Subir los videos de Nattal**](/gestion?taskId=t1), venció el 2 de octubre.\n- Guion del reel de Mimas, en proceso, con compromiso a las 15:00.\n- Carrusel de Endova, pendiente para el 9 de octubre.\n\nLa primera ya está vencida; conviene atenderla hoy.',
    sources: [
      { kind: 'tarea', id: 't1', label: 'Subir los videos de Nattal', url: '/gestion?taskId=t1' },
      { kind: 'tarea', id: 't2', label: 'Guion del reel de Mimas', url: '/gestion?taskId=t2' },
      { kind: 'tarea', id: 't3', label: 'Carrusel de Endova', url: '/gestion?taskId=t3' }
    ]
  },
  {
    match: /redes|sale|publica/i,
    answer: 'Esta semana salen dos publicaciones:\n- Endova, reel «Lanzamiento», el 7 de octubre a las 9:30 en Instagram.\n- Foobespain, carrusel «Vendimia», el 9 de octubre a las 11:00 en Instagram y Facebook.',
    sources: [
      { kind: 'pieza', id: 'i1', label: 'Lanzamiento', url: '/parrillas/p-endova?item=i1' },
      { kind: 'pieza', id: 'i2', label: 'Vendimia', url: '/parrillas/p-foobe?item=i2' }
    ]
  },
  {
    match: /parrilla|endova/i,
    answer: 'La parrilla de octubre de Endova tiene 8 piezas: 5 aprobadas, 2 por aprobar y 1 sin texto todavía.\n\nLas dos por aprobar son «Promo del mes» (20 de octubre) y «Detrás de cámaras» (12 de octubre), que el cliente ya había aprobado en texto y tiene material nuevo por ver.',
    sources: [
      { kind: 'cliente', id: 'c1', label: 'Endova', url: '/clientes/operacion/endova' },
      { kind: 'pieza', id: 'i4', label: 'Promo del mes (20 oct)', url: '/parrillas/p-endova?item=i4' },
      { kind: 'pieza', id: 'i3', label: 'Detrás de cámaras (12 oct)', url: '/parrillas/p-endova?item=i3' }
    ],
    failures: [{ tool: 'memoria_de_reuniones' }]
  },
  {
    match: /sueldo|salario|nómina|contraseña/i,
    answer: 'Esa información no está disponible para ti aquí. Lo de nómina lo ve quien tiene acceso a Financiero, y los accesos todavía no viven en la plataforma.',
    sources: []
  }
];

const DEFAULT_ANSWER = { answer: 'No tengo esa información en la plataforma. Puedo contarte de tus tareas, de un cliente, de su parrilla o de lo que sale en redes.', sources: [] };

export async function createBriaPreview({ port = 3720 } = {}) {
  const api = express();
  api.use(express.json());
  // Fictitious preview state only. Production uses the authenticated PostgreSQL repository.
  const chats = new Map();
  const rowSummary = ({ id, title, revision, updatedAt }) => ({ id, title, revision, updatedAt });
  api.get('/api/bria/conversations', (_req, res) => res.json([...chats.values()].reverse().map(rowSummary)));
  api.post('/api/bria/conversations', (_req, res) => {
    const row = { id: randomUUID(), title: 'Nueva conversación', revision: 0, turns: [], updatedAt: new Date().toISOString() };
    chats.set(row.id, row); res.status(201).json(row);
  });
  const media = multer({ storage: multer.memoryStorage() });
  api.post('/api/bria/conversations/dictation', media.single('audio'), (_req, res) => res.json({ text: 'Este es un dictado de prueba.' }));
  api.get('/api/bria/conversations/:id', (req, res) => chats.has(req.params.id) ? res.json(chats.get(req.params.id)) : res.status(404).json({ message: 'Conversación no encontrada.' }));
  api.delete('/api/bria/conversations/:id', (req, res) => {
    const row = chats.get(req.params.id);
    if (!row) return res.status(404).json({ message: 'Conversación no encontrada.' });
    if (row.revision !== req.body?.expectedRevision) return res.status(409).json({ message: 'La conversación cambió.' });
    chats.delete(row.id); return res.json({ deleted: true, filesPending: false });
  });
  api.post('/api/bria/conversations/:id/messages', media.array('files', 5), async (req, res) => {
    const row = chats.get(req.params.id);
    if (!row) return res.status(404).json({ message: 'Conversación no encontrada.' });
    const question = String(req.body?.question || '');
    await wait(700);
    if (/error/i.test(question)) return res.status(500).json({ message: 'Bria no pudo responder. Intenta de nuevo en un momento.' });
    if (/bloque/i.test(question)) return res.status(403).json({ message: 'Uso de IA bloqueado: hay una empresa protegida. Revisa Gobierno de IA.' });
    const found = ANSWERS.find(entry => entry.match.test(question)) || DEFAULT_ANSWER;
    row.turns.push({ id: `${row.id}:${row.revision * 2}`, role: 'user', text: question, attachments: (req.files || []).map(file => ({ id: randomUUID(), name: file.originalname, size: file.size, status: 'READ' })) }, { id: `${row.id}:${row.revision * 2 + 1}`, role: 'assistant', text: found.answer, sources: found.sources || [], failures: found.failures || [] });
    if (!row.revision) row.title = question.slice(0, 90);
    row.revision++; row.updatedAt = new Date().toISOString(); res.json(row);
  });
  api.get('/api/bria/knowledge', (_req, res) => res.json([]));
  api.post('/api/bria/ask', async (req, res) => {
    const question = String(req.body?.question || '');
    await wait(700);
    if (/error/i.test(question)) return res.status(500).json({ error: 'BRIA_ASSISTANT_FAILED', message: 'Bria no pudo responder. Intenta de nuevo en un momento.' });
    if (/bloque/i.test(question)) return res.status(403).json({ error: 'AI_SCOPE_REQUIRED', message: 'Uso de IA bloqueado: hay una empresa protegida. Revisa Gobierno de IA.' });
    const found = ANSWERS.find((entry) => entry.match.test(question)) || DEFAULT_ANSWER;
    return res.json({ answer: found.answer, sources: found.sources || [], toolsUsed: [], failures: found.failures || [], rounds: 1 });
  });
  api.all('/api/*', (req, res) => res.status(404).json({ error: `Consulta no disponible en esta muestra local: ${req.path}` }));

  const server = await createServer({
    configFile: false,
    root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    // Una sola caché para la muestra y el recorrido de navegador: el primer arranque optimiza una vez.
    cacheDir: path.resolve(import.meta.dirname, '../node_modules/.vite-bria'),
    appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/bria-assistant-preview.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-bria'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-bria-preview', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname.startsWith('/api/')) return api(req, res, next);
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/bria-assistant-preview.html';
        return next();
      });
    } }]
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  return { origin, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createBriaPreview({ port: Number(process.env.BRIA_PREVIEW_PORT || 3720) });
  console.log(`Preguntarle a Bria: ${preview.origin}/?abierta  (también &dark)\nRespuestas simuladas. Sin base de datos ni OpenAI.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
