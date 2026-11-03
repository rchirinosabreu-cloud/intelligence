// La liga del mes en el servidor (2 de noviembre de 2026). Cada día hábil a las 18:05 de Bogotá se evalúan los cinco
// puntos de cada persona con lo que la plataforma ya registra (`src/lib/leagueDay.js`) y se guardan en la base
// lateral; los días que falten del mes se completan solos, así noviembre cuenta desde el 1 aunque el cálculo se
// estrene después. Los extras del día (3 de noviembre de 2026) se leen de la traza operativa: la primera huella
// humana desde las 8:00 es «primero en abrir»; «primero en la reunión» no tiene fuente todavía y queda sin jugar.
// La copa lee el mes guardado más «hoy» en vivo, la carrera de todo el equipo, la posición y la bondad. Solo lee y
// cuenta: no cambia nada en la plataforma ni le escribe a nadie.

import prisma from '../lib/prisma.js';
import { bogotaDate, isBusinessDay } from '../lib/colombiaBusinessDays.js';
import { bogotaClock } from '../lib/briaNudges.js';
import { evaluateLeagueDay, isoWeekKey, openWindowOf } from '../lib/leagueDay.js';
import { kudosScore, leagueNextStep, leagueScore, summarizeDays, todayPoints, trackScale } from '../lib/platformLeague.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { canUseLeague } from '../lib/leagueVisibility.js';
import { createDailyReadingRepository } from './dailyReadingRepository.js';
import { createPlatformLeagueRepository } from './platformLeagueRepository.js';

export const LEAGUE_COMPUTE_MINUTES = 18 * 60 + 5;
export const LEAGUE_CHECK_MS = 10 * 60 * 1000;
export const KUDOS_NOTE_MAX = 120;
/** Una huella humana en la traza operativa: lo que deja una persona al usar la plataforma (nunca un reloj ni una réplica). */
export const PRESENCE_EVENTS = ['SESSION_STARTED', 'TASK_OPENED', 'TASK_LIST_SYNCED', 'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_UPDATED', 'NOTIFICATION_READ', 'PLATFORM_MUTATION'];

