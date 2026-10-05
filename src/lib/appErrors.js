// Errores de la pantalla (Rodny, 5 de octubre de 2026): a Elisa le salía «No pudimos cargar esta
// sección» cada vez que entraba. Eran archivos de una versión anterior que ya no existían tras un
// despliegue. Aquí vive la regla que distingue eso de un error real, y la forma del registro que
// se manda al servidor para poder saber, la próxima vez, qué vio exactamente la persona.

const CHUNK_ERROR_PATTERNS = [
    /failed to fetch dynamically imported module/i,
    /error loading dynamically imported module/i,
    /importing a module script failed/i,
    /unable to preload css/i,
    /loading (css )?chunk \S+ failed/i,
    // React.lazy cuando la recuperación ya pidió recargar y la importación quedó vacía.
    /received a promise that resolves to: undefined/i,
    /expected the result of a dynamic import\(\) call/i
];

/** Si un error es un archivo de la app que no se pudo cargar (casi siempre, una versión vieja). */
export const isChunkLoadError = (error) => {
    if (!error) return false;
    if (typeof error === 'string') return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(error));
    if (error.name === 'ChunkLoadError') return true;
    const message = String(error.message || '');
    return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

export const CLIENT_ERROR_KINDS = new Set(['render', 'version-reload', 'version-stale']);
export const CLIENT_ERROR_LIMITS = Object.freeze({ message: 500, stack: 4000, componentStack: 2000, route: 300, build: 64, userAgent: 300 });

const clip = (value, max) => {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    return text ? text.slice(0, max) : null;
};

/** Valida y recorta lo que manda el navegador; nunca pasa un campo que no esté aquí. */
export const normalizeClientErrorReport = (body = {}) => {
    const kind = String(body?.kind || '');
    const message = clip(body?.message, CLIENT_ERROR_LIMITS.message);
    if (!CLIENT_ERROR_KINDS.has(kind) || !message) return { valid: false };
    const reference = typeof body.reference === 'string' && /^E-[A-Z0-9]{6}$/.test(body.reference) ? body.reference : null;
    return {
        valid: true,
        report: {
            kind,
            reference,
            message,
            stack: clip(body.stack, CLIENT_ERROR_LIMITS.stack),
            componentStack: clip(body.componentStack, CLIENT_ERROR_LIMITS.componentStack),
            route: clip(body.route, CLIENT_ERROR_LIMITS.route),
            build: clip(body.build, CLIENT_ERROR_LIMITS.build),
            userAgent: clip(body.userAgent, CLIENT_ERROR_LIMITS.userAgent)
        }
    };
};

const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Un código corto que la persona puede dictar y que aparece en el registro del servidor. */
export const newErrorReference = () => {
    let code = '';
    for (let index = 0; index < 6; index += 1) code += REFERENCE_ALPHABET[Math.floor(Math.random() * REFERENCE_ALPHABET.length)];
    return `E-${code}`;
};
