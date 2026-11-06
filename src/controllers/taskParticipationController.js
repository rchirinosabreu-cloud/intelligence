import { changeTaskParticipation, readTaskParticipationDetail } from '../services/taskParticipationService.js';
export async function getParticipationDetail(req, res) {
  try { res.json(await readTaskParticipationDetail({ taskId: req.params.taskId, user: req.user })); }
  catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[Participaciones] Lectura:', error);
    res.status(status).json({ error: status < 500 ? error.message : 'No se pudo actualizar el detalle de la tarea.' });
  }
}
export async function changeParticipation(req, res) {
  try {
    res.json(await changeTaskParticipation({ taskId: req.params.taskId, memberId: req.params.memberId, user: req.user, payload: req.body }));
  } catch (error) {
    const status = error.statusCode || error.gateStatus || 500;
    if (status >= 500) console.error('[Participaciones]', error);
    res.status(status).json({ error: status < 500 ? error.message : 'No se pudo guardar el movimiento. Actualiza y revisa la tarea.',
      ...(status === 423 ? { focusTask: error.focusTask, inProgressTask: error.inProgressTask } : {}) });
  }
}
