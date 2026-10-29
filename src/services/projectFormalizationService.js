// Formalización y habilitación de proyectos (punto 3 de la solicitud de Elisa; Rodny, 29 de octubre de 2026).
//
// 1. Una cotización aprobada —por el cliente desde su enlace o registrada por Comercial— abre su formalización: si el
//    cliente todavía no tiene ficha se le crea, las cuotas del plan de pagos aparecen en Cuentas por cobrar sin emitir y
//    el área Administrativa recibe el aviso.
// 2. Administración carga el contrato firmado; el anticipo se confirma solo cuando su cuenta por cobrar queda pagada, o
//    Dirección o Administración registran la autorización para empezar sin él.
// 3. Con las dos cosas el proyecto queda «Habilitado para iniciar» y su project manager recibe el aviso, sin cifras.
//
// Ningún paso de aquí deshace una aprobación ni un pago: quien llama anota el fallo y el reloj vuelve a intentarlo.
import { randomUUID } from 'node:crypto';
import prisma from '../lib/prisma.js';
import { createNotification } from './notificationService.js';
import { createClientWith } from './clientService.js';
import { activeAreaUserIds, userHasArea } from './teamAreaService.js';
import { inspectFinancialDocument } from './financialRecordDocumentService.js';
import { calculateProposalPayments, formatInstallmentDue, paymentPlanForScenario } from './quotationProposalDetails.js';
import { normalizeClientProfile } from '../lib/clientProfile.js';
import { pesosFromRate } from '../lib/receivableCurrency.js';
import { isWorkingTime } from '../lib/briaNudges.js';
import {
    FORMALIZATION_AREAS, FORMALIZATION_CONDITIONS_MAX, documentUploadProblem, documentVoidProblem, exceptionProblem, requirementsProblem,
    formalizationEnabledText, formalizationRequestText, formalizationState, quotationCode
} from '../lib/projectFormalization.js';

