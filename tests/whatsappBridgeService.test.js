import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import { createWhatsAppBridgeService } from '../src/services/whatsappBridgeService.js';
import { createWhatsAppWebhookRouter, createBriaWhatsAppRouter } from '../src/routes/api/whatsapp.js';
import { REPLIES } from '../src/lib/whatsappBridge.js';

// Bria en WhatsApp (20 de octubre de 2026): el webhook firmado, el vínculo por código y el puente al motor de Bria
// de siempre. Sin red ni base de datos: repositorio, conversaciones y Meta son dobles.

const SECRET = 'secreto-de-la-app';
const ENV = { META_APP_SECRET: SECRET, META_WHATSAPP_TOKEN: 'token-de-whatsapp', META_WHATSAPP_PHONE_NUMBER_ID: '1319887801213730', META_WHATSAPP_VERIFY_TOKEN: 'verificacion', META_WHATSAPP_NUMBER: '+573043786298' };
const sign = (raw, secret = SECRET) => `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
const inbound = ({ from = '573001234567', id = 'wamid.1', type = 'text', text = 'hola', name = 'Camila', phoneNumberId = '1319887801213730' } = {}) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: phoneNumberId }, contacts: [{ profile: { name }, wa_id: from }], messages: [{ from, id, timestamp: '1', type, ...(type === 'text' ? { text: { body: text } } : {}) }] } }] }]
});

const fakeRepository = () => {
  const links = new Map(), codes = new Map(), seen = new Set(), unknown = [];
  return {
    links, codes, seen, unknown,
    async createCode({ userId, code, expiresAt }) { for (const [k, v] of codes) if (v.userId === userId) codes.delete(k); if (codes.has(code)) return false; codes.set(code, { userId, expiresAt }); return true; },
    async consumeCode({ code, waId, phone = null, profileName, now }) {
      const row = codes.get(code); if (!row) return { ok: false, reason: 'unknown' }; codes.delete(code);
      if (row.expiresAt.getTime() < now.getTime()) return { ok: false, reason: 'expired' };
      for (const [, link] of links) if ((link.waId === waId || (phone && (link.phone === phone || link.waId === phone))) && link.userId !== row.userId) return { ok: false, reason: 'taken' };
      links.set(row.userId, { userId: row.userId, waId, phone, profileName, conversationId: null, linkedAt: now, lastMessageAt: null });
      return { ok: true, userId: row.userId };
    },
    async linkByWaId(waId, phone = null) { return [...links.values()].find((link) => link.waId === waId) || (phone ? [...links.values()].find((link) => link.phone === phone || link.waId === phone) : null) || null; },
    async setPhone(userId, phone) { links.get(userId).phone = phone; },
    async linkByUser(userId) { return links.get(userId) || null; },
    async setConversation(userId, conversationId) { links.get(userId).conversationId = conversationId; },
    async touch(userId, at) { links.get(userId).lastMessageAt = at; },
    async unlink(userId) { links.delete(userId); },
    async rememberInbound(messageId) { if (seen.has(messageId)) return false; seen.add(messageId); return true; },
    async unknownRepliesSince(waId, since) { return unknown.filter((row) => row.waId === waId && row.at >= since).length; },
    async rememberUnknownReply(waId, at) { unknown.push({ waId, at }); }
  };
};

const fakeConversations = ({ answer = 'Hoy tienes **dos** pendientes.', extra = {}, fail = null } = {}) => {
  const chats = new Map(); const calls = [];
  const service = {
    calls, chats,
    async create(user) { const id = crypto.randomUUID(); chats.set(id, { id, owner: user.userId, turns: [], revision: 0 }); return { id, turns: [] }; },
    async read(user, id) { const chat = chats.get(id); if (!chat || chat.owner !== user.userId) throw Object.assign(new Error('No encontramos esa conversación.'), { status: 404 }); return chat; },
    async send({ user, id, question, session }) {
      calls.push({ user, id, question, session });
      if (fail) throw fail;
      const chat = chats.get(id); chat.turns.push({ role: 'user', text: question }, { role: 'assistant', text: answer, ...extra }); chat.revision += 1; return chat;
    }
  };
  return service;
};

const build = ({ repository = fakeRepository(), conversations = fakeConversations(), users = {}, env = ENV, fetchImpl, now = () => new Date('2026-10-20T20:00:00Z'), random } = {}) => {
  const sent = [];
  const fetchFn = fetchImpl || (async (url, options) => { sent.push({ url, body: JSON.parse(options.body), auth: options.headers.Authorization }); return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.out' }] }) }; });
  const db = { user: { findUnique: async ({ where }) => users[where.id] || null } };
  const work = [];
  const service = createWhatsAppBridgeService({ repository, conversations: () => conversations, db, env, fetchImpl: fetchFn, now, random, logger: { warn() {}, error() {}, info() {} }, scheduleWork: (fn) => work.push(fn) });
  const drain = async () => { while (work.length) await work.shift()(); };
  return { service, sent, repository, conversations, drain };
};

const camila = { id: 'u-camila', name: 'Camila Pérez', email: 'camila@brainstudio.co', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true }, sessionVersion: 3, teamMember: { isActive: true } };

test('el webhook: sin secreto no abre, una firma mala es 401, y un aviso firmado responde 200 antes de trabajar', async () => {
  const closed = build({ env: { ...ENV, META_APP_SECRET: '' } });
  assert.equal((await closed.service.handleWebhook({ rawBody: Buffer.from('{}'), signature: 'sha256=00', body: {} })).status, 503);
  const { service, drain, conversations } = build();
  const raw = Buffer.from(JSON.stringify(inbound()));
  assert.equal((await service.handleWebhook({ rawBody: raw, signature: sign(raw, 'otro'), body: inbound() })).status, 401);
  assert.equal((await service.handleWebhook({ rawBody: raw, signature: null, body: inbound() })).status, 401);
  const accepted = await service.handleWebhook({ rawBody: raw, signature: sign(raw), body: inbound() });
  assert.deepEqual(accepted, { status: 200, body: { accepted: true, messages: 1 } });
  assert.equal(conversations.calls.length, 0, 'todavía no se trabajó: primero se responde a Meta');
  await drain();
});

test('un número que nadie vinculó recibe la explicación una sola vez al día; un código bueno lo vincula y lo saluda por su nombre', async () => {
  const { service, sent, repository, drain } = build({ users: { 'u-camila': camila }, random: () => 482913 });
  const first = await service.processMessage({ messageId: 'm1', from: '573001234567', profileName: 'Camila', type: 'text', text: 'hola' });
  assert.equal(first.outcome, 'unknown');
  assert.equal(sent.at(-1).body.text.body, REPLIES.unknown);
  assert.equal((await service.processMessage({ messageId: 'm2', from: '573001234567', profileName: 'Camila', type: 'text', text: '¿hay alguien?' })).outcome, 'ignored');
  assert.equal(sent.length, 1, 'la segunda vez no se le contesta');
  // El código se genera dentro de la plataforma, con la sesión de la persona.
  const code = await service.createLinkCode('u-camila');
  assert.deepEqual([code.code, code.message, code.numberDisplay, code.link], ['482913', 'BRIA 482913', '+57 304 378 6298', 'https://wa.me/573043786298?text=BRIA%20482913']);
  assert.equal((await service.processMessage({ messageId: 'm3', from: '573001234567', profileName: 'Camila', type: 'text', text: 'BRIA 111111' })).outcome, 'invalid-code');
  assert.equal(sent.at(-1).body.text.body, REPLIES.invalidCode);
  const linked = await service.processMessage({ messageId: 'm4', from: '573001234567', profileName: 'Camila', type: 'text', text: 'BRIA 482913' });
  assert.deepEqual(linked, { outcome: 'linked', userId: 'u-camila' });
  assert.equal(sent.at(-1).body.text.body, REPLIES.linked('Camila Pérez'));
  assert.equal(sent.at(-1).auth, 'Bearer token-de-whatsapp', 'el token va en la cabecera, nunca en la dirección');
  assert.match(sent.at(-1).url, /\/1319887801213730\/messages$/);
  assert.equal(repository.links.get('u-camila').waId, '573001234567');
  const status = await service.status('u-camila');
  assert.deepEqual([status.linked, status.phone, status.configured, status.numberDisplay], [true, '+57 300 123 4567', true, '+57 304 378 6298']);
  await drain();
});

test('un vínculo vivo manda el mensaje al motor de Bria con la identidad de la persona y sin sesión, y devuelve la respuesta traducida', async () => {
  const repository = fakeRepository();
  repository.links.set('u-camila', { userId: 'u-camila', waId: '573001234567', profileName: 'Camila', conversationId: null, linkedAt: new Date(), lastMessageAt: null });
  const conversations = fakeConversations({ extra: { quickReplies: ['Crear pendiente', 'Cancelar pendiente'] } });
  const { service, sent } = build({ repository, conversations, users: { 'u-camila': camila } });
  const result = await service.processMessage({ messageId: 'm1', from: '573001234567', profileName: 'Camila', type: 'text', text: '¿Qué tengo hoy?' });
  assert.equal(result.outcome, 'answered');
  const call = conversations.calls[0];
  assert.deepEqual([call.user.userId, call.user.role, call.user.sessionVersion, call.session, call.question], ['u-camila', 'PROJECT_MANAGER', 3, null, '¿Qué tengo hoy?']);
  assert.equal(repository.links.get('u-camila').conversationId, call.id, 'la conversación de WhatsApp se recuerda para seguirla');
  // Las opciones salen como botones (22 de octubre de 2026); tocarlos o escribir con sus palabras vale lo mismo.
  assert.equal(sent[0].body.status, 'read');
  assert.equal(sent[1].body.type, 'interactive');
  assert.equal(sent[1].body.interactive.body.text, 'Hoy tienes *dos* pendientes.');
  assert.deepEqual(sent[1].body.interactive.action.buttons.map((row) => row.reply.title), ['Crear pendiente', 'Cancelar pendiente']);
  // El siguiente mensaje sigue en la misma conversación.
  await service.processMessage({ messageId: 'm2', from: '573001234567', profileName: 'Camila', type: 'text', text: 'Crear pendiente' });
  assert.equal(conversations.calls[1].id, call.id);
  // Un aviso repetido de Meta no se responde dos veces.
  assert.deepEqual(await service.processMessage({ messageId: 'm2', from: '573001234567', type: 'text', text: 'Crear pendiente' }), { skipped: 'duplicate' });
  assert.equal(conversations.calls.length, 2);
});

test('quien ya no tiene Bria no habla por aquí; un audio se contesta en palabras; la bóveda nunca sale; un fallo del motor se dice', async () => {
  const repository = fakeRepository();
  repository.links.set('u-camila', { userId: 'u-camila', waId: '573001234567', conversationId: null });
  const off = build({ repository, users: { 'u-camila': { ...camila, modulePermissions: { bria: false } } } });
  assert.equal((await off.service.processMessage({ messageId: 'a', from: '573001234567', type: 'text', text: 'hola' })).outcome, 'not-allowed');
  assert.equal(off.sent.at(-1).body.text.body, REPLIES.notAllowed);
  assert.equal(off.conversations.calls.length, 0);
  const gone = build({ repository: Object.assign(fakeRepository(), { linkByWaId: async () => ({ userId: 'u-nadie', waId: '573001234567' }) }), users: {} });
  assert.equal((await gone.service.processMessage({ messageId: 'b', from: '573001234567', type: 'text', text: 'hola' })).outcome, 'not-allowed');
  const audio = build({ repository, users: { 'u-camila': camila } });
  assert.equal((await audio.service.processMessage({ messageId: 'c', from: '573001234567', type: 'audio', text: null })).outcome, 'only-text');
  assert.equal(audio.sent.at(-1).body.text.body, REPLIES.onlyText);
  const vault = build({ repository, conversations: fakeConversations({ answer: 'La clave es 1234', extra: { accessCards: [{ id: 'c' }] } }), users: { 'u-camila': camila } });
  await vault.service.processMessage({ messageId: 'd', from: '573001234567', type: 'text', text: 'dame la clave de CapCut' });
  assert.equal(vault.sent.at(-1).body.text.body, REPLIES.vaultOnly);
  const busy = build({ repository, conversations: fakeConversations({ fail: Object.assign(new Error('respondiendo'), { status: 409 }) }), users: { 'u-camila': camila } });
  assert.equal((await busy.service.processMessage({ messageId: 'e', from: '573001234567', type: 'text', text: 'hola' })).outcome, 'busy');
  assert.equal(busy.sent.at(-1).body.text.body, REPLIES.busy);
  const broken = build({ repository, conversations: fakeConversations({ fail: new Error('ECONNRESET') }), users: { 'u-camila': camila } });
  assert.equal((await broken.service.processMessage({ messageId: 'f', from: '573001234567', type: 'text', text: 'hola' })).outcome, 'failed');
  assert.equal(broken.sent.at(-1).body.text.body, REPLIES.failed);
});

test('una respuesta larga sale en varios mensajes y un día nuevo abre una conversación nueva', async () => {
  const repository = fakeRepository();
  repository.links.set('u-camila', { userId: 'u-camila', waId: '573001234567', conversationId: null, lastMessageAt: null });
  const long = Array.from({ length: 200 }, (_, i) => `${i + 1}. Línea de la respuesta que se repite para alargarla.`).join('\n');
  const conversations = fakeConversations({ answer: long });
  let clock = new Date('2026-10-20T20:00:00Z');
  const { service, sent } = build({ repository, conversations, users: { 'u-camila': camila }, now: () => clock });
  await service.processMessage({ messageId: 'm1', from: '573001234567', type: 'text', text: 'resumen' });
  const texts = sent.filter((row) => row.body.type === 'text').map((row) => row.body.text.body);
  assert.ok(texts.length >= 3);
  assert.equal(texts.join('\n'), long);
  const firstChat = conversations.calls[0].id;
  clock = new Date('2026-10-20T23:30:00Z'); // misma noche en Bogotá (18:30)
  await service.processMessage({ messageId: 'm2', from: '573001234567', type: 'text', text: 'otra' });
  assert.equal(conversations.calls[1].id, firstChat);
  clock = new Date('2026-10-21T12:00:00Z'); // mañana siguiente
  await service.processMessage({ messageId: 'm3', from: '573001234567', type: 'text', text: 'buenos días' });
  assert.notEqual(conversations.calls[2].id, firstChat, 'cada día es un chat, como en la plataforma');
});

test('un aviso sin nada que atender y cada mensaje atendido dejan una línea en el registro, sin el texto', async () => {
  const lines = [];
  const logger = { info: (line) => lines.push(line), warn() {}, error() {} };
  const conversations = fakeConversations();
  const work = [];
  const service = createWhatsAppBridgeService({ repository: fakeRepository(), conversations: () => conversations, db: { user: { findUnique: async () => null } }, env: ENV, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }), logger, scheduleWork: (fn) => work.push(fn) });
  const other = inbound({ phoneNumberId: '999', text: 'texto privado' });
  const raw = Buffer.from(JSON.stringify(other));
  await service.handleWebhook({ rawBody: raw, signature: sign(raw), body: other });
  assert.match(lines[0], /^\[WhatsApp\] Aviso sin mensajes para atender \(número esperado 1319887801213730\): objeto=whatsapp_business_account .*números=999 mensajes=1/);
  const ours = inbound({ text: 'texto privado' });
  const raw2 = Buffer.from(JSON.stringify(ours));
  await service.handleWebhook({ rawBody: raw2, signature: sign(raw2), body: ours });
  while (work.length) await work.shift()();
  assert.equal(lines.at(-1), '[WhatsApp] Mensaje de …4567 (text): unknown.');
  assert.ok(lines.every((line) => !/texto privado|573001234567/.test(line)));
});

test('sin número (solo BSUID): se vincula, se responde por `recipient`, y cuando llega el número se reconoce y se guarda', async () => {
  const { service, sent, repository } = build({ users: { 'u-camila': camila }, random: () => 482913 });
  const bsuid = 'CO.1349120865530274';
  // Lo que pasó el 22 de octubre de 2026: el primer mensaje llega sin número y antes se descartaba.
  assert.equal((await service.processMessage({ messageId: 'b0', from: bsuid, phone: null, userId: bsuid, type: 'text', text: 'hola' })).outcome, 'unknown');
  assert.deepEqual([sent.at(-1).body.recipient, sent.at(-1).body.to], [bsuid, undefined]);
  await service.createLinkCode('u-camila');
  assert.deepEqual(await service.processMessage({ messageId: 'b1', from: bsuid, phone: null, userId: bsuid, profileName: 'Camila', type: 'text', text: 'BRIA 482913' }), { outcome: 'linked', userId: 'u-camila' });
  assert.equal(sent.at(-1).body.recipient, bsuid);
  assert.deepEqual([repository.links.get('u-camila').waId, repository.links.get('u-camila').phone], [bsuid, null]);
  const status = await service.status('u-camila');
  assert.deepEqual([status.linked, status.phone], [true, null], 'sin número no se inventa uno');
  assert.equal((await service.processMessage({ messageId: 'b2', from: bsuid, phone: null, userId: bsuid, type: 'text', text: '¿Qué tengo hoy?' })).outcome, 'answered');
  assert.equal(sent.at(-1).body.recipient, bsuid);
  // Después de hablar, Meta empieza a mandar el número: el vínculo se reconoce, se guarda el número y se responde por él.
  assert.equal((await service.processMessage({ messageId: 'b3', from: bsuid, phone: '573001234567', userId: bsuid, type: 'text', text: 'gracias' })).outcome, 'answered');
  assert.equal(repository.links.get('u-camila').phone, '573001234567');
  assert.deepEqual([sent.at(-1).body.to, sent.at(-1).body.recipient], ['573001234567', undefined]);
  assert.equal((await service.status('u-camila')).phone, '+57 300 123 4567');
});

test('un vínculo antiguo hecho por número se reconoce cuando el aviso trae BSUID y número', async () => {
  const repository = fakeRepository();
  repository.links.set('u-camila', { userId: 'u-camila', waId: '573001234567', phone: null, conversationId: null });
  const { service } = build({ repository, users: { 'u-camila': camila } });
  assert.equal((await service.processMessage({ messageId: 'c1', from: 'CO.1349120865530274', phone: '573001234567', userId: 'CO.1349120865530274', type: 'text', text: 'hola' })).outcome, 'answered');
});

test('los mensajes de otro número de la misma cuenta se dejan pasar, y sin token configurado el aviso se acepta sin trabajar', async () => {
  const { service, conversations, drain } = build();
  const other = inbound({ phoneNumberId: '999' });
  const raw = Buffer.from(JSON.stringify(other));
  assert.deepEqual((await service.handleWebhook({ rawBody: raw, signature: sign(raw), body: other })).body, { accepted: true, messages: 0 });
  await drain();
  assert.equal(conversations.calls.length, 0);
  const half = build({ env: { ...ENV, META_WHATSAPP_TOKEN: '' } });
  const body = inbound(); const raw2 = Buffer.from(JSON.stringify(body));
  assert.deepEqual((await half.service.handleWebhook({ rawBody: raw2, signature: sign(raw2), body })).body, { accepted: true, ignored: 1 });
  await assert.rejects(half.service.createLinkCode('u-camila'), /todavía no está configurada/);
});

async function serve(service) {
  const app = express();
  app.use(express.json({ verify: (req, _res, buffer) => { if (req.originalUrl.startsWith('/api/whatsapp/webhook')) req.rawBody = buffer; } }));
  app.use('/api/whatsapp', createWhatsAppWebhookRouter({ service }));
  app.use((req, _res, next) => { if (req.headers['x-user']) req.user = { userId: req.headers['x-user'], role: 'PROJECT_MANAGER', modulePermissions: { bria: req.headers['x-bria'] !== 'no' } }; next(); });
  app.use('/api/bria/whatsapp', createBriaWhatsAppRouter({ service }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  return { base, close: async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); } };
}

test('las rutas: la verificación de Meta, el aviso firmado sobre los bytes originales, y el vínculo solo con sesión y Bria', async () => {
  const { service, repository } = build({ users: { 'u-camila': camila }, random: () => 482913 });
  const { base, close } = await serve(service);
  try {
    const verify = await fetch(`${base}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verificacion&hub.challenge=1158201444`);
    assert.equal(verify.status, 200);
    assert.equal(await verify.text(), '1158201444');
    assert.equal((await fetch(`${base}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=1`)).status, 403);
    const body = JSON.stringify(inbound());
    const forged = await fetch(`${base}/whatsapp/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(Buffer.from(body), 'otro') }, body });
    assert.equal(forged.status, 401);
    const signed = await fetch(`${base}/whatsapp/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': sign(Buffer.from(body)) }, body });
    assert.equal(signed.status, 200);
    assert.equal((await fetch(`${base}/bria/whatsapp`)).status, 401);
    assert.equal((await fetch(`${base}/bria/whatsapp`, { headers: { 'x-user': 'u-camila', 'x-bria': 'no' } })).status, 403);
    const status = await fetch(`${base}/bria/whatsapp`, { headers: { 'x-user': 'u-camila' } });
    assert.equal(status.status, 200);
    assert.equal(status.headers.get('cache-control'), 'no-store');
    assert.equal((await status.json()).linked, false);
    const code = await fetch(`${base}/bria/whatsapp/link-code`, { method: 'POST', headers: { 'x-user': 'u-camila' } });
    assert.equal(code.status, 200);
    assert.equal((await code.json()).message, 'BRIA 482913');
    assert.ok(repository.codes.has('482913'));
    repository.links.set('u-camila', { userId: 'u-camila', waId: '573001234567' });
    assert.deepEqual(await (await fetch(`${base}/bria/whatsapp`, { method: 'DELETE', headers: { 'x-user': 'u-camila' } })).json(), { linked: false });
    assert.equal(repository.links.has('u-camila'), false);
  } finally { await close(); }
});
