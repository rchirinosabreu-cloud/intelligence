// La liga del mes en el servidor (2 de noviembre de 2026). Cada día hábil a las 18:05 de Bogotá se evalúan los cinco
// puntos de cada persona con lo que la plataforma ya registra (`src/lib/leagueDay.js`) y se guardan en la base
// lateral; solo se completan días desde el nuevo inicio persistido. Los extras del día se leen de la traza operativa: la primera huella
// humana desde las 8:00 es «primero en abrir»; «primero en la reunión» se suma desde el registro separado del administrador.
// La copa lee el mes guardado más «hoy» en vivo, la carrera de todo el equipo, la posición y la bondad. Solo lee y
// cuenta: no cambia nada en la plataforma ni le escribe a nadie.

import prisma from '../lib/prisma.js';
import { bogotaDate, isBusinessDay } from '../lib/colombiaBusinessDays.js';
import { bogotaClock } from '../lib/briaNudges.js';
import { evaluateLeagueDay, isoWeekKey, openWindowOf } from '../lib/leagueDay.js';
import { KUDOS_WEEKLY, MEETING_POINTS, RECOGNITION_POINTS, LEAGUE_RECOGNITION_KINDS, kudosScore, leagueRank, leaguePodiumGroups, leagueNextStep, leagueScore, summarizeDays, todayPoints, trackScale } from '../lib/platformLeague.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { canUseLeague } from '../lib/leagueVisibility.js';
import { resolveLeagueAvatarKeys } from '../lib/leagueAvatarIdentity.js';
import { hasModulePermission } from '../config/security.js';
import { createDailyReadingRepository } from './dailyReadingRepository.js';
import { createPlatformLeagueRepository } from './platformLeagueRepository.js';
import { snapshotOverdueCount } from '../lib/taskDeadlines.js';
import { hasTaskParticipations, taskParticipations } from '../lib/taskParticipation.js';
import { completedTaskParticipationViews, completedTaskParticipationWhere, taskParticipationSelect } from '../lib/taskParticipationMetrics.js';

export const LEAGUE_COMPUTE_MINUTES = 18 * 60 + 5;
export const LEAGUE_CHECK_MS = 10 * 60 * 1000;
/** Una huella humana en la traza operativa: lo que deja una persona al usar la plataforma (nunca un reloj ni una réplica). */
export const PRESENCE_EVENTS = ['SESSION_STARTED', 'TASK_OPENED', 'TASK_LIST_SYNCED', 'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_UPDATED', 'TASK_PARTICIPATION_CHANGED', 'NOTIFICATION_READ', 'PLATFORM_MUTATION'];

