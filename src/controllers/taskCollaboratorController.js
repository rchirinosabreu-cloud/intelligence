import {
  getTaskTeamTime,
  pauseCollaboratorWork,
  startCollaboratorWork
} from '../services/taskCollaboratorService.js';

// Colaboradores de una tarea (5 de octubre de 2026): cada colaborador empieza y pausa su propio
// reloj. La identidad sale siempre de la sesión, nunca del cuerpo de la petición. Después de cada
// cambio se devuelve el tiempo del equipo, que es lo que la pantalla vuelve a pintar.

const userIdOf = (req) => req.user?.userId || req.user?.id || null;

const fail = (res, error, label) => {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) {
    console.error(`[TaskCollaborators] ${label}:`, error?.message || error);
    return res.status(500).json({ error: 'No fue posible registrar el tiempo en este momento.' });
  }
  return res.status(status).json({ error: error.message, code: error.code });
};

export const createTaskCollaboratorController = ({
  start = startCollaboratorWork,
  pause = pauseCollaboratorWork,
  teamTime = getTaskTeamTime
} = {}) => ({
  getTeamTime: async (req, res) => {
    try {
      return res.json(await teamTime({ taskId: req.params.taskId }));
    } catch (error) {
      return fail(res, error, 'Team time failed');
    }
  },
  startWork: async (req, res) => {
    try {
      await start({ taskId: req.params.taskId, userId: userIdOf(req) });
      return res.json(await teamTime({ taskId: req.params.taskId }));
    } catch (error) {
      return fail(res, error, 'Start failed');
    }
  },
  pauseWork: async (req, res) => {
    try {
      await pause({ taskId: req.params.taskId, userId: userIdOf(req) });
      return res.json(await teamTime({ taskId: req.params.taskId }));
    } catch (error) {
      return fail(res, error, 'Pause failed');
    }
  }
});

export const taskCollaboratorController = createTaskCollaboratorController();
