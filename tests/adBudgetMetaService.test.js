import test from 'node:test';
import assert from 'node:assert/strict';
import { adBudgetMetaService } from '../src/services/adBudgetMetaService.js';
import { adBudgetService } from '../src/services/adBudgetService.js';
import { createAdBudgetsDb } from './fixtures/adBudgetsMemoryDb.js';
import { adNoticeStillNeeded, runAdBudgetAlerts } from '../src/services/adBudgetNoticeService.js';

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

const setup = ({ day = '2026-11-12', meta = fakeMeta(), token = 'llave', budgetClient = undefined } = {}) => {
    const db = createAdBudgetsDb({ clients, team: [keila], users: [{ id: 'u-keila', name: 'Keila', isActive: true, role: 'EDITOR', modulePermissions: { pautas: true, pautas_editar: true } }], budgets: budgets.map((row) => ({ ...row })) });
    const options = { meta, token: () => token, clock: () => at(day), log: () => {}, ...(budgetClient ? { budgetClient } : {}) };
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

// Ajustar el presupuesto en Meta (12 de noviembre de 2026). Un Meta de mentira con la campaña 1001 a 3.000 diarios y la 1002
// sin presupuesto propio: lo lleva su conjunto, a 1.000 diarios.
const fakeBudgets = ({ fail = null, refuse = null } = {}) => {
    const state = {
        '1001': { id: '1001', name: 'PABLO HOFF- MENSAJES INSCRIPCIONES', effective_status: 'ACTIVE', daily_budget: '3000', lifetime_budget: '0' },
        '1002': { id: '1002', name: 'PABLO HOFF-  NUEVA SEDE', effective_status: 'ACTIVE', daily_budget: '0', lifetime_budget: '0' },
        'as-1': { id: 'as-1', name: 'Sede · Cartagena', effective_status: 'ACTIVE', daily_budget: '1000', lifetime_budget: '0', campaign_id: '1002' }
    };
    const writes = [];
    return {
        state, writes,
        readCampaignBudgets: async ({ campaignIds }) => campaignIds.flatMap((id) => {
            if (id === fail) return [{ campaignId: id, error: Object.assign(new Error('Unsupported get request'), { name: 'MetaGraphError', code: 100 }) }];
            const campaign = state[id];
            if (Number(campaign.daily_budget) || Number(campaign.lifetime_budget)) return [{ campaignId: id, level: 'CAMPAIGN', raw: { ...campaign } }];
            return Object.values(state).filter((row) => row.campaign_id === id).map((raw) => ({ campaignId: id, level: 'ADSET', raw: { ...raw } }));
        }),
        setBudget: async ({ objectId, field, minor }) => {
            if (refuse) throw Object.assign(new Error(refuse.message), { name: 'MetaGraphError', code: refuse.code });
            writes.push({ objectId, field, minor });
            state[objectId][field] = String(minor);
            return { success: true };
        }
    };
};

const linkedHoff = async (budgetClient) => {
    const env = setup({ budgetClient });
    await env.metaService.run();
    await env.metaService.assign('b-hoff', ['1001', '1002'], actor);
    return env;
};

test('los presupuestos de Meta de una pauta: el de la campaña o el de sus conjuntos, con lo que gastaría hasta el límite', async () => {
    const client = fakeBudgets();
    const { metaService } = await linkedHoff(client);
    const view = await metaService.metaBudgets('b-hoff');
    assert.equal(view.budget.availableCents, 20_000_000);
    assert.equal(view.budget.spentCents, 12_000_000, '10.000 diarios durante 12 días, leído de Meta');
    assert.equal(view.budget.deadline, '2026-11-28');
    assert.deepEqual(view.objects.map((item) => [item.id, item.level, item.kind, item.budgetCents, item.projectedCents]).sort(), [
        ['1001', 'CAMPAIGN', 'DAILY', 300_000, 300_000 * 17],
        ['as-1', 'ADSET', 'DAILY', 100_000, 100_000 * 17]
    ]);
    assert.equal(view.projectedCents, 6_800_000);
});

test('subir dentro de lo aprobado cambia Meta, lo confirma y queda en el historial con quién lo hizo', async () => {
    const client = fakeBudgets();
    const { metaService, db } = await linkedHoff(client);
    const result = await metaService.adjustBudget('b-hoff', { objectId: '1001', kind: 'DAILY', amount: '4000', expectedCents: 300_000 }, actor);
    assert.deepEqual(client.writes, [{ objectId: '1001', field: 'daily_budget', minor: 4000 }]);
    assert.equal(result.confirmed, true);
    const event = db.store.events.find((row) => row.action === 'META_PRESUPUESTO');
    assert.equal(event.actorId, 'u-keila');
    assert.match(event.summary, /Presupuesto diario en Meta de «PABLO HOFF- MENSAJES INSCRIPCIONES»: de \$\s?3\.000 a \$\s?4\.000/);
    assert.deepEqual([event.before.cents, event.after.cents], [300_000, 400_000]);
});

test('pasarse de lo aprobado no llega a Meta y dice el máximo; un cambio hecho en Meta mientras tanto tampoco', async () => {
    const client = fakeBudgets();
    const { metaService } = await linkedHoff(client);
    await assert.rejects(metaService.adjustBudget('b-hoff', { objectId: '1001', kind: 'DAILY', amount: '4200', expectedCents: 300_000 }, actor), (error) => {
        assert.equal(error.statusCode, 422);
        assert.match(error.message, /como máximo \$\s?4\.000 diarios/);
        return true;
    });
    client.state['1001'].daily_budget = '3500';
    await assert.rejects(metaService.adjustBudget('b-hoff', { objectId: '1001', kind: 'DAILY', amount: '3800', expectedCents: 300_000 }, actor), (error) => error.statusCode === 409 && /ahora es \$\s?3\.500/.test(error.message));
    await assert.rejects(metaService.adjustBudget('b-hoff', { objectId: '2001', kind: 'DAILY', amount: '100', expectedCents: 0 }, actor), (error) => error.statusCode === 404, 'una campaña de otra pauta no se toca');
    assert.deepEqual(client.writes, []);
});

test('el conjunto de una campaña se ajusta; si Meta no acepta, se dice con sus palabras y no se anota', async () => {
    const client = fakeBudgets();
    const { metaService, db } = await linkedHoff(client);
    const result = await metaService.adjustBudget('b-hoff', { objectId: 'as-1', kind: 'DAILY', amount: '1500', expectedCents: 100_000 }, actor);
    assert.match(result.summary, /del conjunto «Sede · Cartagena»/);

    const refusing = fakeBudgets({ refuse: { code: 200, message: 'Permissions error' } });
    const second = await linkedHoff(refusing);
    await assert.rejects(second.metaService.adjustBudget('b-hoff', { objectId: '1001', kind: 'DAILY', amount: '3500', expectedCents: 300_000 }, actor), (error) => error.statusCode === 502 && /permiso para administrar sus campañas/.test(error.message));
    assert.equal(second.db.store.events.filter((row) => row.action === 'META_PRESUPUESTO').length, 0);
    assert.equal(db.store.events.filter((row) => row.action === 'META_PRESUPUESTO').length, 1);
});

test('sin llave de Meta no se ajusta nada', async () => {
    const { metaService } = setup({ token: '', budgetClient: fakeBudgets() });
    await assert.rejects(metaService.metaBudgets('b-hoff'), (error) => error.statusCode === 503);
    await assert.rejects(metaService.adjustBudget('b-hoff', { objectId: '1001', kind: 'DAILY', amount: '1', expectedCents: 1 }, actor), (error) => error.statusCode === 503);
});
test('si lo configurado en Meta haría pasarse la pauta, a quien la lleva le llega a la banda; bajarlo lo quita', async () => {
    const client = fakeBudgets();
    client.state['1001'].daily_budget = '6000';
    const { metaService, db } = await linkedHoff(client);
    const cycle = db.store.cycles.find((row) => row.budgetId === 'b-hoff' && row.cycleKey === '2026-11');
    assert.equal(cycle.metaForecast.projectedCents, (600_000 + 100_000) * 17, 'la lectura guardó lo que gastaría');
    assert.equal(cycle.metaForecast.deadline, '2026-11-28');

    // Solo esta pauta activa: con más de tres avisos de la misma persona saldría el resumen.
    for (const row of db.store.budgets) if (row.id !== 'b-hoff') row.status = 'PAUSADA';
    await runAdBudgetAlerts(db, { now: at('2026-11-12'), notify: async () => {}, log: () => {}, info: () => {} });
    const notice = db.store.notices.find((row) => row.kind === 'PAUTA_META');
    assert.equal(notice.userId, 'u-keila');
    assert.equal(notice.level, 'IMPORTANTE');
    assert.match(notice.message, /Con lo configurado en Meta gastaría unos \$\s?239\.000 de \$\s?200\.000 hasta el 28 nov/);
    assert.match(notice.url, /pauta=b-hoff&meta=presupuesto/);

    await metaService.adjustBudget('b-hoff', { objectId: '1001', kind: 'DAILY', amount: '3000', expectedCents: 600_000 }, actor);
    assert.deepEqual(await adNoticeStillNeeded(db, notice, at('2026-11-12')), { reason: 'PAUTA_ATENDIDA', subject: 'Pablo Hoff' }, 'bajarlo desde la plataforma lo resuelve en el acto');
});

test('un cambio hecho en el Administrador de anuncios se ve en la siguiente lectura', async () => {
    const client = fakeBudgets();
    const { metaService, db } = await linkedHoff(client);
    const cycle = () => db.store.cycles.find((row) => row.budgetId === 'b-hoff' && row.cycleKey === '2026-11');
    assert.equal(cycle().metaForecast.projectedCents, 400_000 * 17);
    client.state['1001'].daily_budget = '8000';
    await metaService.syncBudgets({ budgetId: 'b-hoff' });
    assert.equal(cycle().metaForecast.projectedCents, 900_000 * 17);
    const board = await (await import('../src/services/adBudgetService.js')).adBudgetService(db, { clock: () => at('2026-11-12') }).list();
    const hoff = board.budgets.find((row) => row.id === 'b-hoff');
    assert.equal(hoff.meta.excess.totalCents, 12_000_000 + 900_000 * 17);
});