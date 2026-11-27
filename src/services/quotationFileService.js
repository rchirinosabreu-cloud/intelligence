import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { sniffMediaType } from '../lib/fileSignature.js';
import { MAX_QUOTATION_FILES, MAX_QUOTATION_FILE_BYTES, formatFileSize } from '../lib/quotationAttachments.js';
import { deleteFromS3, getFromS3Stream, getS3ObjectBuffer, putS3Object } from './s3Service.js';

// Archivos adjuntos de una propuesta (Rodny, 27 de noviembre de 2026). Ver src/lib/quotationAttachments.js.
//
// - Viven en el bucket compartido bajo `quotations/`. Se suben mientras se escribe la propuesta y quedan sueltos
//   hasta que se guarda; uno suelto más de un día se borra en el barrido diario.
// - Los de una propuesta se conservan mientras ella exista: son parte de lo que se le mandó al cliente.
// - Se entregan siempre como descarga (nunca se abren dentro del dominio): un HTML o un SVG subido nunca corre aquí.
// - El cliente los baja desde el enlace de la propuesta, con el mismo permiso que ya da ese enlace: solo propuestas
//   emitidas o aprobadas, y solo archivos de esa propuesta.

export const QUOTATION_FILE_PREFIX = 'quotations/';
const ORPHAN_FILE_HOURS = 24;
const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_STATUSES = ['ACTIVA', 'APROBADA'];

const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const extensionOf = (name) => (/\.([a-z0-9]{1,8})$/i.exec(name || '')?.[1] || 'bin').toLowerCase();
const isPdf = (buffer) => buffer.length >= 5 && buffer.subarray(0, 5).toString('latin1') === '%PDF-';

/** Nombre limpio (sin rutas ni saltos de línea) y tipo: por los bytes cuando se reconoce, si no el declarado. */
export const classifyQuotationFile = ({ buffer, originalname, mimetype }) => {
    const name = String(originalname || 'archivo').replace(/[\\/\r\n\t]+/g, ' ').trim().slice(0, 200) || 'archivo';
    const sniffed = isPdf(buffer) ? 'application/pdf' : sniffMediaType(buffer);
    const declared = String(mimetype || '').toLowerCase();
    const safeDeclared = /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(declared) ? declared : 'application/octet-stream';
    return { name, mimeType: sniffed || safeDeclared, extension: extensionOf(name) };
};

export const publicQuotationFile = (row, { slug = null, quotationId = null } = {}) => ({
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    size: row.size,
    url: slug
        ? `/api/quotations/public/${encodeURIComponent(slug)}/files/${encodeURIComponent(row.id)}`
        : `/api/quotations/${encodeURIComponent(quotationId || row.quotationId || 'borrador')}/files/${encodeURIComponent(row.id)}`
});

/** Sube un archivo suelto para la propuesta que se está escribiendo. */
export const uploadQuotationFile = async ({ file, requester }, { db = prisma, storage = { put: putS3Object }, now = new Date() } = {}) => {
    if (!file?.buffer?.length) throw fail(400, 'Elige un archivo que no esté vacío.');
    if (file.buffer.length > MAX_QUOTATION_FILE_BYTES) throw fail(413, `El archivo pesa más de ${formatFileSize(MAX_QUOTATION_FILE_BYTES)}. Compártelo por Drive y pon el enlace en la propuesta.`);
    const { name, mimeType, extension } = classifyQuotationFile(file);
    const id = randomUUID();
    const storageKey = `${QUOTATION_FILE_PREFIX}${id}.${extension}`;
    // Primero la fila: así ningún archivo queda en el bucket sin que el barrido sepa de él.
    const row = await db.quotationFile.create({ data: { id, storageKey, name, mimeType, size: file.buffer.length, uploadedById: requester?.userId || requester?.id || null, createdAt: now } });
    try {
        await storage.put({ key: storageKey, body: file.buffer, contentType: 'application/octet-stream' });
    } catch (error) {
        await db.quotationFile.delete({ where: { id } }).catch(() => {});
        console.error('[QuotationFiles] No se pudo guardar el archivo:', error.message);
        throw fail(502, 'No se pudo guardar el archivo. Inténtalo de nuevo.');
    }
    return publicQuotationFile(row);
};

/** `undefined` = el cliente no mandó la lista (no se toca nada). Si la mandó, que sea válida. */
export const normalizeQuotationFileIds = (fileIds) => {
    if (fileIds === undefined || fileIds === null) return undefined;
    if (!Array.isArray(fileIds) || fileIds.some(id => typeof id !== 'string' || !id)) throw fail(400, 'La lista de adjuntos no es válida.');
    const unique = [...new Set(fileIds)];
    if (unique.length > MAX_QUOTATION_FILES) throw fail(400, `Una propuesta lleva hasta ${MAX_QUOTATION_FILES} adjuntos.`);
    return unique;
};

