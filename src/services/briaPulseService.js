// El pulso de Bria en el servidor (Rodny, 10 de octubre de 2026: «quiero que viva en la plataforma desde ahora
// mismo»). Cada 15 minutos en horario hábil: el código reúne los hechos de toda la plataforma una sola vez, y para
// cada persona con Bria el modelo decide si dice algo, qué y cómo, dentro de los topes (una vez por hora y persona). Lo dicho queda en `pulse_messages`, que es lo
// que la tarjeta encima de la mascota muestra. Si el modelo no está, Bria dice el hecho más importante con las
// palabras de la plataforma (`REGLA`): nunca se queda muda por una caída del proveedor.

import prisma from '../lib/prisma.js';
import { AI_MODELS } from '../config/aiConfig.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { needsClientReview } from '../lib/contentApproval.js';
import { buildNudges, bogotaDayEnd } from '../lib/briaNudges.js';
import { collectFacts, pulseBudget, mutedKinds, eligibleFacts, buildPulseDigest, buildPulseRequest, parsePulse, validatePulse, fallbackPulse, workdayBounds, slotKeyOf, isWorkingTime, PULSE_LIMITS } from '../lib/briaPulse.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { createBriaProactiveRepository } from './briaProactiveRepository.js';
import { getBriaNudgeService } from './briaNudgeService.js';
import { teamLoadService } from './teamLoadService.js';
import { clientOperationsService } from './clientOperationsService.js';
import { createOpenAIClient } from './openAIClient.js';
import { listBriaPeople } from './weeklyFocusService.js';

export const PULSE_CHECK_MS = 5 * 60 * 1000;
const H = 3_600_000;
const RETURNED_AFTER_MS = 24 * H;

const defaultGenerate = async (request) => {
  const result = await createOpenAIClient({ models: AI_MODELS }).generate(request);
  return { text: result.text, model: result.model, usage: result.usage || null };
};

