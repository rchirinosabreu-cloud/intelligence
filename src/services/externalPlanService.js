// Lee las parrillas de MIO desde sus hojas de Google (29 de octubre de 2026). Con la cuenta de servicio de la plataforma
// lee por la API de Google (filas y comentarios de Google); sin ella, por el enlace público. Guarda lo leído en
// `ExternalPlanSnapshot`, una fila por cliente y mes: Operación la usa cuando el mes no tiene parrilla en la plataforma y
// Parrillas la muestra como espejo, con lo que cambió desde la lectura anterior.
//
// Seguridad: el enlace lo escribe una persona, pero nunca se descarga tal cual. Se saca el identificador de la hoja y
// las direcciones las arma este servicio, siempre en docs.google.com; con tope de tamaño y de tiempo. El contenido es
// dato, nunca instrucción, y no pasa por ningún proveedor de IA.
import prisma from '../lib/prisma.js';
import XLSX from '../lib/xlsx.js';
import { isWorkingTime } from '../lib/briaNudges.js';
import {
    DEFAULT_SHEET_STATUSES, MONTH_TABS, changesNoticeText, columnLetter, commentsForMonth, diffExternalPlan, matchCommentToPiece, monthTab,
    normalizeSheetComments, parsePlanRows, parseSheetTabs, pieceLabel, replyContent, rowIdentityProblem, sameStatus, sheetCellUrl,
    sheetIdFromUrl, stageFromStatus, summarizeExternalPieces, validationOptions
} from '../lib/externalPlan.js';
import { MONTH_NAMES } from '../lib/clientOperations.js';
import { createNotification } from './notificationService.js';

export const EXTERNAL_PLAN_CHANGE_TYPE = 'PARRILLA_MIO_CAMBIOS';
const SHEET_SCOPES = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive'];
const MAX_ROWS = 300;
/** Los comentarios sueltos (sin pieza) del mes en curso: los abiertos que se movieron en los últimos 45 días. */
const LOOSE_COMMENT_DAYS = 45;
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

/**
 * Leer la hoja por su enlace público: la vista pública dice las pestañas y cada una se baja en CSV. No ve los comentarios
 * de Google. Es el camino cuando la plataforma no tiene cuenta de servicio (y el de las pruebas).
 */
export const createPublicSheetSource = (fetchImpl = fetch) => ({
    kind: 'public',
    tabs: async (id) => parseSheetTabs(await download(`https://docs.google.com/spreadsheets/d/${id}/htmlview`, fetchImpl)),
    rows: async (id, tab) => {
        const csv = await download(`https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${tab.gid}`, fetchImpl);
        const sheet = XLSX.read(csv, { type: 'string', raw: true });
        return XLSX.utils.sheet_to_json(sheet.Sheets[sheet.SheetNames[0]], { header: 1, raw: true, defval: '' });
    },
    comments: async () => null
});

const quoteTab = (tab) => `'${String(tab.name ?? tab).replace(/'/g, "''")}'`;

const googleError = (error) => {
    if (error instanceof ExternalPlanError) return error;
    const status = Number(error?.code || error?.response?.status);
    if (status === 403 || status === 401) return new ExternalPlanError('NOT_SHARED', 'La cuenta de la plataforma no tiene acceso a la hoja.');
    if (status === 404) return new ExternalPlanError('NOT_FOUND', 'No encontramos esa hoja: revisa el enlace.');
    return new ExternalPlanError('UNAVAILABLE', 'No pudimos conectarnos con Google.');
};

/**
 * Leer la hoja con la cuenta de servicio de la plataforma, por la API de Google: trae las mismas filas y además los
 * comentarios de Google (los de burbuja). `sheets` y `drive` son los clientes de `googleapis`.
 */
