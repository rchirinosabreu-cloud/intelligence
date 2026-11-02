import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_COLLECTION_SETTINGS, collectionBellText, collectionNoticeText, monthlyCollectionAlert, normalizeCollectionSettings,
    oneOffCollectionAlerts, openBalanceCents, overdueReceivables, receivableDueDate
} from '../src/lib/receivableCollections.js';

const S = DEFAULT_COLLECTION_SETTINGS;
const rec = (over = {}) => ({
    id: 'r1', kind: 'CLIENTE', status: 'DEBE', amount: 1000000, period: '2026-08-01T00:00:00.000Z', issuedAt: null, dueDate: null, number: null, payments: [], ...over
});

test('los plazos por defecto son los acordados con Rodny y se pueden cambiar con límites', () => {
    assert.deepEqual(S, { enabled: false, paymentTermDays: 15, monthlyAlertCount: 2, oneOffFirstAlertDays: 15, repeatDays: 7 }, 'nacen apagados');
    assert.deepEqual(normalizeCollectionSettings({ enabled: true, paymentTermDays: '10', monthlyAlertCount: 3, oneOffFirstAlertDays: 5, repeatDays: 3 }).value,
        { enabled: true, paymentTermDays: 10, monthlyAlertCount: 3, oneOffFirstAlertDays: 5, repeatDays: 3 });
    assert.equal(normalizeCollectionSettings({ enabled: 'sí' }).value.enabled, false, 'solo un true de verdad los enciende');
    assert.match(normalizeCollectionSettings({ ...S, paymentTermDays: 0 }).problem, /plazo/i);
    assert.match(normalizeCollectionSettings({ ...S, monthlyAlertCount: 1.5 }).problem, /mensualidades/i);
    assert.match(normalizeCollectionSettings({ ...S, repeatDays: 0 }).problem, /repetir|cada/i);
});

test('vence: la fecha puesta a mano, si no 15 días después de emitida y, sin emitir, 15 días después de empezar el mes', () => {
    assert.deepEqual(receivableDueDate(rec({ dueDate: '2026-09-03T00:00:00.000Z', issuedAt: '2026-08-01T15:00:00.000Z' }), S), { date: '2026-09-03', source: 'VENCIMIENTO' });
    // Emitida a las 9 de la noche en Bogotá (ya es el día siguiente en UTC): cuenta el día de Bogotá.
    assert.deepEqual(receivableDueDate(rec({ issuedAt: '2026-08-05T02:00:00.000Z' }), S), { date: '2026-08-19', source: 'EMISION' });
    assert.deepEqual(receivableDueDate(rec(), S), { date: '2026-08-16', source: 'PERIODO' });
    assert.equal(receivableDueDate(rec({ period: null }), S), null);
});

test('el saldo descuenta pagos, ajustes y retenciones vigentes; una cuenta cerrada no debe nada', () => {
    const payments = [{ amount: 300000 }, { amount: 100000, kind: 'RETENCION' }, { amount: 500000, reversedAt: '2026-08-20' }];
    assert.equal(openBalanceCents(rec({ payments })), 60000000);
    assert.equal(openBalanceCents(rec({ status: 'PAGADO' })), 0);
    assert.equal(openBalanceCents(rec({ status: 'SALDADO' })), 0);
});

test('vencida es la que tiene saldo y ya pasó su día; un préstamo no es cartera de clientes', () => {
    const list = [
        rec({ id: 'a', period: '2026-08-01' }),
        rec({ id: 'b', period: '2026-09-01' }),
        rec({ id: 'c', period: '2026-10-01' }), // vence el 16 de octubre: hoy, 16, todavía no está vencida
        rec({ id: 'd', period: '2026-07-01', status: 'PAGADO' }),
        rec({ id: 'e', period: '2026-06-01', kind: 'PRESTAMO' })
    ];
    assert.deepEqual(overdueReceivables(list, '2026-10-16', S).map((item) => item.id), ['a', 'b']);
    assert.deepEqual(overdueReceivables(list, '2026-10-17', S).map((item) => item.id), ['a', 'b', 'c']);
});

