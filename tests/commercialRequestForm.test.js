import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICE_CATEGORIES, SERVICE_BLOCKS, AMC_PLANS, visibleSteps, visibleQuestions, validateStep, progressFor, encouragement,
  suggestQuotationItems, buildLeadDraft, answerLabel
} from '../src/lib/commercialRequestForm.js';

test('the AMC alternatives are the four published plans, explained inside the form', () => {
  assert.deepEqual(AMC_PLANS.map(plan => plan.label).slice(0, 4), ['AMC Start', 'AMC Boost', 'AMC Growth', 'AMC Impact']);
  assert.ok(AMC_PLANS.every(plan => plan.description.length > 20));
  const amc = visibleSteps({}).find(step => step.id === 'amc');
  assert.equal(amc.link.href, 'https://amc.brainstudioagencia.com/');
  assert.equal(amc.summary.moments.length, 3);
});
import { CRM_ORIGINS, isValidOrigin, isValidPriority } from '../src/lib/crmRules.js';
import { readFile } from 'node:fs/promises';

const CATALOG = JSON.parse(await readFile(new URL('../data/service_catalog_2026.json', import.meta.url), 'utf8'));
const catalogNames = new Set(CATALOG.map(service => service.name));
const catalogCategories = new Set(CATALOG.map(service => service.category));

test('the ten service categories are exactly the quotation catalog categories, plus two open choices', () => {
  const values = SERVICE_CATEGORIES.map(item => item.value);
  assert.deepEqual(values.slice(0, 10).sort(), [...catalogCategories].sort());
  assert.deepEqual(values.slice(10), ['NO_ESTOY_SEGURO', 'OTRO']);
  assert.ok(SERVICE_CATEGORIES.every(item => item.label && item.description));
});

test('every catalog suggestion in the blocks points to a real catalog name (or an explicit custom line)', () => {
  for (const [service, block] of Object.entries(SERVICE_BLOCKS)) {
    for (const mapping of Object.values(block.catalog || {})) {
      for (const name of Object.values(mapping)) {
        if (name !== null) assert.ok(catalogNames.has(name), `${service}: "${name}" no existe en data/service_catalog_2026.json`);
      }
    }
  }
});

test('only the selected services get their block, in the order chosen, between the fixed steps', () => {
  const none = visibleSteps({});
  assert.deepEqual(none.map(step => step.id), ['contacto', 'necesidad', 'servicios', 'evento', 'amc', 'presupuesto', 'momento', 'origen']);
  const three = visibleSteps({ services: ['WEB', 'BRANDING', 'ADS'] });
  assert.deepEqual(three.map(step => step.id).slice(3, 6), ['servicio:WEB', 'servicio:BRANDING', 'servicio:ADS']);
  assert.equal(three.length, 11);
  const unsure = visibleSteps({ services: ['NO_ESTOY_SEGURO', 'WEB'] });
  assert.deepEqual(unsure.map(step => step.id).filter(id => id.startsWith('servicio:')), ['servicio:NO_ESTOY_SEGURO']);
});

test('conditional questions appear only when their trigger answer is present', () => {
  const need = visibleSteps({}).find(step => step.id === 'necesidad');
  assert.deepEqual(visibleQuestions(need, { hasKeyDate: 'NO' }).map(item => item.id), ['need', 'hasKeyDate', 'startWhen']);
  assert.deepEqual(visibleQuestions(need, { hasKeyDate: 'SI' }).map(item => item.id), ['need', 'hasKeyDate', 'keyDate', 'keyDateNote', 'startWhen']);
  const budget = visibleSteps({}).find(step => step.id === 'presupuesto');
  assert.equal(visibleQuestions(budget, { 'budget.has': 'NO' }).length, 1);
  assert.equal(visibleQuestions(budget, { 'budget.has': 'SI', 'budget.adsIncluded': 'NO' }).length, 6);
  const web = visibleSteps({ services: ['WEB'] }).find(step => step.id === 'servicio:WEB');
  assert.ok(!visibleQuestions(web, { 'web.hasSite': 'NO' }).some(item => item.id === 'web.url'));
  assert.ok(visibleQuestions(web, { 'web.hasSite': 'SI' }).some(item => item.id === 'web.url'));
  const amc = visibleSteps({}).find(step => step.id === 'amc');
  assert.equal(visibleQuestions(amc, { 'amc.interest': 'NO' }).length, 1);
  assert.equal(visibleQuestions(amc, { 'amc.interest': 'CONOCER' }).length, 3);
});

test('validation asks for the essentials and checks formats without blocking optional fields', () => {
  const contact = visibleSteps({}).find(step => step.id === 'contacto');
  const empty = validateStep(contact, {});
  assert.deepEqual(Object.keys(empty).sort(), ['company', 'contactName', 'email', 'location', 'phone']);
  const bad = validateStep(contact, { contactName: 'Ana', company: 'ACME', email: 'ana', phone: '12', location: 'Bogotá', website: 'nope' });
  assert.match(bad.email, /correo/);
  assert.match(bad.phone, /dígitos/);
  assert.match(bad.website, /web/);
  assert.deepEqual(validateStep(contact, { contactName: 'Ana', company: 'ACME', email: 'ana@acme.co', phone: '+57 300 123 4567', location: 'Bogotá', website: 'instagram.com/acme' }), {});
  const services = visibleSteps({}).find(step => step.id === 'servicios');
  assert.match(validateStep(services, { services: [] }).services, /al menos/);
  const ads = visibleSteps({ services: ['ADS'] }).find(step => step.id === 'servicio:ADS');
  assert.deepEqual(validateStep(ads, { 'ads.platforms': ['META'], 'ads.accounts': 'NO', 'ads.budget': { undefined: true } }), {});
});

