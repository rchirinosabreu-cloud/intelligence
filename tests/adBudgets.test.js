import test from 'node:test';
import assert from 'node:assert/strict';
import {
    adBudgetProblem, adCampaignProblem, adCarryOverProblem, adCycleFor, adSpendProblem, addDays, campaignFlags, carryOverFor,
    clientCutDay, cycleFromKey, daysBetween, evaluateAdCycle, formatAdMoney, previousCycleKey, spendDeadline, toCents
} from '../src/lib/adBudgets.js';

// Reglas que salen de la reunión de pautas del 6 de noviembre de 2026. Los casos son los que se revisaron ese día.

const budget = (extra = {}) => ({ kind: 'MENSUAL', status: 'ACTIVA', currency: 'COP', amount: 1000000, ...extra });
const row = (spent, spentAsOf, extra = {}) => ({ cycleKey: '2026-10', amount: 1000000, spent, spentAsOf, closedAt: null, ...extra });

test('el ciclo de la pauta es el del cliente: del día de corte al día anterior del mes siguiente', () => {
    assert.deepEqual(
        (({ key, start, end }) => ({ key, start, end }))(adCycleFor(budget(), { cutDay: 15, today: '2026-11-06' })),
        { key: '2026-10', start: '2026-10-15', end: '2026-11-14' },
        'Endova cierra el 14: el 6 de noviembre sigue en el ciclo que empezó el 15 de octubre'
    );
    assert.equal(adCycleFor(budget(), { cutDay: 1, today: '2026-11-06' }).end, '2026-11-30', 'del 1 al 30');
    assert.equal(adCycleFor(budget(), { cutDay: 10, today: '2026-11-10' }).start, '2026-11-10');
});

test('una pauta específica usa sus propias fechas y no trae saldo', () => {
    const specific = budget({ kind: 'ESPECIFICA', startDate: '2026-11-01', endDate: '2026-11-20' });
    const cycle = adCycleFor(specific, { cutDay: 15, today: '2026-11-06' });
    assert.equal(cycle.key, 'UNICO');
    assert.equal(cycle.end, '2026-11-20');
    assert.equal(spendDeadline(cycle), '2026-11-20', 'no reserva los días del informe');
    assert.equal(previousCycleKey('UNICO'), null);
});

test('el gasto va hasta dos días antes del cierre, para hacer el informe con la cifra completa', () => {
    assert.equal(spendDeadline(cycleFromKey('2026-11', 1)), '2026-11-28', '«no lo pongas al 30, ponlo hasta 28»');
    assert.equal(spendDeadline(cycleFromKey('2026-10', 10)), '2026-11-07');
});

test('el corte sale del contrato vigente; sin contrato se usa el mes calendario y se dice', () => {
    const contracts = [{ startDate: '2026-01-01', cutDay: 3 }, { startDate: '2026-06-01', cutDay: 15 }, { startDate: '2027-01-01', cutDay: 20 }];
    assert.deepEqual(clientCutDay(contracts, '2026-11-06'), { cutDay: 15, fromContract: true });
    assert.deepEqual(clientCutDay([], '2026-11-06'), { cutDay: 1, fromContract: false });
});

test('lo que no se gastó pasa al ciclo siguiente: el saldo de octubre se suma a noviembre', () => {
    const rows = [{ cycleKey: '2026-10', amount: 300, spent: 119, closedAt: new Date() }];
    const carry = carryOverFor('2026-11', rows, 1);
    assert.equal(carry.cents, toCents(181), 'quedan los 181 dólares de la reunión');
    assert.equal(carry.known, true);
});

test('lo gastado de más se resta, y el saldo se arrastra por varios ciclos', () => {
    const rows = [
        { cycleKey: '2026-09', amount: 100, spent: 130, closedAt: new Date() },
        { cycleKey: '2026-10', amount: 100, spent: 50, closedAt: new Date() }
    ];
    assert.equal(carryOverFor('2026-10', rows, 1).cents, toCents(-30));
    assert.equal(carryOverFor('2026-11', rows, 1).cents, toCents(20));
});

test('sin gasto registrado en el ciclo anterior no se inventa un saldo', () => {
    const carry = carryOverFor('2026-11', [{ cycleKey: '2026-10', amount: 300, spent: null }], 1);
    assert.deepEqual([carry.cents, carry.known], [0, false]);
    assert.equal(carryOverFor('2026-11', [], 1).known, false);
});

test('un saldo ajustado a mano manda sobre la cuenta, también para el ciclo siguiente', () => {
    const rows = [
        { cycleKey: '2026-10', amount: 100, spent: 100, carryOverManual: 181, closedAt: new Date() }
    ];
    assert.equal(carryOverFor('2026-10', rows, 1).cents, toCents(181));
    assert.equal(carryOverFor('2026-10', rows, 1).manual, true);
    assert.equal(carryOverFor('2026-11', rows, 1).cents, toCents(181));
});

