// Liga mensual: 5 por hábito, 5 por primera actividad, 10 por tráfico registrado,
// 5 por reconocimiento nativo y regalos semanales de 5. Los regalos históricos conservan su valor.
// Los empates comparten puesto. Una lectura nunca concede premios.

/** Los cinco hábitos de cada día hábil. Son hábitos de uso, dichos como hábitos y nunca como juicio. */
export const DAILY_HABITS = [
  { key: 'RELOJ', label: 'Reloj', hint: 'Registraste tu tiempo correctamente, sin sesiones olvidadas.', step: 'Arranca el reloj al tomar la próxima tarea y páusalo antes de salir.' },
  { key: 'AL_DIA', label: 'Al día', hint: 'Amaneciste sin tareas vencidas.', step: 'Saca las vencidas de tu tablero: ciérralas o acuerda una fecha nueva.' },
  { key: 'A_TIEMPO', label: 'A tiempo', hint: 'Terminaste pendientes antes de la fecha de entrega.', step: 'Cierra hoy lo que vence hoy, o pide mover la fecha antes de que pase.' },
  { key: 'DOCUMENTADO', label: 'Documentado', hint: 'Las tareas que has creado tienen un comentario o un archivo que da mejor contexto.', step: 'Añade un comentario o un archivo que dé contexto a las tareas que creaste hoy.' },
  { key: 'SIN_DEVOLUCION', label: 'Sin devolución', hint: 'Nadie te devolvió un pendiente', step: 'Revisa el pendiente contra lo que pidió el cliente antes de marcarlo realizado.' }
];

/** Los extras del día: los gana una sola persona cada día. `source` dice de dónde los lee la plataforma. */
export const EXTRA_ACTIONS = [
  { key: 'PRIMERO_EN_ABRIR', label: 'Primero en abrir', hint: 'Fuiste el primero en ingresar a la plataforma desde las 8:00 am', points: 5, source: 'La primera huella en la plataforma desde las 8:00 de Bogotá.' },
  { key: 'PRIMERO_EN_REUNION', label: 'Primero en la reunión', hint: 'Fuiste el primero en ingresar a la reunión semanal', points: 10, source: 'Registro de un administrador para la reunión de tráfico.' }
];

/** Cuánto vale cada cosa. */
export const HABIT_POINTS = 5;
export const EXTRA_POINTS = 5;
export const KUDOS_WEEKLY = 5;
export const KUDOS_VALUE = 5;
export const MEETING_POINTS = 10;
export const RECOGNITION_POINTS = 5;
export const LEAGUE_RECOGNITION_KINDS = ['FIRST_TASK', 'EARLY_DELIVERY', 'DAILY_EIGHT', 'CAUGHT_UP', 'PLAN_APPROVED', 'WEEKLY_FIFTY'];

/** Una insignia se enciende desde el 90 % de los días en que ese hábito se jugó. */
export const BADGE_THRESHOLD = 0.9;

const isNumber = (value) => typeof value === 'number' && Number.isFinite(value);

/**
 * Suma los días: `days` es una lista de `{ day, habits: { RELOJ: true | false | null, … }, extras: { PRIMERO_EN_ABRIR: true | false | null, … } }`,
 * donde `null` significa que eso no se jugó ese día. Devuelve lo ganado y lo posible por hábito, los extras ganados y
 * los puntos.
 */
export function summarizeDays(days = []) {
  const perHabit = Object.fromEntries(DAILY_HABITS.map((habit) => [habit.key, { earned: 0, possible: 0 }]));
  const perExtra = Object.fromEntries(EXTRA_ACTIONS.map((extra) => [extra.key, 0]));
  let earned = 0, possible = 0, fullDays = 0, extras = 0;
  for (const entry of days) {
    let dayEarned = 0, dayPossible = 0;
    for (const habit of DAILY_HABITS) {
      const value = entry?.habits?.[habit.key];
      if (value === null || value === undefined) continue;
      perHabit[habit.key].possible += 1;
      dayPossible += 1;
      if (value === true) { perHabit[habit.key].earned += 1; dayEarned += 1; }
    }
    for (const extra of EXTRA_ACTIONS) if (entry?.extras?.[extra.key] === true) { perExtra[extra.key] += 1; extras += 1; }
    earned += dayEarned; possible += dayPossible;
    if (dayPossible > 0 && dayEarned === dayPossible) fullDays += 1;
  }
  return { earned, possible, fullDays, extras, perHabit, perExtra, points: earned * HABIT_POINTS + EXTRA_ACTIONS.reduce((sum, extra) => sum + perExtra[extra.key] * extra.points, 0) };
}

