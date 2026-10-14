// El seguimiento de los avisos de Bria (Rodny, 14 de octubre de 2026: «hoy Bria dice “Melissa no tiene nada en
// proceso” y se olvida; que a la hora mire si cambió algo y lo diga»). Un aviso no termina al decirse: cada tramo
// del pulso vuelve a mirar los avisos vivos. Si el hecho se resolvió, se escribe el desenlace con la hora («Melissa
// arrancó “Reel” a las 10:40»); si a la hora sigue igual, se dice una sola vez. Nada de esto es un aviso nuevo: no
// gasta los topes ni abre otra tarjeta, y el cierre del día lo cuenta. Lógica pura: el servicio trae los datos.

import { bogotaTime, firstName } from './briaNudges.js';
import { needsClientReview } from './contentApproval.js';

export const FOLLOW_UP_AFTER_MS = 60 * 60 * 1000;
// Solo lo que la plataforma puede volver a comprobar sola. Operación en rojo, carga y correos no tienen seguimiento.
export const FOLLOWABLE_KINDS = Object.freeze(['SIN_PROCESO', 'VENCE_HOY', 'DEVUELTO_SIN_TOCAR', 'PIEZA_SIN_APROBAR']);
const STATUS_WORDS = { PENDIENTE: 'pendiente', EN_CURSO: 'en proceso', REALIZADA: 'realizada', DEVUELTA: 'devuelta' };

const splitId = (id) => { const at = String(id).indexOf(':'); return at < 0 ? [String(id), ''] : [String(id).slice(0, at), String(id).slice(at + 1)]; };
const quote = (titles) => titles.slice(0, 3).map((title) => `«${title}»`).join(', ') + (titles.length > 3 ? ` y ${titles.length - 3} más` : '');

export const isFollowable = (message) => (message?.factIds || []).some((id) => FOLLOWABLE_KINDS.includes(splitId(id)[0]));

/**
 * Qué pasó con un aviso. `message`: { factIds, taskIds, createdAt }. `people` como los lee el pulso (con `since` en lo
 * que está en proceso); `tasksById` y `itemsById` con la lectura actual de las tareas devueltas y las piezas.
 * Devuelve { status: 'RESOLVED' | 'PENDING' | 'NONE', text }: resuelto solo cuando todos sus hechos lo están; sin
 * datos para comprobar, no se afirma nada.
 */
export const evaluateFollowUp = (message, { people = [], tasksById = new Map(), itemsById = new Map(), now = new Date() } = {}) => {
  const time = bogotaTime(now);
  const outcomes = [];
  for (const id of message?.factIds || []) {
    const [kind, subject] = splitId(id);
    if (kind === 'SIN_PROCESO' || kind === 'VENCE_HOY') {
      const person = people.find((row) => row.personId === subject);
      if (!person) continue;
      const name = firstName(person.personName);
      if (kind === 'SIN_PROCESO') {
        const started = (person.inProgress || []).filter((task) => task.id !== 'reloj');
        if (started.length) outcomes.push({ resolved: true, text: `${name} arrancó «${started[0].title}»${started[0].since ? ` a las ${bogotaTime(started[0].since)}` : ''}.` });
        else if ((person.inProgress || []).length) outcomes.push({ resolved: true, text: `${name} puso su reloj en marcha.` });
        else outcomes.push({ resolved: false, text: `${name} sigue sin una tarea en proceso a las ${time}.` });
      } else {
        const ids = message.taskIds || [], due = person.dueToday || [];
        const pending = due.filter((task) => ids.includes(task.id) && task.status !== 'EN_CURSO');
        if (pending.length) outcomes.push({ resolved: false, text: `Lo que le vence hoy a ${name} sigue sin empezar a las ${time}: ${quote(pending.map((task) => task.title))}.` });
        else {
          const started = due.filter((task) => ids.includes(task.id)).length, closed = ids.length - started;
          const detail = [started ? `${started} en proceso` : null, closed ? `${closed} ${closed === 1 ? 'cerrada' : 'cerradas'}` : null].filter(Boolean).join(', ');
          outcomes.push({ resolved: true, text: `${name} ya atendió lo que le vencía hoy${detail ? ` (${detail})` : ''}.` });
        }
      }
    } else if (kind === 'DEVUELTO_SIN_TOCAR') {
      const task = tasksById.get(subject);
      if (!task) continue;
      if (task.status !== 'DEVUELTA') outcomes.push({ resolved: true, text: `«${task.title}» ya salió de devuelta: está ${STATUS_WORDS[task.status] || String(task.status).toLowerCase()}.` });
      else if (task.updatedAt && message?.createdAt && new Date(task.updatedAt) > new Date(message.createdAt)) outcomes.push({ resolved: true, text: `«${task.title}» ya tuvo cambios.` });
      else outcomes.push({ resolved: false, text: `«${task.title}» sigue devuelta sin cambios a las ${time}.` });
    } else if (kind === 'PIEZA_SIN_APROBAR') {
      const item = itemsById.get(subject);
      if (!item) continue;
      if (!needsClientReview(item)) outcomes.push({ resolved: true, text: `«${item.objective}» ya no está pendiente del cliente.` });
      else outcomes.push({ resolved: false, text: `«${item.objective}» sigue sin aprobación del cliente a las ${time}.` });
    }
  }
  if (!outcomes.length) return { status: 'NONE' };
  const pending = outcomes.filter((outcome) => !outcome.resolved);
  if (!pending.length) return { status: 'RESOLVED', text: outcomes.map((outcome) => outcome.text).join(' ') };
  return { status: 'PENDING', text: pending.map((outcome) => outcome.text).join(' ') };
};

/** Los ids de tareas y piezas que hay que releer para seguir estos avisos. */
export const followUpTargets = (messages = []) => {
  const tasks = new Set(), items = new Set();
  for (const message of messages) for (const id of message?.factIds || []) {
    const [kind, subject] = splitId(id);
    if (kind === 'DEVUELTO_SIN_TOCAR' && subject) tasks.add(subject);
    if (kind === 'PIEZA_SIN_APROBAR' && subject) items.add(subject);
  }
  return { taskIds: [...tasks], itemIds: [...items] };
};
