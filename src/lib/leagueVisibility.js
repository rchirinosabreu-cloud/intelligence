// Quién ve la liga (Rodny, 3 de noviembre de 2026: «quiero que lo despleguemos pero que solo rodny lo vea en este
// momento»). `LEAGUE_VISIBLE_TO` es una lista de correos separados por comas; `*` abre la liga a todo el equipo y
// vacía no se la enseña a nadie. El cálculo del servidor corre para todo el equipo de todas formas: cuando se abra,
// noviembre ya estará contado desde el 1.

export const LEAGUE_VISIBLE_TO_ALL = '*';

const normalize = (value) => String(value || '').trim().toLowerCase();

/** `true` si esa cuenta puede ver la liga con el valor de `LEAGUE_VISIBLE_TO`. */
export function leagueVisibleTo(setting, email) {
  const raw = String(setting || '').trim();
  if (!raw) return false;
  if (raw === LEAGUE_VISIBLE_TO_ALL) return true;
  const mine = normalize(email);
  if (!mine) return false;
  return raw.split(',').map(normalize).filter(Boolean).includes(mine);
}
