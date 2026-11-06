// Pautas (reunión del 6 de noviembre de 2026; Francisco: «yo necesito también tener apartado de pauta … tienes que
// tener cierre global del cliente»). El problema que dejó la reunión: se seguía anuncio por anuncio, cada uno con sus
// fechas, y nadie veía el gasto del cliente contra su presupuesto del mes. Hubo meses de 118 dólares con 300 aprobados y
// pautas que se apagaban antes del cierre o se pasaban de él.
//
// Lo que manda aquí:
// - **Un presupuesto global por cliente y marca, y un ciclo que es el del cliente**: del día de corte de su contrato al día
//   anterior del mes siguiente, el mismo de Operación. Un anuncio puede terminar antes; el gasto se cierra con el cliente.
// - **Lo que no se gastó pasa al ciclo siguiente** (y lo gastado de más se resta), salvo que alguien lo ajuste con motivo.
// - **Se gasta hasta dos días antes del cierre**: «no lo pongas al 30, ponlo hasta 28», para que el informe salga con la
//   cifra completa.
// - **Hay que llegar exacto**: «lo único que te puedes quitar son 5.000, 4.000 pesos».
//
// Lógica pura, en centavos: la leen la pantalla, el servidor y las pruebas. El gasto lo escribe quien lleva la pauta
// mirando Meta; esta primera versión no se conecta a Meta («no hace falta … después lo complejiza»).
import { cycleForDate, cycleOf, previousCycle } from './clientOperations.js';

export const AD_PLATFORMS = Object.freeze([
    Object.freeze({ value: 'META', label: 'Meta' }),
    Object.freeze({ value: 'GOOGLE', label: 'Google' }),
    Object.freeze({ value: 'TIKTOK', label: 'TikTok' }),
    Object.freeze({ value: 'LINKEDIN', label: 'LinkedIn' }),
    Object.freeze({ value: 'OTRA', label: 'Otra' })
]);

export const AD_BUDGET_KINDS = Object.freeze([
    Object.freeze({ value: 'MENSUAL', label: 'Mensual' }),
    Object.freeze({ value: 'ESPECIFICA', label: 'Específica' })
]);

// Quién paga importa para cobrar: con la tarjeta de Brain Studio, Administración tiene que recuperar ese gasto.
export const AD_PAYERS = Object.freeze([
    Object.freeze({ value: 'POR_DEFINIR', label: 'Por definir' }),
    Object.freeze({ value: 'TARJETA_CLIENTE', label: 'Tarjeta del cliente' }),
    Object.freeze({ value: 'TARJETA_BRAIN', label: 'Tarjeta de Brain Studio' })
]);

export const AD_OBJECTIVES = Object.freeze(['Seguidores', 'Interacción', 'Alcance', 'Mensajes de WhatsApp', 'Ventas', 'Tráfico', 'Reconocimiento', 'Generación de leads', 'Reproducciones', 'Otro']);

export const AD_BUDGET_STATUSES = Object.freeze([
    Object.freeze({ value: 'ACTIVA', label: 'Activa' }),
    Object.freeze({ value: 'PAUSADA', label: 'Pausada' }),
    Object.freeze({ value: 'TERMINADA', label: 'Terminada' })
]);

export const AD_CAMPAIGN_STATUSES = Object.freeze([
    Object.freeze({ value: 'POR_ACTIVAR', label: 'Por activar' }),
    Object.freeze({ value: 'ACTIVA', label: 'Activa' }),
    Object.freeze({ value: 'PAUSADA', label: 'Pausada' }),
    Object.freeze({ value: 'FINALIZADA', label: 'Finalizada' })
]);

export const AD_CURRENCIES = Object.freeze(['COP', 'USD']);

/** Revisar cada tres días y, en los últimos cinco del ciclo, todos los días. */
export const MONITOR_EVERY_DAYS = 3;
export const CLOSE_WINDOW_DAYS = 5;
/** Lo que se reserva antes del cierre para que el informe salga con la cifra completa. */
export const REPORT_MARGIN_DAYS = 2;
export const SPECIFIC_CYCLE_KEY = 'UNICO';
/** Por debajo de esto nadie se va a alarmar: el ritmo no es una línea exacta. */
const PACE_SLACK = 0.15;

