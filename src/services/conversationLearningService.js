// Bria aprende de los chats (Rodny, 20 de octubre de 2026). Cada noche, desde las 22:00 de Bogotá, relee las
// conversaciones del día y guarda en la memoria de la agencia lo que una persona del equipo afirmó: con origen
// CONVERSACION, su cita literal, quién lo dijo y certeza «así se trabaja» o «propuesta». Lo confirmado sigue siendo
// lo que el equipo dice a propósito, y una corrección en el chat lo reemplaza o lo retira como siempre.
import prisma from '../lib/prisma.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { createOpenAIClient } from './openAIClient.js';
import { AI_MODELS } from '../config/aiConfig.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { bogotaClock } from '../lib/briaNudges.js';
import { runWithAiContext } from '../lib/aiRequestContext.js';
import { summarizeAiCalls, normalizeAiUsage } from '../lib/aiUsage.js';
import { factAccess } from '../lib/briaAgencyFacts.js';
import { createBriaAgencyFactRepository } from './briaAgencyFactRepository.js';
import { createBriaConversationRepository } from './briaConversationRepository.js';
import { buildLearningDigest, buildLearningRequest, parseLearnings, validateLearnings, LEARNING_ORIGIN, CONVERSATION_LEARNING_USE_CASE } from '../lib/conversationLearning.js';

export const LEARNING_FROM = 22 * 60;          // 22:00 de Bogotá: el día ya terminó.
export const LEARNING_CHECK_MS = 10 * 60 * 1000;
export const MAX_CHATS_PER_NIGHT = 60;
const ACTOR = { ref: 'bria', name: 'Bria' };
const READER = { role: 'ADMIN', isActive: true, modulePermissions: { bria: true, financiero: true } };
const DAY = 86_400_000;
const bogotaWindow = (day) => { const from = new Date(`${day}T05:00:00.000Z`); return { fromIso: from.toISOString(), toIso: new Date(from.getTime() + DAY).toISOString() }; };
const plusDays = (day, amount) => new Date(Date.parse(`${day}T12:00:00Z`) + amount * DAY).toISOString().slice(0, 10);

const defaultGenerate = async (request) => {
  const result = await createOpenAIClient({ models: AI_MODELS }).generate(request);
  return { text: result.text, model: result.model, usage: result.usage || null };
};

