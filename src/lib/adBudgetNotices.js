// Los avisos de pauta (reunión del 6 de noviembre de 2026; Francisco: «a Keila le tiene que llegar alertas … mira, tiene
// 10 días, revisa tu pauta», y a Camila «una por lo menos al mes, cinco días antes de que se acabe»).
//
// - **A quien lleva la pauta, en la banda, solo cuando debe algo**: el gasto sin actualizar (cada tres días y, en los
//   últimos cinco, cada día), el gasto final de un ciclo que terminó, o una campaña que sigue activa pasada su fecha o que
//   termina después del cierre. El aviso se cae solo en cuanto lo hace: actualizar el gasto es lo que se le pidió.
// - **Al project manager, por la campana, una vez por ciclo**: a cinco días del cierre y si la pauta se pasa. La campana
//   llega al celular, así que no lleva cifras.
// - **Más de tres pautas de la misma persona salen en un solo aviso.**
//
// Lógica pura: la usan el reloj, la banda y las pruebas.
import { adBudgetName, shortDay } from './adBudgets.js';

export const AD_REVIEW_KIND = 'PAUTA_REVISION';
export const AD_CAMPAIGN_KIND = 'PAUTA_CAMPANA';
export const AD_DIGEST_KIND = 'PAUTA_RESUMEN';
export const AD_DIGEST_THRESHOLD = 3;
export const AD_BOARD_URL = '/pautas';

export const isAdNotice = (notice) => String(notice?.kind || '').startsWith('PAUTA_');

export const adReviewSubject = (budgetId, cycleKey) => `pauta:${budgetId}:${cycleKey}`;
export const adCampaignSubject = (campaignId) => `pauta-campana:${campaignId}`;
export const adDigestSubject = (today) => `pauta-resumen:${String(today).slice(0, 7)}`;

export const parseAdSubject = (subjectId) => {
    const review = /^pauta:([^:]+):(.+)$/.exec(String(subjectId || ''));
    if (review) return { budgetId: review[1], cycleKey: review[2] };
    const campaign = /^pauta-campana:(.+)$/.exec(String(subjectId || ''));
    return campaign ? { campaignId: campaign[1] } : null;
};

const days = (count) => (count === 1 ? '1 día' : `${count} días`);

/** Lo que dice el aviso de una pauta. Sin la orden del final: el botón ya dice qué hacer. */
const reviewText = (budget) => {
    const { evaluation: e, cycle } = budget;
    const name = adBudgetName(budget);
    if (e.state === 'POR_CERRAR') return { level: 'IMPORTANTE', label: `Pauta · ${name}`, message: `El ciclo cerró el ${shortDay(cycle.end)} y falta el gasto final` };
    if (e.state === 'PASADA') return { level: 'IMPORTANTE', label: `Pauta · ${name}`, message: `Va en ${e.percent} % del presupuesto: se pasó` };
    if (e.closingWindow) {
        const left = e.daysToClose === 0 ? 'Cierra hoy' : `Cierra en ${days(e.daysToClose)}`;
        return { level: 'IMPORTANTE', label: `Pauta · ${name}`, message: e.hasReading ? `${left} y lleva ${e.percent} % del presupuesto` : `${left} y no hay gasto registrado` };
    }
    return {
        level: 'SEGUIMIENTO',
        label: `Pauta · ${name}`,
        message: e.hasReading ? `Quedan ${days(e.daysToClose)} y hace ${days(e.daysSinceReading)} no se actualiza el gasto` : `Quedan ${days(e.daysToClose)}, revisa cuánto se ha gastado`
    };
};

