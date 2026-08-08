import test from 'node:test';
import assert from 'node:assert/strict';
import { previewFinancialImport } from '../src/controllers/financialController.js';

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
