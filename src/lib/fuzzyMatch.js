// Encontrar un nombre aunque esté mal escrito (Rodny, 9 de octubre de 2026: «que entiende si uno dice una palabra
// mal, que sabe a lo que uno se refiere»). El modelo entiende «aristia», pero las búsquedas de la plataforma pedían
// que el texto apareciera tal cual. Esto compara como lo haría una persona: sin tildes, sin espacios, tolerando una o
// dos letras cambiadas y aceptando parte del nombre. Lógica pura; se usa sobre listas cortas (clientes, equipo).

const fold = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const compact = (value) => fold(value).replace(/ /g, '');

const levenshtein = (a, b) => {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
};
const ratio = (a, b) => (a && b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 0);

/** Qué tan parecido es lo que escribió la persona a un nombre: 1 es exacto, menos de 0,6 no se parece. */
export const nameSimilarity = (query, name) => {
  const q = compact(query), n = compact(name);
  if (!q || !n) return 0;
  if (q === n) return 1;
  const contained = q.length >= 3 && n.includes(q) ? 0.9 : 0;
  const whole = ratio(q, n);
  const nameTokens = fold(name).split(' ').filter((token) => token.length >= 2);
  const queryTokens = fold(query).split(' ').filter((token) => token.length >= 3);
  const tokens = queryTokens.length && nameTokens.length
    ? queryTokens.reduce((sum, token) => sum + Math.max(...nameTokens.map((part) => (part.startsWith(token) ? 0.9 : ratio(token, part)))), 0) / queryTokens.length
    : 0;
  return Math.max(contained, whole, tokens * 0.95);
};

export const FUZZY_THRESHOLD = 0.6;

/** Los elementos cuyo nombre se parece a lo que se escribió, del más al menos parecido. */
export const rankByName = (items, query, nameOf = (item) => item.name, { threshold = FUZZY_THRESHOLD, limit = 8 } = {}) => {
  if (!compact(query)) return [];
  return items
    .map((item) => ({ ...item, score: Math.round(nameSimilarity(query, nameOf(item)) * 1000) / 1000 }))
    .filter((item) => item.score >= threshold)
    .sort((a, b) => b.score - a.score || String(nameOf(a)).length - String(nameOf(b)).length)
    .slice(0, limit);
};
