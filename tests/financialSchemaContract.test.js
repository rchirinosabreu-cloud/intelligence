import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const schema = fs.readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

test('financial schema keeps import batches for traceable Excel migrations', () => {
    assert.match(schema, /model FinancialImportBatch \{/);
    assert.match(schema, /sourceFilename\s+String/);
    assert.match(schema, /sourceSheets\s+Json/);
    assert.match(schema, /summary\s+Json\?/);
});

test('financial records are enriched as editable monthly ledger entries', () => {
    assert.match(schema, /model FinancialRecord \{[\s\S]*year\s+Int\?/);
    assert.match(schema, /model FinancialRecord \{[\s\S]*month\s+Int\?/);
    assert.match(schema, /model FinancialRecord \{[\s\S]*section\s+FinancialSection\?/);
    assert.match(schema, /model FinancialRecord \{[\s\S]*sourceSheet\s+String\?/);
    assert.match(schema, /model FinancialRecord \{[\s\S]*sourceRow\s+Int\?/);
    assert.match(schema, /model FinancialRecord \{[\s\S]*importBatchId\s+String\?/);
});

test('financial records are the canonical auditable ledger', () => {
    assert.match(schema, /enum FinancialAccessRole \{[\s\S]*NONE[\s\S]*VIEWER[\s\S]*EDITOR[\s\S]*APPROVER[\s\S]*ADMIN/);
    assert.match(schema, /model User \{[\s\S]*financialRole\s+FinancialAccessRole/);
    assert.match(schema, /enum FinancialScenario \{[\s\S]*ACTUAL[\s\S]*FORECAST[\s\S]*BUDGET/);
    assert.match(schema, /enum FinancialRecordStatus \{[\s\S]*DRAFT[\s\S]*POSTED[\s\S]*VOIDED/);
    assert.match(schema, /enum FinancialRecordOrigin \{[\s\S]*MANUAL[\s\S]*IMPORT[\s\S]*SYSTEM/);
    assert.match(schema, /model FinancialRecord \{[\s\S]*scenario\s+FinancialScenario/);
    assert.match(schema, /model FinancialRecord \{[\s\S]*status\s+FinancialRecordStatus/);
    assert.match(schema, /model FinancialRecord \{[\s\S]*origin\s+FinancialRecordOrigin/);
    assert.match(schema, /model FinancialRecord \{[\s\S]*createdById\s+String\?/);
    assert.match(schema, /model FinancialRecord \{[\s\S]*voidReason\s+String\?/);
    assert.match(schema, /model FinancialAuditEvent \{/);
    assert.match(schema, /model FinancialPeriod \{/);
    assert.match(schema, /model FinancialAccount \{/);
    assert.match(schema, /model FinancialAccount \{[\s\S]*openingBalanceDate\s+DateTime/);
});

test('receivables support partial payments with an audit trail', () => {
    assert.match(schema, /model ReceivablePayment \{/);
    assert.match(schema, /model AccountsReceivable \{[\s\S]*payments\s+ReceivablePayment\[\]/);
    assert.match(schema, /model ReceivablePayment \{[\s\S]*receivableId\s+String/);
    assert.match(schema, /model ReceivablePayment \{[\s\S]*amount\s+Decimal/);
    assert.match(schema, /model ReceivablePayment \{[\s\S]*paidAt\s+DateTime/);
    assert.match(schema, /model ReceivablePayment \{[\s\S]*financialRecordId\s+String\?\s+@unique/);
});

test('receivables distinguish imported, manual and system origins', () => {
    assert.match(schema, /model AccountsReceivable[\s\S]*origin\s+FinancialRecordOrigin\s+@default\(MANUAL\)/);
    assert.match(schema, /model AccountsReceivable[\s\S]*@@index\(\[origin, year, month\]\)/);
});

test('payroll supports roles that change owner over time', () => {
    assert.match(schema, /model PayrollPosition \{/);
    assert.match(schema, /model FinancialCollaborator \{/);
    assert.match(schema, /model FinancialImportAlias \{/);
    assert.match(schema, /model PayrollContract \{[\s\S]*collaboratorId\s+String\?/);
    assert.match(schema, /model PayrollContract \{[\s\S]*positionId\s+String\?/);
    assert.match(schema, /model PayrollContract \{[\s\S]*sourceRow\s+Int\?/);
    assert.match(schema, /enum PayrollTransactionStatus \{[\s\S]*DRAFT[\s\S]*APPROVED[\s\S]*PAID/);
    assert.match(schema, /model PayrollTransaction \{[\s\S]*userId\s+String\?/);
    assert.match(schema, /model PayrollTransaction \{[\s\S]*baseSalary\s+Decimal/);
    assert.match(schema, /model PayrollTransaction \{[\s\S]*netAmount\s+Decimal/);
    assert.match(schema, /model PayrollTransaction \{[\s\S]*status\s+PayrollTransactionStatus/);
    assert.match(schema, /@@unique\(\[contractId, month, year\]\)/);
});

test('receivables preserve monthly source and operational comments', () => {
    assert.match(schema, /model AccountsReceivable \{[\s\S]*year\s+Int\?/);
    assert.match(schema, /model AccountsReceivable \{[\s\S]*month\s+Int\?/);
    assert.match(schema, /model AccountsReceivable \{[\s\S]*sourceLabel\s+String\?/);
    assert.match(schema, /model AccountsReceivable \{[\s\S]*comments\s+String\?/);
});

test('monthly financial summaries persist Excel totals separately from calculated rows', () => {
    assert.match(schema, /model FinancialMonthlySummary \{/);
    assert.match(schema, /explicitIncome\s+Decimal\s+@default\(0\)/);
    assert.match(schema, /calculatedIncome\s+Decimal\s+@default\(0\)/);
    assert.match(schema, /netResult\s+Decimal\s+@default\(0\)/);
    assert.match(schema, /@@unique\(\[year, month, importBatchId\]\)/);
});
