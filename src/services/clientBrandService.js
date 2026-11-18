import { zipSync } from 'fflate';
import prisma from '../lib/prisma.js';
import { getPlatformStorage } from './platformStorageService.js';
import {
    BRAND_LIMITS,
    brandCompleteness,
    brandFileProblem,
    normalizeBrandInput
} from '../lib/clientBrand.js';

// Ficha de marca de cada cliente (Rodny, 18 de noviembre de 2026). Lectura para cualquiera con sesión;
// la escritura la protege la ruta con `canEditBrand`. Los archivos van al almacenamiento de la plataforma.

const failure = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const actorId = (user) => user?.userId || user?.id || null;

const publicFile = (file) => ({
    id: file.id,
    kind: file.kind,
    label: file.label,
    name: file.name,
    mimeType: file.mimeType,
    size: file.size,
    createdAt: file.createdAt
});

const asList = (value) => (Array.isArray(value) ? value : []);

/** La ficha que ve la pantalla: nunca lleva la clave del almacenamiento. */
export function presentBrand(client, brand) {
    const files = (brand?.files || []).filter((file) => !file.deletedAt);
    const shaped = brand ? {
        id: brand.id,
        tagline: brand.tagline,
        voice: brand.voice,
        usageNotes: brand.usageNotes,
        manualUrl: brand.manualUrl,
        canvaUrl: brand.canvaUrl,
        logosUrl: brand.logosUrl,
        colors: asList(brand.colors),
        fonts: asList(brand.fonts),
        links: asList(brand.links),
        source: brand.source,
        revision: brand.revision,
        updatedAt: brand.updatedAt,
        files: files.map(publicFile)
    } : null;
    return {
        client: { id: client.id, name: client.name, slug: client.slug, logoUrl: client.logoUrl, status: client.status, isArchived: Boolean(client.isArchived) },
        brand: shaped,
        completeness: brandCompleteness(shaped || {}, files)
    };
}

const BRAND_INCLUDE = { files: { where: { deletedAt: null }, orderBy: { createdAt: 'asc' } } };

// Tipografías de Google: Rodny pidió que también se puedan descargar. Google Fonts no da un .zip por enlace,
// así que el servidor pide la hoja de estilos oficial (sin navegador, Google responde con .ttf), baja cada
// archivo y los entrega juntos. Las fuentes de Google son de licencia abierta (OFL/Apache).
const GOOGLE_CSS = 'https://fonts.googleapis.com/css2';
const GOOGLE_FILE = /^https:\/\/fonts\.gstatic\.com\//;
const FONT_LIMIT_BYTES = 40 * 1024 * 1024;
const fontSlug = (family) => String(family).trim().replace(/\s+/g, '-');

/**
 * Una consulta por estilo y peso (100–900, normal e itálica): Google rechaza la consulta entera si un solo
 * peso no existe, así que se pregunta uno por uno y se queda con los que respondan.
 */
function googleFontQueries(family) {
    const name = String(family).trim().replace(/\s+/g, '+');
    const queries = [];
    for (const italic of [0, 1]) {
        for (let weight = 100; weight <= 900; weight += 100) queries.push(`family=${name}:ital,wght@${italic},${weight}`);
    }
    return queries;
}

/** Saca de la hoja de Google cada archivo con su estilo y peso, sin repetir. */
export function parseGoogleFontCss(css = '') {
    const files = [];
    const seen = new Set();
    for (const block of String(css).split('@font-face').slice(1)) {
        const url = block.match(/url\((https:[^)]+)\)/)?.[1];
        if (!url || !GOOGLE_FILE.test(url) || seen.has(url)) continue;
        seen.add(url);
        const style = block.match(/font-style:\s*(\w+)/)?.[1] || 'normal';
        const weight = (block.match(/font-weight:\s*([\d ]+)/)?.[1] || '400').trim().replace(/\s+/g, '-');
        const ext = url.match(/\.(ttf|otf|woff2?)(\?|$)/)?.[1] || 'ttf';
        files.push({ url, style, weight, ext });
    }
    return files;
}