const DAY_MS = 86_400_000;
const dayWindow = (dayKey) => { const start = new Date(`${dayKey}T05:00:00.000Z`); return { start, end: new Date(start.getTime() + DAY_MS) }; };
const monthOf = (dayKey) => dayKey.slice(0, 7);
const daysOfMonthUntil = (monthKey, before) => {
  const [year, month] = monthKey.split('-').map(Number);
  const out = [];
  for (let day = 1; day <= 31; day++) {
    const key = `${monthKey}-${String(day).padStart(2, '0')}`;
    if (new Date(Date.UTC(year, month - 1, day)).getUTCMonth() !== month - 1) break;
    if (key >= before) break;
    out.push(key);
  }
  return out;
};
const lastDayOfMonth = (monthKey) => { const [year, month] = monthKey.split('-').map(Number); return `${monthKey}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`; };
const weekdayLabel = (dayKey) => new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${dayKey}T12:00:00Z`));
const fail = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });
const firstName = (name = '') => String(name).trim().split(/\s+/)[0] || name;

export const createPlatformLeagueService = ({ db = prisma, repository, snapshots, now = () => new Date(), logger = console } = {}) => {
  const repo = repository || createPlatformLeagueRepository({ pool: getSidecarPool() });
  const snaps = snapshots || createDailyReadingRepository({ pool: getSidecarPool() });
  // Quién ve la liga: la casilla «Liga del mes» de Equipo, persona por persona (también un administrador). Sin ella,
  // 404 y la copa no se dibuja. El cálculo de cada día corre para todo el equipo igual: al encenderla, el mes ya está contado.
  const memberAllowed = async (userId) => {
    const me = await db.teamMember.findUnique({ where: { userId }, select: { id: true, name: true, user: { select: { role: true, isActive: true, modulePermissions: true } } } });
    if (!me) throw fail(404, 'Esta cuenta no tiene ficha en Equipo.');
    if (!canUseLeague(me.user)) throw fail(404, 'La liga todavía no está activada para esta cuenta.', 'LEAGUE_NOT_OPEN');
    return me;
  };
  // El orden de los carriles es fijo, por nombre, nunca por puntaje: se ordena aquí y no se le fía a la consulta.
  const activeMembers = async () => (await db.teamMember.findMany({
    where: { isActive: true, user: { is: { isActive: true } } },
    select: { id: true, name: true, avatarUrl: true, user: { select: { id: true, role: true, isActive: true } } }
  })).sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));

  const service = {
    /** Todo lo que hace falta para evaluar un día, leído una sola vez: por persona, sus cierres, relojes, foto y devoluciones. */
    async readDay(dayKey) {
      const { start, end } = dayWindow(dayKey);
      const members = await activeMembers();
      const userOf = new Map(members.map((member) => [member.id, member.user.id]));
      const memberOfUser = new Map(members.map((member) => [member.user.id, member]));
      const open = openWindowOf(dayKey);
      const [closed, daySessions, returned, snapshot, firstTrace] = await Promise.all([
        db.task.findMany({ where: { status: 'REALIZADA', completedAt: { gte: start, lt: end } }, select: { id: true, title: true, assigneeId: true, completedAt: true, dueDate: true } }),
        db.taskWorkSession.findMany({ where: { OR: [{ endedAt: { gte: start, lt: end } }, { endedAt: null, startedAt: { lt: end } }] }, select: { workerId: true, durationMs: true, isOverlapping: true, correctedAt: true, closeReason: true, startedAt: true, endedAt: true } }),
        db.task.findMany({ where: { returnedAt: { gte: start, lt: end } }, select: { assigneeId: true } }),
        snaps.snapshot(dayKey).catch((error) => { logger.error('[Liga] Sin la foto de las 6:00:', error?.message || error); return null; }),
        // Primero en abrir: la primera huella humana en la traza operativa desde las 8:00 de Bogotá. Sin lectura, nada se asume.
        db.operationalTraceEvent.findFirst({ where: { occurredAt: { gte: open.start, lt: open.end }, actorId: { in: [...memberOfUser.keys()] }, eventType: { in: PRESENCE_EVENTS } }, orderBy: { occurredAt: 'asc' }, select: { actorId: true, occurredAt: true } })
          .catch((error) => { logger.error('[Liga] Sin lectura de quién abrió primero:', error?.message || error); return undefined; })
      ]);
      const opener = firstTrace === undefined ? undefined : firstTrace ? (() => { const member = memberOfUser.get(firstTrace.actorId); return member ? { memberId: member.id, name: firstName(member.name), at: firstTrace.occurredAt } : null; })() : null;
      const closedIds = closed.map((task) => task.id);
      const [states, taskSessions, comments] = closedIds.length ? await Promise.all([
        db.recognitionTaskState.findMany({ where: { taskId: { in: closedIds } }, select: { taskId: true, originalDueDate: true } }),
        db.taskWorkSession.findMany({ where: { taskId: { in: closedIds }, isCollaborator: false }, select: { taskId: true, workerId: true, durationMs: true, closeReason: true } }),
        db.taskComment.findMany({ where: { taskId: { in: closedIds }, type: 'human' }, select: { taskId: true, authorId: true, createdAt: true } })
      ]) : [[], [], []];
      const originalDue = new Map(states.map((row) => [row.taskId, row.originalDueDate]));
      const overdueAtDawn = new Map((snapshot?.people || []).map((person) => [person.id, Number(person.metrics?.overdue ?? 0)]));
      const byMember = new Map(members.map((member) => [member.id, { memberId: member.id, closedTasks: [], sessions: [], overdueAtDawn: snapshot ? (overdueAtDawn.has(member.id) ? overdueAtDawn.get(member.id) : null) : null, returnedToday: 0, firstOpener: opener }]));
      for (const task of closed) {
        const bucket = byMember.get(task.assigneeId);
        if (!bucket) continue;
        const mine = taskSessions.filter((session) => session.taskId === task.id && session.workerId === task.assigneeId);
        const measuredMs = mine.filter((session) => session.closeReason !== 'DECLARED').reduce((sum, session) => sum + Number(session.durationMs || 0), 0);
        const declared = mine.some((session) => session.closeReason === 'DECLARED');
        const authorId = userOf.get(task.assigneeId);
        const documented = comments.some((comment) => comment.taskId === task.id && comment.authorId === authorId && new Date(comment.createdAt) <= new Date(task.completedAt));
        bucket.closedTasks.push({ id: task.id, title: task.title, completedAt: task.completedAt, dueDate: task.dueDate, originalDueDate: originalDue.get(task.id) || task.dueDate, measuredMs, declared, documented });
      }
      for (const session of daySessions) {
        const bucket = byMember.get(session.workerId);
        if (!bucket) continue;
        const durationMs = session.endedAt ? Number(session.durationMs || 0) : Math.max(0, Math.min(end.getTime(), now().getTime()) - new Date(session.startedAt).getTime());
        bucket.sessions.push({ durationMs, isOverlapping: session.isOverlapping, correctedAt: session.correctedAt, closeReason: session.closeReason });
      }
      for (const task of returned) { const bucket = byMember.get(task.assigneeId); if (bucket) bucket.returnedToday += 1; }
      return { dayKey, members, byMember };
    },

    async evaluateDay(dayKey) {
      const { members, byMember } = await this.readDay(dayKey);
      return members.map((member) => ({ memberId: member.id, ...evaluateLeagueDay({ day: dayKey, ...byMember.get(member.id) }) }));
    },

    async computeAndSave(dayKey) {
      const rows = await this.evaluateDay(dayKey);
      await repo.saveDays(rows.map((row) => ({ day_key: dayKey, member_id: row.memberId, habits: row.habits, extras: row.extras, evidence: row.evidence })));
      return rows.length;
    },

    /** Cada 10 minutos: desde las 18:05 de un día hábil calcula hoy una vez; siempre completa los días hábiles del mes que falten. */
    async runAutomatic() {
      const at = now();
      const today = bogotaDate(at), monthKey = monthOf(today);
      const computed = new Set(await repo.computedDays(monthKey));
      const backfilled = [];
      for (const dayKey of daysOfMonthUntil(monthKey, today)) {
        if (!isBusinessDay(dayKey) || computed.has(dayKey)) continue;
        try { await this.computeAndSave(dayKey); backfilled.push(dayKey); }
        catch (error) { logger.error(`[Liga] No se pudo calcular el ${dayKey}:`, error?.message || error); }
      }
      let computedToday = null;
      if (isBusinessDay(today) && bogotaClock(at).minutes >= LEAGUE_COMPUTE_MINUTES && !computed.has(today)) {
        try { await this.computeAndSave(today); computedToday = today; }
        catch (error) { logger.error('[Liga] No se pudo calcular hoy:', error?.message || error); }
      }
      return { today: computedToday, backfilled };
    },

    /** La liga de una persona: el mes guardado, hoy en vivo, la carrera con su escala, la posición y la bondad. */
    async leagueFor({ userId }) {
      const at = now();
      const today = bogotaDate(at), monthKey = monthOf(today);
      const me = await memberAllowed(userId);
      const [{ members, byMember }, saved, gifts] = await Promise.all([this.readDay(today), repo.daysOfMonth(monthKey, { before: today }), repo.kudosOfMonth(monthKey)]);
      const nameOf = new Map(members.map((member) => [member.id, member.name]));
      const daysByMember = new Map(members.map((member) => [member.id, []]));
      for (const row of saved) daysByMember.get(row.member_id)?.push({ day: row.day_key, habits: row.habits, extras: row.extras || {} });
      const todayByMember = new Map();
      for (const member of members) {
        const live = evaluateLeagueDay({ day: today, ...byMember.get(member.id) });
        todayByMember.set(member.id, live);
        daysByMember.get(member.id).push(live);
      }
      const receivedBy = new Map();
      for (const gift of gifts) receivedBy.set(gift.receiver_member_id, [...(receivedBy.get(gift.receiver_member_id) || []), gift]);
      const scoreOf = (memberId) => leagueScore({ days: daysByMember.get(memberId) || [], kudos: receivedBy.get(memberId) || [] });
      const lanes = members.map((member) => {
        const score = scoreOf(member.id);
        // `pixelAvatarUrl` llegará cuando existan los diseños de OpenAI por persona; mientras tanto la carrera usa la foto.
        return { id: member.id, name: firstName(member.name), fullName: member.name, avatarUrl: member.avatarUrl || null, pixelAvatarUrl: null, score, isSelf: member.id === me.id };
      });
      const ranked = lanes.filter((lane) => typeof lane.score === 'number').sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'es'));
      const myDays = daysByMember.get(me.id) || [];
      const myToday = todayByMember.get(me.id);
      const received = (receivedBy.get(me.id) || []).map((gift) => ({ from: firstName(nameOf.get(gift.giver_member_id) || 'Alguien del equipo'), note: gift.note, week: gift.week_key }));
      const givenThisWeek = gifts.find((gift) => gift.giver_member_id === me.id && gift.week_key === isoWeekKey(today));
      const score = scoreOf(me.id);
      const rank = ranked.findIndex((lane) => lane.id === me.id) + 1;
      const lastDay = lastDayOfMonth(monthKey);
      return {
        month: monthKey,
        closesOn: weekdayLabel(lastDay),
        daysLeft: Math.max(0, Math.round((Date.parse(`${lastDay}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY_MS)),
        score,
        today: myToday ? { ...myToday, ...todayPoints(myToday) } : null,
        nextStep: leagueNextStep(myDays),
        streak: { days: summarizeDays(myDays).fullDays, label: 'con los 5 hábitos' },
        kudos: { received, score: kudosScore(received), givenThisWeek: givenThisWeek ? { id: givenThisWeek.receiver_member_id, name: firstName(nameOf.get(givenThisWeek.receiver_member_id) || ''), note: givenThisWeek.note } : null, weeklyBudget: 10 },
        position: rank ? { rank, of: ranked.length } : null,
        nextStepUrl: '/gestion',
        podium: ranked.slice(0, 3).map((lane) => ({ id: lane.id, name: lane.name, avatarUrl: lane.avatarUrl, pixelAvatarUrl: lane.pixelAvatarUrl, score: lane.score })),
        winner: null,
        race: { lanes, track: trackScale(lanes.map((lane) => lane.score)) }
      };
    },

    /** Regalar los 10 puntos de la semana: a una sola persona del equipo, una vez por semana, con una línea. */
    async giveKudos({ userId, memberId, note = '' }) {
      const at = now();
      const text = String(note || '').trim();
      if (text.length > KUDOS_NOTE_MAX) throw fail(400, `El motivo va en una línea de hasta ${KUDOS_NOTE_MAX} caracteres.`);
      const giver = await memberAllowed(userId);
      if (!memberId || memberId === giver.id) throw fail(400, 'Los 10 puntos se regalan a otra persona, no a ti.');
      const members = await activeMembers();
      const receiver = members.find((member) => member.id === memberId);
      if (!receiver) throw fail(404, 'Esa persona no está en el equipo activo.');
      const weekKey = isoWeekKey(bogotaDate(at));
      try {
        const saved = await repo.giveKudos({ week_key: weekKey, giver_member_id: giver.id, receiver_member_id: receiver.id, note: text });
        return { id: saved.id, weekKey, to: { id: receiver.id, name: firstName(receiver.name) }, note: text };
      } catch (error) {
        if (error?.code === '23505') throw fail(409, 'Esta semana ya regalaste tus 10 puntos. El lunes tienes otros.', 'LEAGUE_KUDOS_ALREADY');
        throw error;
      }
    }
  };
  return service;
};

let instance;
export const getPlatformLeagueService = () => instance ||= createPlatformLeagueService();

export const initPlatformLeagueScheduler = ({ service = getPlatformLeagueService, setIntervalFn = setInterval, setTimeoutFn = setTimeout, logger = console } = {}) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try { await (typeof service === 'function' ? service() : service).runAutomatic(); }
    catch (error) { logger.error('[Liga] El cálculo del día falló:', error?.message || error); }
    finally { running = false; }
  };
  setTimeoutFn(tick, 3 * 60 * 1000)?.unref?.();
  setIntervalFn(tick, LEAGUE_CHECK_MS)?.unref?.();
  logger.log('[Liga] Cálculo de la liga programado (días hábiles desde las 18:05, Bogotá; completa los días que falten).');
  return tick;
};