export const FORMALIZATION_REQUEST_TYPE = 'FORMALIZACION_PENDIENTE';
export const FORMALIZATION_ENABLED_TYPE = 'PROYECTO_HABILITADO';
export const FORMALIZATION_URL = '/financiero?tab=formalizacion';
// Las cotizaciones aprobadas antes de esto se formalizaron a mano: el reloj no les abre una formalización vieja.
export const FORMALIZATION_SINCE = new Date('2026-10-29T05:00:00Z');
const CHECK_MS = 30 * 60 * 1000;

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const actorIdOf = (actor) => actor?.userId || actor?.id || null;
const snapshot = (value) => JSON.parse(JSON.stringify(value));
const bogotaDay = (date) => new Date(new Date(date).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const monthStart = (day) => new Date(`${day.slice(0, 7)}-01T00:00:00.000Z`);
const audit = (db, entityId, action, after, actor) => db.financialAuditEvent.create({
    data: { entityType: 'ProjectFormalization', entityId, action, after: snapshot(after), actorId: actorIdOf(actor) }
});

/** ¿Puede esta persona ver y gestionar formalizaciones? Solo Dirección y Administrativa y contable. */
export const canManageFormalizations = async (db, user) => {
    const userId = actorIdOf(user);
    if (!userId) return false;
    for (const area of FORMALIZATION_AREAS) if (await userHasArea(db, userId, area)) return true;
    return false;
};

export const requireFormalizationAccess = (db = prisma) => async (req, res, next) => {
    try {
        if (await canManageFormalizations(db, req.user)) return next();
        return res.status(403).json({ error: 'La formalización de proyectos la gestionan Dirección y Administración.' });
    } catch (error) {
        console.error('[Formalización] No se pudo comprobar el área:', error?.message || error);
        return res.status(500).json({ error: 'No pudimos comprobar tu acceso.' });
    }
};

/**
 * Las cuotas del plan de pagos del escenario aprobado, en centavos y con su vencimiento. Sin plan de pagos no hay
 * cuotas: Administración liga a mano la cuenta del anticipo.
 */
export const quotationInstallments = (quotation) => {
    const details = quotation?.proposal_details;
    const scenarioId = Array.isArray(quotation?.items) ? quotation.items.find((item) => item?.selectedScenario)?.scenarioId ?? null : null;
    const plan = paymentPlanForScenario(details, scenarioId);
    if (!plan) return [];
    const rows = calculateProposalPayments(plan, { totalAmount: Number(quotation.total_amount) || 0, taxAmount: Number(quotation.tax_amount) || 0 });
    return rows.map((row, index) => ({
        id: row.id,
        label: row.label || `Cuota ${index + 1}`,
        amount: row.amount,
        dueType: row.dueType,
        dueDate: row.dueType === 'DATE' ? row.date : null,
        dueNote: formatInstallmentDue(row) || null,
        isAdvance: index === 0
    }));
};

// Un correo o un teléfono mal escrito en la cotización no puede impedir que el cliente tenga ficha: se deja fuera.
const clientProfileFromQuotation = (quotation) => {
    const input = {
        name: String(quotation.client_company || quotation.client_name || '').trim().slice(0, 120),
        contactName: quotation.client_company ? quotation.client_name : '',
        email: quotation.client_email || '',
        phone: quotation.client_phone || ''
    };
    let profile = normalizeClientProfile(input, { requireName: true });
    if (!profile.valid) {
        for (const key of Object.keys(profile.errors)) if (key !== 'name') delete input[key];
        profile = normalizeClientProfile(input, { requireName: true });
    }
    return profile.valid ? profile.data : null;
};

/** La ficha del cliente de la cotización; si todavía es un cliente potencial, aprobar lo hace cliente. */
const ensureQuotationClient = async (tx, quotation, actor, now) => {
    const lead = quotation.lead_id
        ? await tx.crmLead.findUnique({ where: { id: quotation.lead_id }, select: { id: true, clientId: true } })
        : null;
    if (lead?.clientId) {
        const existing = await tx.client.findUnique({ where: { id: lead.clientId }, select: { id: true, name: true } });
        if (existing) return existing;
    }
    const profile = clientProfileFromQuotation(quotation);
    if (!profile) return null;
    const client = await createClientWith(tx, profile);
    await tx.financialAuditEvent.create({
        data: { entityType: 'Client', entityId: client.id, action: 'CREATE', after: snapshot({ id: client.id, slug: client.slug, ...profile, origin: 'FORMALIZACION' }), actorId: actorIdOf(actor) }
    });
    if (lead) {
        await tx.crmLead.update({ where: { id: lead.id }, data: { clientId: client.id, updatedAt: now, lastActivityAt: now } });
        await tx.crmActivity.create({
            data: { leadId: lead.id, type: 'NOTA', occurredAt: now, authorId: actorIdOf(actor), note: `Aprobó la ${quotationCode(quotation)}: quedó creada su ficha de cliente.` }
        });
    }
    return { id: client.id, name: client.name };
};

/** Una cuota como cuenta por cobrar sin emitir. En dólares, la cartera va en pesos con la tasa de la cotización. */
const installmentReceivableData = (installment, quotation, client, acceptedDay) => {
    const usd = quotation.currency === 'USD';
    const rate = Number(quotation.exchange_rate) || null;
    const pesos = usd ? pesosFromRate(installment.amount, rate) : installment.amount;
    if (!pesos || pesos <= 0) return null;
    const periodDay = installment.dueDate || acceptedDay;
    return {
        clientId: client.id,
        amount: pesos,
        currency: usd ? 'USD' : 'COP',
        foreignAmount: usd ? installment.amount : null,
        exchangeRate: usd ? rate : null,
        exchangeRateSource: usd ? (quotation.exchange_rate_source || 'MANUAL') : null,
        exchangeRateDate: usd && quotation.exchange_rate_date ? bogotaDay(quotation.exchange_rate_date) : null,
        period: monthStart(periodDay),
        year: Number(periodDay.slice(0, 4)),
        month: Number(periodDay.slice(5, 7)),
        dueDate: installment.dueDate ? new Date(`${installment.dueDate}T12:00:00.000Z`) : null,
        status: 'DEBE',
        origin: 'SYSTEM',
        notes: `${installment.label} · ${quotationCode(quotation)}${installment.dueNote && !installment.dueDate ? ` · ${installment.dueNote}` : ''}`,
        sourceLabel: client.name,
        // Una cuota que vence con un hito o después del inicio todavía no tiene fecha: los avisos de cartera la esperan
        // hasta que se emita su cuenta de cobro.
        metadata: {
            origin: 'FORMALIZACION', quotationId: quotation.id, installmentId: installment.id, dueType: installment.dueType,
            waitsForMilestone: !installment.isAdvance && !installment.dueDate
        }
    };
};

const deliverAll = async (userIds, data, notify, log) => {
    let delivered = 0;
    for (const userId of userIds) {
        try {
            if (await notify({ userId, ...data })) delivered += 1;
        } catch (error) {
            log('[Formalización] Aviso no entregado:', error?.message || error);
        }
    }
    return delivered;
};

/**
 * Abre la formalización de una cotización aprobada. Idempotente: una cotización tiene una sola, y repetir la llamada
 * devuelve la que ya existe.
 */
export const startFormalization = async (db = prisma, quotationId, actor = null, { now = new Date(), notify = createNotification, log = console.error } = {}) => {
    const existing = await db.projectFormalization.findUnique({ where: { quotationId } });
    if (existing) return existing;
    const quotation = await db.quotation.findUnique({ where: { id: quotationId } });
    if (!quotation || quotation.status !== 'APROBADA') return null;
    const acceptedDay = bogotaDay(quotation.accepted_at || now);

    let created;
    try {
        created = await db.$transaction(async (tx) => {
            const client = await ensureQuotationClient(tx, quotation, actor, now);
            const receivables = [];
            if (client) {
                for (const installment of quotationInstallments(quotation)) {
                    const data = installmentReceivableData(installment, quotation, client, acceptedDay);
                    if (!data) continue;
                    const receivable = await tx.accountsReceivable.create({ data });
                    await tx.financialAuditEvent.create({ data: { entityType: 'AccountsReceivable', entityId: receivable.id, action: 'CREATE', after: snapshot(receivable), actorId: actorIdOf(actor) } });
                    receivables.push({ receivable, installment });
                }
            }
            const advance = receivables.find((item) => item.installment.isAdvance)?.receivable || null;
            const formalization = await tx.projectFormalization.create({
                data: { quotationId, clientId: client?.id || null, advanceReceivableId: advance?.id || null, requestedAt: now, requestedById: actorIdOf(actor) }
            });
            await audit(tx, formalization.id, 'CREATE', { ...formalization, quotation: quotationCode(quotation), receivables: receivables.map((item) => item.receivable.id) }, actor);
            return { formalization, client };
        });
    } catch (error) {
        if (error?.code === 'P2002') return db.projectFormalization.findUnique({ where: { quotationId } });
        throw error;
    }

    const clientName = created.client?.name || quotation.client_company || quotation.client_name;
    const administrative = await activeAreaUserIds(db, 'ADMINISTRATIVA');
    if (!administrative.length) log('[Formalización] Nadie del equipo está en el área Administrativa y contable: la solicitud de formalización no tiene a quién llegar.');
    await deliverAll(administrative, {
        type: FORMALIZATION_REQUEST_TYPE, relatedId: created.formalization.id, url: FORMALIZATION_URL,
        message: formalizationRequestText(clientName, quotationCode(quotation))
    }, notify, log);
    return created.formalization;
};

// Lo que la regla necesita de una formalización, además de sus documentos y su anticipo.
const stateInput = (formalization) => ({
    exceptionAt: formalization.exceptionAt,
    requiresContract: formalization.requiresContract !== false,
    requiresAdvance: formalization.requiresAdvance !== false
});

const formalizationInclude = async (db, formalization) => {
    const [documents, advance] = await Promise.all([
        db.projectFormalizationDocument.findMany({ where: { formalizationId: formalization.id }, orderBy: { uploadedAt: 'asc' } }),
        formalization.advanceReceivableId
            ? db.accountsReceivable.findUnique({ where: { id: formalization.advanceReceivableId }, select: { id: true, amount: true, status: true, number: true, currency: true, foreignAmount: true, payments: { select: { amount: true, reversedAt: true, kind: true } } } })
            : null
    ]);
    return { documents, advance };
};

/**
 * Mira si una formalización ya cumple y, si cumple, la habilita y avisa al project manager de la cuenta (o, si la
 * cuenta no tiene, al área de Project management para que alguien la tome). La escritura condicional impide avisar dos
 * veces aunque dos caminos lleguen a la vez.
 */
export const refreshFormalization = async (db = prisma, formalizationId, { now = new Date(), notify = createNotification, log = console.error } = {}) => {
    const formalization = await db.projectFormalization.findUnique({ where: { id: formalizationId } });
    if (!formalization || formalization.status === 'HABILITADO') return formalization;
    const { documents, advance } = await formalizationInclude(db, formalization);
    const state = formalizationState({ documents, advance, ...stateInput(formalization) });
    if (!state.ready) return formalization;
    const update = await db.projectFormalization.updateMany({ where: { id: formalization.id, status: 'PENDIENTE' }, data: { status: 'HABILITADO', enabledAt: now } });
    if (!update.count) return db.projectFormalization.findUnique({ where: { id: formalization.id } });
    await audit(db, formalization.id, 'UPDATE', { operation: 'ENABLE', enabledAt: now, advance: state.advance, exception: state.exception }, null);

    const client = formalization.clientId
        ? await db.client.findUnique({ where: { id: formalization.clientId }, select: { name: true, slug: true, projectManager: { select: { userId: true, isActive: true } } } })
        : null;
    const pm = client?.projectManager?.isActive !== false ? client?.projectManager?.userId : null;
    const recipients = pm ? [pm] : await activeAreaUserIds(db, 'PROJECT_MANAGEMENT');
    const delivered = await deliverAll(recipients, {
        type: FORMALIZATION_ENABLED_TYPE, relatedId: formalization.id,
        url: client?.slug ? `/clientes/operacion/${client.slug}` : '/clientes',
        message: formalizationEnabledText(client?.name)
    }, notify, log);
    if (delivered) await db.projectFormalization.update({ where: { id: formalization.id }, data: { projectManagerNotified: true } });
    return db.projectFormalization.findUnique({ where: { id: formalization.id } });
};

/** Después de un pago: la formalización cuyo anticipo es esa cuenta puede quedar habilitada. */
export const refreshFormalizationsForReceivable = async (db = prisma, receivableId, options = {}) => {
    if (!receivableId || typeof db.projectFormalization?.findMany !== 'function') return [];
    const pending = await db.projectFormalization.findMany({ where: { advanceReceivableId: receivableId, status: 'PENDIENTE' }, select: { id: true } });
    const results = [];
    for (const item of pending) results.push(await refreshFormalization(db, item.id, options));
    return results;
};

const serializeDocument = (document) => ({
    id: document.id, name: document.name, mimeType: document.mimeType, size: Number(document.size), uploadedAt: document.uploadedAt,
    kind: document.kind || 'CONTRATO', note: document.note || null, voidedAt: document.voidedAt || null, voidReason: document.voidReason || null
});

const serializeFormalization = (formalization, { quotation, client, documents, advance, clientReceivables }) => {
    const state = formalizationState({ documents, advance, ...stateInput(formalization) });
    return {
        id: formalization.id,
        status: formalization.status,
        requestedAt: formalization.requestedAt,
        enabledAt: formalization.enabledAt,
        projectManagerNotified: formalization.projectManagerNotified,
        state,
        quotation: quotation ? {
            id: quotation.id, code: quotationCode(quotation), slug: quotation.uuid_slug, clientName: quotation.client_name,
            company: quotation.client_company, total: Number(quotation.total_amount) || 0, currency: quotation.currency || 'COP',
            acceptedAt: quotation.accepted_at, emisor: quotation.emisor_type
        } : null,
        client: client ? { id: client.id, name: client.name, slug: client.slug, projectManager: client.projectManager?.name || null } : null,
        documents: documents.map(serializeDocument),
        advance: advance ? { id: advance.id, amount: Number(advance.amount) || 0, status: advance.status, number: advance.number, currency: advance.currency, foreignAmount: advance.foreignAmount == null ? null : Number(advance.foreignAmount) } : null,
        exception: formalization.exceptionAt ? {
            at: formalization.exceptionAt, byName: formalization.exceptionByName, reason: formalization.exceptionReason,
            conditions: formalization.exceptionConditions, paymentDate: formalization.exceptionPaymentDate
        } : null,
        requirements: {
            requiresContract: formalization.requiresContract !== false,
            requiresAdvance: formalization.requiresAdvance !== false,
            note: formalization.requirementsNote || null,
            changedAt: formalization.requirementsChangedAt || null,
            changedByName: formalization.requirementsChangedByName || null
        },
        clientReceivables
    };
};

/** Las formalizaciones, primero las pendientes. Para ligar el anticipo se ofrecen las cuentas abiertas del cliente. */
export const listFormalizations = async (db = prisma) => {
    const rows = await db.projectFormalization.findMany({ orderBy: [{ status: 'desc' }, { requestedAt: 'desc' }], take: 200 });
    const quotationIds = rows.map((row) => row.quotationId);
    const clientIds = [...new Set(rows.map((row) => row.clientId).filter(Boolean))];
    const [quotations, clients] = await Promise.all([
        quotationIds.length ? db.quotation.findMany({ where: { id: { in: quotationIds } }, select: { id: true, consecutive: true, uuid_slug: true, client_name: true, client_company: true, total_amount: true, currency: true, accepted_at: true, emisor_type: true } }) : [],
        clientIds.length ? db.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, slug: true, projectManager: { select: { name: true } } } }) : []
    ]);
    const quotationById = new Map(quotations.map((item) => [item.id, item]));
    const clientById = new Map(clients.map((item) => [item.id, item]));
    const items = [];
    for (const row of rows) {
        const { documents, advance } = await formalizationInclude(db, row);
        const clientReceivables = !row.advanceReceivableId && row.clientId && row.status === 'PENDIENTE'
            ? (await db.accountsReceivable.findMany({
                where: { clientId: row.clientId, kind: 'CLIENTE', status: { notIn: ['PAGADO', 'SALDADO'] } },
                orderBy: { createdAt: 'desc' }, take: 20,
                select: { id: true, amount: true, number: true, notes: true, concept: true, period: true }
            })).map((item) => ({ id: item.id, amount: Number(item.amount) || 0, number: item.number, label: item.concept || item.notes || null, period: item.period }))
            : [];
        items.push(serializeFormalization(row, { quotation: quotationById.get(row.quotationId), client: clientById.get(row.clientId), documents, advance, clientReceivables }));
    }
    return { items };
};

