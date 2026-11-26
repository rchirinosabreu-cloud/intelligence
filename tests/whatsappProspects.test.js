import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  parseReferral, originDetailFor, phoneKey, leadPhone, welcomeText, shouldWelcome, shouldNotify, inboundTextFor,
  canReplyFreely, cleanReply, nextStatus, parseStatuses, PROSPECT_TEXT_MAX
} from '../src/lib/whatsappProspects.js';
import { parseInboundMessages } from '../src/lib/whatsappBridge.js';
import { createWhatsAppProspectService } from '../src/services/whatsappProspectService.js';
import { createWhatsAppBridgeService } from '../src/services/whatsappBridgeService.js';

// Prospectos por WhatsApp (Rodny, 26 de noviembre de 2026): quien escribe al número de la agencia sin ser del equipo
// entra solo al CRM con su origen, su anuncio y su responsable, y su conversación queda en la ficha.

const AT = new Date('2026-11-26T15:00:00Z');
const HOUR = 60 * 60 * 1000;

test('el anuncio de Meta se guarda recortado y solo con enlaces https', () => {
  const referral = parseReferral({ source_type: 'ad', source_id: '120210000000', source_url: 'https://fb.me/abc', headline: 'Branding para tu marca', body: 'Escríbenos', ctwa_clid: 'ARAk', extra: 'x' });
  assert.deepEqual(referral, { sourceType: 'ad', sourceId: '120210000000', sourceUrl: 'https://fb.me/abc', headline: 'Branding para tu marca', body: 'Escríbenos', ctwaClid: 'ARAk' });
  assert.equal(parseReferral({ source_url: 'javascript:alert(1)' }), null);
  assert.equal(parseReferral(null), null);
  assert.equal(originDetailFor(referral), 'Anuncio: Branding para tu marca');
  assert.equal(originDetailFor({ sourceType: 'post', sourceId: '99' }), 'Publicación: id 99');
  assert.equal(originDetailFor(null), 'Escribió directo al WhatsApp');
});

test('el aviso de Meta deja pasar el anuncio crudo hasta el prospecto', () => {
  const [message] = parseInboundMessages({
    object: 'whatsapp_business_account',
    entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1' }, contacts: [{ profile: { name: 'Ana' }, wa_id: '573001234567' }], messages: [{ from: '573001234567', id: 'wamid.a', timestamp: '1', type: 'text', text: { body: 'Hola, vi su anuncio' }, referral: { source_type: 'ad', headline: 'Branding' } }] } }] }]
  });
  assert.deepEqual(message.referral, { source_type: 'ad', headline: 'Branding' });
});

test('la misma persona se reconoce por los últimos 10 dígitos, escriba su número como lo escriba', () => {
  assert.equal(phoneKey('573001234567'), '3001234567');
  assert.equal(phoneKey('+57 300 123 4567'), '3001234567');
  assert.equal(phoneKey('CO.13491208655302741918'), null);
  assert.equal(leadPhone('573001234567'), '+57 300 123 4567');
  assert.equal(leadPhone('15551234567'), '+15551234567');
  assert.equal(leadPhone(null), null);
});

test('la bienvenida saluda por el nombre, promete una persona y enlaza la política de datos', () => {
  const text = welcomeText({ name: 'Camila Pérez', privacyUrl: 'https://labs.brainstudioagencia.com/privacidad' });
  assert.match(text, /^¡Hola, Camila!/);
  assert.match(text, /una persona te responde/);
  assert.match(text, /https:\/\/labs\.brainstudioagencia\.com\/privacidad/);
  assert.match(welcomeText({}), /^¡Hola!/);
  assert.equal(shouldWelcome({ welcomedAt: null }, AT), true);
  assert.equal(shouldWelcome({ welcomedAt: new Date(AT.getTime() - 2 * HOUR) }, AT), false);
  assert.equal(shouldWelcome({ welcomedAt: new Date(AT.getTime() - 31 * 24 * HOUR) }, AT), true);
});

