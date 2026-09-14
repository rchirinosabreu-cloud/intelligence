import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://invalid:invalid@127.0.0.1:1/never_connect';
globalThis.prisma = {};
const { getOnboarding, acknowledgeOnboarding } = await import('../src/services/onboardingService.js');
function setup(user = {}) {
  const rows = new Map();
  const person = { id: 'u1', name: 'Persona', role: 'VIEWER', isActive: true, mustChangePassword: false, modulePermissions: { cotizaciones: true }, teamMember: { isActive: true }, ...user };
  const db = { $queryRaw: async () => [], user: { findUnique: async () => person }, userGuideProgress: {
    findMany: async ({ where }) => [...rows.values()].filter(row => row.userId === where.userId),
    findUnique: async ({ where }) => rows.get(JSON.stringify(where.userId_guideId_version)),
    upsert: async ({ where, create, update }) => { const key = JSON.stringify(where.userId_guideId_version); const result = rows.has(key) ? { ...rows.get(key), ...update } : create; rows.set(key, result); return result; },
  } };
  db.$transaction = async callback => callback(db);
  return { db, rows, person };
}
test('onboarding reflects current module grants and starts unacknowledged', async () => {
  const { db } = setup(); const result = await getOnboarding('u1', db);
  assert.equal(result?.user?.id, 'u1');
  assert.equal(result.user.modulePermissions.cotizaciones, true);
  assert.deepEqual(result.progress, {});
});
test('completion persists by user and version and cannot be downgraded by skipping', async () => {
  const { db } = setup();
  await acknowledgeOnboarding('u1', { guideId: 'cotizaciones', version: 1, status: 'COMPLETED' }, db);
  await acknowledgeOnboarding('u1', { guideId: 'cotizaciones', version: 1, status: 'SKIPPED' }, db);
  assert.equal((await getOnboarding('u1', db)).progress.cotizaciones, 'COMPLETED');
  assert.deepEqual((await getOnboarding('other', db)).progress, {});
});
test('denied modules, unknown guides and malformed versions cannot be acknowledged', async () => {
  const { db } = setup({ modulePermissions: {} });
  for (const input of [{ guideId: 'cotizaciones', version: 1, status: 'SKIPPED' }, { guideId: 'unknown', version: 1, status: 'COMPLETED' }, { guideId: 'welcome', version: 2, status: 'COMPLETED' }, { guideId: 'welcome', version: 1, status: 'invented' }]) {
    await assert.rejects(() => acknowledgeOnboarding('u1', input, db));
  }
});
test('membership and mandatory password changes gate onboarding', async () => {
  for (const value of [{ isActive: false }, { teamMember: null }, { teamMember: { isActive: false } }, { mustChangePassword: true }]) {
    const { db } = setup(value);
    await assert.rejects(() => getOnboarding('u1', db));
    await assert.rejects(() => acknowledgeOnboarding('u1', { guideId: 'welcome', version: 1, status: 'COMPLETED' }, db));
  }
});