const KUDOS_NOTE_MAX = 120;
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
    const me = await db.teamMember.findUnique({ where: { userId }, select: { id: true, name: true, isActive: true, user: { select: { role: true, isActive: true, modulePermissions: true } } } });
    if (!me || me.isActive === false) throw fail(404, 'Esta cuenta no tiene ficha activa en Equipo.');
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
      const startedAt = await repo.startedAt();
      const window = dayWindow(dayKey);
      if (window.end <= startedAt) throw new Error('El día es anterior al inicio de la liga.');
      const start = new Date(Math.max(window.start.getTime(), startedAt.getTime())), end = window.end;
      const launchDay = bogotaDate(startedAt) === dayKey;
      const members = await activeMembers();
      const memberOfUser = new Map(members.map((member) => [member.user.id, member]));
      const open = openWindowOf(dayKey);
      const [closed, daySessions, returned, snapshot, firstTrace, created] = await Promise.all([
        db.task.findMany({ where: completedTaskParticipationWhere({ gte: start, lt: end }), select: {
          id: true, title: true, status: true, assigneeId: true, completedAt: true, dueDate: true, ...taskParticipationSelect
        } }),
        db.taskWorkSession.findMany({ where: { OR: [{ endedAt: { gte: start, lt: end } }, { endedAt: null, startedAt: { gte: startedAt, lt: end } }] }, select: { workerId: true, durationMs: true, isOverlapping: true, correctedAt: true, closeReason: true, startedAt: true, endedAt: true } }),
        db.task.findMany({ where: { OR: [
          { returnedAt: { gte: start, lt: end } },
          { assigneeReturnedAt: { gte: start, lt: end } },
          { collaborators: { some: { returnedAt: { gte: start, lt: end } } } }
        ] }, select: { id: true, status: true, assigneeId: true, returnedAt: true, ...taskParticipationSelect } }),
        startedAt > new Date(`${dayKey}T11:00:00Z`) ? null : snaps.snapshot(dayKey).catch((error) => { logger.error('[Liga] Sin la foto de las 6:00:', error?.message || error); return null; }),
        // Primero en abrir: la primera huella humana en la traza operativa desde las 8:00 de Bogotá. Sin lectura, nada se asume.
        db.operationalTraceEvent.findFirst({ where: { occurredAt: { gte: open.start, lt: open.end }, actorId: { in: [...memberOfUser.keys()] }, eventType: { in: PRESENCE_EVENTS } }, orderBy: { occurredAt: 'asc' }, select: { actorId: true, occurredAt: true } })
          .catch((error) => { logger.error('[Liga] Sin lectura de quién abrió primero:', error?.message || error); return undefined; }),
        db.task.findMany({ where: { createdAt: { gte: start, lt: end }, creatorId: { in: [...memberOfUser.keys()] } }, select: {
          id: true, creatorId: true, comments: true,
          taskComments: { where: { type: 'human', createdAt: { lt: end } }, select: { content: true } },
          taskAttachments: { where: { purgeState: 'ACTIVE', createdAt: { lt: end } }, select: { id: true } }
        } })
      ]);
      // Un primero anterior al reinicio no convierte al segundo en ganador.
      const opener = firstTrace === undefined ? undefined : firstTrace && new Date(firstTrace.occurredAt) >= startedAt ? (() => { const member = memberOfUser.get(firstTrace.actorId); return member ? { memberId: member.id, name: firstName(member.name), at: firstTrace.occurredAt } : null; })() : null;
      const closedIds = closed.map((task) => task.id);
      const [states, taskSessions] = closedIds.length ? await Promise.all([
        db.recognitionTaskState.findMany({ where: { taskId: { in: closedIds } }, select: { taskId: true, originalDueDate: true } }),
        db.taskWorkSession.findMany({ where: { taskId: { in: closedIds } }, select: { taskId: true, workerId: true, durationMs: true, closeReason: true } })
      ]) : [[], []];
      const originalDue = new Map(states.map((row) => [row.taskId, row.originalDueDate]));
      const overdueAtDawn = new Map((snapshot?.people || []).map((person) => [person.id, snapshotOverdueCount(person.metrics, dayKey)]));
      const byMember = new Map(members.map((member) => [member.id, { memberId: member.id, closedTasks: [], createdTasks: [], sessions: [], overdueAtDawn: overdueAtDawn.get(member.id) ?? null,
        dawnEvidenceReason: overdueAtDawn.has(member.id) && overdueAtDawn.get(member.id) === null ? 'La foto de la mañana no permite comprobar las fechas de entrega. Este hábito queda sin evaluar.' : null,
        returnedToday: 0, firstOpener: opener }]));
      for (const task of created) {
        const bucket = byMember.get(memberOfUser.get(task.creatorId)?.id);
        if (bucket) bucket.createdTasks.push({ id: task.id, documented: Boolean(String(task.comments || '').trim()) || task.taskComments.some(comment => String(comment.content || '').trim()) || task.taskAttachments.length > 0 });
      }
      const occurredToday = value => value && new Date(value) >= start && new Date(value) < end;
      for (const task of closed.flatMap(completedTaskParticipationViews).filter(task => occurredToday(task.completedAt))) {
        const bucket = byMember.get(task.assigneeId);
        if (!bucket) continue;
        const mine = taskSessions.filter((session) => session.taskId === task.id && session.workerId === task.assigneeId);
        const measuredMs = mine.filter((session) => session.closeReason !== 'DECLARED').reduce((sum, session) => sum + Number(session.durationMs || 0), 0);
        const declared = mine.some((session) => session.closeReason === 'DECLARED');
        bucket.closedTasks.push({ id: task.id, title: task.title, completedAt: task.completedAt, dueDate: task.dueDate, originalDueDate: originalDue.get(task.id) || task.dueDate, measuredMs, declared });
      }
      for (const session of daySessions) {
        const bucket = byMember.get(session.workerId);
        if (!bucket) continue;
        const durationMs = session.endedAt ? Number(session.durationMs || 0) : Math.max(0, Math.min(end.getTime(), now().getTime()) - new Date(session.startedAt).getTime());
        bucket.sessions.push({ durationMs, isOverlapping: session.isOverlapping, correctedAt: session.correctedAt, closeReason: session.closeReason });
      }
      for (const task of returned) {
        const participants = hasTaskParticipations(task) ? taskParticipations(task) : [{ memberId: task.assigneeId, returnedAt: task.returnedAt }];
        for (const participant of participants) {
          const bucket = byMember.get(participant.memberId);
          if (bucket && occurredToday(participant.returnedAt)) bucket.returnedToday += 1;
        }
      }
      // El primer día necesita actividad nueva para no conceder puntos al instante del reinicio.
      if (launchDay) for (const bucket of byMember.values()) {
        if (!bucket.closedTasks.length && !bucket.createdTasks.length && !bucket.sessions.length && !bucket.returnedToday) bucket.returnedToday = null;
      }
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
      const firstDay = bogotaDate(await repo.startedAt());
      const computed = new Set(await repo.computedDays(monthKey));
      const backfilled = [];
      for (const dayKey of daysOfMonthUntil(monthKey, today)) {
        if (dayKey < firstDay || !isBusinessDay(dayKey) || computed.has(dayKey)) continue;
        try { await this.computeAndSave(dayKey); backfilled.push(dayKey); }
        catch (error) { logger.error(`[Liga] No se pudo calcular el ${dayKey}:`, error?.message || error); }
      }
      let computedToday = null;
      if (today >= firstDay && isBusinessDay(today) && bogotaClock(at).minutes >= LEAGUE_COMPUTE_MINUTES && !computed.has(today)) {
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
      const startedAt = await repo.startedAt();
      const weekKey = isoWeekKey(today);
      const [year, monthNumber] = monthKey.split('-').map(Number);
      const [{ members, byMember }, saved, gifts, given, meetings, awards] = await Promise.all([
        this.readDay(today), repo.daysOfMonth(monthKey, { before: bogotaDate(dayWindow(today).end) }), repo.kudosOfMonth(monthKey), repo.givenInWeek(me.id, weekKey), repo.meetingsOfMonth(monthKey),
        db.recognitionAward.findMany({ where: { kind: { in: LEAGUE_RECOGNITION_KINDS }, occurredAt: {
          gte: new Date(Math.max(Date.parse(`${monthKey}-01T05:00:00Z`), startedAt.getTime())), lt: new Date(Date.UTC(year, monthNumber, 1, 5))
        } }, select: { id: true, recipientId: true, occurredAt: true } })
      ]);
      const nameOf = new Map(members.map((member) => [member.id, member.name]));
      const daysByMember = new Map(members.map((member) => [member.id, []]));
      const savedToday = new Map();
      for (const row of saved) {
        const entry = { day: row.day_key, habits: row.habits, extras: row.extras || {}, evidence: row.evidence || {} };
        daysByMember.get(row.member_id)?.push(entry);
        if (row.day_key === today) savedToday.set(row.member_id, entry);
      }
      const todayByMember = new Map();
      for (const member of members) {
        const closed = savedToday.get(member.id);
        const current = closed || evaluateLeagueDay({ day: today, ...(isBusinessDay(today) ? byMember.get(member.id) : {}) });
        todayByMember.set(member.id, { ...current, isProvisional: isBusinessDay(today) && !closed, isConfirmed: Boolean(closed) });
        if (!closed) daysByMember.get(member.id).push(current);
      }
      const receivedBy = new Map();
      for (const gift of gifts) receivedBy.set(gift.receiver_member_id, [...(receivedBy.get(gift.receiver_member_id) || []), gift]);
      const userOfMember = new Map(members.map(member => [member.id, member.user.id]));
      const awardsOf = memberId => awards.filter(award => award.recipientId === userOfMember.get(memberId));
      const scoreOf = (memberId) => leagueScore({ days: daysByMember.get(memberId) || [], kudos: receivedBy.get(memberId) || [],
        meetings: meetings.filter(meeting => meeting.member_id === memberId).length, recognitions: awardsOf(memberId).length }) ?? 0;
      const avatarKeys = resolveLeagueAvatarKeys(members);
      const lanes = members.map((member) => {
        const score = scoreOf(member.id);
        const current = todayByMember.get(member.id);
        const provisional = current.isProvisional ? summarizeDays([current]).points : 0;
        return { id: member.id, name: firstName(member.name), fullName: member.name, avatarUrl: member.avatarUrl || null, pixelAvatarKey: avatarKeys[member.id] || null, score,
          scoreBreakdown: { confirmed: score - provisional, provisional }, isSelf: member.id === me.id };
      });
      const ranked = lanes.filter((lane) => typeof lane.score === 'number').sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'es'));
      const myDays = daysByMember.get(me.id) || [];
      // Manual meeting awards remain separate from daily snapshots, so a late admin entry counts immediately
      // without rewriting historical habits or adding the award a second time in the month total.
      const meetingToday = meetings.find(meeting => meeting.day_key === today);
      const rawToday = todayByMember.get(me.id);
      const myToday = rawToday ? { ...rawToday, extras: { ...rawToday.extras, PRIMERO_EN_REUNION: meetingToday ? meetingToday.member_id === me.id : null },
        evidence: { ...rawToday.evidence, PRIMERO_EN_REUNION: meetingToday ? `Registrado por un administrador: ${firstName(nameOf.get(meetingToday.member_id) || '')}.` : 'Pendiente de registro del administrador.' } } : null;
      const todayAwardPoints = awardsOf(me.id).filter(award => bogotaDate(award.occurredAt) === today).length * RECOGNITION_POINTS;
      const todayGiftPoints = kudosScore((receivedBy.get(me.id) || []).filter(gift => bogotaDate(gift.created_at) === today));
      const todaySummary = todayPoints(myToday);
      const received = (receivedBy.get(me.id) || []).map((gift) => ({ from: firstName(nameOf.get(gift.giver_member_id) || 'Alguien del equipo'), note: gift.note, week: gift.week_key, points: gift.points }));
      const score = scoreOf(me.id);
      const rank = leagueRank(score, ranked);
      const lastDay = lastDayOfMonth(monthKey);
      return {
        month: monthKey,
        startsAt: startedAt.toISOString(),
        closesOn: weekdayLabel(lastDay),
        daysLeft: Math.max(0, Math.round((Date.parse(`${lastDay}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / DAY_MS)),
        score,
        scoreBreakdown: lanes.find(lane => lane.isSelf)?.scoreBreakdown,
        today: myToday ? { ...myToday, ...todaySummary, points: todaySummary.points + todayAwardPoints + todayGiftPoints } : null,
        recognitionPoints: awardsOf(me.id).length * RECOGNITION_POINTS,
        meetings: { canManage: me.user.role === 'ADMIN', minDate: [bogotaDate(startedAt), `${monthKey}-01`].sort().at(-1), maxDate: today,
          entries: meetings.map(meeting => ({ date: meeting.day_key, weekKey: meeting.week_key, memberId: meeting.member_id, name: firstName(nameOf.get(meeting.member_id) || 'Alguien del equipo'), points: MEETING_POINTS })) },
        nextStep: leagueNextStep(myDays),
        streak: { days: summarizeDays(myDays).fullDays, label: 'con los 5 hábitos' },
        kudos: { received, score: kudosScore(received), weekKey, givenThisWeek: given ? { id: given.receiver_member_id, name: firstName(nameOf.get(given.receiver_member_id) || 'Alguien del equipo'), note: given.note } : null, weeklyBudget: KUDOS_WEEKLY },
        position: score > 0 && rank ? { rank, of: ranked.length } : null,
        nextStepUrl: '/gestion',
        podium: leaguePodiumGroups(ranked).flatMap(group => group.people.map(lane => ({ id: lane.id, name: lane.name, avatarUrl: lane.avatarUrl, pixelAvatarKey: lane.pixelAvatarKey, score: lane.score, rank: group.rank }))),
        winner: null,
        race: { lanes, track: trackScale(lanes.map((lane) => lane.score)) }
      };
    },

    /** Colección personal del mes. No reclama premios, no los marca vistos y no expone tareas ni clientes. */
    async recognitionsFor({ userId }) {
      const me = await memberAllowed(userId);
      const month = monthOf(bogotaDate(now()));
      const startedAt = await repo.startedAt();
      const [year, monthNumber] = month.split('-').map(Number);
      const kinds = [];
      if (hasModulePermission(me.user, 'gestion')) kinds.push('FIRST_TASK', 'EARLY_DELIVERY', 'DAILY_EIGHT', 'CAUGHT_UP', 'WEEKLY_FIFTY');
      if (hasModulePermission(me.user, 'parrillas')) kinds.push('PLAN_APPROVED');
      if (!kinds.length) return { month, counts: {}, total: 0, recent: [], hasMore: false };
      const where = { recipientId: userId, kind: { in: kinds }, occurredAt: {
        gte: new Date(Math.max(Date.parse(`${month}-01T05:00:00.000Z`), startedAt.getTime())),
        lt: new Date(Date.UTC(year, monthNumber, 1, 5)),
      } };
      const [groups, rows] = await Promise.all([
        db.recognitionAward.groupBy({ by: ['kind'], where, _count: { _all: true } }),
        db.recognitionAward.findMany({ where, select: { id: true, kind: true, occurredAt: true }, orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }], take: 13 }),
      ]);
      const counts = Object.fromEntries(groups.map((row) => [row.kind, row._count._all]));
      return { month, counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0), recent: rows.slice(0, 12), hasMore: rows.length > 12 };
    },

    /** Regalar cinco puntos una vez por semana ISO de Bogotá. */
    async giveKudos({ userId, memberId, note = '' }) {
      const at = now();
      const text = String(note || '').trim();
      if (text.length > KUDOS_NOTE_MAX) throw fail(400, `El motivo va en una línea de hasta ${KUDOS_NOTE_MAX} caracteres.`);
      const giver = await memberAllowed(userId);
      if (!memberId || memberId === giver.id) throw fail(400, 'Los puntos se regalan a otra persona, no a ti.');
      const members = await activeMembers();
      const receiver = members.find((member) => member.id === memberId);
      if (!receiver) throw fail(404, 'Esa persona no está en el equipo activo.');
      const weekKey = isoWeekKey(bogotaDate(at));
      try {
        const saved = await repo.giveKudos({ week_key: weekKey, created_at: at, giver_member_id: giver.id, receiver_member_id: receiver.id, note: text });
        return { id: saved.id, weekKey, points: KUDOS_WEEKLY, to: { id: receiver.id, name: firstName(receiver.name) }, note: text };
      } catch (error) {
        if (error?.code === '23505') throw fail(409, 'Esta semana ya regalaste tus puntos. El lunes tendrás cinco más.', 'LEAGUE_KUDOS_ALREADY');
        throw error;
      }
    },
    async awardMeeting({ userId, memberId, day }) {
      const actor = await memberAllowed(userId);
      if (actor.user.role !== 'ADMIN') throw fail(403, 'Solo un administrador puede registrar la reunión de tráfico.');
      const today = bogotaDate(now());
      const start = bogotaDate(await repo.startedAt());
      if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(`${day}T12:00:00Z`)) || new Date(`${day}T12:00:00Z`).toISOString().slice(0,10) !== day || day > today || day < start || monthOf(day) !== monthOf(today)) throw fail(400, 'Elige una fecha transcurrida de este mes, desde el inicio de la liga.');
      const receiver = (await activeMembers()).find(member => member.id === memberId);
      if (!receiver) throw fail(404, 'Esa persona no está en el equipo activo.');
      try {
        const saved = await repo.awardMeeting({ week_key: isoWeekKey(day), day_key: day, member_id: memberId, awarded_by: userId });
        return { id: saved.id, name: firstName(receiver.name), points: MEETING_POINTS };
      } catch (error) {
        if (error?.code === '23505') throw fail(409, 'Ya hay una persona reconocida en la reunión de esa semana.', 'LEAGUE_MEETING_ALREADY');
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
