import test from 'node:test';
import assert from 'node:assert/strict';
import { adBudgetMetaService } from '../src/services/adBudgetMetaService.js';
import { adBudgetService } from '../src/services/adBudgetService.js';
import { createAdBudgetsDb } from './fixtures/adBudgetsMemoryDb.js';

const at = (day, hour = 15) => new Date(`${day}T${hour}:00:00Z`);
const actor = { userId: 'u-keila' };
const keila = { id: 'm-keila', name: 'Keila', role: 'Pauta', areas: ['PAUTA'], userId: 'u-keila', isActive: true };
const clients = [
    { id: 'c-hoff', name: 'Pablo Hoff', slug: 'pablo-hoff', isArchived: false, contracts: [{ startDate: '2026-01-01', cutDay: 1 }] },
    { id: 'c-bonsai', name: 'Bonsai', slug: 'bonsai', isArchived: false, contracts: [{ startDate: '2026-01-01', cutDay: 1 }] },
    { id: 'c-foob', name: 'FoobeSpain', slug: 'foobespain', isArchived: false, contracts: [{ startDate: '2026-01-01', cutDay: 1 }] }
];
const budgets = [
    { id: 'b-hoff', clientId: 'c-hoff', amount: 200000, responsibleId: 'm-keila', createdAt: at('2026-10-01') },
    { id: 'b-bonsai', clientId: 'c-bonsai', amount: 1000000, cutDay: 19, responsibleId: 'm-keila', createdAt: at('2026-10-01') },
    { id: 'b-ww', clientId: 'c-foob', brand: 'Wine & Wonder', currency: 'USD', amount: 100, responsibleId: 'm-keila', createdAt: at('2026-10-01') }
];
const ACCOUNTS = [
    { id: '273405029', name: 'Francisco Villa', currency: 'COP', isActive: true },
    { id: '323231997523552', name: 'BONSAI', currency: 'COP', isActive: true },
    { id: '1991796371377407', name: 'Wine & Wonder', currency: 'USD', isActive: true },
    { id: '510521474077213', name: 'Carrascal Contadores', currency: 'COP', isActive: false }
];
// Lo que Meta gasta por campaña en cada día del ciclo: una cifra fija por día es suficiente para comprobar las ventanas.
const CAMPAIGNS = {
    '273405029': [{ id: '1001', name: 'PABLO HOFF- MENSAJES INSCRIPCIONES', perDay: 8000 }, { id: '1002', name: 'PABLO HOFF-  NUEVA SEDE', perDay: 2000 }, { id: '1003', name: 'NEW PUEBLITO  MENSAJES NOV 2026', perDay: 11000 }],
    '323231997523552': [{ id: '2001', name: 'BONSAI SEPTIEMBRE 2026', perDay: 27000 }],
    '1991796371377407': [{ id: '3001', name: 'ANUNCIO VISITAS AL PERFIL NOVIEMBRE 2026', perDay: 5.62 }]
};
const days = (since, until) => Math.round((new Date(`${until}T12:00:00Z`) - new Date(`${since}T12:00:00Z`)) / 86_400_000) + 1;

const fakeMeta = ({ failAccount = null, calls = [] } = {}) => ({
    listAdAccounts: async () => ACCOUNTS,
    campaignSpend: async ({ adAccountId, since, until, campaignIds }) => {
        calls.push({ adAccountId, since, until, campaignIds });
        if (adAccountId === failAccount) throw Object.assign(new Error('Too many calls'), { name: 'MetaGraphError', code: 17 });
        return (CAMPAIGNS[adAccountId] || [])
            .filter((row) => !campaignIds || campaignIds.includes(row.id))
            .map((row) => ({ id: row.id, name: row.name, spend: Math.round(row.perDay * days(since, until) * 100) / 100 }));
    }
});

const setup = ({ day = '2026-11-12', meta = fakeMeta(), token = 'llave' } = {}) => {
    const db = createAdBudgetsDb({ clients, team: [keila], users: [{ id: 'u-keila', name: 'Keila', isActive: true }], budgets: budgets.map((row) => ({ ...row })) });
    const options = { meta, token: () => token, clock: () => at(day), log: () => {} };
    return { db, metaService: adBudgetMetaService(db, options), budgetService: adBudgetService(db, { clock: () => at(day) }) };
};

