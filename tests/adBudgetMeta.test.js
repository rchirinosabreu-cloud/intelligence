import test from 'node:test';
import assert from 'node:assert/strict';
import {
    META_FINAL_GRACE_DAYS, metaCampaignIdsProblem, metaCyclesToSync, metaDifference, metaReadingAction, metaSpendWindow, suggestMetaCampaigns, unassignedMetaCampaigns
} from '../src/lib/adBudgetMeta.js';

const cycle = { key: '2026-10', start: '2026-10-19', end: '2026-11-18' };

test('la ventana va del inicio del ciclo a hoy, y nunca pasa del cierre', () => {
    assert.deepEqual(metaSpendWindow(cycle, '2026-11-12'), { since: '2026-10-19', until: '2026-11-12' });
    assert.deepEqual(metaSpendWindow(cycle, '2026-11-25'), { since: '2026-10-19', until: '2026-11-18' });
    assert.equal(metaSpendWindow(cycle, '2026-10-10'), null, 'un ciclo que no empezó no tiene gasto que leer');
});

test('se lee el ciclo en curso y, unos días tras su cierre, el anterior que nadie cerró', () => {
    const previous = { key: '2026-09', start: '2026-09-19', end: '2026-10-18' };
    assert.deepEqual(metaCyclesToSync({ current: cycle, previous, previousClosed: false, today: '2026-10-20' }).map((item) => item.key), ['2026-10', '2026-09']);
    assert.deepEqual(metaCyclesToSync({ current: cycle, previous, previousClosed: true, today: '2026-10-20' }).map((item) => item.key), ['2026-10']);
    const late = `2026-10-${18 + META_FINAL_GRACE_DAYS + 1}`;
    assert.deepEqual(metaCyclesToSync({ current: cycle, previous, previousClosed: false, today: late }).map((item) => item.key), ['2026-10'], 'pasado el margen, el gasto final es de una persona');
});

const reading = (over) => ({ id: 'r', readOn: '2026-11-12', spent: 100, source: 'MANUAL', createdAt: new Date('2026-11-12T15:00:00Z'), ...over });

test('Meta escribe una lectura por día y la actualiza durante el día', () => {
    assert.deepEqual(metaReadingAction({ readings: [], metaCents: 50_000, readOn: '2026-11-12' }), { action: 'CREATE' });
    const ofToday = reading({ id: 'm1', source: 'META', spent: 400 });
    assert.deepEqual(metaReadingAction({ readings: [ofToday], metaCents: 50_000, readOn: '2026-11-12' }), { action: 'UPDATE', readingId: 'm1' });
    assert.equal(metaReadingAction({ readings: [ofToday], metaCents: 40_000, readOn: '2026-11-12' }).action, 'SKIP', 'misma cifra, nada que escribir');
    const yesterday = reading({ id: 'm0', source: 'META', readOn: '2026-11-11', spent: 500 });
    assert.deepEqual(metaReadingAction({ readings: [yesterday], metaCents: 50_000, readOn: '2026-11-12' }), { action: 'CREATE' }, 'un día nuevo deja su lectura aunque la cifra no cambie');
});

test('lo que escribió una persona ese día no lo pisa Meta, y un ciclo cerrado no se toca', () => {
    const manual = reading({ source: 'MANUAL', spent: 700 });
    assert.deepEqual(metaReadingAction({ readings: [manual], metaCents: 50_000, readOn: '2026-11-12' }), { action: 'SKIP', reason: 'MANUAL' });
    const older = reading({ source: 'MANUAL', readOn: '2026-11-10' });
    assert.equal(metaReadingAction({ readings: [older], metaCents: 50_000, readOn: '2026-11-12' }).action, 'CREATE');
    assert.deepEqual(metaReadingAction({ readings: [], metaCents: 1, readOn: '2026-11-12', closed: true }), { action: 'SKIP', reason: 'CERRADO' });
});

