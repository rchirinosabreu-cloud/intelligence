import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { briaTestDatabaseUrl } from './briaTestDatabase.js';

// Only the dedicated local test cluster. Never read .env or DATABASE_URL.
export async function financialCorrectionDatabase({ additionalTables = [] } = {}) {
  const testUrl = briaTestDatabaseUrl();
  if (!testUrl) throw new Error('TEST_DATABASE_URL is required for the isolated financial preview.');
  const schema = `financial_correction_${randomUUID().replaceAll('-', '')}`;
  const connection = new pg.Client({ connectionString: testUrl });
  await connection.connect();
  await connection.query(`CREATE SCHEMA "${schema}"`);
  await connection.query(`SET search_path TO "${schema}"`);
  const url = new URL(testUrl); url.searchParams.set('schema', schema);
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  const close = async () => { await db.$disconnect(); await connection.query(`DROP SCHEMA "${schema}" CASCADE`); await connection.end(); };
  try {
    const ddl = execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: url.href }, stdio: ['ignore', 'pipe', 'pipe'] });
    const tables = new Set(['TeamMember', 'Client', 'User', 'FinancialAccount', 'FinancialRecord', 'FinancialRecordAllocation', 'FinancialRecordDocument', 'FinancialAuditEvent', 'FinancialPeriod', 'PayrollContract', 'FinancialCollaborator', 'PayrollTransaction', 'PayrollPayment', 'ThirdParty', 'AccountsPayable', 'PayablePayment', 'BankReconciliationMatch']);
    for (const name of additionalTables) tables.add(name);
    for (const [sql] of ddl.matchAll(/CREATE TYPE "[^"]+" AS ENUM \([\s\S]*?\);/g)) await connection.query(sql);
    for (const [sql, name] of ddl.matchAll(/CREATE TABLE "([^"]+)" \([\s\S]*?\n\);/g)) if (tables.has(name)) await connection.query(sql);
    for (const [sql, name] of ddl.matchAll(/CREATE (?:UNIQUE )?INDEX "[^"]+" ON "([^"]+)"[^;]+;/g)) if (tables.has(name)) await connection.query(sql);
    for (const [sql, name, target] of ddl.matchAll(/ALTER TABLE "([^"]+)" ADD CONSTRAINT [^;]+?REFERENCES "([^"]+)"[^;]+;/g)) if (tables.has(name) && tables.has(target)) await connection.query(sql);
    const actor = await db.user.create({ data: { id: 'demo-admin', name: 'Administración · muestra local', email: 'financial@example.invalid', password: 'local-fixture-only', role: 'ADMIN' } });
    const first = await db.financialAccount.create({ data: { id: 'demo-account', name: 'Banco de muestra', type: 'BANK', openingBalance: 3000000, openingBalanceDate: new Date('2026-01-01T12:00:00Z') } });
    const second = await db.financialAccount.create({ data: { id: 'demo-account-2', name: 'Otra cuenta de muestra', type: 'BANK', openingBalance: 2000000, openingBalanceDate: new Date('2026-01-01T12:00:00Z') } });
    const createPayment = async (kind, suffix = randomUUID()) => {
      const record = await db.financialRecord.create({ data: { id: `record-${suffix}`, amount: 600000, type: 'EXPENSE', category: kind === 'payroll' ? 'NOMINA' : 'OPERATIVO', origin: 'SYSTEM', accountId: first.id, date: new Date('2026-09-15T12:00:00Z'), year: 2026, month: 9, description: kind === 'payroll' ? 'Pago de nómina · persona ficticia' : 'Pago a proveedor · muestra local' } });
      let payment, parent;
      if (kind === 'payroll') {
        const collaborator = await db.financialCollaborator.create({ data: { displayName: 'Persona ficticia', normalizedName: `ficticia-${suffix}` } });
        const contract = await db.payrollContract.create({ data: { collaboratorId: collaborator.id, baseSalary: 1000000, socialSecurity: 0, startDate: new Date('2026-01-01') } });
        parent = await db.payrollTransaction.create({ data: { contractId: contract.id, year: 2026, month: 9, baseSalary: 1000000, netAmount: 1000000, grossAmount: 1000000, status: 'APPROVED' } });
        payment = await db.payrollPayment.create({ data: { id: `payment-${suffix}`, transactionId: parent.id, accountId: first.id, financialRecordId: record.id, amount: 600000, paidAt: record.date, reference: 'PAGO-MUESTRA' } });
      } else {
        const thirdParty = await db.thirdParty.create({ data: { name: 'Proveedor ficticio', kind: 'PROVEEDOR' } });
        parent = await db.accountsPayable.create({ data: { thirdPartyId: thirdParty.id, concept: 'Servicio de muestra', category: 'OPERATIVO', amount: 1000000, receivedAt: new Date('2026-09-01'), year: 2026, month: 9, status: 'PARCIAL' } });
        payment = await db.payablePayment.create({ data: { id: `payment-${suffix}`, payableId: parent.id, accountId: first.id, financialRecordId: record.id, amount: 600000, paidAt: record.date, reference: 'PAGO-MUESTRA' } });
      }
      const document = await db.financialRecordDocument.create({ data: { recordId: record.id, storageKey: `local/${suffix}`, name: 'Comprobante de muestra.pdf', mimeType: 'application/pdf', size: 100, sha256: 'fixture' } });
      return { payment, parent, record, document };
    };
    return { db, actor, first, second, createPayment, close, databaseUrl: url.href };
  } catch (error) { await close(); throw error; }
}