const TOLERANCE_CENTS = Object.freeze({ COP: 5_000_00, USD: 2_00 });

export const toCents = (value) => Math.round((Number(value) || 0) * 100);

const toKeyDate = (key) => new Date(`${key}T12:00:00Z`);

export const addDays = (key, days) => {
    const date = toKeyDate(key);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
};

/** Cuántos días hay de `from` a `to`: negativo si `to` es anterior. */
export const daysBetween = (from, to) => Math.round((toKeyDate(to) - toKeyDate(from)) / 86_400_000);

const pad = (value) => String(value).padStart(2, '0');
const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const shortDay = (key) => {
    if (!key) return '';
    const [, month, day] = String(key).split('-').map(Number);
    return `${day} ${SHORT_MONTHS[month - 1]}`;
};

export const toleranceCents = (currency) => TOLERANCE_CENTS[currency] ?? TOLERANCE_CENTS.COP;

export const formatAdMoney = (cents, currency = 'COP') => {
    const amount = (Number(cents) || 0) / 100;
    const negative = amount < 0;
    const digits = Math.abs(amount).toLocaleString('es-CO', { minimumFractionDigits: 0, maximumFractionDigits: currency === 'USD' ? 2 : 0 });
    return `${negative ? '-' : ''}${currency === 'USD' ? 'USD ' : '$ '}${digits}`;
};

const withKey = (cycle) => ({ ...cycle, key: `${cycle.year}-${pad(cycle.month)}` });

export const cycleFromKey = (key, cutDay = 1) => {
    const [year, month] = String(key).split('-').map(Number);
    return withKey(cycleOf(year, month, cutDay));
};

/** El ciclo que corre en un día. Una pauta específica tiene uno solo: sus propias fechas. */
export const adCycleFor = (budget, { cutDay = 1, today }) => {
    if (budget.kind === 'ESPECIFICA') {
        return { key: SPECIFIC_CYCLE_KEY, start: budget.startDate, end: budget.endDate, label: 'Pauta específica', specific: true };
    }
    return withKey(cycleForDate(today, cutDay));
};

export const previousCycleKey = (key, cutDay = 1) => {
    if (key === SPECIFIC_CYCLE_KEY) return null;
    const [year, month] = String(key).split('-').map(Number);
    return withKey(previousCycle({ year, month }, cutDay)).key;
};

/** Hasta qué día debe ir el gasto: dos días antes del cierre, para hacer el informe con la cifra completa. */
export const spendDeadline = (cycle) => {
    if (cycle.specific) return cycle.end;
    const deadline = addDays(cycle.end, -REPORT_MARGIN_DAYS);
    return deadline < cycle.start ? cycle.start : deadline;
};

/** El ciclo vigente sale del contrato de inicio más reciente que ya empezó; sin contrato, el mes calendario, y se dice. */
export const clientCutDay = (contracts = [], today) => {
    const current = contracts
        .filter((contract) => contract.startDate && contract.startDate <= today)
        .sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)))[0];
    return current ? { cutDay: current.cutDay || 1, fromContract: true } : { cutDay: 1, fromContract: false };
};

/**
 * El corte de una pauta: el suyo si lo tiene y, si no, el del contrato. Existe porque el cierre de la pauta se ajusta desde
 * Pautas sin mover el contrato, que también manda en el semáforo y los avisos de Operación.
 */
export const budgetCutDay = (budget, today) => {
    if (budget.cutDay) return { cutDay: Number(budget.cutDay), source: 'PAUTA' };
    const { cutDay, fromContract } = clientCutDay(budget.client?.contracts || [], today);
    return { cutDay, source: fromContract ? 'CONTRATO' : 'CALENDARIO' };
};

/**
 * Lo que trae un ciclo del anterior: lo que sobró, o lo gastado de más en negativo. Sin gasto registrado en el ciclo
 * anterior no se sabe y no se inventa: cero, y lo dice `known`. Un ajuste escrito a mano manda sobre la cuenta.
 */
