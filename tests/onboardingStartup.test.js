import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
test('startup provisions onboarding additively before serving the API', async () => {
  const { scripts } = JSON.parse(await readFile('package.json', 'utf8'));
  assert.ok(scripts.start.includes('node scripts/ensure-onboarding-schema.js &&'));
  assert.ok(scripts.start.indexOf('ensure-onboarding-schema.js') < scripts.start.indexOf('node server.js'));
});
