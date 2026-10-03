import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { catalogForModel, requestForModel, buildQuotationDraftRequest, parseModelDraft, applyModelDraft, QUOTATION_DRAFT_SCHEMA } from '../src/services/quotationDraftAi.js';
import { catalogItem, customItem, createQuotationDraftForLead, budgetCeiling, humanizeDraftAiFailure } from '../src/services/quotationDraftService.js';
import { createCrmMemoryDb } from './fixtures/crmMemoryDb.js';

const CATALOG = JSON.parse(await readFile(new URL('../data/service_catalog_2026.json', import.meta.url), 'utf8'))
  .map((service, index) => ({ id: `svc-${index}`, category: service.category, name: service.name, description: service.description, costo_real_estimado: service.estimatedCost, valor_neto: service.finalPrice, activo: true }));
const price = name => CATALOG.find(service => service.name === name).valor_neto;

const NOW = new Date('2026-10-02T22:55:00Z');
const lead = { id: 'lead-narco', consecutive: 174, company: 'NarcoBollo', contactName: 'Raul Molina', email: 'mercadeo@brievaplus.com', phone: '+57 301 3245468', stage: 'POR_GESTIONAR', archivedAt: null };

// The real brief of 2 October 2026, as the team wrote it in the public form.
const NEED = [
  'Equipo, necesitamos preparar una propuesta de acompañamiento mensual para Narco Bollo, con un presupuesto de hasta $3.000.000 COP al mes.',
  '- Publicaciones todos los días: definir una combinación de formatos viable dentro del presupuesto.',
  '- Creación de videos: incluir producción y edición, definiendo cuántos videos podemos entregar mensualmente.',
  '- Acompañamiento presencial: evaluar visitas semanales o, como mínimo, cada quince días.',
  '- Administración de pauta digital: incluir la gestión de campañas dentro del servicio. El cliente asumirá por separado la inversión publicitaria.',
  '- Pedidos directos: evaluar una landing page, apoyándonos en IA para su desarrollo.',
  '- Comisión comercial: contemplar dentro del presupuesto la comisión de Juan Carlos Brión, cuyo valor debemos confirmar.'
].join('\n');
const request = {
  receivedAt: NOW,
  suggestedItems: [
    { category: 'MARKETING', name: 'Marketing Básico – 8 contenidos', custom: false, detail: 'Manejo de redes sociales', quantity: 1 },
    { category: 'MARKETING', name: 'Community management', custom: false, detail: 'Community management', quantity: 1 },
    { category: 'WEB', name: 'Landing page', custom: false, detail: 'Landing page', quantity: 1 }
  ],
  answers: {
    contactName: 'Raul Molina', company: 'NarcoBollo', email: 'mercadeo@brievaplus.com', phone: '+57 301 3245468', location: 'Cartagena',
    need: NEED, startWhen: 'ASAP', hasKeyDate: 'NO',
    services: ['MARKETING', 'PRODUCCION_AUDIOVISUAL', 'WEB', 'ADS'],
    'mkt.needs': ['REDES', 'COMMUNITY'], 'mkt.mode': 'MENSUAL', 'av.needs': ['VIDEO'], 'web.needs': ['LANDING'], 'ads.platforms': ['META'],
    'budget.has': 'SI', 'budget.amount': { amount: '3.000.000' }, 'budget.currency': 'COP', 'budget.scope': 'MENSUAL',
    stage: 'COMPARANDO', 'proposal.when': 'ASAP', source: 'REFERIDO'
  }
};

// What a careful commercial director answers for that brief.
const MODEL_ANSWER = {
  lines: [
    { catalogName: 'Marketing Pro – 20 contenidos', customName: null, quantity: 1, billingType: 'MONTHLY', reason: 'Pide publicar todos los días: es el plan con más contenidos que cabe en 3 millones.' },
    { catalogName: 'Administración básica Meta Ads', customName: null, quantity: 1, billingType: 'MONTHLY', reason: 'Pidió la gestión de pauta dentro del fee; la inversión va aparte.' },
    { catalogName: 'Landing page', customName: null, quantity: 1, billingType: 'ONE_TIME', reason: 'Pedidos directos sin Rappi; se paga una sola vez.' },
    { catalogName: 'Visitas presenciales quincenales', customName: null, quantity: 1, billingType: 'MONTHLY', reason: 'No existe en el catálogo.' },
    { catalogName: null, customName: 'Acompañamiento presencial quincenal', quantity: 1, billingType: 'MONTHLY', reason: 'Visitas cada quince días; definir precio.' }
  ],
  durationMonths: 1,
  summaryForTeam: 'Un plan de 20 contenidos cubre la publicación diaria y la pauta queda dentro del fee: 2.401.000 al mes antes de IVA. La landing es un proyecto aparte.',
  pending: ['Confirmar el valor de la comisión de Juan Carlos Brión.', 'La inversión publicitaria la paga el cliente aparte del fee.']
};

