import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  verifyMetaSignature, webhookChallenge, parseInboundMessages, describeNotice, maskWaId, normalizeBsuid, linkCodeIn, generateLinkCode, linkMessage,
  displayPhone, waMeLink, toWhatsAppText, splitForWhatsApp, answerForWhatsApp, textMessagePayload, readReceiptPayload,
  REPLIES, WHATSAPP_TEXT_MAX, LINK_CODE_TTL_MS
} from '../src/lib/whatsappBridge.js';

// Bria en WhatsApp (Rodny, 20 de octubre de 2026): el número de la agencia habla con el equipo por la API oficial
// de Meta. La regla pura vive en src/lib/whatsappBridge.js y la leen el webhook, el servicio y la pantalla.

const SECRET = 'secreto-de-la-app-de-prueba';
const sign = (raw) => `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`;

const inbound = ({ from = '573001234567', id = 'wamid.1', type = 'text', text = 'hola', name = 'Camila' } = {}) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '1061974066819635', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: '573043786298', phone_number_id: '1319887801213730' },
    contacts: [{ profile: { name }, wa_id: from }],
    messages: [{ from, id, timestamp: '1760990400', type, ...(type === 'text' ? { text: { body: text } } : {}), ...(type === 'image' ? { image: { id: 'img' } } : {}) }]
  } }] }]
});

test('la firma de Meta se comprueba sobre los bytes originales, en tiempo constante, y sin secreto no pasa nada', () => {
  const raw = Buffer.from(JSON.stringify(inbound()));
  assert.equal(verifyMetaSignature({ rawBody: raw, signature: sign(raw), appSecret: SECRET }), true);
  assert.equal(verifyMetaSignature({ rawBody: raw, signature: sign(raw).toUpperCase().replace('SHA256=', 'sha256='), appSecret: SECRET }), true, 'mayúsculas en el hex valen');
  assert.equal(verifyMetaSignature({ rawBody: raw, signature: sign(Buffer.from('otro')), appSecret: SECRET }), false);
  assert.equal(verifyMetaSignature({ rawBody: raw, signature: 'sha256=zz', appSecret: SECRET }), false);
  assert.equal(verifyMetaSignature({ rawBody: raw, signature: sign(raw), appSecret: '' }), false);
  assert.equal(verifyMetaSignature({ rawBody: null, signature: sign(raw), appSecret: SECRET }), false);
  assert.equal(verifyMetaSignature({ rawBody: raw, signature: '', appSecret: SECRET }), false);
});

test('la verificación del webhook devuelve el reto solo con el modo y el token correctos', () => {
  const query = { 'hub.mode': 'subscribe', 'hub.verify_token': 'token-de-verificacion', 'hub.challenge': '1158201444' };
  assert.equal(webhookChallenge(query, 'token-de-verificacion'), '1158201444');
  assert.equal(webhookChallenge({ ...query, 'hub.verify_token': 'otro' }, 'token-de-verificacion'), null);
  assert.equal(webhookChallenge({ ...query, 'hub.mode': 'unsubscribe' }, 'token-de-verificacion'), null);
  assert.equal(webhookChallenge(query, ''), null, 'sin token configurado la puerta no abre');
  assert.equal(webhookChallenge({}, 'token-de-verificacion'), null);
});

test('del aviso de Meta se leen solo los mensajes: quién, qué, de qué número; los estados de entrega se ignoran', () => {
  const [message] = parseInboundMessages(inbound({ text: '  ¿Qué tengo hoy?  ' }));
  assert.deepEqual(message, { messageId: 'wamid.1', from: '573001234567', phone: '573001234567', userId: null, profileName: 'Camila', timestamp: 1760990400, type: 'text', text: '¿Qué tengo hoy?', phoneNumberId: '1319887801213730' });
  const [image] = parseInboundMessages(inbound({ type: 'image' }));
  assert.equal(image.type, 'image');
  assert.equal(image.text, null);
  const statuses = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.1', status: 'delivered' }] } }] }] };
  assert.deepEqual(parseInboundMessages(statuses), []);
  assert.deepEqual(parseInboundMessages({ object: 'page', entry: [] }), [], 'un aviso que no es de WhatsApp no trae mensajes');
  assert.deepEqual(parseInboundMessages(null), []);
  const button = inbound(); button.entry[0].changes[0].value.messages[0] = { from: '573001234567', id: 'wamid.2', timestamp: '1', type: 'button', button: { text: 'Crear pendientes', payload: 'x' } };
  assert.equal(parseInboundMessages(button)[0].text, 'Crear pendientes');
});