const loadFormalization = async (db, id) => {
    const formalization = await db.projectFormalization.findUnique({ where: { id: String(id || '') } });
    if (!formalization) throw httpError(404, 'Esa formalización ya no existe.');
    return formalization;
};

/**
 * Carga el contrato firmado, un otrosí o un anexo (29 de octubre de 2026), con una nota opcional. Nunca se borra; solo
 * un contrato vigente cuenta para habilitar el proyecto.
 */
export const attachFormalizationDocument = async (db, storage, id, file, details = {}, actor = {}, options = {}) => {
    const formalization = await loadFormalization(db, id);
    const kind = String(details.kind || 'CONTRATO').trim().toUpperCase();
    const problem = documentUploadProblem({ kind, note: details.note });
    if (problem) throw httpError(400, problem);
    const meta = inspectFinancialDocument(file);
    const key = `formalizations/${formalization.id}/${randomUUID()}${meta.extension}`;
    await storage.upload({ key, body: meta.buffer, mimeType: meta.mimeType, size: meta.size, name: meta.name });
    const document = await db.$transaction(async (tx) => {
        const created = await tx.projectFormalizationDocument.create({
            data: {
                formalizationId: formalization.id, storageKey: key, name: meta.name, mimeType: meta.mimeType, size: meta.size, sha256: meta.sha256,
                uploadedById: actorIdOf(actor), kind, note: String(details.note ?? '').trim() || null
            }
        });
        await audit(tx, formalization.id, 'UPDATE', { operation: 'DOCUMENT', documentId: created.id, kind, name: created.name, sha256: created.sha256 }, actor);
        return created;
    });
    const refreshed = await refreshFormalization(db, formalization.id, options);
    return { document: serializeDocument(document), status: refreshed?.status || formalization.status };
};

