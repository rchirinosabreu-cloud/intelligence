import { visibleSteps, validateStep, buildLeadDraft, selectedServices, SERVICE_CATEGORIES } from '../lib/commercialRequestForm.js';
import { formatLeadCode } from '../lib/crmRules.js';
import { normalizeCompanyKey } from './crmService.js';

export class CommercialRequestError extends Error {
  constructor(message, details = null) {
    super(message);
    this.name = 'CommercialRequestError';
    this.statusCode = 400;
    this.details = details;
  }
}

export const DEFAULT_INTAKE_OWNER = 'Francys';
const MAX_PAYLOAD_KEYS = 120;
const MAX_TEXT = 4000;

const fold = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Trims every string, caps lengths and drops anything the form does not define. */
export const sanitizeAnswers = (raw = {}) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CommercialRequestError('Las respuestas no tienen el formato esperado.');
  const entries = Object.entries(raw).slice(0, MAX_PAYLOAD_KEYS);
  const answers = {};
  for (const [key, value] of entries) {
    if (!/^[a-zA-Z0-9_.]{1,40}$/.test(key)) continue;
    if (typeof value === 'string') answers[key] = value.trim().slice(0, MAX_TEXT);
    else if (Array.isArray(value)) answers[key] = value.filter(item => typeof item === 'string').map(item => item.trim().slice(0, 80)).slice(0, 30);
    else if (value && typeof value === 'object') answers[key] = { amount: typeof value.amount === 'string' || typeof value.amount === 'number' ? String(value.amount).slice(0, 30) : '', undefined: Boolean(value.undefined) };
  }
  return answers;
};

/** Validates every visible step the way the browser does; the API never trusts the client. */
export const validateAnswers = answers => {
  const errors = {};
  for (const step of visibleSteps(answers)) Object.assign(errors, validateStep(step, answers));
  if (selectedServices(answers).length === 0 && !(Array.isArray(answers.services) && answers.services.length)) errors.services = 'Elige al menos una opción.';
  return errors;
};

/** Finds the roster member the intake assigns to (exact or first-name match, active only). */
export const resolveIntakeOwner = async (db, ownerName = DEFAULT_INTAKE_OWNER) => {
  const members = await db.teamMember.findMany({ where: { isActive: true } });
  const wanted = fold(ownerName);
  if (!wanted) return null;
  return members.find(member => fold(member.name) === wanted) || members.find(member => fold(member.name).split(' ').includes(wanted)) || null;
};

const requestSummary = (answers, draft) => {
  const services = selectedServices(answers).map(value => SERVICE_CATEGORIES.find(item => item.value === value)?.label).filter(Boolean);
  return [`Solicitud recibida por el formulario comercial.`, services.length ? `Servicios: ${services.join(', ')}.` : null, draft.lead.notes].filter(Boolean).join('\n');
};

/**
 * Creates the opportunity from a public submission: lead + request + first log entry, in one transaction.
 * Returns { reference, leadId, ownerId }. Notifications and emails are the caller's job (never inside the tx).
 */
export const receiveCommercialRequest = async (db, payload = {}, { now = new Date(), ownerName = process.env.CRM_INTAKE_OWNER || DEFAULT_INTAKE_OWNER } = {}) => {
  if (payload.website_confirm) {
    // Honeypot filled by a bot: pretend success without writing anything.
    return { reference: null, leadId: null, ownerId: null, ignored: true };
  }
  const answers = sanitizeAnswers(payload.answers);
  const errors = validateAnswers(answers);
  if (Object.keys(errors).length > 0) throw new CommercialRequestError('Faltan datos o hay campos con formato inválido.', errors);

  const draft = buildLeadDraft(answers, { receivedAt: now });
  const owner = await resolveIntakeOwner(db, ownerName);
  const meta = payload.meta && typeof payload.meta === 'object' ? {
    referrer: typeof payload.meta.referrer === 'string' ? payload.meta.referrer.slice(0, 300) : null,
    campaign: typeof payload.meta.campaign === 'string' ? payload.meta.campaign.slice(0, 80) : null,
    source: typeof payload.meta.source === 'string' ? payload.meta.source.slice(0, 80) : null,
    locale: typeof payload.meta.locale === 'string' ? payload.meta.locale.slice(0, 20) : null
  } : null;

  return db.$transaction(async tx => {
    const lead = await tx.crmLead.create({
      data: {
        ...draft.lead,
        companyKey: normalizeCompanyKey(draft.lead.company),
        enteredAt: now,
        enteredAtEstimated: false,
        stage: 'POR_GESTIONAR',
        ownerId: owner?.id || null,
        nextFollowUpAt: draft.lead.nextFollowUpAt ? new Date(`${draft.lead.nextFollowUpAt}T00:00:00.000Z`) : null,
        callDeadlineAt: draft.lead.callDeadlineAt ? new Date(`${draft.lead.callDeadlineAt}T00:00:00.000Z`) : null,
        publishedAt: null,
        createdById: null
      }
    });
    await tx.crmRequest.create({
      data: { leadId: lead.id, version: draft.request.version, answers, services: draft.request.services, suggestedItems: draft.request.suggestedItems, meta, receivedAt: now }
    });
    await tx.crmActivity.create({
      data: { leadId: lead.id, type: 'NOTA', occurredAt: now, note: requestSummary(answers, draft), result: 'Pendiente de revisión y primer contacto.', nextAction: draft.lead.nextAction, authorId: null }
    });
    return { reference: formatLeadCode(lead.consecutive), leadId: lead.id, ownerId: owner?.id || null, ownerUserId: owner?.userId || null, company: draft.lead.company, contactName: draft.lead.contactName, email: draft.lead.email, services: draft.request.services };
  });
};

/** Who gets the in-app notice: the assigned owner plus every active admin (deduplicated). */
export const intakeRecipients = async (db, ownerUserId = null) => {
  const admins = typeof db.user?.findMany === 'function'
    ? await db.user.findMany({ where: { role: 'ADMIN', isActive: true, teamMember: { is: { isActive: true } } }, select: { id: true } })
    : [];
  return [...new Set([ownerUserId, ...admins.map(user => user.id)].filter(Boolean))];
};

export const buildConfirmationEmail =({ contactName, reference }) => ({
  subject: 'Recibimos tu solicitud · Brain Studio',
  text: `Hola ${contactName || ''}.\n\nGracias por compartirnos tu proyecto. Nuestro equipo revisará la información y se pondrá en contacto contigo para validar los detalles necesarios y avanzar con la propuesta.\n\nReferencia de tu solicitud: ${reference}.\n\nBrain Studio · Comunicación, creatividad y marketing 360° para marcas que quieren trascender.`
});
