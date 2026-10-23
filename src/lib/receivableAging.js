// Antigüedad de las cuentas por cobrar (Elisa, 23 de octubre de 2026: «en las cuentas por cobrar sería
// genial lo del tiempo, los que deben 30 días, 60, o más»). La leen el resumen y la lista de Cuentas por
// cobrar; nunca cambia un saldo, solo lo ordena por cuánto lleva esperando.
//
// La antigüedad se cuenta desde que la cuenta se volvió exigible: su vencimiento si lo tiene; si no, desde
// que se emitió la cuenta de cobro y, sin documento, desde el inicio del periodo que cobra. Una cuenta que
// todavía no vence va aparte, «Por vencer»: no es mora (AGENTS.md §8).

export const AGING_BUCKETS = Object.freeze([
    { key: 'POR_VENCER', label: 'Por vencer', maxDays: -1 },
    { key: 'HASTA_30', label: 'Hasta 30 días', maxDays: 30 },
    { key: 'DE_31_A_60', label: '31 a 60 días', maxDays: 60 },
    { key: 'DE_61_A_90', label: '61 a 90 días', maxDays: 90 },
    { key: 'MAS_DE_90', label: 'Más de 90 días', maxDays: Infinity }
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

/** Lo que de verdad se debe: saldo positivo, sin verificar pendiente y sin estar cerrada. */
export const isOpenReceivable = (item) => !!item
    && !item.balanceReviewRequired
    && !['PAGADO', 'SALDADO'].includes(item.status)
    && Number(item.outstanding) > 0.005;

/** Días desde que la cuenta se volvió exigible; negativo si todavía no vence. */
export const receivableAgeDays = (item, today = bogotaToday()) => {
    const start = civilDay(item?.dueDate) ?? civilDay(item?.issuedAt) ?? civilDay(item?.period);
    const now = civilDay(today);
    if (start === null || now === null) return null;
    return Math.round((now - start) / DAY_MS);
};

export const agingBucketOf = (item, today = bogotaToday()) => {
    if (!isOpenReceivable(item)) return null;
    const days = receivableAgeDays(item, today);
    if (days === null) return null;
    if (days < 0) return 'POR_VENCER';
    return AGING_BUCKETS.find((bucket) => bucket.maxDays >= days && bucket.key !== 'POR_VENCER').key;
};

export const agingBucketLabel = (key) => AGING_BUCKETS.find((bucket) => bucket.key === key)?.label || '';

const cents = (value) => Math.round((Number(value) || 0) * 100);

/** Cuánto se debe en cada tramo. Un saldo por verificar no entra: no es deuda confirmada. */
export const summarizeAging = (items = [], today = bogotaToday()) => {
    const totals = new Map(AGING_BUCKETS.map((bucket) => [bucket.key, { cents: 0, count: 0 }]));
    let totalCents = 0;
    let count = 0;
    for (const item of items) {
        const key = agingBucketOf(item, today);
        if (!key) continue;
        const slot = totals.get(key);
        slot.cents += cents(item.outstanding);
        slot.count += 1;
        totalCents += cents(item.outstanding);
        count += 1;
    }
    return {
        total: totalCents / 100,
        count,
        buckets: AGING_BUCKETS.map((bucket) => ({ key: bucket.key, label: bucket.label, amount: totals.get(bucket.key).cents / 100, count: totals.get(bucket.key).count }))
    };
};

/** El tramo más viejo de un grupo de cuentas: el que dice cuánto lleva esperando ese tercero. */
export const oldestAgingBucket = (items = [], today = bogotaToday()) => {
    const order = AGING_BUCKETS.map((bucket) => bucket.key);
    return items.reduce((oldest, item) => {
        const key = agingBucketOf(item, today);
        if (!key) return oldest;
        return oldest === null || order.indexOf(key) > order.indexOf(oldest) ? key : oldest;
    }, null);
};
