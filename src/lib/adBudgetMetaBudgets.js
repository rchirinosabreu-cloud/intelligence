// Lo que Meta tiene configurado en las campañas de una pauta (Pautas, 12 de noviembre de 2026). Lógica pura, la usan el
// servidor y la pantalla.
//
// Lo leído en la referencia de Meta (Marketing API, campañas y conjuntos de anuncios):
// - El presupuesto vive en la campaña **o** en sus conjuntos, nunca en los dos: `daily_budget` (diario) o
//   `lifetime_budget` (total), en la unidad mínima de la moneda de la cuenta. El peso no tiene subunidad en Meta (se cuenta
//   en pesos enteros); el dólar se cuenta en centavos. `budget_remaining` dice cuánto le queda a un presupuesto total.
//
// El presupuesto **se cambia en el Administrador de anuncios de Meta, nunca desde la plataforma** (Rodny, 13 de noviembre
// de 2026: «el tope está establecido en Meta, no se puede manipular desde la plataforma»). Lo que se hace aquí es leerlo,
// estimar cuánto gastaría la pauta hasta su límite de gasto y avisar cuando no cuadra con lo aprobado en el contrato.
import { addDays, daysBetween, toleranceCents } from './adBudgets.js';

const MINOR_PER_UNIT = Object.freeze({ COP: 1, USD: 100 });
const unitsOf = (currency) => MINOR_PER_UNIT[currency] ?? 1;

/** De la unidad de Meta (pesos enteros, centavos de dólar) a los centavos de la plataforma. */
export const metaMinorToCents = (minor, currency = 'COP') => Math.round((Number(minor) || 0) * (100 / unitsOf(currency)));

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

/** Lo que un objeto gastaría de `start` a `deadline` con el presupuesto que tiene. */
const projectOne = (object, { start, deadline }) => {
    const budgetCents = object.budgetCents;
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

/**
 * Lo que la pauta gastaría con lo configurado en Meta, tal como se guarda en el ciclo en cada lectura (cada dos horas y con
 * «Actualizar ahora»). Así el aviso no tiene que preguntarle a Meta: lo que cambie alguien en el Administrador de anuncios se
 * ve en la siguiente lectura.
 */
export const metaForecastRecord = ({ objects = [], problems = [], asOf, today, deadline, at }) => {
    const start = projectionStart({ asOf, today });
    const { byId, totalCents } = projectMetaSpend({ objects, start, deadline });
    return {
        on: today, at, start, deadline, projectedCents: totalCents, problems,
        objects: objects.filter((object) => object.kind).map((object) => ({
            id: object.id, name: object.name, level: object.level, campaignName: object.campaignName || null,
            status: object.status, kind: object.kind, budgetCents: object.budgetCents, projectedCents: byId.get(object.id) || 0, endDate: object.endDate || null
        }))
    };
};

/**
 * ¿Se pasaría la pauta con lo que tiene Meta? Solo con una lectura de hoy o de ayer del mismo ciclo, con la pauta activa y
 * todavía antes del límite de gasto. Si ya se pasó, eso lo dice otro aviso. Devuelve lo que gastaría en total y por cuánto
 * se pasaría, o `null`.
 */
export const metaForecastExcess = ({ forecast, evaluation: e, status, today, currency }) => {
    if (!forecast || forecast.problem || !Number.isFinite(forecast.projectedCents)) return null;
    if (status !== 'ACTIVA' || e.closed || !['AL_DIA', 'ATRASADA', 'RAPIDA', 'SIN_GASTO', 'COMPLETA'].includes(e.state)) return null;
    if (forecast.deadline !== e.deadline || !today || today > e.deadline || forecast.on < addDays(today, -1)) return null;
    const totalCents = e.spentCents + forecast.projectedCents;
    const overCents = totalCents - e.availableCents;
    return overCents > toleranceCents(currency) ? { totalCents, overCents, deadline: e.deadline, projectedCents: forecast.projectedCents } : null;
};
