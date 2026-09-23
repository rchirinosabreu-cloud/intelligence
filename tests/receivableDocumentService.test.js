import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateReceivableDocument,
    nextReceivableNumber,
    formatReceivableNumber,
    issueReceivableDocument,
    RECEIVABLE_ITEM_MAX
} from '../src/services/receivableDocumentService.js';

// Contrato de la cuenta de cobro (Elisa, reunión del 21 de septiembre de 2026).
// «Le pongo el fee mensual más lo que hayan pedido adicional», y el consecutivo es
// suyo: viene de fuera de la plataforma y hoy va en 392.

const items = [
    { description: 'Fee mensual septiembre', amount: 2500000 },
    { description: 'Merchandising: gorras', amount: 350000 }
];

test('las líneas suman exactamente el total', () => {
    const result = calculateReceivableDocument(items);
    assert.equal(result.total, 2850000);
    assert.equal(result.lines.length, 2);
    assert.deepEqual(result.lines.map((line) => line.sortOrder), [0, 1]);
});

// El IVA solo apareció en la reunión describiendo la pantalla de Siigo, colgando del
// caso «factura electrónica». Aquí no se calcula, y el servicio no lo acepta.
test('no hay IVA: un documento no lleva impuesto calculado', () => {
    const result = calculateReceivableDocument(items);
    assert.equal(result.taxAmount, undefined);
    assert.equal(result.subtotal, undefined);
    assert.equal(Object.keys(result).sort().join(','), 'lines,total,totalCents');
});

test('los céntimos se suman sin arrastrar error de coma flotante', () => {
    const result = calculateReceivableDocument([
        { description: 'A', amount: 0.1 },
        { description: 'B', amount: 0.2 }
    ]);
    assert.equal(result.totalCents, 30);
    assert.equal(Number(result.total), 0.3);
});

test('una cuenta de cobro sin conceptos no se puede emitir', () => {
    assert.throws(() => calculateReceivableDocument([]), (error) => error.code === 'RECEIVABLE_ITEMS_REQUIRED');
    assert.throws(() => calculateReceivableDocument(null), (error) => error.code === 'RECEIVABLE_ITEMS_REQUIRED');
});

test('un concepto sin descripción o con valor inválido se rechaza, diciendo cuál', () => {
    assert.throws(
        () => calculateReceivableDocument([{ description: '   ', amount: 100 }]),
        (error) => error.code === 'RECEIVABLE_ITEM_DESCRIPTION_REQUIRED' && /concepto 1/.test(error.message)
    );
    assert.throws(
        () => calculateReceivableDocument([{ description: 'Fee', amount: 0 }]),
        (error) => error.code === 'RECEIVABLE_ITEM_AMOUNT_INVALID' && /«Fee»/.test(error.message)
    );
    assert.throws(
        () => calculateReceivableDocument([{ description: 'Fee', amount: 1.005 }]),
        (error) => error.code === 'RECEIVABLE_ITEM_AMOUNT_INVALID'
    );
});

test('hay un tope de conceptos por documento', () => {
    const many = Array.from({ length: RECEIVABLE_ITEM_MAX + 1 }, (_, i) => ({ description: `Concepto ${i}`, amount: 1000 }));
    assert.throws(() => calculateReceivableDocument(many), (error) => error.code === 'RECEIVABLE_ITEMS_TOO_MANY');
});

// El consecutivo es de Elisa: si arrancara en 1 le rompería la numeración del mes.
// Su última cuenta de cobro es la 392, así que la primera de la plataforma es la 393.
test('la primera cuenta de cobro de la plataforma sigue a la última de Elisa', () => {
    assert.equal(nextReceivableNumber(null, 393), 393);
    assert.equal(nextReceivableNumber(undefined, '393'), 393);
});

test('el número sigue al más alto ya emitido y nunca retrocede', () => {
    assert.equal(nextReceivableNumber(393, 393), 394);
    // Un piso más bajo que lo ya emitido no puede reutilizar números.
    assert.equal(nextReceivableNumber(400, 393), 401);
});

test('sin piso configurado arranca en 1, no en cero ni en NaN', () => {
    assert.equal(nextReceivableNumber(null, undefined), 1);
    assert.equal(nextReceivableNumber(null, 'no-es-numero'), 1);
    assert.equal(nextReceivableNumber(null, 0), 1);
    assert.equal(nextReceivableNumber(null, -5), 1);
});

test('el número se presenta como lo escribe el documento real', () => {
    assert.equal(formatReceivableNumber(145), 'No. 0145');
    assert.equal(formatReceivableNumber(7), 'No. 0007');
    assert.equal(formatReceivableNumber(12345), 'No. 12345');
    assert.equal(formatReceivableNumber(null), null);
});

