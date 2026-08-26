import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBancolombiaStatementText,
  parseBancolombiaStatementPages,
  proposeBankMatches,
  detectInternalTransferCandidates,
  detectStatementContinuityGaps,
  filterMatchedOnlyTransactions,
  scoreBankMatch,
  persistBankStatementImport,
  approveBankMatch,
  rebuildBankMatchProposals
} from '../src/services/bankReconciliationService.js';

test('detecta transferencias internas entre cuentas sin confundirlas con ingresos o gastos', () => {
  const candidates = detectInternalTransferCandidates([
    { id: 'empresa-salida', accountId: '3251', postedAt: new Date('2026-06-10T12:00:00Z'), amount: -70000 },
    { id: 'francisco-entrada', accountId: '0345', postedAt: new Date('2026-06-11T12:00:00Z'), amount: 70000 },
    { id: 'tercero', accountId: '0345', postedAt: new Date('2026-06-11T12:00:00Z'), amount: -70000 }
  ]);
  assert.deepEqual(candidates, [{
    debitTransactionId: 'empresa-salida',
    creditTransactionId: 'francisco-entrada',
    amount: 70000,
    dayDifference: 1
  }]);
});

test('en una cuenta personal conserva solamente movimientos con paridad contable', () => {
  const transactions = [{ id: 'personal' }, { id: 'operativo' }, { id: 'otro-personal' }];
  const proposals = [{ bankTransactionId: 'operativo', financialRecordId: 'registro-excel' }];
  assert.deepEqual(filterMatchedOnlyTransactions(transactions, proposals), [{ id: 'operativo' }]);
});

test('califica por evidencia textual y no presenta el mismo valor mensual como certeza', () => {
  assert.equal(scoreBankMatch({ description: 'PAGO DE PROV COLEGIO PABLO H' }, { description: 'Pablo Hoff' }).level, 'HIGH');
  assert.equal(scoreBankMatch({ description: 'TRANSFERENCIA CTA SUC VIRTUAL' }, { description: 'Arriendo oficina' }).level, 'REVIEW');
  assert.match(scoreBankMatch({ description: 'TRANSFERENCIA CTA SUC VIRTUAL' }, { description: 'Arriendo oficina' }).reason, /valor, tipo y mes/i);
});

test('advierte discontinuidades entre el cierre de un extracto y la apertura del siguiente', () => {
  const gaps = detectStatementContinuityGaps([
    { id: 'marzo', accountId: '0345', periodStart: new Date('2026-03-01'), periodEnd: new Date('2026-03-31'), openingBalance: 100, closingBalance: 250 },
    { id: 'junio', accountId: '0345', periodStart: new Date('2026-06-01'), periodEnd: new Date('2026-06-30'), openingBalance: 300, closingBalance: 450 }
  ]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].difference, 50);
  assert.equal(gaps[0].hasMissingPeriods, true);
});

const januaryStatement = `
ESTADO DE CUENTA
DESDE: 2025/12/31 HASTA: 2026/01/31
RESUMEN
SALDO ANTERIOR $ 905,350.97
TOTAL ABONOS $ 1,090,011.94
TOTAL CARGOS $ 901,391.22
SALDO ACTUAL $ 1,093,971.69
FECHA DESCRIPCIÓN SUCURSAL DCTO. VALOR SALDO
1/01 ABONO INTERESES AHORROS .98 905,351.95
1/01 COMPRA EN CANVA -182,900.00 721,720.35
22/01 PAGO DE PROV AISLATERM COLOM 590,000.00 593,960.87
28/01 PAGO DE PROV ALESTRUCTURAR S 500,000.00 1,093,965.73
31/01 ABONO INTERESES AHORROS 5.96 1,093,971.69
FIN ESTADO DE CUENTA`;

test('interpreta un extracto Bancolombia sin convertir el saldo en movimiento', () => {
  const result = parseBancolombiaStatementText(januaryStatement, { year: 2026 });
  assert.equal(result.periodStart, '2025-12-31');
  assert.equal(result.periodEnd, '2026-01-31');
  assert.equal(result.openingBalance, 905350.97);
  assert.equal(result.closingBalance, 1093971.69);
  assert.equal(result.transactions.length, 5);
  assert.deepEqual(result.transactions[1], {
    postedAt: '2026-01-01', description: 'COMPRA EN CANVA', amount: -182900,
    balance: 721720.35, sourceRow: 2
  });
});

test('recorre todas las páginas de un extracto y descarta encabezados repetidos', () => {
  const firstPage = januaryStatement.replace('FIN ESTADO DE CUENTA', '');
  const secondPage = `ESTADO DE CUENTA\nFECHA DESCRIPCIÓN SUCURSAL DCTO. VALOR SALDO\n1/02 PAGO SEGUNDA PAGINA -70,000.00 1,023,971.69\nFIN ESTADO DE CUENTA`;
  const result = parseBancolombiaStatementPages([firstPage, secondPage]);
  assert.equal(result.transactions.length, 6);
  assert.equal(result.transactions.at(-1).description, 'PAGO SEGUNDA PAGINA');
});

