// La sesión diaria de project manager (21 de noviembre de 2026): una vez por día hábil, después de la lectura de la
// mañana, Bria revisa las tareas del equipo con un modelo fuerte y guarda sus propuestas. La regla y la validación
// viven en `src/lib/briaPmSession.js`; aquí solo se leen los datos, se llama al modelo y se guarda.

import prisma from '../lib/prisma.js';
import { activeTaskSourceWhere } from '../lib/taskRetirement.js';
import { bogotaDate, isBusinessDay } from '../lib/colombiaBusinessDays.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { decisionMemory, MEMORY_DAYS } from '../lib/briaDecisionMemory.js';
import { buildPmDigest, buildPmRequest, parsePmSession, validatePmSession, PM_HORIZON_DAYS } from '../lib/briaPmSession.js';
import { buildOperationDigest, buildOperationRequest, parseOperationModel, validateOperationModel, operationModelText, OPERATION_DAYS } from '../lib/briaOperationModel.js';
import { weekKeyOf } from '../lib/weeklyReading.js';
import { OPEN_TASK_STATUSES } from './taskSearch.js';
import { createDailyReadingRepository } from './dailyReadingRepository.js';
import { getPmBrain } from './briaPmBrain.js';

const DAY = 86_400_000;
export const PM_MAX_ATTEMPTS = 3;
const isAdmin = (user) => String(user?.role || '').toUpperCase() === 'ADMIN';

