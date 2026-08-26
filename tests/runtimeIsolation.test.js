import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { getSafeTestDatabaseUrl } from './helpers/testDatabase.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('integration tests refuse to use an implicit or production-like database', () => {
  assert.equal(getSafeTestDatabaseUrl({ DATABASE_URL: 'postgresql://prod.example/brainstudio' }), null);
  assert.equal(getSafeTestDatabaseUrl({ TEST_DATABASE_URL: 'postgresql://localhost/brainstudio' }), 'postgresql://localhost/brainstudio');
  assert.equal(getSafeTestDatabaseUrl({ TEST_DATABASE_URL: 'postgresql://db.example/brainstudio_test' }), 'postgresql://db.example/brainstudio_test');
  assert.equal(getSafeTestDatabaseUrl({ TEST_DATABASE_URL: 'postgresql://db.example/brainstudio' }), null);
});

test('database integration suites opt in through TEST_DATABASE_URL', async () => {
  const kanban = await read('tests/kanbanLifecycle.test.js');
  const streak = await read('tests/qualityStreak.test.js');

  assert.match(kanban, /getSafeTestDatabaseUrl/);
  assert.match(streak, /getSafeTestDatabaseUrl/);
  assert.doesNotMatch(kanban, /if \(!process\.env\.DATABASE_URL\)/);
  assert.doesNotMatch(streak, /if \(!process\.env\.DATABASE_URL\)/);
});

test('storage modules never mutate bucket CORS configuration at import time', async () => {
  const gcs = await read('src/services/storageService.js');
  const s3 = await read('src/services/s3Service.js');
  const pkg = JSON.parse(await read('package.json'));

  assert.doesNotMatch(gcs, /Auto-CORS initialization|setTimeout\(\(\) => \{\s*configureBucketCors/);
  assert.doesNotMatch(s3, /Auto-CORS initialization|if \(process\.env\.AWS_ACCESS_KEY_ID[\s\S]{0,180}configureS3Cors/);
  assert.equal(pkg.scripts['storage:configure-cors'], 'node scripts/configure-storage-cors.js');
});

test('CI provisions the schema and runs database suites serially', async () => {
  const workflow = await read('.github/workflows/ci.yml');
  const pkg = JSON.parse(await read('package.json'));
  assert.match(workflow, /image: pgvector\/pgvector:pg15/);
  assert.match(workflow, /CREATE EXTENSION IF NOT EXISTS vector/);
  assert.match(workflow, /prisma db push/);
  assert.match(workflow, /TEST_DATABASE_URL:/);
  assert.match(workflow, /run: npm run test:ci/);
  assert.equal(pkg.scripts['test:ci'], 'node --test --test-concurrency=1 "tests/**/*.test.js"');
});
