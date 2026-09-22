import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { financialRecordLockReason, voidFinancialRecord } from '../src/services/financialRecordService.js';

const ledger = fs.readFileSync(new URL('../src/components/modules/financial/FinancialLedger.jsx', import.meta.url), 'utf8');

// Rodny, 22 de septiembre de 2026: intentó anular desde Movimientos el ingreso de un
// abono y el mensaje lo mandó a «una corrección controlada de la operación de origen»
// sin decir cuál ni dónde. Un motivo que no dice a dónde ir no sirve de nada.

test('el ingreso de un abono manda a Cartera, por su nombre', () => {
    const reason = financialRecordLockReason({ receivablePayment: { id: 'payment-1' }, origin: 'SYSTEM' });
    assert.match(reason, /Cartera/);
    assert.match(reason, /Revertir/);
    assert.match(reason, /se anulará solo/);
    assert.doesNotMatch(reason, /corrección controlada/);
});

test('el pago de nómina manda a Nómina', () => {
    const reason = financialRecordLockReason({ payrollTransaction: { id: 'payroll-1' }, origin: 'SYSTEM' });
    assert.match(reason, /Nómina/);
    assert.doesNotMatch(reason, /Cartera/);
});

test('una conciliación aprobada dice que hay que deshacerla primero', () => {
    const reason = financialRecordLockReason({ bankMatches: [{ id: 'match-1', status: 'APPROVED' }], origin: 'MANUAL' });
    assert.match(reason, /conciliación bancaria aprobada/);
    assert.match(reason, /deshacer esa conciliación/);
});

test('el origen del sistema sin vínculo conocido no deja a nadie sin explicación', () => {
    const reason = financialRecordLockReason({ origin: 'SYSTEM' });
    assert.match(reason, /otro proceso de la plataforma/);
    assert.ok(reason.length > 40, 'un motivo de una línea seca no ayuda a nadie');
});

test('un movimiento normal no está bloqueado', () => {
    assert.equal(financialRecordLockReason({ origin: 'MANUAL' }), null);
    assert.equal(financialRecordLockReason(null), null);
});

test('el servidor rechaza con ese mismo motivo, no con uno genérico', async () => {
    const record = {
        id: 'record-1', origin: 'SYSTEM', status: 'POSTED', year: 2026, month: 9,
        receivablePayment: { id: 'payment-1' }, payrollTransaction: null, bankMatches: []
    };
    const prismaClient = {
        $transaction: async (callback) => callback({
            financialRecord: { findUnique: async () => record },
            financialPeriod: { findUnique: async () => ({ status: 'OPEN' }) }
        })
    };

    await assert.rejects(
        voidFinancialRecord(prismaClient, 'record-1', 'Fue una prueba', { id: 'user-1' }),
        (error) => error.code === 'FINANCIAL_RECORD_LINKED' && /Cartera/.test(error.message) && error.statusCode === 409
    );
});

test('la pantalla lo dice antes, en vez de dejar escribir un motivo para nada', () => {
    // El botón sigue siendo pulsable y explica al tocarlo. No lleva `disabled` ni
    // `aria-disabled` porque sí hace algo: marcarlo como deshabilitado lo escondería
    // del teclado y de un lector de pantalla justo cuando más hace falta.
    assert.match(ledger, /const lockReason = \(record\)/);
    assert.doesNotMatch(ledger, /aria-disabled=\{Boolean\(locked\)\}/);
    assert.match(ledger, /aria-label=\{locked \? `No se puede anular aquí\. \$\{locked\}`/);
    assert.match(ledger, /locked \? explain\(\) : openEdit\(record\)/);
    assert.match(ledger, /if \(locked\) \{ explain\(\); return; \}/);
    // Y la lista trae de dónde viene cada movimiento para poder saberlo.
    const service = fs.readFileSync(new URL('../src/services/financialRecordService.js', import.meta.url), 'utf8');
    assert.match(service, /documents: \{ orderBy: \{ uploadedAt: 'asc' \} \},[\s\S]{0,220}\.\.\.recordSourceRelations/);
});
