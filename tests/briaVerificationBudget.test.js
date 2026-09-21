import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERIFICATION_BUDGET,
  selectFindingsToVerify
} from '../src/services/briaContentPlanReviewService.js';

const finding = (id, status, lastVerifiedAt = null, lastActionAt = null) => ({ id, status, lastVerifiedAt, lastActionAt });

test('what a person marked as corrected is always verified first', () => {
  const open = Array.from({ length: 40 }, (_, i) => finding(`open-${i}`, 'OPEN'));
  const claimed = [finding('claimed-1', 'VERIFYING', null, new Date('2026-09-21T10:00:00Z')), finding('claimed-2', 'VERIFYING', null, new Date('2026-09-21T09:00:00Z'))];
  const selected = selectFindingsToVerify([...open, ...claimed]);

  assert.equal(selected.length, VERIFICATION_BUDGET);
  assert.deepEqual(selected.slice(0, 2).map(item => item.id), ['claimed-2', 'claimed-1'], 'the oldest claim goes first');
  assert.ok(selected.slice(2).every(item => item.status === 'OPEN'));
});

test('a plan with many open findings verifies a bounded slice instead of all of them', () => {
  const findings = Array.from({ length: 157 }, (_, i) => finding(`open-${i}`, 'OPEN'));
  const selected = selectFindingsToVerify(findings);
  assert.equal(selected.length, VERIFICATION_BUDGET);
  assert.ok(VERIFICATION_BUDGET < 20, 'the budget must keep a run inside its deadline');
});

test('open findings rotate: the ones checked longest ago go first, never-checked before all', () => {
  const findings = [
    finding('checked-recently', 'OPEN', new Date('2026-09-21T10:00:00Z')),
    finding('checked-long-ago', 'OPEN', new Date('2026-09-01T10:00:00Z')),
    finding('never-checked', 'OPEN', null),
    finding('checked-middle', 'OPEN', new Date('2026-09-10T10:00:00Z'))
  ];
  assert.deepEqual(selectFindingsToVerify(findings, { budget: 3 }).map(item => item.id),
    ['never-checked', 'checked-long-ago', 'checked-middle']);
});

test('nothing to verify stays nothing, and a small plan keeps verifying everything', () => {
  assert.deepEqual(selectFindingsToVerify([]), []);
  assert.deepEqual(selectFindingsToVerify(undefined), []);
  const few = [finding('a', 'OPEN'), finding('b', 'VERIFYING')];
  assert.equal(selectFindingsToVerify(few).length, 2);
});

test('claims beyond the budget are not dropped: they wait for the next run instead of stretching this one', () => {
  const claimed = Array.from({ length: VERIFICATION_BUDGET + 5 }, (_, i) => finding(`claimed-${i}`, 'VERIFYING', null, new Date(Date.UTC(2026, 8, 1, i))));
  const selected = selectFindingsToVerify(claimed);
  assert.equal(selected.length, VERIFICATION_BUDGET);
  assert.equal(selected[0].id, 'claimed-0', 'the oldest claim is served first');
});
