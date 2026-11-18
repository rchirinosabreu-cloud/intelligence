// La ficha de marca de cada cliente (Rodny, 18 de noviembre de 2026: «a veces la gente anda preguntando
// que cuál es el color de este cliente, que cuál esto, cuál aquello»). Una sola estructura para todos:
// logos, colores, tipografías, tono y enlaces al manual original. La regla vive aquí y la usan la
// pantalla, el servidor y el importador de manuales, así que una ficha se valida igual en los tres.
//
// Cualquier persona con sesión **ve** las marcas (aunque no tenga el módulo de Clientes); escribir es
// de dirección, project managers y de quien tenga Clientes con rol de editor (`canEditBrand`).

export const BRAND_COLOR_ROLES = Object.freeze(['PRINCIPAL', 'SECUNDARIO', 'ACENTO', 'NEUTRO', 'FONDO']);
export const BRAND_COLOR_ROLE_LABELS = Object.freeze({
    PRINCIPAL: 'Principal',
    SECUNDARIO: 'Secundario',
    ACENTO: 'Acento',
    NEUTRO: 'Neutro',
    FONDO: 'Fondo'
});

export const BRAND_FONT_USES = Object.freeze(['TITULOS', 'TEXTOS', 'LOGO', 'COMPLEMENTARIA']);
export const BRAND_FONT_USE_LABELS = Object.freeze({
    TITULOS: 'Títulos',
    TEXTOS: 'Textos',
    LOGO: 'Logo',
    COMPLEMENTARIA: 'Complementaria'
});

// De dónde se saca la fuente: Google Fonts se enlaza (es libre); una comercial se sube como archivo y
// solo la descarga el equipo, porque su licencia no es nuestra para repartir.
export const BRAND_FONT_SOURCES = Object.freeze(['GOOGLE', 'ARCHIVO', 'COMERCIAL']);
export const BRAND_FONT_SOURCE_LABELS = Object.freeze({
    GOOGLE: 'Google Fonts',
    ARCHIVO: 'Archivo subido',
    COMERCIAL: 'Comercial (con licencia)'
});

export const BRAND_FILE_KINDS = Object.freeze(['LOGO', 'FUENTE', 'MANUAL', 'RECURSO']);
export const BRAND_FILE_KIND_LABELS = Object.freeze({
    LOGO: 'Logo',
    FUENTE: 'Tipografía',
    MANUAL: 'Manual de marca',
    RECURSO: 'Recurso gráfico'
});

export const BRAND_LIMITS = Object.freeze({
    colors: 24,
    fonts: 8,
    links: 10,
    text: 2000,
    name: 80,
    fileBytes: 50 * 1024 * 1024
});

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;
const MANAGER_ROLES = new Set(['ADMIN', 'PROJECT_MANAGER']);

const clean = (value, max = BRAND_LIMITS.name) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanBlock = (value) => String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, BRAND_LIMITS.text);

/** «#abc», «ABC123» o «# 009BBF» → «#AABBCC». Lo que no es un color devuelve null. */
export function normalizeHex(value) {
    const raw = String(value ?? '').replace(/\s+/g, '').trim();
    const match = raw.match(HEX);
    if (!match) return null;
    const digits = match[1].length === 3 ? match[1].split('').map((c) => c + c).join('') : match[1];
    return `#${digits.toUpperCase()}`;
}

