import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { correctReceivableDocumentHandler } from '../src/controllers/financialRecordController.js';
import { FinancialDomainError } from '../src/services/financialRecordService.js';

// Corregir una cuenta de cobro emitida (Rodny, 30 de septiembre de 2026): mismo permiso
// de escritura con que se emite, y la respuesta dice que el PDF ya se rehízo.

const response = () => {
    const res = { statusCode: 200, body: null };
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.body = body; return res; };
    return res;
};

test('la ruta de corrección existe con el permiso de escritura financiera', () => {
    const routes = fs.readFileSync(new URL('../src/routes/api/financials.js', import.meta.url), 'utf8');
    assert.match(routes, /router\.put\('\/receivables\/:id\/document', requireFinancialWrite, correctReceivableDocumentHandler\)/);
});

test('corregir responde con el mismo número y avisa que el PDF se rehízo', async () => {
    const res = response();
    let received;
    await correctReceivableDocumentHandler(
        { params: { id: 'debt-1' }, body: { concept: 'X' }, user: { id: 'user-1' } },
        res,
        {
            prismaClient: {},
            correctDocument: async (_prisma, id, body, user) => {
                received = { id, body, user };
                return { receivable: { id }, document: { formattedNumber: 'No. 0393' } };
            }
        }
    );
    assert.equal(res.statusCode, 200);
    assert.deepEqual(received, { id: 'debt-1', body: { concept: 'X' }, user: { id: 'user-1' } });
    assert.match(res.body.message, /No\. 0393/);
    assert.match(res.body.message, /PDF/);
});

test('un error de dominio llega con su mensaje y su estado', async () => {
    const res = response();
    await correctReceivableDocumentHandler(
        { params: { id: 'debt-1' }, body: {}, user: { id: 'user-1' } },
        res,
        {
            prismaClient: {},
            correctDocument: async () => { throw new FinancialDomainError('RECEIVABLE_NOT_ISSUED', 'Usa «Emitir cuenta de cobro».', 409); }
        }
    );
    assert.equal(res.statusCode, 409);
    assert.match(JSON.stringify(res.body), /Emitir cuenta de cobro/);
});
