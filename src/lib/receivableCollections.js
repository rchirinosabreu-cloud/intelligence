// Protocolos de cartera (punto 7 de la solicitud de Elisa; decisiones de Rodny, 28 de octubre de 2026): avisar a tiempo
// cuando un cliente se atrasa, sin revelar cifras a quien no las necesita.
//
// - Una cuenta vence en la fecha puesta a mano o, si no tiene, 15 días después de emitida («15 días después de emitida,
//   plazo máximo para pagar»); sin emitir —casi todas las que vinieron del Excel—, 15 días después de empezar el mes
//   que cobra.
// - Fee mensual: desde la segunda mensualidad vencida, aviso; mientras siga igual, se repite cada 7 días. Una vencida más
//   abre otro ciclo y avisa de una vez.
// - Servicio puntual: 15 días después del vencimiento, aviso; después, cada 7 días hasta que se pague.
// Todos los plazos se cambian desde la plataforma (Rodny: «dejar las fechas flexibles» para ajustarlas con Francisco).
//
// Lógica pura: la usan el reloj que avisa, la banda y las pruebas. Los días son días civiles de Bogotá («AAAA-MM-DD»).

// Nacen apagados (28 de octubre de 2026): la primera lectura de producción habría soltado 19 avisos de una vez, varios de
// saldos del Excel que probablemente ya no son deuda. Administración limpia y un administrador los enciende.
export const DEFAULT_COLLECTION_SETTINGS = Object.freeze({ enabled: false, paymentTermDays: 15, monthlyAlertCount: 2, oneOffFirstAlertDays: 15, repeatDays: 7 });

const LIMITS = {
    paymentTermDays: { min: 1, max: 120, problem: 'El plazo para pagar va de 1 a 120 días.' },
    monthlyAlertCount: { min: 1, max: 12, problem: 'Las mensualidades vencidas para avisar van de 1 a 12.' },
    oneOffFirstAlertDays: { min: 0, max: 120, problem: 'El primer aviso de un servicio puntual va de 0 a 120 días después del vencimiento.' },
    repeatDays: { min: 1, max: 60, problem: 'Cada cuántos días se repite el aviso: de 1 a 60.' }
};

/** Los plazos que se pueden guardar, o el motivo en palabras de por qué no. */
export const normalizeCollectionSettings = (input = {}) => {
    const value = { enabled: input.enabled === undefined || input.enabled === null ? DEFAULT_COLLECTION_SETTINGS.enabled : input.enabled === true };
    for (const [key, limit] of Object.entries(LIMITS)) {
        const raw = input[key] ?? DEFAULT_COLLECTION_SETTINGS[key];
        const number = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
        if (!Number.isInteger(number) || number < limit.min || number > limit.max) return { value: null, problem: limit.problem };
        value[key] = number;
    }
    return { value, problem: null };
};

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED = new Set(['PAGADO', 'SALDADO']);
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const civilKey = (value) => {
    if (!value) return null;
    const text = value instanceof Date ? value.toISOString() : String(value);
    return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
};
const bogotaKey = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
};
const dayNumber = (key) => Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10))) / DAY_MS;
const addDays = (key, days) => new Date((dayNumber(key) + days) * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);
const toCents = (value) => Math.round((Number(value) || 0) * 100);

/** Cuándo vence una cuenta y de dónde sale esa fecha. */
export const receivableDueDate = (receivable, settings = DEFAULT_COLLECTION_SETTINGS) => {
    const manual = civilKey(receivable?.dueDate);
    if (manual) return { date: manual, source: 'VENCIMIENTO' };
    const issued = bogotaKey(receivable?.issuedAt);
    if (issued) return { date: addDays(issued, settings.paymentTermDays), source: 'EMISION' };
    // Una cuota de una cotización aprobada que vence con un hito («al finalizar») o tras el inicio todavía no tiene fecha:
    // no vence hasta que se emita su cuenta de cobro (formalización, 29 de octubre de 2026).
    if (receivable?.metadata?.waitsForMilestone) return null;
    const period = civilKey(receivable?.period);
    if (period) return { date: addDays(period, settings.paymentTermDays), source: 'PERIODO' };
    return null;
};

/** Lo que falta por pagar en centavos: el valor menos todo lo aplicado vigente (dinero, ajustes y retenciones). */
export const openBalanceCents = (receivable) => {
    if (!receivable || CLOSED.has(receivable.status)) return 0;
    const applied = (receivable.payments || []).reduce((sum, payment) => sum + (payment.reversedAt ? 0 : toCents(payment.amount)), 0);
    return Math.max(toCents(receivable.amount) - applied, 0);
};

