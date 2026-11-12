// Ajustar el presupuesto en Meta desde Pautas (Rodny, 12 de noviembre de 2026: «no tiene sentido ajustar gasto en la
// plataforma si en Meta va a tener otro»). Lógica pura, la usan el servidor y la pantalla.
//
// Lo leído en la referencia de Meta (Marketing API, campañas y conjuntos de anuncios):
// - El presupuesto vive en la campaña **o** en sus conjuntos, nunca en los dos: `daily_budget` (diario) o
//   `lifetime_budget` (total), en la unidad mínima de la moneda de la cuenta. El peso no tiene subunidad en Meta (se cuenta
//   en pesos enteros); el dólar se cuenta en centavos. `budget_remaining` dice cuánto le queda a un presupuesto total.
// - Un presupuesto diario no se puede volver total ni al revés: se cambia el valor, no el tipo.
// - Se cambia con `POST /{id}` y el campo con su nuevo valor.
//
// El tope (Rodny: «no lo deja»): un cambio que **sube** lo que la pauta gastaría hasta su límite de gasto, por encima de
// lo que queda del ciclo, no se hace. Bajar siempre se deja. Lo que gastaría se estima con lo que Meta tiene configurado:
// es una cuenta para frenar a tiempo, no una predicción.
import { addDays, daysBetween, formatAdMoney, shortDay, toleranceCents } from './adBudgets.js';

const MINOR_PER_UNIT = Object.freeze({ COP: 1, USD: 100 });
const unitsOf = (currency) => MINOR_PER_UNIT[currency] ?? 1;

/** De la unidad de Meta (pesos enteros, centavos de dólar) a los centavos de la plataforma. */
export const metaMinorToCents = (minor, currency = 'COP') => Math.round((Number(minor) || 0) * (100 / unitsOf(currency)));

/** De centavos de la plataforma a la unidad de Meta. En pesos, Meta no recibe centavos. */
export const centsToMetaMinor = (cents, currency = 'COP') => {
    const value = Math.round(Number(cents) || 0);
    if (value <= 0) return { problem: 'El presupuesto tiene que ser mayor que cero.' };
    const exact = (value * unitsOf(currency)) / 100;
    if (!Number.isInteger(exact)) return { problem: 'En pesos, Meta no recibe centavos: escribe un valor entero.' };
    return { minor: exact };
};

const dayOf = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);

/**
 * Una campaña o un conjunto de anuncios tal como lo devuelve Meta, en palabras de la plataforma. La fecha final se toma tal
 * cual la escribe Meta (en la zona horaria de la cuenta), sin pasarla por otro reloj.
 */
export const metaBudgetObject = (raw, { level = 'CAMPAIGN', currency = 'COP', campaignId = null, campaignName = null, accountName = null } = {}) => {
    const daily = Number(raw?.daily_budget) || 0;
    const lifetime = Number(raw?.lifetime_budget) || 0;
    const kind = daily > 0 ? 'DAILY' : lifetime > 0 ? 'LIFETIME' : null;
    const remaining = kind === 'LIFETIME' && raw?.budget_remaining !== undefined ? Number(raw.budget_remaining) || 0 : null;
    const status = String(raw?.effective_status || raw?.status || '');
    return {
        id: String(raw?.id), level, name: String(raw?.name || raw?.id), currency,
        campaignId: campaignId || (level === 'CAMPAIGN' ? String(raw?.id) : String(raw?.campaign_id || '')) || null,
        campaignName, accountName, status, active: status === 'ACTIVE', kind,
        budgetCents: kind === 'DAILY' ? metaMinorToCents(daily, currency) : kind === 'LIFETIME' ? metaMinorToCents(lifetime, currency) : null,
        remainingCents: remaining === null ? null : metaMinorToCents(remaining, currency),
        lifetimeSpentCents: remaining === null ? null : metaMinorToCents(lifetime - remaining, currency),
        endDate: dayOf(raw?.stop_time || raw?.end_time)
    };
};

/** Lo que un objeto gastaría de `start` a `deadline`, con un presupuesto dado (si no, el que tiene). */
const projectOne = (object, { start, deadline }, budgetCents = object.budgetCents) => {
    if (!object.active || !object.kind || !budgetCents) return 0;
    const end = object.endDate && object.endDate < deadline ? object.endDate : deadline;
    if (end < start) return 0;
    if (object.kind === 'DAILY') return budgetCents * (daysBetween(start, end) + 1);
    const remaining = Math.max(budgetCents - (object.lifetimeSpentCents ?? 0), 0);
    if (!object.endDate || object.endDate <= deadline) return remaining;
    // Un presupuesto total que sigue después del límite: solo la parte proporcional a estos días.
    return Math.round(remaining * ((daysBetween(start, deadline) + 1) / (daysBetween(start, object.endDate) + 1)));
};

export const projectMetaSpend = ({ objects, start, deadline }) => {
    const byId = new Map(objects.map((object) => [object.id, projectOne(object, { start, deadline })]));
    return { byId, totalCents: [...byId.values()].reduce((sum, value) => sum + value, 0) };
};

/** Desde qué día se estima: el gasto leído llega hasta `asOf`; si se leyó hoy, hoy cuenta completo. */
export const projectionStart = ({ asOf, today }) => (asOf && asOf < today ? addDays(asOf, 1) : today);

