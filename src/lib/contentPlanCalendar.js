/**
 * El mes de una parrilla repartido en semanas (Rodny, 24 de septiembre de 2026).
 *
 * El carril de piezas dice qué hay; el calendario dice **cuándo**, que es lo único que no se ve en una
 * lista: los días vacíos y los días con tres piezas encima.
 *
 * Las fechas se tratan siempre en UTC. La plataforma guarda la publicación al mediodía UTC justamente
 * para que el día no se corra al pintarlo desde otro huso: leerlo con métodos locales devolvería el día
 * anterior en Bogotá, que es el error que la regla del calendario compartido lleva años evitando.
 */

export const WEEKDAY_LABELS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

const pad = (value) => String(value).padStart(2, '0');

/** `YYYY-MM-DD` del día de publicación, o `null` si la pieza todavía no tiene fecha. */
export const publishDayKey = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
};

/**
 * Las semanas del mes, de lunes a domingo, incluyendo los días de relleno del mes anterior y el
 * siguiente para que la rejilla quede cuadrada. `month` es 1-12, como en el resto de la plataforma.
 */
export const buildMonthGrid = (year, month) => {
  const first = new Date(Date.UTC(year, month - 1, 1));
  // `getUTCDay()` cuenta desde el domingo; aquí la semana empieza en lunes.
  const leading = (first.getUTCDay() + 6) % 7;
  const start = new Date(Date.UTC(year, month - 1, 1 - leading));

  const weeks = [];
  const cursor = new Date(start);

  while (weeks.length < 6) {
    const week = [];
    for (let index = 0; index < 7; index += 1) {
      week.push({
        key: `${cursor.getUTCFullYear()}-${pad(cursor.getUTCMonth() + 1)}-${pad(cursor.getUTCDate())}`,
        day: cursor.getUTCDate(),
        inMonth: cursor.getUTCMonth() === month - 1
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    weeks.push(week);
    // Una sexta semana solo si el mes llega hasta ahí; lo normal son cinco.
    if (cursor.getUTCMonth() !== month - 1 && weeks.length >= 5) break;
  }

  return weeks;
};

/** Las piezas de cada día, por `YYYY-MM-DD`, y aparte las que todavía no tienen fecha. */
export const groupItemsByDay = (items = []) => {
  const byDay = new Map();
  const undated = [];

  for (const item of items) {
    const key = publishDayKey(item?.publishDate);
    if (!key) {
      undated.push(item);
      continue;
    }
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(item);
  }

  return { byDay, undated };
};
