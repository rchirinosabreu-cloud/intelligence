import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { createServer } from 'vite';
import { createServiceHealthRouter } from '../src/routes/api/serviceHealth.js';
import { createServiceHealthService } from '../src/services/serviceHealthService.js';
import { SERVICE_CATALOG } from '../src/lib/serviceHealth.js';

// Muestra local del semáforo de servicios (4 de octubre de 2026). La ruta, el servicio y las reglas
// del color son los reales; la base es una memoria y las comprobaciones son simuladas por escenario.
// No hay dotenv, ni base de datos, ni llamadas a ningún proveedor.

const MIN = 60 * 1000;

const SCENARIOS = {
  bien: {
    meta: { status: 'NOT_CONFIGURED', message: 'Falta el token del usuario del sistema de Meta.' }
  },
  problemas: {
    openai: { status: 'WARN', message: '3 minutas esperan a que la IA vuelva a atender.' },
    fireflies: { status: 'FAIL', critical: true, errorCode: 'AUTH', message: 'Fireflies rechazó la clave: hay que revisarla.' },
    'google-calendar': { status: 'WARN', message: 'Pide volver a conectarse: diseno@brainstudioagencia.com.' },
    email: { status: 'FAIL', errorCode: 'TIMEOUT', message: 'No respondió a tiempo.' },
    meta: { status: 'NOT_CONFIGURED', message: 'Falta el token del usuario del sistema de Meta.' }
  }
};

const OK_MESSAGES = {
  database: 'Responde con normalidad.',
  openai: 'Responde con normalidad.',
  fireflies: 'Responde con normalidad.',
  'google-calendar': '2 cuentas conectadas y sincronizando.',
  'google-storage': 'El bucket «brainstudio-unstructured-v2» responde.',
  'storage-chat': 'El bucket «chat-evidence» responde.',
  'storage-memory': 'El bucket «agency-memory» responde.',
  'storage-financial': 'El bucket «financial-evidence» responde.',
  email: 'Inicia sesión con normalidad.',
  push: '14 dispositivos registrados.',
  trm: 'TRM vigente: 3.912.'
};

const memoryDb = () => {
  const store = [];
  return {
    store,
    serviceHealthCheck: {
      async groupBy() {
        const latest = new Map();
        for (const row of store) if (!latest.has(row.serviceId) || row.checkedAt > latest.get(row.serviceId)) latest.set(row.serviceId, row.checkedAt);
        return [...latest].map(([serviceId, checkedAt]) => ({ serviceId, _max: { checkedAt } }));
      },
      async createMany({ data }) { store.push(...data); return { count: data.length }; },
      async findMany({ where }) {
        return store.filter((row) => row.checkedAt >= where.checkedAt.gte).sort((a, b) => b.checkedAt - a.checkedAt);
      },
      async deleteMany() { return { count: 0 }; }
    }
  };
};

const outcomeFor = (scenario, id) => SCENARIOS[scenario][id] || { status: 'OK', message: OK_MESSAGES[id], latencyMs: 180 };

const seed = (db, scenario) => {
  const now = Date.now();
  let index = 0;
  for (const service of SERVICE_CATALOG) {
    for (let age = 24 * 60 - 1; age >= 1; age -= service.intervalMs / MIN) {
      const checkedAt = new Date(now - age * MIN);
      let outcome = { status: 'OK', message: OK_MESSAGES[service.id], latencyMs: 150 };
      // Una caída corta de OpenAI hace nueve horas, para que el historial cuente algo.
      if (service.id === 'openai' && age > 8.5 * 60 && age < 9.5 * 60) outcome = { status: 'FAIL', errorCode: 'HTTP_503', message: 'El proveedor tiene una falla de su lado.' };
      const current = SCENARIOS[scenario][service.id];
      if (current?.status === 'NOT_CONFIGURED') outcome = current;
      if (scenario === 'problemas' && service.id === 'fireflies' && age < 50) outcome = current;
      if (scenario === 'problemas' && service.id === 'email' && age < 2) outcome = current;
      store(db, service.id, checkedAt, outcome, index += 1);
    }
  }
};

const store = (db, serviceId, checkedAt, outcome, index) => db.serviceHealthCheck.createMany({ data: [{
  id: `seed-${index}`, serviceId, checkedAt, status: outcome.status, critical: Boolean(outcome.critical),
  latencyMs: outcome.latencyMs ?? null, message: outcome.message || null, errorCode: outcome.errorCode || null
}] });

export async function createServiceHealthPreview({ port = 3710 } = {}) {
  const services = {};
  for (const scenario of Object.keys(SCENARIOS)) {
    const db = memoryDb();
    seed(db, scenario);
    const probes = Object.fromEntries(SERVICE_CATALOG.map((service) => [service.id, async () => outcomeFor(scenario, service.id)]));
    services[scenario] = createServiceHealthService({ db, probes });
    // Una ronda real al arrancar: la última comprobación de cada servicio es la del escenario.
    await services[scenario].runDueChecks({ force: true });
  }
  const routers = Object.fromEntries(Object.entries(services).map(([scenario, service]) => [scenario, createServiceHealthRouter({ service })]));

  const api = express();
  api.use((req, _res, next) => { req.user = { userId: 'user-rodny', role: 'ADMIN' }; next(); });
  api.use('/api/service-health', (req, res, next) => {
    const scenario = new URL(req.headers.referer || 'http://x/', 'http://x').searchParams.get('escenario');
    return routers[SCENARIOS[scenario] ? scenario : 'problemas'](req, res, next);
  });
  const demoUser = { id: 'user-rodny', name: 'Rodny Chirinos', role: 'ADMIN' };
  api.get('/api/auth/me', (_req, res) => res.json(demoUser));
  api.get('/api/user/profile', (_req, res) => res.json(demoUser));
  api.all('/api/*', (req, res) => res.status(404).json({ error: `Consulta no disponible en esta muestra local: ${req.path}` }));

  const server = await createServer({
    configFile: false,
    root: path.resolve(import.meta.dirname, '..'),
    envDir: path.resolve(import.meta.dirname, '../tests/fixtures'),
    cacheDir: path.resolve(import.meta.dirname, `../node_modules/.vite-service-health-${port}`),
    appType: 'mpa',
    optimizeDeps: { entries: ['tests/fixtures/service-health-preview.html'] },
    esbuild: { jsx: 'automatic' },
    define: { __BUILD_SHA__: JSON.stringify('local-service-health'), 'import.meta.env.VITE_API_URL': 'window.location.origin' },
    resolve: { alias: { '@': path.resolve(import.meta.dirname, '../src') } },
    logLevel: 'warn',
    server: { host: '127.0.0.1', port, strictPort: true, proxy: {} },
    plugins: [{ name: 'isolated-service-health-preview', configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname.startsWith('/api/')) return api(req, res, next);
        if (req.headers.accept?.includes('text/html') && !pathname.includes('.')) req.url = '/tests/fixtures/service-health-preview.html';
        return next();
      });
    } }]
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  return { origin, close: () => server.close() };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const preview = await createServiceHealthPreview({ port: Number(process.env.SERVICE_HEALTH_PREVIEW_PORT || 3710) });
  console.log(`Semáforo de servicios: ${preview.origin}/?escenario=problemas  (también ?escenario=bien, &dark)\nDatos simulados en memoria. Sin base de datos ni proveedores.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await preview.close(); process.exit(0); });
}
