// Pautas (reunión del 6 de noviembre de 2026): el seguimiento del presupuesto de cada cliente. Lo que se escribe aquí es
// solo lo que la plataforma no puede saber —cuánto hay aprobado y cuánto marca Meta—; el ciclo sale del contrato del
// cliente y el ritmo, el saldo y los avisos se calculan (`src/lib/adBudgets.js`).
//
// Todo se puede corregir y deshacer (Rodny, el mismo día: «debe uno poder editar absolutamente todo, cada cosa, cambiar,
// modificar, corregir, deshacer»): cada corrección queda en `AdBudgetEvent` con quién y qué había, también al eliminar.
import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import {
    SPECIFIC_CYCLE_KEY, adBudgetName, adBudgetProblem, adCampaignProblem, adCarryOverProblem, adCycleAmountProblem, adCycleFor, adSpendProblem,
    budgetCutDay, carryOverFor, cycleFromKey, evaluateAdCycle, formatAdMoney, previousCycleKey, shortDay, toCents
} from '../lib/adBudgets.js';

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const text = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const number = (value) => (value === null || value === undefined ? null : Number(value));
const actorId = (actor) => actor?.userId || actor?.id || null;

export const bogotaToday = (now = new Date()) => new Date(now.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);

const INCLUDE = {
    client: { select: {
        id: true, name: true, slug: true, isArchived: true,
        contracts: { select: { startDate: true, cutDay: true } },
        projectManager: { select: { id: true, name: true, userId: true, isActive: true } }
    } },
    responsible: { select: { id: true, name: true, avatarUrl: true, userId: true, isActive: true } },
    cycles: { orderBy: { cycleKey: 'asc' } },
    campaigns: { orderBy: { createdAt: 'desc' } }
};

const publicCampaign = (campaign) => ({
    id: campaign.id, budgetId: campaign.budgetId, name: campaign.name, link: campaign.link || null, objective: campaign.objective || null,
    status: campaign.status, startDate: campaign.startDate || null, endDate: campaign.endDate || null,
    planned: number(campaign.planned), notes: campaign.notes || null
});

/** Una pauta tal como la lee todo el mundo: con su ciclo y cómo va. El servidor calcula y la pantalla solo muestra. */
export const describeBudget = (budget, today, { cycleKey = null } = {}) => {
    const { cutDay, source } = budgetCutDay(budget, today);
    const specific = budget.kind === 'ESPECIFICA';
    const cycle = cycleKey && !specific ? cycleFromKey(cycleKey, cutDay) : adCycleFor(budget, { cutDay, today });
    const rows = budget.cycles || [];
    const row = rows.find((item) => item.cycleKey === cycle.key) || null;
    const carry = specific ? { cents: 0, known: true, final: true } : carryOverFor(cycle.key, rows, cutDay);
    const campaigns = (budget.campaigns || []).map(publicCampaign);
    const evaluation = evaluateAdCycle({ budget, cycle, row, carry, campaigns, today });
    // El ciclo anterior sin su gasto final: mientras falte, lo que pasa a este ciclo es provisional. Una pauta que no
    // existía en ese ciclo no debe nada.
    const previousKey = specific || cycleKey ? null : previousCycleKey(cycle.key, cutDay);
    const previousRow = previousKey ? rows.find((item) => item.cycleKey === previousKey) : null;
    const previous = previousKey ? cycleFromKey(previousKey, cutDay) : null;
    const existedThen = previous && bogotaToday(new Date(budget.createdAt || 0)) <= previous.end;
    const pendingClose = budget.status === 'ACTIVA' && previous && !previousRow?.closedAt && (previousRow || existedThen)
        ? { cycle: previous, evaluation: evaluateAdCycle({ budget, cycle: previous, row: previousRow, carry: carryOverFor(previousKey, rows, cutDay), today }) }
        : null;
    return {
        id: budget.id, clientId: budget.clientId, brand: budget.brand || null, platform: budget.platform, kind: budget.kind,
        status: budget.status, currency: budget.currency, amount: number(budget.amount), objective: budget.objective || null,
        payer: budget.payer, startDate: budget.startDate || null, endDate: budget.endDate || null, notes: budget.notes || null,
        client: budget.client ? { id: budget.client.id, name: budget.client.name, slug: budget.client.slug } : null,
        responsible: budget.responsible ? { id: budget.responsible.id, name: budget.responsible.name, avatarUrl: budget.responsible.avatarUrl || null } : null,
        projectManager: budget.client?.projectManager?.isActive === false ? null : (budget.client?.projectManager ? { id: budget.client.projectManager.id, name: budget.client.projectManager.name } : null),
        cutDay, cutSource: source, ownCutDay: budget.cutDay || null, cycle, evaluation, campaigns, pendingClose,
        carryOverReason: row?.carryOverReason || null
    };
};

