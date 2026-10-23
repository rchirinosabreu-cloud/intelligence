// El mapa de la plataforma para Bria (10 de octubre de 2026): toda ruta real de la API está descrita en español o
// excluida con su motivo. Una ruta nueva sin su frase rompe esta prueba: así Bria crece con la plataforma.
process.env.JWT_SECRET ||= 'clave-de-prueba-local-de-32-caracteres-o-mas';
import test from 'node:test';
import assert from 'node:assert/strict';
import { listApiRoutes, routeKey } from '../src/lib/platformRoutes.js';
import { PLATFORM_OPERATIONS, PLATFORM_EXCLUDED, isExcludedOperation, matchOperation, findOperations, describeGuards } from '../src/lib/platformCatalog.js';
import { buildRoutePermissionIndex } from '../src/lib/platformPermissions.js';

const { default: apiRouter } = await import('../src/routes/index.js');
const routes = listApiRoutes(apiRouter);
const keys = [...new Set(routes.map((route) => routeKey(route.method, route.path)))];

test('the router really yields the API: hundreds of routes, with their guards read from the code', () => {
  assert.ok(routes.length > 300, `solo ${routes.length} rutas`);
  const tasks = routes.find((route) => route.method === 'PATCH' && route.path === '/tasks/:taskId');
  assert.deepEqual(describeGuards(tasks.guards), { modules: ['gestion'] });
  const rhythm = routes.find((route) => route.method === 'GET' && route.path === '/manager/rhythm');
  assert.deepEqual(describeGuards(rhythm.guards), { modules: ['manager'], roles: ['MANAGER'] });
  const vault = routes.find((route) => route.method === 'GET' && route.path === '/vault/credentials');
  assert.deepEqual(describeGuards(vault.guards), { roles: ['MANAGER'] });
  const clients = routes.find((route) => route.method === 'GET' && route.path === '/clients');
  assert.equal(describeGuards(clients.guards), null, 'a route with no guard beyond the session says so');
});

test('every real route is described for Bria or excluded with a reason', () => {
  const missing = keys.filter((key) => !PLATFORM_OPERATIONS[key] && !isExcludedOperation(key));
  assert.deepEqual(missing, [], `rutas sin describir ni excluir:\n${missing.join('\n')}`);
});

// 22 de octubre de 2026: una pantalla que recibe archivos lo dice en su código (`receivesFiles`) y en el mapa
// (`archivo`), así Bria la usa desde el chat o WhatsApp sin una herramienta propia; una que recibe archivos sin
// decirlo, o un mapa que promete archivos donde la ruta no los recibe, rompe esta prueba.
test('every route that receives files says so in its code, and the map promises files only where the route takes them', () => {
  const unmarked = routes.filter((route) => route.unmarkedFiles && !isExcludedOperation(routeKey(route.method, route.path))).map((route) => routeKey(route.method, route.path));
  assert.deepEqual(unmarked, [], `rutas que reciben archivos sin receivesFiles:\n${unmarked.join('\n')}`);
  const uploads = new Map(routes.filter((route) => route.upload).map((route) => [routeKey(route.method, route.path), route.upload]));
  const silent = [...uploads.keys()].filter((key) => PLATFORM_OPERATIONS[key] && !PLATFORM_OPERATIONS[key].archivo);
  assert.deepEqual(silent, [], `reciben archivos y el mapa no lo dice:\n${silent.join('\n')}`);
  const promised = Object.entries(PLATFORM_OPERATIONS).filter(([key, op]) => op.archivo && !uploads.has(key)).map(([key]) => key);
  assert.deepEqual(promised, [], `el mapa promete archivos donde la ruta no los recibe:\n${promised.join('\n')}`);
  for (const key of ['POST /financials/records/:id/documents', 'POST /financials/payables/:id/documents', 'POST /financials/receivable-payments/:paymentId/documents', 'POST /content/items/:id/cover', 'POST /tasks/:taskId/comments']) assert.deepEqual(uploads.get(key)?.field, 'file', key);
  assert.deepEqual(uploads.get('POST /content/items/:id/final-assets'), { field: 'files', max: 10 });
  for (const key of ['GET /financials/records/:id/documents/:documentId/file', 'GET /content/items/:id/final-assets/:assetId', 'DELETE /content/items/:id/final-assets/:assetId', 'POST /financials/import/commit', 'POST /content/items/:id/final-assets/direct-upload']) {
    assert.ok(isExcludedOperation(key), `${key}: bajar, borrar o cargar en masa sigue fuera del chat`);
  }
});

