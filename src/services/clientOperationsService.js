/**
 * Operación de clientes (2 de octubre de 2026). Rodny: «lo que dice la plataforma es lo que se refleja en
 * la operación». El avance de cada mes se calcula con las parrillas, sus piezas, la programación en Meta y
 * las tareas; nada de eso se escribe a mano. Lo único que este servicio guarda es lo que la plataforma no
 * puede saber sola: la ficha operativa, el contrato y que el informe de un mes se entregó.
 */
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { bogotaDate } from '../lib/colombiaBusinessDays.js';
import {
  cycleForDate, cycleOf, previousCycle, summarizeCycle, evaluateClientOperation, isMeasured,
  normalizeOperationProfile, MONTH_NAMES,
} from '../lib/clientOperations.js';
import { CLOSE_NOTE_MAX, canConfirmClose, closeSnapshot, reportProblem } from '../lib/monthlyClose.js';
import { authorizationProblem } from '../lib/unbackedWork.js';
import { asOperationPiece } from '../lib/externalPlan.js';
import { userHasArea } from './teamAreaService.js';

const httpError = (status, message, extra = {}) => Object.assign(new Error(message), { status, ...extra });

const OPEN_TASK_STATUSES = ['PENDIENTE', 'EN_CURSO', 'DEVUELTA'];
const ACTIVE_PUBLICATION = new Set(['SCHEDULED', 'PUBLISHING', 'PUBLISHED']);
const HISTORY_MONTHS = 3;
const PERSON = { select: { id: true, name: true, avatarUrl: true } };
const TEAM_PERSON = { select: { id: true, name: true, avatarUrl: true, role: true, highlightedAction: true } };
const OBSERVATION_MAX = 2000;
const OBSERVATIONS_SHOWN = 100;

// Ventana de meses que se leen: la parrilla en curso, la anterior y el historial. Con día de corte la
// parrilla en curso puede ser la del mes pasado, así que se lee un mes más.
function monthWindow(todayKey) {
  const [year, month] = todayKey.split('-').map(Number);
  // Desde el mes siguiente: una parrilla ya armada para el próximo mes también es trabajo en curso.
  return Array.from({ length: HISTORY_MONTHS + 3 }, (_, offset) => {
    const index = year * 12 + (month - 1) + 1 - offset;
    return { year: Math.floor(index / 12), month: (index % 12) + 1 };
  });
}

const clientSelect = (window) => ({
  id: true, name: true, slug: true, logoUrl: true, isArchived: true,
  description: true, instagramUrl: true, agency: true, complexity: true,
  responsible: TEAM_PERSON, projectManager: TEAM_PERSON,
  // Las observaciones del cliente (lo que el Excel guardaba en «Comentario» y «OBSERVACIONES»).
  observations: { orderBy: { createdAt: 'desc' }, take: OBSERVATIONS_SHOWN, select: { id: true, text: true, source: true, sourceLabel: true, authorId: true, createdAt: true } },
  contracts: { orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], take: 1 },
  monthlyReports: { where: { OR: window } },
  monthlyCloses: { where: { OR: window } },
  workAuthorizations: { orderBy: { createdAt: 'desc' }, take: 1 },
  externalPlanUrl: true,
  externalPlanSnapshots: { where: { OR: window } },
  contentPlans: {
    where: { deletedAt: null, OR: window },
    select: {
      id: true, year: true, month: true,
      contentItems: {
        where: { deletedAt: null },
        select: {
          id: true, status: true, publishDate: true, format: true, objective: true, copyText: true, captionText: true,
          _count: { select: { finalAssets: true } }, publications: { select: { status: true } }, manualPublish: true,
        },
      },
    },
  },
  nativeTasks: {
    where: { status: { in: OPEN_TASK_STATUSES } },
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, title: true, dueDate: true, status: true, assignee: PERSON },
  },
});

const dayKey = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);
const person = (member) => (member ? { id: member.id, name: member.name, avatarUrl: member.avatarUrl ?? null } : null);
// PM y CM llevan además su cargo y su «acción destacada», que la pestaña Equipo muestra.
const teamPerson = (member) => (member ? { ...person(member), role: member.role ?? null, highlightedAction: member.highlightedAction ?? null } : null);
const publicObservation = (row, names) => ({
  id: row.id, text: row.text, date: bogotaDate(row.createdAt), by: names.get(row.authorId) || null,
  source: row.source, label: row.sourceLabel ?? null, authorId: row.authorId ?? null,
});

