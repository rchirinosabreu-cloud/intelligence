// Mapa de carga en el servidor (10 de octubre de 2026): tareas abiertas por persona y día hábil, con las horas que
// suele tomar cada tipo de trabajo según Ritmo (90 días). Solo lee.

import prisma from '../lib/prisma.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { buildLoadMap, loadSignals, LOAD_DAYS } from '../lib/teamLoad.js';
import { workTypeOf, teamRhythmService } from './teamRhythmService.js';

const OPEN_STATUSES = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];

/** Medianas por persona y tipo, y por tipo, sacadas de Ritmo. */
export const estimatesFromRhythm = (rhythm) => {
  const byPersonType = {}, byType = {};
  for (const person of rhythm?.people || []) for (const type of person.byType || []) if (type.medianMs > 0) byPersonType[`${person.personId}|${type.workType}`] = type.medianMs;
  for (const type of rhythm?.types || []) if (type.medianMs > 0) byType[type.workType] = type.medianMs;
  return { byPersonType, byType };
};

export const createTeamLoadService = ({ db = prisma, rhythm = teamRhythmService, now = () => new Date(), days = LOAD_DAYS } = {}) => ({
  async get() {
    const today = bogotaDate(now());
    const [members, tasks, rhythmData] = await Promise.all([
      db.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true, avatarUrl: true }, orderBy: { name: 'asc' } }),
      db.task.findMany({
        where: { status: { in: OPEN_STATUSES }, assigneeId: { not: null } },
        select: { id: true, title: true, status: true, dueDate: true, assigneeId: true, aiCategory: true, contentItem: { select: { format: true } }, client: { select: { name: true } } },
        take: 3000
      }),
      rhythm.get({ days: 90 })
    ]);
    const people = members.map((member) => ({ personId: member.id, personName: member.name, avatarUrl: member.avatarUrl || null }));
    const rows = tasks.map((task) => ({
      id: task.id, title: task.title, status: task.status, personId: task.assigneeId, workType: workTypeOf(task),
      // La fecha de vencimiento se guarda al mediodía UTC: leída en reloj de Bogotá da el mismo día.
      dueDay: task.dueDate ? bogotaDate(task.dueDate) : null, clientName: task.client?.name || null
    }));
    const map = buildLoadMap({ people, tasks: rows, estimates: estimatesFromRhythm(rhythmData), today, days });
    return { ...map, signals: loadSignals(map) };
  }
});

export const teamLoadService = createTeamLoadService();
