import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import * as evaluator from '../scripts/eval-report-captures.mjs';
import { evaluateObservationReferences, validateBatchFiles } from '../scripts/eval-report-captures.mjs';

test('evaluation checks meaning as well as value and does not pass a paid value under organic', () => {
  const result = evaluateObservationReferences([
    { key: 'views', value: 7, platform: 'INSTAGRAM', scope: 'ORGANIC' },
    { key: 'linkClicks', value: 0, platform: 'INSTAGRAM', changePct: -100 }
  ], [
    { key: 'views', value: 7, platform: 'INSTAGRAM', scope: 'PAID' },
    { key: 'linkClicks', value: 0, platform: 'INSTAGRAM', changePct: -100 }
  ]);
  assert.equal(result[0].status, 'MISMATCH');
  assert.equal(result[0].valueMatch, true);
  assert.equal(result[0].semanticMatch, false);
  assert.equal(result[1].status, 'MATCH');
});

test('evaluation distinguishes a missing observation from one with wrong context', () => {
  const result = evaluateObservationReferences([{ key: 'views', value: 250, platform: 'FACEBOOK' }], [
    { key: 'views', value: 250, platform: 'INSTAGRAM' },
    { key: 'spend', value: 900, scope: 'PAID' }
  ]);
  assert.equal(result[0].status, 'MISMATCH');
  assert.equal(result[1].status, 'MISSING');
});

test('batch refuses more than fourteen calls and duplicate or non-image inputs before extraction', () => {
  const file = { id: 'one', client: 'Synthetic client', localPath: 'image.png', mimeType: 'image/png' };
  assert.equal(validateBatchFiles({ files: [file] }).length, 1);
  assert.throws(() => validateBatchFiles({ files: Array.from({ length: 15 }, (_, i) => ({ ...file, id: String(i) })) }), /14/);
  assert.throws(() => validateBatchFiles({ files: [file, file] }), /duplicad/i);
  assert.throws(() => validateBatchFiles({ files: [{ ...file, mimeType: 'application/pdf' }] }), /imagen/i);
});

test('row checkpoints cannot borrow matching numbers from a different ad or format', () => {
  const result = evaluateObservationReferences([
    { key: 'results', value: null, entityName: 'Otro anuncio' },
    { key: 'results', value: 3, entityName: 'Sample ad' },
    { key: 'interactions', value: 18, label: 'Historias' }
  ], [
    { key: 'results', value: null, entityName: 'Sample ad' },
    { key: 'interactions', value: 18, label: 'Reels' }
  ]);
  assert.equal(result[0].status, 'MISMATCH');
  assert.equal(result[1].status, 'MISMATCH');
});

test('dry run loads only explicitly supplied local references without API settings or network', async (t) => {
  const reads = [];
  const logs = [];
  t.mock.method(fs, 'readFile', async file => {
    reads.push(file);
    if (file === 'manifest.json') return JSON.stringify([{ id: 'sample', client: 'Synthetic client', mimeType: 'image/png', localPath: 'sample.png' }]);
    if (file === 'references.json') return JSON.stringify({ sample: [{ key: 'views', value: 250, platform: 'INSTAGRAM' }] });
    throw new Error('Unexpected file or API setting access');
  });
  t.mock.method(fs, 'stat', async () => ({ isFile: () => true }));
  t.mock.method(console, 'log', value => logs.push(JSON.parse(value)));
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Dry run must not access the network'); });
  await evaluator.main(['--manifest', 'manifest.json', '--out', 'unused', '--references', 'references.json', '--dry-run']);
  assert.deepEqual(reads, ['manifest.json', 'references.json']);
  assert.equal(logs[0].referenceSources, 1);
  assert.equal(logs[0].checkpoints, 1);
  assert.equal(logs[0].dryRun, true);
});

test('omitting references means no built-in client checkpoints', async (t) => {
  const logs = [];
  t.mock.method(fs, 'readFile', async file => {
    assert.equal(file, 'manifest.json');
    return JSON.stringify([{ id: 'sample', mimeType: 'image/png', localPath: 'sample.png' }]);
  });
  t.mock.method(fs, 'stat', async () => ({ isFile: () => true }));
  t.mock.method(console, 'log', value => logs.push(JSON.parse(value)));
  await evaluator.main(['--manifest', 'manifest.json', '--out', 'unused', '--dry-run']);
  assert.equal(Object.hasOwn(evaluator, 'DEFAULT_REFERENCES'), false);
  assert.equal(logs[0].checkpoints, 0);
  assert.deepEqual(logs[0].reportPeriod, { start: null, end: null });
});

test('reference maps reject malformed rows before any extraction', () => {
  assert.deepEqual(evaluator.validateReferenceMap({ sample: [{ key: 'views', value: 250 }] }), { sample: [{ key: 'views', value: 250 }] });
  for (const input of [null, [], { sample: {} }, { sample: [null] }, { sample: [{ value: 250 }] }]) {
    assert.throws(() => evaluator.validateReferenceMap(input), /referenc/i);
  }
});