test('una lectura vieja no se juzga con el ritmo de hoy', () => {
    const cycle = cycleFromKey('2026-10', 1);
    const result = evaluateAdCycle({ budget: budget(), cycle, row: row(100000, '2026-10-03'), today: '2026-10-12' });
    assert.notEqual(result.state, 'ATRASADA', 'el 3 de octubre 100.000 iba bien; lo que pasa es que nadie actualizó');
    assert.equal(result.reviewDue, true);
    assert.equal(result.daysSinceReading, 9);
});

test('una pauta que va por debajo del ritmo dice cuánto hay que gastar por día', () => {
    const cycle = cycleFromKey('2026-11', 1);
    const result = evaluateAdCycle({ budget: budget({ currency: 'USD', amount: 300 }), cycle, row: row(7, '2026-11-14', { amount: 300 }), today: '2026-11-14' });
    assert.equal(result.state, 'ATRASADA');
    assert.equal(result.dailyNeededCents, Math.ceil(toCents(293) / 14));
    assert.match(result.reasons[0], /por día hasta el 28 nov/);
});

test('768.000 de 1.000.000 a pocos días del cierre es rojo y dice lo que falta', () => {
    const cycle = cycleFromKey('2026-10', 10);
    const result = evaluateAdCycle({ budget: budget(), cycle, row: row(768000, '2026-11-06'), today: '2026-11-06' });
    assert.equal(cycle.end, '2026-11-09');
    assert.equal(result.closingWindow, true);
    assert.equal(result.balanceCents, toCents(232000));
    assert.equal(result.state, 'ATRASADA');
    assert.equal(result.level, 'red', 'en los últimos cinco días lo atrasado es rojo');
});

test('se pasó solo si supera la tolerancia: 4.000 pesos de más están bien, 100.000 no', () => {
    const cycle = cycleFromKey('2026-10', 1);
    const near = evaluateAdCycle({ budget: budget(), cycle, row: row(1004000, '2026-10-20'), today: '2026-10-20' });
    assert.equal(near.state, 'COMPLETA');
    assert.equal(near.reviewDue, false);
    const over = evaluateAdCycle({ budget: budget(), cycle, row: row(1100000, '2026-10-20'), today: '2026-10-20' });
    assert.equal(over.state, 'PASADA');
    assert.equal(over.level, 'red');
    assert.match(over.reasons[0], /100\.000/);
});

test('si el saldo se acaba antes del cierre lo dice: «se caían dos días antes»', () => {
    const cycle = cycleFromKey('2026-10', 1);
    const result = evaluateAdCycle({ budget: budget(), cycle, row: row(700000, '2026-10-10'), today: '2026-10-10' });
    assert.equal(result.state, 'RAPIDA');
    assert.match(result.reasons[0], /se acaba el/);
});

test('se revisa cada tres días y, en la recta final, cada día', () => {
    const cycle = cycleFromKey('2026-11', 1);
    const onTrack = (spentAsOf, today, spent) => evaluateAdCycle({ budget: budget(), cycle, row: row(spent, spentAsOf), today });
    assert.equal(onTrack('2026-11-10', '2026-11-12', 330000).reviewDue, false, 'dos días: todavía no');
    assert.equal(onTrack('2026-11-10', '2026-11-13', 330000).reviewDue, true, 'tres días: sí');
    assert.equal(onTrack('2026-11-26', '2026-11-27', 900000).reviewDue, true, 'a cinco días del cierre, cada día');
    assert.equal(onTrack('2026-11-27', '2026-11-27', 900000).reviewDue, false);
});

test('un ciclo nuevo sin lectura pide revisión a los tres días, no el primer día', () => {
    const cycle = cycleFromKey('2026-11', 1);
    assert.equal(evaluateAdCycle({ budget: budget(), cycle, today: '2026-11-01' }).reviewDue, false);
    const late = evaluateAdCycle({ budget: budget(), cycle, today: '2026-11-04' });
    assert.equal(late.reviewDue, true);
    assert.equal(late.state, 'SIN_GASTO');
});

test('un ciclo que terminó pide el gasto final, y al cerrarlo deja de pedir', () => {
    const cycle = cycleFromKey('2026-10', 1);
    const open = evaluateAdCycle({ budget: budget(), cycle, row: row(900000, '2026-10-29'), today: '2026-11-02' });
    assert.equal(open.state, 'POR_CERRAR');
    assert.equal(open.reviewDue, true);
    const closed = evaluateAdCycle({ budget: budget(), cycle, row: row(990000, '2026-10-31', { closedAt: new Date() }), today: '2026-11-02' });
    assert.equal(closed.state, 'CERRADO');
    assert.equal(closed.reviewDue, false);
});

