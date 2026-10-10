// «Bria se adelanta» (Rodny, 10 de octubre de 2026): avisos discretos para administradores y project managers que
// aparecen encima del botón de Bria, sin abrir el chat. La idea es que guíe a los projects: «Melissa no tiene nada
// en proceso desde hace 30 minutos, pregúntale en qué está». Lenguaje sobrio, corporativo y amigable: cada aviso es
// un hecho de la plataforma y una sugerencia, nunca un juicio sobre la persona.
//
// Lógica pura. El servicio arma `people` leyendo tareas y sesiones de trabajo; aquí solo se decide qué se dice.

import { isBusinessDay } from './colombiaBusinessDays.js';

const H = 3_600_000, MIN = 60_000;
export const WORK_HOURS = Object.freeze({ start: 8, end: 18 }); // Reloj de Bogotá, días hábiles de Colombia.
export const IDLE_MINUTES = 30; // Rodny: «desde hace 30 minutos».
export const GRACE_MINUTES = 30; // Al empezar la jornada nadie recibe un aviso en el primer minuto.
export const DUE_TODAY_FROM_HOUR = 14; // Lo que vence hoy y no empezó se avisa en la tarde.
export const MAX_NUDGES = 5;
export const NUDGE_KINDS = Object.freeze(['SIN_PROCESO', 'VENCE_HOY', 'FOCO_SEMANAL']);

