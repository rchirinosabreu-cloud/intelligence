// Las acciones de Bria en la plataforma (10 de octubre de 2026). Rodny, 9 de octubre: «la idea es que Bria
// contribuya a desarrollar buenas prácticas más que simplemente poner cosas … crea la parrilla tal, ¿quién será
// el responsable? ¿cuál será el objetivo estratégico?».
//
// Cada tipo de acción sabe tres cosas: qué exige la plataforma (y lo pregunta de a una cosa, con opciones cuando
// las hay), cómo resumir lo que va a hacer con palabras, y cómo ejecutarlo **por la misma vía que la pantalla**,
// con las mismas puertas (`checkTaskUpdate`, `assertActiveTeamMembers`…). Preparar nunca escribe. Ejecutar solo
// ocurre cuando la persona confirma sobre el resumen (ver briaConversationService).

import { randomUUID } from 'node:crypto';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { hasModulePermission } from '../config/security.js';
import { canOpenTask } from '../lib/taskPrivacy.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { resolveTaskDate } from '../lib/briaTaskDraft.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import { RETURN_REASONS, REOPEN_REASONS } from '../lib/taskTiming.js';
import { humanDate } from '../lib/briaAssistant.js';
import { checkTaskUpdate } from './taskUpdateGate.js';

