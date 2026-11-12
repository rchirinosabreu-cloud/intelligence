// Pautas conectadas a Meta (Rodny, 12 de noviembre de 2026: «quiero ver la forma en que pueda conectar esto con las pautas
// reales en Meta»). La lectura de prueba de ese día encontró las 19 cuentas publicitarias que ve la llave de la plataforma y
// cuatro pautas que ya coincidían con lo escrito a mano; también que una cuenta no es un cliente (la de Francisco Villa
// lleva Pablo Hoff, New Pueblito, Martínez y Nájera y Brain) y que una marca puede correr dentro de la cuenta de otra.
//
// Por eso una pauta se liga a **campañas**, no a cuentas: la plataforma propone las que llevan el nombre del cliente o de
// la marca y una persona confirma. El gasto lo lee la plataforma de Meta y queda como una lectura más, marcada «Meta»;
// lo que una persona escribió ese día no lo pisa. Solo se lee: nada de esto cambia campañas ni presupuestos en Meta.
//
// Lógica pura: la leen el servidor, la pantalla y las pruebas.
import { addDays, formatAdMoney, shortDay, toleranceCents } from './adBudgets.js';

/** Días tras el cierre en que la plataforma todavía lee el ciclo anterior: después, el gasto final es de una persona. */
export const META_FINAL_GRACE_DAYS = 5;
/** Cuántas horas pasan entre una lectura automática y la siguiente. */
export const META_SYNC_EVERY_HOURS = 2;
/** La ventana para encontrar campañas que gastan y nadie ligó. */
export const META_DISCOVERY_DAYS = 30;
export const META_MAX_CAMPAIGNS = 50;

const plain = (value) => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const contains = (text, needle) => Boolean(plain(needle)) && plain(text).includes(plain(needle));

/** Del inicio del ciclo a hoy, sin pasar del cierre. Un ciclo que no empezó no tiene gasto que leer. */
export const metaSpendWindow = (cycle, today) => {
    if (!cycle?.start || today < cycle.start) return null;
    return { since: cycle.start, until: today < cycle.end ? today : cycle.end };
};

/** El ciclo en curso y, durante unos días tras su cierre, el anterior que nadie cerró: así su gasto final sale de Meta. */
export const metaCyclesToSync = ({ current, previous = null, previousClosed = true, today }) => {
    const list = current ? [current] : [];
    if (previous && !previousClosed && today > previous.end && today <= addDays(previous.end, META_FINAL_GRACE_DAYS)) list.push(previous);
    return list;
};

/**
 * Qué hacer con la cifra de Meta en un ciclo. Una lectura de Meta por día, que se actualiza durante el día.
 *
 * En una pauta ligada **Meta manda** (Rodny, 12 de noviembre de 2026: «si ya está ceñido a Meta, eso no crearía cifras
 * diferentes?»). Lo escrito a mano solo vale mientras Meta no responde: en cuanto vuelve a leer, su cifra queda como la
 * vigente (`touch` la deja como la más reciente del día). Lo escrito a mano no se borra: queda en el historial.
 */
export const metaReadingAction = ({ readings = [], metaCents, readOn, closed = false }) => {
    if (closed) return { action: 'SKIP', reason: 'CERRADO' };
    const ofDay = readings.find((row) => row.source === 'META' && row.readOn === readOn);
    const newerManual = readings.some((row) => row.source !== 'META' && row.readOn >= readOn
        && (!ofDay || new Date(row.createdAt || 0) >= new Date(ofDay.createdAt || 0)));
    if (!ofDay) return { action: 'CREATE' };
    if (Math.round(Number(ofDay.spent) * 100) === metaCents && !newerManual) return { action: 'SKIP', reason: 'IGUAL' };
    return { action: 'UPDATE', readingId: ofDay.id, touch: newerManual };
};