/** Día, minutos desde medianoche y día de la semana en Bogotá (UTC−5, sin horario de verano). */
export const bogotaClock = (now) => {
  const shifted = new Date(new Date(now).getTime() - 5 * H);
  return { day: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(), weekday: shifted.getUTCDay() };
};
/** El instante en que termina el día de Bogotá que contiene `now` (medianoche siguiente, 05:00Z). */
export const bogotaDayEnd = (now) => new Date(`${bogotaClock(now).day}T05:00:00.000Z`.replace(/^(\d{4}-\d{2}-\d{2})/, (d) => { const next = new Date(`${d}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); return next.toISOString().slice(0, 10); }));
/** El instante en que empezó la jornada de hoy (WORK_HOURS.start en Bogotá). */
export const workdayStart = (now) => new Date(new Date(`${bogotaClock(now).day}T00:00:00Z`).getTime() + (WORK_HOURS.start + 5) * H);

export const isWorkingTime = (now) => {
  const { day, minutes } = bogotaClock(now);
  return isBusinessDay(day) && minutes >= WORK_HOURS.start * 60 && minutes < WORK_HOURS.end * 60;
};

export const nudgeKey = (kind, subject) => `${kind}:${subject}`;
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Esta persona';
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
export const formatIdle = (ms) => {
  const minutes = Math.max(1, Math.round(ms / MIN));
  if (minutes < 60) return `${minutes} minutos`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${plural(hours, 'hora', 'horas')}`;
};
const list = (titles) => titles.slice(0, 3).map((title) => `«${title}»`).join(', ') + (titles.length > 3 ? ` y ${titles.length - 3} más` : '');

/**
 * Arma los avisos de hoy para quien mira.
 * `people`: [{ personId, personName, inProgress: [{ id, title }], pendingCount, lastActivityAt, dueToday: [{ id, title, status }] }]
 *   - `lastActivityAt`: la última vez hoy que la persona cerró un reloj o una tarea; `null` si hoy no hubo nada.
 * `dismissedKeys`: claves ocultas por quien mira; `weeklyFocus`: { conversationId, weekKey } si Bria dejó el foco de la semana.
 */
export const buildNudges = ({ people = [], now = new Date(), dismissedKeys = new Set(), weeklyFocus = null, viewerPersonId = null } = {}) => {
  const hidden = dismissedKeys instanceof Set ? dismissedKeys : new Set(dismissedKeys);
  const out = [];
  const at = new Date(now).getTime();
  if (weeklyFocus?.conversationId && !hidden.has(nudgeKey('FOCO_SEMANAL', weeklyFocus.weekKey))) {
    out.push({ key: nudgeKey('FOCO_SEMANAL', weeklyFocus.weekKey), kind: 'FOCO_SEMANAL', personId: null, personName: null, weight: 0,
      title: 'Bria dejó tu foco de la semana.', body: 'Lo que vence, lo que está en proceso y cómo viene el equipo, en un solo lugar.',
      ask: null, url: null, conversationId: weeklyFocus.conversationId, taskIds: [] });
  }
  if (isWorkingTime(now)) {
    const { minutes } = bogotaClock(now);
    for (const person of people) {
      if (!person || person.personId === viewerPersonId) continue;
      const name = firstName(person.personName);
      const inProgress = person.inProgress || [];
      if (!inProgress.length && (person.pendingCount || 0) > 0) {
        const since = person.lastActivityAt ? new Date(person.lastActivityAt).getTime() : workdayStart(now).getTime();
        const idleMs = at - since;
        const threshold = (person.lastActivityAt ? IDLE_MINUTES : GRACE_MINUTES) * MIN;
        const key = nudgeKey('SIN_PROCESO', person.personId);
        if (idleMs >= threshold && !hidden.has(key)) {
          out.push({ key, kind: 'SIN_PROCESO', personId: person.personId, personName: person.personName, weight: idleMs,
            title: person.lastActivityAt ? `${name} lleva ${formatIdle(idleMs)} sin una tarea en proceso.` : `${name} no ha puesto ninguna tarea en proceso hoy.`,
            body: `Tiene ${plural(person.pendingCount, 'pendiente', 'pendientes')} por empezar. Puede ser un buen momento para preguntarle en qué está.`,
            ask: `Ayúdame a escribirle a ${name} para preguntarle, con amabilidad, en qué está trabajando ahora y si necesita algo para avanzar.`,
            url: '/gestion', taskIds: [] });
        }
      }
      const dueToday = (person.dueToday || []).filter((task) => task.status !== 'EN_CURSO');
      const dueKey = nudgeKey('VENCE_HOY', person.personId);
      if (minutes >= DUE_TODAY_FROM_HOUR * 60 && dueToday.length && !hidden.has(dueKey)) {
        out.push({ key: dueKey, kind: 'VENCE_HOY', personId: person.personId, personName: person.personName, weight: dueToday.length * H,
          title: `A ${name} le ${dueToday.length === 1 ? 'vence hoy una tarea que todavía no está' : `vencen hoy ${dueToday.length} tareas que todavía no están`} en proceso.`,
          body: `${list(dueToday.map((task) => task.title))}. Vale la pena confirmar si salen hoy o si hay que mover la fecha.`,
          ask: `Ayúdame a revisar con ${name} lo que le vence hoy y todavía no está en proceso: ${list(dueToday.map((task) => task.title))}.`,
          url: dueToday.length === 1 ? `/gestion?taskId=${encodeURIComponent(dueToday[0].id)}` : '/gestion', taskIds: dueToday.map((task) => task.id) });
      }
    }
  }
  return out.sort((a, b) => (b.kind === 'FOCO_SEMANAL') - (a.kind === 'FOCO_SEMANAL') || b.weight - a.weight).slice(0, MAX_NUDGES).map(({ weight: _weight, ...nudge }) => nudge);
};

/** Hasta cuándo se oculta un aviso: el día de Bogotá; el foco de la semana, siete días. */
export const dismissUntil = (key, now = new Date()) => String(key).startsWith('FOCO_SEMANAL:') ? new Date(new Date(now).getTime() + 7 * 24 * H) : bogotaDayEnd(now);
export const isValidNudgeKey = (key) => /^(SIN_PROCESO|VENCE_HOY|FOCO_SEMANAL):[\w-]{1,80}$/.test(String(key || ''));