const tidy = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const fold = (value) => tidy(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const same = (a, b) => fold(a) === fold(b);
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const STATUS = { pendiente: 'PENDIENTE', 'en proceso': 'EN_CURSO', en_proceso: 'EN_CURSO', realizada: 'REALIZADA', realizado: 'REALIZADA', devuelta: 'DEVUELTA', devuelto: 'DEVUELTA', PENDIENTE: 'PENDIENTE', EN_CURSO: 'EN_CURSO', REALIZADA: 'REALIZADA', DEVUELTA: 'DEVUELTA' };
const STATUS_LABEL = { PENDIENTE: 'Pendiente', EN_CURSO: 'En proceso', REALIZADA: 'Realizada', DEVUELTA: 'Devuelta' };
const PRIORITY = { normal: 'NORMAL', alta: 'ALTA', urgente: 'URGENTE', NORMAL: 'NORMAL', ALTA: 'ALTA', URGENTE: 'URGENTE' };
const PRIORITY_LABEL = { NORMAL: 'normal', ALTA: 'alta', URGENTE: 'urgente' };

export const ACTION_PERMISSION = { TASK_UPDATE: 'gestion', CREATE_PLAN: 'parrillas' };
export const canRunActions = (user) => canUseBria(user) && Object.values(ACTION_PERMISSION).some((module) => hasModulePermission(user, module));
const authorize = (user, type) => {
  const module = ACTION_PERMISSION[type];
  if (!module) throw knowledgeError('Esa acción no existe.', 400, 'BRIA_ACTION_UNKNOWN');
  if (!canUseBria(user) || !hasModulePermission(user, module)) throw knowledgeError(`Necesitas acceso a ${module === 'gestion' ? 'Gestión' : 'Parrillas'} para hacer eso con Bria.`, 403, 'BRIA_ACTION_FORBIDDEN');
};

// El mismo criterio que los pendientes y los despachos: con una sola coincidencia se elige; con varias, solo la exacta.
const pickPerson = (rows, term) => {
  if (rows.length === 1) return rows[0];
  const exact = rows.filter((row) => same(row.name, term) || same(row.email, term));
  return exact.length === 1 ? exact[0] : null;
};
const findPeople = (db, term) => db.teamMember.findMany({
  where: { isActive: true, OR: [{ name: { contains: term, mode: 'insensitive' } }, { email: { equals: term, mode: 'insensitive' } }] },
  select: { id: true, name: true, email: true, isActive: true }, orderBy: { name: 'asc' }, take: 6
});
const reasonFrom = (catalog, value) => {
  const text = tidy(value);
  if (!text) return null;
  return catalog.find((row) => row.value === text.toUpperCase() || same(row.label, text)) || null;
};

const TASK_SELECT = {
  id: true, title: true, status: true, dueDate: true, priority: true, isPriority: true, creatorId: true, isPrivate: true,
  client: { select: { name: true } }, assignee: { select: { id: true, name: true, userId: true } },
  collaborators: { select: { member: { select: { userId: true, name: true } } } }, viewers: { select: { userId: true } }
};
const dayOf = (value) => (value ? bogotaDate(value) : null);
const gateAsError = (gate) => knowledgeError(gate.message, gate.gateStatus, 'BRIA_ACTION_GATE');

/* ---------------------------------------------------------------- Cambiar un pendiente */

const prepareTaskUpdate = async ({ db, user, args, previous, today }) => {
  const taskId = tidy(args.tarea) || previous?.target?.taskId;
  if (!taskId) throw knowledgeError('Falta la tarea: búscala primero con mis_tareas o tareas_de_cliente y pásame su id.', 400, 'BRIA_ACTION_TARGET');
  const task = await db.task.findUnique({ where: { id: taskId }, select: TASK_SELECT });
  if (!task) throw knowledgeError('Esa tarea ya no existe.', 404, 'BRIA_ACTION_TARGET');
  if (!canOpenTask(task, user.userId || user.id)) throw knowledgeError('Es un pendiente privado que no puedes abrir.', 403, 'BRIA_ACTION_PRIVATE');

  // Lo que ya se sabía más lo nuevo: una corrección en el chat ajusta la misma acción.
  const wanted = { ...(previous?.wanted || {}) };
  for (const key of ['estado', 'responsable', 'fecha', 'prioridad', 'motivo', 'nota']) if (args[key] != null && tidy(args[key])) wanted[key] = tidy(args[key]);

  const payload = {}, summary = [], warnings = [], missing = [], changes = [];
  const options = {};
  summary.push(`Tarea: **${task.title}**${task.client?.name ? ` · ${task.client.name}` : ''} (hoy ${STATUS_LABEL[task.status] || task.status}${task.assignee?.name ? `, de ${task.assignee.name}` : ''})`);

  if (wanted.estado) {
    const status = STATUS[fold(wanted.estado)] || STATUS[wanted.estado];
    if (!status) throw knowledgeError(`No entendí el estado «${wanted.estado}». Puede ser pendiente, en proceso, realizada o devuelta.`, 400, 'BRIA_ACTION_STATUS');
    if (status !== task.status) {
      payload.status = status;
      changes.push(`Estado: ${STATUS_LABEL[task.status]} → ${STATUS_LABEL[status]}`);
      const team = (task.collaborators || []).length > 0;
      if (status === 'REALIZADA' && task.status !== 'EN_CURSO') warnings.push('No pasó por «En proceso»: quedará cerrada sin tiempo medido y la pantalla le preguntará a la persona cuánto le tomó.');
      if (status === 'EN_CURSO' && team) warnings.push('Es una tarea con colaboradores: ningún reloj arranca solo; cada quien pone en marcha el suyo.');
      if (status === 'DEVUELTA') {
        const reason = reasonFrom(RETURN_REASONS, wanted.motivo);
        if (!reason) missing.push({ field: 'motivo', question: '¿Por qué se devuelve?', options: RETURN_REASONS.map((row) => row.label) });
        else { payload.returnReason = reason.value; changes.push(`Motivo de la devolución: ${reason.label}`); }
        if (!wanted.nota) missing.push({ field: 'nota', question: 'Escríbeme la nota para la persona: qué hay que corregir.' });
        else payload.returnNote = wanted.nota;
      }
      if (task.status === 'REALIZADA' && status === 'PENDIENTE') {
        const reason = reasonFrom(REOPEN_REASONS, wanted.motivo);
        if (!reason) missing.push({ field: 'motivo', question: '¿Por qué se reabre?', options: REOPEN_REASONS.map((row) => row.label) });
        else { payload.reopenReason = reason.value; changes.push(`Motivo de la reapertura: ${reason.label}`); }
        if (!wanted.nota) missing.push({ field: 'nota', question: 'Escríbeme la nota de la reapertura: qué hay que hacer de nuevo.' });
        else payload.reopenNote = wanted.nota;
      }
    }
  }
  if (wanted.responsable) {
    const people = await findPeople(db, wanted.responsable.slice(0, 160));
    const chosen = pickPerson(people, wanted.responsable);
    if (!chosen) {
      if (people.length) missing.push({ field: 'responsable', question: `¿Cuál ${wanted.responsable}?`, options: people.map((row) => row.name) });
      else throw knowledgeError(`No encontré a nadie activo en el equipo que se llame «${wanted.responsable}».`, 404, 'BRIA_ACTION_PERSON');
    } else if (chosen.id !== task.assignee?.id) { payload.assigneeId = chosen.id; changes.push(`Responsable: ${task.assignee?.name || 'sin responsable'} → ${chosen.name}`); options.assignee = chosen; }
  }
  if (wanted.fecha) {
    const day = resolveTaskDate(wanted.fecha, today);
    if (!day) missing.push({ field: 'fecha', question: `No entendí la fecha «${wanted.fecha}». Dime un día concreto, como «viernes» o «15 de octubre».` });
    else if (day !== dayOf(task.dueDate)) { payload.dueDate = `${day}T12:00:00.000Z`; changes.push(`Entrega: ${task.dueDate ? humanDate(dayOf(task.dueDate)) : 'sin fecha'} → ${humanDate(day)}`); }
  }
  if (wanted.prioridad) {
    const priority = PRIORITY[fold(wanted.prioridad)] || PRIORITY[wanted.prioridad];
    if (!priority) throw knowledgeError(`No entendí la prioridad «${wanted.prioridad}». Puede ser normal, alta o urgente.`, 400, 'BRIA_ACTION_PRIORITY');
    if (priority !== (task.priority || 'NORMAL')) { payload.priority = priority; payload.isPriority = priority !== 'NORMAL'; changes.push(`Prioridad: ${PRIORITY_LABEL[task.priority || 'NORMAL']} → ${PRIORITY_LABEL[priority]}`); }
  }
  if (!changes.length && !missing.length) throw knowledgeError('Eso ya está así: no hay nada que cambiar en esa tarea.', 400, 'BRIA_ACTION_NOOP');

  // La misma puerta que la pantalla, antes de prometer nada: si no se puede, se dice ahora y con sus palabras.
  if (Object.keys(payload).length) {
    try { await checkTaskUpdate({ db, user, taskId, payload }); }
    catch (gate) { if (gate.gateStatus) throw gateAsError(gate); throw gate; }
  }
  return {
    id: previous?.id || randomUUID(), ownerId: user.userId || user.id, type: 'TASK_UPDATE', status: 'DRAFT',
    title: `Cambiar «${task.title}»`, target: { taskId, title: task.title }, wanted, payload,
    summary: [...summary, ...changes], warnings, missing
  };
};

const executeTaskUpdate = async ({ db, user, action, updateTask }) => {
  const { taskId } = action.target;
  try { await checkTaskUpdate({ db, user, taskId, payload: action.payload }); }
  catch (gate) { if (gate.gateStatus) throw gateAsError(gate); throw gate; }
  await updateTask(taskId, action.payload, user.userId || user.id);
  const link = `/gestion?taskId=${encodeURIComponent(taskId)}`;
  return { text: `Listo: cambié «${action.target.title}».\n${action.summary.slice(1).map((line) => `- ${line}`).join('\n')}\n\n[Abrir en Gestión](${link})`, sources: [{ kind: 'tarea', id: taskId, label: action.target.title, url: link }] };
};

/* ---------------------------------------------------------------- Crear una parrilla */

const parseMonth = (value, today) => {
  const text = fold(value);
  if (!text) return null;
  const number = Number(text);
  if (Number.isInteger(number) && number >= 1 && number <= 12) return number;
  const index = MONTHS.findIndex((name) => name === text || name.startsWith(text.slice(0, 4)));
  if (index >= 0) return index + 1;
  if (text === 'este mes' || text === 'actual') return Number(today.slice(5, 7));
  if (text === 'proximo mes' || text === 'mes que viene' || text === 'siguiente') return (Number(today.slice(5, 7)) % 12) + 1;
  return null;
};

const preparePlan = async ({ db, user, args, previous, today }) => {
  const clientId = tidy(args.clientId) || previous?.target?.clientId;
  if (!clientId) throw knowledgeError('Falta el cliente: búscalo primero con buscar_cliente y pásame su id.', 400, 'BRIA_ACTION_TARGET');
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, slug: true, isArchived: true, responsible: { select: { id: true, name: true } }, projectManager: { select: { id: true, name: true } } } });
  if (!client) throw knowledgeError('Ese cliente no existe.', 404, 'BRIA_ACTION_TARGET');
  if (client.isArchived) throw knowledgeError(`${client.name} está archivado: no se le crean parrillas.`, 400, 'BRIA_ACTION_ARCHIVED');

  const wanted = { ...(previous?.wanted || {}) };
  for (const key of ['mes', 'anio', 'responsable', 'objetivo']) if (args[key] != null && tidy(args[key])) wanted[key] = tidy(args[key]);
  const month = parseMonth(wanted.mes, today);
  if (!month) throw knowledgeError('¿De qué mes es la parrilla? Dime el mes, por ejemplo «noviembre».', 400, 'BRIA_ACTION_MONTH');
  const year = Number(wanted.anio) > 2000 ? Number(wanted.anio) : (month < Number(today.slice(5, 7)) ? Number(today.slice(0, 4)) + 1 : Number(today.slice(0, 4)));
  const existing = await db.contentPlan.findFirst({ where: { clientId, month, year, deletedAt: null }, select: { id: true } });
  if (existing) throw knowledgeError(`${client.name} ya tiene parrilla de ${MONTHS[month - 1]} de ${year}: [ábrela](/parrillas/${existing.id}) en vez de crear otra.`, 409, 'BRIA_ACTION_EXISTS');

  const summary = [`Cliente: **${client.name}**`, `Mes: ${MONTHS[month - 1]} de ${year}`];
  const missing = [], warnings = [];
  // Buenas prácticas: una parrilla nace con responsable y con objetivo estratégico. Se proponen los de la ficha.
  let owner = null;
  const suggested = [client.responsible, client.projectManager].filter(Boolean).filter((row, index, all) => all.findIndex((other) => other.id === row.id) === index);
  if (wanted.responsable) {
    const people = await findPeople(db, wanted.responsable.slice(0, 160));
    owner = pickPerson(people, wanted.responsable);
    if (!owner) {
      if (people.length) missing.push({ field: 'responsable', question: `¿Cuál ${wanted.responsable}?`, options: people.map((row) => row.name) });
      else throw knowledgeError(`No encontré a nadie activo en el equipo que se llame «${wanted.responsable}».`, 404, 'BRIA_ACTION_PERSON');
    }
  } else missing.push({ field: 'responsable', question: '¿Quién será el responsable de la parrilla?', options: suggested.map((row) => row.name) });
  if (owner) summary.push(`Responsable: ${owner.name}`);

  let objective = wanted.objetivo || null;
  if (!objective) {
    const last = await db.contentPlan.findFirst({ where: { clientId, deletedAt: null, strategicObjectives: { not: null } }, orderBy: [{ year: 'desc' }, { month: 'desc' }], select: { strategicObjectives: true, month: true, year: true } });
    const previousObjective = tidy(last?.strategicObjectives);
    missing.push({ field: 'objetivo', question: '¿Cuál es el objetivo estratégico del mes? Es lo que guía cada pieza y lo que Bria revisa después.', options: previousObjective ? [`El mismo de ${MONTHS[last.month - 1]}: ${previousObjective.slice(0, 120)}`] : [] });
  } else {
    if (/^el mismo de \w+: /i.test(objective)) objective = objective.replace(/^el mismo de \w+: /i, '');
    summary.push(`Objetivo estratégico: ${objective}`);
  }
  return {
    id: previous?.id || randomUUID(), ownerId: user.userId || user.id, type: 'CREATE_PLAN', status: 'DRAFT',
    title: `Crear la parrilla de ${client.name} para ${MONTHS[month - 1]} de ${year}`, target: { clientId, clientName: client.name, slug: client.slug, month, year },
    wanted, payload: { clientId, month, year, ownerId: owner?.id || null, ownerName: owner?.name || null, strategicObjectives: objective },
    summary, warnings, missing
  };
};

