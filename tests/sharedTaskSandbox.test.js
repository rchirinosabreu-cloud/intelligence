import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const file = path.resolve('tests/support/sharedTaskSandbox.js');
const sandbox = existsSync(file) ? await import(pathToFileURL(file)) : {};

test('el entorno de compartidas solo acepta su clúster local propio', () => {
  assert.equal(typeof sandbox.assertSharedTaskDatabase, 'function', 'la preparación necesita una guarda de destino');
  assert.equal(sandbox.assertSharedTaskDatabase('postgresql://shared_tasks_test@127.0.0.1:55451/shared_tasks_demo'), true);
  for (const value of [undefined, 'postgresql://shared_tasks_test@remote.invalid:55451/shared_tasks_demo',
    'postgresql://shared_tasks_test@127.0.0.1:5432/shared_tasks_demo',
    'postgresql://recognition_test@127.0.0.1:55448/recognition_test',
    'postgresql://shared_tasks_test@127.0.0.1:55451/production',
    'postgresql://shared_tasks_test@127.0.0.1:55451/shared_tasks_demo?schema=public']) {
    assert.throws(() => sandbox.assertSharedTaskDatabase(value), /aislado/);
  }
});

test('el proceso de prueba no hereda secretos ni habilita integraciones externas', () => {
  assert.equal(typeof sandbox.sharedTaskEnvironment, 'function');
  const env = sandbox.sharedTaskEnvironment({ PATH: 'local-bin', SystemRoot: 'C:\\Windows', DATABASE_URL: 'private', OPENAI_API_KEY: 'private', SMTP_PASS: 'private', AWS_SECRET_ACCESS_KEY: 'private', EXTRA_SECRET: 'private' });
  assert.equal(env.PATH, 'local-bin');
  assert.equal(env.DATABASE_URL, sandbox.SHARED_TEST_DATABASE_URL);
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.MFA_REQUIRED_ROLES, '');
  assert.equal(env.OPENAI_API_KEY, '');
  assert.equal(env.SMTP_PASS, '');
  assert.equal(env.AWS_SECRET_ACCESS_KEY, '');
  assert.equal(env.EXTRA_SECRET, undefined);
  assert.ok(env.DOTENV_CONFIG_PATH.endsWith('environment-disabled'));
  assert.ok(env.JWT_SECRET.length >= 32);
});
