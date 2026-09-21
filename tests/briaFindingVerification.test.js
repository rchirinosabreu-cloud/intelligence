import test from 'node:test';
import assert from 'node:assert/strict';
import * as verification from '../src/services/briaFindingVerification.js';

const snapshot = { id: 'plan', client: { id: 'client', instructions: 'Tono claro' }, items: [
  { id: 'piece', copyText: 'Texto corregido', captionText: 'Un ejemplo', status: 'BORRADOR' }
] };
const finding = { id: 'finding', itemId: 'piece', field: 'copyText', title: 'Error textual', detail: 'Texto incorrecto', recommendation: 'Corregir' };
const decision = { findingId: finding.id, outcome: 'RESOLVED', reason: 'El texto actual corrige el error.', evidence: [
  { itemId: 'piece', field: 'copyText', quote: 'Texto corregido' }
] };

test('explicit verification parses fenced JSON and validates the current source quotation', () => {
  const result = verification.parseFindingVerifications('```json\n' + JSON.stringify({ verifications: [decision] }) + '\n```', [finding], snapshot);
  assert.equal(result[0].outcome, 'RESOLVED');
  assert.equal(result[0].evidence[0].quote, 'Texto corregido');
});

test('omitted, duplicated, unsupported or fabricated verification never resolves a finding', () => {
  for (const decisions of [[], [decision, decision], [{ ...decision, evidence: [] }],
    [null, 5, {}], [{ ...decision, evidence: [null, {}, false] }],
    [{ ...decision, evidence: [{ itemId: 'other-client-piece', field: 'copyText', quote: 'Texto corregido' }] }],
    [{ ...decision, evidence: [{ itemId: 'piece', field: 'copyText', quote: 'Inventado' }] }],
    [{ ...decision, outcome: 'OTHER' }], [{ ...decision, reason: '' }]
  ]) {
    const result = verification.parseFindingVerifications(JSON.stringify({ verifications: decisions }), [finding], snapshot);
    assert.equal(result[0].outcome, 'INCONCLUSIVE');
  }
});

test('invalid JSON fails for a bounded retry instead of publishing a resolution', () => {
  assert.throws(() => verification.parseFindingVerifications('```json\n{incomplete\n```', [finding], snapshot), SyntaxError);
});

test('verification includes full text and pieces beyond the general review window', async () => {
  const large = { ...snapshot, items: Array.from({ length: 61 }, (_, i) => ({ ...snapshot.items[0], id: `piece-${i}`, copyText: 'a'.repeat(2001) + ' final' })) };
  const target = { ...finding, itemId: 'piece-60' };
  let prompt;
  const results = await verification.verifyContentPlanFindings({ snapshot: large, findings: [target], evidence: [], ai: {
    generate: async args => { prompt = args.prompt; return { text: JSON.stringify({ verifications: [] }) }; }
  } });
  assert.ok(prompt.includes('piece-60'));
  assert.ok(prompt.includes('a'.repeat(2001) + ' final'));
  assert.equal(results[0].outcome, 'INCONCLUSIVE');
});

test('verification reports each model call with its cost when a collector is provided', async () => {
  const findings = Array.from({ length: 5 }, (_, i) => ({ ...finding, id: `finding-${i}` }));
  const calls = [];
  const results = await verification.verifyContentPlanFindings({ snapshot, findings, evidence: [], calls, ai: {
    generate: async () => ({ text: JSON.stringify({ verifications: [] }), model: 'gpt-test', requestId: 'req', raw: { usage: { input_tokens: 40, output_tokens: 8 } } })
  } });
  assert.equal(results.length, 5);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].findingIds, ['finding-0', 'finding-1', 'finding-2', 'finding-3']);
  assert.deepEqual(calls[1].findingIds, ['finding-4']);
  assert.equal(calls[0].model, 'gpt-test');
  assert.equal(calls[0].requestId, 'req');
  assert.deepEqual(calls[0].usage, { inputTokens: 40, outputTokens: 8, totalTokens: 48, cachedTokens: 0, reasoningTokens: 0 });
  assert.ok(Number.isFinite(calls[0].latencyMs));
});

test('oversized context returns an explicit inconclusive decision without silently truncating', async () => {
  const results = await verification.verifyContentPlanFindings({ snapshot: { ...snapshot, items: [{ ...snapshot.items[0], copyText: 'x'.repeat(250000) }] }, findings: [finding], evidence: [], ai: {
    generate: async () => assert.fail('Do not verify truncated evidence')
  } });
  assert.equal(results[0].outcome, 'INCONCLUSIVE');
  assert.match(results[0].reason, /contexto/i);
});
