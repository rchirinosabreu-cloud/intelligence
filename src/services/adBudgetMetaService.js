// Pautas conectadas a Meta (Rodny, 12 de noviembre de 2026). Dos trabajos, los dos de solo lectura en Meta:
//
// 1. **Descubrir**: las cuentas publicitarias que ve la llave de la plataforma y las campañas que gastaron en los últimos 30
//    días. Así se ve qué campaña es de qué pauta y qué gasto no está en ninguna.
// 2. **Leer el gasto** de cada pauta con campañas ligadas, en los días de su ciclo, y dejarlo como una lectura más marcada
//    «Meta». Lo que una persona escribió ese día manda (`metaReadingAction`).
//
// Un fallo de Meta nunca borra lo que ya había: se anota en la cuenta o en el ciclo y la pantalla lo dice.
import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { adBudgetName, adCycleFor, budgetCutDay, cycleFromKey, previousCycleKey, addDays } from '../lib/adBudgets.js';
import {
    META_DISCOVERY_DAYS, META_SYNC_EVERY_HOURS, metaCampaignIdsProblem, metaCyclesToSync, metaReadingAction, metaSpendWindow, suggestMetaCampaigns, unassignedMetaCampaigns
} from '../lib/adBudgetMeta.js';
import { humanizeMetaReadError } from '../lib/metaReportSources.js';
import { metaInsightsService } from './metaInsightsService.js';
import { AD_BUDGET_INCLUDE, bogotaToday, ensureAdCycle, syncAdCycle } from './adBudgetService.js';

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const actorId = (actor) => actor?.userId || actor?.id || null;
const cents = (value) => Math.round((Number(value) || 0) * 100);
const MIN_MANUAL_SYNC_MS = 60 * 1000;

const publicCampaign = (row, budgets) => {
    const budget = row.budgetId ? budgets.get(row.budgetId) : null;
    return {
        id: row.id, name: row.name, adAccountId: row.adAccountId, accountName: row.accountName, currency: row.currency || null,
        spend30Cents: cents(row.spend30), seenAt: row.seenAt || null, budgetId: row.budgetId || null,
        budgetName: budget ? adBudgetName(budget) : null, ignored: Boolean(row.ignoredAt)
    };
};