const readBudget = async (db, id) => {
    const budget = await db.adBudget.findUnique({ where: { id }, include: INCLUDE });
    if (!budget) throw httpError(404, 'Esa pauta ya no existe.');
    return budget;
};

const assertResponsible = async (db, responsibleId) => {
    if (!responsibleId) return;
    const member = await db.teamMember.findUnique({ where: { id: responsibleId }, select: { isActive: true } });
    if (!member || member.isActive === false) throw httpError(422, 'Esa persona ya no está activa en Equipo.');
};

const assertClient = async (db, clientId) => {
    const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, isArchived: true } });
    if (!client || client.isArchived) throw httpError(422, 'Ese cliente no está activo.');
};

const budgetData = (input) => ({
    brand: text(input.brand), platform: input.platform, kind: input.kind, currency: input.currency, amount: Number(input.amount),
    objective: text(input.objective), payer: input.payer || 'POR_DEFINIR', responsibleId: input.responsibleId || null,
    cutDay: input.kind === 'MENSUAL' && input.cutDay ? Number(input.cutDay) : null,
    startDate: input.kind === 'ESPECIFICA' ? input.startDate : null, endDate: input.kind === 'ESPECIFICA' ? input.endDate : null,
    notes: text(input.notes)
});

const ensureCycle = async (tx, budget, cycle, data = {}) => {
    const existing = await tx.adBudgetCycle.findUnique({ where: { budgetId_cycleKey: { budgetId: budget.id, cycleKey: cycle.key } } });
    if (existing) return Object.keys(data).length ? tx.adBudgetCycle.update({ where: { id: existing.id }, data }) : existing;
    return tx.adBudgetCycle.create({ data: { id: randomUUID(), budgetId: budget.id, cycleKey: cycle.key, amount: budget.amount, ...data } });
};

/** Lo vigente de un ciclo sale siempre de sus lecturas: la más reciente manda, y sin lecturas no hay gasto registrado. */
const syncCycle = async (tx, cycleId, now) => {
    const [last] = await tx.adSpendReading.findMany({ where: { cycleId }, orderBy: [{ readOn: 'desc' }, { createdAt: 'desc' }], take: 1 });
    return tx.adBudgetCycle.update({
        where: { id: cycleId },
        data: {
            spent: last ? Number(last.spent) : null, spentAsOf: last?.readOn || null,
            closedAt: last?.isFinal ? now : null, closedById: last?.isFinal ? last.recordedById || null : null
        }
    });
};

const logEvent = (tx, budget, action, summary, actor, { before = null, after = null } = {}) => tx.adBudgetEvent.create({
    data: { id: randomUUID(), budgetId: budget.id, clientId: budget.clientId, action, summary, before, after, actorId: actorId(actor) }
});

const CHANGE_LABELS = Object.freeze({
    clientId: 'el cliente', brand: 'la marca', platform: 'la plataforma', kind: 'el tipo', status: 'el estado', currency: 'la moneda', amount: 'el presupuesto',
    cutDay: 'el día de corte', objective: 'el objetivo', payer: 'quién paga', responsibleId: 'quién la lleva', startDate: 'las fechas', endDate: 'las fechas', notes: 'la nota'
});

/** Qué cambió, en palabras y con el valor anterior: es lo que permite deshacer una corrección a mano. */
const budgetChanges = (current, next) => {
    const plain = (key, row) => (key === 'amount' ? Number(row.amount) : row[key] ?? null);
    const keys = Object.keys(CHANGE_LABELS).filter((key) => plain(key, current) !== plain(key, next));
    return {
        summary: `Cambió ${[...new Set(keys.map((key) => CHANGE_LABELS[key]))].join(', ')}`,
        before: Object.fromEntries(keys.map((key) => [key, plain(key, current)])),
        after: Object.fromEntries(keys.map((key) => [key, plain(key, next)])),
        changed: keys.length > 0
    };
};

