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

export const RHYTHM_PERIODS = [7, 30, 90];
const DAY_MS = 86_400_000;
const FORMATS = { reel: 'Reel', carrusel: 'Carrusel', post: 'Post', video: 'Video', historia: 'Historia', otro: 'Otro' };

/** El tipo de trabajo: el formato de la pieza, el del título de producción, o la categoría de la tarea. */
export const workTypeOf = (task) => {
  const title = String(task?.title || '');
  if (/^\[Publicar\]/i.test(title)) return 'Publicación';
  const format = String(task?.contentItem?.format || title.match(/^\[Producci[oó]n\]\s*([^:]+):/i)?.[1] || '').trim();
  if (format) return FORMATS[format.toLowerCase()] || format.slice(0, 40);
  return task?.aiCategory && !/^(sin clasificar|ia_desactivada)$/i.test(task.aiCategory) ? task.aiCategory : 'Sin clasificar';
};

const sessionMs = (session) => Number(session.durationMs) || (session.endedAt && session.startedAt ? new Date(session.endedAt) - new Date(session.startedAt) : 0);

/** Un registro por persona y tarea: tiempo medido, retrabajo y sesión más larga. */
export const buildRhythmRecords = ({ tasks = [], sessions = [], members = [] }) => {
  const names = new Map(members.map((member) => [member.id, member.name]));
  const byTask = new Map();
  for (const session of sessions) byTask.set(session.taskId, [...(byTask.get(session.taskId) || []), session]);
  const records = [];
  for (const task of tasks) {
    const base = { taskId: task.id, id: task.id, title: task.title, workType: workTypeOf(task), completedDay: bogotaDate(task.completedAt) };
    const own = byTask.get(task.id) || [];
    const byWorker = new Map();
    for (const session of own) if (session.workerId) byWorker.set(session.workerId, [...(byWorker.get(session.workerId) || []), session]);
    for (const [workerId, all] of byWorker) {
      // Una sesión abierta mientras la misma persona tenía otra corriendo (varias tareas movidas a «En proceso»
      // a la vez) repite el mismo tiempo: no se suma, se cuenta aparte.
      const rows = all.filter((row) => !row.isOverlapping);
      const durations = rows.map(sessionMs);
      records.push({ ...base, personId: workerId, personName: names.get(workerId) || (workerId === task.assigneeId ? task.assignee?.name : null) || 'Sin nombre',
        measuredMs: durations.reduce((sum, ms) => sum + ms, 0),
        reworkMs: rows.filter((row) => row.cycle?.kind && row.cycle.kind !== 'INITIAL').reduce((sum, row) => sum + sessionMs(row), 0),
        longestSessionMs: Math.max(0, ...durations),
        overlappedMs: all.filter((row) => row.isOverlapping).reduce((sum, row) => sum + sessionMs(row), 0) });
    }
    // Quien la cerró sin cronómetro cuenta como cerrada sin medir; las tareas anteriores a las sesiones conservan
    // el tiempo acumulado que ya tenían.
    if (task.assigneeId && !byWorker.has(task.assigneeId)) {
      const legacy = own.length ? 0 : Number(task.accumulatedWorkMs) || 0;
      records.push({ ...base, personId: task.assigneeId, personName: task.assignee?.name || names.get(task.assigneeId) || 'Sin nombre', measuredMs: legacy, reworkMs: 0, longestSessionMs: 0, overlappedMs: 0 });
    }
  }
  return records;
};

export const createTeamRhythmService = ({ db = prisma, now = () => new Date() } = {}) => ({
  async get({ days = 30 } = {}) {
    const period = RHYTHM_PERIODS.includes(Number(days)) ? Number(days) : 30;
    const to = now();
    const from = new Date(to.getTime() - period * DAY_MS);
    const tasks = await db.task.findMany({
      where: { status: 'REALIZADA', completedAt: { gte: from } },
      select: { id: true, title: true, completedAt: true, assigneeId: true, accumulatedWorkMs: true, aiCategory: true, assignee: { select: { id: true, name: true } }, contentItem: { select: { format: true } } },
      orderBy: { completedAt: 'desc' },
      take: 3000
    });
    const ids = tasks.map((task) => task.id);
    const sessions = ids.length ? await db.taskWorkSession.findMany({
      where: { taskId: { in: ids } },
      select: { taskId: true, workerId: true, isCollaborator: true, isOverlapping: true, durationMs: true, startedAt: true, endedAt: true, cycle: { select: { kind: true } } }
    }) : [];
    const workerIds = [...new Set([...sessions.map((s) => s.workerId), ...tasks.map((t) => t.assigneeId)].filter(Boolean))];
    const members = workerIds.length ? await db.teamMember.findMany({ where: { id: { in: workerIds } }, select: { id: true, name: true, avatarUrl: true } }) : [];
    const records = buildRhythmRecords({ tasks, sessions, members });
    const analysis = analyzeTeamRhythm({ tasks: records });
    const photos = new Map(members.map((member) => [member.id, member.avatarUrl || null]));
    const people = analysis.people.map((person) => ({ ...person, avatarUrl: photos.get(person.personId) || null }));
    const { types } = analysis;
    const closed = people.reduce((sum, person) => sum + person.closed, 0);
    const measured = people.reduce((sum, person) => sum + person.measured, 0);
    // Lo que respalda cada hallazgo, para que la pantalla y Bria nombren las tareas.
    const wanted = new Set(people.flatMap((person) => person.findings.flatMap((finding) => finding.taskIds)));
    const taskMap = {};
    for (const record of records) {
      if (!wanted.has(record.taskId) || taskMap[record.taskId]) continue;
      taskMap[record.taskId] = { title: record.title, workType: record.workType, day: record.completedDay, personName: record.personName, measuredMs: record.measuredMs };
    }
    return { period: { days: period, from: from.toISOString(), to: to.toISOString() }, team: { closed, measured, coverage: closed ? measured / closed : 0 }, people, types, tasks: taskMap };
  }
});

export const teamRhythmService = createTeamRhythmService();
