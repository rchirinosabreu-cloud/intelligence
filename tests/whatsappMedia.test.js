import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInboundMessages, typingPayload, isMetaMediaUrl, mediaFileName, isCompressedByWhatsApp, REPLIES } from '../src/lib/whatsappBridge.js';
import { createWhatsAppBridgeService } from '../src/services/whatsappBridgeService.js';

// Fotos, documentos y notas de voz por WhatsApp (Rodny, 22 de octubre de 2026: «que incluso la contadora pueda enviar
// una imagen por WhatsApp y decir: registra este movimiento … sí, también por audio enviar, todo»).

const notice = (message) => ({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1' }, contacts: [{ wa_id: '573001234567', user_id: 'CO.1349' }], messages: [{ from: '573001234567', from_user_id: 'CO.1349', id: 'wamid.m', timestamp: '1', ...message }] } }] }] });

test('una foto, un documento y una nota de voz llegan con su archivo; el texto de la foto es lo que se escribió debajo', () => {
  const [photo] = parseInboundMessages(notice({ type: 'image', image: { id: 'img1', mime_type: 'image/jpeg', caption: 'Registra este movimiento' } }));
  assert.deepEqual(photo.media, { kind: 'image', id: 'img1', mimeType: 'image/jpeg', filename: null });
  assert.equal(photo.text, 'Registra este movimiento');
  const [pdf] = parseInboundMessages(notice({ type: 'document', document: { id: 'doc1', mime_type: 'application/pdf', filename: 'factura-0393.pdf' } }));
  assert.deepEqual([pdf.media.kind, pdf.media.filename, pdf.text], ['document', 'factura-0393.pdf', null]);
  const [voice] = parseInboundMessages(notice({ type: 'audio', audio: { id: 'aud1', mime_type: 'audio/ogg; codecs=opus', voice: true } }));
  assert.deepEqual([voice.media.kind, voice.media.mimeType, voice.text], ['audio', 'audio/ogg; codecs=opus', null]);
  const [sticker] = parseInboundMessages(notice({ type: 'sticker', sticker: { id: 's1', mime_type: 'image/webp' } }));
  assert.equal(sticker.media, null, 'un sticker no es un archivo de trabajo');
});

test('solo se descarga de los servidores de Meta, y el archivo lleva un nombre con su extensión', () => {
  assert.equal(isMetaMediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1'), true);
  for (const url of ['http://lookaside.fbsbx.com/x', 'https://evil.example/x', 'https://fbsbx.com.evil.example/x', 'file:///etc/passwd', '']) assert.equal(isMetaMediaUrl(url), false, url);
  assert.equal(mediaFileName({ kind: 'image', mimeType: 'image/jpeg' }, 'wamid.ABC'), 'foto-whatsapp-ABC.jpg');
  assert.equal(mediaFileName({ kind: 'image', mimeType: 'image/png' }, 'wamid.ABC'), 'foto-whatsapp-ABC.png');
  assert.equal(mediaFileName({ kind: 'document', mimeType: 'application/pdf', filename: 'factura.pdf' }, 'wamid.ABC'), 'factura.pdf');
  assert.equal(mediaFileName({ kind: 'audio', mimeType: 'audio/ogg; codecs=opus' }, 'wamid.ABC'), 'nota-de-voz-ABC.ogg');
});

test('mientras Bria piensa, el mensaje queda leído y se ve «escribiendo…»', () => {
  assert.deepEqual(typingPayload('wamid.1'), { messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.1', typing_indicator: { type: 'text' } });
});

const ENV = { META_APP_SECRET: 's', META_WHATSAPP_TOKEN: 't', META_WHATSAPP_PHONE_NUMBER_ID: '1', META_WHATSAPP_NUMBER: '+573043786298' };
const camila = { id: 'u-camila', name: 'Camila Pérez', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true }, sessionVersion: 1, teamMember: { isActive: true } };
const repository = () => {
  const link = { userId: 'u-camila', waId: 'CO.1349', phone: '573001234567', conversationId: null, alertsOff: [] };
  return { link, async rememberInbound() { return true; }, async linkByWaId() { return link; }, async setPhone() {}, async markInbound() {}, async setConversation(_u, id) { link.conversationId = id; }, async touch() {} };
};
const build = ({ media = {}, transcript = 'Registra el pago de Canva de ayer', fileSize = 1000, url = 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1' } = {}) => {
  const sent = [], fetched = [], sends = [], transcribed = [];
  const fetchImpl = async (target, options = {}) => {
    fetched.push([target, options.method || 'GET', options.headers?.Authorization]);
    if (String(target).includes('/media1')) return { ok: true, status: 200, json: async () => ({ url, mime_type: media.mimeType || 'image/jpeg', file_size: String(fileSize), id: 'media1' }) };
    if (String(target).startsWith('https://lookaside')) return { ok: true, status: 200, headers: { get: () => media.mimeType || 'image/jpeg' }, arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer };
    sent.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'out' }] }) };
  };
  const conversations = {
    async create() { return { id: 'c1', turns: [] }; },
    async read() { return { id: 'c1', turns: [] }; },
    async transcribe(user, file) { transcribed.push([user.userId, file.mimetype, file.originalname, file.buffer.length]); return { text: transcript }; },
    async send(input) { sends.push(input); return { id: 'c1', turns: [{ role: 'assistant', text: 'Listo.' }] }; }
  };
  const service = createWhatsAppBridgeService({ repository: repository(), conversations: () => conversations, db: { user: { findUnique: async () => camila } }, env: ENV, fetchImpl, logger: { warn() {}, error() {}, info() {} }, scheduleWork: () => {}, signSession: () => 'sesion' });
  return { service, sent, fetched, sends, transcribed };
};

