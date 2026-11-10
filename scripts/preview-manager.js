import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import express from 'express';
import { createServer } from 'vite';
import { createManagerDecisionService } from '../src/services/managerDecisionService.js';
import { visibleReadingDecisions } from '../src/lib/dailyReading.js';
import { resolveDecisionRef, scorecard } from '../src/lib/decisionLog.js';

// Laboratorio local de Manager → Decisiones (10 de noviembre de 2026). Corre el servicio real sobre memoria: sin .env,
// sin base de datos, sin producción. Con `MANAGER_PREVIEW_DATA=<ruta a un JSON>` usa una copia exportada en solo lectura
// (esa copia nunca se versiona); sin ella, una agencia inventada. Lo que se responde aquí vive en memoria y se pierde al
// cerrar.

const NOW = () => new Date();
const fictitious = () => {
  const day = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
  return {
    reading: { reading: {
      day,
      signals: [
        { id: 'ROJO_SOSTENIDO:c1', kind: 'ROJO_SOSTENIDO', subjectType: 'CLIENT', subjectId: 'c1', subjectName: 'Cliente Faro', severity: 3, text: 'Cliente Faro lleva 8 días en rojo: hay dos piezas con fecha pasada sin publicar.' },
        { id: 'VENCIDAS_SOSTENIDAS:p1', kind: 'VENCIDAS_SOSTENIDAS', subjectType: 'PERSON', subjectId: 'p1', subjectName: 'Ana Ejemplo', severity: 2, text: 'Ana Ejemplo lleva 6 días con tareas vencidas (hoy 3).' }
      ],
      decisions: [
        { id: `${day}:1`, kind: 'HACER', title: 'Cerrar las piezas atrasadas de Cliente Faro', why: 'Lleva 8 días en rojo y el mes cierra en 3 días.', evidence: ['ROJO_SOSTENIDO:c1'], subjectType: 'CLIENT', subjectId: 'c1', subjectName: 'Cliente Faro', url: '/clientes' },
        { id: `${day}:2`, kind: 'CONVERSAR', title: 'Conversar con Ana sobre sus vencidas', why: 'Ana lleva 6 días con tareas vencidas.', ask: 'Resúmeme las vencidas de Ana y propón qué mover.', evidence: ['VENCIDAS_SOSTENIDAS:p1'], subjectType: 'PERSON', subjectId: 'p1', subjectName: 'Ana Ejemplo', url: '/gestion' },
        { id: `${day}:3`, kind: 'NO_HACER', title: 'No sumarle trabajo a Ana esta semana', why: 'Tiene vencidas sostenidas.', evidence: ['VENCIDAS_SOSTENIDAS:p1'], subjectType: 'PERSON', subjectId: 'p1', subjectName: 'Ana Ejemplo' }
      ]
    } },
    entries: [],
    signals: [
      { id: 's1', status: 'OPEN', category: 'UNEXPLAINED_CHARGE', sourceKind: 'MEETING_MINUTE', severity: 'critical', clientId: null, title: 'Apareció un cobro de pauta que nadie reconoce.', evidence: 'Hay un cobro de cuatrocientos mil que no sé de dónde salió.', suggestedAction: 'Revisar el cobro con administración antes del cierre.', sourceUrl: '/minutas', lastDetectedAt: new Date().toISOString(), updatedAt: 'v1', metadata: { meetingTitle: 'Comité semanal', meetingAt: new Date(Date.now() - 2 * 86400000).toISOString(), owner: 'Ana Ejemplo' } }
    ],
    dismissed: [], clients: []
  };
};

const loadData = () => {
  const flag = process.argv.indexOf('--data');
  const file = process.env.MANAGER_PREVIEW_DATA || (flag > 0 ? process.argv[flag + 1] : null);
  if (!file) return { ...fictitious(), real: false };
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  return { ...raw, real: true };
};

const matchesStatus = (row, where = {}) => {
  const conditions = where.AND || [where];
  return conditions.every((condition) => {
    if (condition.OR) return true; // la cita comprobada ya viene filtrada en la copia
    if (condition.status?.in) return condition.status.in.includes(row.status);
    if (typeof condition.status === 'string' && row.status !== condition.status) return false;
    if (condition.dismissedAt?.gte && !(new Date(row.dismissedAt) >= condition.dismissedAt.gte)) return false;
    return true;
  });
};

