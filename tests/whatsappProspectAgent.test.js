import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  agentInstructions, agentMessages, catalogText, parseAgentOutput, mergeBrief, briefNote, turnNote, shouldRemindConsent,
  AGENT_OUTPUT_SCHEMA, CONSENT_REMINDER_TEXT, HANDOFF_FALLBACK_TEXT, PROSPECT_AGENT_USE_CASE
} from '../src/lib/whatsappProspectAgent.js';
import { createProspectAgent, createProspectBrain } from '../src/services/whatsappProspectAgentService.js';
import { createWhatsAppProspectService } from '../src/services/whatsappProspectService.js';
import { CONSENT_ACCEPT_ID } from '../src/lib/whatsappProspects.js';

// Bria atiende a los prospectos de WhatsApp (Rodny, 26 de noviembre de 2026): conversa, arma el brief, orienta con el
// catálogo y pasa la conversación al equipo; nunca cierra precios ni habla con quien no autorizó sus datos.

const AT = new Date('2026-11-26T15:00:00Z');
const MINUTE = 60 * 1000;

test('el catálogo para Bria trae nombre, descripción y precio de referencia, nunca el costo interno', () => {
  const text = catalogText([
    { category: 'BRANDING', name: 'Auditoría de marca', description: 'Revisión de logo', valor_neto: 392000, costo_real_estimado: 280000, activo: true },
    { category: 'WEB', name: 'Tienda online', description: 'E-commerce', valor_neto: 0, precio_variable: true, activo: true },
    { category: 'WEB', name: 'Servicio retirado', description: 'x', valor_neto: 1, activo: false }
  ]);
  assert.match(text, /## BRANDING\n### Auditoría de marca \(referencia \$\s?392\.000\)/);
  assert.match(text, /### Tienda online \(precio según alcance\)/);
  assert.doesNotMatch(text, /280\.000|Servicio retirado/);
});

test('las instrucciones fijan lo que Bria no hace y no cambian entre mensajes', () => {
  const text = agentInstructions({ agencyName: 'Agencia Uno' });
  assert.match(text, /Eres Bria, la asistente de Agencia Uno/);
  assert.match(text, /Cierres un precio final, des descuentos, comprometas fechas/);
  assert.match(text, /handoff = true/);
  // Razonar, no recitar (Rodny, 26 de noviembre de 2026): el catálogo es referencia y no se pasa al equipo por un dato que falte.
  assert.match(text, /Razona con el catálogo: es tu referencia, no un guion/);
  assert.match(text, /No la pases solo porque no sepas un dato/);
  // No vender precio (Francisco y Rodny, 28 de noviembre de 2026): primero el negocio, y el precio en conversación.
  assert.match(text, /Primero el negocio, después el precio/);
  assert.match(text, /en qué etapa está la marca/);
  assert.match(text, /no como una ficha del catálogo/);
  assert.doesNotMatch(text, /negrita\* de WhatsApp para el nombre de un servicio/);
  assert.equal(text, agentInstructions({ agencyName: 'Agencia Uno' }));
  assert.deepEqual(AGENT_OUTPUT_SCHEMA.required, ['reply', 'handoff', 'handoffReason', 'brief']);
});

test('la conversación para el modelo junta turnos seguidos, marca al equipo y termina en la persona', () => {
  const messages = agentMessages([
    { direction: 'OUT', author: 'BRIA', text: 'Bienvenida' },
    { direction: 'IN', text: 'Hola' },
    { direction: 'IN', text: 'Quiero un logo' },
    { direction: 'OUT', author: 'TEAM', authorName: 'Francys', text: '¿Para cuándo?' },
    { direction: 'IN', text: 'Para diciembre' },
    { direction: 'OUT', author: 'BRIA', text: 'Anotado' }
  ]);
  assert.deepEqual(messages, [
    { role: 'user', content: 'Hola\n\nQuiero un logo' },
    { role: 'assistant', content: '[Equipo: Francys] ¿Para cuándo?' },
    { role: 'user', content: 'Para diciembre' }
  ]);
  assert.match(turnNote({ today: '2026-11-26', originDetail: 'Anuncio: Branding', justAuthorized: true }), /Hoy es 2026-11-26.*Anuncio: Branding.*acaba de tocar «Acepto»/);
});

test('la salida del modelo se limpia; si no sirve, no se usa', () => {
  const parsed = parseAgentOutput(JSON.stringify({ reply: ' Hola ', handoff: false, handoffReason: '', brief: { serviceInterest: 'Logo', city: '', company: 'Café Sol' } }));
  assert.deepEqual(parsed, { reply: 'Hola', handoff: false, handoffReason: null, brief: { serviceInterest: 'Logo', company: 'Café Sol' } });
  assert.equal(parseAgentOutput('no es json'), null);
  // AGENTS.md §6.2: la respuesta envuelta en un bloque ```json se limpia y se lee igual.
  assert.deepEqual(parseAgentOutput('```json\n{"reply":"Hola","handoff":false,"handoffReason":"","brief":{"city":"Cali"}}\n```'), { reply: 'Hola', handoff: false, handoffReason: null, brief: { city: 'Cali' } });
  assert.equal(parseAgentOutput('```\n{"reply":"Hola","handoff":false}\n```').reply, 'Hola');
  assert.equal(parseAgentOutput({ reply: '', handoff: false }), null);
  assert.equal(parseAgentOutput({ reply: '', handoff: true, handoffReason: '' }).handoffReason, 'Bria pasó la conversación al equipo.');
  assert.deepEqual(mergeBrief({ city: 'Cali', budget: '2M' }, { budget: '3M' }), { city: 'Cali', budget: '3M' });
  assert.equal(briefNote({ serviceInterest: 'Logo', city: 'Cali' }), 'Servicio que busca: Logo\nCiudad: Cali');
});

test('el recordatorio de autorización sale un minuto después de la bienvenida y luego cada 12 horas', () => {
  const welcomedAt = new Date(AT.getTime() - 30 * 1000);
  assert.equal(shouldRemindConsent({ welcomedAt }, AT), false);
  assert.equal(shouldRemindConsent({ welcomedAt: new Date(AT.getTime() - 2 * MINUTE) }, AT), true);
  assert.equal(shouldRemindConsent({ welcomedAt, consentReminderAt: new Date(AT.getTime() - 60 * MINUTE) }, AT), false);
  assert.equal(shouldRemindConsent({ welcomedAt, consentReminderAt: new Date(AT.getTime() - 13 * 60 * MINUTE) }, AT), true);
  assert.equal(shouldRemindConsent({ welcomedAt, dataAuthorizedAt: AT }, AT), false);
});

test('el modelo se pide con esquema, catálogo reutilizable, respaldo ante rechazos y el momento al final', async () => {
  let params = null;
  let governance = null;
  class Client {
    constructor(options) { this.options = options; this.beta = { messages: { stream: (body) => { params = body; return { finalMessage: async () => { await options.fetch('https://api.anthropic.com/v1/messages', {}); return { stop_reason: 'end_turn', model: body.model, content: [{ type: 'text', text: '{"reply":"Hola"}' }], usage: {} }; } }; } } }; }
  }
  const brain = createProspectBrain({ env: { ANTHROPIC_API_KEY: 'k' }, Client, fetchImpl: async (_url, init) => { governance = init.governanceContext; return {}; } });
  const result = await brain.reply({ instructions: 'I', catalog: 'C', note: 'N', messages: [{ role: 'user', content: 'Hola' }] });
  assert.equal(result.text, '{"reply":"Hola"}');
  assert.equal(params.model, 'claude-opus-5-5');
  assert.equal(params.fallbacks, 'default');
  assert.deepEqual(params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(params.output_config.format.type, 'json_schema');
  assert.equal(params.output_config.effort, 'medium');
  assert.match(params.system[1].text, /Información pública de la agencia[\s\S]*todavía no la ha registrado[\s\S]*Catálogo de servicios/);
  assert.deepEqual(params.system[1].cache_control, { type: 'ephemeral' });
  assert.deepEqual(params.messages.at(-1), { role: 'system', content: 'N' });
  assert.equal(governance.useCase, PROSPECT_AGENT_USE_CASE);
  assert.equal(createProspectBrain({ env: {} }), null);
  assert.equal(createProspectBrain({ env: { ANTHROPIC_API_KEY: 'k', WHATSAPP_PROSPECTS_AI: 'off' } }), null);
});

// Una base en memoria con lo que usan el servicio y Bria.
const fakeDb = () => {
  const tables = { contacts: [], leads: [], activities: [], messages: [], catalog: [{ category: 'BRANDING', name: 'Logo', description: 'Diseño de logo', valor_neto: 900000, activo: true }] };
  let consecutive = 10;
  const pick = (rows, where = {}) => rows.filter((row) => Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some((option) => pick([row], option).length);
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('notIn' in value) return !value.notIn.includes(row[key]);
      if ('contains' in value) return String(row[key] || '').includes(value.contains);
      if ('not' in value) return row[key] !== value.not && row[key] !== undefined;
    }
    return row[key] === value || (value === null && row[key] == null);
  }));
  const model = (rows, { unique = [] } = {}) => ({
    async findUnique({ where }) { return pick(rows, where)[0] || null; },
    async findFirst({ where }) { return pick(rows, where)[0] || null; },
    async findMany({ where = {}, orderBy, take } = {}) {
      let out = pick(rows, where);
      if (orderBy?.occurredAt) out = [...out].sort((a, b) => (orderBy.occurredAt === 'desc' ? b.occurredAt - a.occurredAt : a.occurredAt - b.occurredAt));
      return take ? out.slice(0, take) : out;
    },
    async create({ data }) {
      for (const key of unique) if (data[key] && rows.some((row) => row[key] === data[key])) throw Object.assign(new Error('duplicado'), { code: 'P2002' });
      const row = { id: crypto.randomUUID(), createdAt: new Date(), ...data }; rows.push(row); return row;
    },
    async update({ where, data }) { const row = pick(rows, where)[0]; Object.assign(row, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))); return row; },
    async updateMany({ where, data }) { const hit = pick(rows, where); for (const row of hit) Object.assign(row, data); return { count: hit.length }; },
    async delete({ where }) { const row = pick(rows, where)[0]; rows.splice(rows.indexOf(row), 1); return row; },
    async deleteMany({ where }) { const gone = pick(rows, where); for (const row of gone) rows.splice(rows.indexOf(row), 1); return { count: gone.length }; },
    async count({ where }) { return pick(rows, where).length; }
  });
  const db = {
    tables,
    crmWhatsAppContact: model(tables.contacts, { unique: ['waId'] }),
    crmWhatsAppMessage: model(tables.messages, { unique: ['metaMessageId'] }),
    crmActivity: model(tables.activities),
    crmLead: { ...model(tables.leads), async create({ data }) { const row = { id: crypto.randomUUID(), consecutive: consecutive += 1, archivedAt: null, ...data }; tables.leads.push(row); return row; } },
    serviceCatalog: { async findMany() { return tables.catalog; } },
    teamMember: { async findUnique() { return { userId: 'u-francys' }; }, async findMany() { return []; } },
    user: { async findUnique({ where }) { return { id: where.id, name: 'Francys Pérez' }; }, async findMany() { return [{ id: 'u-admin' }]; } },
    async $transaction(work) { return work(db); }
  };
  return db;
};