test('interpreta páginas bancarias extraídas por columnas', () => {
  const columnPage = `ESTADO DE CUENTA\nDESDE: 2026/03/31 HASTA: 2026/06/30\nRESUMEN\nSALDO ANTERIOR $ 100,000.00\nSALDO ACTUAL $ 130,000.00\nFECHA DESCRIPCIÓN SUCURSAL DCTO. VALOR SALDO\n1/04\n2/04\nABONO CLIENTE\nPAGO PROVEEDOR\nCENTRO COMERCIAL\n50,000.00\n-20,000.00\n150,000.00\n130,000.00\nFIN ESTADO DE CUENTA`;
  const result = parseBancolombiaStatementPages([columnPage]);
  assert.deepEqual(result.transactions, [
    { postedAt: '2026-04-01', description: 'ABONO CLIENTE', amount: 50000, balance: 150000, sourceRow: 1 },
    { postedAt: '2026-04-02', description: 'PAGO PROVEEDOR', amount: -20000, balance: 130000, sourceRow: 2 }
  ]);
});

test('propone coincidencia exacta por valor, tipo y mes sin reutilizar registros', () => {
  const bankTransactions = [
    { id: 'b1', postedAt: new Date('2026-07-09'), amount: -3000000, description: 'TRANSFERENCIA CTA' },
    { id: 'b2', postedAt: new Date('2026-07-09'), amount: -3000000, description: 'TRANSFERENCIA CTA' }
  ];
  const records = [{ id: 'r1', year: 2026, month: 7, amount: 3000000, type: 'EXPENSE', description: 'Nómina' }];
  const proposals = proposeBankMatches(bankTransactions, records);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].bankTransactionId, 'b1');
  assert.equal(proposals[0].financialRecordId, 'r1');
  assert.equal(proposals[0].confidence, 0.55);
});

test('la importación es idempotente por cuenta y huella del archivo', async () => {
  const prismaClient = { bankStatementImport: { findUnique: async () => ({ id: 'existing' }) } };
  await assert.rejects(
    persistBankStatementImport(prismaClient, { accountId: 'a1', sourceHash: 'hash' }, {}, 'u1'),
    (error) => error.code === 'BANK_STATEMENT_DUPLICATE'
  );
});

test('aprobar una coincidencia exacta enlaza la cuenta dentro de una transacción', async () => {
  const calls = [];
  const tx = {
    bankReconciliationMatch: {
      findUnique: async () => ({ id: 'm1', status: 'PROPOSED', amount: 500000, bankTransaction: { id: 'b1', accountId: 'a1', amount: 500000 }, financialRecord: { id: 'r1', amount: 500000 } }),
      update: async ({ data }) => calls.push(['match', data])
    },
    financialRecord: { update: async ({ data }) => calls.push(['record', data]) },
    bankTransaction: { update: async ({ data }) => calls.push(['bank', data]) },
    financialAuditEvent: { create: async ({ data }) => calls.push(['audit', data]) }
  };
  const prismaClient = { $transaction: async (callback) => callback(tx) };
  await approveBankMatch(prismaClient, 'm1', { id: 'u1' });
  assert.deepEqual(calls.find(([name]) => name === 'record')[1], { accountId: 'a1' });
  assert.equal(calls.find(([name]) => name === 'bank')[1].status, 'MATCHED');
  assert.equal(calls.find(([name]) => name === 'match')[1].status, 'APPROVED');
});

test('recalcula propuestas desde movimientos guardados sin aprobarlas', async () => {
  const calls = [];
  const tx = {
    bankTransaction: {
      findMany: async () => [{ id: 'b1', postedAt: new Date('2026-07-09'), amount: 500000, description: 'PAGO CLIENTE', sourceRow: 1 }],
      updateMany: async (input) => calls.push(['transactions', input])
    },
    bankReconciliationMatch: {
      deleteMany: async (input) => calls.push(['delete', input]),
      createMany: async (input) => calls.push(['create', input])
    },
    financialRecord: {
      findMany: async () => [{ id: 'r1', year: 2026, month: 7, amount: 500000, type: 'INCOME', description: 'Pago cliente' }]
    }
  };
  const result = await rebuildBankMatchProposals({ $transaction: async (callback) => callback(tx) }, 2026);
  assert.deepEqual(result, { transactionCount: 1, proposalCount: 1, unmatchedCount: 0 });
  assert.equal(calls.find(([name]) => name === 'create')[1].data[0].financialRecordId, 'r1');
  assert.equal(calls.filter(([name]) => name === 'transactions').at(-1)[1].data.status, 'PROPOSED');
});
