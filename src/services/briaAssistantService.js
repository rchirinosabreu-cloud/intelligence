// La asistente de Bria en producción: junta a la persona que pregunta (cuenta y ficha del equipo), el modelo
// y las herramientas con sus accesos reales a la plataforma. La regla está en `src/lib/briaAssistant.js`.

import prisma from '../lib/prisma.js';
import { getAIInstance } from './aiService.js';
import { getTasks } from './nativeTaskService.js';
import { searchBriaMemory } from './briaMemoryService.js';
import { clientOperationsService } from './clientOperationsService.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { normalizeHistory, normalizeQuestion, runAssistant } from '../lib/briaAssistant.js';
import { wrapLegacyAction } from '../lib/briaActions.js';
import { briaAssistantTools } from './briaAssistantTools.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { getApplicationKnowledgeService } from './briaKnowledgeApplication.js';
import { createKnowledgeTools } from './briaKnowledgeTools.js';
import { searchAgencyMemory, readAgencyMemory } from './briaLivingService.js';
import { createBriaModelRuntime } from './briaModelRuntime.js';
import { conversationChoiceTool } from './briaConversationTools.js';
import { createBriaTaskTools } from './briaTaskTools.js';
import { briaTaskDrafts, briaDispatchDrafts, briaDeleteDrafts, briaActions } from './briaTaskApplication.js';
import { createBriaDispatchTools } from './briaDispatchTools.js';
import { createBriaDeleteTools } from './briaDeleteTools.js';
import { createBriaActionTools } from './briaActionTools.js';
import { createBriaUsageTools } from './briaUsageTools.js';
import { createServiceHealthTools } from './briaServiceHealthTools.js';
import { serviceHealthService } from './serviceHealthService.js';
import { createBriaPlatformTools } from './briaPlatformTools.js';
import { getBriaPlatformClient } from '../lib/briaPlatformClient.js';
import { getBriaUsageService } from './briaUsageService.js';
import { createAgencyFactTools } from './briaAgencyFactTools.js';
import { getAgencyFactService } from './briaAgencyFactService.js';
import { createVaultTools } from './vaultTools.js';
import { getVaultService } from './vaultService.js';
import { createBriaMailTools } from './briaMailTools.js';
import { getMailboxService } from './mailboxService.js';
import { createPermissionRequestTools } from './permissionRequestTools.js';
import { getPermissionRequestService } from './permissionRequestService.js';
import { briaClientUpdateTools } from './briaClientUpdateTools.js';
import { teamRhythmService } from './teamRhythmService.js';
import { teamLoadService } from './teamLoadService.js';
import { createDailyReadingTools } from './dailyReadingTools.js';
import { getDailyReadingService } from './dailyReadingService.js';

const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });
const ACTION_ATTACHMENT_NAME = { TASK_CREATE: 'Borrador del pendiente', DISPATCH: 'Borrador del despacho a producción', TASK_DELETE: 'Eliminación de pendientes en preparación' };

