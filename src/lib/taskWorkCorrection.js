// Corregir el tiempo de una tarea (Rodny, 23 de octubre de 2026: «como admin debo tener el permiso final de corregir
// el tiempo de una tarea, porque sigue pasando que la gente se olvida … para que los tiempos sigan siendo adecuados»).
//
// Reglas, en lógica pura, compartidas por la pantalla y el servidor:
//   - solo un administrador corrige, y siempre dice por qué;
//   - la corrección **solo acorta**: es para el reloj que se quedó corriendo. Si faltó tiempo, se declara al cerrar
//     la tarea (tiempo declarado), que ya existe;
//   - nada se borra: la sesión guarda su tiempo original la primera vez que se corrige, y la tarea lo dice como una
//     novedad, igual que una devolución o una reapertura;
//   - casi toda la plataforma lee la duración guardada de cada sesión (Ritmo, carga, previsión, rentabilidad), así que
//     se corrige esa cifra, y el total de la tarea (`accumulatedWorkMs`, el reloj del responsable) baja lo mismo;
//   - un reloj que todavía corre se cierra con el tiempo real. En una tarea de una sola persona el reloj es la
//     columna, así que la tarea vuelve a Pendiente, como al reasignarla (`reassignmentEffect`); en una con equipo, el
//     reloj del responsable se pausa y la tarea sigue en proceso.

export const TIME_CORRECTION_EVENT_TYPE = 'system_time_correction';
export const TIME_CORRECTION_REASON_MAX = 300;
const M = 60_000;

const span = (ms) => {
  const minutes = Math.round(Math.max(0, ms) / M);
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

/** Lo que marca la sesión ahora: lo guardado, o lo que lleva corriendo. */
export const sessionCurrentMs = (session, now = new Date()) => (session?.endedAt
  ? Number(session.durationMs || 0)
  : Math.max(0, new Date(now).getTime() - new Date(session.startedAt).getTime()));

/** El motivo por el que no se puede corregir, en una frase, o `null`. */
export const correctionProblem = ({ user, session, durationMs, reason, now = new Date() }) => {
  if (String(user?.role || '').toUpperCase() !== 'ADMIN') return 'Corregir el tiempo de una tarea es de administradores.';
  if (!session) return 'Esa sesión ya no existe.';
  const why = String(reason ?? '').trim();
  if (why.length < 3) return 'Escribe por qué se corrige el tiempo: queda en la tarea.';
  if (why.length > TIME_CORRECTION_REASON_MAX) return `El motivo puede tener hasta ${TIME_CORRECTION_REASON_MAX} caracteres.`;
  if (!Number.isFinite(durationMs) || durationMs < M) return 'El tiempo corregido tiene que ser de al menos un minuto.';
  const current = sessionCurrentMs(session, now);
  if (durationMs >= current) return `La corrección solo acorta un tiempo que se pasó: esta sesión marca ${span(current)}. Si faltó tiempo, se declara al cerrar la tarea.`;
  return null;
};

/** Qué se escribe: la sesión, el total de la tarea (o `null` si no cambia) y si el reloj estaba corriendo. */
export const correctionPlan = ({ task, session, durationMs, reason, actorId, now = new Date() }) => {
  const at = new Date(now);
  const wasRunning = !session.endedAt;
  const current = sessionCurrentMs(session, at);
  const sessionData = {
    durationMs,
    endedAt: new Date(new Date(session.startedAt).getTime() + durationMs),
    closeReason: wasRunning ? 'CORRECTED' : session.closeReason,
    originalDurationMs: session.originalDurationMs ?? current,
    correctedAt: at, correctedById: actorId || null, correctionReason: String(reason).trim()
  };
  let taskData = null;
  if (!session.isCollaborator) {
    const accumulated = Number(task.accumulatedWorkMs || 0);
    if (wasRunning) {
      // El tiempo de la sesión abierta todavía no estaba en el total: entra el real, y el reloj de la tarea se detiene.
      taskData = { accumulatedWorkMs: accumulated + durationMs, startedAt: null };
      if (String(task.status) === 'EN_CURSO' && !(task._count?.collaborators > 0)) taskData.status = 'PENDIENTE';
    } else {
      taskData = { accumulatedWorkMs: Math.max(0, accumulated - (current - durationMs)) };
    }
  }
  return { wasRunning, fromMs: current, toMs: durationMs, session: sessionData, task: taskData };
};

/** La novedad de la tarea: los dos tiempos van en la etiqueta y la nota es solo el motivo. */
export const formatTimeCorrectionContent = ({ fromMs, toMs, reason, wasRunning }) => (
  `[TIME_CORRECTION:${Math.round(fromMs)}>${Math.round(toMs)}${wasRunning ? ':STOPPED' : ''}]\n${String(reason).trim()}`
);

export const timeCorrectionPresentation = (content = '') => {
  const text = String(content || '').trim();
  const match = text.match(/^\[TIME_CORRECTION:(\d+)>(\d+)(:STOPPED)?\]\s*\n?([\s\S]*)$/);
  if (!match) return { badgeLabel: 'Tiempo corregido', note: text };
  const note = match[4].trim();
  return {
    badgeLabel: `De ${span(Number(match[1]))} a ${span(Number(match[2]))}`,
    note: match[3] ? `${note}\n\nEl reloj quedó detenido: cuando se retome la tarea, vuelve a contar.` : note
  };
};

export const formatCorrectionSpan = span;