test('la lectura descubre las cuentas activas y lo que gastó cada campaña en los últimos 30 días', async () => {
    const calls = [];
    const { metaService } = setup({ meta: fakeMeta({ calls }) });
    const result = await metaService.run();
    assert.equal(result.accounts, 4);
    assert.equal(calls.some((call) => call.adAccountId === '510521474077213'), false, 'una cuenta inactiva no se consulta');
    assert.deepEqual(calls.find((call) => call.adAccountId === '273405029'), { adAccountId: '273405029', since: '2026-10-14', until: '2026-11-12', campaignIds: undefined });
    const overview = await metaService.overview();
    assert.equal(overview.campaigns.length, 5);
    assert.equal(overview.unassigned[0].name, 'BONSAI SEPTIEMBRE 2026', 'lo que más gastó primero');
    assert.equal(overview.unassigned[0].spend30Cents, 81_000_000);
    assert.ok(overview.lastSyncAt);
});

test('ligar campañas a una pauta escribe su gasto de Meta como una lectura más, en los días de su ciclo', async () => {
    const calls = [];
    const { metaService, budgetService, db } = setup({ meta: fakeMeta({ calls }) });
    await metaService.run();
    const result = await metaService.assign('b-hoff', ['1001', '1002'], actor);
    assert.equal(result.added, 2);
    const last = calls.at(-1);
    assert.deepEqual({ ...last, campaignIds: [...last.campaignIds].sort() }, { adAccountId: '273405029', since: '2026-11-01', until: '2026-11-12', campaignIds: ['1001', '1002'] });
    const detail = await budgetService.detail('b-hoff');
    assert.equal(detail.evaluation.spentCents, 12_000_000, '12 días a 10.000');
    assert.equal(detail.meta.linked, true);
    assert.equal(detail.meta.source, 'META');
    assert.equal(detail.meta.detail.length, 2);
    assert.equal(detail.history[0].readings[0].source, 'META');
    assert.equal(detail.history[0].readings[0].recordedBy, null);
    assert.match(db.store.events.at(-1).summary, /^Campañas de Meta: ligó /);
    assert.match(db.store.events.at(-1).summary, /«PABLO HOFF- MENSAJES INSCRIPCIONES»/);
    assert.match(db.store.events.at(-1).summary, /«PABLO HOFF-  NUEVA SEDE»/);
});

test('la siguiente lectura del mismo día actualiza la misma lectura en vez de sumar otra', async () => {
    let day = '2026-11-12';
    const db = createAdBudgetsDb({ clients, team: [keila], budgets: budgets.map((row) => ({ ...row })) });
    const service = adBudgetMetaService(db, { meta: fakeMeta(), token: () => 'llave', clock: () => at(day), log: () => {} });
    await service.run();
    await service.assign('b-hoff', ['1001'], actor);
    CAMPAIGNS['273405029'][0].perDay = 9000;
    try {
        await service.run();
        assert.equal(db.store.readings.filter((row) => row.source === 'META').length, 1);
        assert.equal(Number(db.store.readings[0].spent), 108_000);
        day = '2026-11-13';
        await service.run();
        assert.equal(db.store.readings.filter((row) => row.source === 'META').length, 2, 'un día nuevo deja su propia lectura');
    } finally {
        CAMPAIGNS['273405029'][0].perDay = 8000;
    }
});

test('lo que escribió una persona ese día manda, y la diferencia queda a la vista', async () => {
    const { metaService, budgetService } = setup();
    await metaService.run();
    await budgetService.recordSpend('b-bonsai', { spent: '687798', readOn: '2026-11-12' }, actor);
    await metaService.assign('b-bonsai', ['2001'], actor);
    const detail = await budgetService.detail('b-bonsai');
    assert.equal(detail.evaluation.spentCents, 68_779_800, 'la cifra de Keila sigue vigente');
    assert.equal(detail.meta.spentCents, 67_500_000, '25 días del ciclo del 19');
    assert.equal(detail.meta.difference.cents, 1_279_800);
    assert.equal(detail.meta.asOf, '2026-11-12');
});