test('se avisa en cada lead nuevo y cuando la persona vuelve tras un silencio largo', () => {
  assert.equal(shouldNotify({ createdLead: true, previousInboundAt: new Date(AT.getTime() - HOUR) }, AT), true);
  assert.equal(shouldNotify({ createdLead: false, previousInboundAt: new Date(AT.getTime() - HOUR) }, AT), false);
  assert.equal(shouldNotify({ createdLead: false, previousInboundAt: new Date(AT.getTime() - 13 * HOUR) }, AT), true);
});

test('un archivo sin texto queda dicho en palabras', () => {
  assert.equal(inboundTextFor({ type: 'text', text: 'Hola' }), 'Hola');
  assert.equal(inboundTextFor({ type: 'image', text: 'Mi logo', media: { kind: 'image' } }), '[Foto] Mi logo');
  assert.equal(inboundTextFor({ type: 'audio', media: { kind: 'audio' } }), '[Nota de voz]');
  assert.equal(inboundTextFor({ type: 'location' }), '[Ubicación]');
});

test('el equipo escribe libre solo dentro de las 24 horas y con un texto válido', () => {
  assert.equal(canReplyFreely({ lastInboundAt: new Date(AT.getTime() - 2 * HOUR) }, AT), true);
  assert.equal(canReplyFreely({ lastInboundAt: new Date(AT.getTime() - 25 * HOUR) }, AT), false);
  assert.equal(canReplyFreely({ lastInboundAt: null }, AT), false);
  assert.deepEqual(cleanReply('  Hola Ana  '), { text: 'Hola Ana' });
  assert.ok(cleanReply('   ').error);
  assert.ok(cleanReply('x'.repeat(PROSPECT_TEXT_MAX + 1)).error);
});

test('un estado de entrega viejo nunca pisa uno nuevo', () => {
  assert.equal(nextStatus(null, 'sent'), 'SENT');
  assert.equal(nextStatus('SENT', 'delivered'), 'DELIVERED');
  assert.equal(nextStatus('READ', 'delivered'), 'READ');
  assert.equal(nextStatus('DELIVERED', 'failed'), 'FAILED');
  assert.equal(nextStatus('SENT', 'raro'), 'SENT');
  const statuses = parseStatuses({ entry: [{ changes: [
    { field: 'messages', value: { metadata: { phone_number_id: '1' }, statuses: [{ id: 'wamid.x', status: 'read', timestamp: '1764169200' }] } },
    { field: 'messages', value: { metadata: { phone_number_id: '2' }, statuses: [{ id: 'wamid.y', status: 'read' }] } }
  ] }] }, '1');
  assert.deepEqual(statuses.map((row) => [row.messageId, row.status]), [['wamid.x', 'READ']]);
});

// Una base en memoria con lo que el servicio usa de Prisma.
const fakeDb = ({ leads = [], members = [{ id: 'tm-francys', name: 'Francys', userId: 'u-francys', isActive: true }] } = {}) => {
  const tables = { contacts: [], leads: [...leads], activities: [], messages: [] };
  let consecutive = 100;
  const pick = (rows, where = {}) => rows.filter((row) => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if ('notIn' in value) return !value.notIn.includes(row[key]);
      if ('contains' in value) return String(row[key] || '').includes(value.contains);
    }
    return row[key] === value;
  }));
  const model = (rows, { unique = [] } = {}) => ({
    async findUnique({ where }) { return pick(rows, where)[0] || null; },
    async findFirst({ where }) { return pick(rows, where).sort((a, b) => (b.lastInboundAt || 0) - (a.lastInboundAt || 0))[0] || null; },
    async findMany({ where = {}, orderBy, take } = {}) {
      let out = pick(rows, where);
      if (orderBy?.occurredAt) out = out.sort((a, b) => (orderBy.occurredAt === 'desc' ? b.occurredAt - a.occurredAt : a.occurredAt - b.occurredAt));
      return take ? out.slice(0, take) : out;
    },
    async create({ data }) {
      for (const key of unique) if (data[key] && rows.some((row) => row[key] === data[key])) throw Object.assign(new Error('duplicado'), { code: 'P2002' });
      const row = { id: crypto.randomUUID(), createdAt: new Date(), ...data };
      rows.push(row); return row;
    },
    async update({ where, data }) { const row = pick(rows, where)[0]; Object.assign(row, data); return row; }
  });
  const db = {
    tables,
    crmWhatsAppContact: model(tables.contacts, { unique: ['waId'] }),
    crmWhatsAppMessage: model(tables.messages, { unique: ['metaMessageId'] }),
    crmActivity: model(tables.activities),
    crmLead: { ...model(tables.leads), async create({ data }) { const row = { id: crypto.randomUUID(), consecutive: consecutive += 1, archivedAt: null, ...data }; tables.leads.push(row); return row; } },
    teamMember: { async findUnique({ where }) { return members.find((member) => member.id === where.id) || null; }, async findMany() { return members; } },
    user: { async findUnique({ where }) { return { id: where.id, name: 'Francys Pérez' }; }, async findMany() { return [{ id: 'u-admin' }]; } },
    async $transaction(work) { return work(db); }
  };
  return db;
};