test('progress moves with the visible steps and the encouragement follows it', () => {
  const answers = { services: ['WEB'] };
  assert.equal(progressFor(answers, 0), 0);
  assert.equal(progressFor(answers, 9), 1);
  assert.ok(progressFor(answers, 4) > 0.4 && progressFor(answers, 4) < 0.5);
  assert.equal(encouragement(0), 'Empecemos');
  assert.equal(encouragement(0.5), 'Vas por la mitad');
  assert.equal(encouragement(1), '¡Listo!');
});

test('a production request suggests real catalog lines and marks what the catalog does not have', () => {
  const items = suggestQuotationItems({ services: ['PRODUCCION_AUDIOVISUAL'], 'av.needs': ['VIDEO', 'FOTOGRAFIA', 'DRONE'], 'av.extras': ['DRONE', 'ANIMACION'] });
  assert.deepEqual(items.map(item => [item.name, item.custom]), [
    ['Video individual grabado y editado', false],
    ['Sesión fotográfica de 2 horas', false],
    ['Drone', true],
    ['Reel animado', false]
  ]);
  assert.ok(items.every(item => item.category === 'PRODUCCION_AUDIOVISUAL'));
  const web = suggestQuotationItems({ services: ['WEB'], 'web.needs': ['LANDING'], 'web.features': ['WHATSAPP', 'BLOG'] });
  assert.deepEqual(web.map(item => [item.name, item.custom]), [['Landing page', false], ['Integración de WhatsApp en sitio web', false], ['Blog', true]]);
  const dev = suggestQuotationItems({ services: ['DESARROLLO'], 'dev.problem': 'Automatizar cotizaciones', 'dev.integrations': 'SI' });
  assert.deepEqual(dev.map(item => item.name), ['Desarrollo e implementación de plataformas digitales a medida', 'Integración con servicios externos']);
  assert.equal(dev[0].detail, 'Automatizar cotizaciones');
  assert.deepEqual(suggestQuotationItems({ services: ['NO_ESTOY_SEGURO'], 'unsure.goal': 'Vender más' }), []);
});

test('buildLeadDraft produces a valid CRM lead assigned by the API, with the whole request kept beside it', () => {
  const answers = {
    contactName: 'Catalina Rojas', company: 'HDI Seguros', jobTitle: 'Gerente de mercadeo', email: 'Catalina@HDI.test', phone: '+57 310 000 0001', location: 'Bogotá, Colombia', website: 'hdi.test',
    need: 'Campaña de marca y contenido para el segundo semestre.', hasKeyDate: 'SI', keyDate: '2026-11-15', keyDateNote: 'Lanzamiento', startWhen: 'ASAP',
    services: ['MARKETING', 'PRODUCCION_AUDIOVISUAL'], 'mkt.needs': ['REDES'], 'mkt.mode': 'MENSUAL', 'av.needs': ['REELS'],
    'event.related': 'NO', 'amc.interest': 'CONOCER', 'amc.plan': 'GROWTH', 'budget.has': 'SI', 'budget.amount': { amount: '8.000.000' }, 'budget.currency': 'COP', 'budget.scope': 'MENSUAL', 'budget.adsIncluded': 'NO', 'budget.adsExtra': { amount: '2000000' },
    stage: 'APROBADO', 'decision.others': 'SI', 'decision.who': 'Gerencia', 'proposal.when': 'TRES_DIAS', source: 'LINKEDIN', workedBefore: 'NO', extra: 'Nos gusta el tono de Bonsai.'
  };
  const { lead, request } = buildLeadDraft(answers, { receivedAt: new Date('2026-09-18T20:00:00Z') });
  assert.equal(lead.origin, 'LINKEDIN');
  assert.ok(isValidOrigin(lead.origin) && CRM_ORIGINS.some(item => item.value === lead.origin));
  assert.equal(lead.email, 'catalina@hdi.test');
  assert.equal(lead.company, 'HDI Seguros');
  assert.equal(lead.serviceInterest, 'Marketing + Producción audiovisual');
  assert.equal(lead.priority, 'ALTA');
  assert.ok(isValidPriority(lead.priority));
  assert.equal(lead.quotedValue, 8000000);
  assert.equal(lead.currency, 'COP');
  assert.equal(lead.callDeadlineAt, '2026-11-15');
  assert.equal(lead.nextFollowUpAt, '2026-09-21', 'next business day after a Friday is Monday');
  assert.match(lead.nextAction, /primer contacto/);
  assert.match(lead.notes, /Presupuesto: 8.000.000 COP \(Presupuesto mensual\)/);
  assert.match(lead.notes, /AMC: Quiero conocer primero las opciones · AMC Growth/);
  assert.deepEqual(request.services, ['MARKETING', 'PRODUCCION_AUDIOVISUAL']);
  assert.equal(request.suggestedItems.length, 2);
  assert.equal(request.answers.extra, 'Nos gusta el tono de Bonsai.');
  assert.equal(answerLabel('source', 'FRANCISCO'), 'Contacto directo con Francisco');

  const light = buildLeadDraft({ source: 'GOOGLE', stage: 'PRECIOS', 'budget.has': 'NO' });
  assert.equal(light.lead.origin, 'FORMULARIO');
  assert.equal(light.lead.priority, 'BAJA');
  assert.equal(light.lead.quotedValue, null);
});