/** Lo que pone la plataforma: hábitos y extras, en puntos. `null` si todavía no se jugó nada. */
export function habitsScore(days = []) {
  const { possible, extras, points } = summarizeDays(days);
  if (!possible && !extras) return null;
  return points;
}

/** Lo que pone el equipo: cada regalo recibido conserva su valor, sin techo. */
export function kudosScore(received = []) {
  if (Array.isArray(received)) return received.reduce((sum, gift) => sum + (Number.isFinite(gift.points) ? gift.points : KUDOS_VALUE), 0);
  return (Number(received) || 0) * KUDOS_VALUE;
}

/** El puntaje del mes: hábitos, regalos, registros de tráfico y reconocimientos. */
export function leagueScore({ days = [], kudos = [], meetings = 0, recognitions = 0 } = {}) {
  const habits = habitsScore(days);
  const team = kudosScore(kudos);
  const awards = meetings * MEETING_POINTS + recognitions * RECOGNITION_POINTS;
  if (habits === null && !team && !awards) return null;
  return Math.round((habits || 0) + team + awards);
}

/** Shared competition rank: 1, 2, 2, 4. Alphabetical display never breaks a tie. */
export function leagueRank(score, lanes = []) {
  return score > 0 ? 1 + lanes.filter(lane => lane.score > score).length : null;
}

/** La tasa de cada hábito en el mes (días ganados sobre días jugados), con su insignia. */
export function habitRates(days = []) {
  const { perHabit } = summarizeDays(days);
  return DAILY_HABITS.map((habit) => {
    const { earned, possible } = perHabit[habit.key];
    const rate = possible ? earned / possible : null;
    return { key: habit.key, label: habit.label, hint: habit.hint, earned, possible, rate, badge: rate !== null && rate >= BADGE_THRESHOLD };
  });
}

/** El hábito que más puntos ha dejado en el mes, con una frase para hoy. Sin evidencia o completo, `null`. */
export function leagueNextStep(days = []) {
  const { possible: total } = summarizeDays(days);
  if (!total) return null;
  let best = null;
  for (const habit of habitRates(days)) {
    const lost = habit.possible - habit.earned;
    if (lost > 0 && (!best || lost > best.lost)) best = { ...habit, lost };
  }
  if (!best) return null;
  const spec = DAILY_HABITS.find((habit) => habit.key === best.key);
  return { key: best.key, label: best.label, text: spec.step, lost: best.lost * HABIT_POINTS, gain: HABIT_POINTS };
}

/** Los puntos de hoy: cuántos hábitos van ganados y cuántos se juegan, qué extras cayeron y cuántos puntos suman. */
export function todayPoints(entry) {
  let earned = 0, possible = 0;
  for (const habit of DAILY_HABITS) {
    const value = entry?.habits?.[habit.key];
    if (value === null || value === undefined) continue;
    possible += 1;
    if (value === true) earned += 1;
  }
  // `extrasEarned`, no `extras`: el día ya trae `extras` como objeto y esto se mezcla encima de él.
  const extrasEarned = EXTRA_ACTIONS.filter((extra) => entry?.extras?.[extra.key] === true).map((extra) => extra.key);
  return { earned, possible, extrasEarned, points: earned * HABIT_POINTS + EXTRA_ACTIONS.filter(extra => extrasEarned.includes(extra.key)).reduce((sum, extra) => sum + extra.points, 0) };
}

/** La escala de la pista: de 0 al techo redondo que cubre al puntero (nunca menos de 100), con cuatro marcas. */
export function trackScale(scores = []) {
  const top = Math.max(0, ...scores.filter(isNumber));
  const max = Math.max(100, Math.ceil(top / 50) * 50);
  return { max, marks: [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(max * fraction)) };
}

/** La posición de un puntaje sobre la pista, de 0 a 100 %. */
export function trackPosition(score, max) {
  if (!isNumber(score) || !isNumber(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (score / max) * 100));
}

/** «2026-10» → «octubre». */
export function leagueMonthLabel(month) {
  const [year, monthNumber] = String(month || '').split('-').map(Number);
  if (!year || !monthNumber) return '';
  return new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(year, monthNumber - 1, 15)));
}

/** Posición en español: «2.º», o «2.ª» para quien se nombra en femenino. */
export function ordinalLabel(position, gender = 'M') {
  return `${position}.${gender === 'F' ? 'ª' : 'º'}`;
}
