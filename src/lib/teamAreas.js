// Áreas del equipo (Rodny, 28 de octubre de 2026: «estos roles que tengo escritos podrían ser mejor
// un desplegable … para que también funcione así y sea más seguro»). El cargo sigue siendo texto
// libre —es lo que se muestra—; el área es una lista cerrada y es lo único que leen las reglas
// (quién recibe las alertas comerciales, las de cartera, …). Una persona puede tener varias.
// Mientras nadie la elija en Equipo, se deduce del cargo escrito, así que desplegar esto no exige
// tocar datos de producción.
export const TEAM_AREAS = [
    { key: 'DIRECCION', label: 'Dirección' },
    { key: 'ADMINISTRATIVA', label: 'Administrativa y contable' },
    { key: 'COMERCIAL', label: 'Comercial y relaciones públicas' },
    { key: 'PROJECT_MANAGEMENT', label: 'Project management' },
    { key: 'ESTRATEGIA', label: 'Estrategia y planeación' },
    { key: 'COMMUNITY', label: 'Community management' },
    { key: 'DISENO', label: 'Diseño gráfico' },
    { key: 'AUDIOVISUAL', label: 'Producción audiovisual' },
    { key: 'DESARROLLO', label: 'Desarrollo web' },
];

const AREA_KEYS = TEAM_AREAS.map((area) => area.key);

const plainText = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Qué palabras de un cargo apuntan a cada área. Solo sirve de respaldo: lo elegido en Equipo manda.
const CARGO_HINTS = {
    DIRECCION: /\bdirect(or|ora)\b/,
    ADMINISTRATIVA: /administrativ|contab/,
    COMERCIAL: /\bcomercial\b|relaciones publicas/,
    PROJECT_MANAGEMENT: /project manager/,
    ESTRATEGIA: /estrateg|planeacion/,
    COMMUNITY: /community|gestor(a)? de contenido/,
    DISENO: /disen/,
    AUDIOVISUAL: /audiovisual/,
    DESARROLLO: /desarroll/,
};

export const inferAreasFromCargo = (cargo) => {
    const text = plainText(cargo);
    if (!text.trim()) return [];
    return AREA_KEYS.filter((key) => CARGO_HINTS[key].test(text));
};

export const normalizeTeamAreas = (value) => {
    if (!Array.isArray(value)) return [];
    const chosen = new Set(value.filter((key) => typeof key === 'string'));
    return AREA_KEYS.filter((key) => chosen.has(key));
};

export const memberAreas = (member) => {
    if (!member) return [];
    const chosen = normalizeTeamAreas(member.areas);
    return chosen.length ? chosen : inferAreasFromCargo(member.role);
};

export const memberHasArea = (member, area) => memberAreas(member).includes(area);

export const teamAreaLabel = (key) => TEAM_AREAS.find((area) => area.key === key)?.label || key;
