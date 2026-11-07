import test from 'node:test';
import assert from 'node:assert/strict';
import { accountBalanceBreakdown, listAccountStatement } from '../src/services/financialAccountStatementService.js';

test('explica el saldo desde apertura en centavos sin sumar movimientos anteriores, anulados o proyecciones', () => {
  const account = { openingBalance: '100.10', openingBalanceDate: '2026-10-01T12:00:00Z' };
  const row = { amount: '20.20', date: '2026-10-01T00:00:00Z', type: 'INCOME', status: 'POSTED', scenario: 'ACTUAL', isProjection: false };
  const result = accountBalanceBreakdown(account, [row, { ...row, type: 'EXPENSE', amount: '10.05' }, { ...row, date: '2026-09-30' }, { ...row, status: 'VOIDED' }, { ...row, scenario: 'FORECAST' }, { ...row, isProjection: true }]);
  assert.deepEqual(result, { openingBalance: 100.1, openingDay: '2026-10-01', income: 20.2, expense: 10.05, balance: 110.25, count: 2 });
});
test('un importe ilegible no se presenta como saldo cero', () => {
  assert.throws(() => accountBalanceBreakdown({ openingBalance: 'desconocido', openingBalanceDate: '2026-10-01' }, []));
});

test('conserva un saldo inicial negativo válido y su recuperación', () => {
  const result = accountBalanceBreakdown({ openingBalance: '-100.10', openingBalanceDate: '2026-01-01' }, [{ amount: '20.20', date: '2026-01-02', type: 'INCOME', status: 'POSTED', scenario: 'ACTUAL' }]);
  assert.equal(result.openingBalance, -100.1); assert.equal(result.balance, -79.9);
});
test('el extracto conserva el alcance de apertura y pagina sin confundir una página con el saldo completo', async () => {
  const account = { id: 'a', name: 'Banco', openingBalance: 100, openingBalanceDate: new Date('2026-01-01') };
  const rows = Array.from({ length: 53 }, (_, i) => ({ id: String(i), accountId: 'a', amount: 1, date: new Date('2026-10-01'), type: 'INCOME', status: 'POSTED', scenario: 'ACTUAL', isProjection: false }));
  const db = { financialAccount: { findUnique: async () => account }, financialRecord: { findMany: async () => rows } };
  db.$transaction = work => work(db);
  const result = await listAccountStatement(db, 'a', { page: '2' });
  assert.equal(result.summary.balance, 153); assert.equal(result.summary.count, 53);
  assert.equal(result.items.length, 3); assert.equal(result.total, 53); assert.equal(result.page, 2);
  assert.equal(result.items.at(-1).runningBalance, 153);
});
