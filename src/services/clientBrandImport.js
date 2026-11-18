import { matchBrandToClient, normalizeBrandInput } from '../lib/clientBrand.js';

// Cargar las fichas sacadas de los manuales del Drive (data/client-brands.json) — Rodny, 18 de noviembre de
// 2026: «cárgale todo lo que encontraste en los manuales … los logos yo quiero que se puedan descargar desde
// la plataforma». Lo usan el botón de dirección en la pestaña Marcas y `scripts/import-client-brands.js`.
//
// Reglas: solo clientes activos y por nombre o slug exactos; una ficha que ya existe no se pisa (lo que
// escribió el equipo manda), pero sí recibe los logos que le falten; un logo se reconoce por su etiqueta,
// también entre los retirados, así que uno que el equipo quitó no vuelve. Los logos se bajan de Drive (las
// carpetas están compartidas por enlace) y solo se aceptan si el archivo es de verdad un PNG.

const DRIVE_ID = /^[A-Za-z0-9_-]{20,80}$/;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MAX_LOGO_BYTES = 20 * 1024 * 1024;

export const driveDownloadUrl = (id) => `https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`;

export const isPng = (bytes) => bytes?.length > 8 && PNG_MAGIC.every((value, index) => bytes[index] === value);

const safeName = (text) => String(text || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);

/** Qué haría la carga con cada ficha, sin escribir nada. */
export function planBrandImport(dataset, clients) {
    return (dataset?.brands || []).map((entry) => {
        const { client, problem } = matchBrandToClient(entry, clients);
        const name = client?.name || entry.aliases?.[0] || 'Sin nombre';
        if (!client) return { name, action: 'OMITIR', reason: problem || 'No hay un cliente activo con ese nombre.' };
        const { brand, problems } = normalizeBrandInput(entry);
        if (problems.length) return { name, client, action: 'OMITIR', reason: problems.join(' ') };
        const logos = (Array.isArray(entry.logos) ? entry.logos : []).filter((logo) => DRIVE_ID.test(String(logo?.driveId || '')) && String(logo?.label || '').trim());
        return {
            name,
            client,
            entry,
            brand,
            logos,
            action: client.brand ? 'COMPLETAR' : 'CREAR'
        };
    });
}

async function downloadLogo(fetchImpl, logo) {
    const response = await fetchImpl(driveDownloadUrl(logo.driveId));
    if (!response.ok) throw new Error(`Drive respondió ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_LOGO_BYTES) throw new Error('pesa más de 20 MB');
    if (!isPng(bytes)) throw new Error('no es un PNG (¿el archivo no está compartido por enlace?)');
    return bytes;
}

/**
 * Corre la carga. Con `apply: false` solo cuenta qué haría (incluidos los logos que faltan); con
 * `apply: true` crea las fichas que faltan y sube los logos que falten a cada una.
 */
export async function runBrandImport({ db, service, dataset, apply = false, user = null, fetchImpl = (...args) => fetch(...args), concurrency = 4 }) {
    const clients = await db.client.findMany({
        where: { isArchived: false },
        select: { id: true, name: true, slug: true, brand: { select: { id: true } } }
    });
    const plan = planBrandImport(dataset, clients);
    const report = [];
    const claimed = new Set();

    for (const item of plan) {
        if (item.action === 'OMITIR') { report.push({ name: item.name, action: 'OMITIR', reason: item.reason }); continue; }
        // Dos fichas del manual para un mismo cliente (una unidad dentro de otra): la primera crea, la segunda
        // solo le suma sus logos.
        if (item.action === 'CREAR' && claimed.has(item.client.id)) item.action = 'COMPLETAR';
        claimed.add(item.client.id);
        const existingLabels = new Set();
        const brandId = item.client.brand?.id || (apply ? (await db.clientBrand.findUnique({ where: { clientId: item.client.id } }))?.id : null);
        if (brandId) {
            const files = await db.clientBrandFile.findMany({ where: { brandId, kind: 'LOGO' }, select: { label: true } });
            for (const file of files) if (file.label) existingLabels.add(file.label.trim().toLowerCase());
        }
        const pending = item.logos.filter((logo) => !existingLabels.has(logo.label.trim().toLowerCase()));
        const line = {
            name: item.name,
            action: item.action,
            colors: item.brand.colors.length,
            fonts: item.brand.fonts.length,
            manual: Boolean(item.brand.manualUrl),
            logosNew: pending.length,
            logosAlready: item.logos.length - pending.length,
            logoProblems: []
        };
        report.push(line);
        if (!apply) continue;

        if (item.action === 'CREAR') {
            await db.clientBrand.create({
                data: {
                    ...item.brand,
                    clientId: item.client.id,
                    source: String(item.entry.source || 'Importado de los manuales').slice(0, 200),
                    createdById: user?.userId || user?.id || null,
                    updatedById: user?.userId || user?.id || null
                }
            });
        }

        let added = 0;
        for (let start = 0; start < pending.length; start += concurrency) {
            const batch = pending.slice(start, start + concurrency);
            const downloaded = await Promise.all(batch.map(async (logo) => {
                try { return { logo, bytes: await downloadLogo(fetchImpl, logo) }; }
                catch (error) { return { logo, error: error.message }; }
            }));
            for (const { logo, bytes, error } of downloaded) {
                if (error) { line.logoProblems.push(`${logo.label}: ${error}`); continue; }
                const file = { originalname: `${safeName(item.client.name)} - ${safeName(logo.label)}.png`, mimetype: 'image/png', size: bytes.length, buffer: bytes };
                try {
                    await service.addFile(item.client.id, { kind: 'LOGO', label: logo.label, file }, user);
                    added += 1;
                } catch (uploadError) {
                    line.logoProblems.push(`${logo.label}: ${uploadError.message}`);
                }
            }
        }
        line.logosAdded = added;
    }

    return {
        applied: Boolean(apply),
        report,
        totals: {
            created: report.filter((line) => line.action === 'CREAR').length,
            completed: report.filter((line) => line.action === 'COMPLETAR').length,
            skipped: report.filter((line) => line.action === 'OMITIR').length,
            logos: report.reduce((sum, line) => sum + (apply ? (line.logosAdded || 0) : (line.logosNew || 0)), 0)
        }
    };
}

/**
 * En cada arranque completa lo que falte de los manuales (Rodny, 18 de noviembre de 2026: «puedes cargar todo lo
 * que necesites en la base de datos»). Es idempotente: una ficha existente no se pisa y un logo ya cargado —o
 * retirado por el equipo— no se vuelve a subir, así que con todo cargado no baja nada. Sirve para los clientes
 * que se crean después con el nombre del manual. Nunca lanza: un fallo se anota y el servidor sigue.
 */
export async function seedBrandsOnBoot({ db, service, dataset, fetchImpl, log = console } = {}) {
    try {
        const result = await runBrandImport({ db, service, dataset, apply: true, ...(fetchImpl ? { fetchImpl } : {}) });
        if (result.totals.created || result.totals.logos) {
            log.log?.(`[Brands] Fichas de los manuales: ${result.totals.created} nuevas, ${result.totals.logos} logos.`);
        }
        for (const line of result.report) {
            if (line.action === 'OMITIR') log.log?.(`[Brands] Sin cargar ${line.name}: ${line.reason}`);
            for (const problem of line.logoProblems || []) log.warn?.(`[Brands] ${line.name}: ${problem}`);
        }
        return result;
    } catch (error) {
        log.error?.('[Brands] No se pudieron cargar las fichas de los manuales:', error.message);
        return { error: error.message };
    }
}
