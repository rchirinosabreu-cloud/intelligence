import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { receiveCommercialRequest, sanitizeAnswers, validateAnswers, resolveIntakeOwner, buildConfirmationEmail, CommercialRequestError } from '../src/services/commercialRequestService.js';
import { serializeLead } from '../src/services/crmService.js';
import { createCrmMemoryDb } from './fixtures/crmMemoryDb.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const NOW = new Date('2026-09-18T20:00:00Z'); // Friday afternoon in Bogotá

const complete = () => ({
  contactName: '  Catalina Rojas ', company: 'HDI Seguros', email: 'Catalina@HDI.test', phone: '+57 310 000 0001', location: 'Bogotá',
  need: 'Campaña de marca.', hasKeyDate: 'NO', startWhen: 'ASAP',
  services: ['WEB'], 'web.needs': ['LANDING'], 'web.hasSite': 'NO',
  'event.related': 'NO', 'amc.interest': 'NO', 'budget.has': 'NO',
  stage: 'PRONTO', 'decision.others': 'NO', 'proposal.when': 'ASAP', source: 'INSTAGRAM', workedBefore: 'NO', extra: 'x'.repeat(5000), evil: '<script>', 'weird key!': 'no'
});

const members = [{ id: 'tm-francys', name: 'Francys Villa', isActive: true, userId: 'user-francys' }, { id: 'tm-old', name: 'Francys Antigua', isActive: false }, { id: 'tm-r', name: 'Rodny Chirinos', isActive: true, userId: 'user-r' }];

test('sanitizeAnswers trims, caps and drops unknown shapes', () => {
  const answers = sanitizeAnswers(complete());
  assert.equal(answers.contactName, 'Catalina Rojas');
  assert.equal(answers.extra.length, 4000);
  assert.equal('weird key!' in answers, false);
  assert.equal(answers.evil, '<script>', 'stored as text; rendering escapes it');
  assert.throws(() => sanitizeAnswers('nope'), CommercialRequestError);
});

test('validateAnswers runs every visible step server-side', () => {
  assert.deepEqual(validateAnswers(sanitizeAnswers(complete())), {});
  const missing = validateAnswers(sanitizeAnswers({ ...complete(), email: 'bad', services: [] }));
  assert.match(missing.email, /correo/);
  assert.match(missing.services, /al menos/);
});

test('resolveIntakeOwner matches the active roster by full or first name', async () => {
  const db = createCrmMemoryDb({ members });
  assert.equal((await resolveIntakeOwner(db, 'Francys')).id, 'tm-francys');
  assert.equal((await resolveIntakeOwner(db, 'francys villa')).id, 'tm-francys');
  assert.equal(await resolveIntakeOwner(db, 'Nadie'), null);
});

test('receiveCommercialRequest creates lead + request + first log entry, assigned to Francys, in one go', async () => {
  const db = createCrmMemoryDb({ members });
  const result = await receiveCommercialRequest(db, { answers: complete(), meta: { referrer: 'https://instagram.com', campaign: 'sep26', locale: 'es-CO', extra: 'ignored' } }, { now: NOW });
  assert.equal(result.reference, 'CRM-0001');
  assert.equal(result.ownerId, 'tm-francys');
  assert.equal(result.ownerUserId, 'user-francys');
  assert.equal(result.email, 'catalina@hdi.test');
  const lead = db.state.leads[0];
  assert.equal(lead.stage, 'POR_GESTIONAR');
  assert.equal(lead.origin, 'FORMULARIO');
  assert.equal(lead.priority, 'ALTA');
  assert.equal(lead.companyKey, 'hdi seguros');
  assert.equal(lead.enteredAtEstimated, false);
  assert.equal(lead.nextFollowUpAt.toISOString(), '2026-09-21T00:00:00.000Z', 'Monday after a Friday submission');
  const request = db.state.requests[0];
  assert.equal(request.leadId, lead.id);
  assert.deepEqual(request.services, ['WEB']);
  assert.deepEqual(request.suggestedItems.map(item => item.name), ['Landing page']);
  assert.deepEqual(request.meta, { referrer: 'https://instagram.com', campaign: 'sep26', source: null, locale: 'es-CO' });
  assert.equal(db.state.activities.length, 1);
  assert.match(db.state.activities[0].note, /Solicitud recibida por el formulario comercial/);
  assert.equal(db.state.activities[0].authorId, null);

  const serialized = serializeLead(await db.crmLead.findUnique({ where: { id: lead.id } }), NOW);
  assert.equal(serialized.hasRequest, true);
  assert.equal(serialized.request.answers.company, 'HDI Seguros');
  assert.deepEqual(serialized.quotations, []);
  assert.equal(serialized.trafficLight.value, 'AMARILLO');
});

test('invalid submissions are rejected with field details and nothing is written; honeypot is swallowed', async () => {
  const db = createCrmMemoryDb({ members });
  await assert.rejects(receiveCommercialRequest(db, { answers: { ...complete(), phone: '12' } }, { now: NOW }), error => error instanceof CommercialRequestError && /dígitos/.test(error.details.phone));
  assert.equal(db.state.leads.length, 0);
  const bot = await receiveCommercialRequest(db, { answers: complete(), website_confirm: 'http://spam' }, { now: NOW });
  assert.equal(bot.ignored, true);
  assert.equal(db.state.leads.length, 0);
});

test('without a matching owner the lead is still created, unassigned', async () => {
  const db = createCrmMemoryDb({ members: [] });
  const result = await receiveCommercialRequest(db, { answers: complete() }, { now: NOW });
  assert.equal(result.ownerId, null);
  assert.equal(db.state.leads[0].ownerId, null);
});

test('confirmation email is plain, mentions the reference and never needs SMTP to build', () => {
  const email = buildConfirmationEmail({ contactName: 'Catalina', reference: 'CRM-0172' });
  assert.match(email.subject, /Brain Studio/);
  assert.match(email.text, /CRM-0172/);
});

test('the public route, the page route and the schema are wired', async () => {
  const routes = await read('src/routes/index.js');
  const publicBlock = routes.slice(routes.indexOf('// --- Public Routes'), routes.indexOf('// --- Protected Routes'));
  assert.match(publicBlock, /router\.post\('\/public\/commercial-request'/);
  const app = await read('src/App.jsx');
  assert.match(app, /path="\/solicitud" element=\{<CommercialRequestPage \/>\}/);
  const schema = await read('prisma/schema.prisma');
  assert.match(schema, /model CrmRequest \{/);
  assert.match(schema, /lead_id\s+String\?/);
  const server = await read('server.js');
  assert.match(server, /app\.use\('\/api\/public', publicRateLimiter\)/);
});