// 22 de octubre de 2026: el primer mensaje de Rodny llegó sin número (solo con su BSUID, `from_user_id`) y se descartó.
const bsuidOnly = ({ id = 'wamid.b1', text = 'BRIA 482913', withPhone = false } = {}) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '1061974066819635', changes: [{ field: 'messages', value: {
    messaging_product: 'whatsapp',
    metadata: { display_phone_number: '573043786298', phone_number_id: '1319887801213730' },
    contacts: [{ profile: { name: 'Rodny', username: 'rodny' }, user_id: 'CO.1349120865530274', ...(withPhone ? { wa_id: '573001234567' } : {}) }],
    messages: [{ id, timestamp: '1761140000', type: 'text', text: { body: text }, from_user_id: 'CO.1349120865530274', ...(withPhone ? { from: '573001234567' } : {}) }]
  } }] }]
});

test('un mensaje sin número se lee por su BSUID; con número, el BSUID sigue siendo la clave y el número va aparte', () => {
  assert.deepEqual(parseInboundMessages(bsuidOnly())[0], { messageId: 'wamid.b1', from: 'CO.1349120865530274', phone: null, userId: 'CO.1349120865530274', profileName: 'Rodny', timestamp: 1761140000, type: 'text', text: 'BRIA 482913', phoneNumberId: '1319887801213730' });
  const both = parseInboundMessages(bsuidOnly({ withPhone: true }))[0];
  assert.deepEqual([both.from, both.phone, both.userId], ['CO.1349120865530274', '573001234567', 'CO.1349120865530274']);
  const contactOnly = bsuidOnly(); delete contactOnly.entry[0].changes[0].value.messages[0].from_user_id;
  assert.equal(parseInboundMessages(contactOnly)[0].from, 'CO.1349120865530274', 'si falta en el mensaje, se toma del contacto');
  const garbage = bsuidOnly(); garbage.entry[0].changes[0].value.messages[0].from_user_id = 'no es un bsuid'; garbage.entry[0].changes[0].value.contacts = [];
  assert.deepEqual(parseInboundMessages(garbage), [], 'sin número ni BSUID válido no hay a quién responder');
  assert.equal(normalizeBsuid('US.ENT.11815799212886844830'), 'US.ENT.11815799212886844830');
  assert.equal(normalizeBsuid('573001234567'), null);
  assert.equal(maskWaId('CO.1349120865530274'), 'CO.…0274');
  assert.equal(displayPhone('CO.1349120865530274'), '', 'un BSUID no se muestra como número');
});

test('se responde por número si se conoce y por BSUID en `recipient` si no; nunca los dos', () => {
  assert.deepEqual(textMessagePayload('CO.1349120865530274', 'Hola'), { messaging_product: 'whatsapp', recipient_type: 'individual', recipient: 'CO.1349120865530274', type: 'text', text: { preview_url: false, body: 'Hola' } });
  assert.equal(textMessagePayload('573001234567', 'Hola').to, '573001234567');
  assert.equal(textMessagePayload('573001234567', 'Hola').recipient, undefined);
});

test('la forma de un aviso para el registro: objeto, campos, números y cuántos, nunca el texto ni quién escribe', () => {
  const summary = describeNotice(inbound({ text: 'mi secreto', name: 'Camila' }));
  assert.equal(summary, 'objeto=whatsapp_business_account entradas=1 campos=messages números=1319887801213730 mensajes=1 estados=0 errores=0');
  assert.doesNotMatch(summary, /secreto|Camila|573001234567/);
  const statuses = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '9' }, statuses: [{ id: 'w', status: 'failed' }] } }] }] };
  assert.equal(describeNotice(statuses), 'objeto=whatsapp_business_account entradas=1 campos=messages números=9 mensajes=0 estados=1 errores=0');
  assert.equal(describeNotice(null), 'objeto=ninguno entradas=0 campos=ninguno números=ninguno mensajes=0 estados=0 errores=0');
  assert.equal(maskWaId('573001234567'), '…4567');
  assert.equal(maskWaId(''), '…');
});

test('el código de vínculo son seis dígitos, se reconoce con o sin la palabra Bria y nunca dentro de otra cifra', () => {
  assert.match(generateLinkCode(), /^\d{6}$/);
  assert.equal(generateLinkCode(() => 42), '000042');
  assert.equal(linkCodeIn('BRIA 482913'), '482913');
  assert.equal(linkCodeIn('bria-482913'), '482913');
  assert.equal(linkCodeIn('482913'), '482913');
  assert.equal(linkCodeIn('Hola Bria, mi código es BRIA 482913 gracias'), '482913');
  assert.equal(linkCodeIn('mi cédula es 1234567890'), null);
  assert.equal(linkCodeIn('¿Qué tengo hoy?'), null);
  assert.equal(linkCodeIn(''), null);
  assert.equal(linkMessage('482913'), 'BRIA 482913');
  assert.equal(LINK_CODE_TTL_MS, 10 * 60 * 1000);
});

