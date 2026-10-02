import crypto from 'node:crypto';
import {
  prepareQuotationItems, calculateQuotationTotals, buildNewQuotationValidity, resolveQuotationTaxExemption,
  normalizeQuotationDuration, normalizeQuotationDiscount, normalizeQuotationExchangeRate, isScenarioQuotation, quotationProposalTotals
} from './quotationDomainService.js';
import { buildContractTermsText, resolveSuggestedContractTermIds, termsWithProposalPayments } from './quotationContractTerms.js';
import { normalizeProposalDetails, plainTextToProposalHtml } from './quotationProposalDetails.js';
import { catalogServiceHtml } from './serviceCatalogDescription.js';
import { answerLabel, selectedServices, SERVICE_CATEGORIES } from '../lib/commercialRequestForm.js';
import { formatLeadCode, stageOrder, stageGroup } from '../lib/crmRules.js';
import { changeStage } from './crmService.js';

// A quotation draft born from a CRM opportunity. Deterministic: every line comes from the catalog name the
// public form already suggested, or is an explicit custom line with price 0 for Francys to complete.

const RECURRING_NAME = /mensual|marketing (inicial|b[aá]sico|est[aá]ndar|producci[oó]n ampliada|pro)\b|community management|administraci[oó]n|gesti[oó]n (de )?(meta|google|seo|linkedin|boost)|plan (reactivaci|presencia|impulso)|mantenimiento|soporte t[eé]cnico|apoyo mensual/i;

const fold = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

export const guessBillingType = name => (RECURRING_NAME.test(fold(name)) ? 'MONTHLY' : 'ONE_TIME');

export const formatQuotationCode = consecutive => `COT-${String(consecutive ?? 0).padStart(4, '0')}`;

// Item notes are printed for the client, so nothing internal goes there: the review hints live in the bitácora.
const catalogItem = (service, quantity = 1) => ({
  serviceId: service.id,
  name: service.name,
  description: service.description || '',
  descriptionHtml: catalogServiceHtml(service),
  category: service.category,
  price: Number(service.valor_neto ?? service.precio_comercial_sugerido ?? 0),
  quantity: Math.max(1, Number(quantity) || 1),
  note: '',
  estimatedCost: service.costo_real_estimado ?? null,
  catalogFinalPrice: service.valor_neto ?? null,
  billingType: guessBillingType(service.name)
});

const catalogIndex = catalog => new Map(catalog.filter(service => service.activo !== false).map(service => [fold(service.name), service]));

