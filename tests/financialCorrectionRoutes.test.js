import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accountStatementHandler, paymentCorrectionContextHandler, paymentCorrectionHandler } from '../src/controllers/financialCorrectionController.js';
test('las tres rutas conservan lectura/escritura financiera y pasan solo la identidad del servidor', async () => {
  const routes = readFileSync(new URL('../src/routes/api/financials.js', import.meta.url), 'utf8');
  assert.match(routes, /router.get\('\/accounts\/:accountId\/statement', requireFinancialAccess, accountStatementHandler\)/);
  assert.match(routes, /router.get\('\/payment-corrections\/:kind\/:paymentId', requireFinancialAccess, paymentCorrectionContextHandler\)/);
  assert.match(routes, /router.post\('\/payment-corrections\/:kind\/:paymentId', requireFinancialWrite, paymentCorrectionHandler\)/);
  const user = { id: 'real-user' }, calls = [];
  const res = { json: value => value, status: () => res };
  await paymentCorrectionHandler({ params: { kind: 'payroll', paymentId: 'p1' }, body: { actor: { role: 'ADMIN' } }, user }, res, { prismaClient: {}, correctExpensePayment: (...args) => { calls.push(args); return {}; } });
  assert.equal(calls[0][4], user);
  assert.equal(typeof accountStatementHandler, 'function'); assert.equal(typeof paymentCorrectionContextHandler, 'function');
});
