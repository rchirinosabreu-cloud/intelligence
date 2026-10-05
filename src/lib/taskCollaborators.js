// Colaboradores de una tarea (Rodny, 5 de octubre de 2026): opción A. La tarea tiene un solo
// responsable, que es quien la cierra; cada colaborador registra su tiempo por separado y sus
// horas cuentan en su propia carga. Aquí van las reglas puras que comparten la pantalla y el
// servidor; los relojes viven en `src/services/taskCollaboratorService.js`.

const normalizeText = (value) => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Los colaboradores que se guardan: sin repetidos, sin vacíos y nunca el responsable, que ya está
 * en la tarea por su propio campo. Si el responsable cambia a alguien que estaba de colaborador,
 * sale de esta lista.
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

/**
 * Qué puede hacer un colaborador con la tarea (Rodny, 5 de octubre de 2026: «cualquier colaborador
 * debería poder moverla»): llevarla entre «Pendiente» y «En proceso». Cerrarla, devolverla,
 * reabrirla o cambiar cualquier otro dato sigue siendo del responsable. Devuelve el motivo del
 * rechazo en español, o `null` si el cambio vale.
 */
export const COLLABORATOR_MOVABLE_STATUSES = Object.freeze(['PENDIENTE', 'EN_CURSO']);
export const collaboratorMoveProblem = ({ currentStatus, payload }) => {
    const keys = Object.keys(payload || {}).filter((key) => payload[key] !== undefined);
    const onlyStatus = keys.length > 0 && keys.every((key) => key === 'status');
    const next = String(payload?.status || '').toUpperCase();
    if (!onlyStatus || !COLLABORATOR_MOVABLE_STATUSES.includes(next) || !COLLABORATOR_MOVABLE_STATUSES.includes(String(currentStatus || '').toUpperCase())) {
        return 'Como colaborador puedes mover la tarea entre «Pendiente» y «En proceso». Cerrarla y cambiar sus datos le toca al responsable.';
    }
    return null;
};

/** El filtro por persona del tablero: la tarea es suya si es responsable o colaboradora. */
export const isTaskOfPerson = (task, personName) => {
    if (!personName || personName === 'Todos') return true;
    if ((task?.assigneeName || 'Desconocido') === personName) return true;
    return (task?.collaborators || []).some((collaborator) => collaborator?.name === personName);
};

/** Quién tiene su reloj corriendo ahora en la tarea, sin repetir. */
export const workingMemberIds = (task) => [...new Set(
    (task?.openSessions || []).filter((session) => session && !session.endedAt && session.workerId).map((session) => session.workerId)
)];