export const adBudgetMetaService = (db = prisma, {
    meta = metaInsightsService,
    token = () => process.env.META_SYSTEM_USER_TOKEN || '',
    clock = () => new Date(),
    log = console.error
} = {}) => {
    const configured = () => Boolean(token());
    let running = null;

    /** Cuentas y campañas de los últimos 30 días. Una cuenta que falla conserva lo que había y dice por qué. */
    const discover = async () => {
        const key = token();
        const now = clock();
        const until = bogotaToday(now);
        const since = addDays(until, -(META_DISCOVERY_DAYS - 1));
        const accounts = await meta.listAdAccounts(key);
        let failures = 0;
        for (const account of accounts) {
            const base = { name: account.name, currency: account.currency || null, isActive: account.isActive !== false };
            if (!base.isActive) {
                await db.adMetaAccount.upsert({ where: { id: account.id }, create: { id: account.id, ...base }, update: base });
                continue;
            }
            try {
                const rows = await meta.campaignSpend({ adAccountId: account.id, token: key, since, until });
                const seen = new Set(rows.map((row) => row.id));
                for (const row of rows) {
                    const data = { adAccountId: account.id, accountName: account.name, currency: account.currency || null, name: row.name, spend30: row.spend, seenAt: now };
                    await db.adMetaCampaign.upsert({ where: { id: row.id }, create: { id: row.id, ...data }, update: data });
                }
                await db.adMetaCampaign.updateMany({ where: { adAccountId: account.id, id: { notIn: [...seen] } }, data: { spend30: 0 } });
                await db.adMetaAccount.upsert({ where: { id: account.id }, create: { id: account.id, ...base, fetchedAt: now }, update: { ...base, fetchedAt: now, problem: null } });
            } catch (error) {
                failures += 1;
                const problem = humanizeMetaReadError(error);
                await db.adMetaAccount.upsert({ where: { id: account.id }, create: { id: account.id, ...base, problem }, update: { ...base, problem } });
            }
        }
        return { accounts: accounts.length, failures };
    };

    /** El gasto de una pauta en un ciclo: la suma de sus campañas en los días del ciclo, cuenta por cuenta. */
    const readCycle = async (budget, cycle, window) => {
        const key = token();
        const byAccount = new Map();
        for (const campaign of budget.metaCampaigns) {
            if (!byAccount.has(campaign.adAccountId)) byAccount.set(campaign.adAccountId, []);
            byAccount.get(campaign.adAccountId).push(campaign);
        }
        const mismatch = budget.metaCampaigns.find((campaign) => campaign.currency && campaign.currency !== budget.currency);
        if (mismatch) return { problem: `«${mismatch.name}» está en ${mismatch.currency} y la pauta en ${budget.currency}: no se suman.` };
        const detail = [];
        for (const [adAccountId, campaigns] of byAccount) {
            const rows = await meta.campaignSpend({ adAccountId, token: key, since: window.since, until: window.until, campaignIds: campaigns.map((item) => item.id) });
            const spentOf = new Map(rows.map((row) => [row.id, row.spend]));
            for (const campaign of campaigns) detail.push({ id: campaign.id, name: campaign.name, accountName: campaign.accountName, spendCents: cents(spentOf.get(campaign.id) || 0) });
        }
        return { detail, totalCents: detail.reduce((sum, item) => sum + item.spendCents, 0) };
    };

    /** Lee las pautas con campañas ligadas y escribe su lectura de Meta. Devuelve qué hizo con cada una. */
    const syncBudgets = async ({ budgetId = null } = {}) => {
        const now = clock();
        const today = bogotaToday(now);
        const budgets = await db.adBudget.findMany({ where: { ...(budgetId ? { id: budgetId } : {}), status: 'ACTIVA' }, include: AD_BUDGET_INCLUDE });
        const results = [];
        for (const budget of budgets) {
            if (budget.client?.isArchived || !budget.metaCampaigns?.length) continue;
            const { cutDay } = budgetCutDay(budget, today);
            const current = adCycleFor(budget, { cutDay, today });
            const previousKey = budget.kind === 'ESPECIFICA' ? null : previousCycleKey(current.key, cutDay);
            const previous = previousKey ? cycleFromKey(previousKey, cutDay) : null;
            const previousRow = previousKey ? (budget.cycles || []).find((row) => row.cycleKey === previousKey) : null;
            const cycles = metaCyclesToSync({ current, previous, previousClosed: Boolean(previousRow?.closedAt) || !previousRow, today });
            for (const cycle of cycles) {
                const window = metaSpendWindow(cycle, today);
                if (!window) continue;
                let read;
                try {
                    read = await readCycle(budget, cycle, window);
                } catch (error) {
                    read = { problem: humanizeMetaReadError(error) };
                }
                const result = await db.$transaction(async (tx) => {
                    const row = await ensureAdCycle(tx, budget, cycle);
                    if (read.problem) {
                        await tx.adBudgetCycle.update({ where: { id: row.id }, data: { metaProblem: read.problem, metaFetchedAt: now } });
                        return { action: 'SKIP', reason: 'PROBLEMA', problem: read.problem };
                    }
                    await tx.adBudgetCycle.update({ where: { id: row.id }, data: { metaSpent: read.totalCents / 100, metaSpentAsOf: window.until, metaFetchedAt: now, metaDetail: read.detail, metaProblem: null } });
                    const readings = await tx.adSpendReading.findMany({ where: { cycleId: row.id }, orderBy: [{ readOn: 'desc' }, { createdAt: 'desc' }] });
                    const decision = metaReadingAction({ readings, metaCents: read.totalCents, readOn: window.until, closed: Boolean(row.closedAt) });
                    if (decision.action === 'CREATE') {
                        await tx.adSpendReading.create({ data: { id: randomUUID(), cycleId: row.id, readOn: window.until, spent: read.totalCents / 100, isFinal: false, source: 'META', recordedById: null } });
                    } else if (decision.action === 'UPDATE') {
                        await tx.adSpendReading.update({ where: { id: decision.readingId }, data: { spent: read.totalCents / 100 } });
                    }
                    if (decision.action !== 'SKIP') await syncAdCycle(tx, row.id, now);
                    return { ...decision, totalCents: read.totalCents };
                });
                results.push({ budgetId: budget.id, name: adBudgetName(budget), cycleKey: cycle.key, ...result });
            }
        }
        return results;
    };

    /** La lectura completa. Dos pedidos a la vez comparten el mismo trabajo. */
    const run = async () => {
        if (!configured()) return { configured: false, accounts: 0, failures: 0, budgets: [] };
        if (running) return running;
        running = (async () => {
            const found = await discover();
            const budgets = await syncBudgets();
            return { configured: true, ...found, budgets };
        })();
        try {
            return await running;
        } finally {
            running = null;
        }
    };

    const lastSyncAt = async () => {
        const [latest] = await db.adMetaAccount.findMany({ where: { fetchedAt: { not: null } }, orderBy: { fetchedAt: 'desc' }, take: 1 });
        return latest?.fetchedAt || null;
    };

    const budgetsById = async () => {
        const rows = await db.adBudget.findMany({ include: { client: { select: { id: true, name: true } } } });
        return new Map(rows.map((row) => [row.id, row]));
    };

    return {
        configured,
        run,
        syncBudgets,

        /** Todo lo que la pantalla necesita para ligar campañas y ver lo que gasta sin pauta. */
        async overview() {
            const [accounts, campaigns, budgets, last] = await Promise.all([
                db.adMetaAccount.findMany({ orderBy: { name: 'asc' } }),
                db.adMetaCampaign.findMany({ orderBy: { name: 'asc' } }),
                budgetsById(),
                lastSyncAt()
            ]);
            const list = campaigns.map((row) => publicCampaign(row, budgets));
            return {
                configured: configured(), lastSyncAt: last, everyHours: META_SYNC_EVERY_HOURS, discoveryDays: META_DISCOVERY_DAYS,
                accounts: accounts.map((row) => ({ id: row.id, name: row.name, currency: row.currency || null, isActive: row.isActive, fetchedAt: row.fetchedAt || null, problem: row.problem || null })),
                campaigns: list,
                unassigned: unassignedMetaCampaigns(list)
            };
        },

        /** Las campañas propuestas para una pauta, con lo que ya tiene. */
        async suggestions(budgetId) {
            const budgets = await budgetsById();
            const budget = budgets.get(budgetId);
            if (!budget) throw httpError(404, 'Esa pauta ya no existe.');
            const campaigns = await db.adMetaCampaign.findMany({});
            const rows = campaigns.map((row) => ({ ...row, spend30Cents: cents(row.spend30) }));
            const others = [...budgets.values()].filter((row) => row.id !== budgetId && row.clientId === budget.clientId);
            return { suggested: suggestMetaCampaigns(budget, rows, others) };
        },

        /**
         * Las campañas de Meta de una pauta: se manda la lista completa. Una campaña es de una sola pauta y tiene que estar en
         * la moneda de la pauta. Queda en el historial de la pauta, y su gasto se lee en el acto si Meta responde.
         */
        async assign(budgetId, campaignIds, actor) {
            const problem = metaCampaignIdsProblem(campaignIds);
            if (problem) throw httpError(422, problem);
            const ids = campaignIds.map(String);
            const budgets = await budgetsById();
            const budget = budgets.get(budgetId);
            if (!budget) throw httpError(404, 'Esa pauta ya no existe.');
            const wanted = ids.length ? await db.adMetaCampaign.findMany({ where: { id: { in: ids } } }) : [];
            const missing = ids.find((id) => !wanted.some((row) => row.id === id));
            if (missing) throw httpError(422, 'Esa campaña no se ha leído de Meta. Actualiza la lista y vuelve a intentarlo.');
            const taken = wanted.find((row) => row.budgetId && row.budgetId !== budgetId);
            if (taken) throw httpError(409, `«${taken.name}» ya es de la pauta ${adBudgetName(budgets.get(taken.budgetId) || {})}. Quítala de allá primero.`);
            const otherCurrency = wanted.find((row) => row.currency && row.currency !== budget.currency);
            if (otherCurrency) throw httpError(422, `«${otherCurrency.name}» está en ${otherCurrency.currency} y la pauta en ${budget.currency}.`);
            const current = await db.adMetaCampaign.findMany({ where: { budgetId } });
            const added = wanted.filter((row) => row.budgetId !== budgetId);
            const removed = current.filter((row) => !ids.includes(row.id));
            const now = clock();
            await db.$transaction(async (tx) => {
                if (removed.length) await tx.adMetaCampaign.updateMany({ where: { id: { in: removed.map((row) => row.id) } }, data: { budgetId: null, assignedById: null, assignedAt: null } });
                if (added.length) await tx.adMetaCampaign.updateMany({ where: { id: { in: added.map((row) => row.id) } }, data: { budgetId, assignedById: actorId(actor), assignedAt: now, ignoredAt: null, ignoredById: null } });
                if (added.length || removed.length) {
                    const parts = [added.length && `ligó ${added.map((row) => `«${row.name}»`).join(', ')}`, removed.length && `soltó ${removed.map((row) => `«${row.name}»`).join(', ')}`].filter(Boolean);
                    const summary = `Campañas de Meta: ${parts.join('; ')}`;
                    await tx.adBudgetEvent.create({
                        data: { id: randomUUID(), budgetId, clientId: budget.clientId, action: 'LIGAR_META', summary: summary.slice(0, 500), before: { campaignIds: current.map((row) => row.id) }, after: { campaignIds: ids }, actorId: actorId(actor) }
                    });
                }
            });
            let sync = [];
            if (configured()) {
                try {
                    sync = await syncBudgets({ budgetId });
                } catch (error) {
                    log('[Pautas Meta] No se pudo leer el gasto al ligar:', error?.message || error);
                }
            }
            return { ok: true, added: added.length, removed: removed.length, sync };
        },

        /** Una campaña que no es de ninguna pauta (de la agencia, de un cliente que paga por su cuenta) deja de aparecer como pendiente. */
        async setIgnored(campaignId, ignored, actor) {
            const row = await db.adMetaCampaign.findUnique({ where: { id: String(campaignId) } });
            if (!row) throw httpError(404, 'Esa campaña no se ha leído de Meta.');
            if (ignored && row.budgetId) throw httpError(409, 'Esa campaña está ligada a una pauta: quítala de la pauta primero.');
            await db.adMetaCampaign.update({ where: { id: row.id }, data: ignored ? { ignoredAt: clock(), ignoredById: actorId(actor) } : { ignoredAt: null, ignoredById: null } });
            return { ok: true };
        },

        /** «Actualizar ahora»: corre la lectura salvo que acabe de correr. */
        async syncNow() {
            if (!configured()) throw httpError(503, 'La conexión con Meta no está configurada en el servidor.');
            const last = await lastSyncAt();
            if (!running && last && clock() - new Date(last) < MIN_MANUAL_SYNC_MS) return { skipped: true };
            return run();
        }
    };
};