function publicContract(row) {
  if (!row) return null;
  return {
    id: row.id, serviceType: row.serviceType, status: row.status, startDate: row.startDate, endDate: row.endDate ?? null,
    standBySince: row.standBySince ?? null, cutDay: row.cutDay ?? 1, deliverables: Array.isArray(row.deliverables) ? row.deliverables : [],
    storiesPerWeek: row.storiesPerWeek ?? 0, productionDays: row.productionDays ?? 0, monthlyReport: Boolean(row.monthlyReport), notes: row.notes ?? null,
  };
}

// La pieza tal como la leen las reglas: la fecha va por el día guardado (mediodía UTC), nunca por la hora local.
function pieceFacts(planId, item) {
  return {
    id: item.id, planId, status: item.status, date: dayKey(item.publishDate), format: item.format, title: item.objective,
    copyText: item.copyText, captionText: item.captionText,
    hasFinalAsset: (item._count?.finalAssets || 0) > 0,
    hasActivePublication: (item.publications || []).some((p) => ACTIVE_PUBLICATION.has(p.status)),
    // Marcada a mano con «Ya se publicó»: se puede deshacer mientras siga publicada.
    markedByHand: item.status === 'PUBLICADO' && Boolean(item.manualPublish?.previousStatus),
  };
}

function cycleSummary(client, cycle, quota, today, reporters) {
  let items = client.contentPlans
    .filter((plan) => plan.year === cycle.year && plan.month === cycle.month)
    .flatMap((plan) => plan.contentItems.map((item) => pieceFacts(plan.id, item)));
  // La hoja de MIO (29 de octubre de 2026), contada con las mismas reglas. Con hoja vinculada y pestaña del mes, la hoja
  // manda aunque haya una parrilla en la plataforma: las que se crearon a mano para Verona y Casa Bella se quedaron
  // congeladas mientras el equipo seguía en la hoja (Rodny: «deja solamente las que están alimentándose del excel»).
  const sheet = (client.externalPlanSnapshots || []).find((row) => row.year === cycle.year && row.month === cycle.month);
  const external = sheet && ((client.externalPlanUrl && sheet.tabName) || !items.length) ? sheet : null;
  if (external) items = (Array.isArray(external.pieces) ? external.pieces : []).map(asOperationPiece);
  const summary = summarizeCycle(cycle, items, { quota, today });
  if (external) summary.source = { kind: 'HOJA_MIO', tab: external.tabName || null, readAt: external.okAt ? bogotaDate(external.okAt) : null, problem: external.problem || null };
  const report = client.monthlyReports.find((r) => r.year === cycle.year && r.month === cycle.month);
  // Solo «enviado» es entregado: `deliveredAt` sigue diciendo cuándo se envió, como antes de los estados.
  const sent = report && (report.status || 'ENVIADO') === 'ENVIADO';
  summary.report = report ? {
    status: report.status || 'ENVIADO',
    deliveredAt: sent ? dayKey(report.deliveredAt) : null,
    by: reporters.get(sent ? report.deliveredById : (report.updatedById || report.deliveredById)) || null,
    link: report.link ?? null,
    note: report.note ?? null,
    updatedAt: report.updatedAt ? bogotaDate(report.updatedAt) : dayKey(report.deliveredAt),
  } : null;
  const close = (client.monthlyCloses || []).find((row) => row.year === cycle.year && row.month === cycle.month);
  summary.close = close ? { closedAt: bogotaDate(close.closedAt), by: reporters.get(close.closedById) || null, note: close.note ?? null, snapshot: close.snapshot || null } : null;
  return summary;
}

// Las parrillas con piezas del mes en curso o del siguiente (mes calendario), y las tareas abiertas.
function currentWork(client, today) {
  const [year, month] = today.split('-').map(Number);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const plans = (client.contentPlans || [])
    .filter((plan) => (plan.year === year && plan.month === month) || (plan.year === next.year && plan.month === next.month))
    .filter((plan) => (plan.contentItems || []).length > 0)
    .sort((a, b) => a.year - b.year || a.month - b.month)
    .map((plan) => MONTH_NAMES[plan.month - 1].toLowerCase());
  return { openTasks: (client.nativeTasks || []).length, plans: [...new Set(plans)] };
}

