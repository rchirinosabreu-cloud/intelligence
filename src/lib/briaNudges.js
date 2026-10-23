// «Bria se adelanta» (Rodny, 10 de octubre de 2026): avisos discretos para administradores y project managers que
// aparecen encima del botón de Bria, sin abrir el chat. La idea es que guíe a los projects: «Melissa no tiene nada
// en proceso desde hace 30 minutos, pregúntale en qué está». Lenguaje sobrio, corporativo y amigable: cada aviso es
// un hecho de la plataforma y una sugerencia, nunca un juicio sobre la persona.
//
// Lógica pura. El servicio arma `people` leyendo tareas y sesiones de trabajo; aquí solo se decide qué se dice.
// Los textos dicen la hora, no los minutos («desde las 10:05»): la tarjeta se lee más tarde y «lleva 35 minutos»
// envejece (Rodny, el mismo día). Y cada tipo de aviso lleva sus propias acciones (`nudgeActions`): a dónde ir y
// qué pedirle a Bria; nunca un «Ver en Gestión» genérico que aterriza en el tablero sin más.

import { isBusinessDay } from './colombiaBusinessDays.js';

const H = 3_600_000, MIN = 60_000;
export const WORK_HOURS = Object.freeze({ start: 8, end: 18 }); // Reloj de Bogotá, días hábiles de Colombia.
export const IDLE_MINUTES = 30; // Rodny: «desde hace 30 minutos».
export const GRACE_MINUTES = 30; // Al empezar la jornada nadie recibe un aviso en el primer minuto.
export const DUE_TODAY_FROM_HOUR = 14; // Lo que vence hoy y no empezó se avisa en la tarde.
export const MAX_NUDGES = 5;
export const NUDGE_KINDS = Object.freeze(['SIN_PROCESO', 'VENCE_HOY', 'FOCO_SEMANAL', 'CIERRE_DIA', 'LECTURA_DIA']);

/** Día, minutos desde medianoche y día de la semana en Bogotá (UTC−5, sin horario de verano). */
export const bogotaClock = (now) => {
  const shifted = new Date(new Date(now).getTime() - 5 * H);
  return { day: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes(), weekday: shifted.getUTCDay() };
};
/** «10:05», hora de Bogotá. */
export const bogotaTime = (value) => { const { minutes } = bogotaClock(value); return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`; };
/** El instante en que termina el día de Bogotá que contiene `now` (medianoche siguiente, 05:00Z). */
export const bogotaDayEnd = (now) => new Date(`${bogotaClock(now).day}T05:00:00.000Z`.replace(/^(\d{4}-\d{2}-\d{2})/, (d) => { const next = new Date(`${d}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1); return next.toISOString().slice(0, 10); }));
/** El instante en que empezó la jornada de hoy (WORK_HOURS.start en Bogotá). */
export const workdayStart = (now) => new Date(new Date(`${bogotaClock(now).day}T00:00:00Z`).getTime() + (WORK_HOURS.start + 5) * H);

export const isWorkingTime = (now) => {
  const { day, minutes } = bogotaClock(now);
  return isBusinessDay(day) && minutes >= WORK_HOURS.start * 60 && minutes < WORK_HOURS.end * 60;
};