test('una foto de un comprobante llega a Bria como archivo, con lo que se escribió debajo', async () => {
  const { service, sends, fetched, sent } = build();
  const result = await service.processMessage({ messageId: 'wamid.ABC', from: 'CO.1349', phone: '573001234567', type: 'image', text: 'Registra este movimiento', media: { kind: 'image', id: 'media1', mimeType: 'image/jpeg', filename: null } });
  assert.equal(result.outcome, 'answered');
  const info = fetched.find(([target]) => /\/media1\?/.test(target));
  assert.equal(info[2], 'Bearer t', 'el token va en la cabecera');
  assert.match(info[0], /\/media1\?phone_number_id=1$/);
  assert.ok(fetched.findIndex(([target]) => /\/messages$/.test(target)) < fetched.indexOf(info), 'el «escribiendo…» sale antes de descargar');
  assert.equal(sends[0].question, 'Registra este movimiento');
  assert.deepEqual(sends[0].files.map((f) => [f.originalname, f.mimetype, f.size]), [['foto-whatsapp-ABC.jpg', 'image/jpeg', 4]]);
  assert.deepEqual(sent[0].typing_indicator, { type: 'text' }, 'primero «escribiendo…»');
});

test('una nota de voz se transcribe y Bria responde a lo que se dijo', async () => {
  const { service, sends, transcribed } = build({ media: { mimeType: 'audio/ogg; codecs=opus' } });
  await service.processMessage({ messageId: 'wamid.V', from: 'CO.1349', type: 'audio', text: null, media: { kind: 'audio', id: 'media1', mimeType: 'audio/ogg; codecs=opus' } });
  assert.deepEqual(transcribed, [['u-camila', 'audio/ogg; codecs=opus', 'nota-de-voz-V.ogg', 4]]);
  assert.equal(sends[0].question, 'Registra el pago de Canva de ayer');
  assert.deepEqual(sends[0].files, []);
});

