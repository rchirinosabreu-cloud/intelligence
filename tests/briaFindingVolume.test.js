import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_FINDINGS_PER_ITEM,
  MAX_FINDINGS_PER_PLAN,
  selectPublishableFindings
} from '../src/services/briaContentPlanReviewService.js';

const finding = (id, severity, itemId = 'piece-1') => ({ ruleKey: id, title: id, severity, itemId, field: 'copyText' });

test('an informative remark never becomes a card the team has to attend', () => {
  const selected = selectPublishableFindings([
    finding('grave', 'CRITICAL'), finding('aviso', 'WARNING'), finding('dato', 'INFO')
  ]);
  assert.deepEqual(selected.map(item => item.ruleKey), ['grave', 'aviso']);
});

test('the most serious findings win when a piece has more than its share', () => {
  const selected = selectPublishableFindings([
    finding('aviso-1', 'WARNING'), finding('grave-1', 'CRITICAL'),
    finding('aviso-2', 'WARNING'), finding('grave-2', 'CRITICAL'), finding('aviso-3', 'WARNING')
  ]);
  assert.equal(selected.length, MAX_FINDINGS_PER_ITEM);
  assert.deepEqual(selected.slice(0, 2).map(item => item.ruleKey), ['grave-1', 'grave-2']);
});

test('each piece keeps its own share, so one noisy piece does not silence the rest', () => {
  const noisy = Array.from({ length: 8 }, (_, i) => finding(`ruidosa-${i}`, 'CRITICAL', 'piece-1'));
  const other = [finding('otra', 'WARNING', 'piece-2')];
  const selected = selectPublishableFindings([...noisy, ...other]);
  assert.equal(selected.filter(item => item.itemId === 'piece-1').length, MAX_FINDINGS_PER_ITEM);
  assert.equal(selected.filter(item => item.itemId === 'piece-2').length, 1);
});

test('a whole plan never publishes more cards than a person can read', () => {
  const many = Array.from({ length: 20 }, (_, i) => finding(`hallazgo-${i}`, 'CRITICAL', `piece-${i}`));
  const selected = selectPublishableFindings(many);
  assert.equal(selected.length, MAX_FINDINGS_PER_PLAN);
  assert.ok(MAX_FINDINGS_PER_PLAN >= 10 && MAX_FINDINGS_PER_PLAN <= 15, 'Rodny pidió entre 10 y 15');
});

test('findings about the plan itself keep their own share and are not crowded out by the pieces', () => {
  const pieces = Array.from({ length: 20 }, (_, i) => finding(`pieza-${i}`, 'CRITICAL', `piece-${i}`));
  const plan = [finding('plan-1', 'CRITICAL', null), finding('plan-2', 'WARNING', null)];
  const selected = selectPublishableFindings([...pieces, ...plan]);
  assert.equal(selected.filter(item => item.itemId === null).length, 2);
});

test('nothing in, nothing out', () => {
  assert.deepEqual(selectPublishableFindings([]), []);
  assert.deepEqual(selectPublishableFindings(undefined), []);
  assert.deepEqual(selectPublishableFindings([finding('solo-dato', 'INFO')]), []);
});
