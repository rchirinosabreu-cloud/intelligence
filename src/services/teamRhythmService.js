// Ritmo del equipo en el servidor (Rodny, 9 de octubre de 2026). Lee las tareas cerradas de un periodo y las
// sesiones del cronómetro de esas tareas, arma un registro por persona y tarea, y se lo pasa al cálculo puro
// (`src/lib/teamRhythm.js`). Solo lee.
//
// Dos decisiones que importan:
//   - el tiempo va a quien trabajó (`TaskWorkSession.workerId`, un TeamMember), no al responsable actual: una
//     tarea reasignada no le cuenta a la persona nueva las horas de la anterior;
//   - quien cerró la tarea sin cronómetro sigue contando como «cerrada sin medir»: eso es la cobertura.

import prisma from '../lib/prisma.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { analyzeTeamRhythm } from '../lib/teamRhythm.js';
import { buildContextProfiles, recordedWorkHours } from '../lib/workPrediction.js';

export const RHYTHM_PERIODS = [7, 30, 90];
const DAY_MS = 86_400_000;
const FORMATS = { reel: 'Reel', carrusel: 'Carrusel', post: 'Post', video: 'Video', historia: 'Historia', otro: 'Otro' };

/** El tipo de trabajo: el formato de la pieza, el del título de producción, o la categoría de la tarea. */
export const workTypeOf = (task) => {
  const title = String(task?.title || '');
  if (/^\[Publicar\]/i.test(title)) return 'Publicación';
  if (/^(?:revisar|corregir|ajustar|aprobar|guion|redactar\s+(?:el\s+)?guion)\b/i.test(title)) return 'Revisión o guion';
  if (/^\[Parrilla\]/i.test(title) || /\b(?:crear|elaborar|redactar|armar|planear)\s+(?:(?:la|una)\s+)?parrilla\b/i.test(title)) return 'Parrilla';
  if (task?.contentItem && !/^\[Producci[oó]n\]|^(?:(?:crear|editar|diseñar|producir)\s+(?:(?:un|una|el|la)\s+)?)?(?:reel|carrusel|post|video|historia)\b/i.test(title)) return task.aiCategory || 'Sin clasificar';
  const format = String(task?.contentItem?.format || title.match(/^\[Producci[oó]n\]\s*([^:]+):/i)?.[1] || title.match(/^(?:(?:crear|editar|diseñar|producir)\s+(?:(?:un|una|el|la)\s+)?)?(reel|carrusel|post|video|historia)\b/i)?.[1] || '').trim();
  if (format) return FORMATS[format.toLowerCase()] || format.slice(0, 40);
  return task?.aiCategory && !/^(sin clasificar|ia_desactivada)$/i.test(task.aiCategory) ? task.aiCategory : 'Sin clasificar';
};

const sessionMs = (session) => {
  const ms = session.durationMs != null ? Number(session.durationMs) : session.endedAt && session.startedAt ? new Date(session.endedAt) - new Date(session.startedAt) : 0;
  return Number.isFinite(ms) && ms >= 0 ? ms : 0;
};

/** Un registro por persona y tarea: tiempo medido, retrabajo y sesión más larga. */
export const buildRhythmRecords = ({ tasks = [], sessions = [], members = [] }) => {
  const names = new Map(members.map((member) => [member.id, member.name]));
  const byTask = new Map();
  for (const session of sessions) byTask.set(session.taskId, [...(byTask.get(session.taskId) || []), session]);
  const records = [];
  for (const task of tasks) {
    const base = { taskId: task.id, id: task.id, title: task.title, workType: workTypeOf(task), completedDay: bogotaDate(task.completedAt),
      clientId: task.clientId || null, clientName: task.client?.name || null, complexity: task.aiComplexity || null, isPrivate: Boolean(task.isPrivate) };
    const own = byTask.get(task.id) || [];
    const byWorker = new Map();
    for (const session of own) if (session.workerId) byWorker.set(session.workerId, [...(byWorker.get(session.workerId) || []), session]);
    for (const [workerId, all] of byWorker) {
      // Una sesión abierta mientras la misma persona tenía otra corriendo (varias tareas movidas a «En proceso»
      // a la vez) repite el mismo tiempo: no se suma, se cuenta aparte.
      const rows = all.filter((row) => !row.isOverlapping);
      const durations = rows.map(sessionMs);
      // Tiempo declarado al cerrar sin reloj (9 de octubre de 2026): cuenta como medido, pero se dice aparte y no
      // es una sesión que alguien dejó corriendo.
      const declaredMs = rows.filter((row) => row.closeReason === 'DECLARED').reduce((sum, row) => sum + sessionMs(row), 0);
      records.push({ ...base, personId: workerId, personName: names.get(workerId) || (workerId === task.assigneeId ? task.assignee?.name : null) || 'Sin nombre',
        timingIncomplete: rows.some(row => !row.endedAt || !row.startedAt || !Number.isFinite(new Date(row.endedAt) - new Date(row.startedAt)) || new Date(row.endedAt) <= new Date(row.startedAt) || (row.durationMs != null && (!Number.isFinite(Number(row.durationMs)) || Number(row.durationMs) < 0))),
        isCollaborator: all.every(row => row.isCollaborator), partialResponsibility: workerId !== task.assigneeId || own.some(row => row.isCollaborator) || new Set(own.filter(row => !row.isCollaborator).map(row => row.workerId)).size > 1,
        measuredMs: durations.reduce((sum, ms) => sum + ms, 0),
        declaredMs,
        reworkMs: rows.filter((row) => row.cycle?.kind && row.cycle.kind !== 'INITIAL').reduce((sum, row) => sum + sessionMs(row), 0),
        longestSessionMs: Math.max(0, ...rows.filter((row) => row.closeReason !== 'DECLARED').map(sessionMs)),
        overlappedMs: all.filter((row) => row.isOverlapping).reduce((sum, row) => sum + sessionMs(row), 0) });
    }
    // Quien la cerró sin cronómetro cuenta como cerrada sin medir; las tareas anteriores a las sesiones conservan
    // el tiempo acumulado que ya tenían.
    if (task.assigneeId && !byWorker.has(task.assigneeId)) {
      const legacy = own.length ? 0 : Number(task.accumulatedWorkMs) || 0;
      records.push({ ...base, timingIncomplete: true, personId: task.assigneeId, personName: task.assignee?.name || names.get(task.assigneeId) || 'Sin nombre', measuredMs: legacy, reworkMs: 0, longestSessionMs: 0, overlappedMs: 0 });
    }
  }
  return records;
};

