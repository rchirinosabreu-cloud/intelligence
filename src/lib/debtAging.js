// Antigüedad de lo que se debe (Elisa, 23 de octubre de 2026: «en las cuentas por cobrar sería genial lo
// del tiempo, los que deben 30 días, 60, o más»; el modelo que mandó: «0–30 días · 31–60 días · 60+ días»
// y el total, con cuántos terceros tienen saldo). Una sola regla para Cuentas por cobrar y Cuentas por
// pagar; nunca cambia un saldo, solo lo ordena por cuánto lleva abierto.
//
// La antigüedad es la del documento: desde que se emitió la cuenta de cobro (o, sin documento, desde el
// inicio del periodo que cobra) y, en lo que se paga, desde que llegó la cuenta del tercero. El
// vencimiento es otra cosa y se sigue diciendo en cada cuenta.

export const AGING_BUCKETS = Object.freeze([
    { key: 'DE_0_A_30', label: '0–30 días', maxDays: 30, tone: 'neutral' },
    { key: 'DE_31_A_60', label: '31–60 días', maxDays: 60, tone: 'warning' },
    { key: 'MAS_DE_60', label: 'Más de 60 días', maxDays: Infinity, tone: 'danger' }
]);

const DAY_MS = 24 * 60 * 60 * 1000;
const civilDay = (value) => {
    if (!value) return null;
    const text = value instanceof Date ? value.toISOString() : String(value);
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
    if (!match) return null;
    const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(time) ? null : time;
};

export const bogotaToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

/** Desde cuándo cuenta una cuenta por cobrar: su emisión o, sin documento, su periodo. */
export const receivableAgeStart = (item) => item?.issuedAt || item?.period || null;
/** Desde cuándo cuenta una cuenta por pagar: el día que llegó. */
export const payableAgeStart = (item) => item?.receivedAt || null;

/** Lo que de verdad se debe: saldo positivo, sin verificar pendiente y sin estar cerrada. */
export const isOpenDebt = (item) => !!item
    && !item.balanceReviewRequired
    && !['PAGADO', 'SALDADO', 'PAGADA', 'ANULADA'].includes(item.status)
    && Number(item.outstanding) > 0.005;

export const debtAgeDays = (item, today = bogotaToday(), startOf = receivableAgeStart) => {
    const start = civilDay(startOf(item));
    const now = civilDay(today);
    if (start === null || now === null) return null;
    return Math.max(Math.round((now - start) / DAY_MS), 0);
};

export const agingBucketOf = (item, today = bogotaToday(), startOf = receivableAgeStart) => {
    if (!isOpenDebt(item)) return null;
    const days = debtAgeDays(item, today, startOf);
    if (days === null) return null;
    return AGING_BUCKETS.find((bucket) => days <= bucket.maxDays).key;
};

export const agingBucketLabel = (key) => AGING_BUCKETS.find((bucket) => bucket.key === key)?.label || '';
export const agingBucketTone = (key) => AGING_BUCKETS.find((bucket) => bucket.key === key)?.tone || 'neutral';

const cents = (value) => Math.round((Number(value) || 0) * 100);

/**
 * Cuánto se debe en cada tramo, el total y cuántos terceros tienen saldo (`partyOf` dice de quién es
 * cada cuenta). Un saldo por verificar no entra: no es deuda confirmada.
 */
export const summarizeAging = (items = [], { today = bogotaToday(), startOf = receivableAgeStart, partyOf = (item) => item.clientId || item.clientName || item.id } = {}) => {
    const totals = new Map(AGING_BUCKETS.map((bucket) => [bucket.key, { cents: 0, count: 0 }]));
    const parties = new Set();
    let totalCents = 0;
    let count = 0;
    for (const item of items) {
        const key = agingBucketOf(item, today, startOf);
        if (!key) continue;
        const slot = totals.get(key);
        slot.cents += cents(item.outstanding);
        slot.count += 1;
        totalCents += cents(item.outstanding);
        count += 1;
        parties.add(partyOf(item));
    }
    return {
        total: totalCents / 100,
        count,
        parties: parties.size,
        buckets: AGING_BUCKETS.map((bucket) => ({ key: bucket.key, label: bucket.label, tone: bucket.tone, amount: totals.get(bucket.key).cents / 100, count: totals.get(bucket.key).count }))
    };
};

/** El tramo más viejo de un grupo de cuentas: cuánto lleva esperando ese tercero. */
export const oldestAgingBucket = (items = [], today = bogotaToday(), startOf = receivableAgeStart) => {
    const order = AGING_BUCKETS.map((bucket) => bucket.key);
    return items.reduce((oldest, item) => {
        const key = agingBucketOf(item, today, startOf);
        if (!key) return oldest;
        return oldest === null || order.indexOf(key) > order.indexOf(oldest) ? key : oldest;
    }, null);
};
