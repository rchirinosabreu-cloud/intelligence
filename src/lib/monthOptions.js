// Las opciones del selector de mes de toda la plataforma (Rodny, 12 de noviembre de 2026: «quiero un estilo global y
// prefiero el desplegable como en las parrillas»). Un mes viaja como 'AAAA-MM-01', igual que antes, y se lee
// «Noviembre 2026». La lista va del más reciente al más antiguo, como el período de una parrilla.

import { bogotaDate } from './colombiaBusinessDays.js';

const NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const KEY_RE = /^(\d{4})-(\d{2})/;
const index = (key) => { const m = KEY_RE.exec(String(key || '')); return m ? Number(m[1]) * 12 + Number(m[2]) - 1 : null; };
const keyOf = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`;

export const monthLabel = (key) => { const i = index(key); return i === null ? '' : `${NAMES[i % 12]} ${Math.floor(i / 12)}`; };

/**
 * Por defecto, dos años hacia atrás y dos meses hacia adelante desde hoy (casi siempre se consulta lo que ya pasó); `min` y `max` acotan. El valor que ya tenga el
 * campo siempre está en la lista, aunque quede fuera de esa ventana: un selector nunca borra lo que ya se eligió.
 */
export function monthOptions({ today, value, min, max, before = 24, after = 2 } = {}) {
  const now = index(today) ?? index(bogotaDate(Date.now()));
  let first = now - before;
  let last = now + after;
  if (index(min) !== null) first = Math.max(first, index(min));
  if (index(max) !== null) last = Math.min(last, index(max));
  const keys = [];
  for (let i = last; i >= first; i -= 1) keys.push(keyOf(i));
  const current = index(value);
  if (current !== null && !keys.includes(keyOf(current))) {
    keys.push(keyOf(current));
    keys.sort((a, b) => index(b) - index(a));
  }
  return keys.map((key) => ({ value: key, label: monthLabel(key) }));
}
