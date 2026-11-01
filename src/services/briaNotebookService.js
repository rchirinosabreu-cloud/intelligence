// Reúne el cuaderno de Bria para la persona que pregunta (ver `src/lib/briaNotebook.js`). Solo lee lo que ya se
// le entregó a esa persona —los avisos del pulso son suyos; la lectura, el cierre, el foco y la revisión viven como
// chats de ella—, así que no abre nada que no viera ya. Una fuente que falla se anota y no frena a las demás.

import { getSidecarPool } from '../lib/sidecarPool.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { isManagerRole } from '../config/security.js';
import { notebookWindow } from '../lib/briaNotebook.js';
import { createBriaProactiveRepository } from './briaProactiveRepository.js';
import { createBriaConversationRepository } from './briaConversationRepository.js';
import { createDailyReadingRepository } from './dailyReadingRepository.js';

export const createBriaNotebookService = ({ repository, conversations, readings, now = () => new Date(), logger = console } = {}) => {
  const repo = repository || createBriaProactiveRepository({ pool: getSidecarPool() });
  const chats = conversations || createBriaConversationRepository({ pool: getSidecarPool(), workspace: 'application' });
  const decisions = readings || createDailyReadingRepository({ pool: getSidecarPool() });
  const userIdOf = (user) => user?.userId || user?.id;
  // La nota de la plataforma es el primer turno de Bria de ese chat; lo que la persona escribió después no entra.
  const deliveredText = async (userRef, delivery) => {
    if (!delivery?.conversationId) return null;
    const chat = await chats.get({ ref: userRef }, delivery.conversationId);
    return chat?.turns?.find((turn) => turn.role === 'assistant')?.text || null;
  };
  return {
    async today(user) {
      if (!canUseBria(user)) return null;
      const userRef = userIdOf(user);
      if (!userRef) return null;
      const at = now();
      const window = notebookWindow(at);
      const notebook = { dia: window.dayKey, pulso: [], lecturaManana: null, cierre: null, cierreDia: null, focoSemana: null, revisionMes: null, decisiones: [], fallos: [] };
      const read = async (name, work) => {
        try { await work(); } catch (error) { notebook.fallos.push(name); logger.error(`[BriaCuaderno] No se pudo leer ${name}:`, error?.message || error); }
      };
      await Promise.all([
        read('pulso', async () => { if (isManagerRole(user?.role)) notebook.pulso = await repo.messagesOfDay(userRef, window.dayStart); }),
        read('lectura', async () => { notebook.lecturaManana = await deliveredText(userRef, await repo.morningBriefDelivery(window.dayKey, userRef)); }),
        read('cierre', async () => {
          for (const dayKey of [window.dayKey, window.previousDayKey]) {
            const text = await deliveredText(userRef, await repo.dailyCloseDelivery(dayKey, userRef));
            if (text) { notebook.cierre = text; notebook.cierreDia = dayKey; return; }
          }
        }),
        read('foco', async () => { notebook.focoSemana = await deliveredText(userRef, await repo.focusDelivery(window.weekKey, userRef)); }),
        read('revision', async () => { notebook.revisionMes = await deliveredText(userRef, await repo.monthlyReviewDelivery(window.monthKey, userRef)); }),
        read('decisiones', async () => { notebook.decisiones = await decisions.recentDecisions(window.dayKey, { days: 7, userRef }); })
      ]);
      return notebook;
    }
  };
};

let instance;
export const getBriaNotebookService = () => instance ||= createBriaNotebookService();
