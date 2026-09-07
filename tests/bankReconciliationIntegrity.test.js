import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approveBankMatch, parseBancolombiaStatementText, parseBancolombiaStatementPages, proposeBankMatches,
  rebuildBankMatchProposals, persistBankStatementImport
} from '../src/services/bankReconciliationService.js';

const validMatch = () => ({
  id: 'm1', bankTransactionId: 'b1', financialRecordId: 'r1', status: 'PROPOSED', amount: 100,
  updatedAt: new Date('2026-09-01T12:00:00Z'),
  bankTransaction: {
    id: 'b1', status: 'PROPOSED', amount: 100, accountId: 'a1', postedAt: new Date('2026-09-02T12:00:00Z'),
    updatedAt: new Date('2026-09-02T12:00:00Z'), account: { id: 'a1', isActive: true, currency: 'COP' }
  },
  financialRecord: {
    id: 'r1', amount: 100, status: 'POSTED', scenario: 'ACTUAL', origin: 'IMPORT', isProjection: false,
    type: 'INCOME', date: new Date('2026-09-01T12:00:00Z'), year: 2026, month: 9, accountId: null,
    account: null, updatedAt: new Date('2026-09-01T12:00:00Z'), receivablePayment: null, payrollTransaction: null
  }
});

// The database boundary is isolated; no Prisma client or environment file is loaded.
const database = (match, { period = null, conflict = null, lostClaim = null, transactionError = null } = {}) => {
  const writes = [];
  const updates = (name) => async (args) => { writes.push({ name, ...args }); return { count: name === lostClaim ? 0 : 1 }; };
  const tx = {
    bankReconciliationMatch: { findUnique: async () => match, findFirst: async () => conflict,
      updateMany: updates('match'), update: updates('match') },
    financialRecord: { updateMany: updates('record'), update: updates('record') },
    bankTransaction: { updateMany: updates('bank'), update: updates('bank') },
    financialPeriod: { findUnique: async () => period },
    financialAuditEvent: { create: async (args) => { writes.push({ name: 'audit', ...args }); } }
  };
  const client = { $transaction: async (callback, options) => {
    client.options = options;
    if (transactionError) throw transactionError;
    return callback(tx);
  } };
  return { client, writes };
};

for (const [label, mutate, code] of [
  ['un movimiento anulado', (m) => { m.financialRecord.status = 'VOIDED'; }, 'BANK_MATCH_RECORD_INVALID'],
  ['un movimiento en borrador', (m) => { m.financialRecord.status = 'DRAFT'; }, 'BANK_MATCH_RECORD_INVALID'],
  ['una proyección', (m) => { m.financialRecord.scenario = 'FORECAST'; }, 'BANK_MATCH_RECORD_INVALID'],
  ['una proyección heredada', (m) => { m.financialRecord.isProjection = true; }, 'BANK_MATCH_RECORD_INVALID'],
  ['un egreso contra un abono', (m) => { m.financialRecord.type = 'EXPENSE'; }, 'BANK_MATCH_TYPE_MISMATCH'],
  ['otra cuenta ya asignada', (m) => { m.financialRecord.accountId = 'a2'; }, 'BANK_MATCH_ACCOUNT_CONFLICT'],
  ['un pago de cartera sin cuenta coincidente', (m) => { m.financialRecord.receivablePayment = { id: 'p1' }; }, 'BANK_MATCH_LINKED_RECORD'],
  ['una nómina sin cuenta coincidente', (m) => { m.financialRecord.payrollTransaction = { id: 'p1' }; }, 'BANK_MATCH_LINKED_RECORD'],
  ['un asiento de sistema sin cuenta', (m) => { m.financialRecord.origin = 'SYSTEM'; }, 'BANK_MATCH_LINKED_RECORD'],
  ['una cuenta inactiva', (m) => { m.bankTransaction.account.isActive = false; }, 'BANK_MATCH_ACCOUNT_INVALID'],
  ['COP implícito contra USD sin conversión', (m) => { m.bankTransaction.account.currency = 'USD'; }, 'BANK_MATCH_CURRENCY_MISMATCH'],
  ['un movimiento bancario ya conciliado', (m) => { m.bankTransaction.status = 'MATCHED'; }, 'BANK_MATCH_NOT_AVAILABLE'],
  ['una fecha contable modificada de mes', (m) => { m.financialRecord.date = new Date('2026-08-01T12:00:00Z'); m.financialRecord.month = 8; }, 'BANK_MATCH_PERIOD_MISMATCH'],
  ['un importe no numérico', (m) => { m.financialRecord.amount = Number.NaN; }, 'BANK_MATCH_REQUIRES_SPLIT'],
  ['una diferencia de un centavo', (m) => { m.financialRecord.amount = 100.01; }, 'BANK_MATCH_REQUIRES_SPLIT']
]) {
  test(`aprobar rechaza ${label} sin escribir`, async () => {
    const match = validMatch(); mutate(match);
    const { client, writes } = database(match);
    await assert.rejects(approveBankMatch(client, 'm1', { id: 'u1' }), (error) => error.code === code && error.statusCode === 409);
    assert.equal(writes.length, 0);
  });
}

