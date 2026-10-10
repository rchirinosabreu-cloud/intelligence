import { getSidecarPool } from '../lib/sidecarPool.js';
import prisma from '../lib/prisma.js';
import { resolveKnowledgeActor, getApplicationKnowledgeService } from './briaKnowledgeApplication.js';
import { createBriaConversationRepository } from './briaConversationRepository.js';
import { createBriaConversationService } from './briaConversationService.js';
import { briaAssistantService } from './briaAssistantService.js';
import { hasModulePermission, isManagerRole } from '../config/security.js';
import { canOpenTask, TASK_PRIVACY_SELECT } from '../lib/taskPrivacy.js';
import { getAIInstance } from './aiService.js';
import { canReadAgencyMemory } from './briaLivingService.js';
import { getBriaChatStorage } from './briaChatStorage.js';
import { startBriaChatPurgeWorker } from './briaChatPurge.js';
import { briaTaskDrafts, briaDispatchDrafts, briaDeleteDrafts, briaActions } from './briaTaskApplication.js';
import { actionModules } from './briaActionService.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { canUseVault } from '../lib/vaultAccess.js';
let instance;
const authorizeTurn = async (user, turn) => {
  for (const source of turn.sources || []) {
    if (source.kind === 'documento' && !await canReadAgencyMemory(user)) return false;
    if (['pieza','parrilla'].includes(source.kind) && !hasModulePermission(user, 'parrillas')) return false;
    if (['minuta', 'ritmo'].includes(source.kind) && (!hasModulePermission(user, 'manager') || !isManagerRole(user.role))) return false;
    if (source.kind === 'tarea') {
      const task = await prisma.task.findUnique({ where: { id: source.id }, select: TASK_PRIVACY_SELECT });
      if (!task || !canOpenTask(task, user.userId || user.id)) return false;
    }
    if (source.kind === 'aprendizaje' && !(await getApplicationKnowledgeService().list(user)).some(row => row.id === source.id)) return false;
  }
  // Turnos guardados antes de la base común (hasta el 10 de octubre de 2026) traen el borrador con su clave vieja.
  if (turn.taskDraft && !hasModulePermission(user, 'gestion')) return false;
  if (turn.dispatchDraft && !(hasModulePermission(user, 'gestion') && hasModulePermission(user, 'parrillas'))) return false;
  if (turn.deleteDraft && !hasModulePermission(user, 'gestion')) return false;
  // Una acción preparada exige el módulo de su pantalla: sin él, ni se ve ni se confirma.
  if (turn.pendingAction) {
    // Una operación del mapa de la plataforma lleva los permisos leídos de su ruta; las demás, el módulo de su pantalla.
    if (turn.pendingAction.type === 'PLATFORM') {
      const needs = turn.pendingAction.permission || {};
      if (!canUseBria(user)) return false;
      if ((needs.modules || []).some((module) => !hasModulePermission(user, module))) return false;
      if ((needs.roles || []).some((role) => role === 'MANAGER' ? !isManagerRole(user.role) : String(user.role || '').toUpperCase() !== role)) return false;
    } else if (!(actionModules(turn.pendingAction.type).length ? actionModules(turn.pendingAction.type) : ['gestion']).every((module) => hasModulePermission(user, module))) return false;
  }
  // Las tarjetas de la bóveda llevan solo nombres; el valor lo vuelve a autorizar la bóveda al mostrarlo.
  if ((turn.accessCards?.length || turn.accessCapture) && !canUseVault(user)) return false;
  return true;
};
export const getApplicationConversationService = () => {
  if (instance) return instance;
  const pool = getSidecarPool();
  const storage = getBriaChatStorage();
  startBriaChatPurgeWorker({ pool, storage });
  return instance = createBriaConversationService({ repository: createBriaConversationRepository({ pool, storage, requireStorage: process.env.NODE_ENV === 'production', workspace: 'application' }), resolveActor: resolveKnowledgeActor, assistant: briaAssistantService, taskDrafts: briaTaskDrafts, dispatchDrafts: briaDispatchDrafts, deleteDrafts: briaDeleteDrafts, actions: briaActions, ai: getAIInstance, authorizeTurn });
};
