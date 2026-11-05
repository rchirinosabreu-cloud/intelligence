import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { isManagerRole } from '../lib/taskEditPermissions.js';
import { normalizeProjectOperation, projectOperationMissing } from '../lib/projectOperations.js';
import { proposalPlainText } from './quotationProposalDetails.js';

const httpError = (status, message, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
const snapshot = value => JSON.parse(JSON.stringify(value));
const iso = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : null;
const plain = value => typeof value === 'string' ? value.trim() : '';
const scopeText = row => row?.descriptionHtml ? proposalPlainText(row.descriptionHtml) : plain(row?.description);
const execution = value => value && ['DAYS', 'WEEKS', 'MONTHS'].includes(value.unit)
  && Number.isInteger(value.min) && Number.isInteger(value.max) && value.min > 0 && value.max >= value.min
  ? { min: value.min, max: value.max, unit: value.unit, startNote: plain(value.startNote) } : null;

/** Lista de campos permitidos, no copia de la cotización: documentos, precios, costos, pagos y condiciones quedan fuera. */
export const quotationOperationSnapshot = quotation => {
  const items = Array.isArray(quotation.items) ? quotation.items.filter(item => item && typeof item === 'object') : [];
  const hasScenarios = items.some(item => item.scenarioId);
  const selected = [...new Set(items.filter(item => item.selectedScenario === true && item.scenarioId).map(item => item.scenarioId))];
  const unresolved = hasScenarios && selected.length !== 1;
  const scenarioId = hasScenarios && !unresolved ? selected[0] : null;
  const accepted = unresolved ? [] : hasScenarios ? items.filter(item => item.scenarioId === scenarioId) : items;
  const details = quotation.proposal_details || {};
  return {
    quotationId: quotation.id, code: `COT-${String(quotation.consecutive || 0).padStart(4, '0')}`,
    acceptedAt: iso(quotation.accepted_at), quotationUpdatedAt: iso(quotation.updated_at),
    scenarioId, scenarioName: scenarioId ? plain(accepted[0]?.scenarioName) || null : null,
    title: plain(details.title), execution: execution(details.execution), issue: unresolved ? 'SCENARIO_UNRESOLVED' : null,
    services: accepted.map((item, index) => ({
      id: `line-${index + 1}`, label: plain(item.name), description: scopeText(item),
      quantity: typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 ? item.quantity : null,
      billingType: ['MONTHLY', 'ONE_TIME'].includes(item.billingType) ? item.billingType : null,
      group: plain(item.group) || null, execution: execution(item.execution),
    })),
    phases: !unresolved && Array.isArray(details.phases) ? details.phases.map((phase, index) => ({
      id: plain(phase.id) || `phase-${index + 1}`, title: plain(phase.title), description: scopeText(phase),
      completion: plain(phase.completion), execution: execution(phase.execution),
      starts: ['AT_START', 'AFTER_PREVIOUS', 'PARALLEL'].includes(phase.starts) ? phase.starts : null,
    })) : [],
  };
};

const modalityFrom = source => {
  const types = new Set(source.services.map(row => row.billingType));
  if (!types.size || types.has(null)) return null;
  return types.size > 1 ? 'MIXTO' : types.has('MONTHLY') ? 'MENSUAL' : 'PUNTUAL';
};

const audit = (db, row, before, actorId) => db.financialAuditEvent.create({ data: {
  entityType: 'ProjectOperation', entityId: row.id, action: before ? 'UPDATE' : 'CREATE',
  ...(before ? { before: snapshot(before) } : {}), after: snapshot(row), actorId: actorId || null,
} });

/** Dentro de la transacción de formalización. El id nuevo permite saber quién ganó el upsert sin repetir auditoría. */
export const ensureProjectOperation = async (db, formalization, { quotation, now = new Date() } = {}) => {
  if (!formalization?.clientId) return null;
  const existing = await db.projectOperation.findUnique({ where: { formalizationId: formalization.id } });
  if (existing) return existing;
  const sourceQuotation = quotation || await db.quotation.findUnique({ where: { id: formalization.quotationId } });
  if (!sourceQuotation || sourceQuotation.status !== 'APROBADA' || sourceQuotation.id !== formalization.quotationId) return null;
  const client = await db.client.findUnique({ where: { id: formalization.clientId }, select: { id: true, projectManagerId: true } });
  if (!client) return null;
  const sourceSnapshot = quotationOperationSnapshot(sourceQuotation);
  const id = randomUUID();
  const row = await db.projectOperation.upsert({
    where: { formalizationId: formalization.id }, update: {}, create: {
      id, formalizationId: formalization.id, clientId: formalization.clientId,
      title: sourceSnapshot.title || sourceSnapshot.scenarioName || sourceSnapshot.code,
      modality: modalityFrom(sourceSnapshot), startDate: null, endDate: null, projectManagerId: client.projectManagerId || null,
      sourceSnapshot, deliverables: sourceSnapshot.services.filter(item => item.label).map(item => ({ id: item.id, label: item.label, description: item.description, quantity: item.quantity, unit: 'servicios' })),
      notes: '', productionDays: null, productionHours: null, reportRequired: null,
      reviewStatus: 'PENDIENTE', revision: 1, createdAt: now, updatedAt: now,
    },
  });
  if (row.id === id) await audit(db, row, null, null);
  return row;
};

const requireManager = async (db, actor) => {
  const id = actor?.userId || actor?.id;
  if (!id) throw httpError(401, 'Usuario no autenticado.');
  const user = await db.user.findUnique({ where: { id }, select: { id: true, name: true, role: true, isActive: true, teamMember: { select: { isActive: true } } } });
  if (!user?.isActive || !user.teamMember?.isActive || !isManagerRole(user.role)) throw httpError(403, 'La operación de proyectos es de administradores y project managers activos.');
  return user;
};

const requireClient = async (db, clientId) => {
  const client = await db.client.findUnique({ where: { id: String(clientId || '') }, select: { id: true, isArchived: true } });
  if (!client) throw httpError(404, 'Ese cliente ya no está disponible.');
  return client;
};

const serialize = async (db, row, formalization) => {
  const [pm, reviewer] = await Promise.all([
    row.projectManagerId ? db.teamMember.findUnique({ where: { id: row.projectManagerId }, select: { id: true, name: true, isActive: true } }) : null,
    row.reviewedById ? db.user.findUnique({ where: { id: row.reviewedById }, select: { id: true, name: true } }) : null,
  ]);
  return {
    id: row.id, formalizationId: row.formalizationId, clientId: row.clientId,
    title: row.title, modality: row.modality, startDate: row.startDate, endDate: row.endDate,
    projectManagerId: row.projectManagerId, projectManager: pm ? { id: pm.id, name: pm.name } : null,
    deliverables: row.deliverables, notes: row.notes, productionDays: row.productionDays, productionHours: row.productionHours, reportRequired: row.reportRequired,
    reviewStatus: row.reviewStatus, revision: row.revision, reviewedAt: row.reviewedAt || null,
    reviewedBy: reviewer ? { id: reviewer.id, name: reviewer.name } : null,
    createdAt: row.createdAt, updatedAt: row.updatedAt,
    formalizationStatus: formalization?.status === 'HABILITADO' ? 'HABILITADO' : 'PENDIENTE', enabledAt: formalization?.enabledAt || null,
    source: row.sourceSnapshot, missing: projectOperationMissing(row, { projectManagerActive: pm?.isActive === true }),
  };
};

export const listClientProjects = async (db, clientId, actor) => {
  await requireManager(db, actor);
  await requireClient(db, clientId);
  const [rows, formalizations] = await Promise.all([
    db.projectOperation.findMany({ where: { clientId }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }),
    db.projectFormalization.findMany({ where: { clientId }, select: { id: true, status: true, enabledAt: true } }),
  ]);
  const byId = new Map(formalizations.map(row => [row.id, row]));
  return Promise.all(rows.map(row => serialize(db, row, byId.get(row.formalizationId))));
};

export const updateProjectOperation = async (db, clientId, projectId, input, actor, { now = new Date() } = {}) => {
  const data = normalizeProjectOperation(input);
  return db.$transaction(async tx => {
    const user = await requireManager(tx, actor);
    const client = await requireClient(tx, clientId);
    if (client.isArchived) throw httpError(409, 'El cliente está archivado.');
    const row = await tx.projectOperation.findUnique({ where: { id: String(projectId || '') } });
    if (!row || row.clientId !== clientId) throw httpError(404, 'El proyecto no pertenece a este cliente.');
    if (row.revision !== input.expectedRevision) throw httpError(409, 'La ficha cambió. Recarga y revisa la versión actual.', 'PROJECT_REVISION_CONFLICT');
    const formalization = await tx.projectFormalization.findUnique({ where: { id: row.formalizationId }, select: { id: true, clientId: true, status: true, enabledAt: true } });
    if (formalization?.clientId !== clientId || formalization.status !== 'HABILITADO') throw httpError(409, 'Administración todavía no ha habilitado este proyecto.', 'PROJECT_NOT_ENABLED');
    if (input.review && row.sourceSnapshot?.issue) throw httpError(409, 'Primero debe quedar resuelta la alternativa comercial aprobada.', 'PROJECT_SOURCE_UNRESOLVED');
    const pm = data.projectManagerId ? await tx.teamMember.findUnique({ where: { id: data.projectManagerId }, select: { id: true, isActive: true } }) : null;
    if (data.projectManagerId && !pm?.isActive) throw httpError(400, 'Selecciona un project manager activo del equipo.');
    const missing = projectOperationMissing(data, { projectManagerActive: pm?.isActive === true });
    if (input.review && missing.length) throw httpError(400, `Completa antes de revisar: ${missing.join(', ')}.`);
    const update = await tx.projectOperation.updateMany({
      where: { id: row.id, clientId, revision: input.expectedRevision },
      data: { ...data, revision: { increment: 1 }, reviewStatus: input.review ? 'REVISADO' : 'PENDIENTE', reviewedAt: input.review ? now : null, reviewedById: input.review ? user.id : null, updatedAt: now },
    });
    if (!update.count) throw httpError(409, 'La ficha cambió. Recarga y revisa la versión actual.', 'PROJECT_REVISION_CONFLICT');
    const changed = await tx.projectOperation.findUnique({ where: { id: row.id } });
    await audit(tx, changed, row, user.id);
    return serialize(tx, changed, formalization);
  });
};

export const projectOperationsService = {
  listClientProjects: (clientId, actor) => listClientProjects(prisma, clientId, actor),
  updateProjectOperation: (clientId, projectId, input, actor) => updateProjectOperation(prisma, clientId, projectId, input, actor),
};