test('nothing described is also excluded, and nothing described points to a route that no longer exists', () => {
  const both = Object.keys(PLATFORM_OPERATIONS).filter((key) => isExcludedOperation(key));
  assert.deepEqual(both, [], `descritas y excluidas a la vez: ${both.join(', ')}`);
  const stale = Object.keys(PLATFORM_OPERATIONS).filter((key) => !keys.includes(key));
  assert.deepEqual(stale, [], `descritas sin ruta real: ${stale.join(', ')}`);
  for (const [key, op] of Object.entries(PLATFORM_OPERATIONS)) {
    assert.ok(op.que && op.que.length >= 12 && /[.!?]$/.test(op.que), `${key}: la frase debe ser una oración`);
    assert.doesNotMatch(op.que, /vosotros|tenéis|podéis/);
  }
  for (const rule of PLATFORM_EXCLUDED) assert.ok(rule.reason.length > 6);
});

test('what Bria must never touch stays excluded even if someone describes it later', () => {
  for (const key of ['POST /users', 'PUT /team/:id', 'DELETE /team/:id', 'POST /user/mfa/reset/:userId', 'PUT /user/password', 'GET /vault/credentials', 'POST /vault/credentials/:id/reveal', 'DELETE /content/plans/:id', 'POST /feedback', 'POST /drive/upload', 'POST /login', 'GET /talent-radar/summary', 'GET /financials/payroll-ledger', 'POST /financials/payroll-transactions/:id/pay']) {
    assert.ok(isExcludedOperation(key), `${key} debería estar excluida`);
    assert.equal(PLATFORM_OPERATIONS[key], undefined, `${key} no debe estar descrita`);
  }
});

test('a concrete path finds its operation and its parameters; a search finds by Spanish words', () => {
  const op = matchOperation('PATCH', '/tasks/abc-123?x=1');
  assert.deepEqual([op.key, op.params], ['PATCH /tasks/:taskId', { taskId: 'abc-123' }]);
  assert.equal(matchOperation('GET', '/content/plans/aristea/10-2026').key, 'GET /content/plans/:clientSlug/:month-:year');
  assert.deepEqual(matchOperation('GET', '/content/plans/aristea/10-2026').params, { clientSlug: 'aristea', month: '10', year: '2026' });
  assert.equal(matchOperation('GET', '/content/plans/p1/criteria').key, 'GET /content/plans/:id/criteria');
  assert.equal(matchOperation('POST', '/no/existe'), null);
  const found = findOperations('anuncio general equipo');
  assert.equal(found[0].key, 'POST /global-announcements');
  assert.ok(findOperations('abono cartera', { writesOnly: true }).some((row) => row.key === 'POST /financials/receivables/:id/payments'));
  assert.deepEqual(findOperations(''), []);
});

test('the permission index gives each described operation what its route asks for', () => {
  const index = buildRoutePermissionIndex(apiRouter);
  assert.deepEqual(index.get('POST /global-announcements'), { roles: ['MANAGER'] });
  assert.deepEqual(index.get('POST /client-operations/:clientId/observations'), { modules: ['clientes'], roles: ['MANAGER'] });
  assert.deepEqual(index.get('POST /financials/records'), { financial: ['write'] });
  assert.equal(index.get('GET /user/notes'), null);
  assert.deepEqual(index.get('GET /service-health'), { roles: ['ADMIN'] }, 'a router-level guard with its own middleware is read too');
  const undescribed = Object.keys(PLATFORM_OPERATIONS).filter((key) => !index.has(key));
  assert.deepEqual(undescribed, []);
});