test('the model receives the whole request with real labels, the free text included, and a compact catalog', () => {
  const text = requestForModel(request, lead);
  assert.match(text, /Empresa: NarcoBollo/);
  assert.match(text, /¿Qué proyecto, necesidad o idea quieres desarrollar con Brain Studio\?\nEquipo, necesitamos preparar/);
  assert.match(text, /Publicaciones todos los días/);
  assert.match(text, /¿Cuál es el presupuesto aproximado\?\n3\.000\.000/);
  assert.match(text, /Ese presupuesto corresponde a:\nPresupuesto mensual/);
  assert.doesNotMatch(text, /mercadeo@brievaplus\.com/, 'contact data is not sent to the model');
  const catalog = catalogForModel(CATALOG);
  assert.match(catalog, /^- Marketing Pro – 20 contenidos \| MARKETING \| 2\.100\.000 COP \| manejo de redes/m);
  assert.equal(catalog.split('\n').length, CATALOG.length);
});

test('the request to the model carries the budget rule, a strict schema and the governed use case', () => {
  const built = buildQuotationDraftRequest({ lead, request, catalog: CATALOG, ceiling: budgetCeiling(request) });
  assert.equal(built.strictSchema, true);
  assert.equal(built.responseSchema, QUOTATION_DRAFT_SCHEMA);
  assert.equal(built.governanceContext.useCase, 'crm.quotation-draft');
  assert.match(built.prompt, /PRESUPUESTO MENSUAL: hasta 3\.000\.000 COP al mes/);
  assert.match(built.prompt, /si no lo dijo, 1/);
  assert.match(built.prompt, /=== SOLICITUD ===[\s\S]*=== CATÁLOGO/);
  const noBudget = buildQuotationDraftRequest({ lead, request: { answers: { need: 'x' } }, catalog: CATALOG, ceiling: null });
  assert.match(noBudget.prompt, /no indicó presupuesto/);
});

test('a fenced ```json answer is read like a bare one', () => {
  const fenced = '```json\n' + JSON.stringify(MODEL_ANSWER) + '\n```';
  assert.deepEqual(parseModelDraft(fenced), MODEL_ANSWER);
  assert.deepEqual(parseModelDraft(`Aquí tienes: ${JSON.stringify({ lines: [] })}`), { lines: [] });
  assert.throws(() => parseModelDraft(''), /no devolvió/);
});

test('catalog names are matched exactly, prices come from the catalog, unknown names become pending', () => {
  const applied = applyModelDraft(MODEL_ANSWER, CATALOG, { catalogItem, customItem });
  assert.deepEqual(applied.items.map(item => [item.name, item.price, item.billingType]), [
    ['Marketing Pro – 20 contenidos', price('Marketing Pro – 20 contenidos'), 'MONTHLY'],
    ['Administración básica Meta Ads', price('Administración básica Meta Ads'), 'MONTHLY'],
    ['Landing page', price('Landing page'), 'ONE_TIME'],
    ['Acompañamiento presencial quincenal', 0, 'MONTHLY']
  ]);
  assert.equal(applied.items[0].serviceId, CATALOG.find(service => service.name === 'Marketing Pro – 20 contenidos').id);
  assert.equal(applied.items[0].note, '');
  assert.equal(applied.durationMonths, 1);
  assert.deepEqual(applied.pending.slice(0, 2), MODEL_ANSWER.pending);
  assert.match(applied.pending[2], /«Visitas presenciales quincenales», que no existe en el catálogo/);
  assert.equal(applied.reasons.length, 4);
  assert.deepEqual(applyModelDraft({ lines: [{ catalogName: 'marketing pro – 20 CONTENIDOS', quantity: 0 }], durationMonths: 40 }, CATALOG, { catalogItem, customItem }).durationMonths, 12);
});