/**
 * Anula un documento subido por error: sigue guardado, con quién, cuándo y por qué, y deja de contar. Anular el único
 * contrato no deshace una habilitación que ya se avisó: el proyecto ya pudo haber empezado.
 */
export const voidFormalizationDocument = async (db, id, documentId, reason, actor = {}, { now = new Date() } = {}) => {
    const problem = documentVoidProblem(reason);
    if (problem) throw httpError(400, problem);
    const document = await db.projectFormalizationDocument.findFirst({ where: { id: String(documentId || ''), formalizationId: String(id || '') } });
    if (!document) throw httpError(404, 'El documento no pertenece a esta formalización o no existe.');
    if (document.voidedAt) throw httpError(409, 'Ese documento ya estaba anulado.');
    const data = { voidedAt: now, voidReason: String(reason).trim(), voidedById: actorIdOf(actor) };
    const update = await db.projectFormalizationDocument.updateMany({ where: { id: document.id, voidedAt: null }, data });
    if (!update.count) throw httpError(409, 'Ese documento ya estaba anulado.');
    await audit(db, document.formalizationId, 'UPDATE', { operation: 'DOCUMENT_VOID', documentId: document.id, kind: document.kind, ...data }, actor);
    return serializeDocument({ ...document, ...data });
};

export const openFormalizationDocument = async (db, storage, id, documentId) => {
    const document = await db.projectFormalizationDocument.findFirst({ where: { id: String(documentId || ''), formalizationId: String(id || '') } });
    if (!document) throw httpError(404, 'El documento no pertenece a esta formalización o no existe.');
    const object = await storage.get(document.storageKey);
    return { document, object };
};