export const createConversationLearningService = ({
  db = prisma, pool = null, conversations = null, facts = null, generate = defaultGenerate, now = () => new Date(), logger = console
} = {}) => {
  const sidecar = () => pool || getSidecarPool();
  const chats = () => conversations || createBriaConversationRepository({ pool: sidecar(), workspace: 'application' });
  const memory = () => facts || createBriaAgencyFactRepository({ pool: sidecar(), workspace: 'application' });

  // Reclama el día: una sola lectura por noche aunque haya dos réplicas o un reinicio; una que no terminó en dos horas se repite.
  const claim = async (day) => (await sidecar().query(`INSERT INTO bria_memory.conversation_learning_runs(day_key) VALUES ($1)
    ON CONFLICT (day_key) DO UPDATE SET started_at = now()
    WHERE bria_memory.conversation_learning_runs.finished_at IS NULL AND bria_memory.conversation_learning_runs.started_at < now() - interval '2 hours'
    RETURNING day_key`, [day])).rowCount > 0;
  const finish = (day, summary) => sidecar().query('UPDATE bria_memory.conversation_learning_runs SET finished_at = now(), conversations = $2, facts = $3, usage = $4 WHERE day_key = $1', [day, summary.conversations, summary.facts, JSON.stringify(summary.usage || null)]);

  const people = async (refs) => {
    if (!refs.length) return new Map();
    const rows = await db.user.findMany({ where: { id: { in: refs } }, select: { id: true, name: true, teamMember: { select: { name: true } } } });
    return new Map(rows.map((row) => [row.id, row.teamMember?.name || row.name || null]));
  };

  return {
    /** Lee las conversaciones de un día y guarda lo aprendido. Idempotente por día; `force` repite una lectura ya hecha. */
    async learnDay(day, { force = false } = {}) {
      if (!force && !await claim(day)) return { day, skipped: 'ya leído' };
      if (force) await sidecar().query('INSERT INTO bria_memory.conversation_learning_runs(day_key) VALUES ($1) ON CONFLICT (day_key) DO UPDATE SET started_at = now(), finished_at = NULL', [day]);
      const { fromIso, toIso } = bogotaWindow(day);
      const all = (await chats().conversationsBetween(fromIso, toIso)).filter((chat) => chat.turns.some((turn) => turn.role === 'user'));
      const names = await people([...new Set(all.map((chat) => chat.actorRef))]);
      const [clients, members] = await Promise.all([
        db.client.findMany({ where: { isArchived: false }, select: { id: true, name: true } }),
        db.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true } })
      ]);
      const access = factAccess(READER), repo = memory();
      const calls = [], learned = [], dropped = [];
      for (const chat of all.slice(0, MAX_CHATS_PER_NIGHT)) {
        const conversation = { id: chat.id, personName: names.get(chat.actorRef) || null, turns: chat.turns };
        const digest = buildLearningDigest({ day, conversation });
        if (!digest.userTurns || digest.personText.trim().length < 40) continue;
        let raw;
        try {
          const started = Date.now();
          const answer = await runWithAiContext({ actorId: chat.actorRef || null, module: 'bria', route: 'SCHEDULER conversation-learning' }, () => generate(buildLearningRequest({ digest, day })));
          calls.push({ model: answer.model || null, latencyMs: Date.now() - started, usage: normalizeAiUsage(answer.usage) });
          raw = parseLearnings(answer.text);
        } catch (error) { logger.error('[ConversationLearning] Un chat no se pudo leer; sigo con los demás:', error?.message || error); continue; }
        // Lo ya sabido de las entidades que el modelo nombró, para no repetirlo.
        const entities = [...new Set((raw?.aprendizajes || []).map((row) => String(row?.entidad || '').trim()).filter(Boolean))].slice(0, 12);
        const known = (await Promise.all(entities.map((entity) => repo.search(access, { entity, limit: 40 }).catch(() => [])))).flat();
        const { facts: valid, dropped: out } = validateLearnings(raw, { day, conversation, personText: digest.personText, clients, members, known });
        learned.push(...valid); dropped.push(...out);
      }
      let written = { create: 0, unchanged: 0, keptByTeam: 0 };
      if (learned.length) written = await repo.importReading({ facts: learned, asOf: day, actor: ACTOR, origin: LEARNING_ORIGIN, reason: 'Aprendido conversando con el equipo' });
      const summary = { day, conversations: all.length, facts: written.create, repeated: written.unchanged + (written.keptByTeam || 0), dropped: dropped.length, usage: summarizeAiCalls(calls) };
      await finish(day, summary);
      logger.log(`[ConversationLearning] ${day}: ${all.length} chats, ${written.create} hechos nuevos, ${summary.repeated} repetidos, ${dropped.length} descartados.`);
      return summary;
    },

    /** Desde las 22:00 lee el día de hoy; antes de las 6:00 alcanza el de ayer si quedó sin leer. */
    async runAutomatic() {
      const at = now();
      const today = bogotaDate(at), minutes = bogotaClock(at).minutes;
      if (minutes >= LEARNING_FROM) return this.learnDay(today);
      if (minutes < 6 * 60) return this.learnDay(plusDays(today, -1));
      return { skipped: 'fuera de horario' };
    },

    /** Lo aprendido desde ayer que esta persona puede ver, para su lectura de la mañana. */
    async learnedFor(user, { fromDay, clientIds = null } = {}) {
      const rows = await memory().learnedSince(factAccess(user), { fromDay });
      return clientIds ? rows.filter((fact) => fact.clientId && clientIds.has(fact.clientId)) : rows;
    }
  };
};

let instance;
export const getConversationLearningService = () => instance ||= createConversationLearningService();

export const initConversationLearningScheduler = ({ service = getConversationLearningService, setIntervalFn = setInterval, setTimeoutFn = setTimeout, logger = console } = {}) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await (typeof service === 'function' ? service() : service).runAutomatic(); }
    catch (error) { logger.error('[ConversationLearning] La lectura nocturna falló:', error?.message || error); }
    finally { running = false; }
  };
  setTimeoutFn(tick, 6 * 60 * 1000)?.unref?.();
  setIntervalFn(tick, LEARNING_CHECK_MS)?.unref?.();
  logger.log('[ConversationLearning] Bria aprende de los chats cada noche (desde las 22:00, Bogotá).');
  return tick;
};
export { CONVERSATION_LEARNING_USE_CASE };
