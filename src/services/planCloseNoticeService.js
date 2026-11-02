// El reloj de los avisos de parrilla (Rodny, 30 de octubre de 2026: «me gustaría tener notificaciones de banda para
// poder cerrar correctamente las parrillas»). Cada media hora, en horario hábil de Bogotá, mira qué cuentas tienen
// piezas que pasaron su fecha y siguen sin publicar —lo que impide cerrar el mes— y deja el aviso en la banda del
// community manager y del project manager de esa cuenta.
//
// Nadie reenvía nada: cuando cualquiera de las dos marca las piezas, el aviso se le cae a la otra sola, porque la banda
// vuelve a comprobar antes de mostrarlo. La regla de qué crear y qué cerrar vive en `src/lib/planCloseNotices.js`.
import prisma from '../lib/prisma.js';
import { clientOperationsService } from './clientOperationsService.js';
import { queueImportantNotice } from './importantNoticeService.js';
import { isPlanNotice, planNoticePlan } from '../lib/planCloseNotices.js';
import { isWorkingTime } from '../lib/briaNudges.js';

const CHECK_MS = 30 * 60 * 1000;

const bogotaToday = (now) => new Date(now.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * Una pasada. Devuelve cuántos avisos se crearon; lo que no se puede guardar queda dicho en los registros y no frena
 * a los demás, que es la regla de todos los avisos de la plataforma.
 */
export const runPlanCloseNotices = async (db = prisma, {
    now = new Date(),
    listOverduePlans = (...args) => clientOperationsService.listOverduePlans(...args),
    queue = queueImportantNotice,
    log = console.error,
    info = console.log
} = {}) => {
    const today = bogotaToday(now);
    const pending = await listOverduePlans();

    // Lo que le toca a cada persona: la misma cuenta va a las dos, y cada una decide por su lado.
    const byPerson = new Map();
    for (const row of pending) {
        const people = [row.communityManager, row.projectManager].filter((person) => person?.userId);
        if (!people.length) {
            log(`[Parrillas] ${row.clientName}: ${row.overdue} piezas sin publicar y la cuenta no tiene a quién avisarle.`);
            continue;
        }
        for (const person of people) {
            if (!byPerson.has(person.userId)) byPerson.set(person.userId, []);
            byPerson.get(person.userId).push(row);
        }
    }

    // Quien ya no tiene nada atrasado también entra, para que su aviso se cierre.
    const openAll = (await db.importantNotice.findMany({ where: { resolvedAt: null } })).filter(isPlanNotice);
    for (const notice of openAll) if (!byPerson.has(notice.userId)) byPerson.set(notice.userId, []);

    let sent = 0;
    for (const [userId, rows] of byPerson) {
        const open = openAll.filter((notice) => notice.userId === userId);
        const { create, close } = planNoticePlan({ pending: rows, open, today });
        for (const item of create) {
            try {
                await queue(db, { userId, ...item }, now);
                sent += 1;
            } catch (error) {
                log('[Parrillas] Aviso no guardado:', error?.message || error);
            }
        }
        for (const item of close) {
            try {
                await db.importantNotice.update({ where: { id: item.id }, data: { resolvedAt: now, resolution: item.resolution } });
            } catch (error) {
                log('[Parrillas] Aviso no cerrado:', error?.message || error);
            }
        }
    }
    if (sent) info(`[Parrillas] ${sent} ${sent === 1 ? 'aviso' : 'avisos'} de piezas sin publicar en este pase.`);
    return { sent };
};

/** El reloj: cada media hora, solo en horario hábil de Bogotá, como los demás avisos de la banda. */
export const initPlanCloseNoticeScheduler = ({ db = prisma, interval = CHECK_MS } = {}) => {
    const run = () => {
        const now = new Date();
        if (!isWorkingTime(now)) return;
        runPlanCloseNotices(db, { now }).catch((error) => console.error('[Parrillas] Avisos de piezas sin publicar:', error?.message || error));
    };
    const startup = setTimeout(run, 90_000);
    startup.unref?.();
    const timer = setInterval(run, interval);
    timer.unref?.();
    console.log('[Parrillas] Avisos de piezas sin publicar activos (cada 30 minutos, horario hábil).');
    return timer;
};
