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

/** En modo demo el servidor no arranca sobre una base que no sea de demo; sin modo demo no comprueba nada. */
export const assertDemoDatabase = (env = process.env) => {
    if (!isDemoMode(env)) return;
    const problem = demoDatabaseProblem(env);
    if (problem) throw new Error(`Modo demo sobre una base que no es de demo. ${problem}`);
};
