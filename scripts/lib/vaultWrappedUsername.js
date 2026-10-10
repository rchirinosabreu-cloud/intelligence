// Un correo partido en dos líneas (10 de octubre de 2026). En el Drive, una celda estrecha corta el correo:
// «coordinador@gmail.co» en una línea y «m» en la siguiente. La importación tomó la primera como usuario y la
// «m» como nota, y después encontró el correo entero con la misma clave y lo anotó como «otro usuario».
// Aquí vive la regla, pura, para que el lector la aplique al importar y el guion de revisión la aplique a lo
// ya guardado. Recibe y devuelve secretos: nunca imprime ni lanza con valores.

const EMAIL_RE = /^[^\s@:]+@[^\s@]+\.[^\s@]+$/;
// Terminaciones que un correo del equipo o de un cliente puede tener; una cola que no complete una de estas no se une.
export const KNOWN_TLDS = new Set(['com', 'co', 'org', 'net', 'es', 'edu', 'gov', 'io', 'me', 'info', 'mx', 'ar', 'cl', 'pe', 'ec', 'us', 'uk', 'de', 'fr', 'it', 'biz', 'app', 'dev', 'tv', 've', 'pa', 'cr', 'do', 'gt', 'hn', 'sv', 'py', 'uy', 'bo', 'ca', 'br', 'pt', 'nl', 'ch', 'be', 'au', 'nz', 'ie', 'se', 'no', 'dk', 'fi', 'pl', 'cz', 'at', 'in', 'jp', 'kr', 'sg', 'hk', 'ai', 'ly', 'xyz', 'site', 'online', 'store', 'shop', 'agency', 'studio', 'design', 'media', 'digital', 'email', 'cloud', 'tech', 'co.uk', 'com.co', 'com.mx', 'com.ar', 'com.br', 'com.ve', 'com.pe', 'edu.co', 'gov.co', 'org.co', 'net.co']);

const fold = (value) => String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const lastLabel = (email) => String(email).split('@')[1]?.split('.').pop() || '';
const lastTwoLabels = (email) => String(email).split('@')[1]?.split('.').slice(-2).join('.') || '';
const knownEnding = (email) => KNOWN_TLDS.has(lastLabel(email)) || KNOWN_TLDS.has(lastTwoLabels(email));

/**
 * Si `tail` es la cola de un correo partido en `value`, devuelve el correo entero; si no, null.
 * Une solo cuando el valor lleva «@», la cola es corta y sin espacios, el resultado es un correo con una
 * terminación conocida, y esa terminación empieza por lo que ya tenía el valor («gmail.co» + «m»).
 */
export const joinWrappedEmail = (value, tail) => {
  const base = String(value ?? '').trim(), more = String(tail ?? '').trim();
  if (!base.includes('@') || /\s/.test(base) || !/^[a-z0-9.-]{1,8}$/i.test(more)) return null;
  const joined = base + more;
  if (!EMAIL_RE.test(joined) || !knownEnding(joined)) return null;
  const before = lastLabel(base), after = lastLabel(joined);
  if (more.startsWith('.')) return KNOWN_TLDS.has(after) || KNOWN_TLDS.has(lastTwoLabels(joined)) ? joined : null;
  return after.startsWith(before) && after !== before ? joined : null;
};

/** Dos usuarios son la misma cuenta si son iguales o uno es el principio del otro con el correo partido. */
export const sameAccountUser = (a, b) => {
  const left = fold(a), right = fold(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  return long.startsWith(short) && short.includes('@') && joinWrappedEmail(short, long.slice(short.length)) === long;
};

const OTHER_USER = /^Otro usuario anotado en «[^»]*»: (.+)$/;

/**
 * Mira un acceso guardado y dice si tiene el correo partido: devuelve el usuario entero y las notas sin la
 * cola ni la anotación redundante de «otro usuario», o null si no hay nada que corregir.
 */
export const repairWrappedUsername = ({ username, notes }) => {
  const lines = String(notes ?? '').split(/\r?\n/);
  let fixed = null;
  let rest = lines;
  // Una celda muy estrecha parte el correo en tres líneas («nombre@», «gmail.co», «m»): se pega mientras haya cola.
  for (let joined = joinWrappedEmail(username, rest[0]?.trim()); joined; joined = joinWrappedEmail(fixed, rest[0]?.trim())) {
    fixed = joined; rest = rest.slice(1);
  }
  // Sin cola en las notas, el correo entero puede estar en la anotación de «otro usuario».
  if (!fixed) {
    for (const line of lines) {
      const other = line.trim().match(OTHER_USER)?.[1]?.trim();
      if (other && other.length > String(username || '').length && sameAccountUser(username, other)) { fixed = other; break; }
    }
  }
  const current = fixed || String(username ?? '').trim();
  const kept = rest.filter((line) => {
    const other = line.trim().match(OTHER_USER)?.[1]?.trim();
    return !(other && sameAccountUser(current, other));
  });
  const cleaned = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim() || null;
  const originalNotes = String(notes ?? '').trim() || null;
  if (!fixed && cleaned === originalNotes) return null;
  return { username: current, notes: cleaned };
};