export const createPmSessionService = ({ db = prisma, repository, brain = getPmBrain, now = () => new Date(), logger = console } = {}) => {
  const repo = repository || createDailyReadingRepository({ pool: getSidecarPool() });
  const model = () => (typeof brain === 'function' ? brain() : brain);
  const attempts = new Map(), modelAttempts = new Map();

  const readTeam = async (today) => {
    const open = { AND: [activeTaskSourceWhere], status: { in: OPEN_TASK_STATUSES }, isPrivate: false };
    // Las fechas se guardan al mediodía UTC; el horizonte termina en la medianoche de Bogotá (UTC−5) de su último día.
    const until = new Date(Date.parse(`${today}T05:00:00.000Z`) + (PM_HORIZON_DAYS + 1) * DAY);
    const [rows, members, counts] = await Promise.all([
      db.task.findMany({ where: { ...open, dueDate: { lt: until } }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }], take: 400,
        select: { id: true, title: true, status: true, dueDate: true, client: { select: { name: true } }, assignee: { select: { id: true, name: true, isActive: true } } } }),
      db.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      db.task.groupBy({ by: ['assigneeId'], where: open, _count: { _all: true } })
    ]);
    const openOf = new Map(counts.map((row) => [row.assigneeId, row._count._all]));
    return {
      tasks: rows.filter((row) => row.dueDate).map((row) => ({ id: row.id, title: row.title, status: row.status, due: bogotaDate(row.dueDate), client: row.client?.name || null, assignee: row.assignee?.name || null })),
      people: members.map((member) => ({ name: member.name, open: openOf.get(member.id) || 0 }))
    };
  };

  return {
    /** La sesión de hoy: la guardada, o una nueva si es día hábil y el modelo está disponible. Nunca lanza. */
    async ensure(at = now()) {
      const today = bogotaDate(at);
      try {
        const existing = await repo.pmSession(today);
        if (existing) return existing;
        const planner = model();
        if (!planner || !isBusinessDay(today)) return null;
        // Un fallo no se reintenta sin fin en cada vuelta del reloj.
        const tried = attempts.get(today) || 0;
        if (tried >= PM_MAX_ATTEMPTS) return null;
        attempts.clear(); attempts.set(today, tried + 1);
        const [team, reading, entries] = await Promise.all([readTeam(today), repo.reading(today), repo.recentDecisions(today, { days: MEMORY_DAYS })]);
        if (!team.tasks.length) return null;
        const digest = buildPmDigest({ today, ...team, reading, book: decisionMemory({ entries, today }).text });
        const answer = await planner.plan(buildPmRequest({ digest }));
        const session = validatePmSession(parsePmSession(answer.text), digest);
        if (session.rejected) logger.warn?.('[BriaPmSession] Propuestas sin sustento descartadas:', session.rejected);
        const saved = await repo.savePmSession(today, { ...session, model: answer.model || null, usage: answer.usage || null, tasksRead: digest.refs.size });
        logger.info?.(`[BriaPmSession] Sesión ${today}: riesgos=${session.risks.length} movimientos=${session.moves.length} clientes=${session.clients.length} descartadas=${session.rejected}`);
        return saved;
      } catch (error) {
        logger.error?.('[BriaPmSession] No se pudo hacer la sesión de hoy:', error?.message || error);
        return null;
      }
    },

    /**
     * El modelo de la operación de esta semana: el guardado, o uno nuevo el primer día hábil en que haya modelo y
     * fotos suficientes. Mira solo cuentas. Nunca lanza.
     */
    async ensureModel(at = now()) {
      const today = bogotaDate(at), weekKey = weekKeyOf(at);
      try {
        const existing = await repo.operationModel(weekKey);
        if (existing) return existing;
        const thinker = model();
        if (!thinker || !isBusinessDay(today)) return null;
        const tried = modelAttempts.get(today) || 0;
        if (tried >= PM_MAX_ATTEMPTS) return null;
        modelAttempts.clear(); modelAttempts.set(today, tried + 1);
        // Hasta hoy inclusive: la foto de hoy ya se tomó antes de la lectura.
        const tomorrow = bogotaDate(new Date(Date.parse(`${today}T12:00:00Z`) + DAY));
        const [history, entries, sessions, previous] = await Promise.all([
          repo.history(tomorrow, OPERATION_DAYS), repo.recentDecisions(today, { days: MEMORY_DAYS }),
          repo.pmSessionsSince(bogotaDate(new Date(Date.parse(`${today}T12:00:00Z`) - 7 * DAY))), repo.latestOperationModel()
        ]);
        const lastDay = history.at(-1)?.day;
        const names = new Map(lastDay ? (await repo.snapshot(lastDay)).clients.map((client) => [client.id, client.name]) : []);
        const digest = buildOperationDigest({ today, weekKey, history, names, book: decisionMemory({ entries, today }).text, sessions, previous: operationModelText(previous) });
        if (!digest) return null;
        const answer = await thinker.plan(buildOperationRequest({ digest }));
        const result = validateOperationModel(parseOperationModel(answer.text), digest);
        if (result.rejected) logger.warn?.('[BriaOperationModel] Conclusiones sin sustento descartadas:', result.rejected);
        if (result.empty) return null;
        const saved = await repo.saveOperationModel(weekKey, { ...result, model: answer.model || null, usage: answer.usage || null });
        logger.info?.(`[BriaOperationModel] Semana ${weekKey}: fotos=${digest.days} patrones=${result.patterns.length} cuellos=${result.bottlenecks.length} aprendizajes=${result.lessons.length} vigilar=${result.watch.length} descartadas=${result.rejected}`);
        return saved;
      } catch (error) {
        logger.error?.('[BriaOperationModel] No se pudo hacer el modelo de la semana:', error?.message || error);
        return null;
      }
    },

    /** El modelo más reciente, para quien dirige la agencia. Va con la sesión: solo administración. */
    async operationModel(user, at = now()) {
      if (!isAdmin(user)) return null;
      const latest = await repo.latestOperationModel();
      // Un modelo de hace más de tres semanas ya no describe la operación de hoy.
      return latest?.day && Date.parse(`${bogotaDate(at)}T12:00:00Z`) - Date.parse(`${latest.day}T12:00:00Z`) <= 21 * DAY ? latest : null;
    },

    /** La sesión de hoy para quien dirige la agencia. Habla de la carga de todo el equipo: solo administración. */
    async today(user, at = now()) {
      if (!isAdmin(user)) return null;
      return repo.pmSession(bogotaDate(at));
    }
  };
};

let instance;
export const getPmSessionService = () => instance ||= createPmSessionService();
