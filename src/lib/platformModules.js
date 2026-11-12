// Una sola lista de módulos para toda la plataforma (Rodny, 12 de octubre de 2026: «cada vez
// que exista un módulo nuevo, debe reflejarse ahí y en todos lados … es algo global»).
// De aquí salen las casillas de la ventana de Equipo, los permisos por rol, lo que guarda el
// servidor y la decisión de quién entra, en la pantalla y en la API. Un módulo nuevo se
// añade aquí y en ningún otro sitio de permisos; `tests/platformModules.test.js` falla si el
// menú, una ruta o un guardián del servidor usan un módulo que esta lista no conoce, o si un
// módulo de la lista no tiene su entrada en el menú, su ruta y su bienvenida.
//
// `roles`: qué roles lo traen marcado al elegir el rol (el administrador entra a todo).
// `inheritsFrom`: mientras la persona no tenga la casilla guardada, vale lo de ese otro
// módulo. Drive nació colgado de Minutas, así que quien tenía Minutas conserva Drive el día
// del cambio sin tocar la base; al guardar desde Equipo, Drive queda escrito por sí mismo.

const EVERYONE = ['PROJECT_MANAGER', 'EDITOR', 'VIEWER'];
const WORKERS = ['PROJECT_MANAGER', 'EDITOR'];
const MANAGERS = ['PROJECT_MANAGER'];

export const PLATFORM_MODULES = Object.freeze([
    { key: 'manager', label: 'Manager', path: '/manager', roles: MANAGERS },
    { key: 'gestion', label: 'Gestión (Tareas)', path: '/gestion', roles: WORKERS, aliases: ['tareas'] },
    { key: 'actividad', label: 'Actividad', path: '/actividad', roles: WORKERS },
    { key: 'reportes', label: 'Reportes', path: '/reportes', roles: EVERYONE },
    { key: 'inspiracion', label: 'Inspiración', path: '/moodboard', roles: EVERYONE },
    { key: 'parrillas', label: 'Parrillas', path: '/parrillas', roles: EVERYONE },
    // Quien tenía Manager (dirección y project managers) entra sin tocar la base; a quien lleva la pauta se le marca en Equipo.
    { key: 'pautas', label: 'Pautas', path: '/pautas', roles: MANAGERS, inheritsFrom: 'manager' },
    { key: 'minutas', label: 'Minutas', path: '/minutas', roles: EVERYONE },
    { key: 'drive', label: 'Drive', path: '/drive', roles: EVERYONE, inheritsFrom: 'minutas' },
    { key: 'crm', label: 'CRM', path: '/crm', roles: MANAGERS },
    { key: 'cotizaciones', label: 'Cotizaciones', path: '/cotizaciones', roles: MANAGERS },
    { key: 'financiero', label: 'Financiero', path: '/financiero', roles: MANAGERS },
    { key: 'radar', label: 'Radar de Mérito', path: '/radar', roles: MANAGERS },
    { key: 'clientes', label: 'Clientes', path: '/clientes', roles: EVERYONE },
    { key: 'equipo', label: 'Equipo', path: '/equipo', roles: MANAGERS }
].map((module) => Object.freeze(module)));

export const MODULE_KEYS = Object.freeze(PLATFORM_MODULES.map((module) => module.key));

// Casillas sin módulo del menú, que viajan en el mismo objeto: Bria y la liga del mes
// (Rodny, 3 de noviembre de 2026: «activa más bien la posibilidad de activar la liga para
// cierta persona, como cuando activo Bria»). La liga se enciende persona por persona, también
// a un administrador: nadie la tiene por su cargo (`EXPLICIT_KEYS`).
// Pautas tiene dos niveles (Rodny, 12 de noviembre de 2026: «ver y editar, siendo editar el ajuste en Meta»): con la
// casilla de Pautas se ve el módulo; con «Editar pautas» se crean y corrigen pautas, se actualiza el gasto, se ligan
// campañas y se ajusta el presupuesto en Meta. Nadie la tiene por su cargo, tampoco un administrador.
// La operación de clientes (Rodny, 12 de noviembre de 2026: «necesito crear un permiso para que quien yo quiera vea
// los clientes completos»): el semáforo del mes, el avance de cada parrilla y la carga del equipo. Dirección y
// project managers la ven por su cargo, así que a ellos no se les ofrece la casilla; a los demás, marcándola.
//
// Las cuatro viven en `EXTRA_PERMISSIONS` y no escritas a mano en la ventana de Equipo: cada casilla nueva se
// añadía en cuatro sitios distintos —tres estados iniciales y su etiqueta— y así una se queda sin guardar.
// `onlyForRoles`, `hideForRoles` y `requiresModule` dicen a quién se le ofrece; `tone`, de qué color se dibuja.
const BRIA_KEY = 'bria';
const LEAGUE_KEY = 'liga';
export const AD_BUDGET_EDIT_KEY = 'pautas_editar';
export const CLIENT_OPERATIONS_KEY = 'clientes-operacion';