/**
 * Autoriza empezar sin el anticipo (Dirección o Administración). Queda con quién, cuándo, por qué, en qué condiciones y
 * para cuándo se acordó el pago; la deuda sigue en Cuentas por cobrar.
 */
export const registerFormalizationException = async (db, id, input = {}, actor = {}, options = {}) => {
    const now = options.now || new Date();
    const formalization = await loadFormalization(db, id);
    if (formalization.status === 'HABILITADO') throw httpError(409, 'Este proyecto ya está habilitado.');
    if (formalization.exceptionAt) throw httpError(409, 'Esta formalización ya tiene una autorización para empezar sin el anticipo.');
    const problem = exceptionProblem(input, bogotaDay(now));
    if (problem) throw httpError(400, problem);
    const data = {
        exceptionAt: now,
        exceptionById: actorIdOf(actor),
        exceptionByName: actor?.name || null,
        exceptionReason: String(input.reason).trim(),
        exceptionConditions: String(input.conditions ?? '').trim().slice(0, FORMALIZATION_CONDITIONS_MAX) || null,
        exceptionPaymentDate: String(input.paymentDate).trim()
    };
    const update = await db.projectFormalization.updateMany({ where: { id: formalization.id, exceptionAt: null, status: 'PENDIENTE' }, data });
    if (!update.count) throw httpError(409, 'La formalización cambió mientras tanto. Recarga y vuelve a intentarlo.');
    await audit(db, formalization.id, 'UPDATE', { operation: 'EXCEPTION', ...data }, actor);
    return refreshFormalization(db, formalization.id, options);
};