export function clientBrandService({ db = prisma, storage = () => getPlatformStorage('PLATFORM'), fetchImpl = (...args) => fetch(...args) } = {}) {
    const findClient = async (clientId) => {
        const client = await db.client.findUnique({
            where: { id: String(clientId || '') },
            select: { id: true, name: true, slug: true, logoUrl: true, status: true, isArchived: true }
        });
        if (!client) throw failure('Ese cliente no existe.', 404);
        return client;
    };

    return {
        /**
         * Todos los clientes con su marca, cada uno con `client.isArchived`. La pestaña sigue al módulo de
         * Clientes: los activos al frente y los archivados aparte, igual que en el Directorio (Rodny: «si un
         * cliente está archivado, no se muestra allí, se muestra también archivado»).
         */
        async list() {
            const clients = await db.client.findMany({
                orderBy: { name: 'asc' },
                select: { id: true, name: true, slug: true, logoUrl: true, status: true, isArchived: true, brand: { include: BRAND_INCLUDE } }
            });
            return { brands: clients.map((client) => presentBrand(client, client.brand)) };
        },

        async get(clientId) {
            const client = await findClient(clientId);
            const brand = await db.clientBrand.findUnique({ where: { clientId: client.id }, include: BRAND_INCLUDE });
            return presentBrand(client, brand);
        },

        /**
         * Guarda la ficha entera. `revision` es la que vio la persona: si otra guardó antes, se avisa y no
         * se pisa (409), igual que en el resto de la plataforma.
         */
        async save(clientId, input = {}, user) {
            const client = await findClient(clientId);
            const { brand, problems } = normalizeBrandInput(input);
            if (problems.length) throw failure(problems[0]);
            const expected = input.revision == null ? null : Number(input.revision);
            const existing = await db.clientBrand.findUnique({ where: { clientId: client.id } });
            const data = { ...brand, updatedById: actorId(user) };
            if (!existing) {
                await db.clientBrand.create({
                    data: { ...data, clientId: client.id, createdById: actorId(user), source: input.source ? String(input.source).slice(0, 200) : 'Pantalla' }
                });
            } else {
                if (expected != null && expected !== existing.revision) {
                    throw failure('Alguien guardó esta marca mientras la editabas. Recarga para ver sus cambios antes de guardar los tuyos.', 409);
                }
                const result = await db.clientBrand.updateMany({
                    where: { id: existing.id, revision: existing.revision },
                    data: { ...data, revision: { increment: 1 } }
                });
                if (result.count !== 1) throw failure('Alguien guardó esta marca a la vez. Recarga e inténtalo de nuevo.', 409);
            }
            return this.get(client.id);
        },

        async addFile(clientId, { kind, label, file } = {}, user) {
            const client = await findClient(clientId);
            if (!file) throw failure('Elige un archivo para subir.');
            const problem = brandFileProblem({ kind, name: file.originalname, size: file.size });
            if (problem) throw failure(problem);
            let brand = await db.clientBrand.findUnique({ where: { clientId: client.id } });
            if (!brand) {
                brand = await db.clientBrand.create({ data: { clientId: client.id, createdById: actorId(user), updatedById: actorId(user), source: 'Pantalla' } });
            }
            const stored = await storage().uploadToS3(file, `brands/${client.id}`, { maxBytes: BRAND_LIMITS.fileBytes });
            await db.clientBrandFile.create({
                data: {
                    brandId: brand.id,
                    kind,
                    label: label ? String(label).trim().slice(0, 80) : null,
                    key: stored.key,
                    name: stored.name,
                    mimeType: stored.mimeType || null,
                    size: stored.size || null,
                    storageArea: 'PLATFORM',
                    createdById: actorId(user)
                }
            });
            return this.get(client.id);
        },

        /** Retirar un archivo lo marca; el objeto se queda en el almacenamiento y la fila con su historia. */
        async removeFile(clientId, fileId, user) {
            const file = await db.clientBrandFile.findFirst({
                where: { id: String(fileId || ''), deletedAt: null, brand: { clientId: String(clientId || '') } }
            });
            if (!file) throw failure('Ese archivo ya no está en la marca.', 404);
            await db.clientBrandFile.update({ where: { id: file.id }, data: { deletedAt: new Date(), deletedById: actorId(user) } });
            return this.get(clientId);
        },

        /** Un enlace firmado de corta vida para ver o descargar; la clave nunca sale al navegador. */
        async fileLink(clientId, fileId, { download = false } = {}) {
            const file = await db.clientBrandFile.findFirst({
                where: { id: String(fileId || ''), deletedAt: null, brand: { clientId: String(clientId || '') } }
            });
            if (!file) throw failure('Ese archivo ya no está en la marca.', 404);
            return { file, download };
        },

        /**
         * Un .zip con los archivos de una tipografía de Google de la ficha. Solo las que la ficha tiene
         * marcadas como de Google: la ruta no es un puente para bajar cualquier cosa.
         */
        async googleFontZip(clientId, family) {
            const client = await findClient(clientId);
            const brand = await db.clientBrand.findUnique({ where: { clientId: client.id } });
            const wanted = String(family || '').trim().toLowerCase();
            const font = asList(brand?.fonts).find((item) => item?.source === 'GOOGLE' && String(item.family || '').trim().toLowerCase() === wanted);
            if (!font) throw failure('Esa tipografía no está en la marca como fuente de Google.', 404);
            const sheets = await Promise.all(googleFontQueries(font.family).map(async (query) => {
                const response = await fetchImpl(`${GOOGLE_CSS}?${query}`, { headers: { 'User-Agent': 'font-download' } }).catch(() => null);
                return response?.ok ? response.text() : '';
            }));
            const files = parseGoogleFontCss(sheets.join('\n'));
            if (!files.length) throw failure('Google Fonts no tiene esa tipografía. Revisa el nombre en la ficha.', 404);
            const entries = {};
            let total = 0;
            const base = fontSlug(font.family);
            for (const file of files) {
                const response = await fetchImpl(file.url);
                if (!response.ok) throw failure('Google Fonts no respondió. Inténtalo en un momento.', 502);
                const bytes = new Uint8Array(await response.arrayBuffer());
                total += bytes.length;
                if (total > FONT_LIMIT_BYTES) throw failure('La tipografía pesa demasiado para bajarla junta.', 413);
                let name = `${base}-${file.weight}${file.style === 'italic' ? '-Italic' : ''}.${file.ext}`;
                for (let n = 2; entries[name]; n += 1) name = `${base}-${file.weight}${file.style === 'italic' ? '-Italic' : ''}-${n}.${file.ext}`;
                entries[name] = bytes;
            }
            entries['LEEME.txt'] = new TextEncoder().encode(
                `${font.family} — tipografía de Google Fonts (licencia abierta).\nMarca: ${client.name}\nMás información: https://fonts.google.com/specimen/${font.family.trim().replace(/\s+/g, '+')}\n`
            );
            return { name: `${base}.zip`, buffer: Buffer.from(zipSync(entries, { level: 0 })) };
        },

        async openFile(file) {
            const response = await storage().getFromS3Stream(file.key);
            return response;
        }
    };
}