const buildTx = ({ receivable, highest = null }) => {
    const calls = [];
    return {
        calls,
        tx: {
            accountsReceivable: {
                findUnique: async () => receivable,
                aggregate: async () => ({ _max: { number: highest } }),
                update: async (args) => { calls.push(['receivable.update', args]); return { ...receivable, ...args.data, items: [] }; }
            },
            receivableItem: {
                deleteMany: async (args) => { calls.push(['items.deleteMany', args]); return { count: 0 }; },
                createMany: async (args) => { calls.push(['items.createMany', args]); return { count: args.data.length }; }
            },
            financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) },
            financialAuditEvent: { create: async (args) => { calls.push(['audit.create', args]); return { id: 'audit-1' }; } }
        }
    };
};

// El cliente llega con su identidad de tercero completa: sin ella no se emite.
const identifiedClient = { id: 'client-1', name: 'Titanes', legalName: 'CORPORACIÓN DEPORTIVA LOS TITANES', documentType: 'NIT', documentNumber: '901378858' };
const openReceivable = (overrides = {}) => ({
    id: 'debt-1', clientId: 'client-1', amount: 100, status: 'DEBE', number: null, client: identifiedClient,
    period: new Date('2026-09-01T12:00:00Z'), year: 2026, month: 9, payments: [], ...overrides
});

test('emitir pone número, congela los conceptos y ajusta el importe de la obligación', async () => {
    const { calls, tx } = buildTx({ receivable: openReceivable(), highest: 144 });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    const result = await issueReceivableDocument(prismaClient, 'debt-1', {
        concept: 'Servicios de septiembre', items, issuedAt: '2026-09-30'
    }, { id: 'user-1' }, { startNumber: 100 });

    assert.equal(result.document.number, 145);
    assert.equal(result.document.formattedNumber, 'No. 0145');
    const update = calls.find(([name]) => name === 'receivable.update')[1].data;
    // Lo que se le manda al cliente y lo que queda en cartera son la misma cifra.
    assert.equal(update.amount, 2850000);
    assert.equal(update.number, 145);
    assert.equal(update.issuedById, 'user-1');
    const created = calls.find(([name]) => name === 'items.createMany')[1].data;
    assert.deepEqual(created.map((line) => line.description), ['Fee mensual septiembre', 'Merchandising: gorras']);
    assert.ok(calls.some(([name]) => name === 'items.deleteMany'), 'no puede quedar una línea de un intento anterior');
    assert.equal(calls.find(([name]) => name === 'audit.create')[1].data.action, 'POST');
});

test('se puede forzar un número concreto cuando Elisa necesita cuadrar el suyo', async () => {
    const { calls, tx } = buildTx({ receivable: openReceivable(), highest: 144 });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await issueReceivableDocument(prismaClient, 'debt-1', {
        concept: 'Servicios', items, issuedAt: '2026-09-30', number: 200
    }, { id: 'user-1' });

    assert.equal(calls.find(([name]) => name === 'receivable.update')[1].data.number, 200);
});

test('un número forzado que no es un entero positivo se rechaza', async () => {
    await assert.rejects(
        issueReceivableDocument({}, 'debt-1', { concept: 'X', items, issuedAt: '2026-09-30', number: 0 }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_NUMBER_INVALID'
    );
});

test('una cuenta ya emitida no se reedita: se manda otra aparte', async () => {
    const { tx } = buildTx({ receivable: openReceivable({ number: 144 }) });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-1', { concept: 'X', items, issuedAt: '2026-09-30' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_ALREADY_ISSUED' && /No\. 0144/.test(error.message) && /aparte/.test(error.message)
    );
});

test('no se cambia el importe de una obligación que ya recibió plata distinta', async () => {
    const { tx } = buildTx({ receivable: openReceivable({ payments: [{ amount: 500000 }] }) });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-1', { concept: 'X', items, issuedAt: '2026-09-30' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_ALREADY_PAID_PARTIALLY' && error.statusCode === 409
    );
});

test('si los abonos ya cubren el total exacto, la obligación queda pagada', async () => {
    const { calls, tx } = buildTx({ receivable: openReceivable({ payments: [{ amount: 2850000 }] }) });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await issueReceivableDocument(prismaClient, 'debt-1', {
        concept: 'Servicios', items, issuedAt: '2026-09-30'
    }, { id: 'user-1' });

    assert.equal(calls.find(([name]) => name === 'receivable.update')[1].data.status, 'PAGADO');
});

test('un periodo cerrado impide emitir', async () => {
    const { tx } = buildTx({ receivable: openReceivable() });
    tx.financialPeriod.findUnique = async () => ({ status: 'CLOSED' });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-1', { concept: 'X', items, issuedAt: '2026-09-30' }, { id: 'user-1' }),
        (error) => error.code === 'FINANCIAL_PERIOD_CLOSED'
    );
});

test('un número que otro proceso tomó primero se explica, no se duplica', async () => {
    const prismaClient = { $transaction: async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); } };
    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-1', { concept: 'X', items, issuedAt: '2026-09-30' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_NUMBER_TAKEN' && error.statusCode === 409
    );
});

test('la obligación tiene que existir', async () => {
    const { tx } = buildTx({ receivable: null });
    const prismaClient = { $transaction: async (callback) => callback(tx) };
    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-404', { concept: 'X', items, issuedAt: '2026-09-30' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_NOT_FOUND' && error.statusCode === 404
    );
});
