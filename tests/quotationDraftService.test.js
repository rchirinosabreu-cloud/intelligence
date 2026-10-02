import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { draftItemsFromRequest, buildDraftBody, composeDraftRecord, createQuotationDraftForLead, syncLeadStageFromQuotation, guessBillingType, draftIntroductionText, budgetCeiling, fitItemsToBudget, describeBudgetFit } from '../src/services/quotationDraftService.js';
import { createCrmMemoryDb } from './fixtures/crmMemoryDb.js';

const CATALOG = JSON.parse(await readFile(new URL('../data/service_catalog_2026.json', import.meta.url), 'utf8'))
  .map((service, index) => ({ id: `svc-${index}`, category: service.category, name: service.name, description: service.description, costo_real_estimado: service.estimatedCost, valor_neto: service.finalPrice, valor_neto_actual: service.currentPrice, precio_comercial_sugerido: service.suggestedPrice, precio_variable: service.variablePrice, activo: true }));

const NOW = new Date('2026-10-02T15:00:00Z');
const lead = { id: 'lead-narco', consecutive: 174, company: 'Narcobollo', contactName: 'Laura Pérez', email: 'laura@narcobollo.test', phone: '+57 300 000 0000', stage: 'POR_GESTIONAR', archivedAt: null };
const request = {
  receivedAt: NOW,
  suggestedItems: [
    { category: 'MARKETING', name: 'Marketing Básico – 8 contenidos', custom: false, detail: 'Manejo de redes sociales', quantity: 1 },
    { category: 'PRODUCCION_AUDIOVISUAL', name: 'Sesión fotográfica de 2 horas', custom: false, detail: 'Fotografía', quantity: 1 },
    { category: 'PRODUCCION_AUDIOVISUAL', name: 'Drone', custom: true, detail: 'Sin equivalente en el catálogo: línea personalizada.', quantity: 1 },
    { category: 'MARKETING', name: 'Marketing Básico – 8 contenidos', custom: false, detail: 'repetida', quantity: 1 }
  ],
  answers: { need: 'Vender más bollos por Instagram y abrir la segunda sede.', services: ['MARKETING', 'PRODUCCION_AUDIOVISUAL'], 'mkt.mode': 'MENSUAL', startWhen: 'ASAP', hasKeyDate: 'SI', keyDate: '2026-11-01', keyDateNote: 'Apertura', 'budget.has': 'SI', 'budget.amount': { amount: '2.500.000' }, 'budget.currency': 'COP', 'budget.scope': 'MENSUAL', 'amc.interest': 'CONOCER', 'amc.plan': 'START' }
};

test('billing type is guessed from the catalog name: monthly plans recur, productions are one-time', () => {
  assert.equal(guessBillingType('Marketing Básico – 8 contenidos'), 'MONTHLY');
  assert.equal(guessBillingType('Community management'), 'MONTHLY');
  assert.equal(guessBillingType('Administración de Meta Ads'), 'MONTHLY');
  assert.equal(guessBillingType('Mantenimiento web mensual'), 'MONTHLY');
  assert.equal(guessBillingType('Sesión fotográfica de 2 horas'), 'ONE_TIME');
  assert.equal(guessBillingType('Landing page'), 'ONE_TIME');
  assert.equal(guessBillingType('Naming'), 'ONE_TIME');
});

test('draft lines come from the catalog by name, custom lines stay explicit at price 0, duplicates collapse', () => {
  const items = draftItemsFromRequest(request, CATALOG);
  assert.deepEqual(items.map(item => [item.name, Boolean(item.serviceId), item.price > 0, item.billingType]), [
    ['Marketing Básico – 8 contenidos', true, true, 'MONTHLY'],
    ['Sesión fotográfica de 2 horas', true, true, 'ONE_TIME'],
    ['Drone', false, false, 'ONE_TIME']
  ]);
  assert.equal(items[0].price, CATALOG.find(service => service.name === 'Marketing Básico – 8 contenidos').valor_neto);
  assert.match(items[0].descriptionHtml, /<li>|<p>/);
  assert.equal(items[0].note, '', 'item notes reach the client, so nothing internal goes there');
  assert.equal(items[2].note, '');
  assert.equal(items[2].description, 'Alcance por definir con el cliente.');
  assert.deepEqual(draftItemsFromRequest(null, CATALOG), []);
});

const price = name => CATALOG.find(service => service.name === name).valor_neto;
const withBudget = (amount, scope, currency = 'COP') => ({ ...request, answers: { ...request.answers, 'budget.has': 'SI', 'budget.amount': { amount }, 'budget.currency': currency, 'budget.scope': scope } });