test('la foto y enseguida «regístralo» son una sola conversación: Bria responde una vez, con el archivo y el texto', async () => {
  const sent = [], sends = [], work = [], seen = new Set();
  const fetchImpl = async (target, options = {}) => {
    if (String(target).includes('/media1')) return { ok: true, status: 200, json: async () => ({ url: 'https://lookaside.fbsbx.com/x', mime_type: 'image/jpeg', file_size: '10' }) };
    if (String(target).startsWith('https://lookaside')) return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([9, 9]).buffer };
    sent.push(JSON.parse(options.body));
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const repo = { ...repository(), async rememberInbound(id) { if (seen.has(id)) return false; seen.add(id); return true; } };
  const conversations = { async create() { return { id: 'c1', turns: [] }; }, async read() { return { id: 'c1', turns: [] }; }, async send(input) { sends.push(input); return { id: 'c1', turns: [{ role: 'assistant', text: 'Listo.' }] }; } };
  const service = createWhatsAppBridgeService({ repository: repo, conversations: () => conversations, db: { user: { findUnique: async () => camila } }, env: { ...ENV, META_APP_SECRET: 's' }, fetchImpl, logger: { warn() {}, error() {}, info() {} }, scheduleWork: (fn) => work.push(fn), signSession: () => 'x', batchWindowMs: 0 });
  const crypto = await import('node:crypto');
  const deliver = async (body) => { const raw = Buffer.from(JSON.stringify(body)); await service.handleWebhook({ rawBody: raw, signature: `sha256=${crypto.createHmac('sha256', 's').update(raw).digest('hex')}`, body }); };
  await deliver(notice({ id: 'wamid.photo', type: 'image', image: { id: 'media1', mime_type: 'image/jpeg' } }));
  await deliver({ ...notice({ type: 'text', text: { body: 'Regístralo, es el pago de Canva' } }), entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1' }, contacts: [{ wa_id: '573001234567', user_id: 'CO.1349' }], messages: [{ from: '573001234567', from_user_id: 'CO.1349', id: 'wamid.text', timestamp: '2', type: 'text', text: { body: 'Regístralo, es el pago de Canva' } }] } }] }] });
  assert.equal(work.length, 1, 'el segundo mensaje se sumó al primero');
  while (work.length) await work.shift()();
  assert.equal(sends.length, 1);
  assert.equal(sends[0].question, 'Regístralo, es el pago de Canva');
  assert.equal(sends[0].files.length, 1);
  await deliver(notice({ id: 'wamid.photo', type: 'image', image: { id: 'media1', mime_type: 'image/jpeg' } }));
  while (work.length) await work.shift()();
  assert.equal(sends.length, 1, 'un aviso repetido de Meta no se responde otra vez');
});

test('un archivo demasiado grande, fuera de Meta o que no se descarga se dice; nunca se pierde en silencio', async () => {
  const big = build({ fileSize: 30 * 1024 * 1024 });
  assert.equal((await big.service.processMessage({ messageId: 'wamid.B', from: 'CO.1349', type: 'image', text: null, media: { kind: 'image', id: 'media1', mimeType: 'image/jpeg' } })).outcome, 'media-too-big');
  assert.equal(big.sent.at(-1).text.body, REPLIES.mediaTooBig);
  const outside = build({ url: 'https://evil.example/x' });
  assert.equal((await outside.service.processMessage({ messageId: 'wamid.E', from: 'CO.1349', type: 'image', text: null, media: { kind: 'image', id: 'media1', mimeType: 'image/jpeg' } })).outcome, 'media-failed');
  assert.equal(outside.sent.at(-1).text.body, REPLIES.mediaFailed);
  const sticker = build();
  assert.equal((await sticker.service.processMessage({ messageId: 'wamid.X', from: 'CO.1349', type: 'sticker', text: null, media: null })).outcome, 'only-text');
  assert.equal(sticker.sent.at(-1).text.body, REPLIES.onlyText);
});

test('un video llega al chat como archivo, con su nombre, para subirlo como pieza final', async () => {
  const [message] = parseInboundMessages(notice({ id: 'wamid.HBgVIDEO123456', type: 'video', video: { id: 'media9', mime_type: 'video/mp4', caption: 'Súbelo al reel de Aristea' } }));
  assert.deepEqual(message.media, { kind: 'video', id: 'media9', mimeType: 'video/mp4', filename: null });
  assert.equal(message.text, 'Súbelo al reel de Aristea');
  assert.equal(mediaFileName(message.media, 'wamid.HBgVIDEO123456'), 'video-whatsapp-gVIDEO123456.mp4');
  assert.equal(isCompressedByWhatsApp('video-whatsapp-VIDEO123456.mp4'), true);
  assert.equal(isCompressedByWhatsApp('foto-whatsapp-ABC.jpg'), true);
  assert.equal(isCompressedByWhatsApp('Reel final.mp4'), false, 'un documento llega como se envió');
});