export const carryOverFor = (key, rows = [], cutDay = 1) => {
    const byKey = new Map(rows.map((row) => [row.cycleKey, row]));
    const read = (cycleKey, depth) => {
        const row = byKey.get(cycleKey);
        if (row?.carryOverManual !== null && row?.carryOverManual !== undefined) return { cents: toCents(row.carryOverManual), known: true, manual: depth === 0, final: true };
        const previousKey = previousCycleKey(cycleKey, cutDay);
        const previous = previousKey ? byKey.get(previousKey) : null;
        if (!previous || previous.spent === null || previous.spent === undefined || depth > rows.length) return { cents: 0, known: false, manual: false, final: true };
        const before = read(previousKey, depth + 1);
        return {
            cents: toCents(previous.amount) + before.cents - toCents(previous.spent),
            known: true,
            manual: false,
            final: Boolean(previous.closedAt)
        };
    };
    return read(key, 0);
};

/** Cuándo se acabaría el saldo a este ritmo, o null si no se puede decir. */
const runOutDate = ({ balanceCents, spentCents, elapsed, asOf }) => {
    if (spentCents <= 0 || elapsed <= 0 || balanceCents <= 0) return null;
    return addDays(asOf, Math.floor(balanceCents / (spentCents / elapsed)));
};

/** Lo que pide atención en una campaña: seguir activa pasada su fecha o terminar después del cierre del cliente. */
export const campaignFlags = (campaign, cycle, today) => {
    if (campaign.status !== 'ACTIVA' || !campaign.endDate) return [];
    if (campaign.endDate < today) return [{ code: 'VENCIDA', text: `Debía terminar el ${shortDay(campaign.endDate)}: confirma que está apagada.` }];
    if (cycle && !cycle.specific && campaign.endDate > cycle.end) return [{ code: 'PASA_EL_CIERRE', text: `Termina el ${shortDay(campaign.endDate)}, después del cierre del ${shortDay(cycle.end)}.` }];
    return [];
};

const STATES = Object.freeze({
    PAUSADA: { level: 'gray', label: 'Pausada' },
    TERMINADA: { level: 'gray', label: 'Terminada' },
    POR_EMPEZAR: { level: 'gray', label: 'Por empezar' },
    CERRADO: { level: 'gray', label: 'Ciclo cerrado' },
    POR_CERRAR: { level: 'yellow', label: 'Falta el gasto final' },
    PASADA: { level: 'red', label: 'Se pasó' },
    COMPLETA: { level: 'green', label: 'Gastada' },
    SIN_GASTO: { level: 'yellow', label: 'Sin gasto registrado' },
    ATRASADA: { level: 'yellow', label: 'Va atrasada' },
    RAPIDA: { level: 'yellow', label: 'Va muy rápido' },
    AL_DIA: { level: 'green', label: 'Al día' }
});

/**
 * Cómo va un ciclo. Compara el gasto con el ritmo parejo hasta dos días antes del cierre, medido en el día de la última
 * lectura: comparar una cifra de hace una semana con el ritmo de hoy diría «atrasada» de lo que solo está sin actualizar.
 */
