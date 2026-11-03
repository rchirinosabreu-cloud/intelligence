// Solo presentación: las fichas activas siguen siendo la autoridad del equipo.
// Un nombre ambiguo conserva su foto; nunca se asigna un personaje por aproximación.
const aliases = Object.freeze({
  jesu: 'jesu', jesus: 'jesu', keila: 'keila', sara: 'sara', kamila: 'kamila',
  brayan: 'brayan', rodny: 'rodny', francisco: 'francisco', melissa: 'melissa',
  elisa: 'elisa', helen: 'helen', francis: 'francys', francys: 'francys', david: 'david', mariceth: 'mariceth',
});

export function resolveLeagueAvatarKeys(members) {
  const candidates = members.map(({ id, name }) => {
    const first = String(name || '').trim().split(/\s+/)[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return { id, key: Object.hasOwn(aliases, first) ? aliases[first] : null };
  });
  const counts = new Map();
  for (const { key } of candidates) if (key) counts.set(key, (counts.get(key) || 0) + 1);
  return Object.fromEntries(candidates.filter(({ key }) => key && counts.get(key) === 1).map(({ id, key }) => [id, key]));
}