const executePlan = async ({ db, user, action, createContentPlan, updateContentPlan }) => {
  const { clientId, month, year, ownerId, strategicObjectives } = action.payload;
  const existing = await db.contentPlan.findFirst({ where: { clientId, month, year, deletedAt: null }, select: { id: true } });
  if (existing) throw knowledgeError(`Esa parrilla ya existe: [ábrela](/parrillas/${existing.id}).`, 409, 'BRIA_ACTION_EXISTS');
  const plan = await createContentPlan({ clientId, month, year, strategicObjectives });
  if (ownerId) await updateContentPlan(plan.id, { ownerId });
  const link = `/parrillas/${plan.id}`;
  return { text: `Listo: creé la parrilla de **${action.target.clientName}** para ${MONTHS[month - 1]} de ${year}${action.payload.ownerName ? `, con ${action.payload.ownerName} como responsable` : ''} y su objetivo estratégico anotado.\n\n[Abrir la parrilla](${link})`, sources: [{ kind: 'parrilla', id: plan.id, label: `Parrilla de ${action.target.clientName}`, url: link }] };
};

/* ---------------------------------------------------------------- Servicio */

const TYPES = {
  TASK_UPDATE: { prepare: prepareTaskUpdate, execute: executeTaskUpdate },
  CREATE_PLAN: { prepare: preparePlan, execute: executePlan }
};

