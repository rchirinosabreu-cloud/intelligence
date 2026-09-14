import prisma from '../lib/prisma.js';
import { getOperationalTrace, recordOperationalTrace } from '../services/operationalTraceService.js';
import { recordTaskAlertInteraction } from '../services/taskAlertInteractionService.js';

export const createTaskAlertInteractionHandler = ({ db = prisma } = {}) => async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Debes iniciar sesión.' });
    const body = req.body || {};
    if (Array.isArray(body) || Object.keys(body).some(key => !['noticeId', 'kind', 'action'].includes(key))) {
      return res.status(400).json({ error: 'El aviso no es válido.' });
    }
    const result = await recordTaskAlertInteraction({ db, userId, taskId: req.params.taskId,
      noticeId: body.noticeId, kind: body.kind, action: body.action });
    return res.json(result);
  } catch (error) {
    console.error('[TaskAlertInteraction]', error.response?.data || error.message);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'No pudimos guardar la acción del aviso.' });
  }
};
export const taskAlertInteractionHandler = createTaskAlertInteractionHandler();

export const getOperationalTraceHandler = async (req, res) => {
  try {
    const result = await getOperationalTrace({
      requester: req.user,
      filters: {
        userId: req.query.userId,
        taskQuery: req.query.taskQuery,
        days: req.query.days,
        limit: req.query.limit
      }
    });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json(result);
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error('[OperationalTraceController] Query failed:', error);
    return res.status(status).json({ error: error.message || 'No fue posible consultar la trazabilidad.' });
  }
};

export const traceTaskOpenHandler = async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.taskId },
      select: { id: true }
    });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    await recordOperationalTrace({
      eventType: 'TASK_OPENED',
      actorId: req.user.userId,
      subjectUserId: req.user.userId,
      taskId: task.id
    });
    return res.status(201).json({ success: true });
  } catch (error) {
    console.error('[OperationalTraceController] Task open trace failed:', error?.message || error);
    return res.status(500).json({ error: 'No fue posible registrar la apertura de la tarea.' });
  }
};
