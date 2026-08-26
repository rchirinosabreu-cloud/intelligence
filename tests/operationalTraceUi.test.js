import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('operational trace schema is additive, indexed, and records notification read time', async () => {
  const schema = await read('prisma/schema.prisma');

  assert.match(schema, /model OperationalTraceEvent\s*\{/);
  assert.match(schema, /eventType\s+String/);
  assert.match(schema, /actorId\s+String\?/);
  assert.match(schema, /subjectUserId\s+String\?/);
  assert.match(schema, /taskId\s+String\?/);
  assert.match(schema, /metadata\s+Json\?/);
  assert.match(schema, /@@index\(\[actorId, eventType, occurredAt\]\)/);
  assert.match(schema, /model Notification[\s\S]*?readAt\s+DateTime\?/);
});

test('trace collection covers task sync, task opening, mutations, and notification reads', async () => {
  const taskController = await read('src/controllers/taskController.js');
  const taskService = await read('src/services/nativeTaskService.js');
  const taskPanel = await read('src/components/modules/TaskSidePanel.jsx');
  const notificationService = await read('src/services/notificationService.js');

  assert.match(taskController, /recordTaskListSync/);
  assert.match(taskPanel, /\/trace-open/);
  assert.match(taskService, /eventType:\s*'TASK_CREATED'/);
  assert.match(taskService, /eventType:\s*'TASK_UPDATED'/);
  assert.match(notificationService, /data:\s*\{\s*isRead:\s*true,\s*readAt\s*\}/);
  assert.match(notificationService, /eventType:\s*'NOTIFICATION_READ'/);
});

test('central audit covers every successful platform mutation and login without storing request bodies', async () => {
  const middleware = await read('src/middlewares/operationalAuditMiddleware.js');
  const server = await read('server.js');
  const auth = await read('src/controllers/authController.js');
  const trace = await read('src/services/operationalTraceService.js');

  assert.match(middleware, /POST.*PUT.*PATCH.*DELETE/);
  assert.match(middleware, /PLATFORM_MUTATION/);
  assert.doesNotMatch(middleware, /req\.body/);
  assert.match(server, /app\.use\(operationalAuditMiddleware\)/);
  assert.match(auth, /eventType:\s*'SESSION_STARTED'/);
  assert.match(trace, /TRACE_RETENTION_DAYS = 365/);
});

test('operational trace API and UI remain exclusive to administrators', async () => {
  const routes = await read('src/routes/api/dashboard.js');
  const health = await read('src/components/modules/OperationalHealth.jsx');
  const panel = await read('src/components/modules/OperationalTracePanel.jsx');

  assert.match(routes, /operational-trace', requireRole\('ADMIN'\)/);
  assert.match(health, /<OperationalTracePanel/);
  assert.match(panel, /Trazabilidad operativa/);
  assert.match(panel, /Buscar por tarea/);
  assert.match(panel, /Eventos registrados/);
  assert.match(panel, /queryKey:\s*\['operational-trace'/);
  assert.doesNotMatch(panel, /Lectura del diagnóstico/);
});
