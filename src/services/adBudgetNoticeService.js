// El reloj de las pautas (reunión del 6 de noviembre de 2026). Cada media hora, en horario hábil de Bogotá, mira cada
// pauta activa: a quien la lleva le deja en la banda lo que debe y al project manager le avisa por la campana a cinco días
// del cierre. La regla de qué decir vive en `src/lib/adBudgetNotices.js`.
import prisma from '../lib/prisma.js';
import { queueImportantNotice } from './importantNoticeService.js';
import { createNotification } from './notificationService.js';
import { activeAreaUserIds } from './teamAreaService.js';
import { AD_BUDGET_INCLUDE, bogotaToday, describeBudget } from './adBudgetService.js';
import { hasModulePermission } from '../config/security.js';
import { AD_BUDGET_EDIT_KEY, canEditAdBudgets } from '../lib/platformModules.js';
import { isWorkingTime } from '../lib/briaNudges.js';
import {
    AD_BOARD_URL, AD_DIGEST_THRESHOLD, AD_DIGEST_KIND, adManagerDigest, adManagerSteps, adNoticePlan, adNoticesFor, isAdNotice, parseAdSubject
} from '../lib/adBudgetNotices.js';

export const AD_MANAGER_NOTIFICATION = 'PAUTA_CIERRE';
const CHECK_MS = 30 * 60 * 1000;

const readBoard = async (db, today) => {
    const rows = await db.adBudget.findMany({ where: { status: 'ACTIVA' }, include: AD_BUDGET_INCLUDE });
    return rows.filter((row) => !row.client?.isArchived).map((row) => ({ row, budget: describeBudget(row, today) }));
};

/** Quién lleva la pauta: su responsable; si no tiene, el área de Pauta; si no hay nadie, el project manager de la cuenta. */
const holdersOf = (row, fallback) => {
    if (row.responsible?.userId && row.responsible.isActive !== false) return [row.responsible.userId];
    if (fallback.length) return fallback;
    const pm = row.client?.projectManager;
    return pm?.userId && pm.isActive !== false ? [pm.userId] : [];
};

/**
 * Quién puede qué: la campana del project manager pide ver Pautas; la banda, que pide actualizar el gasto o cerrar el
 * ciclo, pide además «Editar pautas». Nadie recibe un aviso que no puede atender.
 */
const accessOf = async (db, userIds) => {
    if (!userIds.length) return { view: new Set(), edit: new Set() };
    const users = await db.user.findMany({ where: { id: { in: userIds }, isActive: true }, select: { id: true, role: true, modulePermissions: true } });
    return {
        view: new Set(users.filter((user) => hasModulePermission(user, 'pautas')).map((user) => user.id)),
        edit: new Set(users.filter((user) => canEditAdBudgets(user)).map((user) => user.id))
    };
};

