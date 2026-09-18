import {
  CRM_STAGES, CRM_ORIGINS, CRM_PRIORITIES, CRM_TRAFFIC_LIGHTS, CRM_ACTIVITY_TYPES, CRM_FOLLOW_UP_BUCKETS,
  CRM_THRESHOLDS, CRM_STAGE_GROUP_LABELS,
  isValidStage, isValidOrigin, isValidPriority, isValidTrafficLight, isValidActivityType,
  stageGroup, stageOrder, isClosedStage, isActionableStage, deriveOutcome, formatLeadCode,
  bogotaDateKey, followUpBucket, computeTrafficLight, computeMetrics
} from '../lib/crmRules.js';
import { assertActiveTeamMembers } from './teamRosterService.js';

export class CrmValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CrmValidationError';
    this.statusCode = 400;
  }
}

const notFound = () => Object.assign(new Error('Oportunidad no encontrada.'), { statusCode: 404 });

// ---- normalization helpers ----------------------------------------------------------------------

const text = value => {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
};

/** Company names written slightly differently still group together. */
export const normalizeCompanyKey = value => {
  const key = text(value)?.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.'’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  return key || null;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// DATE columns come back from PostgreSQL as UTC midnight; keep them as plain 'YYYY-MM-DD' strings.
const dateOnly = value => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string') return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  return null;
};

const parseDateOnly = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  const key = dateOnly(value);
  if (!key) throw new CrmValidationError(`La fecha de ${label} no es válida.`);
  return new Date(`${key}T00:00:00.000Z`);
};