test('mensual: avisa desde la segunda mensualidad vencida y repite cada 7 días mientras siga igual', () => {
    const list = [rec({ id: 'a', period: '2026-08-01' }), rec({ id: 'b', period: '2026-09-01', issuedAt: '2026-09-02T15:00:00.000Z' })];
    // La segunda vence el 17 de septiembre: el 18 ya hay dos vencidas.
    assert.equal(monthlyCollectionAlert({ clientId: 'c1', receivables: list, today: '2026-09-17', settings: S }), null);
    const first = monthlyCollectionAlert({ clientId: 'c1', receivables: list, today: '2026-09-18', settings: S });
    assert.equal(first.kind, 'MENSUAL');
    assert.equal(first.subjectId, 'c1');
    assert.equal(first.count, 2);
    assert.equal(first.step, 0);
    assert.equal(first.cycle, 'M2:2026-09-18');
    assert.equal(first.balanceCents, 200000000);
    assert.equal(first.oldestPeriod, '2026-08');
    assert.equal(first.unissued, 1);
    assert.equal(monthlyCollectionAlert({ clientId: 'c1', receivables: list, today: '2026-09-24', settings: S }).step, 0);
    assert.equal(monthlyCollectionAlert({ clientId: 'c1', receivables: list, today: '2026-09-25', settings: S }).step, 1);
    // Una tercera vencida abre otro ciclo: el aviso cambia y sale de una vez.
    const third = monthlyCollectionAlert({ clientId: 'c1', receivables: [...list, rec({ id: 'x', period: '2026-10-01' })], today: '2026-10-17', settings: S });
    assert.equal(third.count, 3);
    assert.equal(third.cycle, 'M3:2026-10-17');
    assert.equal(third.step, 0);
});

test('servicio puntual: avisa 15 días después del vencimiento y luego cada 7, cuenta por cuenta', () => {
    const list = [rec({ id: 'w', number: 395, issuedAt: '2026-09-01T15:00:00.000Z' })]; // vence el 16 de septiembre
    assert.deepEqual(oneOffCollectionAlerts({ receivables: list, today: '2026-09-30', settings: S }), []);
    const [first] = oneOffCollectionAlerts({ receivables: list, today: '2026-10-01', settings: S });
    assert.equal(first.kind, 'UNICO');
    assert.equal(first.subjectId, 'w');
    assert.equal(first.daysOverdue, 15);
    assert.equal(first.step, 0);
    assert.equal(first.cycle, 'U:2026-09-16');
    assert.equal(first.number, 395);
    assert.equal(oneOffCollectionAlerts({ receivables: list, today: '2026-10-08', settings: S })[0].step, 1);
});

test('la banda lleva las cifras; la campana no, y al project manager no se le dicen ni las mensualidades', () => {
    const monthly = { kind: 'MENSUAL', count: 2, balanceCents: 320000000, oldestPeriod: '2026-04', unissued: 0 };
    const band = collectionNoticeText(monthly, 'Muebles Nuva');
    assert.equal(band.kind, 'CARTERA_MENSUAL');
    assert.equal(band.level, 'IMPORTANTE');
    assert.equal(band.message, 'Muebles Nuva tiene 2 mensualidades vencidas desde abril: $3.200.000 pendientes');
    const admin = collectionBellText(monthly, 'Muebles Nuva', 'ADMINISTRATIVA');
    assert.doesNotMatch(admin, /\$|\d{3}\.\d{3}/);
    assert.match(admin, /2 mensualidades vencidas/);
    const pm = collectionBellText(monthly, 'Muebles Nuva', 'PM');
    assert.doesNotMatch(pm, /\$|mensualidad|\d/);
    assert.match(pm, /Muebles Nuva/);

    const oneOff = { kind: 'UNICO', daysOverdue: 22, balanceCents: 150000000, number: 395 };
    const oneOffBand = collectionNoticeText(oneOff, 'Fundación Grit');
    assert.equal(oneOffBand.kind, 'CARTERA_UNICO');
    assert.equal(oneOffBand.level, 'SEGUIMIENTO');
    assert.equal(oneOffBand.message, 'Fundación Grit lleva 22 días vencida la cuenta de cobro No. 0395: $1.500.000 pendientes');
    assert.equal(collectionNoticeText({ ...oneOff, number: null, period: '2026-08' }, 'Fundación Grit').message,
        'Fundación Grit lleva 22 días vencida la cuenta de agosto (sin emitir): $1.500.000 pendientes');
});
