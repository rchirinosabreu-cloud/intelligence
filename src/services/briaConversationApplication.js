import pg from 'pg';
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
import { briaTaskDrafts } from './briaTaskApplication.js';
let instance;
const authorizeTurn = async (user, turn) => {
  for (const source of turn.sources || []) {
    if (source.kind === 'documento' && !await canReadAgencyMemory(user)) return false;
    if (['pieza','parrilla'].includes(source.kind) && !hasModulePermission(user, 'parrillas')) return false;
    if (source.kind === 'minuta' && (!hasModulePermission(user, 'manager') || !isManagerRole(user.role))) return false;
    if (source.kind === 'tarea') {
      const task = await prisma.task.findUnique({ where: { id: source.id }, select: TASK_PRIVACY_SELECT });
      if (!task || !canOpenTask(task, user.userId || user.id)) return false;
    }
    if (source.kind === 'aprendizaje' && !(await getApplicationKnowledgeService().list(user)).some(row => row.id === source.id)) return false;
  }
  if (turn.taskDraft && !hasModulePermission(user, 'gestion')) return false;
  return true;
};
export const getApplicationConversationService = () => {
  if (instance) return instance;
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 5000 });
  const storage = getBriaChatStorage();
  startBriaChatPurgeWorker({ pool, storage });
  return instance = createBriaConversationService({ repository: createBriaConversationRepository({ pool, storage, requireStorage: process.env.NODE_ENV === 'production', workspace: 'application' }), resolveActor: resolveKnowledgeActor, assistant: briaAssistantService, taskDrafts: briaTaskDrafts, ai: getAIInstance, authorizeTurn });
};
