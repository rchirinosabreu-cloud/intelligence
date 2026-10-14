// Los compromisos de una reunión, listos para volverse pendientes (Rodny, 14 de octubre de 2026, segundo punto del
// plan «llevar a Bria a más niveles»: «cuando analiza una reunión, que prepare los pendientes que salieron de ahí,
// con responsable y fecha propuestos, y tú confirmas»). La minuta ya trae `actionItems` (tarea, responsable, fecha,
// prioridad) escritos por el modelo al analizar la reunión: aquí solo se leen y se numeran. Lógica pura.

import { resolveTaskDate } from './briaTaskDraft.js';
import { bogotaDate } from './colombiaBusinessDays.js';
import { dayLabel } from './teamLoad.js';

const tidy = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const fold = (value) => tidy(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

export const MINUTE_TASKS_MAX = 25;
const PRIORITY_WORDS = { alta: 'ALTA', high: 'ALTA', urgente: 'URGENTE', urgent: 'URGENTE', critica: 'URGENTE', critical: 'URGENTE' };
export const priorityOf = (value) => PRIORITY_WORDS[fold(value)] || 'NORMAL';

/** La fecha que trae un compromiso: «2026-10-17», «2026-10-17T…», «viernes» o «17 de octubre»; sin fecha, null. */
export const parseItemDate = (value, today) => {
  const text = tidy(value);
  if (!text) return null;
  const iso = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return resolveTaskDate(iso ? iso[1] : text, today);
};

/** Los compromisos de la minuta numerados desde 1, con título, quién lo dijo la reunión, fecha, prioridad y si ya es pendiente. */
export const minuteItems = (minute, today) => (Array.isArray(minute?.actionItems) ? minute.actionItems : []).slice(0, MINUTE_TASKS_MAX)
  .map((item, index) => ({
    n: index + 1,
    title: tidy(item?.task).slice(0, 180),
    owner: tidy(item?.owner) || null,
    dueDay: parseItemDate(item?.dueDate, today),
    priority: priorityOf(item?.priority),
    taskId: item?.taskId || null
  }))
  .filter((item) => item.title);

/** El cliente que nombra el título de la reunión, si nombra exactamente uno. */
export const guessClient = (minute, clients = []) => {
  const text = fold(minute?.title);
  if (!text) return null;
  const hits = clients.filter((client) => fold(client.name).length >= 3 && text.includes(fold(client.name)));
  return hits.length === 1 ? hits[0] : null;
};

/** «Reunión Endova octubre» del 13 de octubre. */
export const minuteLabel = (minute) => `«${tidy(minute?.title) || 'Reunión sin título'}»${minute?.meetingAt ? ` del ${dayLabel(bogotaDate(minute.meetingAt))}` : ''}`;

/**
 * La persona del equipo que corresponde al responsable que anotó la reunión («Kamila», «Jarlan Peres»): nombre
 * completo, nombre de pila único o parecido claro (`rankByName`). Sin coincidencia clara, nadie: no se adivina.
 */
export const matchOwner = (owner, members = [], rank = null) => {
  const term = fold(owner);
  if (!term) return null;
  const exact = members.filter((member) => fold(member.name) === term);
  if (exact.length === 1) return exact[0];
  const byWord = members.filter((member) => fold(member.name).split(' ').includes(term) || fold(member.name).startsWith(`${term} `));
  if (byWord.length === 1) return byWord[0];
  if (byWord.length > 1 || !rank) return null;
  const ranked = rank(members, owner);
  if (!ranked.length) return null;
  if (ranked.length === 1 || ranked[0].score - (ranked[1]?.score || 0) >= 0.15) return ranked[0];
  return null;
};

/** El comentario que guarda de dónde salió el pendiente. */
export const minuteTaskContext = (minute, item) => `De la reunión ${minuteLabel(minute)}.${item.owner ? ` Responsable según la reunión: ${item.owner}.` : ''} Compromiso: ${item.title}`;