test('aprobar rechaza un periodo cerrado antes de asignar cuenta', async () => {
  const { client, writes } = database(validMatch(), { period: { status: 'CLOSED' } });
  await assert.rejects(approveBankMatch(client, 'm1', {}), (error) => error.code === 'FINANCIAL_PERIOD_CLOSED');
  assert.equal(writes.length, 0);
});

test('aprobar no reutiliza un banco o registro con otra conciliación aprobada', async () => {
  const { client, writes } = database(validMatch(), { conflict: { id: 'approved-other-match' } });
  await assert.rejects(approveBankMatch(client, 'm1', {}), (error) => error.code === 'BANK_MATCH_NOT_AVAILABLE');
  assert.equal(writes.length, 0);
});

for (const lostClaim of ['record', 'bank', 'match']) {
  test(`aprobar aborta si pierde el claim de ${lostClaim} y no registra éxito`, async () => {
    const { client, writes } = database(validMatch(), { lostClaim });
    await assert.rejects(approveBankMatch(client, 'm1', {}), (error) => error.code === 'BANK_MATCH_NOT_AVAILABLE');
    assert.equal(writes.some((write) => write.name === 'audit'), false);
  });
}

test('aprobar ejecuta Serializable, compara estados y devuelve el estado confirmado', async () => {
  const { client, writes } = database(validMatch());
  const result = await approveBankMatch(client, 'm1', { id: 'u1' });
  assert.equal(client.options?.isolationLevel, 'Serializable');
  assert.equal(result.status, 'APPROVED');
  assert.equal(result.approvedById, 'u1');
  assert.equal(writes.find((write) => write.name === 'match').where.status, 'PROPOSED');
  assert.equal(writes.find((write) => write.name === 'bank').where.status, 'PROPOSED');
  assert.equal(writes.find((write) => write.name === 'record').where.status, 'POSTED');
  assert.equal(writes.find((write) => write.name === 'record').where.updatedAt.toISOString(), '2026-09-01T12:00:00.000Z');
});

test('aprobar convierte conflicto de serialización en 409 recuperable', async () => {
  const { client } = database(validMatch(), { transactionError: { code: 'P2034' } });
  await assert.rejects(approveBankMatch(client, 'm1', {}), (error) => error.code === 'BANK_MATCH_NOT_AVAILABLE' && error.statusCode === 409);
});

const statement = `ESTADO DE CUENTA
DESDE: 2026/09/01 HASTA: 2026/09/30
RESUMEN
SALDO ANTERIOR $ 0.00
SALDO ACTUAL $ 100.00
FECHA DESCRIPCIÓN VALOR SALDO
2/09 ABONO CLIENTE 100.00 100.00
FIN ESTADO DE CUENTA`;

for (const [label, text] of [
  ['saldo anterior', statement.replace('SALDO ANTERIOR $ 0.00', '')],
  ['saldo actual', statement.replace('SALDO ACTUAL $ 100.00', '')]
]) {
  test(`parser no inventa cero al faltar ${label}`, () => {
    assert.throws(() => parseBancolombiaStatementText(text), (error) => error.code === 'BANK_STATEMENT_INVALID');
  });
}

test('parser conserva un saldo cero explícito y admite sobregiros negativos', () => {
  assert.equal(parseBancolombiaStatementText(statement).openingBalance, 0);
  const overdraft = statement.replace('SALDO ANTERIOR $ 0.00', 'SALDO ANTERIOR $ -100.00')
    .replace('SALDO ACTUAL $ 100.00', 'SALDO ACTUAL $ 0.00').replace('100.00 100.00', '100.00 0.00');
  assert.equal(parseBancolombiaStatementText(overdraft).openingBalance, -100);
});

test('parser no publica movimientos parciales cuando falta una fila reconocible', () => {
  const truncated = statement.replace('2/09 ABONO CLIENTE 100.00 100.00', '2/09 ABONO CLIENTE');
  assert.throws(() => parseBancolombiaStatementText(truncated), (error) => error.code === 'BANK_STATEMENT_INCOMPLETE');
});

