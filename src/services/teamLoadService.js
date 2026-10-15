// Mapa de carga en el servidor (10 de octubre de 2026): tareas abiertas por persona y día hábil, con las horas que
// suele tomar cada tipo de trabajo según Ritmo (90 días). Solo lee.

import prisma from '../lib/prisma.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { buildLoadMap, loadSignals, LOAD_DAYS } from '../lib/teamLoad.js';
import { workTypeOf, teamRhythmService } from './teamRhythmService.js';
import { buildTeamForecast } from '../lib/teamForecast.js';
import { classifyTaskDeterministically } from './deterministicTaskClassifier.js';
import { publishAtIso } from '../lib/socialPublishing.js';
import { canOpenTask, TASK_PRIVACY_SELECT } from '../lib/taskPrivacy.js';
import { RHYTHM_POLICY } from '../lib/workPrediction.js';

const OPEN_STATUSES = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
const invalid = (message, status = 400) => Object.assign(new Error(message), { status });

function loadTask(task) {
  const dueDay = task.dueDate ? bogotaDate(task.dueDate) : null;
  const piece = !task.isPrivate && task.contentItem?.status !== 'PUBLICADO' ? task.contentItem : null;
  const publishAt = piece ? publishAtIso(piece.publishDate, piece.publishTime) : null;
  const publishDay = piece ? publishAtIso(piece.publishDate, '00:00')?.slice(0, 10) : null;
  const coarseDays = [dueDay, !publishAt && publishDay].filter(Boolean).sort();
  const coarseDay = coarseDays[0] || null;
  const choices = [task.focusDeadlineAt, publishAt].filter(Boolean).map(value => new Date(value).getTime()).filter(Number.isFinite);
  let instant = choices.length ? new Date(Math.min(...choices)).toISOString() : null;
  if (instant && coarseDay && coarseDay < bogotaDate(instant)) instant = null;
  // Un día sin hora limita el compromiso sin presentarse como una hora exacta de publicación.
  return { id: task.id, title: task.title, status: task.status, personId: task.assigneeId, clientId: task.clientId || null,
    workType: workTypeOf(task.isPrivate ? { title: task.title } : task), complexity: task.isPrivate ? null : task.aiComplexity || null,
    sharedWork: Boolean(task.collaborators?.length),
    workSessions: task.workSessions || [], dueDay: instant ? bogotaDate(instant) : coarseDay,
    deadlineAt: instant, deadlineSource: instant ? publishAt && instant === new Date(publishAt).toISOString() ? 'publicacion' : 'compromiso' : publishDay && coarseDay === publishDay ? 'publicacion_fecha' : 'fecha',
    clientName: task.client?.name || null };
}