export const createGoogleSheetSource = ({ sheets, drive }) => ({
    kind: 'google',
    tabs: async (id) => {
        try {
            const response = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties(sheetId,title)' });
            return (response.data.sheets || []).map((sheet) => ({ name: sheet.properties.title, gid: String(sheet.properties.sheetId) }));
        } catch (error) { throw googleError(error); }
    },
    rows: async (id, tab) => {
        try {
            const range = `${quoteTab(tab)}!A1:Z${MAX_ROWS}`;
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: id, range, valueRenderOption: 'FORMATTED_VALUE' });
            return response.data.values || [];
        } catch (error) { throw googleError(error); }
    },
    /** Las opciones de los desplegables de un rango (la columna ESTADO de las piezas del mes). */
    statusOptions: async (id, range) => {
        try {
            const response = await sheets.spreadsheets.get({ spreadsheetId: id, ranges: [range], fields: 'sheets.data.rowData.values.dataValidation' });
            const rules = (response.data.sheets || []).flatMap((sheet) => (sheet.data || []).flatMap((data) => (data.rowData || []).flatMap((row) => (row.values || []).map((cell) => cell.dataValidation).filter(Boolean))));
            return validationOptions(rules);
        } catch (error) { throw googleError(error); }
    },
    readRow: async (id, tab, row) => {
        try {
            const response = await sheets.spreadsheets.values.get({ spreadsheetId: id, range: `${quoteTab(tab)}!A${row}:Z${row}`, valueRenderOption: 'FORMATTED_VALUE' });
            return response.data.values?.[0] || [];
        } catch (error) { throw googleError(error); }
    },
    writeCell: async (id, tab, cell, value) => {
        try {
            await sheets.spreadsheets.values.update({ spreadsheetId: id, range: `${quoteTab(tab)}!${cell}`, valueInputOption: 'USER_ENTERED', requestBody: { values: [[value]] } });
        } catch (error) { throw googleError(error); }
    },
    reply: async (id, commentId, content, { resolve = false } = {}) => {
        try {
            const response = await drive.replies.create({
                fileId: id, commentId, fields: 'id,content,createdTime,action,author(displayName,me)',
                requestBody: { content, ...(resolve ? { action: 'resolve' } : {}) }
            });
            return response.data;
        } catch (error) { throw googleError(error); }
    },
    comments: async (id) => {
        const all = [];
        let pageToken;
        for (let page = 0; page < 3; page += 1) {
            const response = await drive.comments.list({
                fileId: id, pageSize: 100, pageToken, includeDeleted: false,
                fields: 'nextPageToken,comments(id,createdTime,modifiedTime,resolved,deleted,author(displayName,me),quotedFileContent,content,replies(id,author(displayName,me),content,createdTime,action,deleted))'
            });
            all.push(...(response.data.comments || []));
            pageToken = response.data.nextPageToken;
            if (!pageToken) break;
        }
        return normalizeSheetComments(all);
    }
});

let googleSource;
/** La fuente de siempre: la API de Google si la plataforma tiene cuenta de servicio, el enlace público si no. */
export const defaultSheetSource = async () => {
    if (googleSource !== undefined) return googleSource || createPublicSheetSource();
    try {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON || 'null');
        if (!credentials?.client_email) throw new Error('sin cuenta de servicio');
        const { google } = await import('googleapis');
        const auth = new google.auth.GoogleAuth({ credentials, scopes: SHEET_SCOPES });
        googleSource = createGoogleSheetSource({ sheets: google.sheets({ version: 'v4', auth }), drive: google.drive({ version: 'v3', auth }) });
    } catch {
        googleSource = null;
    }
    return googleSource || createPublicSheetSource();
};

const sourceFor = async ({ source, fetchImpl }) => source || (fetchImpl ? createPublicSheetSource(fetchImpl) : defaultSheetSource());

/**
 * Lee la pestaña de un mes. Devuelve `{ tabName, gid, pieces, summary, problem }`; lanza `ExternalPlanError` si no se pudo
 * leer.
 */
