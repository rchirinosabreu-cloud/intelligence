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
import { isManagerRole } from '../config/security.js';
import { matchOperation, isExcludedOperation } from '../lib/platformCatalog.js';
import { LEGACY_ACTIONS } from '../lib/briaActions.js';
import { dispatchResultText } from '../lib/briaDispatchDraft.js';
import { deleteResultText } from '../lib/briaDeleteDraft.js';
import { searchTasks, findClientByTerm, TASK_SEARCH_MAX } from './taskSearch.js';
import { rankByName } from '../lib/fuzzyMatch.js';
import { dayLabel } from '../lib/teamLoad.js';
import { minuteItems, guessClient, matchOwner, minuteLabel, minuteTaskContext } from '../lib/minuteTasks.js';
import { buildPlanDraftDigest, buildPlanDraftRequest, parsePlanDraft, validatePlanDraft, pieceLine, monthLabel as planMonthLabel, PLAN_DRAFT_DEFAULT_PIECES, PLAN_DRAFT_MAX_PIECES } from '../lib/planDraft.js';
import { AI_MODELS } from '../config/aiConfig.js';
import { createOpenAIClient } from './openAIClient.js';
import { clientOperationsService } from './clientOperationsService.js';

const tidy = (value) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const fold = (value) => tidy(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const same = (a, b) => fold(a) === fold(b);
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const STATUS = { pendiente: 'PENDIENTE', 'en proceso': 'EN_CURSO', en_proceso: 'EN_CURSO', realizada: 'REALIZADA', realizado: 'REALIZADA', devuelta: 'DEVUELTA', devuelto: 'DEVUELTA', PENDIENTE: 'PENDIENTE', EN_CURSO: 'EN_CURSO', REALIZADA: 'REALIZADA', DEVUELTA: 'DEVUELTA' };
const STATUS_LABEL = { PENDIENTE: 'Pendiente', EN_CURSO: 'En proceso', REALIZADA: 'Realizada', DEVUELTA: 'Devuelta' };
const PRIORITY = { normal: 'NORMAL', alta: 'ALTA', urgente: 'URGENTE', NORMAL: 'NORMAL', ALTA: 'ALTA', URGENTE: 'URGENTE' };
const PRIORITY_LABEL = { NORMAL: 'normal', ALTA: 'alta', URGENTE: 'urgente' };

// Módulos que exige cada acción. Las tres que nacieron con flujo propio (crear pendiente, despachar a producción,
// eliminar pendientes) viajan por esta misma base desde el 10 de octubre de 2026; el despacho exige dos módulos.
export const ACTION_PERMISSION = { TASK_UPDATE: 'gestion', TASKS_STATUS: 'gestion', CREATE_PLAN: 'parrillas', CREATE_ITEM: 'parrillas', MOVE_ITEM: 'parrillas', CLIENT_NOTE: 'clientes', TASK_CREATE: 'gestion', DISPATCH: ['gestion', 'parrillas'], TASK_DELETE: 'gestion', MINUTE_TASKS: ['gestion', 'minutas'], PLAN_DRAFT: 'parrillas' };
export const actionModules = (type) => [].concat(ACTION_PERMISSION[type] || []);
const MODULE_LABEL = { gestion: 'Gestión', parrillas: 'Parrillas', clientes: 'Clientes' };
export const ITEM_FORMATS = ['Reel', 'Carrusel', 'Post', 'Video', 'Historia'];
// Hasta 50 tareas por lote (Rodny, 11 de octubre de 2026: «Todos los pendientes de Jarlan, pónselos a Kamila»).
export const BULK_MAX = TASK_SEARCH_MAX;
export const canRunActions = (user) => canUseBria(user) && Object.keys(ACTION_PERMISSION).some((type) => actionModules(type).every((module) => hasModulePermission(user, module)));
const authorize = (user, type) => {
  const modules = actionModules(type);
  if (!modules.length) throw knowledgeError('Esa acción no existe.', 400, 'BRIA_ACTION_UNKNOWN');
  const missing = modules.find((module) => !hasModulePermission(user, module));
  if (!canUseBria(user) || missing) throw knowledgeError(`Necesitas acceso a ${MODULE_LABEL[missing || modules[0]] || missing || modules[0]} para hacer eso con Bria.`, 403, 'BRIA_ACTION_FORBIDDEN');
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
  id: true, title: true, status: true, dueDate: true, focusDeadlineAt: true, priority: true, isPriority: true, creatorId: true, isPrivate: true,
  client: { select: { name: true } }, assignee: { select: { id: true, name: true, userId: true } },
  collaborators: { select: { member: { select: { userId: true, name: true } } } }, viewers: { select: { userId: true } }
};
const dayOf = (value) => (value ? bogotaDate(value) : null);
const gateAsError = (gate) => knowledgeError(gate.message, gate.gateStatus, 'BRIA_ACTION_GATE');

/* ---------------------------------------------------------------- Cambiar un pendiente */

const prepareTaskUpdate = async ({ db, user, args, previous, today, gate }) => {
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
    } else if (chosen.id !== task.assignee?.id) {
      payload.assigneeId = chosen.id; changes.push(`Responsable: ${task.assignee?.name || 'sin responsable'} → ${chosen.name}`); options.assignee = chosen;
      // Reasignar una tarea en proceso (Rodny, 11 de octubre de 2026): la plataforma cierra el reloj anterior.
      if (task.status === 'EN_CURSO' && !payload.status) warnings.push(`Está en proceso: al cambiar de responsable vuelve a Pendiente y el reloj de ${task.assignee?.name || 'quien la trabajaba'} se cierra; su tiempo queda a su nombre y ${chosen.name} la arranca cuando la tome.`);
      else if (task.status === 'EN_CURSO' && payload.status === 'EN_CURSO') warnings.push(`Está en proceso: el reloj de ${task.assignee?.name || 'quien la trabajaba'} se cierra con su tiempo a su nombre y el reloj pasa a ${chosen.name} en el acto.`);
    }
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
    try { await gate({ db, user, taskId, payload }); }
    catch (refusal) { if (refusal.gateStatus) throw gateAsError(refusal); throw refusal; }
  }
  return {
    id: previous?.id || randomUUID(), ownerId: user.userId || user.id, type: 'TASK_UPDATE', status: 'DRAFT',
    title: `Cambiar «${task.title}»`, target: { taskId, title: task.title }, wanted, payload,
    summary: [...summary, ...changes], warnings, missing
  };
};

