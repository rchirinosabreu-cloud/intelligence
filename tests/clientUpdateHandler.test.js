import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const path = new URL('../src/controllers/clientUpdateHandler.js', import.meta.url);
const { createUpdateClientHandler } = existsSync(path) ? await import(path.href) : {};
const response = () => ({ statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } });

async function execute(body, update = async ({ where, data }) => ({ id: where.id, ...data })) {
  assert.equal(typeof createUpdateClientHandler, 'function');
  const calls = [], errors = [], res = response();
  const handler = createUpdateClientHandler({
    db: { client: { update: async args => { calls.push(args); return update(args); } } },
    logger: { error: (...args) => errors.push(args) },
  });
  await handler({ params: { id: 'client-a' }, body }, res);
  return { calls, errors, res };
}

test('name and slug patches keep omitted fields and unrelated client data untouched', async () => {
  for (const [body, expected] of [
    [{ name: '  Nuevo nombre  ' }, { name: 'Nuevo nombre' }],
    [{ slug: 'nuevo-slug' }, { slug: 'nuevo-slug' }],
    [{ name: 'Nombre', slug: 'nuevo-slug', isArchived: true, id: 'other' }, { name: 'Nombre', slug: 'nuevo-slug' }],
  ]) {
    const { calls, res } = await execute(body);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [{ where: { id: 'client-a' }, data: expected }]);
  }
});

test('invalid edit values are rejected before writing to the database', async () => {
  for (const body of [null, {}, { name: '' }, { name: '  ' }, { name: 42 }, { slug: '' }, { slug: null }, { slug: 'UPPER' }, { slug: 'with space' }, { slug: '../path' }, { slug: 'name?foo' }]) {
    const { calls, res } = await execute(body);
    assert.equal(res.statusCode, 400, JSON.stringify(body));
    assert.equal(calls.length, 0);
    assert.ok(res.body.error);
  }
});

test('slug conflicts and missing clients return clear errors without false success', async () => {
  for (const [code, status, message] of [['P2002', 409, /slug.*uso/i], ['P2025', 404, /cliente.*existe/i]]) {
    const { res, errors } = await execute({ slug: 'valid-slug' }, async () => { throw Object.assign(new Error('Database detail'), { code }); });
    assert.equal(res.statusCode, status);
    assert.match(res.body.error, message);
    assert.equal(errors.length, 1);
    assert.equal(res.body.id, undefined);
  }
});

test('unexpected errors are logged but internal database details remain private', async () => {
  const { res, errors } = await execute({ name: 'Nombre' }, async () => { throw new Error('private database details'); });
  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(res.body.error, /private database details/);
  assert.equal(errors.length, 1);
});

test('the existing client update route retains manager authorization and uses the validated handler', () => {
  const routes = readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  const controller = readFileSync(new URL('../src/controllers/clientController.js', import.meta.url), 'utf8');
  assert.match(routes, /router\.patch\('\/clients\/:id', requireManagerRole, clientController\.updateClient\)/);
  assert.match(controller, /createUpdateClientHandler\(\{ db: prisma \}\)/);
});