let clock = AT;
const tick = (ms) => { clock = new Date(clock.getTime() + ms); };
const message = (overrides = {}) => ({ messageId: crypto.randomUUID(), from: 'CO.555', phone: '573005550000', profileName: 'Ana Gómez', type: 'text', text: 'Hola, quiero un logo para mi café', ...overrides });

const build = ({ answers = [], fail = false, during = null } = {}) => {
  clock = AT;
  const db = fakeDb();
  const calls = [];
  const notices = [];
  const brain = { model: 'claude-opus-5-5', async reply(input) { calls.push(input); if (fail) throw new Error('caída'); if (during) await during(db); return answers.shift() || { text: JSON.stringify({ reply: 'Claro, ¿para cuándo lo necesitas?', handoff: false, handoffReason: '', brief: { serviceInterest: 'Logo', company: 'Café Sol' } }) }; } };
  const common = { db, now: () => clock, notify: async (notice) => { notices.push(notice); }, recipientsFor: async () => ['u-francys', 'u-admin'], logger: { warn() {}, error() {}, info() {} } };
  const agent = createProspectAgent({ ...common, brain, publicFacts: async () => [
    { statement: 'Instagram: instagram.com/agencia.uno', certainty: 'CONFIRMADO', sensitivity: 'normal' },
    { statement: 'Idea sin confirmar', certainty: 'PROPUESTA', sensitivity: 'normal' }
  ] });
  const service = createWhatsAppProspectService({ ...common, env: { APP_URL: 'https://labs.example.com' }, resolveOwner: async () => ({ id: 'tm-francys' }), prospectAgent: agent });
  const sent = [];
  const send = async (text, options) => { sent.push({ text, options }); return `wamid.out${sent.length}`; };
  return { db, calls, notices, service, sent, send, agent };
};

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('sin autorización Bria no conversa: la bienvenida pide «Acepto» y luego se le recuerda con los botones', async () => {
  const { db, calls, service, sent, send } = build();
  await service.receive(message(), { send });
  tick(2 * MINUTE);
  await service.receive(message({ text: '¿Cuánto vale?' }), { send });
  assert.equal(calls.length, 0, 'nada va a la IA sin autorización');
  assert.equal(sent.length, 2);
  assert.equal(sent[1].text, CONSENT_REMINDER_TEXT);
  assert.deepEqual(sent[1].options.buttons.map((button) => button.label), ['Acepto', 'No acepto']);
  assert.ok(db.tables.contacts[0].consentReminderAt);
  tick(MINUTE);
  await service.receive(message({ text: '¿Hola?' }), { send });
  assert.equal(sent.length, 2, 'el recordatorio no se repite enseguida');
});

