import test from 'node:test';
import assert from 'node:assert/strict';
import { offsetHistoryEntry } from '../src/lib/financialOffsetHistory.js';

test('el registro antiguo conserva solo el saldo conocido de Cartera; no inventa el de Por pagar', () => {
  const event = { before: { outstanding: 960000 }, after: { operation: 'SETTLEMENT', reason: 'Acuerdo', outstanding: 0 } };
  const copy = structuredClone(event);
  assert.deepEqual(offsetHistoryEntry(event), { title: 'Compensación registrada en Cartera', actor: null, reason: 'Acuerdo', balances: [{ label: 'Nos deben', before: 960000, after: 0 }] });
  assert.deepEqual(event, copy);
});
test('completar el cruce y revertirlo conservan los dos saldos y distinguen las decisiones', () => {
  const event = { before: { receivable: { outstanding: 0 }, payable: { outstanding: 1000000 } }, after: { operation: 'LEGACY_OFFSET_LINKED', actorName: 'Elisa', reason: 'Contrapartida', receivable: { outstanding: 0 }, payable: { outstanding: 40000 } } };
  const entry = offsetHistoryEntry(event);
  assert.equal(entry.title, 'Contrapartida vinculada en Por pagar');
  assert.deepEqual(entry.balances, [{ label: 'Nos deben', before: 0, after: 0 }, { label: 'Debemos', before: 1000000, after: 40000 }]);
  assert.equal(entry.actor, 'Elisa');
  assert.equal(offsetHistoryEntry({ after: { operation: 'OFFSET' } }).title, 'Registro del cruce');
  assert.equal(offsetHistoryEntry({ after: { operation: 'OFFSET_REVERSE' } }).title, 'Reversión del cruce');
});
test('historial incompleto o desconocido se muestra sin romper la pantalla ni convertir ausencias en cero', () => {
  assert.deepEqual(offsetHistoryEntry({}).balances, []);
  assert.equal(offsetHistoryEntry({ after: { operation: 'NEW_EVENT' } }).title, 'Actualización del cruce');
  assert.deepEqual(offsetHistoryEntry({ before: null, after: { operation: 'SETTLEMENT', outstanding: 0 } }).balances, [{ label: 'Nos deben', before: null, after: 0 }]);
  assert.deepEqual(offsetHistoryEntry({ after: { operation: 'SETTLEMENT', outstanding: 'invalid' } }).balances, []);
});
