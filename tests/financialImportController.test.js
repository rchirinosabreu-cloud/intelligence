import test from 'node:test';
import assert from 'node:assert/strict';
import { commitFinancialImport, previewFinancialImport } from '../src/controllers/financialController.js';

test('previewFinancialImport rejects requests without an uploaded file', async () => {
    const req = { file: null, body: { year: 2026 } };
    const res = {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };

    await previewFinancialImport(req, res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.payload.error, 'FINANCIAL_IMPORT_FILE_REQUIRED');
});

test('commitFinancialImport persists an uploaded workbook before returning success', async () => {
    const req = {
        user: { id: 'admin-1' },
        file: {
            buffer: Buffer.from('not-a-real-workbook'),
            originalname: 'FINANZAS.xlsx'
        },
        body: { year: 2026 }
    };
    const res = {
        statusCode: 200,
        payload: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.payload = payload;
            return this;
        }
    };
    const calls = [];
    const dependencies = {
        buildPlan: (buffer, options) => {
            calls.push(['buildPlan', buffer.toString(), options]);
            return { batch: { year: 2026 }, records: [], monthlySummaries: [], receivables: [], payrollPositions: [], payrollContracts: [] };
        },
        persistPlan: async (_prisma, plan) => {
            calls.push(['persistPlan', plan.batch.year]);
            return { importBatchId: 'batch-1', counts: { records: 0, monthlySummaries: 0, receivables: 0, payrollContracts: 0 } };
        },
        prismaClient: { fake: true }
    };

    await commitFinancialImport(req, res, dependencies);

    assert.equal(res.statusCode, 201);
    assert.equal(res.payload.importBatchId, 'batch-1');
    assert.deepEqual(calls[0], ['buildPlan', 'not-a-real-workbook', {
        filename: 'FINANZAS.xlsx',
        year: 2026,
        importedById: 'admin-1'
    }]);
    assert.deepEqual(calls[1], ['persistPlan', 2026]);
});
