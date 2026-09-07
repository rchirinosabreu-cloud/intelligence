import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const path = new URL('../src/controllers/financialClientStatementController.js', import.meta.url);
const { getClientFinancialStatementHandler } = fs.existsSync(path) ? await import(path.href) : {};
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.payload = payload; return this; } });
test('statement route always requires the shared financial read permission', () => {
  assert.match(fs.readFileSync('src/routes/api/financials.js', 'utf8'), /router\.get\('\/clients\/:clientId\/statement', requireFinancialAccess, getClientFinancialStatementHandler\)/);
});
test('statement handler passes exact client and filters to the read service', async () => {
  assert.equal(typeof getClientFinancialStatementHandler, 'function');
  const res = response(), db = {}, query = { year: '2026', section: 'income' };
  await getClientFinancialStatementHandler({ params: { clientId: 'a' }, query }, res, { prismaClient: db, getStatement: async (database, id, filters) => { assert.equal(database, db); assert.equal(id, 'a'); assert.equal(filters, query); return { items: [], nextCursor: null }; } });
  assert.deepEqual(res.payload, { items: [], nextCursor: null });
});
test('statement errors never become an empty financial result or expose database details', async t => {
  assert.equal(typeof getClientFinancialStatementHandler, 'function');
  t.mock.method(console, 'error', () => {});
  for (const statusCode of [404, 409, 500]) {
    const res = response();
    await getClientFinancialStatementHandler({ params: { clientId: 'a' }, query: {} }, res, { getStatement: async () => { throw Object.assign(new Error(statusCode === 500 ? 'private database detail' : 'Revisa el cliente'), { statusCode }); } });
    assert.equal(res.statusCode, statusCode);
    assert.equal(res.payload.items, undefined);
    assert.doesNotMatch(res.payload.message, /private database detail/);
  }
});