export const readExternalPlan = async (url, { year, month }, { fetchImpl, source, tabs: knownTabs } = {}) => {
    const id = sheetIdFromUrl(url);
    if (!id) throw new ExternalPlanError('INVALID_URL', 'El enlace no es de una hoja de Google.');
    const reader = await sourceFor({ source, fetchImpl });
    const tab = monthTab(knownTabs || await reader.tabs(id), year, month);
    if (!tab) return { tabName: null, gid: null, pieces: [], summary: summarizeExternalPieces([]), problem: `La hoja no tiene una pestaña de ${MONTH_TABS[month - 1].toLowerCase()}.` };
    const rows = await reader.rows(id, tab);
    const { pieces, layout, problem } = parsePlanRows(rows, { year, month });
    // Las opciones del desplegable de ESTADO, para ofrecer las mismas desde la plataforma. Si falla, se ofrecen las de
    // siempre: no poder leer el desplegable no impide leer la parrilla.
    let statusOptions = null;
    if (reader.statusOptions && layout?.statusColumn >= 0 && pieces.length) {
        const letter = columnLetter(layout.statusColumn);
        const rowsSpan = `${letter}${Math.min(...pieces.map((piece) => piece.row))}:${letter}${Math.max(...pieces.map((piece) => piece.row))}`;
        statusOptions = await reader.statusOptions(id, `${quoteTab(tab)}!${rowsSpan}`).catch(() => null);
    }
    return {
        tabName: tab.name.trim(), gid: tab.gid, pieces, summary: summarizeExternalPieces(pieces), problem,
        layout: layout ? { ...layout, statusOptions: statusOptions?.length ? statusOptions : null } : null
    };
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
export const refreshClientExternalPlan = async (db, client, { now = new Date(), fetchImpl, source, notify = createNotification, log = console.error } = {}) => {
    if (!client?.externalPlanUrl) return [];
    const results = [];
    const id = sheetIdFromUrl(client.externalPlanUrl);
    // Las pestañas y los comentarios de Google se piden una vez por hoja, no una vez por mes.
    let reader = null;
    let tabs = null;
    let comments = null;
    let setupError = null;
    try {
        if (!id) throw new ExternalPlanError('INVALID_URL', 'El enlace no es de una hoja de Google.');
        reader = await sourceFor({ source, fetchImpl });
        tabs = await reader.tabs(id);
    } catch (error) {
        setupError = error;
    }
    if (!setupError) {
        try {
            comments = await reader.comments(id);
        } catch (error) {
            log('[Parrillas MIO] Comentarios de Google sin leer:', error?.message || error);
        }
    }
    const months = monthsToRead(now);
    const looseSince = new Date(now.getTime() - LOOSE_COMMENT_DAYS * 86400000).toISOString();
    // Primero se leen todos los meses: un comentario atado a una pieza de un mes no puede aparecer suelto en otro.
    const reads = [];
    for (const { year, month } of months) {
        try {
            if (setupError) throw setupError;
            reads.push({ year, month, read: await readExternalPlan(client.externalPlanUrl, { year, month }, { source: reader, tabs }) });
        } catch (error) {
            reads.push({ year, month, error });
        }
    }
    const claimed = new Set((comments || []).filter((comment) => reads.some(({ read }) => read && matchCommentToPiece(comment.quoted, read.pieces) != null)).map((comment) => comment.id));
    for (const [index, { year, month, read, error: readError }] of reads.entries()) {
        const key = { clientId_year_month: { clientId: client.id, year, month } };
        const current = index === PAST_MONTHS_READ;
        try {
            if (readError) throw readError;
            const monthComments = comments ? commentsForMonth(comments, read.pieces, { looseSince: current ? looseSince : null, claimed }) : null;
            const data = { tabName: read.tabName, gid: read.gid, layout: read.layout, pieces: read.pieces, summary: read.summary, problem: read.problem, readAt: now, okAt: now };
            if (monthComments) Object.assign(data, { comments: monthComments, commentsAt: now });
            // Los cambios se avisan del mes en curso y el siguiente, comparando con la última lectura buena. La primera
            // lectura no avisa (no hay con qué comparar) y los comentarios solo se comparan si la anterior ya los leyó.
            let events = [];
            if (index >= PAST_MONTHS_READ) {
                const previous = await db.externalPlanSnapshot.findUnique({ where: key, select: { pieces: true, comments: true, commentsAt: true, okAt: true } });
                if (previous?.okAt) {
                    const commentsComparable = Boolean(monthComments && previous.commentsAt);
                    events = diffExternalPlan(
                        { pieces: previous.pieces, comments: commentsComparable ? previous.comments : [] },
                        { pieces: read.pieces, comments: commentsComparable ? monthComments : [] }
                    );
                }
            }
            if (events.length) Object.assign(data, { changes: events.map((event) => ({ ...event, at: now.toISOString() })), changedAt: now });
            await db.externalPlanSnapshot.upsert({ where: key, create: { clientId: client.id, year, month, ...data }, update: data });
            if (events.length) await notifyExternalChanges(db, client, { year, month, events, notify, log });
            results.push({ year, month, ok: true, events: events.length, ...read });
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

/**
 * Avisa al community manager y al project manager del cliente de lo que cambió en su hoja: un aviso por cliente y mes en
 * cada lectura, nunca uno por cambio. Un aviso que no sale nunca deshace la lectura.
 */
export const notifyExternalChanges = async (db, client, { year, month, events, notify = createNotification, log = console.error }) => {
    try {
        const info = await db.client.findUnique({
            where: { id: client.id },
            select: { name: true, slug: true, responsible: { select: { userId: true } }, projectManager: { select: { userId: true } } }
        });
        const recipients = [...new Set([info?.responsible?.userId, info?.projectManager?.userId].filter(Boolean))];
        if (!recipients.length) {
            log(`[Parrillas MIO] ${info?.name || client.id}: hay cambios en la hoja pero el cliente no tiene CM ni PM con cuenta.`);
            return;
        }
        const label = MONTH_NAMES[month - 1];
        const message = changesNoticeText(info?.name || 'Cliente', label, events);
        const url = info?.slug ? `/parrillas/hoja/${info.slug}/${label.toLowerCase()}-${year}` : '/parrillas';
        for (const userId of recipients) {
            await Promise.resolve(notify({ userId, type: EXTERNAL_PLAN_CHANGE_TYPE, relatedId: client.id, url, message }))
                .catch((error) => log('[Parrillas MIO] Aviso no entregado:', error?.message || error));
        }
    } catch (error) {
        log('[Parrillas MIO] No se pudo avisar de los cambios:', error?.message || error);
    }
};

const MONTH_SLUGS = MONTH_TABS.map((name) => name.toLowerCase());
const currentAndNext = (now) => monthsToRead(now).slice(PAST_MONTHS_READ);
const isoOrNull = (value) => (value ? new Date(value).toISOString() : null);

/**
 * Las parrillas de MIO para la lista de Parrillas: cada cliente con hoja vinculada y su mes en curso y el siguiente, con
 * lo que se leyó y cuántos cambios trajo la última lectura.
 */
export const listExternalPlans = async (db = prisma, { now = new Date() } = {}) => {
    const months = currentAndNext(now);
    const clients = await db.client.findMany({
        where: { isArchived: false, externalPlanUrl: { not: null } },
        orderBy: { name: 'asc' },
        select: {
            id: true, name: true, slug: true, externalPlanUrl: true,
            externalPlanSnapshots: {
                where: { OR: months },
                select: { year: true, month: true, tabName: true, summary: true, problem: true, readAt: true, okAt: true, changes: true, changedAt: true }
            }
        }
    });
    return clients.map((client) => ({
        client: { id: client.id, name: client.name, slug: client.slug },
        sheetUrl: client.externalPlanUrl,
        months: months.map(({ year, month }) => {
            const row = client.externalPlanSnapshots.find((item) => item.year === year && item.month === month);
            return {
                year, month, label: MONTH_NAMES[month - 1], slug: `${MONTH_SLUGS[month - 1]}-${year}`,
                tabName: row?.tabName ?? null,
                created: row?.summary?.created ?? 0,
                reached: row?.summary?.reached ?? null,
                problem: row?.problem ?? (row ? null : 'Todavía no se ha leído.'),
                readAt: isoOrNull(row?.okAt),
                changes: Array.isArray(row?.changes) ? row.changes.length : 0,
                changedAt: isoOrNull(row?.changedAt)
            };
        })
    }));
};

/** «noviembre-2026» → { year: 2026, month: 11 }. */
export const parseMonthSlug = (value) => {
    const match = String(value || '').toLowerCase().match(/^([a-z]+)-(\d{4})$/);
    const month = match ? MONTH_SLUGS.indexOf(match[1]) + 1 : 0;
    return month ? { year: Number(match[2]), month } : null;
};

/**
 * Un mes de la hoja de un cliente para el espejo: sus piezas con el enlace a su fila, los comentarios de Google atados a
 * cada pieza, los que quedaron sueltos y lo que cambió en la última lectura.
 */
export const getExternalPlanMonth = async (db = prisma, { slug, year, month }, { source } = {}) => {
    const client = await db.client.findFirst({
        where: { slug: String(slug || ''), externalPlanUrl: { not: null } },
        select: { id: true, name: true, slug: true, externalPlanUrl: true }
    });
    if (!client) return null;
    const row = await db.externalPlanSnapshot.findUnique({ where: { clientId_year_month: { clientId: client.id, year, month } } });
    const pieces = Array.isArray(row?.pieces) ? row.pieces : [];
    const comments = Array.isArray(row?.comments) ? row.comments : [];
    const changes = Array.isArray(row?.changes) ? row.changes : [];
    // Se puede escribir en la hoja si la plataforma tiene su cuenta de Google y la pestaña ya se leyó con sus columnas.
    const reader = source || await defaultSheetSource();
    const editable = reader.kind === 'google' && Boolean(row?.okAt && row?.tabName && row?.layout?.statusColumn >= 0);
    return {
        client: { id: client.id, name: client.name, slug: client.slug },
        editable,
        statusOptions: row?.layout?.statusOptions?.length ? row.layout.statusOptions : DEFAULT_SHEET_STATUSES,
        edits: Array.isArray(row?.edits) ? row.edits.slice(0, 10) : [],
        year, month, label: MONTH_NAMES[month - 1],
        sheetUrl: client.externalPlanUrl,
        tabUrl: row?.gid ? sheetCellUrl(client.externalPlanUrl, row.gid, null) : client.externalPlanUrl,
        tabName: row?.tabName ?? null,
        summary: row?.summary ?? null,
        problem: row?.problem ?? (row ? null : 'Todavía no se ha leído esta hoja.'),
        readAt: isoOrNull(row?.okAt),
        commentsRead: Boolean(row?.commentsAt),
        changedAt: isoOrNull(row?.changedAt),
        changes,
        pieces: pieces.map((piece) => ({
            ...piece,
            cellUrl: row?.gid ? sheetCellUrl(client.externalPlanUrl, row.gid, piece.row) : null,
            changed: changes.filter((change) => change.row === piece.row).map((change) => change.kind),
            comments: comments.filter((comment) => comment.row === piece.row)
        })),
        looseComments: comments.filter((comment) => comment.row == null)
    };
};

const fail = (status, code, message) => Object.assign(new ExternalPlanError(code, message), { status });
const MAX_REPLY = 2000;
const MAX_EDITS = 50;

const editableMonth = async (db, { slug, year, month }) => {
    const client = await db.client.findFirst({ where: { slug: String(slug || ''), externalPlanUrl: { not: null } }, select: { id: true, name: true, externalPlanUrl: true } });
    if (!client) throw fail(404, 'NOT_FOUND', 'Ese cliente no tiene una hoja de MIO vinculada.');
    const key = { clientId_year_month: { clientId: client.id, year, month } };
    const row = await db.externalPlanSnapshot.findUnique({ where: key });
    if (!row?.okAt || !row.tabName) throw fail(409, 'NOT_READ', 'Esta parrilla todavía no se ha leído: lee la hoja antes de cambiarla.');
    return { client, key, row, id: sheetIdFromUrl(client.externalPlanUrl) };
};

const writerFor = async (source) => {
    const writer = source || await defaultSheetSource();
    if (writer.kind !== 'google' || !writer.writeCell) throw fail(503, 'NO_SERVICE_ACCOUNT', 'La plataforma no tiene una cuenta de Google con permiso para escribir en la hoja.');
    return writer;
};

const actorName = async (db, userId) => (userId
    ? (await db.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null))?.name || 'Alguien del equipo'
    : 'Alguien del equipo');

/**
 * Cambia el estado de una pieza en la hoja de MIO, con la cuenta de servicio (Rodny, 29 de octubre de 2026). Antes de
 * escribir vuelve a leer la fila: tiene que seguir siendo la misma pieza y tener el estado que vio la persona; si no, no
 * escribe y lo dice. Lo escrito queda en la lectura guardada al instante, así la próxima lectura no lo avisa como cambio.
 */
export const updateExternalPieceStatus = async (db = prisma, { slug, year, month, row: pieceRow, status, expected, userId = null }, { source, now = new Date() } = {}) => {
    const value = String(status ?? '').trim();
    if (!value || value.length > 80) throw fail(422, 'INVALID_STATUS', 'Elige un estado.');
    const { client, key, row, id } = await editableMonth(db, { slug, year, month });
    const pieces = Array.isArray(row.pieces) ? row.pieces : [];
    const index = pieces.findIndex((piece) => piece.row === Number(pieceRow));
    if (index < 0) throw fail(404, 'PIECE_NOT_FOUND', 'Esa pieza ya no está en la lectura de la hoja.');
    const piece = pieces[index];
    const layout = row.layout || {};
    if (!(layout.statusColumn >= 0)) throw fail(409, 'NO_LAYOUT', 'Lee la hoja de nuevo antes de cambiarla.');
    const options = layout.statusOptions?.length ? layout.statusOptions : DEFAULT_SHEET_STATUSES;
    if (!options.some((option) => sameStatus(option, value))) throw fail(422, 'INVALID_STATUS', 'Ese estado no está en el desplegable de la hoja.');
    const writer = await writerFor(source);
    const tab = { name: row.tabName, gid: row.gid };
    const current = await writer.readRow(id, tab, piece.row);
    const identity = rowIdentityProblem(current, piece, layout);
    if (identity) throw fail(409, 'ROW_MOVED', identity);
    const sheetStatus = String(current[layout.statusColumn] ?? '').trim();
    if (!sameStatus(sheetStatus, expected ?? piece.status)) {
        throw fail(409, 'STATUS_CHANGED', `En la hoja, ${pieceLabel(piece)} ya dice «${sheetStatus || 'sin estado'}». Lee la hoja de nuevo antes de cambiarla.`);
    }
    const exact = options.find((option) => sameStatus(option, value)) || value;
    await writer.writeCell(id, tab, `${columnLetter(layout.statusColumn)}${piece.row}`, exact);
    const name = await actorName(db, userId);
    const nextPieces = pieces.map((item, at) => (at === index ? { ...item, status: exact, stage: stageFromStatus(exact) } : item));
    const edits = [{ kind: 'STATUS', row: piece.row, label: pieceLabel(piece), from: sheetStatus || null, to: exact, by: name, at: now.toISOString() }, ...(Array.isArray(row.edits) ? row.edits : [])].slice(0, MAX_EDITS);
    await db.externalPlanSnapshot.update({ where: key, data: { pieces: nextPieces, summary: summarizeExternalPieces(nextPieces), edits } });
    console.log(`[Parrillas MIO] ${name} cambió ${pieceLabel(piece)} de ${client.name} (${MONTH_NAMES[month - 1].toLowerCase()}) a «${exact}» en la hoja.`);
    return getExternalPlanMonth(db, { slug, year, month }, { source: writer });
};

/**
 * Responde un comentario de Google de la hoja desde la plataforma, y si se pide lo marca como resuelto. La respuesta la
 * firma la cuenta de servicio, así que el texto empieza por el nombre de quien la escribe.
 */
export const replyToExternalComment = async (db = prisma, { slug, year, month, commentId, content, resolve = false, userId = null }, { source, now = new Date() } = {}) => {
    const text = String(content ?? '').trim();
    if (!text) throw fail(422, 'EMPTY_REPLY', 'Escribe la respuesta.');
    if (text.length > MAX_REPLY) throw fail(422, 'REPLY_TOO_LONG', `La respuesta no puede pasar de ${MAX_REPLY} caracteres.`);
    const { client, key, row, id } = await editableMonth(db, { slug, year, month });
    const comments = Array.isArray(row.comments) ? row.comments : [];
    const index = comments.findIndex((comment) => comment.id === String(commentId));
    if (index < 0) throw fail(404, 'COMMENT_NOT_FOUND', 'Ese comentario ya no está en la lectura de la hoja.');
    const writer = await writerFor(source);
    const name = await actorName(db, userId);
    const created = await writer.reply(id, comments[index].id, replyContent(name, text), { resolve: Boolean(resolve) });
    const reply = { id: String(created?.id || `local-${now.getTime()}`), author: name, mine: true, content: replyContent(name, text), createdAt: created?.createdTime || now.toISOString() };
    const nextComments = comments.map((comment, at) => (at === index ? { ...comment, resolved: comment.resolved || Boolean(resolve), replies: [...(comment.replies || []), reply] } : comment));
    const edits = [{ kind: 'REPLY', row: comments[index].row ?? null, commentId: comments[index].id, text: text.slice(0, 300), resolved: Boolean(resolve), by: name, at: now.toISOString() }, ...(Array.isArray(row.edits) ? row.edits : [])].slice(0, MAX_EDITS);
    await db.externalPlanSnapshot.update({ where: key, data: { comments: nextComments, edits } });
    console.log(`[Parrillas MIO] ${name} respondió un comentario de ${client.name} en la hoja${resolve ? ' y lo marcó resuelto' : ''}.`);
    return getExternalPlanMonth(db, { slug, year, month }, { source: writer });
};

/** Lee ahora la hoja de un cliente (botón «Leer ahora» del espejo). */
export const refreshExternalPlanBySlug = async (db = prisma, slug, options = {}) => {
    const client = await db.client.findFirst({ where: { slug: String(slug || ''), externalPlanUrl: { not: null } }, select: { id: true, name: true, externalPlanUrl: true } });
    if (!client) return null;
    return refreshClientExternalPlan(db, client, options);
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
