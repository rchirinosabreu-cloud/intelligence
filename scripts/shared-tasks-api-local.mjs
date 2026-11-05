// Soporte de prueba: rutas, autenticación, controladores y persistencia reales, sin bootstrap de cron/integraciones.
import net from 'node:net';
import { assertSharedTaskDatabase } from '../tests/support/sharedTaskSandbox.js';

assertSharedTaskDatabase(process.env.DATABASE_URL);
if (process.env.NODE_ENV !== 'test') throw new Error('Este servidor solo funciona en NODE_ENV=test.');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...input) {
  const args = Array.isArray(input[0]) ? input[0] : input;
  const first = args[0];
  const host = typeof first === 'object' ? (first.host || first.hostname || 'localhost') : (typeof args[1] === 'string' ? args[1] : 'localhost');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('La prueba aislada bloqueó una conexión externa.');
  return originalConnect.apply(this, input);
};
const express = (await import('express')).default;
const prisma = (await import('../src/lib/prisma.js')).default;
const apiRouter = (await import('../src/routes/index.js')).default;
const { operationalAuditMiddleware } = await import('../src/middlewares/operationalAuditMiddleware.js');
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(operationalAuditMiddleware);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', demo: true, isolatedSharedTaskTest: true }));
app.use('/api', apiRouter);
app.use((error, _req, res, _next) => {
  console.error('[Compartidas API local]', error.message);
  res.status(error.statusCode || error.status || 500).json({ error: error.message });
});
await prisma.$connect();
const server = app.listen(8091, '127.0.0.1', () => console.log('SHARED_TASK_API_READY http://127.0.0.1:8091'));
const close = () => server.close(async () => { await prisma.$disconnect(); process.exit(0); });
process.once('SIGINT', close);
process.once('SIGTERM', close);
