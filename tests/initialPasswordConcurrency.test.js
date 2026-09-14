import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
process.env.DATABASE_URL = 'postgresql://unused:unused@127.0.0.1:1/unused';
let update;
const password = await bcrypt.hash('Original-temporary-test!', 4);
globalThis.prisma = { user: {
  findUnique: async () => ({ id: 'u1', password, sessionVersion: 4 }),
  updateMany: async args => { update = args; return { count: 0 }; },
  update: async () => { throw new Error('Unconditional password replacement is unsafe'); },
} };
const { updateUserPassword } = await import('../src/services/userService.js');
test('a password regenerated during bcrypt verification cannot be overwritten with an older credential', async () => {
  await assert.rejects(updateUserPassword('u1', 'Original-temporary-test!', 'New-personal-password!'), /acceso cambió/i);
  assert.equal(update.where.password, password);
  assert.equal(update.where.sessionVersion, 4);
});
