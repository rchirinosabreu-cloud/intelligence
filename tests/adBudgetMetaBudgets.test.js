import test from 'node:test';
import assert from 'node:assert/strict';
import { metaBudgetObject, metaForecastExcess, metaForecastRecord, metaMinorToCents, projectMetaSpend } from '../src/lib/adBudgetMetaBudgets.js';

// Lo que Meta tiene configurado en las campañas de una pauta (12 de noviembre de 2026). Solo se lee: el presupuesto se
// cambia en el Administrador de anuncios de Meta (Rodny, 13 de noviembre de 2026).

const campaign = (raw, extra = {}) => metaBudgetObject({ id: 'c1', name: 'Endova · tráfico', effective_status: 'ACTIVE', ...raw }, { level: 'CAMPAIGN', currency: 'COP', ...extra });

test('Meta cuenta los pesos enteros y los dólares en centavos', () => {
    assert.equal(metaMinorToCents('35000', 'COP'), 3_500_000);
    assert.equal(metaMinorToCents('1250', 'USD'), 1250);
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

// El aviso cuando lo configurado en Meta haría pasarse la pauta: que no se pueda romper lo aprobado, tampoco desde el
// Administrador de anuncios. Se calcula en cada lectura y se guarda en el ciclo.
test('cada lectura guarda lo que gastaría la pauta con lo configurado en Meta', () => {
    const objects = [campaign({ daily_budget: '10000' }), campaign({ id: 'c2', daily_budget: '0', lifetime_budget: '0' })];
    const record = metaForecastRecord({ objects, problems: [], asOf: '2026-11-12', today: '2026-11-12', deadline: '2026-11-28', at: '2026-11-12T17:00:00Z' });
    assert.equal(record.start, '2026-11-12');
    assert.equal(record.projectedCents, 17 * 1_000_000);
    assert.deepEqual(record.objects.map((item) => [item.id, item.projectedCents]), [['c1', 17_000_000]], 'sin presupuesto propio no se guarda');
});

test('se pasaría: solo con una lectura reciente del mismo ciclo, antes del límite y por encima de la tolerancia', () => {
    const evaluation = { state: 'AL_DIA', closed: false, deadline: '2026-11-28', spentCents: 10_500_000, availableCents: 20_000_000 };
    const forecast = { on: '2026-11-12', deadline: '2026-11-28', projectedCents: 14_800_000 };
    const base = { forecast, evaluation, status: 'ACTIVA', today: '2026-11-12', currency: 'COP' };
    assert.deepEqual(metaForecastExcess(base), { totalCents: 25_300_000, overCents: 5_300_000, deadline: '2026-11-28', projectedCents: 14_800_000 });
    assert.equal(metaForecastExcess({ ...base, forecast: { ...forecast, projectedCents: 9_900_000 } }), null, 'dentro de la tolerancia de 5.000');
    assert.equal(metaForecastExcess({ ...base, today: '2026-11-15' }), null, 'una lectura de hace días ya no dice cómo está Meta');
    assert.ok(metaForecastExcess({ ...base, today: '2026-11-13' }), 'la de ayer todavía vale');
    assert.equal(metaForecastExcess({ ...base, forecast: { ...forecast, deadline: '2026-10-28' } }), null, 'otro ciclo');
    assert.equal(metaForecastExcess({ ...base, evaluation: { ...evaluation, state: 'PASADA' } }), null, 'si ya se pasó, lo dice el otro aviso');
    assert.equal(metaForecastExcess({ ...base, status: 'PAUSADA' }), null);
    assert.equal(metaForecastExcess({ ...base, today: '2026-11-29' }), null, 'pasado el límite de gasto');
    assert.equal(metaForecastExcess({ ...base, forecast: { on: '2026-11-12', problem: 'Meta no respondió' } }), null, 'sin lectura no se avisa nada');
});