test('Narcobollo with the model: a plan that publishes daily, pauta inside the fee, landing apart, within 3 millones a month', async () => {
  const db = createCrmMemoryDb({ leads: [lead], requests: [{ id: 'req-1', leadId: lead.id, ...request }], catalog: CATALOG });
  const calls = [];
  const generate = async built => { calls.push(built); return { draft: MODEL_ANSWER, model: 'gpt-test' }; };
  const result = await createQuotationDraftForLead(db, lead.id, { userId: 'u-francys' }, { now: NOW, generate });
  assert.equal(calls.length, 1);
  assert.equal(result.ai.used, true);
  assert.equal(result.ai.model, 'gpt-test');
  const quotation = db.state.quotations[0];
  assert.deepEqual(quotation.items.map(item => item.name.toLowerCase()), ['marketing pro – 20 contenidos', 'administración básica meta ads', 'landing page', 'acompañamiento presencial quincenal']);
  assert.equal(quotation.duration_months, 1, 'nobody asked for three months');
  const monthly = (price('Marketing Pro – 20 contenidos') + price('Administración básica Meta Ads')) * 1.19;
  assert.ok(monthly <= 3_000_000, `monthly ${monthly} must fit the budget`);
  assert.deepEqual(result.budget.changes, [{ kind: 'ONE_TIME_APART', name: 'Landing page', charge: Math.round(price('Landing page') * 1.19) }], 'the fee fits; the landing is reported apart, not cut');
  assert.match(db.state.activities.at(-1).note, /Se cobra una sola vez, fuera del tope mensual: «Landing page»/);
  const note = db.state.activities.at(-1).note;
  assert.match(note, /^Borrador de cotización creado: COT-0001 con 4 líneas \(1 personalizada por tarifar\)\./);
  assert.match(note, /Un plan de 20 contenidos cubre la publicación diaria/);
  assert.match(note, /Por qué cada línea:\n- Marketing Pro – 20 contenidos: Pide publicar todos los días/);
  assert.match(note, /Pendientes antes de emitir:\n- Confirmar el valor de la comisión de Juan Carlos Brión\./);
  assert.match(note, /no existe en el catálogo/);
  assert.doesNotMatch(note, /sin leer el brief/);
});

test('when the model fails the draft still comes out from the form lines and the bitácora says so', async () => {
  const db = createCrmMemoryDb({ leads: [lead], requests: [{ id: 'req-1', leadId: lead.id, ...request }], catalog: CATALOG });
  const generate = async () => { throw Object.assign(new Error('insufficient_quota'), { code: 'insufficient_quota', status: 429 }); };
  const result = await createQuotationDraftForLead(db, lead.id, {}, { now: NOW, auto: true, generate });
  assert.equal(result.created, true);
  assert.equal(result.ai.used, false);
  assert.equal(result.ai.failure, 'el proveedor de IA no estaba disponible.');
  assert.ok(db.state.quotations[0].items.length >= 1, 'form suggestions still produce lines');
  assert.match(db.state.activities.at(-1).note, /Se armó sin leer el brief con IA \(el proveedor de IA no estaba disponible\.\) a partir de las casillas del formulario/);
  assert.equal(humanizeDraftAiFailure({ code: 'AI_SCOPE_REQUIRED' }), 'Gobierno de IA bloqueó el envío.');
  assert.equal(humanizeDraftAiFailure(new SyntaxError('Unexpected token')), 'la respuesta del modelo no se pudo leer.');
});

test('the budget guard still applies to what the model chose: lines over the ceiling drop or fall out, and it is written down', async () => {
  const db = createCrmMemoryDb({ leads: [lead], requests: [{ id: 'req-1', leadId: lead.id, ...request }], catalog: CATALOG });
  const greedy = { ...MODEL_ANSWER, lines: [
    { catalogName: 'Marketing Pro – 20 contenidos', customName: null, quantity: 1, billingType: 'MONTHLY', reason: 'diario' },
    { catalogName: 'Administración Meta Ads + Google Ads', customName: null, quantity: 1, billingType: 'MONTHLY', reason: 'pauta' },
    { catalogName: 'Video corporativo', customName: null, quantity: 1, billingType: 'ONE_TIME', reason: 'video' }
  ] };
  const result = await createQuotationDraftForLead(db, lead.id, {}, { now: NOW, generate: async () => ({ draft: greedy }) });
  assert.deepEqual(result.budget.changes, [
    { kind: 'DOWNGRADED', from: 'Administración Meta Ads + Google Ads', to: 'Administración de Meta Ads' },
    { kind: 'ONE_TIME_APART', name: 'Video corporativo', charge: Math.round(price('Video corporativo') * 1.19) }
  ]);
  assert.match(db.state.activities.at(-1).note, /Ajustado al presupuesto de \$3\.000\.000 COP \(presupuesto mensual\)/);
});

test('a lead without a request never calls the model', async () => {
  const db = createCrmMemoryDb({ leads: [{ ...lead, id: 'lead-old' }], catalog: CATALOG });
  let called = false;
  const result = await createQuotationDraftForLead(db, 'lead-old', {}, { now: NOW, generate: async () => { called = true; return { draft: MODEL_ANSWER }; } });
  assert.equal(called, false);
  assert.equal(result.ai.used, false);
  assert.equal(result.quotation.itemCount, 0);
  assert.match(db.state.activities.at(-1).note, /no tiene solicitud del formulario/);
});