test('el número se muestra como lo escribe una persona y el enlace wa.me lleva el mensaje listo', () => {
  assert.equal(displayPhone('573043786298'), '+57 304 378 6298');
  assert.equal(displayPhone('+57 304 378 6298'), '+57 304 378 6298');
  assert.equal(displayPhone('14155552671'), '+14155552671');
  assert.equal(displayPhone(''), '');
  assert.equal(waMeLink('+57 304 378 6298', 'BRIA 482913'), 'https://wa.me/573043786298?text=BRIA%20482913');
});

test('el Markdown de Bria se traduce a lo que WhatsApp sabe pintar', () => {
  const md = '## Hoy\n\n**Tres** pendientes:\n- Reel de *Aristea*\n- Informe [Pablo Hoff](https://labs.brainstudioagencia.com/gestion?taskId=1)\n\n1. Primero\n2. Segundo\n\n> cita\n\n\n\nFin.';
  assert.equal(toWhatsAppText(md), '*Hoy*\n\n*Tres* pendientes:\n• Reel de *Aristea*\n• Informe Pablo Hoff: https://labs.brainstudioagencia.com/gestion?taskId=1\n\n1. Primero\n2. Segundo\n\ncita\n\nFin.');
  assert.equal(toWhatsAppText(''), '');
});

test('una respuesta larga se parte en mensajes de hasta 4.000 caracteres por párrafo, nunca a mitad de palabra', () => {
  const paragraph = 'Una línea de la respuesta de Bria que se repite. ';
  const long = Array.from({ length: 120 }, (_, i) => `${i + 1}. ${paragraph.repeat(2).trim()}`).join('\n\n');
  const parts = splitForWhatsApp(long);
  assert.ok(parts.length >= 3);
  for (const part of parts) { assert.ok(part.length <= WHATSAPP_TEXT_MAX); assert.doesNotMatch(part, /^\s|\s$/); }
  assert.equal(parts.join('\n\n'), long, 'nada se pierde ni se duplica');
  assert.deepEqual(splitForWhatsApp('corto'), ['corto']);
  assert.deepEqual(splitForWhatsApp('   '), []);
  const word = 'a'.repeat(9000);
  assert.deepEqual(splitForWhatsApp(word).map((p) => p.length), [4000, 4000, 1000], 'una palabra sin espacios se corta a la fuerza');
});

test('la respuesta para WhatsApp: texto traducido, los botones como opciones, y la bóveda nunca sale por aquí', () => {
  assert.equal(answerForWhatsApp({ text: 'Así quedaría el **pendiente**.', quickReplies: ['Crear pendiente', 'Cancelar pendiente'] }), 'Así quedaría el *pendiente*.\n\nRespóndeme con un sí, o dime qué cambiar.');
  assert.equal(answerForWhatsApp({ text: '¿Lo elimino?', quickReplies: ['Eliminar pendiente', 'No eliminar'] }), '¿Lo elimino?\n\nRespóndeme con un sí, o dime qué cambiar.');
  assert.equal(answerForWhatsApp({ text: '¿Para cuándo?', quickReplies: ['Hoy', 'Mañana', 'Pasado mañana'] }), '¿Para cuándo?\n\nPuedes responder: «Hoy», «Mañana» o «Pasado mañana».', 'las opciones de una pregunta se siguen listando');
  assert.equal(answerForWhatsApp({ text: 'Aquí está la clave.', accessCards: [{ id: 'c1' }] }), REPLIES.vaultOnly);
  assert.equal(answerForWhatsApp({ text: 'Escríbela en el campo protegido.', accessCapture: { id: 'x' } }), REPLIES.vaultOnly);
  assert.equal(answerForWhatsApp({ text: '' }), REPLIES.failed);
  assert.equal(answerForWhatsApp(null), REPLIES.failed);
});

test('lo que se le manda a Meta: texto sin vista previa de enlaces y el visto de leído', () => {
  assert.deepEqual(textMessagePayload('573001234567', 'Hola'), { messaging_product: 'whatsapp', recipient_type: 'individual', to: '573001234567', type: 'text', text: { preview_url: false, body: 'Hola' } });
  assert.deepEqual(readReceiptPayload('wamid.1'), { messaging_product: 'whatsapp', status: 'read', message_id: 'wamid.1' });
});

test('los textos fijos están en español de Latinoamérica y no prometen lo que Bria no hace', () => {
  for (const value of Object.values(REPLIES)) {
    const text = typeof value === 'function' ? value('Camila Pérez') : value;
    assert.doesNotMatch(text, /vosotros|tenéis|podéis|\bos\b/);
    assert.ok(text.length <= 300, text);
  }
  assert.match(REPLIES.linked('Camila Pérez'), /^Listo, Camila\./);
  assert.match(REPLIES.unknown, /solo para el equipo/);
  assert.match(REPLIES.vaultOnly, /nunca por WhatsApp/);
});