const prospectMessage = (overrides = {}) => ({ messageId: 'wamid.1', from: 'CO.111222333', phone: '573001234567', profileName: 'Ana Gómez', type: 'text', text: 'Hola, quiero cotizar branding', ...overrides });

const buildService = (db, extra = {}) => {
  const notices = [];
  const service = createWhatsAppProspectService({
    db, env: { APP_URL: 'https://labs.brainstudioagencia.com' }, now: () => AT,
    notify: async (notice) => { notices.push(notice); return notice; },
    logger: { warn() {}, error() {}, info() {} },
    ...extra
  });
  return { service, notices };
};

test('el primer mensaje crea la oportunidad con origen, anuncio, responsable y seguimiento de hoy', async () => {
  const db = fakeDb();
  const { service, notices } = buildService(db);
  const sent = [];
  const result = await service.receive(prospectMessage({ referral: { source_type: 'ad', headline: 'Branding 360' } }), { send: async (text) => { sent.push(text); return 'wamid.out1'; } });
  assert.equal(result.outcome, 'prospect-new');
  const [lead] = db.tables.leads;
  assert.equal(lead.origin, 'WHATSAPP');
  assert.equal(lead.originDetail, 'Anuncio: Branding 360');
  assert.equal(lead.contactName, 'Ana Gómez');
  assert.equal(lead.phone, '+57 300 123 4567');
  assert.equal(lead.stage, 'POR_GESTIONAR');
  assert.equal(lead.ownerId, 'tm-francys');
  assert.equal(lead.nextFollowUpAt.toISOString(), '2026-11-26T00:00:00.000Z');
  assert.match(db.tables.activities[0].note, /Llegó por WhatsApp\. Anuncio: Branding 360\./);
  assert.deepEqual(db.tables.messages.map((row) => [row.direction, row.author]), [['IN', 'CONTACT'], ['OUT', 'BRIA']]);
  assert.equal(db.tables.messages[0].referral.headline, 'Branding 360');
  assert.equal(sent.length, 1);
  assert.match(sent[0], /¡Hola, Ana!/);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(notices.map((notice) => notice.userId).sort(), ['u-admin', 'u-francys']);
  assert.match(notices[0].message, /Nuevo lead por WhatsApp: Ana Gómez \(.+\)\. Anuncio: Branding 360/);
  assert.equal(notices[0].url, `/crm/oportunidades/${lead.id}`);
});

