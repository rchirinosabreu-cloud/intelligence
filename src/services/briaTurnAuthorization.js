import { hasModulePermission, isManagerRole } from '../config/security.js';
import { canOpenTask, TASK_PRIVACY_SELECT } from '../lib/taskPrivacy.js';
import { actionModules } from './briaActionService.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { canUseVault } from '../lib/vaultAccess.js';

// La misma comprobación al leer y al terminar una respuesta. Las dependencias se inyectan para
// verificar fuentes y revocaciones con la regla real sin consultar datos de producción.
export const createBriaTurnAuthorizer = ({ db, canReadAgencyMemory, knowledge }) => async (user, turn) => {
  for (const source of turn.sources || []) {
    if (source.kind === 'documento' && !await canReadAgencyMemory(user)) return false;
    if (['pieza', 'parrilla'].includes(source.kind) && !hasModulePermission(user, 'parrillas')) return false;
    if (['minuta', 'ritmo'].includes(source.kind) && (!hasModulePermission(user, 'manager') || !isManagerRole(user.role))) return false;
    if (source.kind === 'tarea' || source.kind === 'tarea_resumen') {
      const summary = source.kind === 'tarea_resumen';
      if (summary && !hasModulePermission(user, 'gestion')) return false;
      const task = await db.task.findUnique({ where: { id: source.id }, select: TASK_PRIVACY_SELECT });
      // Una cabecera no da acceso al cuerpo ni rebaja una fuente histórica de detalle.
      if (!task || (!summary && !canOpenTask(task, user.userId || user.id))) return false;
    }
    if (source.kind === 'aprendizaje' && !(await knowledge().list(user)).some(row => row.id === source.id)) return false;
  }
  if (turn.taskDraft && !hasModulePermission(user, 'gestion')) return false;
  if (turn.dispatchDraft && !(hasModulePermission(user, 'gestion') && hasModulePermission(user, 'parrillas'))) return false;
  if (turn.deleteDraft && !hasModulePermission(user, 'gestion')) return false;
  if (turn.pendingAction) {
    if (turn.pendingAction.type === 'PLATFORM') {
      const needs = turn.pendingAction.permission || {};
      if (!canUseBria(user)) return false;
      if ((needs.modules || []).some(module => !hasModulePermission(user, module))) return false;
      if ((needs.roles || []).some(role => role === 'MANAGER' ? !isManagerRole(user.role) : String(user.role || '').toUpperCase() !== role)) return false;
    } else if (!(actionModules(turn.pendingAction.type).length ? actionModules(turn.pendingAction.type) : ['gestion']).every(module => hasModulePermission(user, module))) return false;
  }
  if ((turn.accessCards?.length || turn.accessCapture) && !canUseVault(user)) return false;
  return true;
};