test('pausada o terminada no pide nada', () => {
    const cycle = cycleFromKey('2026-11', 1);
    for (const status of ['PAUSADA', 'TERMINADA']) {
        const result = evaluateAdCycle({ budget: budget({ status }), cycle, today: '2026-11-20' });
        assert.equal(result.level, 'gray', status);
        assert.equal(result.reviewDue, false, status);
    }
});

test('una campaña activa pasada su fecha pide confirmar: la pauta del 21 que siguió hasta el 29', () => {
    const cycle = cycleFromKey('2026-10', 1);
    const campaign = { id: 'c1', name: 'Evento', status: 'ACTIVA', endDate: '2026-10-21' };
    assert.equal(campaignFlags(campaign, cycle, '2026-10-22')[0].code, 'VENCIDA');
    assert.deepEqual(campaignFlags({ ...campaign, status: 'FINALIZADA' }, cycle, '2026-10-22'), []);
    const result = evaluateAdCycle({ budget: budget(), cycle, row: row(600000, '2026-10-22'), campaigns: [campaign], today: '2026-10-22' });
    assert.ok(result.reasons.some((reason) => /Debía terminar el 21 oct/.test(reason)));
    assert.equal(result.level, 'yellow');
});

test('una campaña que termina después del cierre del cliente se señala', () => {
    const cycle = cycleFromKey('2026-10', 10);
    const flags = campaignFlags({ id: 'c', status: 'ACTIVA', endDate: '2026-11-18' }, cycle, '2026-11-06');
    assert.equal(flags[0].code, 'PASA_EL_CIERRE');
});

test('quedarse sin campañas activas con saldo se dice; sin campañas registradas no se asume nada', () => {
    const cycle = cycleFromKey('2026-11', 1);
    const campaigns = [{ id: 'a', name: 'A', status: 'FINALIZADA', endDate: '2026-11-05' }];
    const reading = row(200000, '2026-11-07');
    assert.equal(evaluateAdCycle({ budget: budget(), cycle, row: reading, campaigns, today: '2026-11-07' }).noneRunning, true);
    assert.equal(evaluateAdCycle({ budget: budget(), cycle, row: reading, campaigns: [], today: '2026-11-07' }).noneRunning, false);
});

test('el saldo que entra se suma a lo disponible', () => {
    const cycle = cycleFromKey('2026-11', 1);
    const result = evaluateAdCycle({ budget: budget({ currency: 'USD', amount: 300 }), cycle, carry: { cents: toCents(181), known: true }, row: row(7, '2026-11-06', { amount: 300 }), today: '2026-11-06' });
    assert.equal(result.availableCents, toCents(481));
    assert.equal(result.balanceCents, toCents(474));
});

test('las validaciones hablan en palabras', () => {
    const valid = { clientId: 'c', platform: 'META', kind: 'MENSUAL', currency: 'COP', amount: '300000' };
    assert.equal(adBudgetProblem(valid), null);
    assert.match(adBudgetProblem({ ...valid, amount: '0' }), /presupuesto/);
    assert.match(adBudgetProblem({ ...valid, clientId: '' }), /cliente/);
    assert.match(adBudgetProblem({ ...valid, kind: 'ESPECIFICA' }), /fecha/);
    assert.match(adBudgetProblem({ ...valid, kind: 'ESPECIFICA', startDate: '2026-11-10', endDate: '2026-11-01' }), /anterior/);
    assert.equal(adSpendProblem({ spent: '0', readOn: '2026-11-06' }), null, 'cero es una lectura válida');
    assert.match(adSpendProblem({ spent: '', readOn: '2026-11-06' }), /gastado/);
    assert.match(adCarryOverProblem({ carryOver: '181' }), /por qué/);
    assert.equal(adCarryOverProblem({ carryOver: '-30', reason: 'Se pasó en octubre' }), null);
    assert.match(adCampaignProblem({ name: 'X', link: 'instagram.com/p/1' }), /https/);
    assert.equal(adCampaignProblem({ name: 'X', link: 'https://www.instagram.com/p/1' }), null);
});

test('el dinero se escribe como en la plataforma, y cada moneda la suya', () => {
    assert.equal(formatAdMoney(toCents(1000000), 'COP'), '$ 1.000.000');
    assert.equal(formatAdMoney(toCents(181), 'USD'), 'USD 181');
    assert.equal(formatAdMoney(toCents(-30), 'USD'), '-USD 30');
});

test('los días se cuentan sin correrse por la zona horaria', () => {
    assert.equal(addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(daysBetween('2026-11-06', '2026-11-09'), 3);
    assert.equal(daysBetween('2026-11-09', '2026-11-06'), -3);
});