test('la diferencia se dice solo cuando la cifra vigente la escribió una persona y pasa la tolerancia', () => {
    assert.equal(metaDifference({ currency: 'COP', spentCents: 68_779_800, source: 'MANUAL', metaCents: 66_910_800 }).cents, 1_869_000);
    assert.equal(metaDifference({ currency: 'COP', spentCents: 12_261_200, source: 'MANUAL', metaCents: 12_262_600 }), null, 'catorce pesos no son una diferencia');
    assert.equal(metaDifference({ currency: 'COP', spentCents: 1, source: 'META', metaCents: 9_000_000 }), null);
    assert.equal(metaDifference({ currency: 'USD', spentCents: 6_995, source: 'MANUAL', metaCents: null }), null);
});

const campaigns = [
    { id: '1', name: 'PABLO HOFF- MENSAJES', accountName: 'Francisco Villa', budgetId: null, spend30Cents: 100 },
    { id: '2', name: 'PABLO HOFF-  NUEVA SEDE', accountName: 'Francisco Villa', budgetId: null, spend30Cents: 100 },
    { id: '3', name: 'NEW PUEBLITO  MENSAJES NOV 2026', accountName: 'Francisco Villa', budgetId: null, spend30Cents: 100 },
    { id: '4', name: 'ANUNCIO VISITAS AL PERFIL NOVIEMBRE 2026', accountName: 'Wine & Wonder', budgetId: null, spend30Cents: 100 },
    { id: '5', name: 'WINE SUMMIT | TRAFICO NOV 2026', accountName: 'Wine & Wonder', budgetId: null, spend30Cents: 100 },
    { id: '6', name: 'PABLO HOFF VIEJA', accountName: 'Francisco Villa', budgetId: 'otra', spend30Cents: 100 },
    { id: '7', name: 'PABLO HOFF IGNORADA', accountName: 'Francisco Villa', budgetId: null, ignoredAt: new Date(), spend30Cents: 100 }
];

test('se proponen las campañas que llevan el nombre del cliente o de la marca, sin tocar lo de otra pauta', () => {
    assert.deepEqual(suggestMetaCampaigns({ client: { name: 'Pablo Hoff' } }, campaigns), ['1', '2']);
    assert.deepEqual(suggestMetaCampaigns({ client: { name: 'New  Pueblito' } }, campaigns), ['3'], 'los espacios dobles no estorban');
});

test('en la cuenta de una marca se propone lo suyo, salvo lo que nombra a otra marca', () => {
    const others = [{ client: { name: 'FoobeSpain' }, brand: 'Wine Summit' }];
    assert.deepEqual(suggestMetaCampaigns({ client: { name: 'FoobeSpain' }, brand: 'Wine & Wonder' }, campaigns, others), ['4']);
    assert.deepEqual(suggestMetaCampaigns({ client: { name: 'FoobeSpain' }, brand: 'Wine Summit' }, campaigns, []), ['5']);
});

test('sin asignar: lo que gastó en los últimos 30 días y nadie ligó ni descartó, lo que más gastó primero', () => {
    const rows = [...campaigns, { id: '8', name: 'Cero', accountName: 'X', budgetId: null, spend30Cents: 0 }, { id: '9', name: 'Grande', accountName: 'X', budgetId: null, spend30Cents: 900 }];
    assert.deepEqual(unassignedMetaCampaigns(rows).map((row) => row.id), ['9', '1', '2', '3', '4', '5']);
});

test('la lista que se liga a una pauta se valida antes de escribir', () => {
    assert.equal(metaCampaignIdsProblem(['1', '2']), null);
    assert.equal(metaCampaignIdsProblem([]), null, 'una lista vacía suelta todas');
    assert.match(metaCampaignIdsProblem('1'), /lista/);
    assert.match(metaCampaignIdsProblem(['1', '1']), /repetida/);
    assert.match(metaCampaignIdsProblem(['abc']), /campaña de Meta/);
    assert.match(metaCampaignIdsProblem(Array.from({ length: 51 }, (_, i) => String(i + 1))), /50/);
});