test('una campaña es de una sola pauta, en su moneda, y soltarla no borra el historial', async () => {
    const { metaService, budgetService, db } = setup();
    await metaService.run();
    await metaService.assign('b-hoff', ['1001'], actor);
    await assert.rejects(metaService.assign('b-bonsai', ['1001'], actor), (error) => error.statusCode === 409 && /ya es de la pauta Pablo Hoff/.test(error.message));
    await assert.rejects(metaService.assign('b-ww', ['1003'], actor), /está en COP y la pauta en USD/);
    await assert.rejects(metaService.assign('b-hoff', ['999999'], actor), /no se ha leído de Meta/);
    await metaService.assign('b-hoff', [], actor);
    assert.equal(db.store.metaCampaigns.find((row) => row.id === '1001').budgetId, null);
    assert.equal(db.store.readings.length, 1, 'la lectura que ya escribió Meta se queda');
    const detail = await budgetService.detail('b-hoff');
    assert.equal(detail.meta.linked, false);
    assert.match(detail.changes[0].summary, /soltó «PABLO HOFF- MENSAJES INSCRIPCIONES»/);
});

test('una cuenta que falla conserva lo que había y dice por qué; un ciclo que falla no inventa gasto', async () => {
    const { metaService, budgetService, db } = setup();
    await metaService.run();
    await metaService.assign('b-hoff', ['1001'], actor);
    const failing = adBudgetMetaService(db, { meta: fakeMeta({ failAccount: '273405029' }), token: () => 'llave', clock: () => at('2026-11-13'), log: () => {} });
    const result = await failing.run();
    assert.equal(result.failures, 1);
    const overview = await failing.overview();
    assert.match(overview.accounts.find((row) => row.id === '273405029').problem, /\S/);
    assert.equal(overview.campaigns.find((row) => row.id === '1001').spend30Cents, 24_000_000, 'el gasto anterior no se borra');
    const detail = await budgetService.detail('b-hoff');
    assert.ok(detail.meta.problem);
    assert.equal(detail.evaluation.spentCents, 9_600_000, 'sigue la lectura del día anterior');
});

test('pasado el cierre, Meta lee unos días el ciclo anterior sin cerrarlo: el gasto final lo confirma una persona', async () => {
    const { metaService, budgetService, db } = setup({ day: '2026-11-20' });
    await metaService.run();
    await budgetService.recordSpend('b-bonsai', { spent: '500000', readOn: '2026-11-10', cycleKey: '2026-10' }, actor);
    await metaService.assign('b-bonsai', ['2001'], actor);
    const previous = db.store.cycles.find((row) => row.budgetId === 'b-bonsai' && row.cycleKey === '2026-10');
    assert.equal(previous.spentAsOf, '2026-11-18');
    assert.equal(Number(previous.spent), 837_000, '31 días del 19 de octubre al 18 de noviembre');
    assert.equal(previous.closedAt, null);
    const current = db.store.cycles.find((row) => row.budgetId === 'b-bonsai' && row.cycleKey === '2026-11');
    assert.equal(Number(current.spent), 54_000);
});

test('se proponen las campañas con el nombre del cliente, y lo descartado deja de estar pendiente', async () => {
    const { metaService } = setup();
    await metaService.run();
    assert.deepEqual((await metaService.suggestions('b-hoff')).suggested.sort(), ['1001', '1002']);
    assert.deepEqual((await metaService.suggestions('b-ww')).suggested, ['3001']);
    await metaService.setIgnored('1003', true, actor);
    assert.equal((await metaService.overview()).unassigned.some((row) => row.id === '1003'), false);
    await metaService.setIgnored('1003', false, actor);
    assert.equal((await metaService.overview()).unassigned.some((row) => row.id === '1003'), true);
});

test('sin la llave de Meta no se lee nada y se dice en palabras', async () => {
    const { metaService } = setup({ token: '' });
    assert.deepEqual(await metaService.run(), { configured: false, accounts: 0, failures: 0, budgets: [] });
    await assert.rejects(metaService.syncNow(), (error) => error.statusCode === 503 && /no está configurada/.test(error.message));
    assert.equal((await metaService.overview()).configured, false);
});
