// Pendientes privados (Rodny, 23 de septiembre de 2026).
//
// Privado significa **que no se puede abrir**, no que no se pueda ver. El título, el
// responsable, el cliente y el estado los ve todo el equipo: así nadie parece
// desocupado y la carga de trabajo del tablero sigue diciendo la verdad. Lo que queda
// dentro —la descripción, los adjuntos y la conversación— solo lo abren quien la creó,
// quien la ejecuta y las personas que se añadan a su lista. Ningún rol entra por su
// cargo: ni administrador ni project manager.
//
// Estas funciones son puras y las comparten el servidor y la pantalla. **El cuerpo se
// quita en el servidor**: esconder el panel en el navegador dejaría la descripción y
// los adjuntos viajando en la respuesta, a la vista de cualquiera que mire la red.

// El texto que ve quien no puede abrirlo, escrito por Rodny (23 de septiembre de 2026).
// Menciona a los otros miembros del equipo además del creador y el responsable, porque
// la lista de personas existe: una frase que se quedara en dos nombres sería falsa en
// cuanto se use. Y termina diciendo a quién acudir, que es lo único accionable.
export const PRIVATE_TASK_HINT = 'Este es un pendiente privado. Los detalles están disponibles únicamente para el creador, el responsable y otros miembros del equipo. Si necesitas más información, escríbele al creador de la tarea.';

/**
 * Cómo reacciona el tablero a cada intento de abrir un pendiente privado: al primero la
 * tarjeta vibra, al segundo sale el aviso. **Siempre al segundo toque** (Rodny, 23 de
 * septiembre de 2026), sin ventana de tiempo: el compromiso con hora sí la tiene
 * —`nextLockReaction`— porque ahí insistir significa otra cosa, y aquí una espera solo
 * haría que la misma acción diera resultados distintos sin que nadie sepa por qué.
 */
export const nextPrivateAttempt = (attempts = 0) => (
    attempts >= 1
        ? { reaction: 'explain', attempts: 0 }
        : { reaction: 'shake', attempts: attempts + 1 }
);

/** La identidad que manda es la del `User`, nunca la del `TeamMember`. */
export const canOpenTask = (task, viewerUserId) => {
    if (!task?.isPrivate) return true;
    if (!viewerUserId) return false;
    return task.creatorId === viewerUserId
        || task.assignee?.userId === viewerUserId
        || (task.viewers || []).some((viewer) => viewer?.userId === viewerUserId);
};

// Lo que hay dentro de la tarea y no sale para quien no puede abrirla. Se enumera aquí,
// en un solo sitio, para que el día que `Task` gane un campo de contenido se añada
// también aquí y no se escape solo.
const TASK_BODY_FIELDS = Object.freeze([
    'comments', 'taskComments', 'taskAttachments', 'referenceUrl',
    'contentItem', 'contentItemId', 'specialType', 'aiCategory', 'aiComplexity'
]);

/**
 * La tarea sin su cuerpo: se conserva todo lo que el tablero necesita para situarla y
 * para contar la carga de la persona, y se quita lo que dice de qué va.
 */
export const redactTaskBody = (task) => {
    const visible = { ...task, isLocked: true, privateHint: PRIVATE_TASK_HINT };
    for (const field of TASK_BODY_FIELDS) delete visible[field];
    // La lista de quién puede abrirla tampoco es asunto de quien no puede.
    delete visible.viewers;
    return visible;
};

/** Para `list.map(taskPrivacyFilter(userId))`. */
export const taskPrivacyFilter = (viewerUserId) => (task) => (
    canOpenTask(task, viewerUserId) ? task : redactTaskBody(task)
);

const MANAGER_ROLES = new Set(['ADMIN', 'PROJECT_MANAGER']);
const userIdOf = (user) => user?.userId || user?.id || null;

/**
 * Quién puede **crear** un pendiente privado: solo administradores y project managers
 * (Rodny, 24 de septiembre de 2026). Reservar trabajo del resto del equipo es una
 * decisión de quien dirige, no de cualquiera.
 */
export const canCreatePrivateTask = (user) => MANAGER_ROLES.has(String(user?.role || '').toUpperCase());

/**
 * Quién puede **cambiar** la privacidad de un pendiente que ya existe: solo quien lo
 * creó, y solo si sigue siendo admin o project manager. Ni otro admin, ni el
 * responsable: abrir al equipo algo que otro reservó no le toca a nadie más.
 */
export const canChangeTaskPrivacy = (task, user) => {
    const userId = userIdOf(user);
    return Boolean(userId) && canCreatePrivateTask(user) && task?.creatorId === userId;
};

/** Los campos que hay que traer de la base para poder decidir. */
export const TASK_PRIVACY_SELECT = Object.freeze({
    isPrivate: true,
    creatorId: true,
    assignee: { select: { userId: true } },
    viewers: { select: { userId: true } }
});
