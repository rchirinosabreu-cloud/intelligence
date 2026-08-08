import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PASSWORD_RESET_PUBLIC_MESSAGE,
  completePasswordReset,
  normalizeEmail,
  requestPasswordReset
} from '../src/services/passwordResetService.js';

const createDependencies = () => {
  const calls = {
    createdCodes: [],
    emails: [],
    failed: [],
    completed: []
  };

  const user = {
    id: 'user-1',
    email: 'owner@brainstudio.com',
    password: 'old-hash'
  };

  return {
    calls,
    user,
    deps: {
      now: () => new Date('2026-08-08T12:00:00.000Z'),
      generateCode: () => '123456',
      hashValue: async (value) => `hash:${value}`,
      compareValue: async (value, hash) => hash === `hash:${value}`,
      userRepository: {
        findByEmail: async (email) => (email === user.email ? user : null)
      },
      resetCodeRepository: {
        create: async (data) => {
          calls.createdCodes.push(data);
          return { id: 'reset-1', ...data };
        },
        findLatestUsableByEmail: async () => ({
          id: 'reset-1',
          userId: user.id,
          email: user.email,
          codeHash: 'hash:123456',
          attempts: 0,
          expiresAt: new Date('2026-08-08T12:10:00.000Z'),
          usedAt: null
        }),
        markFailedAttempt: async (id) => calls.failed.push(id),
        complete: async (data) => calls.completed.push(data)
      },
      mailer: {
        sendPasswordResetCode: async (message) => calls.emails.push(message)
      }
    }
  };
};

test('normalizeEmail trims and lowercases addresses', () => {
  assert.equal(normalizeEmail('  Owner@BrainStudio.COM  '), 'owner@brainstudio.com');
});

test('requestPasswordReset stores a hashed code and sends the plain code only by email', async () => {
  const { calls, deps } = createDependencies();

  const result = await requestPasswordReset({ email: ' Owner@BrainStudio.COM ' }, deps);

  assert.equal(result.message, PASSWORD_RESET_PUBLIC_MESSAGE);
  assert.equal(calls.createdCodes.length, 1);
  assert.equal(calls.createdCodes[0].email, 'owner@brainstudio.com');
  assert.equal(calls.createdCodes[0].codeHash, 'hash:123456');
  assert.equal(calls.createdCodes[0].code, undefined);
  assert.equal(calls.emails[0].to, 'owner@brainstudio.com');
  assert.equal(calls.emails[0].code, '123456');
});

test('requestPasswordReset does not reveal whether an email exists', async () => {
  const { calls, deps } = createDependencies();

  const result = await requestPasswordReset({ email: 'missing@brainstudio.com' }, deps);

  assert.equal(result.message, PASSWORD_RESET_PUBLIC_MESSAGE);
  assert.equal(calls.createdCodes.length, 0);
  assert.equal(calls.emails.length, 0);
});

test('completePasswordReset updates password, clears forced reset and invalidates sessions', async () => {
  const { calls, deps } = createDependencies();

  const result = await completePasswordReset({
    email: 'owner@brainstudio.com',
    code: '123456',
    newPassword: 'NuevaClave2026'
  }, deps);

  assert.deepEqual(result, { success: true });
  assert.deepEqual(calls.completed[0], {
    userId: 'user-1',
    resetCodeId: 'reset-1',
    passwordHash: 'hash:NuevaClave2026',
    usedAt: new Date('2026-08-08T12:00:00.000Z')
  });
});

test('completePasswordReset rejects invalid codes and records the failed attempt', async () => {
  const { calls, deps } = createDependencies();

  await assert.rejects(
    () => completePasswordReset({
      email: 'owner@brainstudio.com',
      code: '000000',
      newPassword: 'NuevaClave2026'
    }, deps),
    /Codigo invalido o expirado/
  );

  assert.deepEqual(calls.failed, ['reset-1']);
  assert.equal(calls.completed.length, 0);
});