export async function createManagerPreview({ port = 3120 } = {}) {
  const data = loadData();
  const signals = data.signals.map((row) => ({ ...row }));
  const dismissed = [...data.dismissed];
  const entries = (data.entries || []).map((row) => ({ decisionId: row.decision_id || row.decisionId, dayKey: row.day_key || row.dayKey, verdict: row.verdict, note: row.note, decidedAt: row.decided_at || row.decidedAt }));
  const reading = data.reading.reading;
  const viewer = { id: 'user-rodny', name: 'Rodny Chirinos', role: 'ADMIN', teamMember: { name: 'Rodny Chirinos' }, modulePermissions: { manager: true } };
  const visible = () => visibleReadingDecisions(reading, { clientIds: null, people: true });

  const readingService = {
    async decisionBoard() {
      return { reading, decisions: visible(), entries, scorecard: scorecard(entries, { proposed: visible().length }) };
    },
    async recordVerdict({ ref, veredicto, nota }) {
      const decision = resolveDecisionRef(ref, visible());
      if (!decision) return { saved: false, motivo: 'No encuentro esa decisión en la lectura de hoy.' };
      const at = new Date().toISOString();
      const index = entries.findIndex((entry) => entry.decisionId === decision.id && entry.dayKey === reading.day);
      const entry = { decisionId: decision.id, dayKey: reading.day, verdict: veredicto, note: nota, decidedAt: at, kind: decision.kind };
      if (index >= 0) entries[index] = entry; else entries.push(entry);
      return { saved: true };
    }
  };

  const db = {
    briaObserverSignal: {
      async findMany({ where }) {
        if (where?.status === 'DISMISSED') return [...dismissed, ...signals.filter((row) => row.status === 'DISMISSED')].filter((row) => matchesStatus(row, where));
        return signals.filter((row) => matchesStatus(row, where));
      },
      async findUnique({ where }) { return signals.find((row) => row.id === where.id) || null; },
      async updateMany({ where, data: patch }) {
        const row = signals.find((item) => item.id === where.id && item.status === where.status && item.updatedAt === where.updatedAt);
        if (!row) return { count: 0 };
        Object.assign(row, patch, { updatedAt: new Date().toISOString() });
        return { count: 1 };
      },
      // Para la bandeja antigua del Observer (historial).
      async groupBy() { return Object.entries(signals.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {})).map(([status, n]) => ({ status, _count: { _all: n } })); },
      async findFirst() { return signals[0] || null; },
      async count() { return 0; }
    },
    briaObserverDetectorState: { async findFirst() { return null; } },
    client: { async findMany({ where }) { return (data.clients || []).filter((row) => where.id.in.includes(row.id)); } }
  };
  const service = createManagerDecisionService({ db, reading: readingService, now: NOW, logger: { info: (line) => console.log(line), error: console.error } });

  const api = express();
  api.use(express.json());
  api.get('/api/manager/decisions', async (_req, res) => res.json(await service.board(viewer)));
  api.post('/api/manager/decisions/respond', async (req, res) => {
    try { res.json(await service.respond(viewer, req.body || {})); }
    catch (error) { res.status(error.status || 500).json({ error: 'MANAGER_DECISION_REJECTED', message: error.message }); }
  });
  api.get('/api/manager/observer-signals', async (_req, res) => res.json({ summary: { active: signals.filter((row) => ['OPEN', 'REVIEWED'].includes(row.status)).length, unverified: 0 }, signals: signals.filter((row) => ['OPEN', 'REVIEWED'].includes(row.status)) }));
  const user = { id: viewer.id, name: viewer.name, email: 'demo@local', role: 'ADMIN', teamRole: 'Director', modulePermissions: { manager: true, gestion: true, clientes: true, bria: true } };
  api.get('/api/auth/me', (_req, res) => res.json(user));
  api.get('/api/user/profile', (_req, res) => res.json(user));
  api.get('/api/notifications', (_req, res) => res.json([]));
  api.all('/api/*', (req, res) => res.status(404).json({ error: 'NO_DISPONIBLE', message: `Esta muestra local solo trae Decisiones (${req.path}).` }));

  const server = await createServer({
    configFile: false,
    root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, `../node_modules/.vite-manager-${port || process.pid}`),
    appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/manager-preview.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-manager'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-manager-preview', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ws://127.0.0.1:*; worker-src 'self' blob:; frame-src 'none'");
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname.startsWith('/api/')) return api(req, res, next);
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/manager-preview.html';
        return next();
      });
    } }]
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  return { origin, real: data.real, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createManagerPreview({ port: Number(process.env.MANAGER_PREVIEW_PORT || 3120) });
  console.log(`Manager local: ${preview.origin}/manager\n${preview.real ? 'Copia de solo lectura de los datos reales, en memoria.' : 'Agencia inventada, en memoria.'} Nada se escribe en producción.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
