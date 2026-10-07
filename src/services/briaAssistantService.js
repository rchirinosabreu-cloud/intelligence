// La asistente de Bria en producción: junta a la persona que pregunta (cuenta y ficha del equipo), el modelo
// y las herramientas con sus accesos reales a la plataforma. La regla está en `src/lib/briaAssistant.js`.

import prisma from '../lib/prisma.js';
import { getAIInstance } from './aiService.js';
import { getTasks } from './nativeTaskService.js';
import { searchBriaMemory } from './briaMemoryService.js';
import { clientOperationsService } from './clientOperationsService.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { normalizeHistory, normalizeQuestion, runAssistant } from '../lib/briaAssistant.js';
import { briaAssistantTools } from './briaAssistantTools.js';

const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });

export const createBriaAssistantService = ({
  db = prisma,
  ai = getAIInstance,
  tools = briaAssistantTools,
  now = () => new Date(),
  logger = console,
  context = {}
} = {}) => {
  const loadPerson = async (user) => {
    const row = await db.user.findUnique({
      where: { id: user?.userId || user?.id || '' },
      select: { id: true, name: true, role: true, teamMember: { select: { id: true, name: true, role: true } } }
    });
    if (!row) throw httpError(401, 'No encontramos tu cuenta.', 'USER_NOT_FOUND');
    return {
      userId: row.id,
      name: row.teamMember?.name || row.name || 'colega',
      jobTitle: row.teamMember?.role || null,
      accountRole: row.role,
      memberId: row.teamMember?.id || null
    };
  };

  return {
    async ask({ user, question, history } = {}) {
      const text = normalizeQuestion(question);
      if (!text) throw httpError(400, 'Escribe una pregunta.', 'BRIA_QUESTION_REQUIRED');
      const client = typeof ai === 'function' ? ai() : ai;
      if (!client) throw httpError(503, 'Bria no está disponible en este momento.', 'OPENAI_NOT_AVAILABLE');
      const person = await loadPerson(user);
      const result = await runAssistant({
        question: text,
        history: normalizeHistory(history),
        user,
        person,
        tools,
        ai: client,
        today: bogotaDate(now()),
        logger,
        context: { db, getTasks, searchMemory: searchBriaMemory, operations: clientOperationsService, now, ...context }
      });
      // El motivo técnico de un fallo se queda en el registro del servidor; al navegador solo va qué falló.
      return { ...result, failures: result.failures.map(({ tool }) => ({ tool })) };
    }
  };
};

export const briaAssistantService = createBriaAssistantService();
