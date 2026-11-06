// Local API with real routes and PostgreSQL, no cron/bootstrap or external services.
import net from 'node:net';
import { assertSharedTaskDatabase } from '../tests/support/sharedTaskSandbox.js';
import { startTaskPieceStorage } from '../tests/support/taskPieceFixture.js';

assertSharedTaskDatabase(process.env.DATABASE_URL);
if (process.env.NODE_ENV !== 'test') throw new Error('Solo funciona en NODE_ENV=test.');
const port = Number(process.env.PORT || 8092);
if (!Number.isInteger(port) || port < 1024 || port > 65535 || [8091, 3181, 3182, 55451].includes(port)) throw new Error('Puerto de prueba inválido.');
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...input) {
  const args = Array.isArray(input[0]) ? input[0] : input;
  const first = args[0];
  const host = typeof first === 'object' ? (first.host || first.hostname || 'localhost') : (typeof args[1] === 'string' ? args[1] : 'localhost');
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('La API aislada bloqueó una conexión externa.');
  return originalConnect.apply(this, input);
};
const storage = await startTaskPieceStorage();
process.env.AWS_ENDPOINT_URL = storage.origin;
process.env.BRIA_STORAGE_ENDPOINT = storage.origin;
process.env.BRIA_STORAGE_ACCESS_KEY_ID = 'local-agency-memory';
process.env.BRIA_STORAGE_SECRET_ACCESS_KEY = 'fictitious-agency-memory-secret';
process.env.BRIA_STORAGE_BUCKET = 'task-piece-agency-memory-test';
if (process.env.TEST_PLATFORM_STORAGE_DISABLED !== 'true') {
  process.env.PLATFORM_STORAGE_ENDPOINT = storage.origin;
  process.env.PLATFORM_STORAGE_ACCESS_KEY_ID = 'local-final-deliveries';
  process.env.PLATFORM_STORAGE_SECRET_ACCESS_KEY = 'fictitious-final-deliveries-secret';
  process.env.PLATFORM_STORAGE_BUCKET = 'task-piece-platform-test';
  process.env.PLATFORM_STORAGE_FORCE_PATH_STYLE = 'true';
}
const express = (await import('express')).default;
const prisma = (await import('../src/lib/prisma.js')).default;
const apiRouter = (await import('../src/routes/index.js')).default;
const { operationalAuditMiddleware } = await import('../src/middlewares/operationalAuditMiddleware.js');
const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(operationalAuditMiddleware);
app.get('/api/health', (_req, res) => res.json({ status: 'ok', demo: true, isolatedTaskPieceTest: true, storageOrigin: storage.origin,
  deliveryBucket: process.env.PLATFORM_STORAGE_BUCKET || null, evidenceBucket: process.env.AWS_S3_BUCKET_NAME,
  memoryBucket: process.env.BRIA_STORAGE_BUCKET }));
// Executes only against this guarded, fictitious database and its in-memory object store.
app.post('/__test/cleanup-deliverables', async (_req, res, next) => {
  try {
    const { cleanupContentDeliveryUploads } = await import('../src/services/contentDeliveryService.js');
    const { cleanupTaskDeliverables } = await import('../src/services/taskDeliverableService.js');
    res.json({ content: await cleanupContentDeliveryUploads(), tasks: await cleanupTaskDeliverables() });
  } catch (error) { next(error); }
});
app.use('/api', apiRouter);
app.use((error, _req, res, _next) => { console.error('[Tarea y pieza local]', error.message); res.status(error.statusCode || error.status || 500).json({ error: error.message }); });
await prisma.$connect();
const server = app.listen(port, '127.0.0.1', () => console.log(`TASK_PIECE_API_READY http://127.0.0.1:${port}`));
server.once('error', async error => { console.error(error.message); await storage.close(); await prisma.$disconnect(); process.exit(1); });
const close = () => server.close(async () => { await storage.close(); await prisma.$disconnect(); process.exit(0); });
process.once('SIGINT', close); process.once('SIGTERM', close);