test('al aceptar, Bria agradece y sigue con lo que la persona ya contó; el brief completa la oportunidad', async () => {
  const { db, calls, service, sent, send } = build();
  await service.receive(message(), { send });
  tick(MINUTE);
  const result = await service.receive(message({ type: 'interactive', text: 'Acepto', replyId: CONSENT_ACCEPT_ID }), { send });
  assert.equal(result.agent.replied, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].note, /acaba de tocar «Acepto»/);
  assert.match(calls[0].catalog, /### Logo/);
  assert.equal(calls[0].publicInfo, '- Instagram: instagram.com/agencia.uno', 'solo lo vigente de la información pública');
  assert.equal(calls[0].messages.at(-1).role, 'user');
  assert.equal(sent.at(-1).text, 'Claro, ¿para cuándo lo necesitas?');
  const [lead] = db.tables.leads;
  assert.equal(lead.serviceInterest, 'Logo');
  assert.equal(lead.company, 'Café Sol');
  assert.deepEqual(db.tables.contacts[0].brief, { serviceInterest: 'Logo', company: 'Café Sol' });
  assert.ok(db.tables.messages.some((row) => row.author === 'BRIA' && row.text === 'Claro, ¿para cuándo lo necesitas?'));
});

test('cuando ya tiene el brief, Bria pasa la conversación al equipo, deja nota, avisa y se calla', async () => {
  const { db, calls, notices, service, sent, send } = build({ answers: [
    { text: JSON.stringify({ reply: '¡Gracias! ¿Para cuándo?', handoff: false, handoffReason: '', brief: { serviceInterest: 'Logo' } }) },
    { text: JSON.stringify({ reply: 'Perfecto, una persona del equipo te escribe pronto.', handoff: true, handoffReason: 'Pide propuesta formal para diciembre.', brief: { timeline: 'Diciembre', summary: 'Logo para café, para diciembre.' } }) }
  ] });
  await service.receive(message(), { send });
  tick(MINUTE);
  await service.receive(message({ type: 'interactive', text: 'Acepto', replyId: CONSENT_ACCEPT_ID }), { send });
  tick(MINUTE);
  const result = await service.receive(message({ text: 'Para diciembre, ¿me mandan la propuesta?' }), { send });
  assert.equal(result.agent.handoff, true);
  const [contact] = db.tables.contacts;
  assert.ok(contact.botPausedAt);
  assert.equal(contact.botPausedReason, 'Pide propuesta formal para diciembre.');
  assert.deepEqual(contact.brief, { serviceInterest: 'Logo', timeline: 'Diciembre', summary: 'Logo para café, para diciembre.' });
  const [lead] = db.tables.leads;
  assert.match(lead.nextAction, /^Seguir la conversación de WhatsApp: Pide propuesta formal/);
  assert.ok(db.tables.activities.some((row) => /Bria pasó la conversación de WhatsApp al equipo/.test(row.note) && /Para cuándo: Diciembre/.test(row.note)));
  await settle();
  assert.ok(notices.some((notice) => /Bria te pasa a Ana Gómez/.test(notice.message)));
  tick(MINUTE);
  await service.receive(message({ text: '¿Hola?' }), { send });
  assert.equal(calls.length, 2, 'con la conversación en manos del equipo, Bria no responde');
  assert.equal(sent.at(-1).text, 'Perfecto, una persona del equipo te escribe pronto.');
});

