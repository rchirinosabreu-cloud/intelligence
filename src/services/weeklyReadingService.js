// La lectura de la semana (10 de octubre de 2026): Bria lee Ritmo y el mapa de carga y le propone a la dirección
// de 3 a 5 decisiones. Se genera a mano desde Ritmo o sola los lunes a las 7 (reloj de Bogotá), una vez por semana,
// y entonces avisa a administradores y project managers con acceso a Manager. El modelo propone y el código manda
// (`src/lib/weeklyReading.js`). Todo pasa por el cliente gobernado de OpenAI.

import prisma from '../lib/prisma.js';
import { AI_MODELS } from '../config/aiConfig.js';
import { hasModulePermission, isManagerRole } from '../config/security.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { buildReadingDigest, buildReadingRequest, parseReading, validateReading, weekKeyOf } from '../lib/weeklyReading.js';
import { createOpenAIClient } from './openAIClient.js';
import { createWeeklyReadingRepository } from './weeklyReadingRepository.js';
import { teamRhythmService } from './teamRhythmService.js';
import { teamLoadService } from './teamLoadService.js';
import { createNotification } from './notificationService.js';

export const WEEKLY_READING_PERIOD_DAYS = 30;
export const WEEKLY_READING_NOTIFICATION = 'RITMO_LECTURA_SEMANAL';
export const WEEKLY_READING_CHECK_MS = 30 * 60 * 1000;
const SYSTEM_ACTOR = { ref: 'bria', name: 'Bria' };

const bogotaClock = (value) => { const d = new Date(new Date(value).getTime() - 5 * 3600000); return { weekday: d.getUTCDay(), hour: d.getUTCHours() }; };

/** Administradores y project managers activos con acceso a Manager: a ellos les llega la lectura. */
export const listManagersWithAccess = async (db = prisma) => (await db.user.findMany({
  where: { isActive: true, role: { in: ['ADMIN', 'PROJECT_MANAGER'] }, teamMember: { is: { isActive: true } } },
  select: { id: true, role: true, modulePermissions: true }
})).filter((user) => isManagerRole(user.role) && hasModulePermission(user, 'manager'));

const defaultGenerate = async (request) => {
  const result = await createOpenAIClient({ models: AI_MODELS }).generate(request);
  return { text: result.text, model: result.model, usage: result.usage || null };
};

export const createWeeklyReadingService = ({
  repository, rhythm = teamRhythmService, load = teamLoadService, generate = defaultGenerate,
  now = () => new Date(), notify = createNotification, listManagers = listManagersWithAccess, logger = console
} = {}) => {
  const repo = repository || createWeeklyReadingRepository({ pool: getSidecarPool() });
  return {
    async current() {
      const latest = await repo.latest();
      const weekKey = weekKeyOf(now());
      return { weekKey, reading: latest, isCurrentWeek: Boolean(latest && latest.weekKey === weekKey) };
    },

    async generate({ actor = SYSTEM_ACTOR, trigger = 'MANUAL' } = {}) {
      const [rhythmData, loadData] = await Promise.all([rhythm.get({ days: WEEKLY_READING_PERIOD_DAYS }), load.get()]);
      const today = loadData.today;
      const digest = buildReadingDigest({ rhythm: rhythmData, load: loadData });
      const answer = await generate(buildReadingRequest({ digest, today }));
      const reading = validateReading(parseReading(answer.text), digest);
      return repo.save({ weekKey: weekKeyOf(now()), trigger, periodDays: WEEKLY_READING_PERIOD_DAYS, reading, digest: digest.text, model: answer.model || null, usage: answer.usage || null, actor });
    },

    /** Los lunes desde las 7 (Bogotá), una sola vez por semana aunque el servidor se reinicie. */
    async runAutomatic() {
      const { weekday, hour } = bogotaClock(now());
      if (weekday !== 1 || hour < 7) return { skipped: 'fuera de horario' };
      const weekKey = weekKeyOf(now());
      if (await repo.forWeek(weekKey, { trigger: 'AUTOMATICO' })) return { skipped: 'ya generada' };
      const saved = await this.generate({ actor: SYSTEM_ACTOR, trigger: 'AUTOMATICO' });
      let notified = 0;
      for (const user of await listManagers()) {
        try {
          await notify({ userId: user.id, type: WEEKLY_READING_NOTIFICATION, message: 'Bria preparó la lectura de la semana del equipo.', relatedId: saved.id, url: '/manager?tab=ritmo' });
          notified += 1;
        } catch (error) { logger.error('[WeeklyReading] No se pudo avisar a una persona:', error?.message || error); }
      }
      return { generated: saved.id, notified };
    }
  };
};

let instance;
export const getWeeklyReadingService = () => instance ||= createWeeklyReadingService();

export const initWeeklyReadingScheduler = ({ service = getWeeklyReadingService, setIntervalFn = setInterval, setTimeoutFn = setTimeout, logger = console } = {}) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await (typeof service === 'function' ? service() : service).runAutomatic(); }
    catch (error) { logger.error('[WeeklyReading] La lectura automática falló:', error?.message || error); }
    finally { running = false; }
  };
  setTimeoutFn(tick, 90 * 1000)?.unref?.();
  setIntervalFn(tick, WEEKLY_READING_CHECK_MS)?.unref?.();
  logger.log('[WeeklyReading] Lectura de la semana programada (lunes 7:00, Bogotá).');
  return tick;
};