/** Las cuentas de cliente con saldo cuyo día de pago ya pasó, de la más vieja a la más nueva. */
export const overdueReceivables = (receivables = [], today, settings = DEFAULT_COLLECTION_SETTINGS) => receivables
    .filter((receivable) => (receivable.kind || 'CLIENTE') === 'CLIENTE')
    .map((receivable) => ({ receivable, due: receivableDueDate(receivable, settings), balanceCents: openBalanceCents(receivable) }))
    .filter(({ due, balanceCents }) => due && balanceCents > 0 && due.date < today)
    .sort((a, b) => a.due.date.localeCompare(b.due.date))
    .map(({ receivable, due, balanceCents }) => ({
        id: receivable.id, dueDate: due.date, dueSource: due.source, balanceCents,
        number: receivable.number ?? null, period: civilKey(receivable.period)?.slice(0, 7) || null, issued: Boolean(receivable.issuedAt)
    }));

/** El aviso de un cliente de fee mensual, o null si todavía no toca. */
export const monthlyCollectionAlert = ({ clientId, receivables = [], today, settings = DEFAULT_COLLECTION_SETTINGS }) => {
    const overdue = overdueReceivables(receivables, today, settings);
    if (overdue.length < settings.monthlyAlertCount) return null;
    // El ciclo empieza el día en que se venció la última de las que hoy están vencidas.
    const start = addDays(overdue[overdue.length - 1].dueDate, 1);
    return {
        kind: 'MENSUAL', subjectId: clientId, count: overdue.length,
        cycle: `M${overdue.length}:${start}`, step: Math.floor(daysBetween(start, today) / settings.repeatDays),
        balanceCents: overdue.reduce((sum, item) => sum + item.balanceCents, 0),
        oldestPeriod: overdue[0].period, unissued: overdue.filter((item) => !item.issued).length,
        receivableIds: overdue.map((item) => item.id)
    };
};

/** Los avisos de las cuentas de un cliente de servicios puntuales: uno por cuenta vencida que ya toca. */
export const oneOffCollectionAlerts = ({ receivables = [], today, settings = DEFAULT_COLLECTION_SETTINGS }) => overdueReceivables(receivables, today, settings)
    .map((item) => {
        const start = addDays(item.dueDate, settings.oneOffFirstAlertDays);
        if (start > today) return null;
        return {
            kind: 'UNICO', subjectId: item.id, cycle: `U:${item.dueDate}`, step: Math.floor(daysBetween(start, today) / settings.repeatDays),
            daysOverdue: daysBetween(item.dueDate, today), balanceCents: item.balanceCents, number: item.number, period: item.period,
            receivableIds: [item.id]
        };
    })
    .filter(Boolean);

const money = (cents) => `$${String(Math.round(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
const monthName = (period) => (period ? MONTHS[Number(period.slice(5, 7)) - 1] : null);
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const whichAccount = (alert) => (alert.number
    ? `la cuenta de cobro No. ${String(alert.number).padStart(4, '0')}`
    : `la cuenta de ${monthName(alert.period) || 'cobro'} (sin emitir)`);

/** Lo que dice la banda (solo Administración la recibe): con las cifras. */
export const collectionNoticeText = (alert, clientName) => {
    const who = clientName || 'El cliente';
    if (alert.kind === 'MENSUAL') {
        const since = monthName(alert.oldestPeriod);
        return {
            kind: 'CARTERA_MENSUAL', level: 'IMPORTANTE', label: 'Cartera vencida',
            message: `${who} tiene ${plural(alert.count, 'mensualidad vencida', 'mensualidades vencidas')}${since ? ` desde ${since}` : ''}: ${money(alert.balanceCents)} pendientes`
        };
    }
    return {
        kind: 'CARTERA_UNICO', level: 'SEGUIMIENTO', label: 'Cartera · servicio puntual',
        message: `${who} lleva ${plural(alert.daysOverdue, 'día', 'días')} vencida ${whichAccount(alert)}: ${money(alert.balanceCents)} pendientes`
    };
};

/**
 * Lo que dice la campana, que también llega al celular: nunca cifras. Al project manager, ni siquiera cuántas
 * mensualidades: solo lo que necesita para decidir la ejecución (el documento: «sin revelar los valores económicos»).
 */
export const collectionBellText = (alert, clientName, audience) => {
    const who = clientName || 'Un cliente';
    if (audience === 'PM') return `${who} tiene pagos atrasados: puede pausarse la producción de contenidos.`;
    if (alert.kind === 'MENSUAL') return `${who} tiene ${plural(alert.count, 'mensualidad vencida', 'mensualidades vencidas')}. Hay riesgo de suspender el servicio.`;
    return `${who} lleva ${plural(alert.daysOverdue, 'día', 'días')} con ${whichAccount(alert)} vencida.`;
};