// Lo leído de la hoja de MIO para el mes en curso y el siguiente: cuántas piezas y en qué etapa.
function externalPlanMonths(client, today) {
  if (!client.externalPlanUrl) return null;
  const [year, month] = today.split('-').map(Number);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return [{ year, month }, next].map(({ year: y, month: m }) => {
    const row = (client.externalPlanSnapshots || []).find((item) => item.year === y && item.month === m);
    return {
      year: y, month: m, label: MONTH_NAMES[m - 1],
      tab: row?.tabName ?? null,
      summary: row?.summary && typeof row.summary === 'object' ? row.summary : null,
      problem: row?.problem ?? null,
      readAt: row?.okAt ? bogotaDate(row.okAt) : null,
    };
  });
}

const publicAuthorization = (row) => (row ? {
  until: row.until, reason: row.reason, byName: row.authorizedByName ?? null, at: row.createdAt ? bogotaDate(row.createdAt) : null,
} : null);

function buildOperation(client, { today, reporters, detail }) {
  const observations = (client.observations || []).map((row) => publicObservation(row, reporters));
  const contract = publicContract(client.contracts?.[0]);
  const base = {
    id: client.id, name: client.name, slug: client.slug, logoUrl: client.logoUrl ?? null,
    description: client.description ?? null, instagramUrl: client.instagramUrl ?? null,
    agency: client.agency ?? null, complexity: client.complexity ?? null,
    projectManager: teamPerson(client.projectManager), communityManager: teamPerson(client.responsible),
    contract,
    openTasks: (client.nativeTasks || []).map((task) => {
      const due = task.dueDate ? bogotaDate(task.dueDate) : null;
      return { id: task.id, title: task.title, dueDate: due, overdue: Boolean(due && due < today), assignee: person(task.assignee) };
    }),
    cycles: {},
    history: [],
    // Lo que se está trabajando, con o sin contrato: tareas abiertas y parrillas del mes en curso o del siguiente.
    work: currentWork(client, today),
    workAuthorization: publicAuthorization(client.workAuthorizations?.[0]),
    // La hoja de MIO y lo último leído de ella, mes a mes (29 de octubre de 2026).
    externalPlanUrl: client.externalPlanUrl ?? null,
    externalPlan: externalPlanMonths(client, today),
    observations,
    latestObservation: observations[0] ? { text: observations[0].text, date: observations[0].date, by: observations[0].by } : null,
  };
  if (isMeasured(base)) {
    const quota = contract.deliverables.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0);
    const currentCycle = cycleForDate(today, contract.cutDay);
    let cursor = currentCycle;
    const past = [];
    for (let i = 0; i < HISTORY_MONTHS; i += 1) {
      cursor = previousCycle(cursor, contract.cutDay);
      // Antes de que empezara el contrato no hay nada que medir.
      if (cursor.end < contract.startDate) break;
      past.push(cycleSummary(client, cursor, quota, today, reporters));
    }
    const current = cycleSummary(client, currentCycle, quota, today, reporters);
    base.cycles = { current, previous: past[0] || null };
    base.history = past.map(({ pieces: _pieces, ...month }) => month);
    if (!detail) {
      delete base.cycles.current.pieces;
      if (base.cycles.previous) base.cycles.previous = base.history[0];
    }
  }
  if (!detail) { delete base.history; delete base.observations; }
  base.evaluation = evaluateClientOperation(base, { today });
  return base;
}

// «Ya se publicó» pasa por el mismo camino que el selector de estado de la parrilla, con todo lo que este
// hace después (cerrar la parrilla cuando todo salió); nunca por una escritura paralela.
const updateItemThroughContent = async (id, data) => (await import('./contentService.js')).updateContentItem(id, data);
const readThroughExternalPlan = async (...args) => (await import('./externalPlanService.js')).refreshClientExternalPlan(...args);
const cancelThroughPublishing = async (args) => (await import('./socialPublishingService.js')).cancelItemPublications(args);