/**
 * Cambia lo que se pide en un proyecto (Rodny, 29 de octubre de 2026): a un cliente de siempre que suma un servicio
 * quizá no se le pide anticipo ni contrato nuevo. Queda quién, cuándo y una nota opcional; si con eso ya cumple, el
 * proyecto queda habilitado en el acto. Un proyecto ya habilitado no se cambia.
 */
export const setFormalizationRequirements = async (db, id, input = {}, actor = {}, options = {}) => {
    const now = options.now || new Date();
    const problem = requirementsProblem(input);
    if (problem) throw httpError(400, problem);
    const formalization = await loadFormalization(db, id);
    if (formalization.status === 'HABILITADO') throw httpError(409, 'Este proyecto ya está habilitado.');
    const data = {
        requiresContract: input.requiresContract,
        requiresAdvance: input.requiresAdvance,
        requirementsNote: String(input.note ?? '').trim() || null,
        requirementsChangedAt: now,
        requirementsChangedById: actorIdOf(actor),
        requirementsChangedByName: actor?.name || null
    };
    const update = await db.projectFormalization.updateMany({ where: { id: formalization.id, status: 'PENDIENTE' }, data });
    if (!update.count) throw httpError(409, 'La formalización cambió mientras tanto. Recarga y vuelve a intentarlo.');
    await audit(db, formalization.id, 'UPDATE', {
        operation: 'REQUIREMENTS',
        from: { requiresContract: formalization.requiresContract !== false, requiresAdvance: formalization.requiresAdvance !== false },
        ...data
    }, actor);
    return refreshFormalization(db, formalization.id, options);
};

