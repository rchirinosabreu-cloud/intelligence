import test from 'node:test';
import assert from 'node:assert/strict';
import {
    centsToMetaMinor, metaBudgetChange, metaBudgetObject, metaMinorToCents, projectMetaSpend
} from '../src/lib/adBudgetMetaBudgets.js';

// Ajustar el presupuesto en Meta desde Pautas (Rodny, 12 de noviembre de 2026: «no tiene sentido ajustar gasto en la
// plataforma si en Meta va a tener otro»). Un cambio que llevaría la pauta por encima de lo aprobado no se deja hacer.

const campaign = (raw, extra = {}) => metaBudgetObject({ id: 'c1', name: 'Endova · tráfico', effective_status: 'ACTIVE', ...raw }, { level: 'CAMPAIGN', currency: 'COP', ...extra });

test('Meta cuenta los pesos enteros y los dólares en centavos', () => {
    assert.equal(metaMinorToCents('35000', 'COP'), 3_500_000);
    assert.equal(metaMinorToCents('1250', 'USD'), 1250);
    assert.deepEqual(centsToMetaMinor(3_500_000, 'COP'), { minor: 35000 });
    assert.match(centsToMetaMinor(3_500_050, 'COP').problem, /centavos/);
    assert.deepEqual(centsToMetaMinor(1250, 'USD'), { minor: 1250 });
    assert.match(centsToMetaMinor(0, 'COP').problem, /mayor que cero/);
});

test('un objeto de Meta dice qué presupuesto tiene, si corre y hasta cuándo', () => {
    const daily = campaign({ daily_budget: '35000', lifetime_budget: '0' });
    assert.equal(daily.kind, 'DAILY');
    assert.equal(daily.budgetCents, 3_500_000);
    assert.equal(daily.active, true);
    const lifetime = campaign({ daily_budget: '0', lifetime_budget: '600000', budget_remaining: '200000', stop_time: '2026-11-20T23:59:00-0500' });
    assert.equal(lifetime.kind, 'LIFETIME');
    assert.equal(lifetime.lifetimeSpentCents, 40_000_000);
    assert.equal(lifetime.endDate, '2026-11-20');
    assert.equal(campaign({ daily_budget: '0', lifetime_budget: '0' }).kind, null, 'sin presupuesto en la campaña: lo llevan sus conjuntos');
    assert.equal(campaign({ daily_budget: '1000', effective_status: 'PAUSED' }).active, false);
});

test('lo que gastaría hasta el límite de gasto: diario por días, total por lo que le queda', () => {
    const objects = [
        campaign({ daily_budget: '10000' }),
        campaign({ id: 'c2', daily_budget: '0', lifetime_budget: '300000', budget_remaining: '100000', stop_time: '2026-11-12T23:00:00-0500' }),
        campaign({ id: 'c3', daily_budget: '50000', effective_status: 'PAUSED' })
    ];
    const { totalCents, byId } = projectMetaSpend({ objects, start: '2026-11-08', deadline: '2026-11-12' });
    assert.equal(byId.get('c1'), 5 * 1_000_000, 'cinco días a 10.000');
    assert.equal(byId.get('c2'), 10_000_000, 'lo que le queda, porque termina antes del límite');
    assert.equal(byId.get('c3'), 0, 'pausada no gasta');
    assert.equal(totalCents, 15_000_000);
    const longer = projectMetaSpend({ objects: [campaign({ id: 'c4', daily_budget: '0', lifetime_budget: '300000', budget_remaining: '200000', stop_time: '2026-11-21T23:00:00-0500' })], start: '2026-11-08', deadline: '2026-11-12' });
    assert.equal(longer.byId.get('c4'), 7_142_857, 'si sigue después del límite, solo la parte de estos días');
});

const pauta = { currency: 'COP', availableCents: 300_000_000, spentCents: 200_000_000, asOf: '2026-11-06', today: '2026-11-07', deadline: '2026-11-12', status: 'ACTIVA' };

