import test from 'node:test';
import assert from 'node:assert/strict';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';

test('Bria database tests never use production configuration', () => {
  assert.equal(briaTestDatabaseUrl({ DATABASE_URL: 'postgresql://production.invalid/app', BRIA_PROJECT_ENV: 'production.env' }), null);
  const isolated = 'postgresql://recognition_test@127.0.0.1:55448/recognition_test';
  assert.equal(briaTestDatabaseUrl({ TEST_DATABASE_URL: isolated }), isolated);
  assert.throws(() => briaTestDatabaseUrl({ TEST_DATABASE_URL: 'postgresql://production.invalid/app' }), /isolated/);
});
