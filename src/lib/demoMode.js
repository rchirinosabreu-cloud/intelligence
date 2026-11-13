// La versión «Demo» de Intelligence (Rodny, 26 de octubre de 2026): el mismo código desplegado otra vez, con
// otra base y una agencia inventada, para enseñarle la plataforma a un cliente sin los datos de Brain Studio.
//
// Dos candados que tienen que estar abiertos a la vez para sembrar o reiniciar, y para que el servidor
// arranque en modo demo: `DEMO_MODE=true` y una base cuyo nombre diga «demo». El `.env` local apunta a
// producción, así que un `npm run demo:reset` distraído tiene que negarse solo; eso no se le confía a nadie.

export const DEMO_DATABASE_MARK = /demo/i;

export const isDemoMode = (env = process.env) => String(env.DEMO_MODE ?? '').trim().toLowerCase() === 'true';

const parseDatabaseUrl = (value) => {
    try { return new URL(String(value || '')); } catch { return null; }
};

/** «host:puerto/base», nunca la contraseña: es lo que se imprime antes de tocar una base. */
export const describeDatabaseTarget = (value) => {
    const url = parseDatabaseUrl(value);
    if (!url) return '(dirección no legible)';
    return `${url.hostname}:${url.port || '5432'}${url.pathname}`;
};

/** Por qué no se puede sembrar o reiniciar sobre esta base, en una frase; `null` si los dos candados están abiertos. */
export const demoDatabaseProblem = (env = process.env) => {
    if (!isDemoMode(env)) return 'Falta DEMO_MODE=true: la semilla de demo solo corre en modo demo.';
    if (!env.DATABASE_URL) return 'Falta DATABASE_URL: indica la base de demo.';
    const url = parseDatabaseUrl(env.DATABASE_URL);
    if (!url) return 'DATABASE_URL no se entiende como una dirección.';
    if (!/^postgres(ql)?:$/.test(url.protocol)) return 'DATABASE_URL tiene que ser una base de PostgreSQL.';
    const database = url.pathname.replace(/^\//, '');
    if (!DEMO_DATABASE_MARK.test(database)) {
        return `La base ${describeDatabaseTarget(env.DATABASE_URL)} no se llama «demo»: no se toca. La semilla solo escribe en una base cuyo nombre lleve esa palabra.`;
    }
    return null;
};

// La demo sin errores (Rodny, 13 de noviembre de 2026): la demo no tiene llaves de correo, Meta, WhatsApp, Fireflies ni
// OpenAI, y a quien la prueba no se le muestra un error: se le dice, con calma, que esa función depende de una conexión
// real. Solo toca lo que sale a servicios externos; la lógica del negocio es la misma de producción.
export const DEMO_CONNECTION_CODE = 'DEMO_CONNECTION';
export const DEMO_CONNECTION_MESSAGE = 'En la demo esta función no se conecta: depende de una conexión real.';

/** El aviso de la pantalla lo reconoce para mostrarlo como información y no como error. */
export const isDemoConnectionMessage = (text) => typeof text === 'string' && text.includes(DEMO_CONNECTION_MESSAGE);

/**
 * Qué responder en la demo cuando el servidor falla (5xx): el mensaje de conexión real en vez de «error inesperado».
 * Un 4xx no se toca: valida, niega un permiso o avisa de un conflicto, y eso sí le sirve a quien prueba la demo.
 * Fuera de la demo devuelve `null` y la respuesta sale tal cual.
 */
export const demoFriendlyPayload = (status, _body, env = process.env) => {
    if (!isDemoMode(env) || !(Number(status) >= 500)) return null;
    return { error: DEMO_CONNECTION_CODE, message: DEMO_CONNECTION_MESSAGE };
};

/** En modo demo el servidor no arranca sobre una base que no sea de demo; sin modo demo no comprueba nada. */
export const assertDemoDatabase = (env = process.env) => {
    if (!isDemoMode(env)) return;
    const problem = demoDatabaseProblem(env);
    if (problem) throw new Error(`Modo demo sobre una base que no es de demo. ${problem}`);
};