test('the budget the prospect wrote is a ceiling: monthly caps any single month, the rest cap the whole proposal', () => {
  assert.equal(budgetCeiling({ answers: { 'budget.has': 'NO' } }), null);
  assert.equal(budgetCeiling({ answers: { 'budget.has': 'SI', 'budget.amount': { undefined: true } } }), null);
  assert.deepEqual(budgetCeiling(withBudget('3.000.000', 'MENSUAL')), { amount: 3_000_000, currency: 'COP', scope: 'MENSUAL', scopeLabel: 'Presupuesto mensual', unsupported: false, mode: 'MONTHLY' });
  assert.equal(budgetCeiling(withBudget('3.000.000', 'PROYECTO')).mode, 'TOTAL');
  assert.equal(budgetCeiling(withBudget('1,000', 'MENSUAL', 'USD')).unsupported, true);
});

test('Narcobollo: with 3.000.000 mensuales everything they chose fits and nothing changes', () => {
  const body = buildDraftBody(lead, withBudget('3.000.000', 'MENSUAL'), CATALOG);
  assert.deepEqual(body.items.map(item => item.name), ['Marketing Básico – 8 contenidos', 'Sesión fotográfica de 2 horas', 'Drone']);
  assert.deepEqual(body.budget.changes, []);
  assert.equal(body.duration_months, 3);
  assert.equal(describeBudgetFit(budgetCeiling(withBudget('3.000.000', 'MENSUAL')), []), 'Dentro del presupuesto indicado: $3.000.000 COP (presupuesto mensual).');
});

test('a line that does not fit drops to the cheaper tier of its family; without one it stays out, and both are reported', () => {
  const ceiling = budgetCeiling(withBudget('1.000.000', 'MENSUAL'));
  const { items, changes } = fitItemsToBudget(draftItemsFromRequest(request, CATALOG), ceiling, CATALOG, 3);
  assert.deepEqual(items.map(item => item.name), ['Marketing Inicial – 6 contenidos', 'Drone']);
  assert.ok(price('Marketing Básico – 8 contenidos') * 1.19 > 1_000_000 && price('Marketing Inicial – 6 contenidos') * 1.19 <= 1_000_000);
  assert.deepEqual(changes, [
    { kind: 'DOWNGRADED', from: 'Marketing Básico – 8 contenidos', to: 'Marketing Inicial – 6 contenidos' },
    { kind: 'EXCLUDED', name: 'Sesión fotográfica de 2 horas' }
  ]);
  assert.equal(describeBudgetFit(ceiling, changes), 'Ajustado al presupuesto de $1.000.000 COP (presupuesto mensual): «Marketing Básico – 8 contenidos» bajó a «Marketing Inicial – 6 contenidos»; «Sesión fotográfica de 2 horas» quedó fuera.');
});

test('a one-off budget buys one month of a recurring plan and caps the whole proposal; a foreign-currency budget is only flagged', () => {
  const project = buildDraftBody(lead, withBudget('1.500.000', 'PROYECTO'), CATALOG);
  assert.equal(project.duration_months, 1);
  assert.deepEqual(project.items.map(item => item.name), ['Marketing Básico – 8 contenidos', 'Sesión fotográfica de 2 horas', 'Drone']);
  const total = (price('Marketing Básico – 8 contenidos') + price('Sesión fotográfica de 2 horas')) * 1.19;
  assert.ok(total <= 1_500_000);
  const usd = buildDraftBody(lead, withBudget('1,000', 'MENSUAL', 'USD'), CATALOG);
  assert.equal(usd.items.length, 3);
  assert.equal(usd.budget.unsupported, true);
  assert.match(describeBudgetFit(budgetCeiling(withBudget('1,000', 'MENSUAL', 'USD')), []), /indicado en USD: no se ajustó automáticamente/);
});

test('the introduction only repeats what the prospect wrote', () => {
  const text = draftIntroductionText(lead, request);
  assert.match(text, /Narcobollo/);
  assert.match(text, /Vender más bollos/);
  assert.match(text, /Marketing, Producción audiovisual/);
  assert.match(text, /2\.500\.000 COP \(Presupuesto mensual\)/);
  assert.match(text, /AMC Start/);
  assert.doesNotMatch(text, /undefined/);
});