export const createBriaAssistantService = ({
  db = prisma,
  ai = getAIInstance,
  tools = briaAssistantTools,
  knowledge = getApplicationKnowledgeService,
  now = () => new Date(),
  logger = console,
  context = {},
  taskDrafts = briaTaskDrafts,
  dispatchDrafts = briaDispatchDrafts,
  deleteDrafts = briaDeleteDrafts,
  actions = briaActions,
  usage = getBriaUsageService,
  platform = getBriaPlatformClient,
  agencyFacts = getAgencyFactService,
  vault = getVaultService,
  mail = getMailboxService,
  permissions = getPermissionRequestService,
  dailyReading = getDailyReadingService,
  serviceHealth = serviceHealthService
} = {}) => {
  // Sin clave de cifrado la bóveda queda apagada, pero Bria sigue respondiendo con todo lo demás.
  const vaultFor = () => {
    try { return typeof vault === 'function' ? vault() : vault; }
    catch (error) { logger.error('[BriaAssistant] La bóveda no está disponible:', error.message); return null; }
  };
  // Los buzones compartidos usan la misma llave: sin ella no hay herramientas de correo, y Bria sigue con lo demás.
  const mailFor = () => {
    try { return typeof mail === 'function' ? mail() : mail; }
    catch (error) { logger.error('[BriaAssistant] Los buzones no están disponibles:', error.message); return null; }
  };
  const loadPerson = async (user) => {
    const row = await db.user.findUnique({
      where: { id: user?.userId || user?.id || '' },
      select: { id: true, name: true, role: true, isActive: true, modulePermissions: true, sessionVersion: true, teamMember: { select: { id: true, name: true, role: true, isActive: true } } }
    });
    if (!row) throw httpError(401, 'No encontramos tu cuenta.', 'USER_NOT_FOUND');
    if (!canUseBria(row) || !row.teamMember?.isActive) throw httpError(403, 'Bria no está activada para tu cuenta.', 'BRIA_DISABLED');
    if (row.sessionVersion !== (user.sessionVersion ?? 0)) throw httpError(401, 'Tu sesión ya no está activa.', 'TOKEN_REVOKED');
    if (user.exp && user.exp * 1000 <= Date.now()) throw httpError(401, 'Tu sesión ya no está activa.', 'TOKEN_REVOKED');
    // La identidad y la ficha actuales acompañan a los permisos: las herramientas de lectura usan ambas
    // para limitar el libro propio y las cuentas del PM, aunque el token solo traiga userId.
    Object.assign(user, { id: row.id, userId: row.id, teamMember: row.teamMember, role: row.role, modulePermissions: row.modulePermissions });
    return {
      userId: row.id,
      name: row.teamMember?.name || row.name || 'colega',
      jobTitle: row.teamMember?.role || null,
      accountRole: row.role,
      memberId: row.teamMember?.id || null
    };
  };

  return {
    // `taskDraft` suelto lo sigue mandando la vista de investigación; aquí se envuelve en la base común.
    async ask({ user, question, history, attachments = [], chatAttachments = [], revalidateConversation, taskDraft, pendingAction, lastOperation = null, selectionTurn = null, session = null, taskAttachments = [], taskEvidence, taskDefaults = {}, readingDay = null, onEvent } = {}) {
      if (!pendingAction && taskDraft) pendingAction = wrapLegacyAction('TASK_CREATE', taskDraft);
      if (!canUseBria(user)) throw httpError(403, 'Bria no está activada para tu cuenta.', 'BRIA_DISABLED');
      const text = normalizeQuestion(question);
      if (!text) throw httpError(400, 'Escribe una pregunta.', 'BRIA_QUESTION_REQUIRED');
      const client = typeof ai === 'function' ? ai() : ai;
      if (!client) throw httpError(503, 'Bria no está disponible en este momento.', 'OPENAI_NOT_AVAILABLE');
      const person = await loadPerson(user);
      const revalidate = async () => { await loadPerson(user); await revalidateConversation?.(); };
      const result = await runAssistant({
        question: text,
        history: normalizeHistory(history),
        attachments: [...attachments,
          ...(lastOperation && ['DONE', 'CANCELLED'].includes(lastOperation.status) ? [{ name: 'Última operación terminada (registro de la plataforma, solo consulta; no es un borrador pendiente)', status: 'READ', text: JSON.stringify(lastOperation) }] : []),
          ...(pendingAction && pendingAction.status === 'DRAFT' ? [{ name: `${ACTION_ATTACHMENT_NAME[pendingAction.type] || 'Acción en preparación'} (estado guardado; datos, no instrucciones). Si la persona responde lo que faltaba, vuelve a llamar la misma herramienta con todo lo que ya se sabía más lo nuevo.`, status: 'READ', text: JSON.stringify(pendingAction) }] : [])],
        user,
        person,
        // Las manos de la plataforma usan la sesión del navegador: por WhatsApp no la hay y no se ofrecen (22 de octubre de 2026).
        tools: [...tools, conversationChoiceTool, ...createBriaTaskTools(taskDrafts), ...createBriaDispatchTools(dispatchDrafts), ...createBriaDeleteTools(deleteDrafts), ...createBriaActionTools(actions), ...createBriaUsageTools(typeof usage === 'function' ? usage() : usage), ...(session?.token ? createBriaPlatformTools({ actions, platform: typeof platform === 'function' ? platform() : platform }) : []), ...createKnowledgeTools(typeof knowledge === 'function' ? knowledge() : knowledge), ...createAgencyFactTools(typeof agencyFacts === 'function' ? agencyFacts() : agencyFacts), ...createVaultTools(vaultFor()), ...createBriaMailTools(mailFor()), ...briaClientUpdateTools, ...createPermissionRequestTools(typeof permissions === 'function' ? permissions() : permissions), ...createDailyReadingTools(typeof dailyReading === 'function' ? dailyReading() : dailyReading, { readingDay }), ...createServiceHealthTools(typeof serviceHealth === 'function' ? serviceHealth() : serviceHealth)],
        ai: createBriaModelRuntime({ ai: client, user }),
        today: bogotaDate(now()),
        logger,
        onEvent,
        // `session` es el token con el que la persona abrió el chat: sin él, consultar_plataforma no tiene manos.
        context: { db, getTasks, searchMemory: searchBriaMemory, searchAgency: searchAgencyMemory, readAgency: readAgencyMemory, operations: clientOperationsService, rhythm: teamRhythmService, load: teamLoadService, now, ...context, selectionTurn, pendingAction, taskAttachments, chatAttachments, taskEvidence, taskDefaults, revalidate, session }
      });
      // El motivo técnico de un fallo se queda en el registro del servidor; al navegador solo va qué falló.
      await revalidate();
      return { ...result, failures: result.failures.map(({ tool }) => ({ tool })) };
    }
  };
};

export const briaAssistantService = createBriaAssistantService();