test('parser valida que los movimientos extraídos expliquen el cierre', () => {
  assert.throws(() => parseBancolombiaStatementText(statement.replace('SALDO ACTUAL $ 100.00', 'SALDO ACTUAL $ 200.00')),
    (error) => error.code === 'BANK_STATEMENT_INCOMPLETE');
});

test('parser no omite una página extraída por columnas con valores incompletos', () => {
  const partial = 'FECHA DESCRIPCIÓN VALOR SALDO\n3/09\n4/09\nPAGO A\nPAGO B\n-10.00\n90.00';
  assert.throws(() => parseBancolombiaStatementPages([statement, partial]), (error) => error.code === 'BANK_STATEMENT_INCOMPLETE');
});

test('parser rechaza fechas imposibles y movimientos fuera del periodo', () => {
  for (const date of ['31/09', '2/08']) {
    assert.throws(() => parseBancolombiaStatementText(statement.replace('2/09', date)),
      (error) => error.code === 'BANK_STATEMENT_INVALID');
  }
});

test('no propone una cuenta distinta para un asiento ya asignado', () => {
  const match = validMatch();
  match.financialRecord.accountId = 'a2';
  assert.deepEqual(proposeBankMatches([match.bankTransaction], [match.financialRecord]), []);
});

test('no propone nuevamente un movimiento bancario conciliado al reimportar', () => {
  const match = validMatch();
  match.bankTransaction.status = 'MATCHED';
  assert.deepEqual(proposeBankMatches([match.bankTransaction], [match.financialRecord]), []);
});

test('parser no acepta un extracto sin tabla de movimientos reconocible aunque los saldos sean iguales', () => {
  const incomplete = statement.replace('SALDO ACTUAL $ 100.00', 'SALDO ACTUAL $ 0.00').split('FECHA DESCRIPCIÓN')[0];
  assert.throws(() => parseBancolombiaStatementText(incomplete), (error) => error.code === 'BANK_STATEMENT_INCOMPLETE');
});

test('parser comprueba abonos y cargos del resumen aunque dos filas perdidas se compensen', () => {
  const incomplete = statement.replace('SALDO ACTUAL $ 100.00', 'SALDO ACTUAL $ 0.00')
    .replace('RESUMEN', 'RESUMEN\nTOTAL ABONOS $ 100.00\nTOTAL CARGOS $ 100.00')
    .replace('2/09 ABONO CLIENTE 100.00 100.00', '');
  assert.throws(() => parseBancolombiaStatementText(incomplete), (error) => error.code === 'BANK_STATEMENT_INCOMPLETE');
});

test('parser respeta el año del documento, no el filtro anual elegido, y une filas entre años', () => {
  const crossYear = statement.replace('DESDE: 2026/09/01 HASTA: 2026/09/30', 'DESDE: 2025/12/01 HASTA: 2026/01/31')
    .replace('2/09 ABONO CLIENTE 100.00 100.00', '31/12 ABONO CLIENTE 50.00 50.00\n1/01 ABONO CLIENTE 50.00 100.00');
  assert.deepEqual(parseBancolombiaStatementText(crossYear, { year: 2027 }).transactions.map((row) => row.postedAt), ['2025-12-31', '2026-01-01']);
});

test('parser admite resúmenes legítimos por columnas sin confundir un saldo negativo', () => {
  const columns = statement.replace('SALDO ANTERIOR $ 0.00\nSALDO ACTUAL $ 100.00',
    'SALDO ANTERIOR\nTOTAL ABONOS\nTOTAL CARGOS\nSALDO ACTUAL\n0.00\n100.00\n0.00\n100.00');
  const result = parseBancolombiaStatementText(columns);
  assert.equal(result.openingBalance, 0);
  assert.equal(result.closingBalance, 100);
});

test('un pago ya contabilizado en la misma cuenta se concilia sin duplicarlo', async () => {
  const match = validMatch();
  match.financialRecord.accountId = 'a1'; match.financialRecord.account = match.bankTransaction.account;
  match.financialRecord.origin = 'SYSTEM'; match.financialRecord.receivablePayment = { id: 'p1', accountId: 'a1' };
  const { client, writes } = database(match);
  const result = await approveBankMatch(client, 'm1', { id: 'u1' });
  assert.equal(result.status, 'APPROVED');
  assert.equal(writes.filter((row) => row.name === 'record').length, 1);
});