export const nudgeKey = (kind, subject) => `${kind}:${subject}`;
export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'Esta persona';
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
export const formatIdle = (ms) => {
  const minutes = Math.max(1, Math.round(ms / MIN));
  if (minutes < 60) return `${minutes} minutos`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${plural(hours, 'hora', 'horas')}`;
};
const list = (titles) => titles.slice(0, 3).map((title) => `«${title}»`).join(', ') + (titles.length > 3 ? ` y ${titles.length - 3} más` : '');

/**
 * El tablero de Gestión filtrado por una persona (el filtro de responsable va por nombre). Sin tildes y con «+» en vez
 * de espacios (Rodny, 23 de octubre de 2026: por WhatsApp salía «Helen%20Hern%C3%A1ndez»); Gestión lo reconoce igual.
 */
export const personBoardUrl = (personName) => {
  const plain = String(personName || '').trim().normalize('NFD').replace(/\p{M}/gu, '');
  return `/gestion?responsable=${encodeURIComponent(plain).replace(/%20/g, '+')}`;
};

// Los textos de las acciones caben enteros en una opción de WhatsApp (24 caracteres; Rodny, 23 de octubre de 2026: la
// opción salía cortada y repetida debajo). La tarjeta de la plataforma usa los mismos.
const clientChoice = (verb, clientName) => (clientName && `${verb} ${clientName}`.length <= 24 ? `${verb} ${clientName}` : `${verb} al cliente`);

/**
 * Las acciones de un aviso según su tipo (Rodny, 10 de octubre de 2026: «¿cuál sería la lógica de ir al kanban en un
 * anuncio así? ¿a ver qué?»). Cada una es un enlace (`to`), algo que pedirle a Bria en el chat (`ask`: queda escrito,
 * la persona lo envía) o abrir una conversación (`conversationId`).
 */
export const nudgeActions = ({ kind, personName = null, clientName = null, title = null, day = null, url = null, taskIds = [], conversationId = null, messageId = null } = {}) => {
  const name = firstName(personName);
  const summary = { label: 'Resumir sus pendientes', ask: `Resúmeme qué tiene pendiente ${name} hoy y qué le vence pronto.` };
  switch (kind) {
    // Correo importante (11 de octubre de 2026). Sin enlace al correo (Rodny: «no siempre la plataforma está abierta
    // desde el navegador de social o de contacto, entonces el link no llevaría a ese correo»): lo que importa es el
    // aviso, que ya lo pone en el radar. Bria sí puede resumirlo, porque lo lee por IMAP y no por el navegador; propone
    // la respuesta y la persona la envía desde su correo. Bria nunca manda correos.
    case 'CORREO_IMPORTANTE': return [{ label: 'Resumir y responder', ask: `Resume el correo «${title || 'sin asunto'}»${personName ? ` de ${personName}` : ''}${clientName ? ` (${clientName})` : ''} (id ${messageId || 'desconocido'}) y propón una respuesta breve y amable que yo pueda enviar.` }];
    case 'SIN_PROCESO': return [{ label: 'Ver sus pendientes', to: personBoardUrl(personName) }, summary];
    case 'VENCE_HOY': return [taskIds.length === 1 && url ? { label: 'Abrir la tarea', to: url } : { label: 'Ver sus pendientes', to: personBoardUrl(personName) }, summary];
    case 'CARGA_MANANA': return [{ label: 'Abrir el mapa de carga', to: '/manager?tab=ritmo' }, { label: 'Qué se puede mover', ask: `Revisa la carga de ${personName || name} para ${day ? `el ${day}` : 'mañana'} y propón qué tarea se mueve o se reparte.` }];
    case 'ENTREGA_EN_RIESGO': return [{ label: 'Abrir la tarea', to: url }, { label: 'Ver alternativas', ask: `Revisa el margen de entrega de «${title || 'esta tarea'}» de ${personName || name}, considerando cliente, complejidad y compromisos anteriores. Propón qué mover o repartir, con la evidencia disponible.` }];
    case 'OPERACION_ROJA': return [{ label: 'Abrir operación', to: url }, { label: 'Qué le falta', ask: `¿Qué le falta a ${clientName || 'este cliente'} para salir del rojo en Operación este mes?` }];
    case 'PIEZA_SIN_APROBAR': return [{ label: 'Abrir la pieza', to: url }, { label: 'Recordarle al cliente', ask: `Redáctame un recordatorio por WhatsApp para ${clientName || 'el cliente'}: «${title || 'la pieza'}» sale ${day ? `el ${day}` : 'pronto'} y todavía falta su aprobación. Incluye el enlace del portal.` }];
    // Varias piezas del mismo cliente esperando su aprobación esta semana (19 de octubre de 2026): una oferta de escribirle.
    case 'APROBACIONES_PENDIENTES': return [{ label: 'Abrir la parrilla', to: url }, { label: clientChoice('Escribirle a', clientName), ask: `Redáctame un mensaje por WhatsApp para ${clientName || 'el cliente'} para que apruebe lo que tiene pendiente, con el enlace del portal.` }];
    case 'DEVUELTO_SIN_TOCAR': return [{ label: 'Abrir la tarea', to: url }, { label: 'Qué pidió el cliente', ask: `Cuéntame qué pidió corregir el cliente en «${title || 'esa tarea'}» y qué falta para cerrarla.` }];
    case 'FOCO_SEMANAL': case 'CIERRE_DIA': case 'LECTURA_DIA': return conversationId ? [{ label: 'Leer en Bria', conversationId }] : [];
    default: return url ? [{ label: 'Abrir', to: url }] : [];
  }
};

/**
 * Arma los avisos de hoy para quien mira.
 * `people`: [{ personId, personName, inProgress: [{ id, title }], pendingCount, lastActivityAt, dueToday: [{ id, title, status }] }]
 *   - `lastActivityAt`: la última vez hoy que la persona cerró un reloj o una tarea; `null` si hoy no hubo nada.
 * `dismissedKeys`: claves ocultas por quien mira; `weeklyFocus`: { conversationId, weekKey } si Bria dejó el foco de la semana;
 * `dailyClose`: { conversationId, dayKey } si Bria ya dejó el cierre del día (14 de octubre de 2026), que va primero.
 */
export const buildNudges = ({ people = [], now = new Date(), dismissedKeys = new Set(), weeklyFocus = null, dailyClose = null, morningBrief = null, viewerPersonId = null } = {}) => {
  const hidden = dismissedKeys instanceof Set ? dismissedKeys : new Set(dismissedKeys);
  const out = [];
  const at = new Date(now).getTime();
  if (dailyClose?.conversationId && !hidden.has(nudgeKey('CIERRE_DIA', dailyClose.dayKey))) {
    out.push({ key: nudgeKey('CIERRE_DIA', dailyClose.dayKey), kind: 'CIERRE_DIA', personId: null, personName: null, weight: 0,
      title: 'Bria dejó tu cierre del día.', body: 'Lo que cerraste, lo que queda en proceso, lo que vence mañana y cómo terminaron los avisos de hoy.',
      url: null, conversationId: dailyClose.conversationId, taskIds: [], actions: nudgeActions({ kind: 'CIERRE_DIA', conversationId: dailyClose.conversationId }) });
  }
  // La lectura de la mañana (19 de octubre de 2026): lo que Bria vio al amanecer y lo que haría hoy.
  if (morningBrief?.conversationId && !hidden.has(nudgeKey('LECTURA_DIA', morningBrief.dayKey))) {
    out.push({ key: nudgeKey('LECTURA_DIA', morningBrief.dayKey), kind: 'LECTURA_DIA', personId: null, personName: null, weight: 0,
      title: 'Bria dejó tu lectura de la mañana.', body: 'Cómo amanecieron las cuentas y el equipo, lo que haría hoy y lo que no haría.',
      url: null, conversationId: morningBrief.conversationId, taskIds: [], actions: nudgeActions({ kind: 'LECTURA_DIA', conversationId: morningBrief.conversationId }) });
  }
  if (weeklyFocus?.conversationId && !hidden.has(nudgeKey('FOCO_SEMANAL', weeklyFocus.weekKey))) {
    out.push({ key: nudgeKey('FOCO_SEMANAL', weeklyFocus.weekKey), kind: 'FOCO_SEMANAL', personId: null, personName: null, weight: 0,
      title: 'Bria dejó tu foco de la semana.', body: 'Lo que vence, lo que está en proceso y cómo viene el equipo, en un solo lugar.',
      url: null, conversationId: weeklyFocus.conversationId, taskIds: [], actions: nudgeActions({ kind: 'FOCO_SEMANAL', conversationId: weeklyFocus.conversationId }) });
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
            title: person.lastActivityAt ? `${name} no tiene una tarea en proceso desde las ${bogotaTime(person.lastActivityAt)}.` : `${name} no ha puesto ninguna tarea en proceso hoy.`,
            body: `Tiene ${plural(person.pendingCount, 'pendiente', 'pendientes')} por empezar. Puede ser un buen momento para preguntarle en qué está.`,
            url: personBoardUrl(person.personName), taskIds: [], actions: nudgeActions({ kind: 'SIN_PROCESO', personName: person.personName }) });
        }
      }
      const dueToday = (person.dueToday || []).filter((task) => task.status !== 'EN_CURSO');
      const dueKey = nudgeKey('VENCE_HOY', person.personId);
      if (minutes >= DUE_TODAY_FROM_HOUR * 60 && dueToday.length && !hidden.has(dueKey)) {
        const url = dueToday.length === 1 ? `/gestion?taskId=${encodeURIComponent(dueToday[0].id)}` : personBoardUrl(person.personName);
        const taskIds = dueToday.map((task) => task.id);
        out.push({ key: dueKey, kind: 'VENCE_HOY', personId: person.personId, personName: person.personName, weight: dueToday.length * H,
          title: `A ${name} le ${dueToday.length === 1 ? 'vence hoy una tarea que todavía no está' : `vencen hoy ${dueToday.length} tareas que todavía no están`} en proceso.`,
          body: `${list(dueToday.map((task) => task.title))}. Vale la pena confirmar si salen hoy o si hay que mover la fecha.`,
          url, taskIds, actions: nudgeActions({ kind: 'VENCE_HOY', personName: person.personName, url, taskIds }) });
      }
    }
  }
  // El cierre de hoy primero, la lectura de la mañana, el foco de la semana y luego lo que más tiempo lleva.
  const rank = (nudge) => ({ CIERRE_DIA: 3, LECTURA_DIA: 2, FOCO_SEMANAL: 1 }[nudge.kind] || 0);
  return out.sort((a, b) => rank(b) - rank(a) || b.weight - a.weight).slice(0, MAX_NUDGES).map(({ weight: _weight, ...nudge }) => nudge);
};

/** Hasta cuándo se oculta un aviso: el día de Bogotá; el foco de la semana, siete días. */
export const dismissUntil = (key, now = new Date()) => String(key).startsWith('FOCO_SEMANAL:') ? new Date(new Date(now).getTime() + 7 * 24 * H) : bogotaDayEnd(now);
// `PULSO:<id>` es un aviso que decidió Bria en su pulso (`pulse_messages`); se oculta marcando la fila.
// `ACCESO:<id>` es un pedido de acceso de la bóveda (15 de octubre de 2026): quien lo decide lo oculta por hoy;
// quien lo pidió, al ocultar la respuesta, la da por vista. `PERMISO:<id>` es lo mismo para un módulo de la plataforma.
export const isValidNudgeKey = (key) => /^(SIN_PROCESO|VENCE_HOY|FOCO_SEMANAL|CIERRE_DIA|LECTURA_DIA|PULSO|ACCESO|PERMISO):[\w-]{1,80}$/.test(String(key || ''));