/** El reloj: cada 15 minutos mira si toca leer. Lee cada dos horas entre las 6:00 y las 22:00 de Bogotá, todos los días. */
export const initAdMetaSyncScheduler = ({ db = prisma, interval = 15 * 60 * 1000 } = {}) => {
    const service = adBudgetMetaService(db);
    const run = async () => {
        if (!service.configured()) return;
        const now = new Date();
        const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', hour: 'numeric', hourCycle: 'h23' }).format(now));
        if (hour < 6 || hour >= 22) return;
        const [latest] = await db.adMetaAccount.findMany({ where: { fetchedAt: { not: null } }, orderBy: { fetchedAt: 'desc' }, take: 1 });
        if (latest?.fetchedAt && now - new Date(latest.fetchedAt) < META_SYNC_EVERY_HOURS * 3600 * 1000 - 5 * 60 * 1000) return;
        const result = await service.run();
        const written = result.budgets.filter((item) => item.action !== 'SKIP').length;
        console.log(`[Pautas Meta] Lectura: ${result.accounts} cuentas (${result.failures} con problema), ${written} lecturas de gasto escritas.`);
    };
    const safe = () => run().catch((error) => console.error('[Pautas Meta] Lectura automática:', error?.message || error));
    const startup = setTimeout(safe, 180_000);
    startup.unref?.();
    const timer = setInterval(safe, interval);
    timer.unref?.();
    console.log('[Pautas Meta] Lectura de Meta activa (cada 2 horas, de 6:00 a 22:00).');
    return timer;
};