export const createTeamRhythmService = ({ db = prisma, now = () => new Date() } = {}) => ({
  async get({ days = 30, includeHours = true } = {}) {
    const period = RHYTHM_PERIODS.includes(Number(days)) ? Number(days) : 30;
    const to = now();
    const from = new Date(to.getTime() - period * DAY_MS);
    const tasks = await db.task.findMany({
      where: { status: 'REALIZADA', completedAt: { gte: from, lte: to } },
      select: { id: true, title: true, completedAt: true, assigneeId: true, accumulatedWorkMs: true, aiCategory: true, aiComplexity: true, clientId: true, isPrivate: true,
        client: { select: { name: true } }, assignee: { select: { id: true, name: true } }, contentItem: { select: { format: true } } },
      orderBy: { completedAt: 'desc' },
      take: 3000
    });
    const ids = tasks.map((task) => task.id);
    const sessions = ids.length ? await db.taskWorkSession.findMany({
      where: { taskId: { in: ids } },
      select: { taskId: true, workerId: true, isCollaborator: true, isOverlapping: true, closeReason: true, durationMs: true, startedAt: true, endedAt: true, cycle: { select: { kind: true } } }
    }) : [];
    const periodSessions = includeHours ? await db.taskWorkSession.findMany({
      where: { startedAt: { lt: to }, OR: [{ endedAt: { gte: from } }, { endedAt: null }] },
      select: { id: true, workerId: true, startedAt: true, endedAt: true, durationMs: true, isOverlapping: true, closeReason: true },
      orderBy: { startedAt: 'desc' }, take: 10001
    }) : [];
    const workerIds = [...new Set([...sessions.map((s) => s.workerId), ...periodSessions.map(s => s.workerId), ...tasks.map((t) => t.assigneeId)].filter(Boolean))];
    const members = workerIds.length ? await db.teamMember.findMany({ where: { id: { in: workerIds } }, select: { id: true, name: true, avatarUrl: true } }) : [];
    const records = buildRhythmRecords({ tasks, sessions, members });
    const analysis = analyzeTeamRhythm({ tasks: records });
    const photos = new Map(members.map((member) => [member.id, member.avatarUrl || null]));
    // El cierre no dice cuándo se trabajó; una categoría tampoco garantiza cliente/complejidad iguales.
    const people = analysis.people.map((person) => ({ ...person, avatarUrl: photos.get(person.personId) || null,
      findings: person.findings.filter(f => !['HEAVY_DAY','LONG_DAY','SLOWER_THAN_TEAM','FASTER_THAN_TEAM'].includes(f.kind)),
      byType: person.byType.map(({ teamMedianMs: _teamMedianMs, ...type }) => type) }));
    const { types } = analysis;
    const closed = people.reduce((sum, person) => sum + person.closed, 0);
    const measured = people.reduce((sum, person) => sum + person.measured, 0);
    const declared = people.reduce((sum, person) => sum + (person.declared || 0), 0);
    // Lo que respalda cada hallazgo, para que la pantalla y Bria nombren las tareas.
    const wanted = new Set(people.flatMap((person) => person.findings.flatMap((finding) => finding.taskIds)));
    const taskMap = {};
    for (const record of records) {
      if (!wanted.has(record.taskId) || taskMap[record.taskId]) continue;
      taskMap[record.taskId] = { title: record.title, workType: record.workType, day: record.completedDay, personName: record.personName, measuredMs: record.measuredMs };
    }
    const names = new Map(members.map(m => [m.id, m.name]));
    return { period: { days: period, from: from.toISOString(), to: to.toISOString() }, team: { closed, measured, declared, coverage: closed ? measured / closed : 0 }, people, types, tasks: taskMap,
      profiles: buildContextProfiles(records), historyIncomplete: tasks.length >= 3000, hoursIncomplete: periodSessions.length > 10000,
      hours: recordedWorkHours({ sessions: periodSessions, from, now: to }).map(row => ({ ...row, personName: names.get(row.personId) || 'Sin nombre' })) };
  }
});

export const teamRhythmService = createTeamRhythmService();