const KIND_LABEL = { DAILY: 'diario', LIFETIME: 'total' };

/**
 * Cuando Meta no acepta un cambio. Los códigos 10, 190 y 200–299 son de permisos o de la llave; lo demás se dice con las
 * palabras de Meta («Meta no aceptó» solo se dice de lo que dijo Meta).
 */
export const humanizeMetaBudgetError = (error) => {
    const code = Number(error?.code);
    if (code === 190) return 'La llave de Meta de la plataforma venció o la retiraron: hay que renovarla antes de cambiar presupuestos.';
    if (code === 10 || (code >= 200 && code <= 299)) return 'Meta no deja que la plataforma cambie presupuestos en esa cuenta: el usuario del sistema necesita permiso para administrar sus campañas.';
    if (error?.name === 'AbortError' || ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(String(error?.code))) return 'No se pudo llegar a Meta. Inténtalo de nuevo en un momento: el presupuesto no cambió.';
    const message = String(error?.userMessage || error?.message || '').trim();
    if (error?.name !== 'MetaGraphError') return message ? `No se pudo cambiar el presupuesto: ${message}` : 'No se pudo cambiar el presupuesto.';
    return message ? `Meta no aceptó el cambio: ${message}` : 'Meta no aceptó el cambio y no dijo por qué.';
};

/**
 * ¿Se puede cambiar el presupuesto de este objeto a `newCents`? Devuelve el problema con su estado HTTP, o lo que hay que
 * mandarle a Meta. `budget`: la pauta evaluada (moneda, lo disponible, lo gastado y su fecha, hoy y el límite de gasto).
 */
export const metaBudgetChange = ({ budget, objects, objectId, kind, newCents, expectedCents }) => {
    const fail = (status, problem, extra = {}) => ({ status, problem, ...extra });
    const object = objects.find((item) => item.id === String(objectId));
    if (!object) return fail(404, 'Esa campaña ya no está ligada a la pauta o Meta no la devolvió. Actualiza y vuelve a intentarlo.');
    if (budget.status !== 'ACTIVA') return fail(409, 'La pauta no está activa: actívala antes de ajustar su presupuesto en Meta.');
    if (!object.kind) return fail(422, `«${object.name}» no tiene presupuesto propio: lo llevan sus conjuntos de anuncios.`);
    if (kind !== object.kind) return fail(422, `«${object.name}» tiene presupuesto ${KIND_LABEL[object.kind]}: Meta no deja cambiarlo a ${KIND_LABEL[kind] || 'otro tipo'}.`);
    const money = (cents) => formatAdMoney(cents, budget.currency);
    if (Math.round(Number(expectedCents)) !== object.budgetCents) {
        return fail(409, `El presupuesto de «${object.name}» cambió en Meta mientras tanto: ahora es ${money(object.budgetCents)}. Revísalo y vuelve a intentarlo.`, { currentCents: object.budgetCents });
    }
    const converted = centsToMetaMinor(newCents, budget.currency);
    if (converted.problem) return fail(422, converted.problem);
    if (object.kind === 'LIFETIME' && newCents <= (object.lifetimeSpentCents ?? 0)) {
        return fail(422, `Meta ya gastó ${money(object.lifetimeSpentCents)} de ese presupuesto total: el nuevo tiene que ser mayor.`);
    }

    const window = { start: projectionStart(budget), deadline: budget.deadline };
    const { byId, totalCents: beforeCents } = projectMetaSpend({ objects, ...window });
    const ownBefore = byId.get(object.id) || 0;
    const ownAfter = projectOne(object, window, newCents);
    const afterCents = beforeCents - ownBefore + ownAfter;
    const allowedCents = budget.availableCents + toleranceCents(budget.currency) - budget.spentCents;
    const result = { status: 200, problem: null, object, field: object.kind === 'DAILY' ? 'daily_budget' : 'lifetime_budget', minor: converted.minor, beforeCents, afterCents, allowedCents };
    if (afterCents <= beforeCents || afterCents <= allowedCents) return result;

    // Lo máximo para este objeto con lo que gastan los demás.
    const room = allowedCents - (beforeCents - ownBefore);
    let maxCents = null;
    if (room > 0 && ownAfter > 0) {
        const end = object.endDate && object.endDate < window.deadline ? object.endDate : window.deadline;
        if (object.kind === 'DAILY') maxCents = Math.floor(room / (daysBetween(window.start, end) + 1));
        else maxCents = (object.lifetimeSpentCents ?? 0) + Math.floor(room * (ownAfter ? (newCents - (object.lifetimeSpentCents ?? 0)) / ownAfter : 1));
        maxCents -= maxCents % (100 / unitsOf(budget.currency));
    }
    const left = Math.max(budget.availableCents - budget.spentCents, 0);
    const limit = maxCents && maxCents > 0
        ? ` Para no pasarse, «${object.name}» puede tener como máximo ${money(maxCents)}${object.kind === 'DAILY' ? ' diarios' : ' en total'}.`
        : ' Con lo que ya gastan las demás campañas no hay espacio para subirlo.';
    return fail(422, `Con ese presupuesto la pauta gastaría unos ${money(afterCents)} hasta el ${shortDay(window.deadline)} y quedan ${money(left)} del ciclo.${limit} Si el cliente aprobó más, sube primero el presupuesto de la pauta.`, { maxCents, afterCents, allowedCents });
};
