import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is required. Never load .env.');
const target = new URL(url);
if (target.hostname !== '127.0.0.1' || target.port !== '55448' || target.pathname !== '/recognition_test' || target.username !== 'recognition_test') throw new Error('Refusing a non-isolated database.');
process.env.DATABASE_URL = url;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'onboarding-isolated-not-production-secret';
const db = new PrismaClient({ datasources: { db: { url } } });
globalThis.prisma = db;
const sql = new pg.Client({ connectionString: url });
const { ensureOnboardingSchema } = await import('../scripts/ensure-onboarding-schema.js');
const { prepareInitialAccess } = await import('../src/services/initialAccessService.js');
const { getOnboarding, acknowledgeOnboarding } = await import('../src/services/onboardingService.js');
const { updateUserPassword } = await import('../src/services/userService.js');
const { default: router } = await import('../src/routes/api/team.js');
const ids = [];
let admin, pending, personal;
test.before(async () => {
  await sql.connect();
  const ddl = await readFile('output/recognition-test-schema.sql', 'utf8');
  for (const [statement, name] of ddl.matchAll(/CREATE TABLE "([^"]+)" \([\s\S]*?\n\);/g)) {
    if (['PasswordResetCode'].includes(name) && !(await sql.query('SELECT to_regclass($1) AS r', [`"${name}"`])).rows[0].r) await sql.query(statement);
  }
  await ensureOnboardingSchema(sql); await ensureOnboardingSchema(sql);
  async function person(role, mustChangePassword) {
    const user = await db.user.create({ data: { name: 'Acceso aislado', email: `${randomUUID()}@example.invalid`, role, password: await bcrypt.hash('Old-test-credential!', 4), mustChangePassword,
      modulePermissions: { cotizaciones: true }, teamMember: { create: { name: 'Persona aislada', role: 'Prueba' } } }, include: { teamMember: true } });
    ids.push(user.id); return user;
  }
  admin = await person('ADMIN', false); pending = await person('EDITOR', true); personal = await person('EDITOR', false);
});
test.after(async () => {
  // Only exact identities created by this test, in the guarded local database.
  await db.operationalTraceEvent.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { subjectUserId: { in: ids } }] } });
  await db.userGuideProgress.deleteMany({ where: { userId: { in: ids } } });
  await db.passwordResetCode.deleteMany({ where: { userId: { in: ids } } });
  await db.pushSubscription.deleteMany({ where: { userId: { in: ids } } });
  await db.teamMember.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect(); await sql.end();
});
const request = version => ({ requester: { userId: admin.id, role: 'ADMIN' }, memberId: pending.teamMember.id, confirmation: 'GENERAR', expectedSessionVersion: version });