const executeTaskUpdate = async ({ db, user, action, updateTask, gate }) => {
  const { taskId } = action.target;
  try { await gate({ db, user, taskId, payload: action.payload }); }
  catch (refusal) { if (refusal.gateStatus) throw gateAsError(refusal); throw refusal; }
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

// El mismo cambio para hasta 50 tareas: estado (pendiente, en proceso, realizada), responsable y fecha de
// entrega, juntos o por separado. Las tareas se nombran por id o se resuelven en el servidor con un filtro (la
// misma búsqueda de buscar_pendientes): «todos los pendientes de Jarlan, pónselos a Kamila» (Rodny, 11 de octubre
// de 2026). Devolver y reabrir piden motivo y nota por tarea: eso se hace de a una con cambiar_pendiente.
const FILTER_KEYS = ['responsable', 'sinResponsable', 'cliente', 'estado', 'vencidas'];
const tidyFilter = (value) => {
  if (!value || typeof value !== 'object') return null;
  const filter = {};
  for (const key of FILTER_KEYS) {
    if (value[key] == null) continue;
    if (key === 'sinResponsable' || key === 'vencidas') { if (value[key] === true) filter[key] = true; }
    else if (tidy(value[key])) filter[key] = tidy(value[key]);
  }
  return Object.keys(filter).length ? filter : null;
};
const quoteTitles = (titles) => {
  const shown = titles.slice(0, 5).map((title) => `«${title}»`);
  const rest = titles.length - shown.length;
  return `${shown.join(', ')}${rest > 0 ? ` y ${rest} más` : ''}`;
};
// Lo que le falta a cada tarea para quedar como se pidió: lo que ya está así no se vuelve a escribir.
const bulkChangesFor = (task, { status, assigneeId, dueDate }) => {
  const payload = {};
  if (status && task.status !== status) payload.status = status;
  if (assigneeId && task.assignee?.id !== assigneeId) payload.assigneeId = assigneeId;
  if (dueDate && dayOf(task.dueDate) !== dueDate.slice(0, 10)) payload.dueDate = dueDate;
  return payload;
};
const bulkChangeLines = ({ status, assigneeName, dueDate }) => [
  ...(status ? [`Estado → ${STATUS_LABEL[status]}`] : []),
  ...(assigneeName ? [`Responsable → ${assigneeName}`] : []),
  ...(dueDate ? [`Entrega → ${humanDate(dueDate.slice(0, 10))}`] : [])
];

const prepareTasksStatus = async ({ db, user, args, previous, today, gate }) => {
  const viewer = user.userId || user.id;
  const wanted = { ...(previous?.wanted || {}) };
  for (const key of ['estado', 'responsable', 'fecha']) if (args[key] != null && tidy(args[key])) wanted[key] = tidy(args[key]);
  const newFilter = tidyFilter(args.filtro);
  if (newFilter) wanted.filtro = newFilter;
  const missing = [], warnings = [];

  // Qué tareas: las nombradas por id, o las que resuelve el filtro en el servidor. Un filtro nuevo reemplaza el
  // lote; sin filtro nuevo se conserva el que ya se había resuelto.
  let ids = [...new Set([...(previous?.target?.taskIds || []), ...(Array.isArray(args.tareas) ? args.tareas : []).map(tidy).filter(Boolean)])];
  let found = null;
  const filter = newFilter || (!ids.length ? wanted.filtro : null);
  if (filter) {
    try {
      found = await searchTasks({ db, filters: filter, today, select: TASK_SELECT, take: BULK_MAX });
      ids = found.rows.map((row) => row.id);
    } catch (error) {
      if (error?.code !== 'BRIA_SEARCH_AMBIGUOUS') throw error;
      missing.push({ field: `filtro.${error.field}`, question: error.field === 'cliente' ? `¿Los pendientes de cuál cliente «${filter.cliente}»?` : `¿Los pendientes de cuál ${filter.responsable}?`, options: error.options });
      ids = [];
    }
    if (found && found.total > BULK_MAX) warnings.push(`Son ${found.total} en total; preparo ${BULK_MAX}, las de fecha más próxima. Cuando confirmes, pídeme el resto.`);
    if (found && !found.total) throw knowledgeError(`No hay ${found.descripcion.replace(/^0 /, '')}: no hay nada que cambiar.`, 404, 'BRIA_ACTION_TARGET');
  }
  if (ids.length > BULK_MAX) { ids = ids.slice(0, BULK_MAX); warnings.push(`Son más de ${BULK_MAX}: preparo las primeras ${BULK_MAX}. Cuando confirmes, pídeme el resto.`); }
  if (!ids.length && !missing.length) throw knowledgeError('Faltan las tareas: pásame sus ids (de mis_tareas, tareas_de_cliente o buscar_pendientes) o un filtro (responsable, sin responsable, cliente, estado, vencidas).', 400, 'BRIA_ACTION_TARGET');
  const descripcion = found?.descripcion || previous?.target?.descripcion || null;

  // Qué cambio.
  const status = wanted.estado ? (STATUS[fold(wanted.estado)] || STATUS[wanted.estado]) : null;
  if (wanted.estado && !status) throw knowledgeError(`No entendí el estado «${wanted.estado}». Para varias a la vez puede ser pendiente, en proceso o realizada.`, 400, 'BRIA_ACTION_STATUS');
  if (status === 'DEVUELTA') throw knowledgeError('Devolver pide motivo y nota para cada tarea: hazlo de a una con cambiar_pendiente.', 400, 'BRIA_ACTION_STATUS');
  let assignee = null;
  if (wanted.responsable) {
    const people = await findPeople(db, wanted.responsable.slice(0, 160));
    assignee = pickPerson(people, wanted.responsable);
    if (!assignee) {
      if (people.length) missing.push({ field: 'responsable', question: `¿Cuál ${wanted.responsable} será el responsable?`, options: people.map((row) => row.name).sort((a, b) => a.localeCompare(b, 'es')) });
      else throw knowledgeError(`No encontré a nadie activo en el equipo que se llame «${wanted.responsable}».`, 404, 'BRIA_ACTION_PERSON');
    }
  }
  let dueDate = null;
  if (wanted.fecha) {
    const day = resolveTaskDate(wanted.fecha, today);
    if (!day) missing.push({ field: 'fecha', question: `No entendí la fecha «${wanted.fecha}». Dime un día concreto, como «viernes» o «15 de octubre».` });
    else dueDate = `${day}T12:00:00.000Z`;
  }
  const change = { status, assigneeId: assignee?.id || null, assigneeName: assignee?.name || null, dueDate };
  const anyChange = Boolean(status || wanted.responsable || wanted.fecha);
  if (!anyChange) missing.push({ field: 'estado', question: `¿A qué estado paso ${ids.length === 1 ? 'esta tarea' : `estas ${ids.length} tareas`}?`, options: ['En proceso', 'Realizada', 'Pendiente'] });
  const statusOnly = Boolean(status) && !wanted.responsable && !wanted.fecha;

  // Cada tarea por la misma puerta que la pantalla; lo que no puede se dice y no frena a las demás.
  const rows = found ? found.rows : (ids.length ? await db.task.findMany({ where: { id: { in: ids } }, select: TASK_SELECT }) : []);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const items = [];
  for (const taskId of ids) {
    const task = byId.get(taskId);
    const item = { taskId, title: task?.title || 'Pendiente', client: task?.client?.name || null, assignee: task?.assignee?.name || null, status: task?.status || null };
    if (!task) item.skip = 'Ya no existe.';
    else if (!canOpenTask(task, viewer)) item.skip = 'Es un pendiente privado que no puedes abrir.';
    else if (status && task.status === 'REALIZADA' && status === 'PENDIENTE') item.skip = 'Reabrir una cerrada pide motivo y nota: hazlo de a una.';
    else if (anyChange && !missing.length) {
      const payload = bulkChangesFor(task, change);
      if (!Object.keys(payload).length) item.skip = statusOnly ? `Ya está ${STATUS_LABEL[status].toLowerCase()}.` : 'Ya está así.';
      else {
        try { await gate({ db, user, taskId, payload }); }
        catch (refusal) { if (refusal.gateStatus) item.skip = refusal.message; else throw refusal; }
        if (!item.skip) {
          if (payload.status === 'REALIZADA' && task.status !== 'EN_CURSO') item.unmeasured = true;
          if (task.focusDeadlineAt) item.focus = true;
          if (task.isPrivate) item.private = true;
          if (payload.assigneeId && task.status === 'EN_CURSO') item.inProgress = true;
        }
      }
    }
    items.push(item);
  }
  const active = items.filter((item) => !item.skip);
  if (anyChange && !missing.length && !active.length) throw knowledgeError(`No queda ninguna tarea que ${statusOnly ? `pueda pasar a ${STATUS_LABEL[status].toLowerCase()}` : 'cambiar'}:\n${items.map((item) => `- ${item.title}: ${item.skip}`).join('\n')}`, 400, 'BRIA_ACTION_NOOP');

  const count = anyChange && !missing.length ? active.length : ids.length;
  const changes = bulkChangeLines(change);
  const headline = statusOnly
    ? `${count === 1 ? 'Una tarea pasa' : `${count} tareas pasan`} a **${STATUS_LABEL[status]}**:`
    : anyChange ? `${count === 1 ? 'Una tarea cambia' : `${count} tareas cambian`}:` : `${count === 1 ? 'Una tarea' : `${count} tareas`}:`;
  // Sin lote todavía (el filtro preguntó cuál persona o cliente) no hay nada que resumir: solo la pregunta.
  const summary = !ids.length ? [] : [
    ...(descripcion ? [`Lote: ${descripcion}${found && found.approximate ? ' (nombre aproximado)' : ''}`] : []),
    headline,
    ...(statusOnly ? [] : changes),
    ...(anyChange && !missing.length ? active : items).map((item) => `${item.title}${item.client ? ` · ${item.client}` : ''}${item.assignee ? ` · ${item.assignee}` : ''}${item.status ? ` (hoy ${STATUS_LABEL[item.status] || item.status})` : ''}`)
  ];
  const skipped = items.filter((item) => item.skip);
  if (skipped.length) warnings.push(`No se tocan: ${skipped.map((item) => `${item.title} (${item.skip})`).join('; ')}`);
  const unmeasured = active.filter((item) => item.unmeasured).length;
  if (unmeasured) warnings.push(`${unmeasured === 1 ? 'Una de ellas no pasó' : `${unmeasured} de ellas no pasaron`} por «En proceso»: quedarán cerradas sin tiempo medido.`);
  // Lo que conviene mirar antes de confirmar: compromiso con hora, pendientes privados y relojes en marcha.
  const focused = active.filter((item) => item.focus).map((item) => item.title);
  if (focused.length) warnings.push(`${focused.length === 1 ? 'Tiene' : 'Tienen'} compromiso con hora: ${quoteTitles(focused)}.`);
  const privates = active.filter((item) => item.private).map((item) => item.title);
  if (privates.length) warnings.push(`${privates.length === 1 ? 'Es un pendiente privado' : 'Son pendientes privados'}: ${quoteTitles(privates)}.`);
  const inProgress = active.filter((item) => item.inProgress).map((item) => item.title);
  // Reasignar una tarea en proceso (Rodny, 11 de octubre de 2026): la plataforma cierra el reloj anterior; con
  // «en proceso» pedido, el reloj pasa al nuevo responsable en el acto.
  if (inProgress.length) warnings.push(change.status === 'EN_CURSO'
    ? `${inProgress.length === 1 ? 'Está en proceso: su reloj actual se cierra con el tiempo a nombre de quien la trabajaba y el reloj pasa a' : 'Están en proceso: cada reloj actual se cierra con el tiempo a nombre de quien la trabajaba y el reloj pasa a'} ${change.assigneeName} en el acto: ${quoteTitles(inProgress)}.`
    : `${inProgress.length === 1 ? 'Está en proceso: al cambiar de responsable vuelve a Pendiente y el reloj de quien la trabajaba se cierra' : 'Están en proceso: al cambiar de responsable vuelven a Pendiente y el reloj de quien las trabajaba se cierra'} (su tiempo queda a su nombre): ${quoteTitles(inProgress)}.`);

  const title = statusOnly ? `Pasar ${count === 1 ? 'una tarea' : `${count} tareas`} a ${STATUS_LABEL[status]}` : anyChange ? `Cambiar ${count === 1 ? 'una tarea' : `${count} tareas`}` : 'Cambiar varias tareas';
  return {
    id: previous?.id || randomUUID(), ownerId: viewer, type: 'TASKS_STATUS', status: 'DRAFT',
    title, target: { taskIds: ids, ...(descripcion ? { descripcion } : {}), ...(wanted.filtro ? { filtro: wanted.filtro } : {}) }, wanted,
    payload: { status, assigneeId: change.assigneeId, assigneeName: change.assigneeName, dueDate, items: active.map(({ taskId, title: taskTitle }) => ({ taskId, title: taskTitle })) },
    summary, warnings, missing
  };
};

const executeTasksStatus = async ({ db, user, action, updateTask, gate }) => {
  const { status, items } = action.payload;
  const statusOnly = Boolean(status) && !action.payload.assigneeId && !action.payload.dueDate;
  const done = [], failed = [];
  for (const item of items) {
    try {
      // Se vuelve a mirar cada tarea justo antes: un permiso que cambió se respeta y lo ya cambiado no falla.
      const task = await db.task.findUnique({ where: { id: item.taskId }, select: TASK_SELECT });
      if (!task) { failed.push({ ...item, reason: 'Ya no existe.' }); continue; }
      const payload = bulkChangesFor(task, action.payload);
      if (!Object.keys(payload).length) { done.push({ ...item, already: true }); continue; }
      await gate({ db, user, taskId: item.taskId, payload });
      // Una por una, por la misma función que el botón: ella pone completedAt, cierra relojes, notifica y audita.
      await updateTask(item.taskId, payload, user.userId || user.id);
      done.push(item);
    } catch (failure) {
      if (!failure.gateStatus) console.error('[BriaActions] No se pudo cambiar una tarea del lote:', failure?.response?.data || failure?.message || failure);
      failed.push({ ...item, reason: failure.gateStatus ? failure.message : 'No se pudo cambiar; inténtalo desde Gestión.' });
    }
  }
  const parts = [];
  const head = statusOnly
    ? `${done.length === 1 ? 'Una tarea pasó' : `${done.length} tareas pasaron`} a ${STATUS_LABEL[status]}`
    : `${done.length === 1 ? 'Una tarea cambió' : `${done.length} tareas cambiaron`} (${bulkChangeLines(action.payload).join('; ')})`;
  if (done.length) parts.push(`${head}:\n${done.map((item) => `- ${item.title}${item.already ? ' (ya estaba)' : ''}: [abrir](/gestion?taskId=${encodeURIComponent(item.taskId)})`).join('\n')}`);
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

/* ---------------------------------------------------------------- Los tres flujos que nacieron aparte */

// Crear pendiente, despachar a producción y eliminar pendientes conservan su servicio (preparación, textos y
// escritura); aquí solo se ejecutan por la base común. Sus servicios exigen su propia frase de confirmación, así
// que se les pasa la canónica: la persona ya confirmó sobre el resumen, con «Confirmar» o con la frase de siempre.
const legacyPrepare = () => { throw knowledgeError('Esa acción se prepara con su propia herramienta.', 400, 'BRIA_ACTION_LEGACY'); };
const executeTaskCreate = async ({ user, action, taskDrafts, loadAttachment, revalidate }) => {
  if (!taskDrafts) throw knowledgeError('Crear pendientes no está disponible en esta vista.', 403);
  const draft = action.draft;
  const receipt = await taskDrafts.createConfirmedTask({ user, draft, question: LEGACY_ACTIONS.TASK_CREATE.confirmPhrase, revalidate, loadAttachment });
  const link = (id) => `/gestion?taskId=${encodeURIComponent(id)}`;
  const tasks = receipt.tasks || [{ taskId: receipt.taskId, alreadyCreated: receipt.alreadyCreated, title: draft.title, assignee: draft.assignee?.name, error: null }];
  const created = tasks.filter((row) => row.taskId);
  // Un lote (Rodny, 20 de octubre de 2026: «créame estos cinco») se cuenta de una vez; lo que no se pudo crear se dice con su motivo.
  const text = tasks.length === 1
    ? `${receipt.alreadyCreated ? 'El pendiente ya estaba creado' : 'Pendiente creado'} para ${tasks[0].assignee}. Guardé el contexto como comentario${draft.files?.length ? ' y los archivos como insumos' : ''}.\n\n[Abrir en Gestión](${link(receipt.taskId)})`
    : [`${receipt.alreadyCreated ? 'Esos pendientes ya estaban creados' : `${created.length === tasks.length ? 'Listo, creé' : 'Creé'} ${created.length} de ${tasks.length} pendientes`}:`, '',
      ...created.map((row) => `- [${row.title}](${link(row.taskId)}) para ${row.assignee}${row.alreadyCreated && !receipt.alreadyCreated ? ' (ya estaba)' : ''}`),
      ...tasks.filter((row) => !row.taskId).map((row) => `- No pude crear «${row.title}»: ${row.error}`)].join('\n');
  return {
    text, sources: created.map((row) => ({ kind: 'tarea', id: row.taskId })), toolsUsed: ['crear_pendiente'],
    patch: { draft: { ...draft, status: 'CREATED', taskId: receipt.taskId, tasks } }
  };
};
const executeDispatch = async ({ user, action, dispatchDrafts, revalidate }) => {
  if (!dispatchDrafts) throw knowledgeError('Despachar no está disponible en esta vista.', 403);
  const receipt = await dispatchDrafts.createConfirmedDispatch({ user, draft: action.draft, question: LEGACY_ACTIONS.DISPATCH.confirmPhrase, revalidate });
  return {
    text: dispatchResultText(receipt.results), sources: receipt.results.filter((row) => row.taskId).map((row) => ({ kind: 'tarea', id: row.taskId })), toolsUsed: ['despachar_a_produccion'],
    patch: { draft: { ...action.draft, status: 'DONE', results: receipt.results } }
  };
};
const executeTaskDelete = async ({ user, action, deleteDrafts, revalidate }) => {
  if (!deleteDrafts) throw knowledgeError('Eliminar no está disponible en esta vista.', 403);
  const receipt = await deleteDrafts.createConfirmedDelete({ user, draft: action.draft, question: LEGACY_ACTIONS.TASK_DELETE.confirmPhrase, revalidate });
  return { text: deleteResultText(receipt.results), sources: [], toolsUsed: ['eliminar_pendiente'], patch: { draft: { ...action.draft, status: 'DONE', results: receipt.results } } };
};

/* ---------------------------------------------------------------- Los compromisos de una reunión, a pendientes */

// Rodny, 14 de octubre de 2026 (segundo punto del plan «llevar a Bria a más niveles»): «cuando analiza una reunión,
// que prepare los pendientes que salieron de ahí, con responsable y fecha propuestos, y tú confirmas». La minuta ya
// trae los compromisos; aquí se vuelven pendientes numerados: el cliente sale del título (o se pregunta), el
// responsable del equipo se busca por el nombre que anotó la reunión (sin adivinar: dos Melissas es una pregunta),
// la fecha es la de la reunión o la que diga la persona. Cada compromiso recuerda su tarea (`taskId` en
// `actionItems`): confirmar dos veces no crea dos veces.
const MINUTE_SELECT = { id: true, title: true, meetingAt: true, status: true, actionItems: true };
const minuteOption = (row) => `${row.title} (${dayLabel(bogotaDate(row.meetingAt))})`;
const listNumbers = (numbers) => (numbers.length <= 1 ? numbers.join('') : `${numbers.slice(0, -1).join(', ')} y ${numbers.at(-1)}`);
const noneOf = (value) => /^sin (cliente|fecha|responsable)$/.test(fold(value));

const findMinute = async (db, term, previousId) => {
  if (!term) return previousId ? { minute: await db.meetingMinute.findFirst({ where: { id: previousId, deletedAt: null }, select: MINUTE_SELECT }) } : { minute: null };
  const byId = await db.meetingMinute.findFirst({ where: { id: term, deletedAt: null }, select: MINUTE_SELECT });
  if (byId) return { minute: byId };
  const rows = await db.meetingMinute.findMany({ where: { deletedAt: null, status: 'READY', title: { contains: term, mode: 'insensitive' } }, select: MINUTE_SELECT, orderBy: { meetingAt: 'desc' }, take: 6 });
  let found = rows, approximate = false;
  if (!rows.length) {
    const recent = await db.meetingMinute.findMany({ where: { deletedAt: null, status: 'READY' }, select: MINUTE_SELECT, orderBy: { meetingAt: 'desc' }, take: 40 });
    found = rankByName(recent, term, (row) => row.title); approximate = found.length > 0;
  }
  if (!found.length) return { minute: null, rows: [] };
  if (found.length === 1) return { minute: found[0], approximate };
  const exact = found.filter((row) => same(row.title, term));
  if (exact.length === 1) return { minute: exact[0] };
  return { minute: null, rows: found.slice(0, 6) };
};

const prepareMinuteTasks = async ({ db, user, args, previous, today }) => {
  const owner = user.userId || user.id;
  const wanted = { ...(previous?.wanted || {}), ajustes: { ...(previous?.wanted?.ajustes || {}) } };
  for (const key of ['reunion', 'cliente', 'fecha']) if (args[key] != null && tidy(args[key])) wanted[key] = tidy(args[key]);
  for (const adj of Array.isArray(args.ajustes) ? args.ajustes : []) {
    const n = Number(adj?.n);
    if (!Number.isInteger(n) || n < 1) continue;
    const current = { ...(wanted.ajustes[n] || {}) };
    if (adj.omitir === true) current.omitir = true;
    if (adj.responsable != null && tidy(adj.responsable)) { current.responsable = tidy(adj.responsable); delete current.omitir; }
    if (adj.fecha != null && tidy(adj.fecha)) current.fecha = tidy(adj.fecha);
    wanted.ajustes[n] = current;
  }
  const missing = [], warnings = [];
  const base = (extra) => ({ id: previous?.id || randomUUID(), ownerId: owner, type: 'MINUTE_TASKS', status: 'DRAFT', wanted, ...extra });

  // La reunión: por id, por título o por parecido; con varias, se pregunta cuál.
  const term = args.reunion != null && tidy(args.reunion) ? tidy(args.reunion).slice(0, 200) : null;
  const { minute, rows = [], approximate } = await findMinute(db, term, previous?.target?.minuteId);
  if (!minute) {
    if (rows.length) return base({ title: 'Pendientes de una reunión', target: {}, payload: { items: [] }, summary: [], warnings, missing: [{ field: 'reunion', question: '¿Cuál reunión?', options: rows.map(minuteOption) }] });
    if (term) throw knowledgeError(`No encontré una reunión que se llame «${term}». Búscala con memoria_de_reuniones o dime su título exacto.`, 404, 'BRIA_ACTION_MINUTE');
    throw knowledgeError('Dime de qué reunión: su título o su id (de memoria_de_reuniones).', 400, 'BRIA_ACTION_TARGET');
  }
  if (minute.status !== 'READY') throw knowledgeError(`${minuteLabel(minute)} todavía no tiene minuta analizada.`, 409, 'BRIA_ACTION_MINUTE');
  if (approximate) warnings.push(`La reunión la encontré por parecido: ${minuteLabel(minute)}.`);
  const all = minuteItems(minute, today);
  if (!all.length) throw knowledgeError(`La minuta de ${minuteLabel(minute)} no trae compromisos.`, 404, 'BRIA_ACTION_MINUTE');
  const already = all.filter((item) => item.taskId);

  // El cliente: el que dijo la persona, el que nombra el título, o se pregunta.
  let client = null, clientNote = '';
  if (wanted.cliente) {
    if (noneOf(wanted.cliente)) client = { none: true };
    else {
      const found = await findClientByTerm(db, wanted.cliente.slice(0, 160));
      if (!found.rows.length) throw knowledgeError(`No encontré un cliente que se llame «${wanted.cliente}».`, 404, 'BRIA_ACTION_CLIENT');
      if (!found.chosen) missing.push({ field: 'cliente', question: `¿Cuál ${wanted.cliente}?`, options: [...new Set(found.rows.map((row) => row.name))] });
      else client = found.chosen;
    }
  } else {
    const guessed = guessClient(minute, await db.client.findMany({ where: { isArchived: false }, select: { id: true, name: true, slug: true }, take: 500 }));
    if (guessed) { client = guessed; clientNote = ' (por el título de la reunión)'; }
    else missing.push({ field: 'cliente', question: '¿De qué cliente son estos pendientes?', options: ['Sin cliente'] });
  }

  // Cada compromiso: responsable del equipo, fecha, prioridad; lo omitido y lo ya creado quedan aparte.
  const members = await db.teamMember.findMany({ where: { isActive: true }, select: { id: true, name: true, email: true, userId: true } });
  const rank = (rows, name) => rankByName(rows, name, (row) => row.name);
  const items = [], omitted = [], noDate = [];
  let badDate = null;
  for (const item of all) {
    if (item.taskId) continue;
    const adj = wanted.ajustes[item.n] || {};
    if (adj.omitir) { omitted.push(item); continue; }
    let assignee = null, ownerProblem = null;
    if (adj.responsable) {
      if (noneOf(adj.responsable)) ownerProblem = 'La reunión no dice quién y pediste dejarlo sin responsable: un pendiente necesita responsable.';
      else { assignee = matchOwner(adj.responsable, members, rank); if (!assignee) ownerProblem = `«${adj.responsable}» no está en el equipo.`; }
    } else if (item.owner) {
      assignee = matchOwner(item.owner, members, rank);
      if (!assignee) ownerProblem = `«${item.owner}» no está en el equipo.`;
      else if (!same(assignee.name, item.owner)) warnings.push(`«${item.owner}» lo entendí como ${assignee.name}.`);
    } else ownerProblem = 'La reunión no dice quién.';
    let dueDay = null;
    if (adj.fecha) { dueDay = noneOf(adj.fecha) ? null : resolveTaskDate(adj.fecha, today); if (!noneOf(adj.fecha) && !dueDay) badDate = adj.fecha; }
    else if (item.dueDay) dueDay = item.dueDay;
    else if (wanted.fecha) { dueDay = noneOf(wanted.fecha) ? null : resolveTaskDate(wanted.fecha, today); if (!noneOf(wanted.fecha) && !dueDay) badDate = wanted.fecha; }
    else noDate.push(item.n);
    items.push({ ...item, assignee, ownerProblem, dueDay });
  }
  if (!items.length) throw knowledgeError(`No queda ningún compromiso por crear de ${minuteLabel(minute)}${already.length ? ': los demás ya son pendientes' : ''}.`, 400, 'BRIA_ACTION_NOOP');
  if (badDate) missing.push({ field: 'fecha', question: `No entendí la fecha «${badDate}». Dime un día concreto, como «viernes» o «17 de octubre», o «sin fecha».` });
  else if (noDate.length) missing.push({ field: 'fecha', question: `${noDate.length === 1 ? `El compromiso ${noDate[0]} no trae fecha` : `${noDate.length} compromisos no traen fecha (${listNumbers(noDate)})`}. ¿Qué fecha ${noDate.length === 1 ? 'le' : 'les'} pongo?`, options: ['Mañana', 'Viernes', 'Sin fecha'] });
  const unassigned = items.find((item) => !item.assignee);
  if (unassigned) missing.push({ field: 'responsable', question: `¿A quién le asigno el compromiso ${unassigned.n}, «${unassigned.title}»? ${unassigned.ownerProblem}`, options: [...members.map((row) => row.name).sort((a, b) => a.localeCompare(b, 'es')).slice(0, 6), 'Omitirlo'] });

  const summary = [`Reunión: **${minuteLabel(minute)}**`, client ? (client.none ? 'Cliente: sin cliente' : `Cliente: **${client.name}**${clientNote}`) : 'Cliente: por definir'];
  summary.push(`Pendientes que se crean (${items.length}):`, ...items.map((item) => `${item.n}. «${item.title}» → ${item.assignee?.name || 'sin responsable'}${item.dueDay ? ` · ${dayLabel(item.dueDay)}` : ' · sin fecha'}${item.priority !== 'NORMAL' ? ` · prioridad ${PRIORITY_LABEL[item.priority]}` : ''}`));
  if (omitted.length) warnings.push(`No se crea${omitted.length > 1 ? 'n' : ''} (lo pediste): ${omitted.map((item) => `${item.n} «${item.title}»`).join(', ')}.`);
  if (already.length) warnings.push(`Ya son pendientes: ${already.map((item) => `${item.n} [${item.title}](/gestion?taskId=${encodeURIComponent(item.taskId)})`).join(', ')}.`);
  return base({
    title: `Crear ${items.length === 1 ? 'un pendiente' : `${items.length} pendientes`} de la reunión`,
    target: { minuteId: minute.id, title: minute.title },
    payload: { minuteId: minute.id, clientId: client && !client.none ? client.id : null, items: items.map((item) => ({ n: item.n, title: item.title, owner: item.owner, assigneeId: item.assignee?.id || null, assigneeName: item.assignee?.name || null, assigneeUserId: item.assignee?.userId || null, dueDate: item.dueDay ? `${item.dueDay}T12:00:00.000Z` : null, priority: item.priority })) },
    summary, warnings, missing
  });
};

const executeMinuteTasks = async ({ db, user, action, createTask, notify }) => {
  if (!createTask) throw knowledgeError('Crear pendientes no está disponible en esta vista.', 403);
  const { minuteId, clientId, items } = action.payload;
  const minute = await db.meetingMinute.findFirst({ where: { id: minuteId, deletedAt: null }, select: { id: true, title: true, meetingAt: true, actionItems: true } });
  if (!minute) throw knowledgeError('Esa reunión ya no está.', 404, 'BRIA_ACTION_MINUTE');
  const stored = Array.isArray(minute.actionItems) ? minute.actionItems.map((row) => ({ ...row })) : [];
  const done = [], failed = [];
  for (const item of items) {
    const slot = stored[item.n - 1];
    // Se vuelve a mirar cada compromiso justo antes: lo ya creado no se repite.
    if (slot?.taskId) { done.push({ ...item, taskId: slot.taskId, already: true }); continue; }
    try {
      const task = await createTask({ title: item.title, clientId: clientId || null, assigneeId: item.assigneeId || null, creatorId: user.userId || user.id, dueDate: item.dueDate || null, status: 'PENDIENTE', priority: item.priority, isPriority: item.priority !== 'NORMAL', comments: '', initial_comments: [{ content: minuteTaskContext(minute, item) }] });
      if (slot) { slot.taskId = task.id; await db.meetingMinute.update({ where: { id: minute.id }, data: { actionItems: stored } }); }
      done.push({ ...item, taskId: task.id });
      if (notify && item.assigneeUserId && item.assigneeUserId !== (user.userId || user.id)) {
        try { await notify({ userId: item.assigneeUserId, type: 'TASK_ASSIGNED', relatedId: task.id, message: `Se te asignó un pendiente: ${item.title}` }); }
        catch (failure) { console.error('[BriaActions] No se pudo avisar al responsable:', failure?.response?.data || failure?.message || failure); }
      }
    } catch (failure) {
      console.error('[BriaActions] No se pudo crear un pendiente de la reunión:', failure?.response?.data || failure?.message || failure);
      failed.push({ ...item, reason: failure?.message || 'No se pudo crear.' });
    }
  }
  const created = done.filter((row) => !row.already), already = done.filter((row) => row.already);
  const line = (row) => `- [${row.title}](/gestion?taskId=${encodeURIComponent(row.taskId)})${row.assigneeName ? ` · ${row.assigneeName}` : ''}${row.dueDate ? ` · ${dayLabel(row.dueDate.slice(0, 10))}` : ''}`;
  const parts = [];
  if (created.length) parts.push(`Creé ${created.length === 1 ? 'un pendiente' : `${created.length} pendientes`} de la reunión «${minute.title}»:\n${created.map(line).join('\n')}`);
  if (already.length) parts.push(`${already.length === 1 ? 'Uno ya estaba creado' : `${already.length} ya estaban creados`}:\n${already.map(line).join('\n')}`);
  if (failed.length) parts.push(`**No se crearon**\n${failed.map((row) => `- ${row.title}: ${row.reason}`).join('\n')}`);
  return { text: parts.join('\n\n') || 'No se creó ningún pendiente.', sources: done.map((row) => ({ kind: 'tarea', id: row.taskId, label: row.title, url: `/gestion?taskId=${row.taskId}` })) };
};

/* ---------------------------------------------------------------- La parrilla del mes en borrador */

// Rodny, 14 de octubre de 2026 (tercer punto del plan; opción 2): «yo podría pedirle que necesito la parrilla de tal y
// que el cliente me comunicó que le gustaría tales énfasis … y basado en ello montarme las piezas y desde el chat
// enviarlas a parrilla como borrador, las que yo quiera». El modelo propone (contrato, objetivo, criterios aprobados,
// mes anterior, énfasis); el código manda (`validatePlanDraft`); la propuesta se guarda en la acción para que omitir o
// elegir no vuelva a preguntarle al modelo; «Confirmar» envía solo las piezas elegidas, en borrador, por
// `createContentItem`, y crea antes la parrilla si no existe (con responsable y objetivo, como `crear_parrilla`).
const DRAFT_PLAN_SELECT = { id: true, status: true, strategicObjectives: true, ownerId: true, contentItems: { where: { deletedAt: null }, select: { id: true, objective: true, format: true, publishDate: true, status: true } } };
const draftPiecesOf = (plan) => (plan?.contentItems || []).map((item) => ({ objective: item.objective, format: item.format, day: planDayOf(item.publishDate), status: item.status || null }));
const numbersOf = (value) => (Array.isArray(value) ? value.map(Number).filter((n) => Number.isInteger(n) && n > 0) : []);

const preparePlanDraft = async ({ db, user, args, previous, today, generate, operations }) => {
  const owner = user.userId || user.id;
  const clientId = tidy(args.clientId) || previous?.target?.clientId;
  if (!clientId) throw knowledgeError('Falta el cliente: búscalo primero con buscar_cliente y pásame su id.', 400, 'BRIA_ACTION_TARGET');
  const client = await db.client.findUnique({ where: { id: clientId }, select: { id: true, name: true, slug: true, isArchived: true, responsible: { select: { id: true, name: true } }, projectManager: { select: { id: true, name: true } } } });
  if (!client) throw knowledgeError('Ese cliente no existe.', 404, 'BRIA_ACTION_TARGET');
  if (client.isArchived) throw knowledgeError(`${client.name} está archivado: no se le proponen parrillas.`, 400, 'BRIA_ACTION_ARCHIVED');

  const wanted = { ...(previous?.wanted || {}) };
  for (const key of ['mes', 'anio', 'responsable', 'objetivo']) if (args[key] != null && tidy(args[key])) wanted[key] = tidy(args[key]);
  let regenerate = args.rehacer === true || !wanted.propuesta;
  if (args.enfasis != null && tidy(args.enfasis) && !String(wanted.enfasis || '').includes(tidy(args.enfasis))) { wanted.enfasis = [wanted.enfasis, tidy(args.enfasis)].filter(Boolean).join('\n'); regenerate = true; }
  if (Number.isInteger(Number(args.piezas)) && Number(args.piezas) > 0 && Number(args.piezas) !== wanted.piezas) { wanted.piezas = Math.min(Number(args.piezas), PLAN_DRAFT_MAX_PIECES); regenerate = true; }
  const month = parseMonth(wanted.mes, today) || (previous?.target?.month ?? null);
  if (!month) throw knowledgeError('¿De qué mes es la parrilla? Dime el mes, por ejemplo «noviembre».', 400, 'BRIA_ACTION_MONTH');
  const year = Number(wanted.anio) > 2000 ? Number(wanted.anio) : (previous?.target?.year || (month < Number(today.slice(5, 7)) ? Number(today.slice(0, 4)) + 1 : Number(today.slice(0, 4))));
  const label = planMonthLabel(month, year);
  const plan = await db.contentPlan.findFirst({ where: { clientId, month, year, deletedAt: null }, select: DRAFT_PLAN_SELECT });
  if (plan?.status === 'FINALIZADO') throw knowledgeError(`La parrilla de ${client.name} de ${label} ya está finalizada: no recibe piezas nuevas.`, 400, 'BRIA_ACTION_CLOSED');
  const missing = [], warnings = [];

  // Sin parrilla, se crea al confirmar, con las mismas buenas prácticas de crear_parrilla: responsable y objetivo.
  let planOwner = null, objective = plan?.strategicObjectives || null;
  if (!plan) {
    const suggested = [client.responsible, client.projectManager].filter(Boolean).filter((row, index, all) => all.findIndex((other) => other.id === row.id) === index);
    if (wanted.responsable) {
      const people = await findPeople(db, wanted.responsable.slice(0, 160));
      planOwner = pickPerson(people, wanted.responsable);
      if (!planOwner) {
        if (people.length) missing.push({ field: 'responsable', question: `¿Cuál ${wanted.responsable}?`, options: people.map((row) => row.name) });
        else throw knowledgeError(`No encontré a nadie activo en el equipo que se llame «${wanted.responsable}».`, 404, 'BRIA_ACTION_PERSON');
      }
    } else missing.push({ field: 'responsable', question: `No existe la parrilla de ${label}: la creo al confirmar. ¿Quién será la responsable?`, options: suggested.map((row) => row.name) });
    if (wanted.objetivo) objective = /^usar el .nfasis como objetivo$/i.test(fold(wanted.objetivo).replace(/\s+/g, ' ')) || same(wanted.objetivo, 'Usar el énfasis como objetivo') ? tidy(wanted.enfasis).split('\n')[0] : wanted.objetivo;
    else missing.push({ field: 'objetivo', question: '¿Cuál es el objetivo estratégico del mes? Es lo que guía cada pieza y lo que Bria revisa después.', options: wanted.enfasis ? ['Usar el énfasis como objetivo'] : [] });
  }

  // El contrato y los criterios aprobados: lo que el modelo tiene que respetar.
  let contract = null, criteria = [];
  try { contract = (await operations?.getOperation?.(client.slug))?.contract || null; } catch (error) { console.error('[BriaActions] Sin contrato para la propuesta:', error?.message || error); }
  try { criteria = await db.clientEditorialCriterion.findMany({ where: { clientId, status: 'APPROVED', scope: 'CLIENT' }, select: { category: true, text: true }, orderBy: [{ category: 'asc' }, { updatedAt: 'desc' }], take: 40 }); } catch (error) { console.error('[BriaActions] Sin criterios para la propuesta:', error?.message || error); }
  const quota = (contract?.deliverables || []).reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
  const existing = draftPiecesOf(plan);
  const count = Math.max(1, Math.min(PLAN_DRAFT_MAX_PIECES, wanted.piezas || (quota ? quota - existing.length : PLAN_DRAFT_DEFAULT_PIECES)));
  const summary = [`Parrilla: **${client.name}**, ${label}${plan ? ` (ya tiene ${existing.length === 1 ? '1 pieza' : `${existing.length} piezas`})` : ' (nueva)'}`];
  if (objective) summary.push(`Objetivo: ${objective}`);
  if (wanted.enfasis) summary.push(`Énfasis: ${tidy(wanted.enfasis).slice(0, 300)}`);
  const base = (extra) => ({ id: previous?.id || randomUUID(), ownerId: owner, type: 'PLAN_DRAFT', status: 'DRAFT', target: { clientId, clientName: client.name, slug: client.slug, month, year, planId: plan?.id || null }, wanted, ...extra });
  if (missing.length) return base({ title: `Proponer la parrilla de ${client.name} para ${label}`, payload: { pieces: [] }, summary, warnings, missing });

  // La propuesta: una vez por énfasis; omitir o elegir piezas no vuelve a preguntarle al modelo.
  if (regenerate) {
    const previousPlans = await db.contentPlan.findMany({ where: { clientId, deletedAt: null }, orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 3, select: { id: true, month: true, year: true, strategicObjectives: true, contentItems: { where: { deletedAt: null }, select: { objective: true, format: true, publishDate: true, status: true } } } });
    const last = previousPlans.find((row) => !(row.month === month && row.year === year)) || null;
    const digest = buildPlanDraftDigest({ client, month, year, objective, contract, criteria, previous: last ? { month: last.month, year: last.year, strategicObjectives: last.strategicObjectives, pieces: draftPiecesOf(last) } : null, existing, emphasis: wanted.enfasis || '', count });
    let answer;
    try { answer = await generate(buildPlanDraftRequest({ digest, count })); }
    catch (error) { console.error('[BriaActions] El modelo no armó la propuesta:', error?.message || error); throw knowledgeError('No pude armar la propuesta ahora: el modelo no respondió. Inténtalo en un momento.', 503, 'BRIA_ACTION_MODEL'); }
    const { pieces, note, dropped } = validatePlanDraft(parsePlanDraft(answer.text), { month, year, count });
    if (!pieces.length) throw knowledgeError('El modelo no propuso piezas que sirvan para ese mes. Dime más del énfasis y lo intento de nuevo.', 422, 'BRIA_ACTION_MODEL');
    wanted.propuesta = { pieces, note, dropped: dropped.length, model: answer.model || null };
    wanted.omitir = []; wanted.solo = null;
  }
  const omitted = new Set([...(wanted.omitir || []), ...numbersOf(args.omitir)]);
  wanted.omitir = [...omitted];
  if (numbersOf(args.solo).length) wanted.solo = numbersOf(args.solo);
  const all = wanted.propuesta.pieces;
  const selected = all.filter((piece) => !omitted.has(piece.n) && (!wanted.solo || wanted.solo.includes(piece.n)));
  if (!selected.length) throw knowledgeError('No queda ninguna pieza elegida: quita alguna de las omitidas o pídeme otra propuesta (rehacer).', 400, 'BRIA_ACTION_NOOP');
  const left = all.filter((piece) => !selected.includes(piece)).map((piece) => piece.n);
  summary.push(`Propuesta: ${selected.length === 1 ? '1 pieza' : `${selected.length} piezas`} en borrador${left.length ? ` (${left.length === 1 ? '1 omitida' : `${left.length} omitidas`}: ${left.join(', ')})` : ''}`, ...selected.map(pieceLine));
  if (wanted.propuesta.note) warnings.push(`Nota de Bria para el equipo: ${wanted.propuesta.note}`);
  if (wanted.propuesta.dropped) warnings.push(`El modelo propuso ${wanted.propuesta.dropped} ${wanted.propuesta.dropped === 1 ? 'pieza que no entró' : 'piezas que no entraron'} (fuera del mes, formato que no existe o repetida).`);
  warnings.push('Cada pieza lleva su idea para el equipo y el texto de publicación: se revisan en la parrilla antes de mandarlos al cliente.');
  return base({
    title: `Enviar ${selected.length === 1 ? 'una pieza' : `${selected.length} piezas`} en borrador a la parrilla de ${client.name} (${label})`,
    payload: { clientId, month, year, planId: plan?.id || null, newPlan: plan ? null : { ownerId: planOwner?.id || null, ownerName: planOwner?.name || null, strategicObjectives: objective }, emphasis: wanted.enfasis || '', pieces: selected },
    summary, warnings, missing
  });
};

const executePlanDraft = async ({ db, action, createContentPlan, updateContentPlan, createContentItem }) => {
  const { clientId, month, year, newPlan, emphasis, pieces } = action.payload;
  const label = planMonthLabel(month, year);
  let planId = action.payload.planId, createdPlan = false;
  if (!planId) {
    const existing = await db.contentPlan.findFirst({ where: { clientId, month, year, deletedAt: null }, select: { id: true } });
    if (existing) planId = existing.id;
    else {
      const plan = await createContentPlan({ clientId, month, year, strategicObjectives: newPlan?.strategicObjectives || null });
      if (newPlan?.ownerId) await updateContentPlan(plan.id, { ownerId: newPlan.ownerId });
      planId = plan.id; createdPlan = true;
    }
  }
  const done = [], failed = [];
  for (const piece of pieces) {
    try {
      const item = await createContentItem({ planId, objective: piece.objective, format: piece.format, copyText: piece.idea || '', captionText: piece.caption || '', publishDate: new Date(`${piece.day}T12:00:00.000Z`), status: 'BORRADOR', internalNotes: `Propuesta de Bria para ${label}${emphasis ? ` · Énfasis: ${tidy(emphasis).slice(0, 300)}` : ''}${piece.why ? ` · ${piece.why}` : ''}` });
      done.push({ ...piece, id: item.id });
    } catch (failure) {
      console.error('[BriaActions] No se pudo crear una pieza de la propuesta:', failure?.response?.data || failure?.message || failure);
      failed.push({ ...piece, reason: failure?.message || 'No se pudo crear.' });
    }
  }
  const line = (piece) => `- ${pieceLine(piece).replace(/^\d+\. /, '').split(' · «')[0]} · [${piece.objective}](/parrillas/${planId}?item=${piece.id})`;
  const parts = [`Listo: ${createdPlan ? `creé la parrilla de **${action.target.clientName}** para ${label}${newPlan?.ownerName ? ` con ${newPlan.ownerName} como responsable` : ''} y ` : ''}envié ${done.length === 1 ? 'una pieza' : `${done.length} piezas`} en borrador${createdPlan ? '' : ` a la parrilla de **${action.target.clientName}** (${label})`}:\n${done.map(line).join('\n')}`];
  if (failed.length) parts.push(`**No se crearon**\n${failed.map((piece) => `- ${piece.objective}: ${piece.reason}`).join('\n')}`);
  parts.push(`[Abrir la parrilla](/parrillas/${planId})`);
  return { text: parts.join('\n\n'), sources: [{ kind: 'parrilla', id: planId, label: `Parrilla de ${action.target.clientName}`, url: `/parrillas/${planId}` }, ...done.map((piece) => ({ kind: 'pieza', id: piece.id, label: piece.objective, url: `/parrillas/${planId}?item=${piece.id}` }))] };
};

/* ---------------------------------------------------------------- Servicio */

const defaultGenerate = async (request) => {
  const result = await createOpenAIClient({ models: AI_MODELS }).generate(request);
  return { text: result.text, model: result.model, usage: result.usage || null };
};

const TYPES = {
  MINUTE_TASKS: { prepare: prepareMinuteTasks, execute: executeMinuteTasks },
  PLAN_DRAFT: { prepare: preparePlanDraft, execute: executePlanDraft },
  TASK_UPDATE: { prepare: prepareTaskUpdate, execute: executeTaskUpdate },
  TASKS_STATUS: { prepare: prepareTasksStatus, execute: executeTasksStatus },
  CREATE_PLAN: { prepare: preparePlan, execute: executePlan },
  CREATE_ITEM: { prepare: prepareItem, execute: executeItem },
  MOVE_ITEM: { prepare: prepareMoveItem, execute: executeMoveItem },
  CLIENT_NOTE: { prepare: prepareClientNote, execute: executeClientNote },
  TASK_CREATE: { prepare: legacyPrepare, execute: executeTaskCreate },
  DISPATCH: { prepare: legacyPrepare, execute: executeDispatch },
  TASK_DELETE: { prepare: legacyPrepare, execute: executeTaskDelete }
};

/* ---------------------------------------------------------------- Cualquier operación del mapa de la plataforma */

// Rodny, 10 de octubre de 2026: «quiero que Bria tenga permiso para todo en la plataforma, ella vive ahí». Lo que
// no tiene herramienta propia se hace por la API, con la sesión de la persona. Aquí solo se arma el resumen y se
// comprueba, de entrada, lo que la ruta pide (módulo, rol); la API vuelve a comprobarlo al ejecutar.
const renderValue = (value) => Array.isArray(value) ? value.map(renderValue).join(', ') : value && typeof value === 'object' ? JSON.stringify(value) : String(value);
const platformPermissionProblem = (user, permission) => {
  if (!permission) return null;
  const module = (permission.modules || []).find((name) => !hasModulePermission(user, name));
  if (module) return `Necesitas el módulo ${MODULE_LABEL[module] || module} para eso.`;
  const role = (permission.roles || []).find((name) => name === 'MANAGER' ? !isManagerRole(user.role) : String(user.role || '').toUpperCase() !== name);
  if (role) return role === 'MANAGER' ? 'Eso es de administradores y project managers.' : `Eso es solo de ${role === 'ADMIN' ? 'administradores' : role}.`;
  return null;
};

const preparePlatform = async ({ user, args, previous, routePermissions }) => {
  const method = tidy(args.metodo || args.method).toUpperCase();
  const path = tidy(args.ruta || args.path);
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) throw knowledgeError('Para leer usa consultar_plataforma; operar_en_plataforma es para POST, PUT, PATCH o DELETE.', 400, 'BRIA_PLATFORM_METHOD');
  const key = `${method} ${path.split('?')[0]}`;
  const excluded = isExcludedOperation(`${method} ${matchOperation(method, path)?.path || path.split('?')[0]}`);
  const operation = matchOperation(method, path);
  if (!operation) {
    if (excluded) throw knowledgeError(`Eso no se hace desde el chat (${excluded.reason}): se hace en la pantalla.`, 403, 'BRIA_PLATFORM_EXCLUDED');
    throw knowledgeError(`No encuentro «${key}» en el mapa de la plataforma. Búscala con mapa_de_plataforma; si no existe, no se puede hacer desde aquí.`, 404, 'BRIA_PLATFORM_UNKNOWN');
  }
  const permission = (await routePermissions?.(operation.key)) || null;
  const problem = platformPermissionProblem(user, permission);
  if (problem) throw knowledgeError(problem, 403, 'BRIA_PLATFORM_FORBIDDEN');
  const body = args.cuerpo && typeof args.cuerpo === 'object' && !Array.isArray(args.cuerpo) ? args.cuerpo : (args.body && typeof args.body === 'object' ? args.body : null);
  const intent = tidy(args.que_hace || args.intent).slice(0, 200);
  if (!intent) throw knowledgeError('Dime en una frase qué va a hacer esta operación, con las palabras de la persona (que_hace).', 400, 'BRIA_PLATFORM_INTENT');
  const summary = [intent, `Operación: ${operation.que}`, ...Object.entries(operation.params || {}).map(([name, value]) => `${name}: ${value}`), ...Object.entries(body || {}).map(([name, value]) => `${name}: ${renderValue(value)}`)];
  const warnings = [];
  if (method === 'DELETE') warnings.push('Es un borrado: si la plataforma no lo deja deshacer, no se deshace.');
  if (operation.key.startsWith('POST /financials') || operation.key.startsWith('PUT /financials') || operation.key.startsWith('PATCH /financials')) warnings.push('Es dinero: revisa el importe y la fecha antes de confirmar.');
  if (operation.campos && !body && ['POST', 'PUT', 'PATCH'].includes(method)) warnings.push(`Va sin cuerpo; esta operación suele llevar: ${operation.campos}.`);
  return {
    id: previous?.id || randomUUID(), ownerId: user.userId || user.id, type: 'PLATFORM', status: 'DRAFT',
    title: intent, target: { key: operation.key, path: path.split('?')[0] }, wanted: {}, permission,
    payload: { method, path: path.split('?')[0], body }, summary, warnings, missing: []
  };
};

const executePlatform = async ({ user, action, platform, session, routePermissions }) => {
  const operation = matchOperation(action.payload.method, action.payload.path);
  if (!operation) throw knowledgeError('Esa operación ya no está en el mapa de la plataforma.', 404, 'BRIA_PLATFORM_UNKNOWN');
  const problem = platformPermissionProblem(user, (await routePermissions?.(operation.key)) || action.permission);
  if (problem) throw knowledgeError(problem, 403, 'BRIA_PLATFORM_FORBIDDEN');
  const result = await platform.call({ token: session?.token, method: action.payload.method, path: action.payload.path, body: action.payload.body ?? undefined });
  if (!result.ok) throw knowledgeError(`La plataforma no lo aceptó: ${result.error}`, result.status >= 400 && result.status < 500 ? result.status : 502, 'BRIA_PLATFORM_REJECTED');
  const detail = result.data && typeof result.data === 'object' ? result.text.slice(0, 1500) : '';
  return { text: `Listo: ${action.title}.${detail ? `\n\nLo que respondió la plataforma (datos): ${detail}` : ''}`, sources: [] };
};

// `gate` es la puerta de actualizar una tarea (`checkTaskUpdate`); se inyecta solo para probar sus negativas.
export const createBriaActionService = ({ db, updateTask, createTask = null, notify = null, createContentPlan, updateContentPlan, createContentItem, updateContentItem, addObservation, taskDrafts = null, dispatchDrafts = null, deleteDrafts = null, platform = null, routePermissions = null, gate = checkTaskUpdate, generate = defaultGenerate, operations = clientOperationsService, now = () => new Date(), readOnly = false } = {}) => ({
  async prepare({ user, type, args = {}, previous }) {
    if (type === 'PLATFORM') {
      if (!canUseBria(user)) throw knowledgeError('Bria no está activada para tu cuenta.', 403, 'BRIA_ACTION_FORBIDDEN');
      return preparePlatform({ user, args, previous, routePermissions });
    }
    authorize(user, type);
    const owner = user.userId || user.id;
    // Solo se continúa una acción del mismo tipo, de la misma persona y sin cerrar; lo demás arranca de cero.
    const ongoing = previous && previous.status === 'DRAFT' && previous.type === type && previous.ownerId === owner && args.nuevo !== true ? previous : null;
    return TYPES[type].prepare({ db, user, args, previous: ongoing, today: bogotaDate(now()), gate, generate, operations });
  },

  // `loadAttachment` solo lo usa crear pendiente (los archivos del chat pasan a insumos de la tarea).
  async execute({ user, action, revalidate, session = null, loadAttachment = null }) {
    const isPlatform = action?.type === 'PLATFORM';
    if (!action?.type || (!TYPES[action.type] && !isPlatform)) throw knowledgeError('Esa acción no existe.', 400, 'BRIA_ACTION_UNKNOWN');
    if (isPlatform) { if (!canUseBria(user)) throw knowledgeError('Bria no está activada para tu cuenta.', 403, 'BRIA_ACTION_FORBIDDEN'); } else authorize(user, action.type);
    if (readOnly) throw knowledgeError('Esta vista solo prepara acciones. Hazlo desde la plataforma.', 403);
    if (action.ownerId !== (user.userId || user.id)) throw knowledgeError('Esta acción la preparó otra persona.', 403, 'BRIA_ACTION_OWNER');
    if (action.status !== 'DRAFT' || action.missing?.length) throw knowledgeError('Primero completa la acción y confírmala sobre su resumen.', 400, 'BRIA_ACTION_NOT_READY');
    await revalidate?.();
    if (isPlatform) {
      if (!platform) throw knowledgeError('Esta vista no puede operar en la plataforma.', 403);
      return executePlatform({ user, action, platform, session, routePermissions });
    }
    authorize(user, action.type);
    return TYPES[action.type].execute({ db, user, action, updateTask, createTask, notify, createContentPlan, updateContentPlan, createContentItem, updateContentItem, addObservation, taskDrafts, dispatchDrafts, deleteDrafts, loadAttachment, revalidate, gate });
  }
});