export const createBriaPulseService = ({
  db = prisma, repository, nudges, load = teamLoadService, operations = clientOperationsService, generate = defaultGenerate,
  now = () => new Date(), listPeople = listBriaPeople, limits = PULSE_LIMITS, logger = console
} = {}) => {
  const repo = repository || createBriaProactiveRepository({ pool: getSidecarPool() });
  const people = () => nudges || getBriaNudgeService();

  return {
    /** Los hechos de este momento, leídos una sola vez para todas las personas. Cada lectura que falle se deja fuera y se anota. */
    async collect(at = now()) {
      const today = bogotaDate(at);
      const safe = async (label, work, fallback) => { try { return await work(); } catch (error) { logger.error(`[BriaPulse] Sin ${label} esta vez:`, error?.message || error); return fallback; } };
      const [team, loadMap, ops, pieces, returned] = await Promise.all([
        safe('personas', () => people().readPeople(at), []),
        safe('mapa de carga', () => load.get(), null),
        safe('operación de clientes', () => operations.listOperations(), []),
        safe('piezas por aprobar', async () => {
          const from = new Date(`${today}T00:00:00Z`), to = new Date(from.getTime() + 3 * 24 * H);
          const rows = await db.contentItem.findMany({ where: { deletedAt: null, publishDate: { gte: from, lt: to }, status: { notIn: ['PUBLICADO'] }, plan: { deletedAt: null, status: { not: 'FINALIZADO' } } }, select: { id: true, objective: true, status: true, publishDate: true, revisionRequestedAt: true, planId: true, plan: { select: { client: { select: { name: true } } } } }, take: 200 });
          return rows.filter(needsClientReview).map((row) => ({ id: row.id, title: row.objective, planId: row.planId, clientName: row.plan?.client?.name || null, day: bogotaDate(row.publishDate) }));
        }, []),
        safe('devueltas', async () => {
          const before = new Date(at.getTime() - RETURNED_AFTER_MS);
          const rows = await db.task.findMany({ where: { status: 'DEVUELTA', returnedAt: { lte: before }, updatedAt: { lte: before } }, select: { id: true, title: true, returnedAt: true, assignee: { select: { id: true, name: true } }, client: { select: { name: true } } }, take: 100 });
          return rows.map((row) => ({ id: row.id, title: row.title, returnedDay: bogotaDate(row.returnedAt), personId: row.assignee?.id || null, assigneeName: row.assignee?.name || null, clientName: row.client?.name || null }));
        }, [])
      ]);
      const facts = collectFacts({ nudges: buildNudges({ people: team, now: at }), load: loadMap, operations: ops, pieces, returned, today });
      return { facts, people: team };
    },

    /** Decide y guarda lo que Bria le dice ahora a una persona. Devuelve lo guardado (puede ser nada). */
    async speakTo(user, facts, at = now()) {
      const { start, end } = workdayBounds(at);
      const hourStart = new Date(Math.floor(at.getTime() / H) * H);
      const state = await repo.pulseState(user.id, { dayStart: start, hourStart, muteSince: new Date(at.getTime() - limits.muteDays * 24 * H) });
      const budget = pulseBudget({ saidToday: state.saidToday, saidThisHour: state.saidThisHour, limits });
      if (budget <= 0) return { saved: [], skipped: 'sin presupuesto' };
      const eligible = eligibleFacts({ facts, saidFingerprints: state.saidFingerprints, muted: mutedKinds(state.dismissalsByKind, limits), viewerPersonId: user.teamMember?.id || null });
      if (!eligible.length) return { saved: [], skipped: 'nada nuevo' };
      const digest = buildPulseDigest({ facts: eligible, person: { name: user.teamMember?.name || user.name, role: user.role }, said: state.said, now: at });
      let messages, model = null, usage = null;
      try {
        const answer = await generate(buildPulseRequest({ digest, budget }));
        model = answer.model || null; usage = answer.usage || null;
        messages = validatePulse(parsePulse(answer.text), { facts: eligible, budget });
      } catch (error) {
        logger.error('[BriaPulse] El modelo no respondió; Bria dice el hecho más importante:', error?.message || error);
        messages = fallbackPulse(eligible, 1);
      }
      if (!messages.length) return { saved: [], skipped: 'Bria decidió callar' };
      const saved = await repo.insertMessages(user.id, messages, { expiresAt: end > at ? end : bogotaDayEnd(at), model, usage, createdAt: at });
      return { saved };
    },

    /** Cada tramo de 15 minutos en horario hábil, para todas las personas con Bria; a cada una le habla como máximo una vez por hora. */
    async run() {
      const at = now();
      if (!isWorkingTime(at)) return { skipped: 'fuera de horario' };
      const slotKey = slotKeyOf(at);
      if (!await repo.claimRun(slotKey)) return { skipped: 'este tramo ya corrió', slotKey };
      const { facts } = await this.collect(at);
      let spoke = 0, quiet = 0, failed = 0;
      if (facts.length) {
        for (const user of await listPeople(db)) {
          try { const result = await this.speakTo(user, facts, at); if (result.saved.length) spoke += 1; else quiet += 1; }
          catch (error) { failed += 1; logger.error('[BriaPulse] No se pudo decidir para una persona:', error?.message || error); }
        }
      }
      return { slotKey, facts: facts.length, spoke, quiet, failed };
    }
  };
};

let instance;
export const getBriaPulseService = () => instance ||= createBriaPulseService();

export const initBriaPulseScheduler = ({ service = getBriaPulseService, setIntervalFn = setInterval, setTimeoutFn = setTimeout, logger = console } = {}) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await (typeof service === 'function' ? service() : service).run(); }
    catch (error) { logger.error('[BriaPulse] El pulso falló:', error?.message || error); }
    finally { running = false; }
  };
  setTimeoutFn(tick, 3 * 60 * 1000)?.unref?.();
  setIntervalFn(tick, PULSE_CHECK_MS)?.unref?.();
  logger.log('[BriaPulse] Pulso de Bria programado (cada 15 minutos en horario hábil, Bogotá).');
  return tick;
};