/**
 * ¿Manda Meta en este ciclo? Sí, si la pauta está ligada y Meta lo leyó bien hoy o ayer, o lo leyó completo hasta su
 * cierre. Si Meta falla, o hace días que no lee, se puede escribir a mano para no quedarse sin dato.
 */
export const metaSpendLock = ({ linked, row, cycle, today }) => {
    if (!linked || !row || row.metaProblem || row.metaSpent === null || row.metaSpent === undefined || !row.metaSpentAsOf) return null;
    const complete = Boolean(cycle && row.metaSpentAsOf >= cycle.end);
    const fresh = row.metaSpentAsOf >= addDays(today, -1);
    if (!fresh && !complete) return null;
    return { metaCents: Math.round(Number(row.metaSpent) * 100), asOf: row.metaSpentAsOf, complete };
};

/** Lo que se le dice a quien intenta escribir el gasto de una pauta en la que manda Meta. */
export const manualSpendProblem = ({ lock, final = false, spentCents, currency }) => {
    if (!lock) return null;
    const money = formatAdMoney(lock.metaCents, currency);
    if (final) {
        if (!lock.complete) return 'Meta todavía no ha leído el ciclo completo: el gasto final se confirma cuando lo lea hasta el cierre.';
        return spentCents === lock.metaCents ? null : `El gasto final de una pauta ligada a Meta es el que marca Meta: ${money}.`;
    }
    return `Esta pauta lee el gasto de Meta (va en ${money} al ${shortDay(lock.asOf)}). Se escribe a mano solo si Meta no responde.`;
};

/** La cifra vigente la escribió una persona y no coincide con Meta. Por debajo de la tolerancia no es una diferencia. */
export const metaDifference = ({ currency, spentCents, source, metaCents }) => {
    if (source === 'META' || metaCents === null || metaCents === undefined || spentCents === null || spentCents === undefined) return null;
    const cents = spentCents - metaCents;
    return Math.abs(cents) > toleranceCents(currency) ? { cents } : null;
};

const labelsOf = (budget) => [budget.brand, budget.client?.name].filter((value) => plain(value));

/**
 * Las campañas que parecen de una pauta: su nombre lleva el de la marca o el del cliente, o están en una cuenta con ese
 * nombre y no nombran a otra pauta. Nunca lo que ya es de otra pauta ni lo descartado. Es una propuesta: confirma una persona.
 */
export const suggestMetaCampaigns = (budget, campaigns = [], others = []) => {
    const own = budget.brand ? [budget.brand] : labelsOf(budget);
    const foreign = others.flatMap((other) => (other.brand ? [other.brand] : labelsOf(other))).filter((label) => !own.some((mine) => plain(mine) === plain(label)));
    return campaigns
        .filter((row) => !row.budgetId && !row.ignoredAt)
        .filter((row) => own.some((label) => contains(row.name, label))
            || (own.some((label) => contains(row.accountName, label)) && !foreign.some((label) => contains(row.name, label))))
        .map((row) => row.id);
};

/** Lo que gastó en la ventana y nadie ligó ni descartó: gasto que hoy no está en ninguna pauta. */
export const unassignedMetaCampaigns = (campaigns = []) => campaigns
    .filter((row) => !row.budgetId && !row.ignoredAt && !row.ignored && Number(row.spend30Cents) > 0)
    .sort((a, b) => Number(b.spend30Cents) - Number(a.spend30Cents));

export const metaCampaignIdsProblem = (ids) => {
    if (!Array.isArray(ids)) return 'Manda la lista de campañas de Meta.';
    if (ids.length > META_MAX_CAMPAIGNS) return `Una pauta puede tener hasta ${META_MAX_CAMPAIGNS} campañas de Meta.`;
    if (ids.some((id) => !/^\d{1,25}$/.test(String(id)))) return 'Eso no es una campaña de Meta.';
    if (new Set(ids.map(String)).size !== ids.length) return 'Hay una campaña repetida.';
    return null;
};
