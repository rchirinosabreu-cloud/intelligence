import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateReceivableDocument,
    nextReceivableNumber,
    formatReceivableNumber,
    issueReceivableDocument,
    correctReceivableDocument,
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
            client: { update: async (args) => { calls.push(['client.update', args]); return args.data; } },
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
        concept: 'Servicios de septiembre', items, servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30'
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
        concept: 'Servicios', items, servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30', number: 200
    }, { id: 'user-1' });

    assert.equal(calls.find(([name]) => name === 'receivable.update')[1].data.number, 200);
});

// «Periodo: 20 de agosto al 19 de septiembre». Es un rango del servicio escrito a
// mano: no coincide con el mes contable y no siempre empieza el día 1.
test('el periodo del servicio es obligatorio y se dice con un ejemplo', async () => {
    await assert.rejects(
        issueReceivableDocument({}, 'debt-1', { concept: 'X', items, issuedAt: '2026-09-30' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_SERVICE_PERIOD_REQUIRED' && /20 de agosto al 19 de septiembre/.test(error.message)
    );
});

test('el periodo del servicio se guarda con el documento', async () => {
    const { calls, tx } = buildTx({ receivable: openReceivable(), highest: 392 });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await issueReceivableDocument(prismaClient, 'debt-1', {
        concept: 'Servicios', items, servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30'
    }, { id: 'user-1' });

    const update = calls.find(([name]) => name === 'receivable.update')[1].data;
    assert.equal(update.servicePeriod, '20 de agosto al 19 de septiembre');
    // La última de Elisa es la 392, así que la primera de la plataforma es la 393.
    assert.equal(update.number, 393);
});

test('un número forzado que no es un entero positivo se rechaza', async () => {
    await assert.rejects(
        issueReceivableDocument({}, 'debt-1', { concept: 'X', items, servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30', number: 0 }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_NUMBER_INVALID'
    );
});

test('emitir otra vez una cuenta ya emitida no le da otro número: se corrige o se manda otra aparte', async () => {
    const { tx } = buildTx({ receivable: openReceivable({ number: 144 }) });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-1', { concept: 'X', items, servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_ALREADY_ISSUED' && /No\. 0144/.test(error.message) && /Corregir/.test(error.message) && /aparte/.test(error.message)
    );
});

// Corregir una cuenta ya emitida (Rodny, 30 de septiembre de 2026: «no permite editar
// las ctas de cobro una vez emitidas»; tecleó 120.000 donde eran 1.200.000). Conserva
// su número, deja la versión anterior en la auditoría y en el bucket, y rehace el PDF.
const issuedReceivable = (overrides = {}) => openReceivable({
    number: 393,
    issuedAt: new Date('2026-09-25T12:00:00Z'),
    concept: 'Servicios de septiembre',
    servicePeriod: '20 de agosto al 19 de septiembre',
    amount: 120000,
    pdfStorageKey: 'receivables/debt-1/cuenta-de-cobro-0393.pdf',
    items: [{ id: 'item-1', description: 'Fee mensual', amount: 120000, sortOrder: 0 }],
    ...overrides
});
const correctionInput = (extra = {}) => ({
    concept: 'Servicios de septiembre',
    servicePeriod: '20 de agosto al 19 de septiembre',
    items: [{ description: 'Fee mensual', amount: 1200000 }],
    ...extra
});
const pdfRecorder = () => {
    const stored = [];
    return {
        stored,
        storePdf: async (_prisma, _storage, receivable, _env, _prebuilt, key) => { stored.push({ receivable, key }); return key; }
    };
};

test('corregir una cuenta emitida conserva su número y ajusta conceptos y valor', async () => {
    const { calls, tx } = buildTx({ receivable: issuedReceivable() });
    const prismaClient = { $transaction: async (callback) => callback(tx) };
    const { stored, storePdf } = pdfRecorder();

    const result = await correctReceivableDocument(prismaClient, 'debt-1', correctionInput({ reason: 'Se digitó 120.000, eran 1.200.000.' }), { id: 'user-1' }, { storePdf, now: new Date('2026-09-30T15:04:05Z') });

    const update = calls.find(([name]) => name === 'receivable.update')[1].data;
    assert.equal(update.amount, 1200000);
    assert.equal(update.number, undefined, 'la corrección nunca le cambia el número');
    // Si el PDF nuevo no se pudiera guardar, «Ver PDF» lo regenera en vez de servir el viejo.
    assert.equal(update.pdfStorageKey, null);
    assert.equal(result.document.formattedNumber, 'No. 0393');
    assert.deepEqual(calls.find(([name]) => name === 'items.createMany')[1].data.map((line) => line.amount), [1200000]);
    assert.ok(calls.some(([name]) => name === 'items.deleteMany'));

    const audit = calls.find(([name]) => name === 'audit.create')[1].data;
    assert.equal(audit.action, 'UPDATE');
    assert.equal(audit.entityType, 'AccountsReceivable');
    assert.equal(audit.actorId, 'user-1');
    // Lo que se había mandado queda en la auditoría: conceptos, valor y dónde estaba su PDF.
    assert.equal(audit.before.amount, 120000);
    assert.equal(audit.before.items[0].amount, 120000);
    assert.equal(audit.before.pdfStorageKey, 'receivables/debt-1/cuenta-de-cobro-0393.pdf');
    assert.equal(audit.after.reason, 'Se digitó 120.000, eran 1.200.000.');

    // El PDF se rehace en una clave nueva: el anterior se queda en el bucket.
    assert.equal(stored.length, 1);
    assert.notEqual(stored[0].key, 'receivables/debt-1/cuenta-de-cobro-0393.pdf');
    assert.match(stored[0].key, /^receivables\/debt-1\/cuenta-de-cobro-0393-corregida-20260930150405\.pdf$/);
});

test('corregir sin cambiar nada rehace el PDF con la plantilla vigente', async () => {
    const { tx } = buildTx({ receivable: issuedReceivable({ amount: 4000000, items: [{ description: 'Fee mensual', amount: 4000000 }] }) });
    const prismaClient = { $transaction: async (callback) => callback(tx) };
    const { stored, storePdf } = pdfRecorder();

    await correctReceivableDocument(prismaClient, 'debt-1', correctionInput({ items: [{ description: 'Fee mensual', amount: 4000000 }] }), { id: 'user-1' }, { storePdf });

    assert.equal(stored.length, 1, 'así una cuenta vieja sale con «CUATRO MILLONES DE PESOS»');
});

test('sin fecha nueva, la corrección conserva la fecha de emisión', async () => {
    const { calls, tx } = buildTx({ receivable: issuedReceivable() });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await correctReceivableDocument(prismaClient, 'debt-1', correctionInput(), { id: 'user-1' }, pdfRecorder());

    const update = calls.find(([name]) => name === 'receivable.update')[1].data;
    assert.equal(update.issuedAt, undefined);
});

test('una obligación sin emitir no se corrige: se emite', async () => {
    const { tx } = buildTx({ receivable: openReceivable() });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        correctReceivableDocument(prismaClient, 'debt-1', correctionInput(), { id: 'user-1' }, pdfRecorder()),
        (error) => error.code === 'RECEIVABLE_NOT_ISSUED' && error.statusCode === 409 && /Emitir/.test(error.message)
    );
});

test('la corrección no puede dejar el total por debajo de lo ya abonado', async () => {
    const { tx } = buildTx({ receivable: issuedReceivable({ payments: [{ amount: 500000 }] }) });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        correctReceivableDocument(prismaClient, 'debt-1', correctionInput({ items: [{ description: 'Fee', amount: 400000 }] }), { id: 'user-1' }, pdfRecorder()),
        (error) => error.code === 'RECEIVABLE_AMOUNT_BELOW_PAYMENTS' && error.statusCode === 409
    );
});

test('el estado sigue a los abonos vigentes después de corregir', async () => {
    const paid = buildTx({ receivable: issuedReceivable({ status: 'DEBE', payments: [{ amount: 1200000 }] }) });
    await correctReceivableDocument({ $transaction: async (callback) => callback(paid.tx) }, 'debt-1', correctionInput(), { id: 'user-1' }, pdfRecorder());
    assert.equal(paid.calls.find(([name]) => name === 'receivable.update')[1].data.status, 'PAGADO');

    // Figuraba pagada con 120.000 y ahora vale 1.200.000: vuelve a deber la diferencia.
    const reopened = buildTx({ receivable: issuedReceivable({ status: 'PAGADO', payments: [{ amount: 120000 }] }) });
    await correctReceivableDocument({ $transaction: async (callback) => callback(reopened.tx) }, 'debt-1', correctionInput(), { id: 'user-1' }, pdfRecorder());
    assert.equal(reopened.calls.find(([name]) => name === 'receivable.update')[1].data.status, 'DEBE');

    const promised = buildTx({ receivable: issuedReceivable({ status: 'PROMESADO' }) });
    await correctReceivableDocument({ $transaction: async (callback) => callback(promised.tx) }, 'debt-1', correctionInput(), { id: 'user-1' }, pdfRecorder());
    assert.equal(promised.calls.find(([name]) => name === 'receivable.update')[1].data.status, 'PROMESADO');
});

test('un periodo cerrado impide corregir', async () => {
    const { tx } = buildTx({ receivable: issuedReceivable() });
    tx.financialPeriod.findUnique = async () => ({ status: 'CLOSED' });

    await assert.rejects(
        correctReceivableDocument({ $transaction: async (callback) => callback(tx) }, 'debt-1', correctionInput(), { id: 'user-1' }, pdfRecorder()),
        (error) => error.code === 'FINANCIAL_PERIOD_CLOSED'
    );
});

test('el motivo de la corrección es opcional pero tiene tope', async () => {
    await assert.rejects(
        correctReceivableDocument({}, 'debt-1', correctionInput({ reason: 'x'.repeat(301) }), { id: 'user-1' }, pdfRecorder()),
        (error) => error.code === 'RECEIVABLE_CORRECTION_REASON_TOO_LONG'
    );
});

test('no se cambia el importe de una obligación que ya recibió plata distinta', async () => {
    const { tx } = buildTx({ receivable: openReceivable({ payments: [{ amount: 500000 }] }) });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-1', { concept: 'X', items, servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_ALREADY_PAID_PARTIALLY' && error.statusCode === 409
    );
});