test('los mensajes siguientes van a la misma oportunidad, sin otra bienvenida ni otro aviso', async () => {
  const db = fakeDb();
  const { service, notices } = buildService(db);
  const send = async () => 'wamid.out';
  await service.receive(prospectMessage(), { send: async () => 'wamid.w' });
  const second = await service.receive(prospectMessage({ messageId: 'wamid.2', text: '¿Cuánto cuesta?' }), { send });
  assert.equal(second.outcome, 'prospect-message');
  assert.equal(db.tables.leads.length, 1);
  assert.equal(db.tables.messages.filter((row) => row.author === 'BRIA').length, 1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(notices.length, 2);
});

test('si ya había una oportunidad abierta con ese número, el mensaje se suma a ella', async () => {
  const db = fakeDb({ leads: [{ id: 'lead-old', consecutive: 7, phone: '+57 300 123 4567', stage: 'CONTACTADO', archivedAt: null, contactName: 'Ana', enteredAt: AT }] });
  const { service } = buildService(db);
  const result = await service.receive(prospectMessage(), { send: async () => null });
  assert.equal(result.leadId, 'lead-old');
  assert.equal(db.tables.leads.length, 1);
});

test('una oportunidad ganada o descartada no se reabre: el mensaje nuevo crea otra', async () => {
  const db = fakeDb({ leads: [{ id: 'lead-won', consecutive: 7, phone: '+57 300 123 4567', stage: 'GANADO', archivedAt: null, contactName: 'Ana', enteredAt: AT }] });
  const { service } = buildService(db);
  const result = await service.receive(prospectMessage(), { send: async () => null });
  assert.notEqual(result.leadId, 'lead-won');
  assert.equal(db.tables.leads.length, 2);
});

test('una bienvenida que no sale no impide registrar el lead', async () => {
  const db = fakeDb();
  const { service } = buildService(db);
  const result = await service.receive(prospectMessage(), { send: async () => { throw new Error('Meta caída'); } });
  assert.equal(result.outcome, 'prospect-new');
  assert.equal(db.tables.messages.length, 1);
  assert.equal(db.tables.contacts[0].welcomedAt, undefined);
});

test('el equipo responde desde la ficha dentro de las 24 horas y queda como gestión de WhatsApp', async () => {
  const db = fakeDb();
  const logged = [];
  const { service } = buildService(db, { logActivity: async (_db, leadId, payload) => { logged.push({ leadId, payload }); return { lead: { id: leadId } }; } });
  const { leadId } = await service.receive(prospectMessage(), { send: async () => null });
  const outbox = [];
  const result = await service.reply(leadId, { text: '  Hola Ana, te llamo en 10 minutos.  ' }, { userId: 'u-francys' }, { sendMessage: async (to, text) => { outbox.push({ to, text }); return 'wamid.team'; } });
  assert.deepEqual(outbox, [{ to: '573001234567', text: 'Hola Ana, te llamo en 10 minutos.' }]);
  assert.equal(result.message.author, 'TEAM');
  assert.equal(result.message.authorName, 'Francys Pérez');
  assert.equal(result.message.status, 'SENT');
  assert.equal(logged[0].payload.type, 'WHATSAPP');
  const conversation = await service.conversationForLead(leadId);
  assert.deepEqual(conversation.messages.map((row) => row.author).sort(), ['BRIA', 'CONTACT', 'TEAM']);
  assert.equal(conversation.contacts[0].canReply, true);
  assert.equal(conversation.contacts[0].phone, '+57 300 123 4567');
});

test('pasadas las 24 horas no se deja escribir libre y lo dice', async () => {
  const db = fakeDb();
  const { service } = buildService(db);
  const { leadId } = await service.receive(prospectMessage(), { send: async () => null });
  db.tables.contacts[0].lastInboundAt = new Date(AT.getTime() - 30 * HOUR);
  await assert.rejects(service.reply(leadId, { text: 'Hola' }, { userId: 'u-francys' }, { sendMessage: async () => 'x' }), (error) => error.statusCode === 409 && /plantilla aprobada/.test(error.message));
  await assert.rejects(service.reply(leadId, { text: '   ' }, {}, { sendMessage: async () => 'x' }), (error) => error.statusCode === 400);
});

test('los estados de Meta avanzan los mensajes que salieron', async () => {
  const db = fakeDb();
  const { service } = buildService(db);
  await service.receive(prospectMessage(), { send: async () => 'wamid.welcome' });
  await service.recordStatuses([{ messageId: 'wamid.welcome', status: 'DELIVERED' }, { messageId: 'wamid.welcome', status: 'READ' }, { messageId: 'wamid.welcome', status: 'DELIVERED' }]);
  assert.equal(db.tables.messages.find((row) => row.metaMessageId === 'wamid.welcome').status, 'READ');
});

// El puente: quien no está vinculado pasa al CRM en vez de recibir «este número es solo para el equipo».
const bridgeFor = ({ prospects, env = {} }) => {
  const sent = [];
  const repository = {
    async linkByWaId() { return null; }, async rememberInbound() { return true; }, async consumeCode() { return { ok: false, reason: 'unknown' }; },
    async unknownRepliesSince() { return 0; }, async rememberUnknownReply() {}
  };
  const service = createWhatsAppBridgeService({
    repository, conversations: () => ({}), prospects: () => prospects,
    env: { META_APP_SECRET: 's', META_WHATSAPP_TOKEN: 't', META_WHATSAPP_PHONE_NUMBER_ID: '1', ...env },
    fetchImpl: async (_url, options) => { sent.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ messages: [{ id: `wamid.out${sent.length}` }] }) }; },
    logger: { info() {}, warn() {}, error() {} }
  });
  return { service, sent };
};

