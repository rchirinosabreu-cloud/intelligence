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
import { ACTIVE_PUBLICATION_STATUSES } from '../lib/socialPublishing.js';

const tidy = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const fold = (value) => tidy(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const same = (a, b) => fold(a) === fold(b);
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const STATUS = { pendiente: 'PENDIENTE', 'en proceso': 'EN_CURSO', en_proceso: 'EN_CURSO', realizada: 'REALIZADA', realizado: 'REALIZADA', devuelta: 'DEVUELTA', devuelto: 'DEVUELTA', PENDIENTE: 'PENDIENTE', EN_CURSO: 'EN_CURSO', REALIZADA: 'REALIZADA', DEVUELTA: 'DEVUELTA' };
const STATUS_LABEL = { PENDIENTE: 'Pendiente', EN_CURSO: 'En proceso', REALIZADA: 'Realizada', DEVUELTA: 'Devuelta' };
const PRIORITY = { normal: 'NORMAL', alta: 'ALTA', urgente: 'URGENTE', NORMAL: 'NORMAL', ALTA: 'ALTA', URGENTE: 'URGENTE' };
const PRIORITY_LABEL = { NORMAL: 'normal', ALTA: 'alta', URGENTE: 'urgente' };

export const ACTION_PERMISSION = { TASK_UPDATE: 'gestion', TASKS_STATUS: 'gestion', CREATE_PLAN: 'parrillas', CREATE_ITEM: 'parrillas', MOVE_ITEM: 'parrillas', CLIENT_NOTE: 'clientes' };
const MODULE_LABEL = { gestion: 'Gestión', parrillas: 'Parrillas', clientes: 'Clientes' };
export const ITEM_FORMATS = ['Reel', 'Carrusel', 'Post', 'Video', 'Historia'];
const BULK_MAX = 10;
export const canRunActions = (user) => canUseBria(user) && Object.values(ACTION_PERMISSION).some((module) => hasModulePermission(user, module));
const authorize = (user, type) => {
  const module = ACTION_PERMISSION[type];
  if (!module) throw knowledgeError('Esa acción no existe.', 400, 'BRIA_ACTION_UNKNOWN');
  if (!canUseBria(user) || !hasModulePermission(user, module)) throw knowledgeError(`Necesitas acceso a ${MODULE_LABEL[module] || module} para hacer eso con Bria.`, 403, 'BRIA_ACTION_FORBIDDEN');
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

/* ---------------------------------------------------------------- Varios pendientes de una vez */

// Solo cambios de estado sin nota (pendiente, en proceso, realizada). Devolver y reabrir piden motivo y nota
// por tarea: eso se hace de a una con cambiar_pendiente.
const prepareTasksStatus = async ({ db, user, args, previous }) => {
  const wanted = { ...(previous?.wanted || {}) };
  if (args.estado != null && tidy(args.estado)) wanted.estado = tidy(args.estado);
  const ids = [...new Set([...(previous?.target?.taskIds || []), ...(Array.isArray(args.tareas) ? args.tareas : []).map(tidy).filter(Boolean)])].slice(0, BULK_MAX);
  if (!ids.length) throw knowledgeError('Faltan las tareas: búscalas primero con mis_tareas o tareas_de_cliente y pásame sus ids.', 400, 'BRIA_ACTION_TARGET');
  const status = wanted.estado ? (STATUS[fold(wanted.estado)] || STATUS[wanted.estado]) : null;
  if (wanted.estado && !status) throw knowledgeError(`No entendí el estado «${wanted.estado}». Para varias a la vez puede ser pendiente, en proceso o realizada.`, 400, 'BRIA_ACTION_STATUS');
  if (status === 'DEVUELTA') throw knowledgeError('Devolver pide motivo y nota para cada tarea: hazlo de a una con cambiar_pendiente.', 400, 'BRIA_ACTION_STATUS');
  const rows = await db.task.findMany({ where: { id: { in: ids } }, select: TASK_SELECT });
  const byId = new Map(rows.map((row) => [row.id, row]));
  const items = [];
  for (const taskId of ids) {
    const task = byId.get(taskId);
    const item = { taskId, title: task?.title || 'Pendiente', client: task?.client?.name || null, assignee: task?.assignee?.name || null, status: task?.status || null };
    if (!task) item.skip = 'Ya no existe.';
    else if (!canOpenTask(task, user.userId || user.id)) item.skip = 'Es un pendiente privado que no puedes abrir.';
    else if (status && task.status === status) item.skip = `Ya está ${STATUS_LABEL[status].toLowerCase()}.`;
    else if (status && task.status === 'REALIZADA' && status === 'PENDIENTE') item.skip = 'Reabrir una cerrada pide motivo y nota: hazlo de a una.';
    else if (status) {
      try { await checkTaskUpdate({ db, user, taskId, payload: { status } }); }
      catch (gate) { if (gate.gateStatus) item.skip = gate.message; else throw gate; }
    }
    if (!item.skip && status === 'REALIZADA' && task.status !== 'EN_CURSO') item.unmeasured = true;
    items.push(item);
  }
  const active = items.filter((item) => !item.skip);
  const missing = status ? [] : [{ field: 'estado', question: `¿A qué estado paso ${ids.length === 1 ? 'esta tarea' : `estas ${ids.length} tareas`}?`, options: ['En proceso', 'Realizada', 'Pendiente'] }];
  if (status && !active.length) throw knowledgeError(`No queda ninguna tarea que pueda pasar a ${STATUS_LABEL[status].toLowerCase()}:\n${items.map((item) => `- ${item.title}: ${item.skip}`).join('\n')}`, 400, 'BRIA_ACTION_NOOP');
  const summary = [
    ...(status ? [`${active.length === 1 ? 'Una tarea pasa' : `${active.length} tareas pasan`} a **${STATUS_LABEL[status]}**:`] : [`${ids.length === 1 ? 'Una tarea' : `${ids.length} tareas`}:`]),
    ...active.map((item) => `${item.title}${item.client ? ` · ${item.client}` : ''}${item.assignee ? ` · ${item.assignee}` : ''}${item.status ? ` (hoy ${STATUS_LABEL[item.status] || item.status})` : ''}`)
  ];
  const skipped = items.filter((item) => item.skip);
  const warnings = [];
  if (skipped.length) warnings.push(`No se tocan: ${skipped.map((item) => `${item.title} (${item.skip})`).join('; ')}`);
  const unmeasured = active.filter((item) => item.unmeasured).length;
  if (unmeasured) warnings.push(`${unmeasured === 1 ? 'Una de ellas no pasó' : `${unmeasured} de ellas no pasaron`} por «En proceso»: quedarán cerradas sin tiempo medido.`);
  return {
    id: previous?.id || randomUUID(), ownerId: user.userId || user.id, type: 'TASKS_STATUS', status: 'DRAFT',
    title: status ? `Pasar ${active.length === 1 ? 'una tarea' : `${active.length} tareas`} a ${STATUS_LABEL[status]}` : 'Cambiar varias tareas',
    target: { taskIds: ids }, wanted, payload: { status, items: active.map(({ taskId, title }) => ({ taskId, title })) },
    summary, warnings, missing
  };
};

const executeTasksStatus = async ({ db, user, action, updateTask }) => {
  const { status, items } = action.payload;
  const done = [], failed = [];
  for (const item of items) {
    try {
      // Se vuelve a mirar cada tarea justo antes: un permiso que cambió se respeta y lo ya cambiado no falla.
      const task = await db.task.findUnique({ where: { id: item.taskId }, select: TASK_SELECT });
      if (!task) { failed.push({ ...item, reason: 'Ya no existe.' }); continue; }
      if (task.status === status) { done.push({ ...item, already: true }); continue; }
      await checkTaskUpdate({ db, user, taskId: item.taskId, payload: { status } });
      await updateTask(item.taskId, { status }, user.userId || user.id);
      done.push(item);
    } catch (failure) {
      if (!failure.gateStatus) console.error('[BriaActions] No se pudo cambiar una tarea del lote:', failure?.response?.data || failure?.message || failure);
      failed.push({ ...item, reason: failure.gateStatus ? failure.message : 'No se pudo cambiar; inténtalo desde Gestión.' });
    }
  }
  const parts = [];
  if (done.length) parts.push(`${done.length === 1 ? 'Una tarea pasó' : `${done.length} tareas pasaron`} a ${STATUS_LABEL[status]}:\n${done.map((item) => `- ${item.title}${item.already ? ' (ya estaba)' : ''}: [abrir](/gestion?taskId=${encodeURIComponent(item.taskId)})`).join('\n')}`);
  if (failed.length) parts.push(`**No cambiaron**\n${failed.map((item) => `- ${item.title}: ${item.reason}`).join('\n')}`);
  return { text: parts.join('\n\n') || 'No cambió ninguna tarea.', sources: done.map((item) => ({ kind: 'tarea', id: item.taskId, label: item.title, url: `/gestion?taskId=${item.taskId}` })) };
};

/* ---------------------------------------------------------------- Crear una pieza en una parrilla */

const canonicalFormat = (value) => {
  const text = fold(value);
  if (!text) return null;
  return ITEM_FORMATS.find((name) => fold(name) === text || fold(name).startsWith(text.slice(0, 4))) || tidy(value).slice(0, 40);
};
const PLAN_SELECT = { id: true, month: true, year: true, status: true, client: { select: { id: true, name: true, isArchived: true } }, contentItems: { where: { deletedAt: null }, select: { id: true, objective: true, format: true, publishDate: true } } };
const planDayOf = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);
const insideMonth = (day, plan) => day.startsWith(`${plan.year}-${String(plan.month).padStart(2, '0')}-`);

const resolvePlan = async ({ db, args, previous, today }) => {
  const planId = tidy(args.planId) || previous?.target?.planId;
  if (planId) {
    const plan = await db.contentPlan.findFirst({ where: { id: planId, deletedAt: null }, select: PLAN_SELECT });
    if (!plan) throw knowledgeError('Esa parrilla ya no existe.', 404, 'BRIA_ACTION_TARGET');
    return plan;
  }
  const clientId = tidy(args.clientId);
  if (!clientId) throw knowledgeError('Falta la parrilla: búscala con parrilla_de_cliente y pásame su id, o dime el cliente y el mes.', 400, 'BRIA_ACTION_TARGET');
  const month = parseMonth(args.mes, today) || Number(today.slice(5, 7));
  const year = Number(args.anio) > 2000 ? Number(args.anio) : Number(today.slice(0, 4));
  const plan = await db.contentPlan.findFirst({ where: { clientId, month, year, deletedAt: null }, select: PLAN_SELECT });
  if (!plan) throw knowledgeError(`Ese cliente no tiene parrilla de ${MONTHS[month - 1]} de ${year}. Puedes pedirme crearla con crear_parrilla.`, 404, 'BRIA_ACTION_TARGET');
  return plan;
};

const prepareItem = async ({ db, user, args, previous, today }) => {
  const plan = await resolvePlan({ db, args, previous, today });
  if (plan.client?.isArchived) throw knowledgeError(`${plan.client.name} está archivado: su parrilla no recibe piezas nuevas.`, 400, 'BRIA_ACTION_ARCHIVED');
  if (plan.status === 'FINALIZADO') throw knowledgeError('Esa parrilla ya está finalizada: no recibe piezas nuevas.', 400, 'BRIA_ACTION_CLOSED');
  const wanted = { ...(previous?.wanted || {}) };
  for (const key of ['objetivo', 'formato', 'fecha', 'hora']) if (args[key] != null && tidy(args[key])) wanted[key] = tidy(args[key]);

  const summary = [`Parrilla: **${plan.client?.name || 'cliente'}**, ${MONTHS[plan.month - 1]} de ${plan.year}`];
  const missing = [], warnings = [];
  // Buenas prácticas: una pieza nace con un objetivo que diga algo, un formato y una fecha. Nada de «Nuevo Objetivo».
  const objective = wanted.objetivo && !/^nuevo objetivo$/i.test(wanted.objetivo) ? wanted.objetivo.slice(0, 200) : null;
  if (!objective) missing.push({ field: 'objetivo', question: '¿Cuál es el objetivo de la pieza? Qué quiere lograr, en una frase: es el título que verá el equipo y el cliente.' });
  else summary.push(`Objetivo: ${objective}`);
  const format = wanted.formato ? canonicalFormat(wanted.formato) : null;
  if (!format) missing.push({ field: 'formato', question: '¿Qué formato es?', options: ITEM_FORMATS });
  else summary.push(`Formato: ${format}`);
  let day = null;
  if (wanted.fecha) {
    day = resolveTaskDate(wanted.fecha, today);
    if (!day) missing.push({ field: 'fecha', question: `No entendí la fecha «${wanted.fecha}». Dime un día concreto, como «martes» o «21 de octubre».` });
  } else missing.push({ field: 'fecha', question: '¿Qué día se publica?' });
  if (day) {
    summary.push(`Publica el ${humanDate(day)}`);
    if (!insideMonth(day, plan)) warnings.push(`Esa fecha cae fuera de ${MONTHS[plan.month - 1]}: la pieza quedará en esta parrilla igual, pero conviene revisarlo.`);
    const sameDay = plan.contentItems.filter((item) => planDayOf(item.publishDate) === day);
    if (sameDay.length) warnings.push(`Ese día ya ${sameDay.length === 1 ? 'hay una pieza' : `hay ${sameDay.length} piezas`} (${sameDay.map((item) => item.objective).join(', ')}): dos el mismo día es una señal amarilla en la operación.`);
  }
  let publishTime = null;
  if (wanted.hora) {
    if (!/^\d{2}:\d{2}$/.test(wanted.hora)) missing.push({ field: 'hora', question: `No entendí la hora «${wanted.hora}». Dímela como 14:30 (reloj de Bogotá).` });
    else { publishTime = wanted.hora; summary.push(`Hora: ${publishTime}`); }
  }
  return {
    id: previous?.id || randomUUID(), ownerId: user.userId || user.id, type: 'CREATE_ITEM', status: 'DRAFT',
    title: `Crear una pieza en la parrilla de ${plan.client?.name || 'cliente'}`, target: { planId: plan.id, clientName: plan.client?.name || null },
    wanted, payload: { planId: plan.id, objective, format, day, publishTime },
    summary, warnings, missing
  };
};

const executeItem = async ({ action, createContentItem }) => {
  const { planId, objective, format, day, publishTime } = action.payload;
  const item = await createContentItem({ planId, objective, format, copyText: '', captionText: '', publishDate: new Date(`${day}T12:00:00.000Z`), status: 'BORRADOR', ...(publishTime ? { publishTime } : {}) });
  const link = `/parrillas/${planId}?item=${item.id}`;
  return { text: `Listo: creé la pieza **${objective}** (${format}) para el ${humanDate(day)} en la parrilla de ${action.target.clientName || 'cliente'}. Queda en borrador, sin guion ni texto todavía.\n\n[Abrir la pieza](${link})`, sources: [{ kind: 'pieza', id: item.id, label: objective, url: link }] };
};

/* ---------------------------------------------------------------- Mover la fecha de una pieza */

const ITEM_SELECT = { id: true, objective: true, format: true, status: true, publishDate: true, publishTime: true, planId: true, plan: { select: { month: true, year: true, status: true, client: { select: { name: true, isArchived: true } } } }, publications: { select: { status: true } } };
const LIVE_PUBLICATION = new Set(ACTIVE_PUBLICATION_STATUSES);

const prepareMoveItem = async ({ db, user, args, previous, today }) => {
  const itemId = tidy(args.pieza) || previous?.target?.itemId;
  if (!itemId) throw knowledgeError('Falta la pieza: búscala con parrilla_de_cliente y pásame su id.', 400, 'BRIA_ACTION_TARGET');
  const item = await db.contentItem.findFirst({ where: { id: itemId, deletedAt: null }, select: ITEM_SELECT });
  if (!item) throw knowledgeError('Esa pieza ya no existe.', 404, 'BRIA_ACTION_TARGET');
  if (item.status === 'PUBLICADO') throw knowledgeError(`«${item.objective}» ya se publicó: no se le mueve la fecha.`, 400, 'BRIA_ACTION_PUBLISHED');
  const wanted = { ...(previous?.wanted || {}) };
  for (const key of ['fecha', 'hora']) if (args[key] != null && tidy(args[key])) wanted[key] = tidy(args[key]);
  const currentDay = planDayOf(item.publishDate);
  const summary = [`Pieza: **${item.objective}** (${item.format}) de ${item.plan?.client?.name || 'cliente'} · hoy sale el ${humanDate(currentDay)}${item.publishTime ? ` a las ${item.publishTime}` : ''}`];
  const missing = [], warnings = [];
  let day = null, publishTime;
  if (wanted.fecha) {
    day = resolveTaskDate(wanted.fecha, today);
    if (!day) missing.push({ field: 'fecha', question: `No entendí la fecha «${wanted.fecha}». Dime un día concreto, como «jueves» o «23 de octubre».` });
  } else missing.push({ field: 'fecha', question: '¿Para qué día la muevo?' });
  if (wanted.hora) {
    if (!/^\d{2}:\d{2}$/.test(wanted.hora)) missing.push({ field: 'hora', question: `No entendí la hora «${wanted.hora}». Dímela como 14:30 (reloj de Bogotá).` });
    else publishTime = wanted.hora;
  }
  if (day && day === currentDay && (publishTime === undefined || publishTime === item.publishTime)) throw knowledgeError('Esa pieza ya sale ese día: no hay nada que mover.', 400, 'BRIA_ACTION_NOOP');
  if (day) {
    summary.push(`Nueva fecha: ${humanDate(day)}${publishTime ? ` a las ${publishTime}` : item.publishTime ? ` (se conserva la hora ${item.publishTime})` : ''}`);
    if (item.plan && !insideMonth(day, item.plan)) warnings.push(`Esa fecha cae fuera de ${MONTHS[item.plan.month - 1]}: la pieza sigue en esta parrilla.`);
    if (day < today) warnings.push('Es una fecha pasada: si tenía una publicación programada en redes, queda cancelada, no sale.');
    if ((item.publications || []).some((row) => LIVE_PUBLICATION.has(row.status))) warnings.push('Tiene una publicación programada en redes: se mueve con la pieza a la nueva fecha y hora.');
    if (item.status === 'APROBADO') warnings.push('El cliente ya la aprobó: mover la fecha no le pide otra aprobación, pero conviene avisarle.');
  }
  return {
    id: previous?.id || randomUUID(), ownerId: user.userId || user.id, type: 'MOVE_ITEM', status: 'DRAFT',
    title: `Mover «${item.objective}»`, target: { itemId, planId: item.planId, objective: item.objective },
    wanted, payload: { itemId, day, ...(publishTime !== undefined ? { publishTime } : {}) },
    summary, warnings, missing
  };
};

const executeMoveItem = async ({ action, updateContentItem }) => {
  const { itemId, day, publishTime } = action.payload;
  await updateContentItem(itemId, { publishDate: day, ...(publishTime !== undefined ? { publishTime } : {}) });
  const link = `/parrillas/${action.target.planId}?item=${itemId}`;
  return { text: `Listo: «${action.target.objective}» sale ahora el ${humanDate(day)}${publishTime ? ` a las ${publishTime}` : ''}.\n\n[Abrir la pieza](${link})`, sources: [{ kind: 'pieza', id: itemId, label: action.target.objective, url: link }] };
};

/* ---------------------------------------------------------------- Observación de un cliente */

const OBSERVATION_MAX = 2000;
const prepareClientNote = async ({ db, user, args, previous }) => {
  const clientId = tidy(args.clientId) || previous?.target?.clientId;
  if (!clientId) throw knowledgeError('Falta el cliente: búscalo primero con buscar_cliente y pásame su id.', 400, 'BRIA_ACTION_TARGET');
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, slug: true, isArchived: true } });
  if (!client) throw knowledgeError('Ese cliente no existe.', 404, 'BRIA_ACTION_TARGET');
  const wanted = { ...(previous?.wanted || {}) };
  if (args.texto != null && String(args.texto).trim()) wanted.texto = String(args.texto).replace(/\s+/g, ' ').trim();
  const text = wanted.texto || null;
  const missing = text ? [] : [{ field: 'texto', question: `¿Qué observación dejo anotada en la ficha de ${client.name}? Es contexto que el equipo tiene que leer, no un pendiente: para eso está crear un pendiente.` }];
  if (text && text.length > OBSERVATION_MAX) throw knowledgeError(`La observación pasa de ${OBSERVATION_MAX} caracteres; pártela en dos.`, 400, 'BRIA_ACTION_LONG');
  const warnings = client.isArchived ? [`${client.name} está archivado: la observación queda en su ficha igual.`] : [];
  return {
    id: previous?.id || randomUUID(), ownerId: user.userId || user.id, type: 'CLIENT_NOTE', status: 'DRAFT',
    title: `Anotar una observación en ${client.name}`, target: { clientId, clientName: client.name, slug: client.slug },
    wanted, payload: { clientId, text },
    summary: [`Cliente: **${client.name}**`, ...(text ? [`Observación: «${text}»`, 'Queda con tu nombre y la fecha de hoy, visible para administradores y project managers en Operación de clientes.'] : [])],
    warnings, missing
  };
};

