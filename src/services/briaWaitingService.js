// «Esperando por ti» dentro de Bria (Rodny, 20 de noviembre de 2026: «lo de Manager me gustaría realmente moverlo a
// Bria eventualmente»). Reúne lo que espera una decisión de la persona: las decisiones de Manager y los pendientes de
// reuniones (quien tiene Manager), los correos importantes por responder (dirección) y las acciones que Bria dejó
// listas en un chat y nadie confirmó. Solo cuenta; cada cosa se sigue resolviendo en su lugar. Una fuente que falla
// se anota y no esconde a las demás.

import { hasModulePermission, isManagerRole } from '../config/security.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { buildWaiting } from '../lib/briaWaiting.js';

const WEEK_MS = 7 * 24 * 3600000;

export const createBriaWaitingService = ({ decisions, meetings, mail, chats, now = () => new Date(), logger = console } = {}) => {
  const decisionSource = async () => decisions || (await import('./managerDecisionService.js')).getManagerDecisionService();
  const meetingSource = async () => meetings || (await import('./meetingTaskInboxService.js')).getMeetingTaskInboxService();
  const mailSource = async () => mail || (await import('./mailboxService.js')).getMailboxService();
  const chatSource = async () => {
    if (chats) return chats;
    const [{ createBriaConversationRepository }, { getSidecarPool }] = await Promise.all([import('./briaConversationRepository.js'), import('../lib/sidecarPool.js')]);
    return createBriaConversationRepository({ pool: getSidecarPool(), workspace: 'application' });
  };
  return {
    async forUser(user) {
      if (!canUseBria(user)) return { items: [], failed: [] };
      const ref = user.userId || user.id;
      const manager = isManagerRole(user.role);
      const board = manager && hasModulePermission(user, 'manager');
      const failed = [];
      const read = async (name, enabled, work, fallback) => {
        if (!enabled) return fallback;
        try { return await work(); }
        catch (error) { failed.push(name); logger.error(`[BriaWaiting] Sin ${name} esta vez:`, error?.message || error); return fallback; }
      };
      const since = new Date(now().getTime() - WEEK_MS);
      const [decisionKeys, meetingKeys, mailCount, actions] = await Promise.all([
        read('decisiones', board, async () => (await (await decisionSource()).pulse(user)).keys || [], []),
        read('reuniones', board, async () => (await (await meetingSource()).pulse(user)).keys || [], []),
        read('correo', manager, async () => (await mailSource()).waitingCount({ since }), 0),
        read('acciones', true, async () => (await chatSource()).waitingActions({ ref }, { since }), [])
      ]);
      return { items: buildWaiting({ decisions: decisionKeys.length, meetings: meetingKeys.length, mail: mailCount, actions }), failed };
    }
  };
};

let instance = null;
export const getBriaWaitingService = () => instance ||= createBriaWaitingService();