test('si la IA falla, la persona recibe que el equipo la atiende y el equipo recibe el aviso', async () => {
  const { db, notices, service, sent, send } = build({ fail: true });
  await service.receive(message(), { send });
  tick(MINUTE);
  await service.receive(message({ type: 'interactive', text: 'Acepto', replyId: CONSENT_ACCEPT_ID }), { send });
  assert.equal(sent.at(-1).text, HANDOFF_FALLBACK_TEXT);
  assert.ok(db.tables.contacts[0].botPausedAt);
  await settle();
  assert.ok(notices.some((notice) => /falla del servicio de IA/.test(notice.message)));
});

test('quien responde desde la ficha toma la conversación; el equipo puede devolvérsela a Bria', async () => {
  const { db, calls, service, send } = build();
  await service.receive(message(), { send });
  tick(MINUTE);
  await service.receive(message({ type: 'interactive', text: 'Acepto', replyId: CONSENT_ACCEPT_ID }), { send });
  const leadId = db.tables.leads[0].id;
  await service.reply(leadId, { text: 'Hola Ana, soy Francys.' }, { userId: 'u-francys' }, { sendMessage: async () => 'wamid.team' });
  assert.equal(db.tables.contacts[0].botPausedReason, 'Francys Pérez respondió desde la ficha.');
  tick(MINUTE);
  await service.receive(message({ text: 'Gracias Francys' }), { send });
  assert.equal(calls.length, 1);
  const view = await service.conversationForLead(leadId);
  assert.equal(view.briaAvailable, true);
  assert.ok(view.contacts[0].botPausedAt);
  const back = await service.setBria(leadId, { active: true }, { userId: 'u-francys' });
  assert.equal(back.contact.botPausedAt, null);
  tick(MINUTE);
  await service.receive(message({ text: '¿Y el precio?' }), { send });
  assert.equal(calls.length, 2);
  await assert.rejects(() => service.setBria(leadId, {}, {}), { statusCode: 400 });
});