const readCycleRow = async (db, budgetId, cycleKey) => {
    const row = await db.adBudgetCycle.findUnique({ where: { budgetId_cycleKey: { budgetId, cycleKey } } });
    if (!row) throw httpError(404, 'Ese ciclo no tiene nada registrado.');
    return row;
};

const readReading = async (db, budgetId, readingId) => {
    const reading = await db.adSpendReading.findUnique({ where: { id: readingId }, include: { cycle: true } });
    if (!reading || reading.cycle?.budgetId !== budgetId) throw httpError(404, 'Esa lectura ya no existe.');
    return reading;
};

const readCampaign = async (db, budgetId, campaignId) => {
    const campaign = await db.adCampaign.findUnique({ where: { id: campaignId } });
    if (!campaign || campaign.budgetId !== budgetId) throw httpError(404, 'Esa campaña ya no existe.');
    return campaign;
};

export const adBudgetService = (db = prisma, { clock = () => new Date() } = {}) => {
    const today = () => bogotaToday(clock());
    const fresh = async (id, options) => describeBudget(await readBudget(db, id), today(), options);
    const cycleOptions = (key) => (key && key !== SPECIFIC_CYCLE_KEY ? { cycleKey: key } : {});

    return {
        /** El tablero: todas las pautas, las terminadas solo si se piden. Un cliente archivado no pide seguimiento. */
        async list({ clientId = null, includeFinished = false } = {}) {
            const day = today();
            const rows = await db.adBudget.findMany({
                where: { ...(clientId ? { clientId } : {}), ...(includeFinished ? {} : { status: { not: 'TERMINADA' } }) },
                include: INCLUDE
            });
            return { today: day, budgets: rows.filter((row) => clientId || !row.client?.isArchived).map((row) => describeBudget(row, day)) };
        },

        /** Una pauta con sus ciclos, las lecturas de cada uno y lo que se ha corregido, de lo más reciente a lo más antiguo. */
        async detail(id) {
            const day = today();
            const budget = await readBudget(db, id);
            const [readings, changes] = await Promise.all([
                (budget.cycles || []).length ? db.adSpendReading.findMany({
                    where: { cycleId: { in: budget.cycles.map((cycle) => cycle.id) } },
                    orderBy: [{ readOn: 'desc' }, { createdAt: 'desc' }]
                }) : [],
                db.adBudgetEvent.findMany({ where: { budgetId: id }, orderBy: { createdAt: 'desc' }, take: 10 })
            ]);
            const people = [...new Set([...readings.map((reading) => reading.recordedById), ...changes.map((change) => change.actorId)].filter(Boolean))];
            const names = people.length ? await db.user.findMany({ where: { id: { in: people } }, select: { id: true, name: true } }) : [];
            const nameOf = new Map(names.map((user) => [user.id, user.name]));
            const history = [...(budget.cycles || [])].reverse().map((row) => {
                const described = describeBudget(budget, day, cycleOptions(row.cycleKey));
                return {
                    cycleKey: row.cycleKey, cycle: described.cycle, evaluation: described.evaluation, amount: number(row.amount), carryOverReason: row.carryOverReason || null,
                    readings: readings.filter((reading) => reading.cycleId === row.id).map((reading) => ({
                        id: reading.id, readOn: reading.readOn, spent: number(reading.spent), isFinal: reading.isFinal, note: reading.note || null,
                        recordedBy: nameOf.get(reading.recordedById) || null, createdAt: reading.createdAt
                    }))
                };
            });
            return {
                ...describeBudget(budget, day), history,
                changes: changes.map((change) => ({ id: change.id, summary: change.summary, by: nameOf.get(change.actorId) || null, createdAt: change.createdAt }))
            };
        },

        /** Lo que hace falta para llenar el formulario sin depender de los permisos de Clientes o Equipo. */
        async options() {
            const [clients, team] = await Promise.all([
                db.client.findMany({ where: { isArchived: false }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
                db.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true, role: true, areas: true }, orderBy: { name: 'asc' } })
            ]);
            return { clients, team };
        },

        async create(input, actor) {
            const problem = adBudgetProblem(input);
            if (problem) throw httpError(422, problem);
            await assertClient(db, input.clientId);
            await assertResponsible(db, input.responsibleId);
            const saved = await db.adBudget.create({
                data: { id: randomUUID(), clientId: input.clientId, ...budgetData(input), status: 'ACTIVA', createdById: actorId(actor), updatedById: actorId(actor) }
            });
            return fresh(saved.id);
        },

        /**
         * Se puede corregir todo, también el cliente o la moneda: una pauta creada con el dato equivocado se arregla aquí.
         * Lo que no se manda se conserva. El presupuesto nuevo aplica al ciclo abierto; el de un ciclo anterior se corrige
         * aparte, para no reescribir meses cerrados por accidente.
         */
        async update(id, input, actor) {
            const current = await readBudget(db, id);
            const merged = {
                clientId: current.clientId, brand: current.brand, platform: current.platform, kind: current.kind, currency: current.currency,
                amount: Number(current.amount), cutDay: current.cutDay, objective: current.objective, payer: current.payer, responsibleId: current.responsibleId,
                startDate: current.startDate, endDate: current.endDate, notes: current.notes, status: current.status, ...input
            };
            const problem = adBudgetProblem(merged);
            if (problem) throw httpError(422, problem);
            if (merged.clientId !== current.clientId) await assertClient(db, merged.clientId);
            await assertResponsible(db, merged.responsibleId);
            const day = today();
            const { cutDay } = budgetCutDay({ ...current, cutDay: merged.cutDay }, day);
            const cycle = adCycleFor(merged, { cutDay, today: day });
            const next = { ...budgetData(merged), clientId: merged.clientId, status: merged.status };
            const changes = budgetChanges(current, next);
            await db.$transaction(async (tx) => {
                await tx.adBudget.update({ where: { id }, data: { ...next, updatedById: actorId(actor) } });
                const open = await tx.adBudgetCycle.findUnique({ where: { budgetId_cycleKey: { budgetId: id, cycleKey: cycle.key } } });
                if (open && !open.closedAt) await tx.adBudgetCycle.update({ where: { id: open.id }, data: { amount: Number(merged.amount) } });
                if (changes.changed) await logEvent(tx, current, 'EDITAR', changes.summary, actor, changes);
            });
            return fresh(id);
        },

        /** Para lo que se creó por error. Lo que se quiera conservar se marca como terminada; esto borra y deja constancia. */
        async remove(id, actor) {
            const budget = await readBudget(db, id);
            await db.$transaction(async (tx) => {
                await logEvent(tx, budget, 'ELIMINAR', `Eliminó la pauta ${adBudgetName(budget)}`, actor, {
                    before: {
                        platform: budget.platform, brand: budget.brand, currency: budget.currency, amount: Number(budget.amount), status: budget.status,
                        cycles: (budget.cycles || []).map((row) => ({ cycleKey: row.cycleKey, amount: number(row.amount), spent: number(row.spent) })),
                        campaigns: (budget.campaigns || []).map((campaign) => campaign.name)
                    }
                });
                await tx.adBudget.delete({ where: { id } });
            });
            return { ok: true };
        },

        /**
         * Lo que marca Meta, acumulado del ciclo. Marcarlo como final cierra el ciclo y deja firme lo que pasa al siguiente.
         * Una lectura con fecha anterior a otra entra al historial sin cambiar la cifra vigente.
         */
        async recordSpend(id, input, actor) {
            const problem = adSpendProblem(input);
            if (problem) throw httpError(422, problem);
            const budget = await readBudget(db, id);
            const now = clock();
            const day = bogotaToday(now);
            if (input.readOn > day) throw httpError(422, 'La fecha de la lectura no puede ser futura.');
            const { cutDay } = budgetCutDay(budget, day);
            const cycle = input.cycleKey && budget.kind !== 'ESPECIFICA' ? cycleFromKey(input.cycleKey, cutDay) : adCycleFor(budget, { cutDay, today: day });
            await db.$transaction(async (tx) => {
                const row = await ensureCycle(tx, budget, cycle);
                await tx.adSpendReading.create({
                    data: { id: randomUUID(), cycleId: row.id, readOn: input.readOn, spent: Number(input.spent), isFinal: input.final === true, note: text(input.note), recordedById: actorId(actor) }
                });
                await syncCycle(tx, row.id, now);
            });
            return fresh(id, cycleOptions(cycle.key));
        },

        async updateReading(id, readingId, input, actor) {
            const budget = await readBudget(db, id);
            const reading = await readReading(db, id, readingId);
            const merged = { spent: Number(reading.spent), readOn: reading.readOn, note: reading.note, final: reading.isFinal, ...input };
            const problem = adSpendProblem(merged);
            if (problem) throw httpError(422, problem);
            const now = clock();
            if (merged.readOn > bogotaToday(now)) throw httpError(422, 'La fecha de la lectura no puede ser futura.');
            const money = (value) => formatAdMoney(toCents(value), budget.currency);
            await db.$transaction(async (tx) => {
                await tx.adSpendReading.update({ where: { id: readingId }, data: { spent: Number(merged.spent), readOn: merged.readOn, note: text(merged.note), isFinal: merged.final === true } });
                await syncCycle(tx, reading.cycleId, now);
                await logEvent(tx, budget, 'CORREGIR_LECTURA', `Corrigió la lectura del ${shortDay(reading.readOn)}: de ${money(reading.spent)} a ${money(merged.spent)}`, actor, {
                    before: { spent: Number(reading.spent), readOn: reading.readOn, note: reading.note || null, isFinal: reading.isFinal },
                    after: { spent: Number(merged.spent), readOn: merged.readOn, note: text(merged.note), isFinal: merged.final === true }
                });
            });
            return fresh(id, cycleOptions(reading.cycle.cycleKey));
        },

        /** Deshacer una lectura: la cifra vigente vuelve a ser la anterior, y sin lecturas el ciclo queda sin gasto. */
        async deleteReading(id, readingId, actor) {
            const budget = await readBudget(db, id);
            const reading = await readReading(db, id, readingId);
            await db.$transaction(async (tx) => {
                await tx.adSpendReading.delete({ where: { id: readingId } });
                await syncCycle(tx, reading.cycleId, clock());
                await logEvent(tx, budget, 'ELIMINAR_LECTURA', `Eliminó la lectura del ${shortDay(reading.readOn)} por ${formatAdMoney(toCents(reading.spent), budget.currency)}`, actor, {
                    before: { spent: Number(reading.spent), readOn: reading.readOn, note: reading.note || null, isFinal: reading.isFinal }
                });
            });
            return fresh(id, cycleOptions(reading.cycle.cycleKey));
        },

        /** Deshacer un cierre: el ciclo vuelve a estar abierto y lo que pasa al siguiente queda provisional. */
        async reopenCycle(id, cycleKey, actor) {
            const budget = await readBudget(db, id);
            const row = await readCycleRow(db, id, cycleKey);
            const now = clock();
            await db.$transaction(async (tx) => {
                await tx.adSpendReading.updateMany({ where: { cycleId: row.id }, data: { isFinal: false } });
                await syncCycle(tx, row.id, now);
                await logEvent(tx, budget, 'REABRIR', `Reabrió el ciclo ${cycleKey}`, actor);
            });
            return fresh(id, cycleOptions(cycleKey));
        },

        /** El presupuesto de un ciclo en particular, también de uno cerrado. */
        async updateCycle(id, cycleKey, input, actor) {
            const problem = adCycleAmountProblem(input);
            if (problem) throw httpError(422, problem);
            const budget = await readBudget(db, id);
            const row = await readCycleRow(db, id, cycleKey);
            const money = (value) => formatAdMoney(toCents(value), budget.currency);
            await db.$transaction(async (tx) => {
                await tx.adBudgetCycle.update({ where: { id: row.id }, data: { amount: Number(input.amount) } });
                await logEvent(tx, budget, 'CORREGIR_CICLO', `Corrigió el presupuesto del ciclo ${cycleKey}: de ${money(row.amount)} a ${money(input.amount)}`, actor, {
                    before: { amount: Number(row.amount) }, after: { amount: Number(input.amount) }
                });
            });
            return fresh(id, cycleOptions(cycleKey));
        },

        /** El saldo que pasa a un ciclo, cuando la cuenta automática no aplica: el primer mes, o un acuerdo con el cliente. */
        async adjustCarryOver(id, input, actor) {
            const problem = adCarryOverProblem(input);
            if (problem) throw httpError(422, problem);
            const budget = await readBudget(db, id);
            if (budget.kind === 'ESPECIFICA') throw httpError(422, 'Una pauta específica no recibe saldo de otro ciclo.');
            const day = today();
            const { cutDay } = budgetCutDay(budget, day);
            const cycle = input.cycleKey ? cycleFromKey(input.cycleKey, cutDay) : adCycleFor(budget, { cutDay, today: day });
            await db.$transaction(async (tx) => {
                await ensureCycle(tx, budget, cycle, { carryOverManual: Number(input.carryOver), carryOverReason: text(input.reason), carryOverById: actorId(actor) });
                await logEvent(tx, budget, 'AJUSTAR_SALDO', `Ajustó el saldo anterior a ${formatAdMoney(toCents(input.carryOver), budget.currency)}: ${text(input.reason)}`, actor);
            });
            return fresh(id, cycleOptions(cycle.key));
        },

        /** Deshacer el ajuste: el saldo vuelve a salir de la cuenta automática. */
        async clearCarryOver(id, { cycleKey = null } = {}, actor) {
            const budget = await readBudget(db, id);
            const day = today();
            const { cutDay } = budgetCutDay(budget, day);
            const key = cycleKey || adCycleFor(budget, { cutDay, today: day }).key;
            const row = await readCycleRow(db, id, key);
            await db.$transaction(async (tx) => {
                await tx.adBudgetCycle.update({ where: { id: row.id }, data: { carryOverManual: null, carryOverReason: null, carryOverById: null } });
                await logEvent(tx, budget, 'QUITAR_AJUSTE', 'Volvió al saldo automático', actor, { before: { carryOver: number(row.carryOverManual), reason: row.carryOverReason || null } });
            });
            return fresh(id, cycleOptions(key));
        },

        async createCampaign(budgetId, input, actor) {
            const problem = adCampaignProblem(input);
            if (problem) throw httpError(422, problem);
            await readBudget(db, budgetId);
            const saved = await db.adCampaign.create({
                data: {
                    id: randomUUID(), budgetId, name: input.name.trim(), link: text(input.link), objective: text(input.objective), status: input.status || 'POR_ACTIVAR',
                    startDate: input.startDate || null, endDate: input.endDate || null, planned: input.planned === '' || input.planned == null ? null : Number(input.planned),
                    notes: text(input.notes), createdById: actorId(actor), updatedById: actorId(actor)
                }
            });
            return publicCampaign(saved);
        },

        async updateCampaign(budgetId, campaignId, input, actor) {
            const current = await readCampaign(db, budgetId, campaignId);
            const merged = { ...publicCampaign(current), ...input };
            const problem = adCampaignProblem(merged);
            if (problem) throw httpError(422, problem);
            const saved = await db.adCampaign.update({
                where: { id: campaignId },
                data: {
                    name: merged.name.trim(), link: text(merged.link), objective: text(merged.objective), status: merged.status,
                    startDate: merged.startDate || null, endDate: merged.endDate || null,
                    planned: merged.planned === '' || merged.planned == null ? null : Number(merged.planned),
                    notes: text(merged.notes), updatedById: actorId(actor)
                }
            });
            return publicCampaign(saved);
        },

        async deleteCampaign(budgetId, campaignId, actor) {
            const budget = await readBudget(db, budgetId);
            const campaign = await readCampaign(db, budgetId, campaignId);
            await db.$transaction(async (tx) => {
                await tx.adCampaign.delete({ where: { id: campaignId } });
                await logEvent(tx, budget, 'ELIMINAR_CAMPANA', `Eliminó la campaña «${campaign.name}»`, actor, { before: { ...publicCampaign(campaign) } });
            });
            return { ok: true };
        }
    };
};

export { INCLUDE as AD_BUDGET_INCLUDE };