const executeClientNote = async ({ user, action, addObservation }) => {
  await addObservation({ clientId: action.payload.clientId, text: action.payload.text, actorUserId: user.userId || user.id });
  const link = `/clientes/operacion/${action.target.slug}`;
  return { text: `Listo: anoté la observación en la ficha de **${action.target.clientName}**.\n\n[Abrir la operación del cliente](${link})`, sources: [] };
};

/* ---------------------------------------------------------------- Servicio */

const TYPES = {
  TASK_UPDATE: { prepare: prepareTaskUpdate, execute: executeTaskUpdate },
  TASKS_STATUS: { prepare: prepareTasksStatus, execute: executeTasksStatus },
  CREATE_PLAN: { prepare: preparePlan, execute: executePlan },
  CREATE_ITEM: { prepare: prepareItem, execute: executeItem },
  MOVE_ITEM: { prepare: prepareMoveItem, execute: executeMoveItem },
  CLIENT_NOTE: { prepare: prepareClientNote, execute: executeClientNote }
};

export const createBriaActionService = ({ db, updateTask, createContentPlan, updateContentPlan, createContentItem, updateContentItem, addObservation, now = () => new Date(), readOnly = false } = {}) => ({
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
    return TYPES[action.type].execute({ db, user, action, updateTask, createContentPlan, updateContentPlan, createContentItem, updateContentItem, addObservation });
  }
});