test('reconstruir propuestas usa Serializable para no deshacer aprobaciones concurrentes', async () => {
  let transactionOptions;
  const result = await rebuildBankMatchProposals({ $transaction: async (callback, options) => {
    transactionOptions = options;
    return callback({ bankTransaction: { findMany: async () => [] } });
  } }, 2026);
  assert.equal(result.proposalCount, 0);
  assert.equal(transactionOptions?.isolationLevel, 'Serializable');
});

test('reconstruir convierte un conflicto concurrente en error recuperable', async () => {
  const client = { $transaction: async () => { throw { code: 'P2034' }; } };
  await assert.rejects(rebuildBankMatchProposals(client, 2026), (error) => error.statusCode === 409);
});

test('importar no sobreescribe una conciliación concurrente y comunica conflicto recuperable', async () => {
  let transactionOptions;
  const client = {
    bankStatementImport: { findUnique: async () => null },
    $transaction: async (_callback, options) => { transactionOptions = options; throw { code: 'P2034' }; }
  };
  await assert.rejects(persistBankStatementImport(client, { accountId: 'a1', sourceHash: 'new-hash' }, {}, 'u1'),
    (error) => error.statusCode === 409);
  assert.equal(transactionOptions?.isolationLevel, 'Serializable');
});

for (const heading of [
  'FECHA DESCRIPCIÓN SUCURSAL DCTO. VALOR SALDO',
  'FECHA DESCRIPCIÓN\nSUCURSAL DCTO. VALOR SALDO',
  'FECHA\nDESCRIPCIÓN\nSUCURSAL\nDCTO.\nVALOR\nSALDO'
]) {
  test(`fecha moderna usa columna VALOR, no SALDO, con encabezado ${JSON.stringify(heading)}`, () => {
    const modern = statement.replace('SALDO ANTERIOR $ 0.00', 'SALDO ANTERIOR $ 100.00')
      .replace('SALDO ACTUAL $ 100.00', 'SALDO ACTUAL $ 150.00')
      .replace('FECHA DESCRIPCIÓN VALOR SALDO', heading)
      .replace('2/09 ABONO CLIENTE 100.00 100.00', '2026/09/02 ABONO CLIENTE 50.00 150.00');
    for (const result of [parseBancolombiaStatementText(modern), parseBancolombiaStatementPages([modern])]) {
      assert.deepEqual(result.transactions[0], { postedAt: '2026-09-02', description: 'ABONO CLIENTE', amount: 50, balance: 150, sourceRow: 1 });
    }
  });
}

test('fecha moderna conserva formato de importe sin saldo cuando el encabezado solo indica VALOR', () => {
  const modern = statement.replace('FECHA DESCRIPCIÓN VALOR SALDO', 'FECHA DESCRIPCIÓN VALOR')
    .replace('2/09 ABONO CLIENTE 100.00 100.00', '2026/09/02 ABONO CLIENTE 100.00');
  const result = parseBancolombiaStatementText(modern);
  assert.equal(result.transactions[0].amount, 100);
  assert.equal(result.transactions[0].balance, null);
});

test('fecha moderna no acepta una columna SALDO truncada aunque cierre parezca coincidir', () => {
  const truncated = statement.replace('2/09 ABONO CLIENTE 100.00 100.00', '2026/09/02 ABONO CLIENTE 100.00');
  assert.throws(() => parseBancolombiaStatementText(truncated), (error) => error.code === 'BANK_STATEMENT_INCOMPLETE');
});

test('páginas por columnas admiten fechas modernas con encabezado multilínea', () => {
  const columnPage = statement.replace('FECHA DESCRIPCIÓN VALOR SALDO', 'FECHA DESCRIPCIÓN\nVALOR\nSALDO')
    .replace('2/09 ABONO CLIENTE 100.00 100.00', '2026/09/02\n2026/09/03\nABONO A\nABONO B\n60.00\n40.00\n60.00\n100.00');
  const result = parseBancolombiaStatementPages([columnPage]);
  assert.deepEqual(result.transactions.map(({ postedAt, amount, balance }) => ({ postedAt, amount, balance })), [
    { postedAt: '2026-09-02', amount: 60, balance: 60 }, { postedAt: '2026-09-03', amount: 40, balance: 100 }
  ]);
});

test('filas modernas indentadas por la extracción PDF conservan cada movimiento', () => {
  const indented = statement.replace('2/09 ABONO CLIENTE 100.00 100.00',
    '  2026/09/02 ABONO A 60.00 60.00\n\t2026/09/03 ABONO B 40.00 100.00');
  assert.deepEqual(parseBancolombiaStatementText(indented).transactions.map((row) => row.amount), [60, 40]);
});