export const evaluateAdCycle = ({ budget, cycle, row = null, carry = { cents: 0, known: false }, campaigns = [], today }) => {
    const currency = budget.currency || 'COP';
    const tolerance = toleranceCents(currency);
    const amountCents = toCents(row?.amount ?? budget.amount);
    const availableCents = Math.max(amountCents + (carry.cents || 0), 0);
    const hasReading = row?.spent !== null && row?.spent !== undefined;
    const spentCents = hasReading ? toCents(row.spent) : 0;
    const balanceCents = availableCents - spentCents;
    const deadline = spendDeadline(cycle);
    const daysToClose = daysBetween(today, cycle.end);
    const daysToDeadline = Math.max(daysBetween(today, deadline), 0);
    const totalDays = Math.max(daysBetween(cycle.start, deadline) + 1, 1);
    const asOf = hasReading && row.spentAsOf ? row.spentAsOf : today;
    const elapsed = Math.min(Math.max(daysBetween(cycle.start, asOf) + 1, 0), totalDays);
    const expectedCents = Math.round(availableCents * (elapsed / totalDays));
    const daysLeftFromReading = Math.max(daysBetween(asOf, deadline), 0);
    const dailyNeededCents = daysLeftFromReading > 0 && balanceCents > 0 ? Math.ceil(balanceCents / daysLeftFromReading) : 0;
    const percent = availableCents > 0 ? Math.round((spentCents / availableCents) * 100) : 0;
    const ended = today > cycle.end;
    const started = today >= cycle.start;
    const closed = Boolean(row?.closedAt);
    const complete = Math.abs(balanceCents) <= tolerance && availableCents > 0;
    const closingWindow = started && !ended && daysToClose <= CLOSE_WINDOW_DAYS;
    const money = (cents) => formatAdMoney(cents, currency);
    const reasons = [];

    let state;
    if (budget.status === 'TERMINADA') state = 'TERMINADA';
    else if (budget.status === 'PAUSADA') state = 'PAUSADA';
    else if (closed) state = 'CERRADO';
    else if (!started) state = 'POR_EMPEZAR';
    else if (ended) {
        state = 'POR_CERRAR';
        reasons.push(`El ciclo terminó el ${shortDay(cycle.end)}: registra el gasto final.`);
    } else if (balanceCents < -tolerance) {
        state = 'PASADA';
        reasons.push(`Se pasó por ${money(-balanceCents)}: revisa las campañas activas.`);
    } else if (complete) state = 'COMPLETA';
    else if (!hasReading) {
        state = 'SIN_GASTO';
        reasons.push('Todavía no hay gasto registrado en este ciclo.');
    } else {
        const shortfall = expectedCents - spentCents;
        const runOut = runOutDate({ balanceCents, spentCents, elapsed, asOf });
        if (shortfall > Math.max(tolerance, expectedCents * PACE_SLACK)) {
            state = 'ATRASADA';
            reasons.push(dailyNeededCents
                ? `Va atrasada: hay que gastar ${money(dailyNeededCents)} por día hasta el ${shortDay(deadline)}.`
                : `No alcanzó a gastarse: quedan ${money(balanceCents)}.`);
        } else if (runOut && runOut < deadline && -shortfall > Math.max(tolerance, expectedCents * PACE_SLACK)) {
            state = 'RAPIDA';
            reasons.push(`A este ritmo el saldo se acaba el ${shortDay(runOut)}, antes del ${shortDay(deadline)}.`);
        } else state = 'AL_DIA';
    }

    const running = started && !ended && !closed && budget.status === 'ACTIVA';
    const flags = budget.status === 'ACTIVA' ? campaigns.flatMap((campaign) => campaignFlags(campaign, cycle, today).map((flag) => ({ ...flag, campaignId: campaign.id, campaignName: campaign.name }))) : [];
    for (const flag of flags) reasons.push(`«${flag.campaignName}»: ${flag.text}`);
    // Una pauta mensual no puede quedarse sin nada corriendo con plata por gastar: «se caían dos días antes».
    const noneRunning = running && !complete && balanceCents > tolerance && campaigns.length > 0 && !campaigns.some((campaign) => campaign.status === 'ACTIVA' && (!campaign.endDate || campaign.endDate >= today));
    if (noneRunning) reasons.push('No hay ninguna campaña activa y queda saldo por gastar.');

    const lastCheck = hasReading && row.spentAsOf ? row.spentAsOf : cycle.start;
    const daysSinceReading = started ? Math.max(daysBetween(lastCheck, today), 0) : 0;
    const interval = closingWindow ? 1 : MONITOR_EVERY_DAYS;
    const stale = running && !complete && daysSinceReading >= interval;
    const reviewDue = stale || state === 'POR_CERRAR';
    if (stale && hasReading) reasons.push(daysSinceReading === 1 ? 'El gasto se actualizó ayer: en la recta final se revisa cada día.' : `Hace ${daysSinceReading} días no se actualiza el gasto.`);

    const base = STATES[state];
    const level = base.level === 'green' && (flags.length || noneRunning || stale) ? 'yellow' : state === 'ATRASADA' && closingWindow ? 'red' : base.level;
    return {
        state, label: base.label, level, reasons, flags, noneRunning,
        amountCents, carryCents: carry.cents || 0, carryKnown: Boolean(carry.known), carryManual: Boolean(carry.manual), carryFinal: carry.final !== false,
        availableCents, spentCents, balanceCents, expectedCents, dailyNeededCents, percent,
        hasReading, asOf: hasReading ? asOf : null, deadline, daysToClose, daysToDeadline, daysSinceReading, closingWindow, closed, complete, reviewDue
    };
};

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const isKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const isCycleKey = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));
const inList = (list, value) => list.some((item) => item.value === value);