test('si los abonos ya cubren el total exacto, la obligación queda pagada', async () => {
    const { calls, tx } = buildTx({ receivable: openReceivable({ payments: [{ amount: 2850000 }] }) });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await issueReceivableDocument(prismaClient, 'debt-1', {
        concept: 'Servicios', items, servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30'
    }, { id: 'user-1' });

    assert.equal(calls.find(([name]) => name === 'receivable.update')[1].data.status, 'PAGADO');
});

test('un periodo cerrado impide emitir', async () => {
    const { tx } = buildTx({ receivable: openReceivable() });
    tx.financialPeriod.findUnique = async () => ({ status: 'CLOSED' });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-1', { concept: 'X', items, servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30' }, { id: 'user-1' }),
        (error) => error.code === 'FINANCIAL_PERIOD_CLOSED'
    );
});

test('un número que otro proceso tomó primero se explica, no se duplica', async () => {
    const prismaClient = { $transaction: async () => { throw Object.assign(new Error('unique'), { code: 'P2002' }); } };
    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-1', { concept: 'X', items, servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_NUMBER_TAKEN' && error.statusCode === 409
    );
});

// La identidad del tercero se escribe una sola vez, pero no obliga a abandonar el
// documento a medio hacer para ir a buscarla a otra pantalla (Rodny, 23 de septiembre
// de 2026: «realmente en clientes yo no tengo esa posibilidad de edición»).
const unidentifiedClient = { id: 'client-1', name: 'Prueba tdd', legalName: null, documentType: null, documentNumber: null };
const identity = { legalName: 'Corporación Deportiva Los Titanes', documentType: 'NIT', documentNumber: '901378858' };
const issueInput = (extra = {}) => ({ concept: 'Servicios', items, servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30', ...extra });

test('sin identidad en la ficha y sin escribirla, no se emite: se dice dónde ponerla', async () => {
    const { tx } = buildTx({ receivable: openReceivable({ client: unidentifiedClient }) });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-1', issueInput(), { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_CLIENT_IDENTITY_MISSING'
            && error.statusCode === 409
            && /Prueba tdd/.test(error.message)
            && /en este mismo formulario/.test(error.message)
    );
});

test('la identidad escrita al emitir queda guardada en la ficha del cliente', async () => {
    const { calls, tx } = buildTx({ receivable: openReceivable({ client: unidentifiedClient }), highest: 392 });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await issueReceivableDocument(prismaClient, 'debt-1', issueInput({ client: identity }), { id: 'user-1' });

    const update = calls.find(([name]) => name === 'client.update')[1];
    assert.equal(update.where.id, 'client-1');
    assert.deepEqual(update.data, identity);
    // Queda registrado quién la escribió y qué había antes.
    const audit = calls.filter(([name]) => name === 'audit.create').map(([, args]) => args.data).find((event) => event.entityType === 'Client');
    assert.equal(audit.action, 'UPDATE');
    assert.equal(audit.actorId, 'user-1');
    assert.deepEqual(audit.before, { legalName: null, documentType: null, documentNumber: null });
    assert.deepEqual(audit.after, identity);
});

test('una identidad incompleta o mal escrita no se guarda a medias', async () => {
    for (const wrong of [{ ...identity, documentNumber: '' }, { ...identity, documentType: 'XX' }, { ...identity, documentNumber: 'abc' }]) {
        const { calls, tx } = buildTx({ receivable: openReceivable({ client: unidentifiedClient }) });
        const prismaClient = { $transaction: async (callback) => callback(tx) };
        await assert.rejects(
            issueReceivableDocument(prismaClient, 'debt-1', issueInput({ client: wrong }), { id: 'user-1' }),
            (error) => error.code === 'RECEIVABLE_CLIENT_IDENTITY_INVALID' && error.statusCode === 422
        );
        assert.equal(calls.some(([name]) => name === 'client.update'), false, 'nada se escribe en la ficha');
    }
});

// Emitir un cobro no es el sitio para cambiarle el nombre legal a un tercero.
test('una ficha ya identificada no se reescribe desde la cuenta de cobro', async () => {
    const { calls, tx } = buildTx({ receivable: openReceivable(), highest: 392 });
    const prismaClient = { $transaction: async (callback) => callback(tx) };

    await issueReceivableDocument(prismaClient, 'debt-1', issueInput({ client: { legalName: 'OTRO NOMBRE S.A.S.', documentType: 'CC', documentNumber: '123456' } }), { id: 'user-1' });

    assert.equal(calls.some(([name]) => name === 'client.update'), false);
});

test('la obligación tiene que existir', async () => {
    const { tx } = buildTx({ receivable: null });
    const prismaClient = { $transaction: async (callback) => callback(tx) };
    await assert.rejects(
        issueReceivableDocument(prismaClient, 'debt-404', { concept: 'X', items, servicePeriod: '20 de agosto al 19 de septiembre', issuedAt: '2026-09-30' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_NOT_FOUND' && error.statusCode === 404
    );
});
