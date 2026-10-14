import prisma from '../lib/prisma.js';
import { listS3Objects, deleteFromS3 } from './s3Service.js';

// Limpieza de `temp/` (Rodny, 14 de octubre de 2026: «sí, arregla lo de temp»).
//
// `POST /api/tasks/upload-temp` sube un archivo **antes** de que la tarea exista, para
// poder adjuntarlo mientras se escribe el borrador. Cuando la tarea se guarda, ese archivo
// queda referenciado en `TaskAttachment.url`. Cuando alguien abandona el formulario, no:
// el archivo se queda ahí para siempre, en una carpeta cuyo nombre promete que es
// pasajera. Medido en producción ese día: 75 archivos, 42 referenciados, **31 huérfanos
// de más de 7 días y 49,2 MB**, ninguno citado dentro del texto de una tarea.
//
// Los bytes borrados no vuelven, así que **toda comprobación falla del lado de
// conservar**: sin fecha, sin nombre, fuera de `temp/`, referenciado, reciente, o si la
// base no responde, el archivo se queda.

export const TEMP_PREFIX = 'temp/';
export const DEFAULT_TEMP_RETENTION_DAYS = 7;

/** Lee el interruptor sin interpretar nada como un sí. */
export const tempSweepEnabled = (env = process.env) =>
    String(env.TEMP_UPLOAD_SWEEP_ENABLED || '').trim() === 'true';

export const tempRetentionDaysFrom = (env = process.env) => {
    const raw = Number(env.TEMP_UPLOAD_SWEEP_DAYS);
    return Number.isFinite(raw) && raw >= 1 ? raw : DEFAULT_TEMP_RETENTION_DAYS;
};

/**
 * Decide un solo archivo y dice por qué, para que una simulación pueda explicarse en vez
 * de imprimir un número suelto.
 */
export const tempPurgeDecision = (object, { now = new Date(), retentionDays = DEFAULT_TEMP_RETENTION_DAYS, referenced = false } = {}) => {
    const keep = (reason) => ({ purge: false, reason, key: object?.Key });

    if (!object?.Key) return keep('missing-key');
    if (!String(object.Key).startsWith(TEMP_PREFIX)) return keep('not-temp');
    if (referenced) return keep('referenced');

    const modified = object.LastModified ? new Date(object.LastModified).getTime() : NaN;
    if (!Number.isFinite(modified)) return keep('missing-date');

    const cutoff = new Date(now).getTime() - retentionDays * 24 * 60 * 60 * 1000;
    if (modified > cutoff) return keep('too-recent');

    return { purge: true, reason: 'orphan', key: object.Key };
};

/** El nombre del archivo dentro de `temp/`, que es lo que comparte la URL guardada. */
const tempNameOf = (value) => {
    const text = String(value || '');
    const index = text.indexOf(`/${TEMP_PREFIX}`);
    if (index >= 0) return text.slice(index + TEMP_PREFIX.length + 1);
    return text.startsWith(TEMP_PREFIX) ? text.slice(TEMP_PREFIX.length) : null;
};

/**
 * Barre `temp/`. `storage` y `db` se inyectan para poder probarlo; en producción usa el
 * almacenamiento compartido y Prisma.
 */
export const sweepTempUploads = async ({
    storage = { list: (prefix) => listS3Objects(prefix), remove: (key) => deleteFromS3(key) },
    db = prisma,
    now = new Date(),
    retentionDays = tempRetentionDaysFrom(),
    dryRun = false
} = {}) => {
    const objects = await storage.list(TEMP_PREFIX);

    // Qué sigue en uso. Si esto falla no se borra nada: sin saber qué está referenciado,
    // limpiar y perder el insumo de una tarea son la misma operación.
    let referenced;
    try {
        const rows = await db.taskAttachment.findMany({
            where: { url: { contains: `/${TEMP_PREFIX}` } },
            select: { url: true }
        });
        referenced = new Set(rows.map(row => tempNameOf(row.url)).filter(Boolean));
    } catch (error) {
        console.error('[TempSweep] No se pudo leer qué archivos siguen en uso; no se borró nada:', error.message);
        return { purged: 0, kept: objects.length, failed: 0, dryRun, error: error.message };
    }

    let purged = 0;
    let kept = 0;
    let failed = 0;

    for (const object of objects) {
        const name = tempNameOf(object?.Key);
        const decision = tempPurgeDecision(object, { now, retentionDays, referenced: Boolean(name && referenced.has(name)) });
        if (!decision.purge) { kept += 1; continue; }
        if (dryRun) { purged += 1; continue; }

        try {
            await storage.remove(object.Key);
            purged += 1;
        } catch (error) {
            // Un archivo que no se deja borrar no frena a los demás; vuelve en el próximo barrido.
            console.error(`[TempSweep] No se pudo borrar ${object.Key}:`, error.message);
            failed += 1;
        }
    }

    return { purged, kept, failed, dryRun };
};

/** Un barrido al día, apagado salvo que la variable lo encienda. */
export const startTempUploadSweep = ({ env = process.env, intervalMs = 24 * 60 * 60 * 1000 } = {}) => {
    if (!tempSweepEnabled(env)) return null;
    const run = () => sweepTempUploads()
        .then(result => console.log(`[TempSweep] ${result.purged} borrados, ${result.kept} conservados, ${result.failed} fallidos.`))
        .catch(error => console.error('[TempSweep] Falló el barrido:', error.message));
    const timer = setInterval(run, intervalMs);
    timer.unref?.();
    run();
    return timer;
};