/** Antes de guardar: que cada archivo exista y esté suelto o ya sea de esta propuesta. */
export const assertQuotationFilesAttachable = async (db, { fileIds, quotationId = null }) => {
    const ids = normalizeQuotationFileIds(fileIds);
    if (!ids?.length) return ids;
    const rows = await db.quotationFile.findMany({ where: { id: { in: ids } } });
    const byId = new Map(rows.map(row => [row.id, row]));
    for (const id of ids) {
        const row = byId.get(id);
        if (!row) throw fail(409, 'Uno de los adjuntos ya no está disponible. Quítalo y vuelve a subirlo.');
        if (row.quotationId && row.quotationId !== quotationId) throw fail(409, `«${row.name}» pertenece a otra propuesta. Vuelve a subirlo.`);
    }
    return ids;
};

/** Deja a la propuesta con exactamente estos adjuntos y en este orden. Los que se quitan quedan sueltos. */
export const setQuotationFiles = async (db, { fileIds, quotationId, now = new Date() }) => {
    const ids = await assertQuotationFilesAttachable(db, { fileIds, quotationId });
    if (ids === undefined) return undefined;
    await db.quotationFile.updateMany({
        where: { quotationId, ...(ids.length ? { id: { notIn: ids } } : {}) },
        // Suelto otra vez: el barrido lo borra al día siguiente (cuenta desde ahora, no desde que se subió).
        data: { quotationId: null, attachedAt: null, position: 0, createdAt: now }
    });
    for (const [position, id] of ids.entries()) {
        await db.quotationFile.update({ where: { id }, data: { quotationId, position, attachedAt: now } });
    }
    return ids;
};

export const listQuotationFiles = async (db, quotationId) => {
    if (!quotationId || !db?.quotationFile) return [];
    try {
        return await db.quotationFile.findMany({ where: { quotationId }, orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] });
    } catch (error) {
        // Sin adjuntos la propuesta se sigue leyendo: nunca tumbarla por esto.
        console.error('[QuotationFiles] No se pudieron leer los adjuntos:', error.message);
        return [];
    }
};

/** Los adjuntos de la propuesta con sus bytes, para el correo. */
export const readQuotationFileBuffers = async (rows, { read = getS3ObjectBuffer } = {}) => Promise.all(rows.map(async row => ({ row, content: await read(row.storageKey) })));

const streamFile = async (res, row, get) => {
    const object = await get(row.storageKey);
    res.set({
        'X-Content-Type-Options': 'nosniff',
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`,
        'Cache-Control': 'private, max-age=300'
    });
    if (object.ContentLength) res.set('Content-Length', String(object.ContentLength));
    object.Body.on?.('error', error => { console.error('[QuotationFiles] Lectura interrumpida:', error.message); res.destroy(error); });
    object.Body.pipe(res);
};

/** El cliente baja un adjunto desde el enlace de su propuesta. */
export const servePublicQuotationFile = async (req, res, { db = prisma, storage = { get: getFromS3Stream } } = {}) => {
    const quotation = await db.quotation.findUnique({ where: { uuid_slug: req.params.uuid_slug }, select: { id: true, status: true } });
    if (!quotation || !PUBLIC_STATUSES.includes(quotation.status)) return res.status(404).json({ error: 'Archivo no encontrado.' });
    const row = await db.quotationFile.findUnique({ where: { id: req.params.fileId } });
    if (!row || row.quotationId !== quotation.id) return res.status(404).json({ error: 'Archivo no encontrado.' });
    return streamFile(res, row, storage.get);
};

/** Quien tiene Cotizaciones baja un adjunto desde la pantalla. */
export const serveQuotationFile = async (req, res, { db = prisma, storage = { get: getFromS3Stream } } = {}) => {
    const row = await db.quotationFile.findUnique({ where: { id: req.params.fileId } });
    if (!row || (row.quotationId && row.quotationId !== req.params.id)) return res.status(404).json({ error: 'Archivo no encontrado.' });
    return streamFile(res, row, storage.get);
};

/** Barrido diario: borra los archivos que nunca se guardaron en una propuesta (o se quitaron) hace más de un día. */
export const sweepQuotationFiles = async ({ db = prisma, storage = { remove: deleteFromS3 }, now = new Date() } = {}) => {
    const cutoff = new Date(new Date(now).getTime() - ORPHAN_FILE_HOURS * 60 * 60 * 1000);
    const rows = await db.quotationFile.findMany({ where: { quotationId: null, createdAt: { lt: cutoff } }, take: 2000 });
    const result = { deleted: 0, failed: 0 };
    for (const row of rows) {
        if (!String(row.storageKey).startsWith(QUOTATION_FILE_PREFIX)) continue;
        try {
            await storage.remove(row.storageKey);
            await db.quotationFile.delete({ where: { id: row.id } });
            result.deleted += 1;
        } catch (error) {
            console.error(`[QuotationFiles] No se pudo borrar ${row.storageKey}:`, error.message);
            result.failed += 1;
        }
    }
    return result;
};

export const startQuotationFileSweep = ({ intervalMs = DAY_MS } = {}) => {
    const run = () => sweepQuotationFiles()
        .then(r => { if (r.deleted || r.failed) console.log(`[QuotationFiles] Barrido: ${r.deleted} sueltos borrados, ${r.failed} fallidos.`); })
        .catch(error => console.error('[QuotationFiles] Falló el barrido:', error.message));
    const timer = setInterval(run, intervalMs);
    timer.unref?.();
    setTimeout(run, 90_000).unref?.();
    return timer;
};