export const createClientOperationsService = ({
  db = prisma,
  now = () => new Date(),
  updateItem = updateItemThroughContent,
  cancelItemPublications = cancelThroughPublishing,
  readExternalPlans = readThroughExternalPlan,
} = {}) => {
  const todayKey = () => bogotaDate(now());

  const reporterNames = async (clients) => {
    const ids = [...new Set([
      ...clients.flatMap((c) => c.monthlyReports || []).flatMap((r) => [r.deliveredById, r.updatedById]),
      ...clients.flatMap((c) => c.monthlyCloses || []).map((r) => r.closedById),
      ...clients.flatMap((c) => c.observations || []).map((o) => o.authorId),
    ].filter(Boolean))];
    if (!ids.length) return new Map();
    const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  };

  const listOperations = async () => {
    const today = todayKey();
    const clients = await db.client.findMany({ where: { isArchived: false }, orderBy: { name: 'asc' }, select: clientSelect(monthWindow(today)) });
    const reporters = await reporterNames(clients);
    return clients.map((client) => buildOperation(client, { today, reporters, detail: false }));
  };

  // Autorizar trabajo sin propuesta aprobada es de Dirección o Administrativa y contable (29 de octubre de 2026).
  const canAuthorizeWork = async (userId) => {
    if (!userId) return false;
    for (const area of ['DIRECCION', 'ADMINISTRATIVA']) if (await userHasArea(db, userId, area)) return true;
    return false;
  };

  const getOperation = async (slug, { viewerUserId = null } = {}) => {
    const today = todayKey();
    const client = await db.client.findFirst({ where: { slug: String(slug || '') }, select: clientSelect(monthWindow(today)) });
    if (!client) throw httpError(404, 'No encontramos ese cliente.');
    const reporters = await reporterNames([client]);
    const operation = buildOperation(client, { today, reporters, detail: true });
    if (viewerUserId) operation.canAuthorizeWork = await canAuthorizeWork(viewerUserId);
    return operation;
  };

  /**
   * Autoriza seguir trabajando sin propuesta aprobada hasta una fecha, con motivo. Queda quién y cuándo; una
   * autorización nueva no borra las anteriores.
   */
  const authorizeWork = async ({ clientId, until, reason, actorUserId }) => {
    if (!(await canAuthorizeWork(actorUserId))) throw httpError(403, 'Autorizar trabajo sin propuesta aprobada es de Dirección o Administración.');
    const problem = authorizationProblem({ until, reason }, todayKey());
    if (problem) throw httpError(422, problem);
    const client = await db.client.findFirst({ where: { id: String(clientId || '') }, select: { id: true, slug: true } });
    if (!client) throw httpError(404, 'No encontramos ese cliente.');
    const actor = await db.user.findUnique({ where: { id: actorUserId }, select: { name: true } }).catch(() => null);
    await db.clientWorkAuthorization.create({
      data: { clientId: client.id, until: String(until).trim(), reason: String(reason).trim(), authorizedById: actorUserId, authorizedByName: actor?.name || null },
    });
    return getOperation(client.slug, { viewerUserId: actorUserId });
  };

  const saveProfile = async ({ clientId, input = {}, actorUserId }) => {
    const check = normalizeOperationProfile(input);
    if (!check.valid) throw httpError(422, 'Revisa los campos marcados.', { code: 'CLIENT_OPERATION_INVALID', errors: check.errors });
    const profile = check.value;

    const client = await db.client.findFirst({ where: { id: String(clientId || '') }, select: { id: true, slug: true, contracts: { orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }], take: 1, select: { id: true } } } });
    if (!client) throw httpError(404, 'No encontramos ese cliente.');

    // Solo personas activas del equipo: una ficha nunca apunta a alguien que ya no está.
    const people = [profile.projectManagerId, profile.communityManagerId].filter(Boolean);
    if (people.length) {
      const active = new Set((await db.teamMember.findMany({ where: { id: { in: people }, isActive: true }, select: { id: true } })).map((m) => m.id));
      const errors = {};
      if (profile.projectManagerId && !active.has(profile.projectManagerId)) errors.projectManagerId = 'Esa persona ya no está activa en el equipo.';
      if (profile.communityManagerId && !active.has(profile.communityManagerId)) errors.communityManagerId = 'Esa persona ya no está activa en el equipo.';
      if (Object.keys(errors).length) throw httpError(422, 'Revisa los campos marcados.', { code: 'CLIENT_OPERATION_INVALID', errors });
    }

    await db.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: client.id },
        data: {
          description: profile.description, instagramUrl: profile.instagramUrl, agency: profile.agency, complexity: profile.complexity,
          projectManagerId: profile.projectManagerId, responsibleId: profile.communityManagerId,
          // La hoja de MIO solo cambia si el formulario la manda: quien edita la ficha por otro camino no la borra.
          ...(Object.hasOwn(input, 'externalPlanUrl') ? { externalPlanUrl: profile.externalPlanUrl } : {}),
        },
      });
      if (profile.contract) {
        const data = { ...profile.contract, updatedById: actorUserId || null };
        const current = client.contracts?.[0];
        if (current && input.renew !== true) await tx.clientContract.update({ where: { id: current.id }, data });
        else await tx.clientContract.create({ data: { ...data, clientId: client.id, createdById: actorUserId || null } });
      }
    });
    // Con la hoja de MIO recién puesta, se lee en el acto; si Google falla, la ficha ya quedó guardada.
    if (Object.hasOwn(input, 'externalPlanUrl') && profile.externalPlanUrl) {
      await readExternalPlans(db, { id: client.id, externalPlanUrl: profile.externalPlanUrl }, { now: now() })
        .catch((error) => console.error('[ClientOperations] No se pudo leer la hoja de MIO:', error?.message || error));
    }
    return getOperation(client.slug, { viewerUserId: actorUserId });
  };

  const validMonth = (year, month) => {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || y < 2020 || y > 2100 || !Number.isInteger(m) || m < 1 || m > 12) throw httpError(400, 'El mes no es válido.');
    return { y, m };
  };

  /**
   * El informe del mes (29 de octubre de 2026): pendiente, en elaboración, en revisión o enviado, con su enlace como
   * soporte y una nota. Pasar a «enviado» fija cuándo y quién lo envió. `delivered` sigue valiendo: true es enviado y
   * false lo devuelve a pendiente, como el botón de antes.
   */
  const setMonthlyReport = async ({ clientId, year, month, delivered, status, link, note, actorUserId }) => {
    const { y, m } = validMonth(year, month);
    const client = await db.client.findFirst({ where: { id: String(clientId || '') }, select: { id: true } });
    if (!client) throw httpError(404, 'No encontramos ese cliente.');
    const label = cycleOf(y, m).label;
    if (status === undefined && delivered === false) {
      await db.clientMonthlyReport.deleteMany({ where: { clientId: client.id, year: y, month: m } });
      return { clientId: client.id, year: y, month: m, status: 'PENDIENTE', delivered: false, label };
    }
    const input = { status: status === undefined ? 'ENVIADO' : status, link, note };
    const problem = reportProblem(input);
    if (problem) throw httpError(422, problem);
    const current = await db.clientMonthlyReport.findFirst({ where: { clientId: client.id, year: y, month: m } });
    const at = now();
    const changes = {
      status: input.status,
      updatedAt: at,
      updatedById: actorUserId || null,
      ...(link !== undefined ? { link: String(link ?? '').trim() || null } : {}),
      ...(note !== undefined ? { note: String(note ?? '').trim() || null } : {}),
    };
    // Enviar fija la fecha y quién; volver a guardarlo enviado no la mueve.
    const sentNow = input.status === 'ENVIADO' && (current?.status || null) !== 'ENVIADO';
    if (sentNow) Object.assign(changes, { deliveredAt: at, deliveredById: actorUserId || null });
    if (current) await db.clientMonthlyReport.update({ where: { id: current.id }, data: changes });
    else await db.clientMonthlyReport.create({ data: { clientId: client.id, year: y, month: m, deliveredById: actorUserId || null, ...changes } });
    return { clientId: client.id, year: y, month: m, status: input.status, delivered: input.status === 'ENVIADO', label };
  };

  // Leer ahora la hoja de MIO del cliente, sin esperar al reloj (29 de octubre de 2026).
  const refreshExternalPlan = async ({ clientId, viewerUserId = null }) => {
    const client = await db.client.findFirst({ where: { id: String(clientId || '') }, select: { id: true, slug: true, name: true, externalPlanUrl: true } });
    if (!client) throw httpError(404, 'No encontramos ese cliente.');
    if (!client.externalPlanUrl) throw httpError(409, 'Este cliente no tiene el enlace de su parrilla en una hoja de Google.');
    await readExternalPlans(db, client, { now: now() });
    return getOperation(client.slug, { viewerUserId });
  };

  // Reabrir un cierre confirmado por error (Rodny, 29 de octubre de 2026: «100 % editable todo»). Se puede volver a
  // confirmar cuando se quiera.
  const reopenMonthlyClose = async ({ clientId, year, month, viewerUserId = null }) => {
    const { y, m } = validMonth(year, month);
    const row = await db.client.findFirst({ where: { id: String(clientId || '') }, select: { id: true, slug: true } });
    if (!row) throw httpError(404, 'No encontramos ese cliente.');
    const { count } = await db.clientMonthlyClose.deleteMany({ where: { clientId: row.id, year: y, month: m } });
    if (!count) throw httpError(404, 'Ese mes no tenía el cierre confirmado.');
    return getOperation(row.slug, { viewerUserId });
  };

  /**
   * El project manager confirma el cierre de un mes (29 de octubre de 2026), desde tres días antes de que termine.
   * Nada se borra: lo que quedó pendiente se guarda en el cierre y sigue perteneciendo a ese mes.
   */
  const confirmMonthlyClose = async ({ clientId, year, month, note, actorUserId }) => {
    const { y, m } = validMonth(year, month);
    if (String(note ?? '').trim().length > CLOSE_NOTE_MAX) throw httpError(422, `La nota admite como máximo ${CLOSE_NOTE_MAX} caracteres.`);
    const row = await db.client.findFirst({ where: { id: String(clientId || '') }, select: { slug: true } });
    if (!row) throw httpError(404, 'No encontramos ese cliente.');
    const operation = await getOperation(row.slug);
    const cycles = [operation.cycles?.current, ...(operation.history || [])].filter(Boolean);
    const cycle = cycles.find((item) => item.year === y && item.month === m);
    if (!cycle) throw httpError(404, 'Ese mes no está entre los que se pueden cerrar.');
    if (cycle.close) throw httpError(409, `El cierre de ${cycle.label.toLowerCase()} ya se confirmó.`);
    if (!canConfirmClose(cycle, todayKey())) throw httpError(409, `El cierre de ${cycle.label.toLowerCase()} se confirma desde tres días antes de que termine.`);
    const snapshot = closeSnapshot(cycle, { monthlyReport: Boolean(operation.contract?.monthlyReport) });
    try {
      await db.clientMonthlyClose.create({
        data: { clientId, year: y, month: m, closedById: actorUserId || null, note: String(note ?? '').trim() || null, snapshot },
      });
    } catch (error) {
      if (error?.code === 'P2002') throw httpError(409, `El cierre de ${cycle.label.toLowerCase()} ya se confirmó.`);
      throw error;
    }
    return getOperation(row.slug);
  };

  const findClientPiece = (clientId, itemId) => db.contentItem.findFirst({
    where: { id: String(itemId || ''), deletedAt: null, plan: { clientId: String(clientId || ''), deletedAt: null } },
    select: { id: true, status: true, manualPublish: true, plan: { select: { id: true, status: true } } },
  });

  // Una pieza que salió por fuera de la plataforma: se marca publicada para que la operación diga la verdad.
  // Se anota cómo estaban la pieza y su parrilla, para poder deshacerlo si el clic fue un error.
  const markPiecePublished = async ({ clientId, itemId, actorUserId }) => {
    const item = await findClientPiece(clientId, itemId);
    if (!item) throw httpError(404, 'Esa pieza no pertenece a este cliente.');
    if (item.status !== 'PUBLICADO') {
      // Si ya salió por fuera, lo que estuviera programado aquí no tiene que salir otra vez (15 de
      // octubre de 2026). Antes la cola quedaba armada y al llegar la hora fallaba sola diciendo que la
      // pieza ya estaba publicada, que es cierto pero no es un error de la pieza.
      await cancelItemPublications({ itemId: item.id, reason: 'Se marcó a mano como ya publicada.' })
        .catch((error) => { console.error('[ClientOperations] No se pudo cancelar la publicación programada:', error?.message || error); });
      await updateItem(item.id, {
        status: 'PUBLICADO',
        manualPublish: { previousStatus: item.status, previousPlanStatus: item.plan?.status || null, at: now().toISOString(), by: actorUserId || null },
      });
    }
    return { id: item.id, status: 'PUBLICADO' };
  };

  // Deshacer «Ya se publicó» (Rodny, 2 de octubre de 2026: «me equivoqué … debería poder hacerlo»): la pieza
  // vuelve al estado que tenía y, si ese clic había cerrado la parrilla, la parrilla vuelve a como estaba.
  // Solo se deshace lo que se marcó a mano; lo que publicó Meta no se toca desde aquí.
  const undoPiecePublished = async ({ clientId, itemId }) => {
    const item = await findClientPiece(clientId, itemId);
    if (!item) throw httpError(404, 'Esa pieza no pertenece a este cliente.');
    const previousStatus = item.manualPublish?.previousStatus;
    if (item.status !== 'PUBLICADO' || !previousStatus) {
      throw httpError(409, 'Esta pieza no se marcó a mano como publicada, así que no hay nada que deshacer aquí.');
    }
    await updateItem(item.id, { status: previousStatus, manualPublish: Prisma.DbNull });
    const previousPlanStatus = item.manualPublish.previousPlanStatus;
    if (item.plan?.status === 'FINALIZADO' && previousPlanStatus && previousPlanStatus !== 'FINALIZADO') {
      await db.contentPlan.update({ where: { id: item.plan.id }, data: { status: previousPlanStatus } });
    }
    return { id: item.id, status: previousStatus };
  };

  const addObservation = async ({ clientId, text, actorUserId }) => {
    const value = String(text ?? '').trim();
    if (!value) throw httpError(422, 'Escribe la observación antes de guardarla.');
    if (value.length > OBSERVATION_MAX) throw httpError(422, `La observación pasa de ${OBSERVATION_MAX} caracteres; pártela en dos.`);
    const client = await db.client.findFirst({ where: { id: String(clientId || '') }, select: { id: true } });
    if (!client) throw httpError(404, 'No encontramos ese cliente.');
    return db.clientObservation.create({ data: { clientId: client.id, text: value, source: 'MANUAL', authorId: actorUserId || null } });
  };

  // Una observación la borra quien la escribió o un administrador; las del Excel, solo un administrador.
  const deleteObservation = async ({ clientId, observationId, actor }) => {
    const row = await db.clientObservation.findFirst({ where: { id: String(observationId || ''), clientId: String(clientId || '') }, select: { id: true, authorId: true } });
    if (!row) throw httpError(404, 'Esa observación ya no existe.');
    const isAdmin = String(actor?.role || '').toUpperCase() === 'ADMIN';
    if (!isAdmin && (!row.authorId || row.authorId !== actor?.userId)) throw httpError(403, 'Solo quien escribió la observación o un administrador puede borrarla.');
    await db.clientObservation.delete({ where: { id: row.id } });
    return { id: row.id, deleted: true };
  };

  // «Acción destacada» del Excel: qué hace cada persona del equipo, para la pestaña Equipo.
  const setTeamHighlight = async ({ memberId, text }) => {
    const member = await db.teamMember.findFirst({ where: { id: String(memberId || ''), isActive: true }, select: { id: true } });
    if (!member) throw httpError(404, 'Esa persona no está activa en el equipo.');
    const value = String(text ?? '').trim().slice(0, 300) || null;
    return db.teamMember.update({ where: { id: member.id }, data: { highlightedAction: value } });
  };

  return { listOperations, getOperation, authorizeWork, saveProfile, setMonthlyReport, confirmMonthlyClose, reopenMonthlyClose, refreshExternalPlan, markPiecePublished, undoPiecePublished, addObservation, deleteObservation, setTeamHighlight };
};

export const clientOperationsService = createClientOperationsService();