export const createTeamLoadService = ({ db = prisma, rhythm = teamRhythmService, now = () => new Date(), days = LOAD_DAYS } = {}) => {
  const context = async ({ includeHours = true } = {}) => {
    const instant = now();
    const today = bogotaDate(instant);
    const [members, tasks, rhythmData] = await Promise.all([
      db.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true, avatarUrl: true }, orderBy: { name: 'asc' } }),
      db.task.findMany({
        where: { status: { in: OPEN_STATUSES }, assigneeId: { not: null } },
        select: { id: true, title: true, status: true, dueDate: true, focusDeadlineAt: true, isPrivate: true, assigneeId: true, aiCategory: true, aiComplexity: true, clientId: true,
          contentItem: { select: { format: true, publishDate: true, publishTime: true, status: true } }, client: { select: { name: true } }, collaborators: { select: { id: true } },
          workSessions: { where: { cycle: { closedAt: null }, isOverlapping: false, isCollaborator: false }, select: { workerId: true, startedAt: true, endedAt: true, durationMs: true, isOverlapping: true, isCollaborator: true } } },
        take: 3001
      }),
      rhythm.get({ days: 90, includeHours })
    ]);
    const people = members.map((member) => ({ personId: member.id, personName: member.name, avatarUrl: member.avatarUrl || null }));
    const rows = tasks.map(loadTask);
    return { instant, today, people, rows, rhythmData, incomplete: tasks.length > 3000 || Boolean(rhythmData.historyIncomplete) };
  };
  return {
  async get({ window = 'week' } = {}) {
    const { instant, today, people, rows, rhythmData, incomplete } = await context();
    const forecast = buildTeamForecast({ people, tasks: rows, rhythm: rhythmData, now: instant, incomplete, window });
    const map = buildLoadMap({ people, tasks: rows, forecast, today, days });
    return { ...map, signals: loadSignals(map), forecast };
  },
  async preview(draft = {}, viewer) {
    const title = typeof draft.title === 'string' ? draft.title.trim() : '';
    const dueDay = draft.dueDay;
    if (!title || title.length > 1000 || typeof draft.assigneeId !== 'string' || !draft.assigneeId || draft.assigneeId.length > 100 || typeof draft.clientId !== 'string' || !draft.clientId || draft.clientId.length > 100) throw invalid('Elige cliente, responsable y un título para prever la entrega.');
    if (typeof dueDay !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dueDay) || !Number.isFinite(new Date(`${dueDay}T12:00:00Z`).getTime()) || new Date(`${dueDay}T12:00:00Z`).toISOString().slice(0,10) !== dueDay) throw invalid('Elige una fecha válida para prever la entrega.');
    if (draft.focusDeadlineAt && (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(String(draft.focusDeadlineAt)) || !Number.isFinite(new Date(draft.focusDeadlineAt).getTime()) || bogotaDate(draft.focusDeadlineAt) !== dueDay)) throw invalid('La fecha y la hora del compromiso deben corresponder al mismo día.');
    if (draft.taskId && (typeof draft.taskId !== 'string' || draft.taskId.length > 100)) throw invalid('La tarea no es válida.');
    let existing = null;
    if (draft.taskId) {
      existing = await db.task.findUnique({ where: { id: draft.taskId }, select: { ...TASK_PRIVACY_SELECT, id: true, title: true, clientId: true, aiComplexity: true,
        contentItem: { select: { format: true, publishDate: true, publishTime: true, status: true } } } });
      if (!existing) throw invalid('La tarea ya no está disponible.', 404);
      if (!canOpenTask(existing, viewer?.userId || viewer?.id)) throw invalid('No tienes acceso a los detalles de esta tarea.', 403);
      if (existing.clientId !== draft.clientId) throw invalid('El cliente debe coincidir con el de la tarea.');
    }
    const ctx = await context({ includeHours: false });
    const person = ctx.people.find(p => p.personId === draft.assigneeId);
    if (!person) throw invalid('El responsable ya no está activo.');
    const client = await db.client.findUnique({ where: { id: draft.clientId }, select: { id: true, name: true, isArchived: true } });
    if (!client || client.isArchived) throw invalid('El cliente ya no está disponible.');
    const classification = classifyTaskDeterministically({ title });
    const previous = ctx.rows.find(t => t.id === draft.taskId);
    const candidate = loadTask({ id: draft.taskId || '__assignment_preview__', title, assigneeId: draft.assigneeId, clientId: draft.clientId, client,
      aiCategory: classification.category, aiComplexity: existing?.title === title ? existing.aiComplexity || classification.complexity : classification.complexity,
      contentItem: existing?.contentItem, collaborators: existing?.collaborators, dueDate: new Date(`${dueDay}T12:00:00Z`), focusDeadlineAt: draft.focusDeadlineAt || null,
      status: previous?.status || 'PENDIENTE', workSessions: previous?.personId === draft.assigneeId ? previous.workSessions : [] });
    const rows = [...ctx.rows.filter(t => t.id !== candidate.id), candidate];
    const forecast = buildTeamForecast({ people: [person], tasks: rows, rhythm: ctx.rhythmData, now: ctx.instant, incomplete: ctx.incomplete });
    const calculation = forecast.people[0].tasks.find(t => t.id === candidate.id);
    return { ...calculation, policy: RHYTHM_POLICY, personName: person.personName, clientName: client.name, incomplete: ctx.incomplete,
      deadlineSource: candidate.deadlineSource, generatedAt: ctx.instant.toISOString(),
      note: 'Estimación con jornada nominal de 8 h, sin reuniones ni ausencias. La publicación todavía puede requerir revisión y aprobación.' };
  }
  };
};

export const teamLoadService = createTeamLoadService();