const parseTimestamp = (value, label) => {
  if (value === null || value === undefined || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new CrmValidationError(`La fecha de ${label} no es válida.`);
  return date;
};

const parseMoney = value => {
  if (value === null || value === undefined || value === '') return null;
  const digits = String(value).replace(/[^0-9.-]/g, '');
  const number = typeof value === 'number' ? value : (/\d/.test(digits) ? Number(digits) : NaN);
  if (!Number.isFinite(number) || number < 0) throw new CrmValidationError('El valor cotizado debe ser un número mayor o igual a cero.');
  return Math.round(number * 100) / 100;
};

const toNumber = value => {
  if (value === null || value === undefined) return null;
  const number = Number(typeof value === 'object' && value.toString ? value.toString() : value);
  return Number.isFinite(number) ? number : null;
};

const activityType = value => CRM_ACTIVITY_TYPES.find(type => type.value === value);

// ---- serialization --------------------------------------------------------------------------------

export const serializeActivity = activity => ({
  id: activity.id,
  leadId: activity.leadId,
  type: activity.type,
  occurredAt: activity.occurredAt,
  note: activity.note ?? null,
  result: activity.result ?? null,
  nextAction: activity.nextAction ?? null,
  nextFollowUpAt: dateOnly(activity.nextFollowUpAt),
  fromStage: activity.fromStage ?? null,
  toStage: activity.toStage ?? null,
  authorId: activity.authorId ?? null,
  author: activity.author ? { id: activity.author.id, name: activity.author.name, avatarUrl: activity.author.avatarUrl ?? null } : null,
  createdAt: activity.createdAt,
  editedAt: activity.editedAt ?? null
});

const normalizeLead = lead => ({
  ...lead,
  nextFollowUpAt: dateOnly(lead.nextFollowUpAt),
  publishedAt: dateOnly(lead.publishedAt),
  callDeadlineAt: dateOnly(lead.callDeadlineAt),
  quotedValue: toNumber(lead.quotedValue),
  activities: Array.isArray(lead.activities) ? lead.activities : []
});

export const serializeLead = (lead, now = new Date()) => {
  const normalized = normalizeLead(lead);
  const activities = normalized.activities;
  const trafficLight = computeTrafficLight(normalized, activities, now);
  return {
    id: normalized.id,
    code: formatLeadCode(normalized.consecutive),
    consecutive: normalized.consecutive,
    legacyCode: normalized.legacyCode ?? null,
    origin: normalized.origin,
    originDetail: normalized.originDetail ?? null,
    enteredAt: normalized.enteredAt,
    enteredAtEstimated: Boolean(normalized.enteredAtEstimated),
    contactName: normalized.contactName ?? null,
    company: normalized.company ?? null,
    companyKey: normalized.companyKey ?? null,
    jobTitle: normalized.jobTitle ?? null,
    phone: normalized.phone ?? null,
    email: normalized.email ?? null,
    linkedinUrl: normalized.linkedinUrl ?? null,
    serviceInterest: normalized.serviceInterest ?? null,
    language: normalized.language ?? null,
    allowedContact: normalized.allowedContact ?? null,
    priority: normalized.priority,
    publishedAt: normalized.publishedAt,
    callDeadlineAt: normalized.callDeadlineAt,
    firstContactAt: normalized.firstContactAt ?? null,
    proposalSentAt: normalized.proposalSentAt ?? null,
    lastActivityAt: normalized.lastActivityAt ?? null,
    closedAt: normalized.closedAt ?? null,
    stage: normalized.stage,
    stageGroup: stageGroup(normalized.stage),
    outcome: deriveOutcome(normalized.stage),
    trafficLight,
    trafficLightOverride: normalized.trafficLightOverride ?? null,
    trafficLightReason: normalized.trafficLightReason ?? null,
    nextAction: normalized.nextAction ?? null,
    nextFollowUpAt: normalized.nextFollowUpAt,
    followUpBucket: followUpBucket(normalized, now),
    ownerId: normalized.ownerId ?? null,
    owner: normalized.owner ? { id: normalized.owner.id, name: normalized.owner.name, avatarUrl: normalized.owner.avatarUrl ?? null } : null,
    quotedValue: normalized.quotedValue,
    currency: normalized.currency || 'COP',
    lostReason: normalized.lostReason ?? null,
    clientId: normalized.clientId ?? null,
    quotationId: normalized.quotationId ?? null,
    notes: normalized.notes ?? null,
    createdById: normalized.createdById ?? null,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    archivedAt: normalized.archivedAt ?? null,
    activityCount: activities.length,
    activities: activities.map(serializeActivity)
  };
};

export const catalogs = () => ({
  stages: CRM_STAGES,
  stageGroups: CRM_STAGE_GROUP_LABELS,
  origins: CRM_ORIGINS,
  priorities: CRM_PRIORITIES,
  trafficLights: CRM_TRAFFIC_LIGHTS,
  activityTypes: CRM_ACTIVITY_TYPES,
  followUpBuckets: CRM_FOLLOW_UP_BUCKETS,
  thresholds: CRM_THRESHOLDS
});

// ---- data access ----------------------------------------------------------------------------------

const leadInclude = {
  activities: { orderBy: { occurredAt: 'desc' }, include: { author: { select: { id: true, name: true, avatarUrl: true } } } },
  owner: { select: { id: true, name: true, avatarUrl: true } }
};

const loadLead = async (db, id) => {
  const lead = await db.crmLead.findUnique({ where: { id }, include: leadInclude });
  if (!lead || lead.archivedAt) throw notFound();
  return lead;
};

const LEAD_FIELDS = ['origin', 'originDetail', 'contactName', 'company', 'jobTitle', 'phone', 'email', 'linkedinUrl', 'serviceInterest',
  'language', 'allowedContact', 'priority', 'publishedAt', 'callDeadlineAt', 'nextAction', 'nextFollowUpAt', 'ownerId', 'quotedValue',
  'currency', 'notes', 'clientId', 'quotationId', 'enteredAt'];

/** Validates and normalizes editable lead fields. Milestones and stage are never accepted here. */
const normalizeLeadInput = async (db, payload = {}, { partial = false, previousOwnerId = null } = {}) => {
  const data = {};
  const has = key => Object.prototype.hasOwnProperty.call(payload, key);
  for (const key of LEAD_FIELDS) {
    if (partial && !has(key)) continue;
    const value = payload[key];
    switch (key) {
      case 'origin': {
        const origin = text(value) || (partial ? undefined : 'OTRO');
        if (origin !== undefined && !isValidOrigin(origin)) throw new CrmValidationError('El origen no está en el catálogo.');
        if (origin !== undefined) data.origin = origin;
        break;
      }
      case 'priority': {
        const priority = text(value) || (partial ? undefined : 'MEDIA');
        if (priority !== undefined && !isValidPriority(priority)) throw new CrmValidationError('La prioridad debe ser Alta, Media o Baja.');
        if (priority !== undefined) data.priority = priority;
        break;
      }
      case 'email': {
        const email = text(value);
        if (email && !EMAIL.test(email)) throw new CrmValidationError('El correo no tiene un formato válido.');
        data.email = email ? email.toLowerCase() : null;
        break;
      }
      case 'publishedAt': data.publishedAt = parseDateOnly(value, 'publicación'); break;
      case 'callDeadlineAt': data.callDeadlineAt = parseDateOnly(value, 'cierre de convocatoria'); break;
      case 'nextFollowUpAt': data.nextFollowUpAt = parseDateOnly(value, 'próximo seguimiento'); break;
      case 'enteredAt': {
        const enteredAt = parseTimestamp(value, 'ingreso');
        if (enteredAt) data.enteredAt = enteredAt;
        break;
      }
      case 'quotedValue': data.quotedValue = parseMoney(value); break;
      case 'currency': {
        const currency = text(value)?.toUpperCase() || (partial ? undefined : 'COP');
        if (currency !== undefined && !['COP', 'USD'].includes(currency)) throw new CrmValidationError('La moneda debe ser COP o USD.');
        if (currency !== undefined) data.currency = currency;
        break;
      }
      case 'ownerId': {
        const ownerId = text(value);
        if (ownerId && ownerId !== previousOwnerId) await assertActiveTeamMembers(db, [ownerId]);
        data.ownerId = ownerId;
        break;
      }
      case 'company': data.company = text(value); data.companyKey = normalizeCompanyKey(value); break;
      default: data[key] = text(value);
    }
  }
  return data;
};

const applyStageMilestones = (lead, toStage, at) => {
  const data = {};
  if (stageOrder(toStage) >= stageOrder('CONTACTADO') && stageGroup(toStage) !== 'CERRADO' && !lead.firstContactAt) data.firstContactAt = at;
  if (toStage === 'PROPUESTA_ENVIADA' && !lead.proposalSentAt) data.proposalSentAt = at;
  if (isClosedStage(toStage)) data.closedAt = lead.closedAt || at;
  else data.closedAt = null;
  return data;
};

// ---- public API ---------------------------------------------------------------------------------------

export const getLead = async (db, id, now = new Date()) => {
  const lead = await db.crmLead.findUnique({ where: { id }, include: leadInclude });
  if (!lead) return null;
  return serializeLead(lead, now);
};

export const createLead = async (db, payload = {}, actor = {}, now = new Date()) => {
  if (payload.stage !== undefined && payload.stage !== null && payload.stage !== '' && !isValidStage(payload.stage)) {
    throw new CrmValidationError('La etapa no está en el catálogo.');
  }
  const data = await normalizeLeadInput(db, payload);
  if (!data.company && !data.contactName) throw new CrmValidationError('Indica al menos la empresa o la persona de contacto.');
  const stage = text(payload.stage) || 'POR_GESTIONAR';
  const enteredAt = data.enteredAt || now;
  const created = await db.crmLead.create({
    data: {
      ...data,
      enteredAt,
      enteredAtEstimated: Boolean(payload.enteredAtEstimated),
      legacyCode: text(payload.legacyCode),
      stage,
      ...applyStageMilestones({}, stage, enteredAt),
      createdById: actor.userId || actor.id || null
    },
    include: leadInclude
  });
  return serializeLead(created, now);
};

export const updateLead = async (db, id, payload = {}, actor = {}, now = new Date()) => {
  const lead = await loadLead(db, id);
  const data = await normalizeLeadInput(db, payload, { partial: true, previousOwnerId: lead.ownerId });
  if (Object.keys(data).length === 0) return serializeLead(lead, now);
  const updated = await db.crmLead.update({ where: { id }, data: { ...data, updatedAt: now }, include: leadInclude });
  return serializeLead(updated, now);
};

export const changeStage = async (db, id, payload = {}, actor = {}, now = new Date()) => {
  const stage = text(payload.stage);
  if (!isValidStage(stage)) throw new CrmValidationError('La etapa no está en el catálogo.');
  const lostReason = text(payload.lostReason);
  if (stage === 'PERDIDO' && !lostReason) throw new CrmValidationError('Registra el motivo de pérdida antes de cerrar la oportunidad.');
  return db.$transaction(async tx => {
    const lead = await loadLead(tx, id);
    if (lead.stage === stage) return serializeLead(lead, now);
    const nextFollowUpAt = parseDateOnly(payload.nextFollowUpAt, 'próximo seguimiento');
    const nextAction = text(payload.nextAction);
    await tx.crmActivity.create({
      data: {
        leadId: id, type: 'CAMBIO_ETAPA', occurredAt: now, fromStage: lead.stage, toStage: stage,
        note: text(payload.note) || lostReason, nextAction, nextFollowUpAt, authorId: actor.userId || actor.id || null
      }
    });
    const updated = await tx.crmLead.update({
      where: { id },
      data: {
        stage,
        ...applyStageMilestones(lead, stage, now),
        lostReason: stage === 'PERDIDO' ? lostReason : (isClosedStage(stage) ? lead.lostReason : null),
        lastActivityAt: now,
        ...(nextAction ? { nextAction } : {}),
        ...(nextFollowUpAt ? { nextFollowUpAt } : {}),
        updatedAt: now
      },
      include: leadInclude
    });
    return serializeLead(updated, now);
  });
};

/** Automatic stage moves triggered by the log. Returns the stage the lead should be in after `type`. */
const stageAfterActivity = (lead, type) => {
  const meta = activityType(type);
  if (!meta?.contact || !isActionableStage(lead.stage) || stageGroup(lead.stage) === 'APROBADO') return lead.stage;
  if (type === 'PROPUESTA_ENVIADA' && stageOrder(lead.stage) < stageOrder('PROPUESTA_ENVIADA')) return 'PROPUESTA_ENVIADA';
  if (type === 'REUNION' && stageOrder(lead.stage) < stageOrder('CITA_REALIZADA')) return 'CITA_REALIZADA';
  if (lead.stage === 'POR_GESTIONAR') return 'CONTACTADO';
  return lead.stage;
};

export const addActivity = async (db, id, payload = {}, actor = {}, now = new Date()) => {
  const type = text(payload.type);
  if (!isValidActivityType(type) || type === 'CAMBIO_ETAPA') throw new CrmValidationError('El tipo de gestión no está en el catálogo.');
  const occurredAt = parseTimestamp(payload.occurredAt, 'la gestión') || now;
  const nextFollowUpAt = parseDateOnly(payload.nextFollowUpAt, 'próximo seguimiento');
  const authorId = actor.userId || actor.id || null;
  const requestId = text(payload.requestId);
  return db.$transaction(async tx => {
    const lead = await loadLead(tx, id);
    if (requestId && authorId) {
      const existing = await tx.crmActivity.findUnique({ where: { authorId_requestId: { authorId, requestId } } });
      if (existing) return { lead: serializeLead(await loadLead(tx, id), now), activity: serializeActivity(existing) };
    }
    const activity = await tx.crmActivity.create({
      data: {
        leadId: id, type, occurredAt, note: text(payload.note), result: text(payload.result),
        nextAction: text(payload.nextAction), nextFollowUpAt, authorId, requestId
      }
    });
    const meta = activityType(type);
    const data = { updatedAt: now };
    if (!lead.lastActivityAt || new Date(lead.lastActivityAt) < occurredAt) data.lastActivityAt = occurredAt;
    if (meta.contact && !lead.firstContactAt) data.firstContactAt = occurredAt;
    if (type === 'PROPUESTA_ENVIADA' && !lead.proposalSentAt) data.proposalSentAt = occurredAt;
    if (text(payload.nextAction)) data.nextAction = text(payload.nextAction);
    if (nextFollowUpAt) data.nextFollowUpAt = nextFollowUpAt;
    const nextStage = stageAfterActivity(lead, type);
    if (nextStage !== lead.stage) {
      data.stage = nextStage;
      Object.assign(data, applyStageMilestones({ ...lead, ...data }, nextStage, occurredAt));
      await tx.crmActivity.create({
        data: { leadId: id, type: 'CAMBIO_ETAPA', occurredAt, fromStage: lead.stage, toStage: nextStage, note: `Automático por ${meta.label.toLowerCase()}.`, authorId }
      });
    }
    const updated = await tx.crmLead.update({ where: { id }, data, include: leadInclude });
    return { lead: serializeLead(updated, now), activity: serializeActivity(activity) };
  });
};

export const updateActivity = async (db, id, activityId, payload = {}, actor = {}, now = new Date()) => {
  return db.$transaction(async tx => {
    await loadLead(tx, id);
    const activity = await tx.crmActivity.findUnique({ where: { id: activityId } });
    if (!activity || activity.leadId !== id) throw Object.assign(new Error('Gestión no encontrada.'), { statusCode: 404 });
    const actorId = actor.userId || actor.id || null;
    const isManager = ['ADMIN', 'PROJECT_MANAGER'].includes(String(actor.role || '').toUpperCase());
    if (activity.authorId && activity.authorId !== actorId && !isManager) {
      throw Object.assign(new Error('Solo quien registró la gestión puede corregirla.'), { statusCode: 403 });
    }
    if (activity.type === 'CAMBIO_ETAPA') throw new CrmValidationError('Los cambios de etapa no se editan; registra una nueva gestión.');
    const data = { editedAt: now };
    if (Object.prototype.hasOwnProperty.call(payload, 'note')) data.note = text(payload.note);
    if (Object.prototype.hasOwnProperty.call(payload, 'result')) data.result = text(payload.result);
    if (Object.prototype.hasOwnProperty.call(payload, 'occurredAt')) data.occurredAt = parseTimestamp(payload.occurredAt, 'la gestión') || activity.occurredAt;
    const updated = await tx.crmActivity.update({ where: { id: activityId }, data });
    return serializeActivity(updated);
  });
};

export const setTrafficLight = async (db, id, payload = {}, actor = {}, now = new Date()) => {
  const value = text(payload.value);
  const reason = text(payload.reason);
  if (value && !isValidTrafficLight(value)) throw new CrmValidationError('El semáforo solo admite Verde, Amarillo o Rojo.');
  if (value && !reason) throw new CrmValidationError('Explica el motivo para fijar el semáforo a mano.');
  await loadLead(db, id);
  const updated = await db.crmLead.update({
    where: { id },
    data: { trafficLightOverride: value || null, trafficLightReason: value ? reason : null, updatedAt: now },
    include: leadInclude
  });
  return serializeLead(updated, now);
};

export const archiveLead = async (db, id, actor = {}, now = new Date()) => {
  await loadLead(db, id);
  const updated = await db.crmLead.update({ where: { id }, data: { archivedAt: now, updatedAt: now }, include: leadInclude });
  return serializeLead(updated, now);
};

// ---- lists and aggregates -------------------------------------------------------------------------------

const BUCKET_RANK = { VENCIDO: 0, HOY: 1, SEMANA: 2, FUTURO: 3, SIN_FECHA: 4 };
const PRIORITY_RANK = { ALTA: 0, MEDIA: 1, BAJA: 2 };

const urgencySort = (a, b) => {
  const bucket = (BUCKET_RANK[a.followUpBucket] ?? 5) - (BUCKET_RANK[b.followUpBucket] ?? 5);
  if (bucket) return bucket;
  const priority = (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
  if (priority) return priority;
  if (a.nextFollowUpAt !== b.nextFollowUpAt) return String(a.nextFollowUpAt || '9999') < String(b.nextFollowUpAt || '9999') ? -1 : 1;
  return new Date(b.lastActivityAt || b.enteredAt || 0) - new Date(a.lastActivityAt || a.enteredAt || 0);
};

const list = value => (value === undefined || value === null || value === '') ? [] : String(value).split(',').map(item => item.trim()).filter(Boolean);

const matchesFilters = (lead, query) => {
  const stages = list(query.stage);
  if (stages.length && !stages.includes(lead.stage)) return false;
  const groups = list(query.group);
  if (groups.length && !groups.includes(lead.stageGroup)) return false;
  const origins = list(query.origin);
  if (origins.length && !origins.includes(lead.origin)) return false;
  const priorities = list(query.priority);
  if (priorities.length && !priorities.includes(lead.priority)) return false;
  const owners = list(query.ownerId);
  if (owners.length && !owners.includes(lead.ownerId || 'SIN_RESPONSABLE')) return false;
  const lights = list(query.trafficLight);
  if (lights.length && !lights.includes(lead.trafficLight.value)) return false;
  const buckets = list(query.bucket);
  if (buckets.length && !buckets.includes(lead.followUpBucket)) return false;
  const from = dateOnly(query.from);
  if (from && (bogotaDateKey(lead.enteredAt) || '') < from) return false;
  const to = dateOnly(query.to);
  if (to && (bogotaDateKey(lead.enteredAt) || '') > to) return false;
  const search = text(query.search)?.toLowerCase();
  if (search) {
    const haystack = [lead.company, lead.contactName, lead.email, lead.phone, lead.serviceInterest, lead.code, lead.legacyCode, lead.nextAction]
      .filter(Boolean).join(' ').toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  return true;
};

const fetchLeads = async (db, { includeArchived = false } = {}) => {
  const where = includeArchived ? {} : { archivedAt: null };
  return db.crmLead.findMany({ where, include: leadInclude, orderBy: { enteredAt: 'desc' } });
};

export const listLeads = async (db, query = {}, now = new Date()) => {
  const includeArchived = query.includeArchived === true || query.includeArchived === 'true';
  const raw = await fetchLeads(db, { includeArchived });
  const items = raw.map(lead => serializeLead(lead, now)).filter(lead => matchesFilters(lead, query)).sort(urgencySort);
  const pageSize = Math.min(Math.max(Number(query.pageSize) || 200, 1), 500);
  const page = Math.max(Number(query.page) || 1, 1);
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize).map(lead => ({ ...lead, activities: undefined })),
    total: items.length,
    page,
    pageSize
  };
};

export const followUps = async (db, query = {}, now = new Date()) => {
  const raw = await fetchLeads(db);
  const leads = raw.map(lead => serializeLead(lead, now)).filter(lead => isActionableStage(lead.stage) && matchesFilters(lead, { ownerId: query.ownerId, priority: query.priority, origin: query.origin }));
  const buckets = { VENCIDO: [], HOY: [], SEMANA: [], SIN_FECHA: [] };
  for (const lead of leads.sort(urgencySort)) {
    if (lead.followUpBucket in buckets) buckets[lead.followUpBucket].push({ ...lead, activities: undefined });
  }
  return { buckets, counts: Object.fromEntries(Object.entries(buckets).map(([key, items]) => [key, items.length])) };
};

export const metricsFor = async (db, query = {}, now = new Date()) => {
  const raw = await fetchLeads(db);
  const leads = raw.map(lead => serializeLead(lead, now)).filter(lead => matchesFilters(lead, query));
  const metrics = computeMetrics(leads, now);
  const priorities = leads
    .filter(lead => isActionableStage(lead.stage) && (lead.trafficLight.value === 'ROJO' || ['VENCIDO', 'HOY'].includes(lead.followUpBucket)))
    .sort(urgencySort)
    .slice(0, Math.min(Math.max(Number(query.priorityLimit) || 10, 1), 50))
    .map(lead => ({ ...lead, activities: undefined }));
  return { ...metrics, priorities, generatedAt: now, filters: query };
};
