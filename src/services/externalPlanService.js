// Lee las parrillas de MIO desde sus hojas de Google (29 de octubre de 2026). Solo lectura: descarga la vista pública de
// la hoja para saber qué pestañas tiene, baja en texto la pestaña del mes y guarda lo leído en `ExternalPlanSnapshot`,
// una fila por cliente y mes. Operación usa esa lectura cuando el mes no tiene parrilla en la plataforma.
//
// Seguridad: el enlace lo escribe una persona, pero nunca se descarga tal cual. Se saca el identificador de la hoja y
// las direcciones las arma este servicio, siempre en docs.google.com; con tope de tamaño y de tiempo. El contenido es
// dato, nunca instrucción, y no pasa por ningún proveedor de IA.
import prisma from '../lib/prisma.js';
import XLSX from '../lib/xlsx.js';
import { isWorkingTime } from '../lib/briaNudges.js';
import { MONTH_TABS, monthTab, parsePlanRows, parseSheetTabs, sheetIdFromUrl, summarizeExternalPieces } from '../lib/externalPlan.js';

const MAX_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const CHECK_MS = 2 * 60 * 60 * 1000;

export class ExternalPlanError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

const download = async (url, fetchImpl) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
        const response = await fetchImpl(url, { signal: controller.signal, redirect: 'follow' });
        const finalUrl = response.url || url;
        if (response.status === 401 || response.status === 403 || /accounts\.google\.com|ServiceLogin/.test(finalUrl)) {
            throw new ExternalPlanError('NOT_SHARED', 'La hoja no está compartida para leerla con el enlace.');
        }
        if (response.status === 404) throw new ExternalPlanError('NOT_FOUND', 'No encontramos esa hoja: revisa el enlace.');
        if (!response.ok) throw new ExternalPlanError('UNAVAILABLE', `Google respondió ${response.status} al leer la hoja.`);
        const text = await response.text();
        if (text.length > MAX_BYTES) throw new ExternalPlanError('TOO_LARGE', 'La pestaña es demasiado grande para leerla.');
        return text;
    } catch (error) {
        if (error instanceof ExternalPlanError) throw error;
        throw new ExternalPlanError('UNAVAILABLE', error?.name === 'AbortError' ? 'Google tardó demasiado en responder.' : 'No pudimos conectarnos con Google.');
    } finally {
        clearTimeout(timer);
    }
};

/** Lee la pestaña de un mes. Devuelve `{ tabName, pieces, summary, problem }`; lanza `ExternalPlanError` si no se pudo leer. */
export const readExternalPlan = async (url, { year, month }, { fetchImpl = fetch } = {}) => {
    const id = sheetIdFromUrl(url);
    if (!id) throw new ExternalPlanError('INVALID_URL', 'El enlace no es de una hoja de Google.');
    const html = await download(`https://docs.google.com/spreadsheets/d/${id}/htmlview`, fetchImpl);
    const tab = monthTab(parseSheetTabs(html), year, month);
    if (!tab) return { tabName: null, pieces: [], summary: summarizeExternalPieces([]), problem: `La hoja no tiene una pestaña de ${MONTH_TABS[month - 1].toLowerCase()}.` };
    const csv = await download(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${tab.gid}`, fetchImpl);
    const sheet = XLSX.read(csv, { type: 'string', raw: true });
    const rows = XLSX.utils.sheet_to_json(sheet.Sheets[sheet.SheetNames[0]], { header: 1, raw: true, defval: '' });
    const { pieces, problem } = parsePlanRows(rows, { year, month });
    return { tabName: tab.name.trim(), pieces, summary: summarizeExternalPieces(pieces), problem };
};

const bogotaToday = (now) => new Date(now.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);

/** Cuántos meses ya cerrados se leen: los mismos que muestra «Meses anteriores» y que mira el semáforo. */
export const PAST_MONTHS_READ = 3;

/**
 * Los tres meses anteriores, el mes en curso y el siguiente. Los anteriores hacen falta porque el semáforo juzga el mes
 * que acaba de cerrar y la página los muestra: sin leerlos, un cliente de MIO aparecía con 0 publicadas en septiembre.
 */
export const monthsToRead = (now) => {
    const [year, month] = bogotaToday(now).split('-').map(Number);
    return Array.from({ length: PAST_MONTHS_READ + 2 }, (_, offset) => {
        const index = year * 12 + (month - 1) - PAST_MONTHS_READ + offset;
        return { year: Math.floor(index / 12), month: (index % 12) + 1 };
    });
};

/**
 * Lee y guarda los meses de un cliente. Un fallo de Google no borra lo leído antes: se guarda el problema y las piezas de
 * la última lectura buena se conservan.
 */
export const refreshClientExternalPlan = async (db, client, { now = new Date(), fetchImpl = fetch, log = console.error } = {}) => {
    if (!client?.externalPlanUrl) return [];
    const results = [];
    for (const { year, month } of monthsToRead(now)) {
        const key = { clientId_year_month: { clientId: client.id, year, month } };
        try {
            const read = await readExternalPlan(client.externalPlanUrl, { year, month }, { fetchImpl });
            const data = { tabName: read.tabName, pieces: read.pieces, summary: read.summary, problem: read.problem, readAt: now, okAt: now };
            await db.externalPlanSnapshot.upsert({ where: key, create: { clientId: client.id, year, month, ...data }, update: data });
            results.push({ year, month, ok: true, ...read });
        } catch (error) {
            const problem = error instanceof ExternalPlanError ? error.message : 'No pudimos leer la hoja.';
            if (!(error instanceof ExternalPlanError)) log('[Parrillas MIO] Lectura fallida:', error?.message || error);
            await db.externalPlanSnapshot.upsert({
                where: key,
                create: { clientId: client.id, year, month, pieces: [], summary: summarizeExternalPieces([]), problem, readAt: now },
                update: { problem, readAt: now }
            });
            results.push({ year, month, ok: false, problem });
        }
    }
    return results;
};

/** Lee las hojas de todos los clientes que tienen una. Un cliente que falla no frena a los demás. */
export const refreshAllExternalPlans = async (db = prisma, options = {}) => {
    const clients = await db.client.findMany({ where: { isArchived: false, externalPlanUrl: { not: null } }, select: { id: true, name: true, externalPlanUrl: true } });
    let read = 0;
    for (const client of clients) {
        try {
            await refreshClientExternalPlan(db, client, options);
            read += 1;
        } catch (error) {
            (options.log || console.error)(`[Parrillas MIO] ${client.name}:`, error?.message || error);
        }
    }
    return { clients: clients.length, read };
};

/** El reloj: cada dos horas en horario hábil de Bogotá. */
export const initExternalPlanScheduler = ({ db = prisma, interval = CHECK_MS } = {}) => {
    const run = () => {
        if (!isWorkingTime(new Date())) return;
        refreshAllExternalPlans(db).catch((error) => console.error('[Parrillas MIO] Lectura de las hojas:', error?.message || error));
    };
    const startup = setTimeout(run, 90_000);
    startup.unref?.();
    const timer = setInterval(run, interval);
    timer.unref?.();
    console.log('[Parrillas MIO] Lectura de las hojas de MIO activa (cada 2 horas, horario hábil).');
    return timer;
};