test('subir el diario dentro de lo que queda se deja; pasarse no, y dice cuánto es lo máximo', () => {
    const objects = [campaign({ daily_budget: '100000' })];
    const ok = metaBudgetChange({ budget: pauta, objects, objectId: 'c1', kind: 'DAILY', newCents: 15_000_000, expectedCents: 10_000_000 });
    assert.equal(ok.problem, null);
    assert.deepEqual([ok.field, ok.minor], ['daily_budget', 150000]);
    assert.equal(ok.afterCents, 6 * 15_000_000);
    const over = metaBudgetChange({ budget: pauta, objects, objectId: 'c1', kind: 'DAILY', newCents: 20_000_000, expectedCents: 10_000_000 });
    assert.equal(over.status, 422);
    assert.match(over.problem, /quedan \$\s?1\.000\.000/);
    assert.match(over.problem, /como máximo \$\s?167\.500 diarios/, 'lo que queda más la tolerancia de 5.000, entre seis días');
    assert.match(over.problem, /sube primero el presupuesto de la pauta/);
});

test('bajar siempre se deja, aunque la pauta ya vaya pasada', () => {
    const objects = [campaign({ daily_budget: '500000' })];
    const down = metaBudgetChange({ budget: pauta, objects, objectId: 'c1', kind: 'DAILY', newCents: 40_000_000, expectedCents: 50_000_000 });
    assert.equal(down.problem, null, 'aun proyectando más de lo que queda, bajar ayuda');
});

test('lo que cambió en Meta mientras tanto, el tipo de presupuesto y el total ya gastado se avisan', () => {
    const objects = [campaign({ daily_budget: '100000' })];
    assert.equal(metaBudgetChange({ budget: pauta, objects, objectId: 'c1', kind: 'DAILY', newCents: 9_000_000, expectedCents: 8_000_000 }).status, 409);
    assert.match(metaBudgetChange({ budget: pauta, objects, objectId: 'c1', kind: 'LIFETIME', newCents: 9_000_000, expectedCents: 10_000_000 }).problem, /diario/);
    assert.equal(metaBudgetChange({ budget: pauta, objects, objectId: 'zz', kind: 'DAILY', newCents: 9_000_000, expectedCents: 10_000_000 }).status, 404);
    const lifetime = [campaign({ daily_budget: '0', lifetime_budget: '600000', budget_remaining: '200000', stop_time: '2026-11-10T23:00:00-0500' })];
    assert.match(metaBudgetChange({ budget: pauta, objects: lifetime, objectId: 'c1', kind: 'LIFETIME', newCents: 30_000_000, expectedCents: 60_000_000 }).problem, /ya gastó \$\s?400\.000/);
    assert.match(metaBudgetChange({ budget: { ...pauta, status: 'PAUSADA' }, objects, objectId: 'c1', kind: 'DAILY', newCents: 9_000_000, expectedCents: 10_000_000 }).problem, /activa/);
});

test('el gasto desde la última lectura cuenta: si se leyó hace días, se proyecta desde el día siguiente', () => {
    const objects = [campaign({ daily_budget: '100000' })];
    const fresh = metaBudgetChange({ budget: { ...pauta, asOf: '2026-11-07' }, objects, objectId: 'c1', kind: 'DAILY', newCents: 10_000_000, expectedCents: 10_000_000 });
    assert.equal(fresh.beforeCents, 6 * 10_000_000, 'leída hoy: de hoy al 12, hoy completo');
    const stale = metaBudgetChange({ budget: { ...pauta, asOf: '2026-11-03' }, objects, objectId: 'c1', kind: 'DAILY', newCents: 10_000_000, expectedCents: 10_000_000 });
    assert.equal(stale.beforeCents, 9 * 10_000_000, 'leída el 3: del 4 al 12');
});