export function hexToRgb(hex) {
    const normal = normalizeHex(hex);
    if (!normal) return null;
    const n = Number.parseInt(normal.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const rgbText = (hex) => {
    const rgb = hexToRgb(hex);
    return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : '';
};

/** CMYK aproximado desde el HEX, solo de referencia: el manual manda si trae el suyo. */
export function hexToCmyk(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const r = rgb.r / 255; const g = rgb.g / 255; const b = rgb.b / 255;
    const k = 1 - Math.max(r, g, b);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
    const pct = (v) => Math.round(((1 - v - k) / (1 - k)) * 100);
    return { c: pct(r), m: pct(g), y: pct(b), k: Math.round(k * 100) };
}

/** Texto legible sobre la muestra: oscuro sobre colores claros, blanco sobre oscuros (luminancia WCAG). */
export function readableTextOn(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return '#18181B';
    const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const luminance = 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
    return luminance > 0.4 ? '#18181B' : '#FFFFFF';
}

const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

const safeUrl = (value) => {
    const text = clean(value, 600);
    if (!text) return null;
    try {
        const url = new URL(text);
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
    } catch {
        return null;
    }
};

/** Enlace de Google Fonts para una familia: sirve para cargar la vista previa y para que la descarguen. */
export function googleFontUrl(family) {
    const name = clean(family);
    if (!name) return null;
    return `https://fonts.google.com/specimen/${encodeURIComponent(name).replace(/%20/g, '+')}`;
}

export function googleFontCssUrl(family) {
    const name = clean(family);
    if (!name) return null;
    return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name).replace(/%20/g, '+')}:wght@300;400;700&display=swap`;
}

/**
 * Deja una ficha lista para guardar y dice qué no se pudo entender, en español. No inventa nada:
 * un color que no es HEX se rechaza diciendo cuál, nunca se adivina.
 */
export function normalizeBrandInput(input = {}) {
    const problems = [];
    const seenHex = new Set();
    const rawColors = Array.isArray(input.colors) ? input.colors : [];
    if (rawColors.length > BRAND_LIMITS.colors) problems.push(`Una marca admite ${BRAND_LIMITS.colors} colores como máximo.`);
    const colors = [];
    for (const [index, color] of rawColors.slice(0, BRAND_LIMITS.colors).entries()) {
        const hex = normalizeHex(color?.hex);
        if (!hex) {
            problems.push(`El color ${index + 1}${color?.name ? ` («${clean(color.name)}»)` : ''} no es un código HEX válido.`);
            continue;
        }
        const role = pick(color?.role, BRAND_COLOR_ROLES, index === 0 ? 'PRINCIPAL' : 'SECUNDARIO');
        const key = `${hex}:${role}`;
        if (seenHex.has(key)) continue;
        seenHex.add(key);
        colors.push({
            hex,
            name: clean(color?.name) || null,
            role,
            cmyk: clean(color?.cmyk, 40) || null,
            pantone: clean(color?.pantone, 40) || null
        });
    }

    const rawFonts = Array.isArray(input.fonts) ? input.fonts : [];
    if (rawFonts.length > BRAND_LIMITS.fonts) problems.push(`Una marca admite ${BRAND_LIMITS.fonts} tipografías como máximo.`);
    const fonts = [];
    for (const [index, font] of rawFonts.slice(0, BRAND_LIMITS.fonts).entries()) {
        const family = clean(font?.family);
        if (!family) {
            problems.push(`La tipografía ${index + 1} no tiene nombre.`);
            continue;
        }
        const source = pick(font?.source, BRAND_FONT_SOURCES, 'COMERCIAL');
        fonts.push({
            family,
            use: pick(font?.use, BRAND_FONT_USES, index === 0 ? 'TITULOS' : 'TEXTOS'),
            weights: clean(font?.weights, 120) || null,
            source,
            url: source === 'GOOGLE' ? googleFontUrl(family) : safeUrl(font?.url)
        });
    }

    const rawLinks = Array.isArray(input.links) ? input.links : [];
    const links = [];
    for (const link of rawLinks.slice(0, BRAND_LIMITS.links)) {
        const url = safeUrl(link?.url);
        if (!url) continue;
        links.push({ label: clean(link?.label) || 'Enlace', url });
    }

    return {
        brand: {
            tagline: clean(input.tagline, 160) || null,
            voice: cleanBlock(input.voice) || null,
            usageNotes: cleanBlock(input.usageNotes) || null,
            manualUrl: safeUrl(input.manualUrl),
            canvaUrl: safeUrl(input.canvaUrl),
            logosUrl: safeUrl(input.logosUrl),
            colors,
            fonts,
            links
        },
        problems
    };
}

/** Qué tan completa está la ficha: lo que el equipo pregunta más va primero. */
export function brandCompleteness(brand = {}, files = []) {
    const liveFiles = (files || []).filter((file) => !file.deletedAt);
    const checks = [
        { key: 'logo', label: 'Logo', done: liveFiles.some((f) => f.kind === 'LOGO') },
        { key: 'colores', label: 'Colores', done: (brand.colors || []).length > 0 },
        { key: 'tipografias', label: 'Tipografías', done: (brand.fonts || []).length > 0 },
        { key: 'manual', label: 'Manual', done: Boolean(brand.manualUrl) || liveFiles.some((f) => f.kind === 'MANUAL') },
        { key: 'tono', label: 'Tono y reglas', done: Boolean(brand.voice || brand.usageNotes) }
    ];
    const done = checks.filter((c) => c.done).length;
    return { done, total: checks.length, missing: checks.filter((c) => !c.done).map((c) => c.label), checks };
}

/** Escribir una marca: dirección, project managers, y quien tenga Clientes con rol de editor. */
export function canEditBrand(user) {
    const role = String(user?.role || '').toUpperCase();
    if (MANAGER_ROLES.has(role)) return true;
    if (role !== 'EDITOR') return false;
    const raw = user?.modulePermissions;
    let permissions = raw;
    if (typeof raw === 'string') {
        try { permissions = JSON.parse(raw); } catch { permissions = {}; }
    }
    return permissions?.clientes === true || permissions?.Clientes === true;
}

/** Un archivo de marca tiene un tipo y una forma conocidos; el SVG se rechaza en toda la plataforma. */
export function brandFileProblem({ kind, name, size } = {}) {
    if (!BRAND_FILE_KINDS.includes(kind)) return 'Elige qué es el archivo: logo, tipografía, manual o recurso.';
    if (!clean(name)) return 'El archivo no tiene nombre.';
    if (Number(size) > BRAND_LIMITS.fileBytes) return `«${clean(name)}» pesa más de 50 MB.`;
    const ext = String(name).toLowerCase().split('.').pop();
    if (ext === 'svg' || ext === 'svgz') return 'Los SVG no se aceptan en la plataforma: sube el logo en PNG o PDF.';
    if (kind === 'FUENTE' && !['ttf', 'otf', 'woff', 'woff2', 'zip'].includes(ext)) {
        return 'Una tipografía se sube como .ttf, .otf, .woff, .woff2 o un .zip con la familia.';
    }
    if (kind === 'LOGO' && !['png', 'jpg', 'jpeg', 'webp', 'pdf', 'ai', 'eps', 'zip'].includes(ext)) {
        return 'Un logo se sube como PNG, JPG, WEBP, PDF, AI, EPS o un .zip con las versiones.';
    }
    return null;
}

/** El nombre del cliente sin tildes ni símbolos, para encontrarlo al importar y al buscar. */
export function brandSearchKey(value) {
    return String(value ?? '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * A qué cliente de la plataforma corresponde una ficha importada. Solo por coincidencia exacta del
 * nombre o el slug con alguno de sus alias (sin tildes ni símbolos): nunca por parecido, porque dos
 * «Wine» distintos no son el mismo cliente. Más de un cliente posible es una pregunta, no una elección.
 */
export function matchBrandToClient(entry, clients = []) {
    const keys = new Set((entry?.aliases || []).map(brandSearchKey).filter(Boolean));
    const found = clients.filter((client) => keys.has(brandSearchKey(client.name)) || keys.has(brandSearchKey(client.slug)));
    if (found.length === 1) return { client: found[0], problem: null };
    if (found.length > 1) return { client: null, problem: `coincide con varios clientes: ${found.map((c) => c.name).join(', ')}` };
    // Sin nombre exacto, una palabra propia de la marca («haad», «endova») que aparezca entera en el nombre de un
    // solo cliente. Nunca un parecido: si la tienen dos, no se elige ninguno.
    const words = (entry?.matchWords || []).map(brandSearchKey).filter((word) => word.length >= 4);
    if (words.length) {
        const byWord = clients.filter((client) => {
            const name = ` ${brandSearchKey(client.name)} `;
            const compact = brandSearchKey(client.name).replace(/ /g, '');
            return words.some((word) => name.includes(` ${word} `) || (!word.includes(' ') && compact === word));
        });
        if (byWord.length === 1) return { client: byWord[0], problem: null };
        if (byWord.length > 1) return { client: null, problem: `la palabra de la marca coincide con varios clientes: ${byWord.map((c) => c.name).join(', ')}` };
    }
    return { client: null, problem: 'no hay un cliente con ese nombre en la plataforma' };
}