export const createBriaActionService = ({ db, updateTask, createContentPlan, updateContentPlan, now = () => new Date(), readOnly = false } = {}) => ({
  async prepare({ user, type, args = {}, previous }) {
    authorize(user, type);
    const owner = user.userId || user.id;
    // Solo se continúa una acción del mismo tipo, de la misma persona y sin cerrar; lo demás arranca de cero.
    const ongoing = previous && previous.status === 'DRAFT' && previous.type === type && previous.ownerId === owner && args.nuevo !== true ? previous : null;
    return TYPES[type].prepare({ db, user, args, previous: ongoing, today: bogotaDate(now()) });
  },

  async execute({ user, action, revalidate }) {
    if (!action?.type || !TYPES[action.type]) throw knowledgeError('Esa acción no existe.', 400, 'BRIA_ACTION_UNKNOWN');
    authorize(user, action.type);
    if (readOnly) throw knowledgeError('Esta vista solo prepara acciones. Hazlo desde la plataforma.', 403);
    if (action.ownerId !== (user.userId || user.id)) throw knowledgeError('Esta acción la preparó otra persona.', 403, 'BRIA_ACTION_OWNER');
    if (action.status !== 'DRAFT' || action.missing?.length) throw knowledgeError('Primero completa la acción y confírmala sobre su resumen.', 400, 'BRIA_ACTION_NOT_READY');
    await revalidate?.();
    authorize(user, action.type);
    return TYPES[action.type].execute({ db, user, action, updateTask, createContentPlan, updateContentPlan });
  }
});