test('the composed record is a valid BORRADOR with real totals, terms and the proposal introduction', () => {
  const body = buildDraftBody(lead, request, CATALOG);
  assert.equal(body.status, 'BORRADOR');
  assert.equal(body.client_company, 'Narcobollo');
  assert.equal(body.client_name, 'Laura Pérez');
  assert.equal(body.duration_months, 3, 'a recurring line makes the draft a 3-month proposal');
  const used = CATALOG.filter(service => body.items.some(item => item.serviceId === service.id));
  const record = composeDraftRecord(body, used, NOW);
  assert.equal(record.status, 'BORRADOR');
  assert.equal(record.items.length, 3);
  assert.equal(record.is_tax_exempt, false);
  const monthly = CATALOG.find(service => service.name === 'Marketing Básico – 8 contenidos').valor_neto;
  const oneTime = CATALOG.find(service => service.name === 'Sesión fotográfica de 2 horas').valor_neto;
  assert.equal(record.subtotal, monthly * 3 + oneTime);
  assert.equal(record.total_amount, Math.round((monthly * 3 + oneTime) * 1.19 * 100) / 100);
  assert.equal(record.issued_at, null);
  assert.ok(record.expires_at instanceof Date);
  assert.match(record.terms_and_conditions, /\S/);
  assert.equal(record.proposal_details.title, 'Propuesta para Narcobollo');
  assert.match(record.proposal_details.introductionHtml, /Vender más bollos/);
  assert.equal(typeof record.uuid_slug, 'string');
});

test('createQuotationDraftForLead writes the quotation linked to the lead and a note in the bitácora', async () => {
  const db = createCrmMemoryDb({ leads: [lead], requests: [{ id: 'req-1', leadId: lead.id, ...request }], catalog: CATALOG });
  const auto = await createQuotationDraftForLead(db, lead.id, {}, { now: NOW, auto: true });
  assert.equal(auto.created, true);
  assert.equal(auto.quotation.code, 'COT-0001');
  assert.equal(auto.quotation.itemCount, 3);
  assert.equal(auto.quotation.customLines, 1);
  assert.equal(db.state.quotations[0].lead_id, lead.id);
  assert.equal(db.state.quotations[0].status, 'BORRADOR');
  assert.match(db.state.activities.at(-1).note, /generado automáticamente: COT-0001 con 3 líneas \(1 personalizada por tarifar\)\.\nDentro del presupuesto indicado: \$2\.500\.000 COP \(presupuesto mensual\)\./);
  assert.equal(db.state.leads[0].stage, 'POR_GESTIONAR', 'a draft never moves the stage');

  const again = await createQuotationDraftForLead(db, lead.id, {}, { now: NOW, auto: true });
  assert.equal(again.created, false, 'the automatic path never duplicates a draft');
  const manual = await createQuotationDraftForLead(db, lead.id, { userId: 'u-francys' }, { now: NOW });
  assert.equal(manual.created, true);
  assert.equal(manual.quotation.code, 'COT-0002', 'a manual call adds another version');
  assert.equal(db.state.activities.at(-1).authorId, 'u-francys');
  await assert.rejects(createQuotationDraftForLead(db, 'missing', {}, { now: NOW }), /encontrada/);
});

test('a lead without a request still gets an empty draft with its contact data', async () => {
  const db = createCrmMemoryDb({ leads: [{ ...lead, id: 'lead-manual' }], catalog: CATALOG });
  const result = await createQuotationDraftForLead(db, 'lead-manual', {}, { now: NOW });
  assert.equal(result.created, true);
  assert.equal(result.quotation.itemCount, 0);
  assert.equal(db.state.quotations[0].client_company, 'Narcobollo');
  assert.equal(db.state.quotations[0].total_amount, 0);
});

test('issuing moves the lead to Propuesta enviada and acceptance to Aprobada, never backwards', async () => {
  const db = createCrmMemoryDb({ leads: [{ ...lead, stage: 'CONTACTADO', enteredAt: NOW }] });
  const quotation = { id: 'q1', consecutive: 7, lead_id: lead.id };
  const issued = await syncLeadStageFromQuotation(db, quotation, 'ISSUED', { now: NOW });
  assert.equal(issued.stage, 'PROPUESTA_ENVIADA');
  assert.equal(db.state.leads[0].proposalSentAt.toISOString(), NOW.toISOString());
  assert.match(db.state.activities.at(-1).note, /COT-0007 emitida/);
  const accepted = await syncLeadStageFromQuotation(db, quotation, 'ACCEPTED', { now: NOW });
  assert.equal(accepted.stage, 'APROBADA');
  assert.equal(await syncLeadStageFromQuotation(db, quotation, 'ISSUED', { now: NOW }), null, 'issuing again does not regress an approved lead');
  db.state.leads[0].stage = 'GANADO';
  assert.equal(await syncLeadStageFromQuotation(db, quotation, 'ACCEPTED', { now: NOW }), null);
  assert.equal(await syncLeadStageFromQuotation(db, { id: 'q2', consecutive: 8, lead_id: null }, 'ISSUED'), null);
});