/** Qué le falta a una pauta para guardarse. La misma frase en la pantalla y en el servidor. */
export const adBudgetProblem = (input = {}) => {
    if (!clean(input.clientId)) return 'Elige el cliente.';
    if (!inList(AD_PLATFORMS, input.platform)) return 'Elige la plataforma.';
    if (!inList(AD_BUDGET_KINDS, input.kind)) return 'Elige si es mensual o específica.';
    if (!AD_CURRENCIES.includes(input.currency)) return 'Elige la moneda.';
    if (!(Number(input.amount) > 0)) return 'Escribe el presupuesto.';
    if (input.payer && !inList(AD_PAYERS, input.payer)) return 'Elige quién paga.';
    if (input.status && !inList(AD_BUDGET_STATUSES, input.status)) return 'Ese estado no existe.';
    if (input.cutDay && !(Number.isInteger(Number(input.cutDay)) && Number(input.cutDay) >= 1 && Number(input.cutDay) <= 28)) return 'El día de corte va del 1 al 28.';
    if (clean(input.brand).length > 120) return 'El nombre de la marca es muy largo.';
    if (clean(input.notes).length > 1000) return 'La nota no puede pasar de 1000 caracteres.';
    if (input.kind === 'ESPECIFICA') {
        if (!isKey(input.startDate) || !isKey(input.endDate)) return 'Una pauta específica necesita fecha de inicio y de fin.';
        if (input.endDate < input.startDate) return 'La fecha de fin no puede ser anterior a la de inicio.';
    }
    return null;
};

export const adSpendProblem = (input = {}) => {
    if (input.spent === '' || input.spent === null || input.spent === undefined || !(Number(input.spent) >= 0)) return 'Escribe cuánto se ha gastado en el ciclo.';
    if (!isKey(input.readOn)) return 'Elige la fecha de la lectura.';
    if (input.cycleKey && !isCycleKey(input.cycleKey)) return 'Ese ciclo no es válido.';
    if (clean(input.note).length > 500) return 'La nota no puede pasar de 500 caracteres.';
    return null;
};

export const adCycleAmountProblem = (input = {}) => (Number(input.amount) > 0 ? null : 'Escribe el presupuesto de este ciclo.');

export const adCarryOverProblem = (input = {}) => {
    if (input.carryOver === '' || input.carryOver === null || input.carryOver === undefined || !Number.isFinite(Number(input.carryOver))) return 'Escribe el saldo que pasa a este ciclo.';
    if (input.cycleKey && !isCycleKey(input.cycleKey)) return 'Ese ciclo no es válido.';
    if (!clean(input.reason)) return 'Di por qué se ajusta el saldo.';
    if (clean(input.reason).length > 300) return 'El motivo no puede pasar de 300 caracteres.';
    return null;
};

export const adCampaignProblem = (input = {}) => {
    if (!clean(input.name)) return 'Escribe el nombre de la campaña o anuncio.';
    if (clean(input.name).length > 200) return 'El nombre es muy largo.';
    if (input.status && !inList(AD_CAMPAIGN_STATUSES, input.status)) return 'Ese estado no existe.';
    if (input.startDate && !isKey(input.startDate)) return 'La fecha de inicio no es válida.';
    if (input.endDate && !isKey(input.endDate)) return 'La fecha de fin no es válida.';
    if (input.startDate && input.endDate && input.endDate < input.startDate) return 'La fecha de fin no puede ser anterior a la de inicio.';
    if (clean(input.link) && !/^https?:\/\//i.test(clean(input.link))) return 'El enlace debe empezar por https://.';
    if (input.planned !== '' && input.planned !== null && input.planned !== undefined && !(Number(input.planned) >= 0)) return 'El presupuesto de la campaña no es válido.';
    if (clean(input.notes).length > 1000) return 'La nota no puede pasar de 1000 caracteres.';
    return null;
};

export const labelOfAd = (list, value) => list.find((item) => item.value === value)?.label || value || '';

export const adBudgetName = (budget) => {
    const client = budget.client?.name || budget.clientName || '';
    const brand = clean(budget.brand);
    return brand && brand.toLowerCase() !== client.toLowerCase() ? `${client} · ${brand}` : client;
};
