import test from 'node:test';
import assert from 'node:assert/strict';
import { createReceivable, deleteReceivable, updateReceivable } from '../src/services/financialReceivableService.js';

const makeClient = (existing, calls) => ({
    $transaction: async (callback) => callback({
        financialPeriod: { findUnique: async () => null },
        accountsReceivable: {
            findUnique: async () => existing,
            update: async (args) => {
                calls.push(['receivable.update', args]);
                return { ...existing, ...args.data, client: { name: 'Jazmín', slug: 'jazmin' }, payments: existing.payments };
            }
        },
        financialAuditEvent: {
            create: async (args) => {
                calls.push(['audit.create', args]);
                return { id: 'audit-1' };
            }
        }
    })
});

test('updateReceivable derives paid status from traceable payments and writes an audit event', async () => {
    const calls = [];
    const existing = {
        id: 'debt-1', amount: 1000000, status: 'DEBE', comments: null, notes: null,
        metadata: { source: 'excel' }, payments: [{ amount: 400000 }, { amount: 600000 }]
    };

    const result = await updateReceivable(
        makeClient(existing, calls),
        'debt-1',
        { comments: 'Conciliado' },
        { id: 'user-1' }
    );

    assert.equal(result.status, 'PAGADO');
    assert.equal(calls[0][1].data.metadata.source, 'excel');
    assert.equal(calls[0][1].data.metadata.editedBy, 'user-1');
    assert.equal(calls[1][1].data.action, 'UPDATE');
});

