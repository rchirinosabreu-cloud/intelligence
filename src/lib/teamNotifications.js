import { canOpenTask } from './taskPrivacy.js';

// Avisar cuando el equipo termina un pendiente (Rodny y la project manager, 26 de octubre
// de 2026: «algo que me notifique que la persona terminó la tarea, pero no tenga que
// ponerle seguimiento a todas las tareas»).
//
// Esto no es un aviso nuevo: seguir un pendiente ya existe (`TaskFollower`) y al cerrarse
// avisa a quien lo sigue. Lo que faltaba es poder seguirlo **todo** sin pulsar la campana
// una por una. Por eso el interruptor no cambia qué se avisa, cambia a quién.
//
// **No es el ciclo de vida.** Un aviso por pendiente terminado, no cinco por pendiente
// (nació, arrancó, se devolvió, se reabrió, se cerró): eso es justo el seguimiento que
// ella dijo que no quiere.

/** Lo que cada quien decide sobre los avisos del equipo. Apagado salvo que lo encienda. */
export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({ teamCompletions: false });

/** Solo las claves conocidas y solo booleanos: lo demás se descarta sin romper. */
export const normalizeNotificationPreferences = (value) => {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const normalized = {};
    for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFERENCES)) {
        normalized[key] = source[key] === true;
    }
    return normalized;
};

export const wantsTeamCompletions = (preferences) =>
    normalizeNotificationPreferences(preferences).teamCompletions === true;

/**
 * A quién le toca el aviso de un pendiente que acaba de cerrarse.
 *
 * Se va del lado de no avisar: quien lo cerró no se avisa a sí mismo, quien ya lo seguía
 * recibe el suyo de siempre y no dos, y **un pendiente privado que la persona no puede
 * abrir no genera aviso** —ningún rol entra por su cargo, tampoco un project manager, y
 * mandarla a una puerta que el servidor le va a cerrar con 403 no ayuda a nadie.
 */
export const teamCompletionRecipients = ({
    candidates = [],
    task = null,
    followerIds = [],
    completedById = null
} = {}) => {
    const alreadyNotified = new Set([...followerIds, completedById].filter(Boolean));
    const seen = new Set();
    const recipients = [];

    for (const candidate of candidates) {
        const userId = candidate?.id;
        if (!userId || seen.has(userId) || alreadyNotified.has(userId)) continue;
        if (!wantsTeamCompletions(candidate.notificationPreferences)) continue;
        if (!canOpenTask(task, userId)) continue;
        seen.add(userId);
        recipients.push(userId);
    }

    return recipients;
};

/**
 * Lo que lee la persona. Lleva el cliente cuando lo hay porque una PM lee treinta de
 * estos al día y la cuenta es su eje; sin cliente, el título solo.
 */
export const teamCompletionMessage = ({ actorName, taskTitle, clientName } = {}) => {
    const quien = String(actorName || '').trim() || 'Alguien del equipo';
    const titulo = String(taskTitle || '').trim() || 'un pendiente';
    const cliente = String(clientName || '').trim();
    return cliente
        ? `${quien} terminó «${titulo}» · ${cliente}`
        : `${quien} terminó «${titulo}»`;
};

/**
 * Tipo propio, y a propósito no empieza por `TASK_`: así no entra en la categoría `tasks`
 * del push, que viene encendida. Quien enciende el interruptor pidió la campana, no que
 * le vibre el celular con cada pendiente que cierra el equipo.
 */
export const TEAM_COMPLETION_NOTIFICATION_TYPE = 'TEAM_TASK_COMPLETED';