test('el puente manda al CRM a quien no es del equipo y le responde con el identificador de Meta', async () => {
  const calls = [];
  const prospects = { async receive(message, { send }) { calls.push(message); return { outcome: 'prospect-new', welcomeId: await send('Hola') }; } };
  const { service, sent } = bridgeFor({ prospects });
  const result = await service.processMessage(prospectMessage());
  assert.equal(result.outcome, 'prospect-new');
  assert.equal(result.welcomeId, 'wamid.out1');
  assert.equal(calls[0].from, 'CO.111222333');
  assert.equal(sent[0].to, '573001234567');
});

test('con WHATSAPP_PROSPECTS=off vuelve el aviso de «solo para el equipo»', async () => {
  const prospects = { async receive() { throw new Error('no debería llamarse'); } };
  const { service } = bridgeFor({ prospects, env: { WHATSAPP_PROSPECTS: 'off' } });
  assert.equal((await service.processMessage(prospectMessage())).outcome, 'unknown');
});

test('un código de vínculo sigue funcionando para el equipo aunque haya prospectos', async () => {
  const prospects = { async receive() { throw new Error('no debería llamarse'); } };
  const { service } = bridgeFor({ prospects });
  const result = await service.processMessage(prospectMessage({ text: '123456' }));
  assert.equal(result.outcome, 'invalid-code');
});

test('la ficha lee la conversación y responde por las rutas del CRM, con los errores en palabras', async () => {
  const express = (await import('express')).default;
  const { once } = await import('node:events');
  const { createCrmRouter } = await import('../src/routes/api/crm.js');
  const replies = [];
  const prospects = {
    async conversationForLead(id) { if (id !== 'L1') throw Object.assign(new Error('Oportunidad no encontrada.'), { statusCode: 404 }); return { contacts: [], messages: [] }; },
    async reply(id, payload, actor, { sendMessage }) {
      if (!payload.text) throw Object.assign(new Error('Escribe el mensaje antes de enviarlo.'), { statusCode: 400 });
      replies.push({ id, actor: actor.userId, metaId: await sendMessage('573001234567', payload.text) });
      return { message: { id: 'm1' } };
    }
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: 'u1' }; next(); });
  app.use('/api/crm', createCrmRouter({ service: {}, drafts: {}, db: {}, whatsapp: { prospects: async () => prospects, sendMessage: async () => async () => 'wamid.r' } }));
  const server = app.listen(0);
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/crm/leads`;
  try {
    assert.equal((await fetch(`${base}/L1/whatsapp`)).status, 200);
    assert.equal((await fetch(`${base}/nope/whatsapp`)).status, 404);
    const bad = await fetch(`${base}/L1/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).error, 'Escribe el mensaje antes de enviarlo.');
    const ok = await fetch(`${base}/L1/whatsapp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: 'Hola' }) });
    assert.equal(ok.status, 201);
    assert.deepEqual(replies, [{ id: 'L1', actor: 'u1', metaId: 'wamid.r' }]);
  } finally { server.close(); }
});
