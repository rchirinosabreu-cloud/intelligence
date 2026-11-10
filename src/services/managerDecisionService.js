// El tablero de decisiones de Manager (Rodny, 10 de noviembre de 2026). Une la lectura de la mañana de Bria y las
// señales del Observer en una sola lista y guarda cada respuesta donde el sistema aprende de ella: el libro de
// decisiones para la lectura y el estado y el motivo de la señal para el Observer. La regla vive en
// `src/lib/managerDecisions.js`; aquí solo se lee y se escribe.

import prisma from '../lib/prisma.js';
import { buildDecisionBoard, responseProblem, readingVerdictFor, observerActionFor, LEARN_DAYS } from '../lib/managerDecisions.js';
import { transitionObserverSignal } from './briaObserverService.js';
import { getDailyReadingService } from './dailyReadingService.js';

const LIVE_STATUSES = ['OPEN', 'REVIEWED', 'SNOOZED'];
const GROUNDED = { OR: [{ grounding: null }, { grounding: { not: 'UNVERIFIED' } }] };
const fail = (message, status) => Object.assign(new Error(message), { status });

export const createManagerDecisionService = ({ db = prisma, reading = getDailyReadingService, now = () => new Date(), logger = console } = {}) => {
  const readings = () => (typeof reading === 'function' ? reading() : reading);

  const board = async (user) => {
    const at = now();
    const since = new Date(at.getTime() - LEARN_DAYS * 86_400_000);
    const [book, signals, dismissed] = await Promise.all([
      readings().decisionBoard(user),
      db.briaObserverSignal.findMany({ where: { AND: [GROUNDED, { status: { in: LIVE_STATUSES } }] }, orderBy: [{ lastDetectedAt: 'desc' }], take: 200 }),
      db.briaObserverSignal.findMany({ where: { status: 'DISMISSED', dismissedAt: { gte: since } }, select: { id: true, category: true, clientId: true, dismissedAt: true, metadata: true } })
    ]);
    const clientIds = [...new Set(signals.map((row) => row.clientId).filter(Boolean))];
    const rows = clientIds.length ? await db.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true } }) : [];
    const clients = Object.fromEntries(rows.map((row) => [row.id, row.name]));
    return {
      ...buildDecisionBoard({ reading: book.reading, decisions: book.decisions, entries: book.entries, signals, dismissed, clients, now: at }),
      scorecard: book.scorecard, readingDay: book.reading?.day || null, generatedAt: at.toISOString()
    };
  };

  const respondToReading = async (user, body) => {
    const { veredicto, nota } = readingVerdictFor(body, { now: now() });
    const dia = /^\d{4}-\d{2}-\d{2}:/.test(body.id) ? body.id.slice(0, 10) : null;
    const result = await readings().recordVerdict({ user, ref: body.id, veredicto, nota, dia });
    if (!result?.saved) throw fail(result?.motivo || 'No pude guardar tu respuesta.', 409);
  };

  const respondToObserver = async (user, body) => {
    const at = now();
    const signal = await db.briaObserverSignal.findUnique({ where: { id: body.id } });
    if (!signal) throw fail('Esta señal ya no existe.', 404);
    if (!LIVE_STATUSES.includes(signal.status)) throw fail('Esta señal ya se respondió desde otra pantalla. Recarga para ver cómo quedó.', 409);
    const plan = observerActionFor(body, { now: at });
    const data = { ...transitionObserverSignal(plan.action, { now: at, snoozedUntil: plan.snoozedUntil }), lastActionById: user.id || null };
    if (plan.dismissal) {
      const metadata = signal.metadata && typeof signal.metadata === 'object' && !Array.isArray(signal.metadata) ? signal.metadata : {};
      data.metadata = { ...metadata, dismissal: { ...plan.dismissal, by: user.id || null, byName: user.teamMember?.name || user.name || null, at: at.toISOString() } };
    }
    // Escritura condicional: si otra persona la cambió entretanto, no se pisa su decisión.
    const { count } = await db.briaObserverSignal.updateMany({ where: { id: signal.id, status: signal.status, updatedAt: signal.updatedAt }, data });
    if (!count) throw fail('Esta señal cambió mientras respondías. Recarga para ver cómo quedó.', 409);
  };

  return {
    board,
    async respond(user, body = {}) {
      const problem = responseProblem(body);
      if (problem) throw fail(problem, 400);
      if (body.source === 'LECTURA') await respondToReading(user, body);
      else await respondToObserver(user, body);
      logger.info?.(`[ManagerDecisions] ${body.source} ${body.respuesta}${body.motivo ? `/${body.motivo}` : ''} por ${user.id}`);
      return board(user);
    }
  };
};

let instance;
export const getManagerDecisionService = () => instance ||= createManagerDecisionService();