/** Liga a mano la cuenta del anticipo cuando la cotización no traía plan de pagos. Solo cuentas del mismo cliente. */
export const linkFormalizationAdvance = async (db, id, receivableId, actor = {}, options = {}) => {
    const formalization = await loadFormalization(db, id);
    if (formalization.status === 'HABILITADO') throw httpError(409, 'Este proyecto ya está habilitado.');
    const receivable = await db.accountsReceivable.findUnique({ where: { id: String(receivableId || '') }, select: { id: true, clientId: true, kind: true } });
    if (!receivable || receivable.kind !== 'CLIENTE' || !formalization.clientId || receivable.clientId !== formalization.clientId) {
        throw httpError(400, 'Elige una cuenta por cobrar de este mismo cliente.');
    }
    await db.projectFormalization.update({ where: { id: formalization.id }, data: { advanceReceivableId: receivable.id } });
    await audit(db, formalization.id, 'UPDATE', { operation: 'ADVANCE_LINK', from: formalization.advanceReceivableId, to: receivable.id }, actor);
    return refreshFormalization(db, formalization.id, options);
};

/**
 * Una pasada del reloj: abre la formalización de las cotizaciones aprobadas que no la tengan (si el primer intento
 * falló) y habilita las que ya cumplen.
 */
export const sweepFormalizations = async (db = prisma, options = {}) => {
    const log = options.log || console.error;
    const approved = await db.quotation.findMany({
        where: { status: 'APROBADA', accepted_at: { gte: FORMALIZATION_SINCE } },
        select: { id: true }
    });
    const started = new Set((await db.projectFormalization.findMany({ where: { quotationId: { in: approved.map((item) => item.id) } }, select: { quotationId: true } })).map((item) => item.quotationId));
    for (const quotation of approved) {
        if (started.has(quotation.id)) continue;
        await startFormalization(db, quotation.id, null, options).catch((error) => log('[Formalización] No se pudo abrir:', error?.message || error));
    }
    const pending = await db.projectFormalization.findMany({ where: { status: 'PENDIENTE' }, select: { id: true } });
    for (const item of pending) {
        await refreshFormalization(db, item.id, options).catch((error) => log('[Formalización] No se pudo revisar:', error?.message || error));
    }
};

export const initFormalizationScheduler = ({ db = prisma, interval = CHECK_MS } = {}) => {
    const run = () => {
        if (!isWorkingTime(new Date())) return;
        sweepFormalizations(db).catch((error) => console.error('[Formalización] Revisión de formalizaciones:', error?.message || error));
    };
    const startup = setTimeout(run, 50_000);
    startup.unref?.();
    const timer = setInterval(run, interval);
    timer.unref?.();
    console.log('[Formalización] Revisión de formalizaciones activa (cada 30 minutos, horario hábil).');
    return timer;
};