/** Lines for the draft: catalog items by exact (accent-insensitive) name, custom lines for the rest. */
export const draftItemsFromRequest = (request, catalog = []) => {
  const byName = catalogIndex(catalog);
  const items = [];
  const seen = new Set();
  for (const suggestion of request?.suggestedItems || []) {
    const service = suggestion.custom ? null : byName.get(fold(suggestion.name));
    const key = service ? `catalog:${service.id}` : `custom:${fold(suggestion.name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (service) {
      items.push(catalogItem(service, suggestion.quantity));
    } else {
      const description = suggestion.detail && !/^Sin equivalente/i.test(suggestion.detail) ? suggestion.detail : 'Alcance por definir con el cliente.';
      items.push({
        name: suggestion.name,
        description,
        descriptionHtml: plainTextToProposalHtml(description),
        category: suggestion.category || null,
        price: 0,
        quantity: Math.max(1, Number(suggestion.quantity) || 1),
        note: '',
        estimatedCost: null,
        billingType: 'ONE_TIME'
      });
    }
  }
  return items;
};

// ---- the prospect's budget is a ceiling ----------------------------------------------------------------------
// Rodny, 2 de octubre de 2026: «si el cliente dijo que el presupuesto es de hasta 3 millones, la cotización no se
// puede salir de ahí». The draft compares what the client would pay (IVA included) with the figure they wrote.

const TAX_FACTOR = 1.19;

/** Families where a cheaper tier is the same service with less volume; ordered from cheapest to priciest. */
export const TIER_LADDERS = [
  ['Marketing Inicial – 6 contenidos', 'Marketing Básico – 8 contenidos', 'Marketing Estándar – 12 contenidos', 'Marketing Producción Ampliada – 12 contenidos', 'Marketing Pro – 20 contenidos'],
  ['Marca Plan Básico', 'Marca Plan Estándar', 'Marca Plan Pro'],
  ['Plan Reactivación Básica', 'Plan Presencia Activa', 'Plan Impulso Digital'],
  ['Administración básica Meta Ads', 'Administración de Meta Ads', 'Administración Meta Ads + Google Ads']
];

const parseMoney = value => {
  if (!value || value.undefined) return null;
  const number = Number(String(value.amount ?? value).replace(/[^0-9]/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
};

/**
 * What the form said about money, as a ceiling the draft must respect.
 * MENSUAL caps what the client pays in any single month; the other scopes cap the whole proposal.
 */
export const budgetCeiling = request => {
  const answers = request?.answers || {};
  if (answers['budget.has'] !== 'SI') return null;
  const amount = parseMoney(answers['budget.amount']);
  if (!amount) return null;
  const currency = answers['budget.currency'] || 'COP';
  const scope = answers['budget.scope'];
  const base = { amount, currency, scope, scopeLabel: answerLabel('budget.scope', scope) || 'Presupuesto' };
  if (currency !== 'COP') return { ...base, unsupported: true };
  return { ...base, unsupported: false, mode: scope === 'MENSUAL' ? 'MONTHLY' : 'TOTAL' };
};

const itemCharge = (item, mode, durationMonths) => {
  const months = mode === 'TOTAL' && item.billingType === 'MONTHLY' ? durationMonths : 1;
  return Number(item.price || 0) * Number(item.quantity || 1) * months * TAX_FACTOR;
};

/**
 * Keeps the draft under the ceiling, line by line and in the order the client chose them: a line that does not fit
 * drops to the priciest cheaper tier of its family that does; without one, it stays out. Every change is reported.
 */
export const fitItemsToBudget = (items, ceiling, catalog = [], durationMonths = 1) => {
  if (!ceiling || ceiling.unsupported) return { items, changes: [] };
  const byName = catalogIndex(catalog);
  const kept = [];
  const changes = [];
  let spent = 0;
  for (const item of items) {
    const charge = itemCharge(item, ceiling.mode, durationMonths);
    if (spent + charge <= ceiling.amount) {
      kept.push(item);
      spent += charge;
      continue;
    }
    const ladder = TIER_LADDERS.find(names => names.some(name => fold(name) === fold(item.name)));
    const cheaper = ladder
      ? ladder.slice(0, ladder.findIndex(name => fold(name) === fold(item.name))).reverse()
        .map(name => byName.get(fold(name))).filter(Boolean).map(service => catalogItem(service, item.quantity))
        .find(candidate => candidate.price < item.price && spent + itemCharge(candidate, ceiling.mode, durationMonths) <= ceiling.amount)
      : null;
    if (cheaper) {
      kept.push(cheaper);
      spent += itemCharge(cheaper, ceiling.mode, durationMonths);
      changes.push({ kind: 'DOWNGRADED', from: item.name, to: cheaper.name });
    } else {
      changes.push({ kind: 'EXCLUDED', name: item.name });
    }
  }
  return { items: kept, changes };
};

const formatCop = value => `$${Math.round(value).toLocaleString('es-CO')}`;

/** One sentence for the bitácora explaining what the ceiling did to the draft. */
export const describeBudgetFit = (ceiling, changes = []) => {
  if (!ceiling) return null;
  const figure = `${formatCop(ceiling.amount)} ${ceiling.currency} (${ceiling.scopeLabel.toLowerCase()})`;
  if (ceiling.unsupported) return `Presupuesto indicado en ${ceiling.currency}: no se ajustó automáticamente, revisar contra ${figure}.`;
  if (!changes.length) return `Dentro del presupuesto indicado: ${figure}.`;
  const parts = changes.map(change => (change.kind === 'DOWNGRADED' ? `«${change.from}» bajó a «${change.to}»` : `«${change.name}» quedó fuera`));
  return `Ajustado al presupuesto de ${figure}: ${parts.join('; ')}.`;
};

const line = (label, value) => (value ? `${label}: ${value}` : null);

/** Human introduction for the proposal, built only from what the prospect wrote. */
export const draftIntroductionText = (lead, request) => {
  const answers = request?.answers || {};
  const services = selectedServices(answers).map(value => SERVICE_CATEGORIES.find(item => item.value === value)?.label).filter(Boolean);
  const budget = answers['budget.has'] === 'SI' && answers['budget.amount']?.amount
    ? `${answers['budget.amount'].amount} ${answers['budget.currency'] || 'COP'} (${answerLabel('budget.scope', answers['budget.scope'])})`
    : null;
  return [
    `Propuesta preparada a partir de la solicitud comercial de ${lead.company || lead.contactName || 'el cliente'}${request?.receivedAt ? ` recibida el ${new Date(request.receivedAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.`,
    line('Lo que nos contó', answers.need),
    services.length ? line('Servicios de interés', services.join(', ')) : null,
    answers.startWhen ? line('Inicio deseado', answerLabel('startWhen', answers.startWhen)) : null,
    answers.hasKeyDate === 'SI' && answers.keyDate ? line('Fecha importante', `${answers.keyDate}${answers.keyDateNote ? ` · ${answers.keyDateNote}` : ''}`) : null,
    budget ? line('Presupuesto indicado', budget) : null,
    answers['amc.interest'] && answers['amc.interest'] !== 'NO' ? line('Interés en AMC', `${answerLabel('amc.interest', answers['amc.interest'])}${answers['amc.plan'] ? ` · ${answerLabel('amc.plan', answers['amc.plan'])}` : ''}`) : null
  ].filter(Boolean).join('\n');
};

/** Months the proposal covers: a one-off budget buys one month of anything recurring, an annual one buys twelve. */
const durationFor = (items, ceiling) => {
  if (!items.some(item => item.billingType === 'MONTHLY')) return 1;
  if (!ceiling || ceiling.unsupported || ceiling.scope === 'MENSUAL') return 3;
  return ceiling.scope === 'ANUAL' ? 12 : 1;
};

/** Pure: the request body a human would have sent to POST /api/quotations for this lead, plus what the budget did. */
export const buildDraftBody = (lead, request, catalog = []) => {
  const suggested = draftItemsFromRequest(request, catalog);
  const ceiling = budgetCeiling(request);
  const durationMonths = durationFor(suggested, ceiling);
  const { items, changes } = fitItemsToBudget(suggested, ceiling, catalog, durationMonths);
  return {
    emisor_type: 'BRAIN_STUDIO',
    status: 'BORRADOR',
    client_name: lead.contactName || lead.company || 'Borrador',
    client_company: lead.company || null,
    client_type: lead.company ? 'EMPRESA' : 'PERSONA_NATURAL',
    client_email: lead.email || '',
    client_phone: lead.phone || '',
    currency: 'COP',
    duration_months: durationFor(items, ceiling) || durationMonths,
    items,
    proposal_details: { version: 1, title: `Propuesta para ${lead.company || lead.contactName || 'el cliente'}`, introductionHtml: plainTextToProposalHtml(draftIntroductionText(lead, request)) },
    budget: ceiling ? { amount: ceiling.amount, currency: ceiling.currency, scopeLabel: ceiling.scopeLabel, unsupported: ceiling.unsupported, changes } : null
  };
};

/** Same composition the controller does for a manual creation, reduced to what a draft needs. */
export const composeDraftRecord = (body, catalogServices, now = new Date()) => {
  const preparedItems = prepareQuotationItems(body.items, catalogServices);
  const durationMonths = normalizeQuotationDuration(body.duration_months);
  const discount = normalizeQuotationDiscount({});
  const exchangeRateSnapshot = normalizeQuotationExchangeRate({ currency: body.currency });
  const isTaxExempt = resolveQuotationTaxExemption({ currency: body.currency, emisorType: body.emisor_type, clientType: body.client_type });
  const scenarioMode = isScenarioQuotation(preparedItems);
  const totals = scenarioMode
    ? { subtotal: 0, discountAmount: 0, taxAmount: 0, totalAmount: 0 }
    : calculateQuotationTotals(preparedItems, isTaxExempt, { durationMonths, discountType: discount.discountType, discountValue: discount.discountValue });
  const terms = buildContractTermsText(resolveSuggestedContractTermIds(catalogServices, { currency: body.currency, isTaxExempt }));
  const proposalDetails = normalizeProposalDetails(body.proposal_details, { issue: false, totalsByScenario: quotationProposalTotals(preparedItems, isTaxExempt, { durationMonths, ...discount }) });
  return {
    uuid_slug: crypto.randomUUID(),
    emisor_type: body.emisor_type,
    status: 'BORRADOR',
    client_name: body.client_name,
    client_company: body.client_type === 'EMPRESA' ? body.client_company : null,
    client_email: body.client_email || '',
    client_phone: body.client_phone || '',
    is_tax_exempt: isTaxExempt,
    items: preparedItems,
    ...(proposalDetails ? { proposal_details: proposalDetails } : {}),
    duration_months: durationMonths,
    discount_type: null,
    discount_value: 0,
    discount_label: null,
    discount_amount: totals.discountAmount,
    currency: body.currency,
    ...exchangeRateSnapshot,
    subtotal: totals.subtotal,
    tax_amount: totals.taxAmount,
    total_amount: totals.totalAmount,
    terms_and_conditions: termsWithProposalPayments(terms, false),
    created_at: now,
    ...buildNewQuotationValidity('BORRADOR', now)
  };
};

const notFound = () => Object.assign(new Error('Oportunidad no encontrada.'), { statusCode: 404 });

/**
 * Creates a BORRADOR quotation linked to the lead and logs it in the lead's bitácora.
 * `auto: true` (intake) creates nothing when the lead already has a draft; a manual call always adds a new version.
 */
export const createQuotationDraftForLead = async (db, leadId, actor = {}, { now = new Date(), auto = false } = {}) => {
  const lead = await db.crmLead.findUnique({ where: { id: leadId }, include: { request: true, quotations: { select: { id: true, status: true, consecutive: true } } } });
  if (!lead || lead.archivedAt) throw notFound();
  if (auto && (lead.quotations || []).some(quotation => quotation.status === 'BORRADOR')) {
    return { created: false, reason: 'already-has-draft', quotation: null };
  }
  const catalog = await db.serviceCatalog.findMany({ where: { activo: true } });
  const body = buildDraftBody(lead, lead.request, catalog);
  const used = catalog.filter(service => body.items.some(item => item.serviceId === service.id));
  const data = { ...composeDraftRecord(body, used, now), lead_id: lead.id };
  const customLines = body.items.filter(item => !item.serviceId).length;
  const budgetNote = describeBudgetFit(budgetCeiling(lead.request), body.budget?.changes);
  return db.$transaction(async tx => {
    const quotation = await tx.quotation.create({ data });
    const code = formatQuotationCode(quotation.consecutive);
    await tx.crmActivity.create({
      data: {
        leadId: lead.id, type: 'NOTA', occurredAt: now, authorId: actor.userId || actor.id || null,
        note: [
          `${auto ? 'Borrador de cotización generado automáticamente' : 'Borrador de cotización creado'}: ${code} con ${body.items.length} ${body.items.length === 1 ? 'línea' : 'líneas'}${customLines ? ` (${customLines} personalizada${customLines === 1 ? '' : 's'} por tarifar)` : ''}.`,
          budgetNote
        ].filter(Boolean).join('\n'),
        result: 'Pendiente de revisión en Cotizaciones antes de emitir.',
        nextAction: 'Revisar el borrador de cotización y emitirlo.'
      }
    });
    await tx.crmLead.update({ where: { id: lead.id }, data: { updatedAt: now, lastActivityAt: now } });
    return {
      created: true,
      quotation: { id: quotation.id, code, status: quotation.status, total: Number(quotation.total_amount), currency: quotation.currency, itemCount: body.items.length, customLines },
      budget: body.budget
    };
  });
};

/** Keeps the lead in step with its quotation: issued → PROPUESTA_ENVIADA, accepted → APROBADA. Never moves it backwards. */
export const syncLeadStageFromQuotation = async (db, quotation, event, { now = new Date() } = {}) => {
  if (!quotation?.lead_id) return null;
  const target = event === 'ISSUED' ? 'PROPUESTA_ENVIADA' : event === 'ACCEPTED' ? 'APROBADA' : null;
  if (!target) return null;
  const lead = await db.crmLead.findUnique({ where: { id: quotation.lead_id }, select: { id: true, stage: true } });
  if (!lead) return null;
  if (stageGroup(lead.stage) === 'GANADO' || stageOrder(lead.stage) >= stageOrder(target)) return null;
  const code = formatQuotationCode(quotation.consecutive);
  return changeStage(db, lead.id, { stage: target, note: event === 'ISSUED' ? `Cotización ${code} emitida al cliente.` : `El cliente aceptó la cotización ${code}.` }, {}, now);
};

export const leadCodeOf = lead => formatLeadCode(lead?.consecutive);