export const runAdBudgetAlerts = async (db = prisma, { now = new Date(), notify = createNotification, queue = queueImportantNotice, log = console.error, info = console.log } = {}) => {
    const today = bogotaToday(now);
    const board = await readBoard(db, today);
    const fallback = await activeAreaUserIds(db, 'PAUTA', { module: AD_BUDGET_EDIT_KEY });
    const everyone = [...new Set(board.flatMap(({ row }) => [...holdersOf(row, fallback), row.client?.projectManager?.userId].filter(Boolean)))];
    const allowed = await accessOf(db, everyone);

    // La banda: lo que cada persona debe hoy.
    const wanted = new Map();
    for (const { row, budget } of board) {
        const notices = adNoticesFor(budget);
        if (!notices.length) continue;
        const holders = holdersOf(row, fallback).filter((userId) => allowed.edit.has(userId));
        if (!holders.length) log(`[Pautas] ${budget.client?.name}: la pauta pide revisión y nadie que la lleve tiene «Editar pautas».`);
        for (const userId of holders) {
            if (!wanted.has(userId)) wanted.set(userId, []);
            wanted.get(userId).push(...notices);
        }
    }
    const openAll = (await db.importantNotice.findMany({ where: { resolvedAt: null } })).filter(isAdNotice);
    for (const notice of openAll) if (!wanted.has(notice.userId)) wanted.set(notice.userId, []);

    let sent = 0;
    for (const [userId, items] of wanted) {
        const open = openAll.filter((notice) => notice.userId === userId);
        const { create, update, close } = adNoticePlan({ wanted: items, open, today });
        for (const { id, ...data } of update) await db.importantNotice.update({ where: { id }, data });
        for (const item of create) {
            try {
                await queue(db, { userId, ...item }, now);
                sent += 1;
            } catch (error) {
                log('[Pautas] Aviso no guardado:', error?.message || error);
            }
        }
        for (const item of close) {
            await db.importantNotice.update({ where: { id: item.id }, data: { resolvedAt: now, resolution: item.resolution } })
                .catch((error) => log('[Pautas] Aviso no cerrado:', error?.message || error));
        }
    }

    // La campana del project manager: la fila única es la cerradura, se escribe antes de avisar.
    const outbox = new Map();
    for (const { row, budget } of board) {
        const pm = row.client?.projectManager;
        if (!pm?.userId || pm.isActive === false || !allowed.view.has(pm.userId)) continue;
        for (const { step, message } of adManagerSteps(budget)) {
            try {
                await db.adBudgetAlert.create({ data: { budgetId: budget.id, cycleKey: budget.cycle.key, step, sentAt: now } });
            } catch (error) {
                if (error?.code === 'P2002') continue;
                throw error;
            }
            const key = `${pm.userId}:${step}`;
            if (!outbox.has(key)) outbox.set(key, { userId: pm.userId, step, items: [] });
            outbox.get(key).items.push({ message, url: `${AD_BOARD_URL}?pauta=${budget.id}`, relatedId: budget.id });
        }
    }
    const deliver = async (data) => {
        try {
            await notify({ type: AD_MANAGER_NOTIFICATION, ...data });
            sent += 1;
        } catch (error) {
            log('[Pautas] Aviso no entregado:', error?.message || error);
        }
    };
    for (const { userId, step, items } of outbox.values()) {
        if (items.length > AD_DIGEST_THRESHOLD) await deliver({ userId, url: AD_BOARD_URL, message: adManagerDigest(step, items.length) });
        else for (const item of items) await deliver({ userId, ...item });
    }
    if (sent) info(`[Pautas] ${sent} ${sent === 1 ? 'aviso' : 'avisos'} en este pase.`);
    return { sent };
};

/**
 * ¿Sigue haciendo falta el aviso que la banda va a mostrar? Se relee la pauta: actualizar el gasto o apagar la campaña lo
 * saca al momento. El resumen de varias pautas lo cierra el reloj.
 */
export const adNoticeStillNeeded = async (db, notice, now = new Date()) => {
    if (notice.kind === AD_DIGEST_KIND) return null;
    const subject = parseAdSubject(notice.subjectId);
    if (!subject) return null;
    const today = bogotaToday(now);
    const budgetId = subject.budgetId || (await db.adCampaign.findUnique({ where: { id: subject.campaignId }, select: { budgetId: true } }))?.budgetId;
    const row = budgetId ? await db.adBudget.findUnique({ where: { id: budgetId }, include: AD_BUDGET_INCLUDE }) : null;
    const name = notice.label?.split(' · ').slice(1).join(' · ') || null;
    if (!row || row.status !== 'ACTIVA' || row.client?.isArchived) return { reason: 'PAUTA_INACTIVA', subject: name };
    const needed = adNoticesFor(describeBudget(row, today)).some((item) => item.subjectId === notice.subjectId);
    return needed ? null : { reason: 'PAUTA_ATENDIDA', subject: name };
};

/** El reloj: cada media hora, solo en horario hábil de Bogotá, como los demás avisos de la banda. */
export const initAdBudgetAlertScheduler = ({ db = prisma, interval = CHECK_MS } = {}) => {
    const run = () => {
        const now = new Date();
        if (!isWorkingTime(now)) return;
        runAdBudgetAlerts(db, { now }).catch((error) => console.error('[Pautas] Avisos de pauta:', error?.message || error));
    };
    const startup = setTimeout(run, 100_000);
    startup.unref?.();
    const timer = setInterval(run, interval);
    timer.unref?.();
    console.log('[Pautas] Avisos de pauta activos (cada 30 minutos, horario hábil).');
    return timer;
};
