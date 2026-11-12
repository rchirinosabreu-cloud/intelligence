// Liga mensual: 5 por hábito, 5 por primera actividad, 10 por tráfico registrado,
// 5 por reconocimiento nativo y regalos semanales de 5. Los regalos históricos conservan su valor.
// Los empates comparten puesto. Una lectura nunca concede premios.

/** Los seis hábitos de cada día hábil. Son hábitos de uso, dichos como hábitos y nunca como juicio. */
export const DAILY_HABITS = [
  { key: 'RELOJ', label: 'Reloj', hint: 'Registraste tu tiempo correctamente, sin sesiones olvidadas.', step: 'Arranca el reloj al tomar la próxima tarea y páusalo antes de salir.' },
  // Al día, A tiempo y Documentado también se leen de la fuente de cada área (Rodny, 12 de noviembre de 2026: «Sí,
  // hábitos por área»): Parrillas, el CRM, Pautas y Financiero, además de las tareas. Ver `leagueAreaChecks.js`.
  { key: 'AL_DIA', label: 'Al día', hint: 'Nada tuyo quedó vencido: tareas, piezas sin publicar, seguimientos del CRM ni el gasto final de tus pautas.', step: 'Saca lo vencido: cierra o reprograma tus tareas, publica lo atrasado y pon al día tus seguimientos.' },
  { key: 'A_TIEMPO', label: 'A tiempo', hint: 'Entregaste a tiempo: tus pendientes antes de su fecha y las piezas de hoy publicadas o programadas.', step: 'Cierra hoy lo que vence hoy y deja publicadas o programadas las piezas del día.' },
  // Contexto real (Rodny, 12 de noviembre de 2026): veinte letras, un archivo o un enlace, y solo en lo que se delega.
  { key: 'DOCUMENTADO', label: 'Documentado', hint: 'Lo que delegas lleva contexto real: un comentario de al menos 20 letras, un archivo o un enlace. También cuentan tus gestiones del CRM con nota y tus movimientos con soporte.', step: 'Dale contexto a lo que delegaste hoy: un comentario de al menos 20 letras, un archivo o un enlace.' },
  { key: 'SIN_DEVOLUCION', label: 'Sin devolución', hint: 'Nadie te devolvió un pendiente', step: 'Revisa el pendiente contra lo que pidió el cliente antes de marcarlo realizado.' },
  // Rodny, 9 de noviembre de 2026: Elisa registra ingresos y egresos y Brayan sale a jornadas de producción, y la liga no
  // se lo reconocía. El trabajo de cualquier módulo cuenta: lo que se registra en la plataforma, venga de donde venga.
  { key: 'TRABAJO_REGISTRADO', label: 'Trabajo registrado', hint: 'Dejaste registro de tu trabajo en la plataforma: un movimiento, una gestión, una pieza, una lectura de pauta, una jornada o una tarea con reloj.', step: 'Registra en la plataforma lo que hiciste hoy: el movimiento, la gestión, la pieza o la jornada.' }
];

/** «del 9 al 15 de noviembre», para la semana de la liga. */
export function leagueWeekLabel(from, to) {
  if (!from || !to) return '';
  const day = (key) => Number(String(key).slice(8, 10));
  const month = new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: 'UTC' }).format(new Date(`${to}T12:00:00Z`));
  const fromMonth = new Intl.DateTimeFormat('es-CO', { month: 'long', timeZone: 'UTC' }).format(new Date(`${from}T12:00:00Z`));
  return fromMonth === month ? `del ${day(from)} al ${day(to)} de ${month}` : `del ${day(from)} de ${fromMonth} al ${day(to)} de ${month}`;
}

/** Los extras del día: los gana una sola persona cada día. `source` dice de dónde los lee la plataforma. */
export const EXTRA_ACTIONS = [
  { key: 'PRIMERO_EN_ABRIR', label: 'Primero en abrir', hint: 'Fuiste el primero en ingresar a la plataforma desde las 8:00 am', points: 5, source: 'La primera huella en la plataforma desde las 8:00 de Bogotá.' },
  { key: 'PRIMERO_EN_REUNION', label: 'Primero en la reunión', hint: 'Fuiste de los dos primeros en ingresar a la reunión semanal', points: 10, source: 'Registro de un administrador para la reunión de tráfico.' }
];

/** Cuánto vale cada cosa. */
export const HABIT_POINTS = 5;
export const EXTRA_POINTS = 5;
export const KUDOS_WEEKLY = 5;
export const KUDOS_VALUE = 5;
export const MEETING_POINTS = 10;
/** Los dos primeros en la reunión de tráfico reciben los diez puntos (Rodny, 9 de noviembre de 2026: dos personas entraron a la vez). */
export const MEETING_WINNERS_PER_WEEK = 2;
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

/**
 * El puesto va por puntaje: los empates lo comparten y el siguiente puntaje distinto es el puesto siguiente (1, 1, 2),
 * así tras un empate en primero sigue habiendo segundo y tercero (Rodny, 9 de noviembre de 2026, al ver cuatro primeros
 * y ningún segundo: «¿Por qué no aparecen segundos lugares, o terceros?»). Sustituye al puesto de competición (1, 1, 3).
 * El orden alfabético nunca rompe un empate.
 */
export function leagueRank(score, lanes = []) {
  if (!(score > 0)) return null;
  return 1 + new Set(lanes.filter(lane => lane.score > score).map(lane => lane.score)).size;
}

/** Los tres primeros puestos por puntaje con todas sus personas, sin recortar empates; cero nunca crea un podio. */
export function leaguePodiumGroups(lanes = []) {
  const ranked = lanes.filter(lane => isNumber(lane.score) && lane.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'es'));
  const groups = [];
  for (const person of ranked) {
    const rank = leagueRank(person.score, ranked);
    if (rank > 3) break;
    const previous = groups.at(-1);
    if (previous?.rank === rank) previous.people.push(person);
    else groups.push({ rank, score: person.score, people: [person] });
  }
  return groups;
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