test('real creation returns a unique temporary credential and preserves selected permissions', async () => {
  const route = router.stack.find(layer => layer.route?.path === '/' && layer.route.methods.post).route.stack[0].handle;
  const response = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await route({ user: { userId: admin.id, role: 'ADMIN' }, body: { name: 'Creación aislada', role: 'Prueba', email: `${randomUUID()}@example.invalid`, modulePermissions: { cotizaciones: true } } }, response);
  assert.equal(response.statusCode, 201); ids.push(response.body.userId);
  const stored = await db.user.findUnique({ where: { id: response.body.userId } });
  assert.equal(await bcrypt.compare(response.body.initialAccess.temporaryPassword, stored.password), true);
  assert.equal(stored.mustChangePassword, true); assert.equal(stored.modulePermissions.cotizaciones, true);
  assert.equal(stored.onboardingEligible, true);
  await assert.rejects(getOnboarding(stored.id, db), /Primero debes cambiar/);
  await updateUserPassword(stored.id, response.body.initialAccess.temporaryPassword, 'New-user-personal-password!');
  assert.equal((await getOnboarding(stored.id, db)).autoOnboarding, true);
  await acknowledgeOnboarding(stored.id, { guideId: 'welcome', version: 1, status: 'COMPLETED' }, db);
  assert.equal((await getOnboarding(stored.id, db)).progress.welcome, 'COMPLETED');
  assert.equal(response.body.password, undefined);
});
test('regeneration revokes prior credentials, reset codes and devices; personal password change closes the admin path', async () => {
  await db.passwordResetCode.create({ data: { userId: pending.id, email: pending.email, codeHash: 'test', expiresAt: new Date(Date.now() + 60000) } });
  await db.pushSubscription.create({ data: { userId: pending.id, endpoint: `https://example.invalid/${randomUUID()}`, p256dh: 'test', auth: 'test' } });
  const access = await prepareInitialAccess(request(0), db);
  const stored = await db.user.findUnique({ where: { id: pending.id } });
  assert.equal(await bcrypt.compare('Old-test-credential!', stored.password), false);
  assert.equal(await bcrypt.compare(access.initialAccess.temporaryPassword, stored.password), true);
  assert.equal(stored.sessionVersion, 1); assert.equal(stored.mustChangePassword, true);
  assert.equal(stored.onboardingEligible, true);
  assert.deepEqual(stored.modulePermissions, pending.modulePermissions);
  assert.equal(await db.passwordResetCode.count({ where: { userId: pending.id, usedAt: null } }), 0);
  assert.equal(await db.pushSubscription.count({ where: { userId: pending.id, isActive: true } }), 0);
  await assert.rejects(prepareInitialAccess(request(0), db), /acceso inicial ya cambió/);
  await updateUserPassword(pending.id, access.initialAccess.temporaryPassword, 'Private-only-user-password!');
  const changed = await db.user.findUnique({ where: { id: pending.id } });
  assert.equal(changed.mustChangePassword, false); assert.ok(changed.passwordChangedAt); assert.equal(changed.sessionVersion, 2);
  assert.equal((await getOnboarding(pending.id, db)).autoOnboarding, true);
  await assert.rejects(prepareInitialAccess(request(2), db), /acceso inicial ya cambió/);
  const traces = await db.operationalTraceEvent.findMany({ where: { subjectUserId: pending.id } });
  assert.equal(traces.length, 1); assert.ok(!JSON.stringify(traces).includes(access.initialAccess.temporaryPassword));
});
test('failed persistence rolls credential replacement back, including session and audit effects', async () => {
  await db.user.update({ where: { id: pending.id }, data: { mustChangePassword: true, passwordChangedAt: null } });
  const before = await db.user.findUnique({ where: { id: pending.id } });
  const failing = { $transaction: (run, options) => db.$transaction(async tx => {
    const result = await run(tx); assert.ok(result.initialAccess); throw new Error('Injected commit failure');
  }, options) };
  await assert.rejects(prepareInitialAccess(request(2), failing), /Injected commit failure/);
  const after = await db.user.findUnique({ where: { id: pending.id } });
  assert.equal(after.password, before.password); assert.equal(after.sessionVersion, before.sessionVersion);
  assert.equal(await db.operationalTraceEvent.count({ where: { subjectUserId: pending.id } }), 1);
});
test('two concurrent initial-access requests can return only one usable credential', async () => {
  const attempts = await Promise.allSettled([prepareInitialAccess(request(2), db), prepareInitialAccess(request(2), db)]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  const key = attempts.find(result => result.status === 'fulfilled').value.initialAccess.temporaryPassword;
  const stored = await db.user.findUnique({ where: { id: pending.id } });
  assert.equal(await bcrypt.compare(key, stored.password), true); assert.equal(stored.sessionVersion, 3);
});
test('guide acknowledgements persist per user/version, serialize safely and respect permission revocation', async () => {
  assert.equal((await getOnboarding(personal.id, db)).autoOnboarding, false);
  await Promise.all(['COMPLETED', 'SKIPPED', 'COMPLETED'].map(status => acknowledgeOnboarding(personal.id, { guideId: 'cotizaciones', version: 1, status }, db)));
  assert.equal((await getOnboarding(personal.id, db)).progress.cotizaciones, 'COMPLETED');
  assert.equal(await db.userGuideProgress.count({ where: { userId: personal.id } }), 1);
  assert.equal((await getOnboarding(admin.id, db)).autoOnboarding, false);
  await db.user.update({ where: { id: personal.id }, data: { modulePermissions: {} } });
  await assert.rejects(acknowledgeOnboarding(personal.id, { guideId: 'cotizaciones', version: 1, status: 'COMPLETED' }, db), /No tienes acceso/);
  await assert.rejects(getOnboarding(pending.id, db), /Primero debes cambiar/);
});
test('schema reruns and password changes do not enroll existing users or fabricate guide history', async () => {
  await ensureOnboardingSchema(sql);
  assert.equal((await db.user.findUnique({ where: { id: admin.id } })).onboardingEligible, false);
  await updateUserPassword(admin.id, 'Old-test-credential!', 'Existing-admin-changed-password!');
  const onboarding = await getOnboarding(admin.id, db);
  assert.equal(onboarding.autoOnboarding, false);
  assert.deepEqual(onboarding.progress, { welcome: 'NOT_APPLICABLE', cotizaciones: 'NOT_APPLICABLE' });
  assert.equal(await db.userGuideProgress.count({ where: { userId: admin.id } }), 0);
  assert.equal((await db.user.findUnique({ where: { id: pending.id } })).onboardingEligible, true);
});
