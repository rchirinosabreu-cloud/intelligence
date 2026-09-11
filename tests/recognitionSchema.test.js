import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
test('recognitions have durable, indexed awards and first-completion evidence plus an additive bootstrap', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  for (const model of ['RecognitionAward', 'RecognitionTaskState', 'RecognitionDebtState', 'RecognitionPlanState']) assert.match(schema, new RegExp(`model ${model} \\{`));
  assert.equal(existsSync('scripts/ensure-recognitions-schema.js'), true);
  assert.match(readFileSync('package.json', 'utf8'), /node scripts\/ensure-recognitions-schema.js/);
});