/** Lo que una pauta le pide hoy a quien la lleva. Una pauta puede pedir varias cosas: cada una es un aviso. */
export const adNoticesFor = (budget) => {
    const notices = [];
    const url = `${AD_BOARD_URL}?pauta=${budget.id}`;
    if (budget.pendingClose) {
        const { cycle } = budget.pendingClose;
        notices.push({
            kind: AD_REVIEW_KIND, subjectId: adReviewSubject(budget.id, cycle.key), url, level: 'IMPORTANTE',
            label: `Pauta · ${adBudgetName(budget)}`, message: `Falta el gasto final de ${String(cycle.label).toLowerCase()}: de ahí sale el saldo de este ciclo`
        });
    }
    if (budget.evaluation.reviewDue) {
        notices.push({ kind: AD_REVIEW_KIND, subjectId: adReviewSubject(budget.id, budget.cycle.key), url, ...reviewText(budget) });
    }
    for (const flag of budget.evaluation.flags) {
        const detail = `${flag.text.charAt(0).toLowerCase()}${flag.text.slice(1).replace(/\.$/, '')}`;
        notices.push({
            kind: AD_CAMPAIGN_KIND, subjectId: adCampaignSubject(flag.campaignId), url, level: 'SEGUIMIENTO',
            label: `Pauta · ${adBudgetName(budget)}`, message: flag.code === 'VENCIDA' ? `«${flag.campaignName}» sigue activa: ${detail}` : `«${flag.campaignName}»: ${detail}`
        });
    }
    return notices.map((notice) => ({ ...notice, budgetId: budget.id }));
};

const same =(notice, wanted) => notice.message === wanted.message && notice.level === wanted.level && notice.label === wanted.label;

/** Qué crear, actualizar y cerrar para una persona. Recrear un aviso igual borraría su «Recordarme». */
export const adNoticePlan = ({ wanted = [], open = [], today }) => {
    // Una pauta puede pedir dos cosas: el resumen cuenta pautas, no avisos, para decir lo mismo que el tablero.
    const budgets = new Set(wanted.map((item) => item.budgetId || item.subjectId)).size;
    const items = wanted.length > AD_DIGEST_THRESHOLD ? [{
        kind: AD_DIGEST_KIND,
        subjectId: adDigestSubject(today),
        url: `${AD_BOARD_URL}?filtro=revisar`,
        level: wanted.some((item) => item.level === 'IMPORTANTE') ? 'IMPORTANTE' : 'SEGUIMIENTO',
        label: `Pautas · ${budgets} por revisar`,
        message: budgets === 1 ? 'Una pauta necesita que actualices el gasto o revises sus campañas' : `${budgets} pautas necesitan que actualices el gasto o revises sus campañas`
    }] : wanted;
    const create = items.filter((item) => !open.some((notice) => notice.subjectId === item.subjectId));
    const update = items.flatMap((item) => {
        const existing = open.find((notice) => notice.subjectId === item.subjectId);
        return existing && !same(existing, item) ? [{ id: existing.id, kind: item.kind, level: item.level, label: item.label, message: item.message, url: item.url }] : [];
    });
    const keep = new Set(items.map((item) => item.subjectId));
    const close = open.filter((notice) => !keep.has(notice.subjectId)).map((notice) => ({ id: notice.id, resolution: 'YA_ATENDIDO' }));
    return { create, update, close };
};

/** Los pasos de la campana del project manager, sin cifras. */
export const adManagerSteps = (budget) => {
    const { evaluation: e, cycle, status } = budget;
    if (status !== 'ACTIVA' || e.state === 'CERRADO') return [];
    const steps = [];
    if (e.closingWindow && !e.complete) steps.push({ step: 'CIERRE', message: `La pauta de ${adBudgetName(budget)} cierra el ${shortDay(cycle.end)}: revisa con quien la lleva que se gaste el presupuesto.` });
    if (e.state === 'PASADA') steps.push({ step: 'PASADA', message: `La pauta de ${adBudgetName(budget)} se pasó del presupuesto de este ciclo.` });
    return steps;
};

export const adManagerDigest = (step, count) => (step === 'PASADA'
    ? `${count} pautas se pasaron del presupuesto de este ciclo.`
    : `${count} pautas cierran en los próximos días: revisa que se gaste el presupuesto.`);
