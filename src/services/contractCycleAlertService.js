// Avisos de cierre mensual y de renovación (punto 5 de la solicitud de Elisa; Rodny, 29 de octubre de 2026). Un reloj en
// horario hábil mira el contrato vigente de cada cliente y avisa por la campana al project manager de la cuenta y al
// área Administrativa y contable, según el paso (regla en src/lib/contractCycleAlerts.js). Lo ya avisado queda en
// `ContractCycleAlert`, una fila por contrato, mes y paso: nada se repite aunque el reloj corra dos veces.
import prisma from '../lib/prisma.js';
import { createNotification } from './notificationService.js';
import { activeAreaUserIds } from './teamAreaService.js';
import { isWorkingTime } from '../lib/briaNudges.js';
import { contractCycleAlerts, cycleAlertText, cycleDigestText } from '../lib/contractCycleAlerts.js';

export const CYCLE_CLOSE_TYPE = 'CIERRE_MENSUAL';
export const BILLING_REVIEW_TYPE = 'FACTURACION_MENSUAL';
export const RENEWAL_TYPE = 'RENOVACION_CONTRATO';
const CHECK_MS = 30 * 60 * 1000;
const DIGEST_THRESHOLD = 3;
const BILLING_URL = '/financiero?tab=cartera';

const typeOf = (step) => (step === 'FACTURACION' ? BILLING_REVIEW_TYPE : step.startsWith('RENOVACION') ? RENEWAL_TYPE : CYCLE_CLOSE_TYPE);
const bogotaToday = (now) => new Date(now.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);

/** El contrato vigente de cada cliente: el de inicio más reciente que ya empezó. */
export const currentContracts = (contracts, today) => {
    const byClient = new Map();
    for (const contract of contracts) {
        if (!contract.startDate || contract.startDate > today) continue;
        const kept = byClient.get(contract.clientId);
        if (!kept || contract.startDate > kept.startDate) byClient.set(contract.clientId, contract);
    }
    return [...byClient.values()];
};

/** Una pasada del reloj. Primero se anota el paso (la fila única es la cerradura) y después se avisa. */
export const runContractCycleAlerts = async (db = prisma, { now = new Date(), notify = createNotification, log = console.error, info = console.log } = {}) => {
    const today = bogotaToday(now);
    const contracts = await db.clientContract.findMany({
        select: {
            id: true, clientId: true, status: true, startDate: true, endDate: true, cutDay: true, monthlyReport: true,
            client: {
                select: {
                    id: true, name: true, slug: true, isArchived: true,
                    projectManager: { select: { userId: true, isActive: true } },
                    // El community manager de la cuenta (30 de octubre de 2026): cerrar el mes es de los dos.
                    responsible: { select: { userId: true, isActive: true } }
                }
            }
        }
    });
    const administrative = await activeAreaUserIds(db, 'ADMINISTRATIVA');
    let projectManagement = null;
    const pmOf = async (client) => {
        const pm = client?.projectManager;
        if (pm?.userId && pm.isActive !== false) return [pm.userId];
        projectManagement ||= await activeAreaUserIds(db, 'PROJECT_MANAGEMENT');
        return projectManagement;
    };

    // Lo que le toca a cada persona en este pase, por paso: se reparte al final para poder resumir.
    const outbox = new Map();
    const queue = (userId, step, item) => {
        if (!outbox.has(userId)) outbox.set(userId, new Map());
        const bySteps = outbox.get(userId);
        if (!bySteps.has(step)) bySteps.set(step, []);
        bySteps.get(step).push(item);
    };
    let sent = 0;
    for (const contract of currentContracts(contracts, today)) {
        if (contract.client?.isArchived) continue;
        for (const alert of contractCycleAlerts(contract, today)) {
            try {
                await db.contractCycleAlert.create({ data: { contractId: contract.id, cycleKey: alert.cycleKey, step: alert.step, sentAt: now } });
            } catch (error) {
                if (error?.code === 'P2002') continue;
                throw error;
            }
            sent += 1;
            const message = cycleAlertText(alert, contract.client?.name);
            const operationUrl = contract.client?.slug ? `/clientes/operacion/${contract.client.slug}` : '/clientes';
            const recipients = new Map();
            if (alert.audience.includes('PM')) for (const userId of await pmOf(contract.client)) recipients.set(userId, operationUrl);
            // El community manager de esa cuenta, sin respaldo por área: si no lo tiene, el aviso es del PM.
            const cm = contract.client?.responsible;
            if (alert.audience.includes('CM') && cm?.userId && cm.isActive !== false && !recipients.has(cm.userId)) recipients.set(cm.userId, operationUrl);
            if (alert.audience.includes('ADMINISTRATIVA')) for (const userId of administrative) if (!recipients.has(userId)) recipients.set(userId, BILLING_URL);
            if (!recipients.size) log(`[Cierre mensual] ${contract.client?.name || contract.clientId}: el aviso ${alert.step} no tiene a quién llegar.`);
            for (const [userId, url] of recipients) queue(userId, alert.step, { message, url, relatedId: contract.clientId });
        }
    }

    const deliver = async (data) => {
        try {
            return await notify(data);
        } catch (error) {
            log('[Cierre mensual] Aviso no entregado:', error?.message || error);
            return null;
        }
    };
    for (const [userId, bySteps] of outbox) {
        for (const [step, items] of bySteps) {
            const type = typeOf(step);
            if (items.length > DIGEST_THRESHOLD) {
                await deliver({ userId, type, url: type === BILLING_REVIEW_TYPE ? BILLING_URL : '/clientes', message: cycleDigestText(step, items.length) });
                continue;
            }
            for (const item of items) await deliver({ userId, type, ...item });
        }
    }
    if (sent) info(`[Cierre mensual] ${sent} ${sent === 1 ? 'aviso' : 'avisos'} de cierre o renovación en este pase.`);
    return { sent };
};

/** El reloj: cada media hora, solo en horario hábil de Bogotá. */
export const initContractCycleAlertScheduler = ({ db = prisma, interval = CHECK_MS } = {}) => {
    const run = () => {
        const now = new Date();
        if (!isWorkingTime(now)) return;
        runContractCycleAlerts(db, { now }).catch((error) => console.error('[Cierre mensual] Avisos de cierre y renovación:', error?.message || error));
    };
    const startup = setTimeout(run, 60_000);
    startup.unref?.();
    const timer = setInterval(run, interval);
    timer.unref?.();
    console.log('[Cierre mensual] Avisos de cierre mensual y renovación activos (cada 30 minutos, horario hábil).');
    return timer;
};