export const EXTRA_PERMISSIONS = Object.freeze([
    {
        key: BRIA_KEY, tone: 'cyan', label: 'Activar Bria para esta persona',
        onlyForRoles: ['ADMIN', 'PROJECT_MANAGER']
    },
    {
        key: LEAGUE_KEY, tone: 'yellow', label: 'Activar la liga del mes para esta persona',
        testId: 'data-team-league-toggle'
    },
    {
        key: AD_BUDGET_EDIT_KEY, tone: 'neutral', label: 'Editar pautas y ajustar presupuestos en Meta',
        requiresModule: 'pautas', testId: 'data-team-ad-edit-toggle'
    },
    {
        key: CLIENT_OPERATIONS_KEY, tone: 'green', label: 'Ver la operación completa de clientes',
        hint: 'El semáforo del mes, el avance de cada parrilla y la carga del equipo.',
        requiresModule: 'clientes', hideForRoles: ['ADMIN', 'PROJECT_MANAGER'],
        testId: 'data-team-client-operations-toggle'
    }
].map((extra) => Object.freeze(extra)));

export const EXTRA_KEYS = Object.freeze(EXTRA_PERMISSIONS.map((extra) => extra.key));
const EXPLICIT_KEYS = new Set([LEAGUE_KEY, AD_BUDGET_EDIT_KEY]);

/** Las casillas sueltas que se le ofrecen a esta persona, con el rol y los módulos que ya tiene marcados. */
export const extraPermissionsFor = (role, permissions = {}) => {
    const normalized = String(role || '').toUpperCase();
    return EXTRA_PERMISSIONS.filter((extra) => {
        if (extra.onlyForRoles && !extra.onlyForRoles.includes(normalized)) return false;
        if (extra.hideForRoles && extra.hideForRoles.includes(normalized)) return false;
        if (extra.requiresModule && normalized !== 'ADMIN' && permissions[extra.requiresModule] !== true) return false;
        return true;
    });
};


const KEY_BY_NAME = new Map(PLATFORM_MODULES.flatMap((module) => [
    [module.key, module.key],
    ...(module.aliases || []).map((alias) => [alias, module.key])
]));
for (const key of EXTRA_KEYS) KEY_BY_NAME.set(key, key);

const parse = (raw) => {
    if (!raw) return {};
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
            return {};
        }
    }
    return typeof raw === 'object' ? raw : {};
};

// Lee lo guardado, sea como sea que se guardó («Tareas», «Manager», texto JSON), y devuelve
// todas las casillas con un sí o un no. Solo un `true` de verdad abre un módulo.
export const readModulePermissions = (raw) => {
    const explicit = {};
    for (const [name, value] of Object.entries(parse(raw))) {
        const key = KEY_BY_NAME.get(String(name).toLowerCase());
        if (!key) continue;
        explicit[key] = explicit[key] === true || value === true;
    }
    const result = Object.fromEntries(EXTRA_KEYS.map((key) => [key, explicit[key] === true]));
    for (const module of PLATFORM_MODULES) result[module.key] = explicit[module.key] === true;
    for (const module of PLATFORM_MODULES) {
        if (module.inheritsFrom && !(module.key in explicit)) result[module.key] = result[module.inheritsFrom];
    }
    return result;
};

// Lo que se guarda: todas las casillas, nada desconocido y el dashboard siempre abierto.
export const sanitizeModulePermissions = (raw) => ({ ...readModulePermissions(raw), dashboard: true });

// Las casillas que trae marcadas cada rol al elegirlo en Equipo.
export const presetModulePermissions = (role) => {
    const normalized = String(role || '').toUpperCase();
    return Object.fromEntries(PLATFORM_MODULES.map((module) => [
        module.key,
        normalized === 'ADMIN' || module.roles.includes(normalized)
    ]));
};

/** Todas las casillas al elegir un rol: las del cargo encendidas y las sueltas apagadas. */
export const presetPermissions = (role) => ({
    ...presetModulePermissions(role),
    ...Object.fromEntries(EXTRA_KEYS.map((key) => [key, false]))
});

// La misma decisión en la pantalla (menú, rutas, consejos) y en el servidor (guardianes).
// Lo mismo que exige el servidor para usar Bria (`canUseBria`): rol de dirección o project manager y la casilla
// Bria marcada, también para un administrador. Las decisiones de Manager las prepara Bria (12 de noviembre de 2026).
export const hasBriaAccess = (user) => ['ADMIN', 'PROJECT_MANAGER'].includes(String(user?.role || '').toUpperCase())
    && readModulePermissions(user?.modulePermissions)[BRIA_KEY] === true;

export const hasModuleAccess = (user, key) => {
    if (!user) return false;
    const name = String(key || '').toLowerCase();
    const target = KEY_BY_NAME.get(name);
    // Lo explícito no viene con el cargo: un administrador también necesita su casilla marcada.
    if (target && EXPLICIT_KEYS.has(target)) return readModulePermissions(user.modulePermissions)[target] === true;
    if (String(user.role || '').toUpperCase() === 'ADMIN') return true;
    if (target) return readModulePermissions(user.modulePermissions)[target] === true;
    // Fuera del catálogo se lee tal cual estaba guardado, como antes de esta lista.
    return Object.entries(parse(user.modulePermissions))
        .some(([stored, enabled]) => String(stored).toLowerCase() === name && enabled === true);
};

/** Editar Pautas pide las dos casillas: la del módulo y la de editar. */
export const canEditAdBudgets = (user) => hasModuleAccess(user, 'pautas') && hasModuleAccess(user, AD_BUDGET_EDIT_KEY);
