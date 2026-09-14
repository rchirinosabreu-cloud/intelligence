import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/never_connect';
const db = {};
globalThis.prisma = db;
const { default: router } = await import('../src/routes/api/team.js');
const route = (method, path) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method])?.route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const request = { user: { role: 'ADMIN', userId: 'admin' }, body: { name: 'Persona', role: 'Editor', email: 'NEW@example.test', modulePermissions: { cotizaciones: true } } };

function setup(existing = null) {
  const writes = [];
  db.user = {
    findUnique: async () => existing,
    create: async ({ data }) => { writes.push(data); return { id: 'new-user', ...data }; },
    update: async () => { throw new Error('Do not mutate existing users on create'); },
  };
  db.teamMember = { create: async ({ data }) => ({ id: 'member', ...data }) };
  db.operationalTraceEvent = { create: async () => ({}) };
  db.$transaction = async callback => callback(db);
  return writes;
}

test('new accounts receive distinct temporary credentials only after transaction commits', async () => {
  const writes = setup();
  const first = response(), second = response();
  await route('post', '/')(request, first);
  await route('post', '/')(request, second);
  assert.equal(first.statusCode, 201);
  assert.ok(first.body.initialAccess?.temporaryPassword?.length >= 20);
  assert.notEqual(first.body.initialAccess.temporaryPassword, second.body.initialAccess.temporaryPassword);
  assert.equal(first.body.initialAccess.email, 'new@example.test');
  assert.equal(await bcrypt.compare(first.body.initialAccess.temporaryPassword, writes[0].password), true);
  assert.equal(writes[0].mustChangePassword, true);
  assert.equal(writes[0].onboardingEligible, true);
  assert.equal(writes[0].modulePermissions.cotizaciones, true);
  assert.equal(first.headers['Cache-Control'], 'no-store, private');
  assert.equal(first.body.password, undefined);
});

test('a failed commit never returns a temporary credential', async () => {
  setup();
  db.$transaction = async callback => { await callback(db); throw new Error('Simulated commit failure'); };
  const res = response();
  await route('post', '/')(request, res);
  assert.equal(res.statusCode, 500);
  assert.equal(res.body.initialAccess, undefined);
});

test('creating a member cannot reset or reactivate an existing account', async () => {
  setup({ id: 'existing', isActive: false });
  const res = response();
  await route('post', '/')(request, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.initialAccess, undefined);
});

test('members without email get no login credential and non-admins cannot provision', async () => {
  const writes = setup();
  const res = response();
  await route('post', '/')({ ...request, body: { ...request.body, email: '' } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.initialAccess, undefined);
  assert.equal(writes.length, 0);
  const forbidden = response();
  await route('post', '/')({ ...request, user: { role: 'EDITOR' } }, forbidden);
  assert.equal(forbidden.statusCode, 403);
});

test('initial access regeneration is an explicit admin action for pending active accounts only', async () => {
  assert.equal(typeof route('post', '/:id/initial-access'), 'function');
  const calls = [];
  const pending = { id: 'new-user', email: 'new@example.test', isActive: true, mustChangePassword: true, passwordChangedAt: null, sessionVersion: 0 };
  db.user = {
    findUnique: async () => ({ id: 'admin', role: 'ADMIN', isActive: true, teamMember: { isActive: true } }),
    updateMany: async args => { calls.push(args); return { count: 1 }; },
  };
  db.teamMember = { findUnique: async () => ({ id: 'member', name: 'Persona', isActive: true, userId: pending.id, user: pending }) };
  db.passwordResetCode = { updateMany: async args => calls.push(args) };
  db.pushSubscription = { updateMany: async args => calls.push(args) };
  db.operationalTraceEvent = { create: async args => calls.push(args) };
  db.$transaction = async callback => callback(db);
  const req = { ...request, params: { id: 'member' }, body: { confirmation: 'GENERAR', expectedSessionVersion: 0 } };
  const res = response();
  await route('post', '/:id/initial-access')(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(res.body.initialAccess?.temporaryPassword);
  assert.equal(calls[0].where.sessionVersion, 0);
  assert.equal(calls[0].where.mustChangePassword, true);
  assert.equal(calls[0].where.passwordChangedAt, null);
  assert.equal(calls[0].data.sessionVersion.increment, 1);
  assert.equal(calls[0].data.onboardingEligible, true);
  assert.equal(calls[0].data.modulePermissions, undefined);
  assert.equal(JSON.stringify(calls).includes(res.body.initialAccess.temporaryPassword), false);
  for (const change of [{ mustChangePassword: false }, { passwordChangedAt: new Date() }, { isActive: false }, { sessionVersion: 1 }]) {
    db.teamMember.findUnique = async () => ({ id: 'member', isActive: true, userId: pending.id, user: { ...pending, ...change } });
    const denied = response();
    await route('post', '/:id/initial-access')(req, denied);
    assert.ok([400, 409].includes(denied.statusCode));
    assert.equal(denied.body.initialAccess, undefined);
  }
  const denied = response();
  await route('post', '/:id/initial-access')({ ...req, user: { role: 'PROJECT_MANAGER' } }, denied);
  assert.equal(denied.statusCode, 403);
});

test('directory projections never request stored passwords or transient credentials', async () => {
  let args;
  db.teamMember = { findMany: async input => { args = input; return []; } };
  await route('get', '/')({ user: { role: 'ADMIN' }, query: {} }, response());
  assert.equal(args.include.user.select.password, undefined);
  assert.equal(args.include.user.select.initialAccess, undefined);
});