test('updateReceivable rejects an amount below payments already registered', async () => {
    const existing = {
        id: 'debt-1', amount: 1000000, status: 'DEBE', metadata: {},
        payments: [{ amount: 700000 }]
    };

    await assert.rejects(
        updateReceivable(makeClient(existing, []), 'debt-1', { amount: 500000 }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_AMOUNT_BELOW_PAYMENTS' && error.statusCode === 409
    );
});

test('updateReceivable refuses a manual paid status while a balance remains', async () => {
    const existing = {
        id: 'debt-1', amount: 1000000, status: 'DEBE', metadata: {},
        payments: [{ amount: 400000 }]
    };

    await assert.rejects(
        updateReceivable(makeClient(existing, []), 'debt-1', { status: 'PAGADO' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_PAYMENT_REQUIRED' && error.statusCode === 409
    );
});

test('createReceivable creates an open client balance with an audit event', async () => {
    const calls = [];
    const tx = {
        financialPeriod: { findUnique: async () => null },
        client: { findUnique: async () => ({ id: 'client-1', name: 'Pablo Hoff' }) },
        accountsReceivable: {
            create: async (args) => {
                calls.push(['receivable.create', args]);
                return { id: 'debt-1', ...args.data };
            }
        },
        financialAuditEvent: { create: async (args) => calls.push(['audit.create', args]) }
    };

    const result = await createReceivable({ $transaction: async (callback) => callback(tx) }, {
        clientId: 'client-1', amount: 1450000, period: '2026-08-01', dueDate: '2026-08-15',
        comments: 'Factura agosto'
    }, { id: 'user-1' });

    assert.equal(result.status, 'DEBE');
    assert.equal(result.dueDate.toISOString(), '2026-08-15T12:00:00.000Z');
    assert.equal(calls[0][1].data.year, 2026);
    assert.equal(calls[0][1].data.month, 8);
    assert.equal(calls[0][1].data.origin, 'MANUAL');
    assert.equal(calls[1][1].data.action, 'CREATE');
});

// Registrar el cobro de alguien nuevo no obliga a salir a crearlo primero (Rodny, 23
// de septiembre de 2026). La ficha y el cobro quedan en la misma transacción.
const buildCreateTx = () => {
    const calls = [];
    return {
        calls,
        tx: {
            financialPeriod: { findUnique: async () => null },
            client: {
                findUnique: async (args) => (args.where.slug !== undefined ? null : { id: 'client-1', name: 'Pablo Hoff' }),
                create: async (args) => { calls.push(['client.create', args]); return { id: 'client-nuevo', ...args.data }; }
            },
            accountsReceivable: { create: async (args) => { calls.push(['receivable.create', args]); return { id: 'debt-1', ...args.data }; } },
            financialAuditEvent: { create: async (args) => { calls.push(['audit.create', args]); return { id: 'audit-1' }; } }
        }
    };
};

test('createReceivable puede crear la ficha del cliente en el mismo acto', async () => {
    const { calls, tx } = buildCreateTx();

    await createReceivable({ $transaction: async (callback) => callback(tx) }, {
        client: { name: 'Javid Trámite y Asesorías' }, amount: 4710000, period: '2026-01-01'
    }, { id: 'user-1' });

    const created = calls.find(([name]) => name === 'client.create')[1].data;
    assert.equal(created.name, 'Javid Trámite y Asesorías');
    assert.equal(created.slug, 'javid-tramite-y-asesorias');
    assert.equal(created.status, 'ACTIVO');
    // El cobro apunta a la ficha recién creada, no a un id vacío.
    const receivable = calls.find(([name]) => name === 'receivable.create')[1].data;
    assert.equal(receivable.clientId, 'client-nuevo');
    assert.equal(receivable.sourceLabel, 'Javid Trámite y Asesorías');
    // Queda registrado que se creó la ficha, y quién.
    const audit = calls.filter(([name]) => name === 'audit.create').map(([, args]) => args.data);
    assert.deepEqual(audit.map((event) => `${event.entityType}:${event.action}`), ['Client:CREATE', 'AccountsReceivable:CREATE']);
    assert.equal(audit[0].actorId, 'user-1');
});

test('sin cliente elegido ni nombre nuevo no se registra nada', async () => {
    const { calls, tx } = buildCreateTx();
    await assert.rejects(
        createReceivable({ $transaction: async (callback) => callback(tx) }, { amount: 1000, period: '2026-01-01' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_CLIENT_REQUIRED' && /escribe el nombre de uno nuevo/.test(error.message)
    );
    assert.equal(calls.length, 0);
});

// Elegir uno que ya existe sigue mandando: no se crea un duplicado por el camino.
test('con un cliente elegido no se crea ninguna ficha', async () => {
    const { calls, tx } = buildCreateTx();

    await createReceivable({ $transaction: async (callback) => callback(tx) }, {
        clientId: 'client-1', client: { name: 'Se ignora' }, amount: 1000, period: '2026-01-01'
    }, { id: 'user-1' });

    assert.equal(calls.some(([name]) => name === 'client.create'), false);
    assert.equal(calls.find(([name]) => name === 'receivable.create')[1].data.clientId, 'client-1');
});

// Una obligación tecleada por error o de prueba no es evidencia de nada, y se puede
// eliminar (Rodny, 23 de septiembre de 2026). La bitácora conserva lo que decía.
const buildDeleteTx = (existing) => {
    const calls = [];
    return {
        calls,
        client: {
            $transaction: async (callback) => callback({
                financialPeriod: { findUnique: async () => null },
                accountsReceivable: {
                    findUnique: async () => existing,
                    delete: async (args) => { calls.push(['receivable.delete', args]); return existing; }
                },
                financialAuditEvent: { create: async (args) => { calls.push(['audit.create', args]); return { id: 'audit-1' }; } }
            })
        }
    };
};

const deletableDebt = (overrides = {}) => ({
    id: 'debt-1', clientId: 'client-1', amount: 100000, status: 'DEBE', number: null, pdfStorageKey: null,
    period: new Date('2026-09-01T12:00:00Z'), year: 2026, month: 9, items: [], payments: [],
    client: { id: 'client-1', name: 'Prueba tdd' }, ...overrides
});

test('una obligación sin abonos vigentes se elimina, y la bitácora conserva lo que decía', async () => {
    const existing = deletableDebt({ number: 393, items: [{ description: 'Fee', amount: 100000 }] });
    const { calls, client } = buildDeleteTx(existing);

    const result = await deleteReceivable(client, 'debt-1', 'Fue una prueba', { id: 'user-1' });

    assert.equal(result.number, 393);
    const audit = calls.find(([name]) => name === 'audit.create')[1].data;
    assert.equal(audit.action, 'DELETE');
    assert.equal(audit.actorId, 'user-1');
    // La fila entera queda en el «antes»: número, conceptos y todo.
    assert.equal(audit.before.number, 393);
    assert.deepEqual(audit.before.items, [{ description: 'Fee', amount: 100000 }]);
    assert.equal(audit.after.reason, 'Fue una prueba');
    // Y la auditoría se escribe antes de borrar, dentro de la misma transacción.
    assert.deepEqual(calls.map(([name]) => name), ['audit.create', 'receivable.delete']);
});

// Ahí sigue habiendo dinero apuntando a la obligación: borrarla lo dejaría colgando.
test('una obligación con abonos vigentes no se borra, y se dice por dónde salir', async () => {
    const existing = deletableDebt({ payments: [{ id: 'p1', amount: 50000, reversedAt: null }] });
    const { calls, client } = buildDeleteTx(existing);

    await assert.rejects(
        deleteReceivable(client, 'debt-1', null, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_HAS_PAYMENTS'
            && error.statusCode === 409
            && /«Revertir»/.test(error.message)
    );
    assert.equal(calls.length, 0, 'no se borra ni se audita nada');
});

// Un abono revertido ya no sostiene dinero: su rastro queda en la bitácora.
test('los abonos ya revertidos no impiden eliminarla', async () => {
    const existing = deletableDebt({ payments: [{ id: 'p1', amount: 50000, reversedAt: new Date('2026-09-20T05:00:00Z') }] });
    const { calls, client } = buildDeleteTx(existing);

    await deleteReceivable(client, 'debt-1', null, { id: 'user-1' });

    assert.equal(calls.find(([name]) => name === 'audit.create')[1].data.before.payments.length, 1);
    assert.ok(calls.some(([name]) => name === 'receivable.delete'));
});

test('no se puede eliminar una obligación que no existe', async () => {
    const { client } = buildDeleteTx(null);
    await assert.rejects(
        deleteReceivable(client, 'debt-404', null, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_NOT_FOUND' && error.statusCode === 404
    );
});

test('editing only notes preserves a remaining payment promise', async () => {
    const existing = { id: 'debt-1', amount: 1000, period: new Date('2026-09-01T12:00:00Z'), status: 'PROMESADO', payments: [{ amount: 200 }] };
    const result = await updateReceivable(makeClient(existing, []), 'debt-1', { notes: 'Llamar el viernes' }, { id: 'user-1' });
    assert.equal(result.status, 'PROMESADO');
});

test('an explicit DEBE status may clear a collection promise', async () => {
    const existing = { id: 'debt-1', amount: 1000, period: new Date('2026-09-01T12:00:00Z'), status: 'PROMESADO', payments: [] };
    const result = await updateReceivable(makeClient(existing, []), 'debt-1', { status: 'DEBE' }, { id: 'user-1' });
    assert.equal(result.status, 'DEBE');
});

test('an unknown status is rejected instead of clearing a payment promise', async () => {
    const existing = { id: 'debt-1', amount: 1000, period: new Date('2026-09-01T12:00:00Z'), status: 'PROMESADO', payments: [] };
    const calls = [];
    await assert.rejects(updateReceivable(makeClient(existing, calls), 'debt-1', { status: 'DONE' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_STATUS_INVALID');
    assert.equal(calls.length, 0);
});

test('receivable edits use serializable isolation and report concurrent payment conflicts', async () => {
    let options;
    const client = { $transaction: async (_callback, transactionOptions) => {
        options = transactionOptions;
        throw Object.assign(new Error('Write conflict'), { code: 'P2034' });
    } };
    await assert.rejects(updateReceivable(client, 'debt-1', { amount: 1000 }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_CONFLICT' && error.statusCode === 409);
    assert.equal(options.isolationLevel, 'Serializable');
});

test('due dates reject impossible calendar days instead of rolling into another month', async () => {
    const existing = { id: 'debt-1', amount: 1000, period: new Date('2026-09-01T12:00:00Z'), status: 'DEBE', payments: [] };
    for (const dueDate of ['2026-02-31', '2026-13-01', '2026-04-31', '07/09/2026']) {
        const calls = [];
        await assert.rejects(updateReceivable(makeClient(existing, calls), 'debt-1', { dueDate }, { id: 'user-1' }),
            (error) => error.code === 'RECEIVABLE_DUE_DATE_INVALID');
        assert.equal(calls.length, 0);
    }
});

test('setting and clearing a due date preserve its civil date in Bogota', async () => {
    const existing = { id: 'debt-1', amount: 1000, period: new Date('2026-09-01T12:00:00Z'), status: 'DEBE', payments: [] };
    const result = await updateReceivable(makeClient(existing, []), 'debt-1', { dueDate: '2026-09-07' }, { id: 'user-1' });
    assert.equal(result.dueDate.toISOString(), '2026-09-07T12:00:00.000Z');
    const cleared = await updateReceivable(makeClient({ ...existing, dueDate: result.dueDate }, []), 'debt-1', { dueDate: null }, { id: 'user-1' });
    assert.equal(cleared.dueDate, null);
});

test('new debts reject amounts that are not positive safe cents', async () => {
    const client = { $transaction: async () => ({ id: 'unexpected-create' }) };
    for (const amount of [0, 1.001, 1.005, 0.009, Number.MAX_SAFE_INTEGER]) {
        await assert.rejects(createReceivable(client, { clientId: 'client-1', amount, period: '2026-09-01' }, { id: 'user-1' }),
            (error) => error.code === 'RECEIVABLE_AMOUNT_INVALID');
    }
});

test('editing a debt cannot zero its balance or introduce fractional/unsafe cents', async () => {
    const existing = { id: 'debt-1', amount: 1000, period: new Date('2026-09-01T12:00:00Z'), status: 'DEBE', payments: [] };
    for (const amount of [0, 1.001, 1.005, 0.009, Number.MAX_SAFE_INTEGER]) {
        const calls = [];
        await assert.rejects(updateReceivable(makeClient(existing, calls), 'debt-1', { amount }, { id: 'user-1' }),
            (error) => error.code === 'RECEIVABLE_AMOUNT_INVALID');
        assert.equal(calls.length, 0);
    }
});

test('editing notes on a legacy zero requires review and never invents a paid state', async () => {
    const existing = { id: 'debt-1', amount: 0, period: new Date('2026-09-01T12:00:00Z'), status: 'DEBE', payments: [] };
    const calls = [];
    await assert.rejects(updateReceivable(makeClient(existing, calls), 'debt-1', { notes: 'Revisar' }, { id: 'user-1' }),
        (error) => error.code === 'RECEIVABLE_BALANCE_INVALID' && error.statusCode === 409);
    assert.equal(calls.length, 0);
});

test('editing legacy paid debts without matching applications requires review instead of reopening collection', async () => {
    for (const payments of [[], [{ amount: 200 }]]) {
        const existing = { id: 'debt-1', amount: 1000, period: new Date('2026-09-01T12:00:00Z'), status: 'PAGADO', payments };
        for (const patch of [{ notes: 'Revisar soporte' }, { comments: 'Importado' }, { status: 'DEBE' }, { amount: 1200 }, { dueDate: '2026-09-30' }]) {
            const calls = [];
            await assert.rejects(updateReceivable(makeClient(existing, calls), 'debt-1', patch, { id: 'user-1' }),
                (error) => error.code === 'RECEIVABLE_BALANCE_INVALID' && error.statusCode === 409);
            assert.equal(calls.length, 0);
        }
    }
});

test('notes on a fully traced paid debt retain its paid status', async () => {
    const existing = { id: 'debt-1', amount: 1000, period: new Date('2026-09-01T12:00:00Z'), status: 'PAGADO', payments: [{ amount: 1000 }] };
    const result = await updateReceivable(makeClient(existing, []), 'debt-1', { notes: 'Soporte verificado' }, { id: 'user-1' });
    assert.equal(result.status, 'PAGADO');
    assert.equal(result.amount, 1000);
});