test('sin IA configurada todo sigue como antes: bienvenida, agradecimiento fijo y el equipo responde', async () => {
  clock = AT;
  const db = fakeDb();
  const service = createWhatsAppProspectService({ db, now: () => clock, env: {}, notify: async () => {}, recipientsFor: async () => [], resolveOwner: async () => null, logger: { warn() {}, error() {} }, prospectAgent: createProspectAgent({ db, brain: null, now: () => clock }) });
  const sent = [];
  const send = async (text) => { sent.push(text); return null; };
  await service.receive(message(), { send });
  tick(MINUTE);
  await service.receive(message({ type: 'interactive', text: 'Acepto', replyId: CONSENT_ACCEPT_ID }), { send });
  assert.match(sent.at(-1), /^¡Gracias! Ya quedó registrado/);
  const view = await service.conversationForLead(db.tables.leads[0].id);
  assert.equal(view.briaAvailable, false);
  await assert.rejects(() => service.setBria(db.tables.leads[0].id, { active: true }, {}), { statusCode: 409 });
});

const authorize = async ({ service, send }) => {
  await service.receive(message(), { send });
  tick(MINUTE);
};

test('si el equipo toma la conversación mientras Bria piensa, Bria no envía nada', async () => {
  const ctx = build({ during: async (db) => { db.tables.contacts[0].botPausedAt = clock; } });
  await authorize(ctx);
  const before = ctx.sent.length;
  const briaBefore = ctx.db.tables.messages.filter((row) => row.author === 'BRIA').length;
  const result = await ctx.service.receive(message({ type: 'interactive', text: 'Acepto', replyId: CONSENT_ACCEPT_ID }), { send: ctx.send });
  assert.equal(result.agent.replied, false);
  assert.equal(ctx.sent.length, before);
  assert.equal(ctx.db.tables.messages.filter((row) => row.author === 'BRIA').length, briaBefore);
});

