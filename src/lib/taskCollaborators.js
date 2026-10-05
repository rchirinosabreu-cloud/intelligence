// Co-responsables de una tarea (Rodny, 28 de septiembre de 2026). **Prototipo local**:
// nada de esto está conectado al servidor todavía.
//
// Hoy la plataforma lleva dos relojes en paralelo sobre la misma tarea: el de la tarea
// (`Task.startedAt` + `Task.accumulatedWorkMs`, que se actualiza al cambiar de estado) y
// el de las sesiones (`TaskWorkSession`, que ya guarda `workerId`). Con una sola persona
// miden lo mismo; con dos dejan de hacerlo, porque el de la tarea no sabe de quién es el
// tiempo que cuenta.
//
// Aquí **manda el de las sesiones**. Todo se deriva de ellas: cuánto lleva cada quien,
// quién está trabajando ahora y en qué estado se ve la tarjeta. Así, que Melissa pulse
// empezar abre *su* sesión y no arrastra el reloj de nadie más.

const normalizeText = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Los co-responsables que se guardan (Rodny, 5 de octubre de 2026): sin repetidos, sin vacíos y
 * nunca el responsable, que ya está en la tarea por su propio campo. Si el responsable cambia a
 * alguien que estaba de co-responsable, sale de esta lista.
 */
export const normalizeCollaboratorIds = (ids, assigneeId) => [...new Set(
    (Array.isArray(ids) ? ids : []).map((id) => (id == null ? '' : String(id))).filter(Boolean)
)].filter((id) => id !== String(assigneeId || ''));

/** A quién se puede añadir: el equipo sin el responsable, filtrado por nombre o cargo. */
export const collaboratorCandidates = (members, assigneeId, query = '') => {
    const needle = normalizeText(query.trim());
    return (Array.isArray(members) ? members : [])
        .filter((member) => member?.id != null && String(member.id) !== String(assigneeId || ''))
        .filter((member) => !needle || normalizeText(`${member.name} ${member.role || ''}`).includes(needle));
};

export const TASK_WORKER_STATE = Object.freeze({
    WORKING: 'WORKING',
    PAUSED: 'PAUSED',
    NOT_STARTED: 'NOT_STARTED'
});

const list = (sessions) => (Array.isArray(sessions) ? sessions : []);
const ms = (value) => {
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
};

/** Lo que lleva corrido una sesión: su duración guardada, o lo que va desde que abrió. */
const sessionElapsedMs = (session, now) => {
    if (session?.endedAt) {
        const stored = Number(session.durationMs);
        if (Number.isFinite(stored) && stored >= 0) return stored;
        const started = ms(session.startedAt);
        const ended = ms(session.endedAt);
        return started !== null && ended !== null ? Math.max(0, ended - started) : 0;
    }
    const started = ms(session?.startedAt);
    const current = ms(now);
    return started !== null && current !== null ? Math.max(0, current - started) : 0;
};

const sessionsOf = (sessions, workerId) => list(sessions).filter((session) => session?.workerId === workerId);

/** El reloj de una persona sobre esta tarea: solo sus tramos, cerrados y abierto. */
export const collaboratorElapsedMs = (sessions, workerId, now = new Date()) =>
    sessionsOf(sessions, workerId).reduce((total, session) => total + sessionElapsedMs(session, now), 0);

/** Está trabajando ahora quien tiene una sesión abierta. No lo decide el estado de la tarea. */
export const isWorkingNow = (sessions, workerId) =>
    sessionsOf(sessions, workerId).some((session) => !session?.endedAt);

/** El total de la tarea es la suma de todos, nunca el reloj de una sola persona. */
export const taskTotalElapsedMs = (sessions, now = new Date()) =>
    list(sessions).reduce((total, session) => total + sessionElapsedMs(session, now), 0);

/**
 * En qué estado se ve la tarjeta. Si alguien está trabajando, «En proceso», aunque los
 * demás no hayan empezado. Una tarea ya realizada **no se reabre sola** porque quede un
 * reloj corriendo: reabrirla es una decisión de una persona, no un efecto secundario.
 */
export const taskStatusFromSessions = (sessions, currentStatus) => {
    const status = String(currentStatus || 'PENDIENTE').toUpperCase();
    if (status === 'REALIZADA' || status === 'DEVUELTA') return status;
    return list(sessions).some((session) => !session?.endedAt) ? 'EN_CURSO' : status;
};

/**
 * Abre la sesión de una persona. Si ya tenía una abierta la deja como está: pulsar dos
 * veces no puede partir su tiempo en dos ni arrancar un segundo reloj suyo.
 */
export const openSessionFor = (sessions, workerId, at = new Date()) => {
    const current = list(sessions);
    if (isWorkingNow(current, workerId)) return current;
    return [...current, { id: `s-${workerId}-${ms(at)}`, workerId, startedAt: at, endedAt: null, durationMs: null }];
};

/** Cierra la sesión abierta de una persona y le fija su duración. */
export const closeSessionFor = (sessions, workerId, at = new Date()) =>
    list(sessions).map((session) => (
        session?.workerId === workerId && !session?.endedAt
            ? { ...session, endedAt: at, durationMs: sessionElapsedMs(session, at) }
            : session
    ));

/**
 * Cuánto puso cada quien, de mayor a menor. `roster` son los co-responsables asignados:
 * quien está en la lista y todavía no ha tocado la tarea aparece con su reloj en cero,
 * porque si desapareciera no habría forma de ver que le falta empezar.
 */
export const workerBreakdown = (sessions, now = new Date(), roster = []) => {
    const ids = new Set([
        ...list(sessions).map((session) => session?.workerId).filter(Boolean),
        ...(Array.isArray(roster) ? roster.filter(Boolean) : [])
    ]);

    return [...ids]
        .map((workerId) => {
            const elapsedMs = collaboratorElapsedMs(sessions, workerId, now);
            const working = isWorkingNow(sessions, workerId);
            return {
                workerId,
                elapsedMs,
                state: working
                    ? TASK_WORKER_STATE.WORKING
                    : (elapsedMs > 0 ? TASK_WORKER_STATE.PAUSED : TASK_WORKER_STATE.NOT_STARTED)
            };
        })
        .sort((a, b) => b.elapsedMs - a.elapsedMs);
};
