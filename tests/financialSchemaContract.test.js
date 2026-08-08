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

test('payroll supports roles that change owner over time', () => {
    assert.match(schema, /model PayrollPosition \{/);
    assert.match(schema, /model FinancialCollaborator \{/);
    assert.match(schema, /model FinancialImportAlias \{/);
    assert.match(schema, /model PayrollContract \{[\s\S]*collaboratorId\s+String\?/);
    assert.match(schema, /model PayrollContract \{[\s\S]*positionId\s+String\?/);
    assert.match(schema, /model PayrollContract \{[\s\S]*sourceRow\s+Int\?/);
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