test('el brief no pisa la empresa que el equipo escribió mientras Bria pensaba', async () => {
  const ctx = build({ during: async (db) => { db.tables.leads[0].company = 'Cafetería del Sol S.A.S.'; } });
  await authorize(ctx);
  await ctx.service.receive(message({ type: 'interactive', text: 'Acepto', replyId: CONSENT_ACCEPT_ID }), { send: ctx.send });
  assert.equal(ctx.db.tables.leads[0].company, 'Cafetería del Sol S.A.S.');
  assert.equal(ctx.db.tables.leads[0].serviceInterest, 'Logo');
});

test('si la respuesta de Bria no sale por WhatsApp, pasa al equipo y avisa', async () => {
  const ctx = build();
  await authorize(ctx);
  const failing = async (text, options) => { if (!options?.buttons) throw new Error('Meta rechazó'); return ctx.send(text, options); };
  const result = await ctx.service.receive(message({ type: 'interactive', text: 'Acepto', replyId: CONSENT_ACCEPT_ID }), { send: failing });
  await settle();
  assert.equal(result.agent.replied, false);
  assert.equal(result.agent.handoff, true);
  assert.ok(ctx.db.tables.contacts[0].botPausedAt);
  assert.match(ctx.db.tables.contacts[0].botPausedReason, /no salió/);
  assert.ok(ctx.notices.some((notice) => /Bria te pasa/.test(notice.message)));
});

test('al devolverle la conversación, Bria responde lo que la persona preguntó mientras la atendía el equipo', async () => {
  const ctx = build({ answers: [
    { text: JSON.stringify({ reply: 'El logo tiene una referencia de $900.000. Te paso con el equipo.', handoff: true, handoffReason: 'Ya tiene servicio y presupuesto.', brief: { serviceInterest: 'Logo', budget: '1M' } }) },
    { text: JSON.stringify({ reply: 'Sí, incluye el manual básico de uso.', handoff: false, handoffReason: '', brief: {} }) }
  ] });
  await authorize(ctx);
  await ctx.service.receive(message({ type: 'interactive', text: 'Acepto', replyId: CONSENT_ACCEPT_ID }), { send: ctx.send });
  assert.ok(ctx.db.tables.contacts[0].botPausedAt);
  tick(MINUTE);
  await ctx.service.receive(message({ text: '¿Incluye el manual de marca?' }), { send: ctx.send });
  assert.equal(ctx.calls.length, 1, 'pausada, Bria no responde');
  const [lead] = ctx.db.tables.leads;
  tick(MINUTE);
  const result = await ctx.service.setBria(lead.id, { active: true }, { userId: 'u-rodny' }, { sendMessage: async (_to, text) => ctx.send(text) });
  assert.equal(ctx.calls.length, 2);
  assert.equal(result.agent.replied, true);
  assert.equal(ctx.sent.at(-1).text, 'Sí, incluye el manual básico de uso.');
  assert.equal(result.contact.botPausedAt, null);
  // Si lo último ya lo respondió alguien, devolverla no dispara una respuesta.
  await ctx.service.setBria(lead.id, { active: false }, {});
  await ctx.service.setBria(lead.id, { active: true }, {}, { sendMessage: async (_to, text) => ctx.send(text) });
  assert.equal(ctx.calls.length, 2);
});
