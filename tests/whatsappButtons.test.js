import test from 'node:test';
import assert from 'node:assert/strict';
import {
  replyForWhatsApp, optionsMessagePayload, textWithOptions, parseInboundMessages, answerForWhatsApp, REPLIES,
  OPTIONS_FOOTER, OPTIONS_LIST_BUTTON
} from '../src/lib/whatsappBridge.js';
import {
  ALERT_KINDS, isWindowOpen, alertsEnabled, withinAlertHours, alertReplyId, parseAlertReplyId, alertOptions,
  templateMessagePayload, ALERT_TEMPLATE, ALERT_TEMPLATE_BODY, pulseAlert, accessAlert, dailyAlert
} from '../src/lib/whatsappAlerts.js';

// Botones y avisos de Bria en WhatsApp (Rodny, 22 de octubre de 2026: «bria no podría también darme las opciones tipo
// botones?» · «si hay botones, uno puede responder dándole al botón o respondiendo naturalmente»).

test('las opciones de Bria salen como botones con su texto completo en el identificador', () => {
  const reply = replyForWhatsApp({ text: 'Así quedaría el **pendiente**.', quickReplies: ['Crear pendiente', 'Cancelar pendiente', 'Crear pendiente'] });
  assert.equal(reply.text, 'Así quedaría el *pendiente*.');
  assert.deepEqual(reply.options, [{ id: 'q:Crear pendiente', label: 'Crear pendiente' }, { id: 'q:Cancelar pendiente', label: 'Cancelar pendiente' }], 'sin repetir');
  const payload = optionsMessagePayload('573001234567', reply.text, reply.options);
  assert.equal(payload.to, '573001234567');
  assert.equal(payload.type, 'interactive');
  assert.equal(payload.interactive.type, 'button');
  assert.equal(payload.interactive.footer.text, OPTIONS_FOOTER, 'el pie recuerda que también puede escribir');
  assert.deepEqual(payload.interactive.action.buttons, [
    { type: 'reply', reply: { id: 'q:Crear pendiente', title: 'Crear pendiente' } },
    { type: 'reply', reply: { id: 'q:Cancelar pendiente', title: 'Cancelar pendiente' } }
  ]);
  assert.deepEqual(replyForWhatsApp({ text: 'Clave', accessCards: [{ id: 'c' }], quickReplies: ['Ver'] }), { text: REPLIES.vaultOnly, options: [] }, 'la bóveda nunca sale, tampoco en un botón');
  assert.deepEqual(replyForWhatsApp(null), { text: REPLIES.failed, options: [] });
});

test('más de tres opciones, o una que no cabe en un botón, van en una lista; más de diez quedan en texto', () => {
  const five = ['Camila', 'Melissa', 'Helen', 'Kamila', 'Jarlan'].map((label) => ({ id: `q:${label}`, label }));
  const list = optionsMessagePayload('573001234567', '¿A quién se lo asignamos?', five);
  assert.equal(list.interactive.type, 'list');
  assert.equal(list.interactive.action.button, OPTIONS_LIST_BUTTON);
  assert.deepEqual(list.interactive.action.sections[0].rows.map((row) => row.title), ['Camila', 'Melissa', 'Helen', 'Kamila', 'Jarlan']);
  const long = [{ id: 'q:Despachar a producción', label: 'Despachar a producción' }, { id: 'q:Cancelar despacho', label: 'Cancelar despacho' }];
  const asList = optionsMessagePayload('573001234567', '¿Lo despacho?', long);
  assert.equal(asList.interactive.type, 'list', 'un botón cortado se leería mal');
  const named = [{ id: 'q:x', label: 'Que Bria me resuma lo que tiene pendiente hoy' }, { id: 'q:y', label: 'Ver' }];
  const row = optionsMessagePayload('573001234567', 'Hola', named).interactive.action.sections[0].rows[0];
  // Cortado en palabra completa y sin «…» (23 de octubre de 2026: «Que Bria me resuma lo q…»).
  assert.equal(row.title, 'Que Bria me resuma lo');
  assert.equal(row.description, 'Que Bria me resuma lo que tiene pendiente hoy', 'lo que no cabe en el título va completo debajo');
  const eleven = Array.from({ length: 11 }, (_, i) => ({ id: `q:${i}`, label: `Opción ${i}` }));
  assert.equal(optionsMessagePayload('573001234567', 'Elige', eleven), null);
  assert.equal(optionsMessagePayload('573001234567', 'x'.repeat(1025), five), null, 'el cuerpo de un mensaje con botones admite 1.024 caracteres');
  assert.deepEqual(optionsMessagePayload('CO.1349', 'Hola', five).recipient, 'CO.1349', 'sin número se responde por BSUID');
});

test('si los botones no salen, el texto lista las opciones como antes', () => {
  assert.equal(textWithOptions({ text: '¿Lo elimino?', options: [{ id: 'q:Eliminar pendiente', label: 'Eliminar pendiente' }, { id: 'q:No eliminar', label: 'No eliminar' }] }), '¿Lo elimino?\n\nRespóndeme con un sí, o dime qué cambiar.');
  assert.equal(textWithOptions({ text: '¿Para cuándo?', options: ['Hoy', 'Mañana'].map((label) => ({ id: `q:${label}`, label })) }), '¿Para cuándo?\n\nPuedes responder: «Hoy» o «Mañana».');
  assert.equal(answerForWhatsApp({ text: '¿Para cuándo?', quickReplies: ['Hoy', 'Mañana'] }), '¿Para cuándo?\n\nPuedes responder: «Hoy» o «Mañana».');
});

const interactive = (interactiveBody, type = 'interactive') => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: '1' }, contacts: [{ wa_id: '573001234567', user_id: 'CO.1349' }], messages: [{ from: '573001234567', from_user_id: 'CO.1349', id: 'wamid.b', timestamp: '1', type, ...interactiveBody }] } }] }]
});

test('tocar un botón llega como si la persona lo hubiera escrito, con el texto completo y no el recortado', () => {
  const [button] = parseInboundMessages(interactive({ interactive: { type: 'button_reply', button_reply: { id: 'q:Crear pendiente', title: 'Crear pendiente' } } }));
  assert.deepEqual([button.text, button.replyId], ['Crear pendiente', 'q:Crear pendiente']);
  const [row] = parseInboundMessages(interactive({ interactive: { type: 'list_reply', list_reply: { id: 'q:Que Bria me resuma lo que tiene pendiente hoy', title: 'Que Bria me resuma lo q…' } } }));
  assert.equal(row.text, 'Que Bria me resuma lo que tiene pendiente hoy');
  const [alert] = parseInboundMessages(interactive({ interactive: { type: 'button_reply', button_reply: { id: 'a:5b8f:1', title: 'Denegar' } } }));
  assert.deepEqual([alert.text, alert.replyId], ['Denegar', 'a:5b8f:1']);
  const [template] = parseInboundMessages(interactive({ button: { text: 'Ver aviso', payload: 'a:5b8f:open' } }, 'button'));
  assert.deepEqual([template.text, template.replyId], ['Ver aviso', 'a:5b8f:open']);
});

test('la ventana de 24 horas, las preferencias y el horario de los pedidos de acceso', () => {
  const at = new Date('2026-10-22T20:00:00Z');
  assert.equal(isWindowOpen(new Date('2026-10-22T08:00:00Z'), at), true);
  assert.equal(isWindowOpen(new Date('2026-10-21T20:10:00Z'), at), false, 'a menos de un cuarto de hora del cierre ya no se arriesga');
  assert.equal(isWindowOpen(null, at), false);
  assert.deepEqual(ALERT_KINDS, ['ACCESS', 'DAILY', 'PULSE']);
  assert.equal(alertsEnabled([], 'PULSE'), true, 'vienen encendidos');
  assert.equal(alertsEnabled(['PULSE'], 'PULSE'), false);
  assert.equal(withinAlertHours('ACCESS', new Date('2026-10-22T12:00:00Z')), true, '7:00 de Bogotá');
  assert.equal(withinAlertHours('ACCESS', new Date('2026-10-23T03:00:00Z')), false, '22:00 de Bogotá');
  assert.equal(withinAlertHours('DAILY', new Date('2026-10-23T03:00:00Z')), true, 'la mañana y el cierre ya tienen su hora');
});

test('los botones de un aviso apuntan al aviso guardado, y la plantilla lo abre', () => {
  assert.equal(alertReplyId('5b8f', 0), 'a:5b8f:0');
  assert.deepEqual(parseAlertReplyId('a:5b8f:1'), { alertId: '5b8f', index: 1 });
  assert.deepEqual(parseAlertReplyId('a:5b8f:open'), { alertId: '5b8f', index: 'open' });
  assert.equal(parseAlertReplyId('q:Hola'), null);
  assert.deepEqual(alertOptions({ id: '5b8f', buttons: [{ label: 'Compartir', act: 'VAULT_APPROVE', ref: 'r1' }, { label: 'Denegar', act: 'VAULT_DENY', ref: 'r1' }] }), [{ id: 'a:5b8f:0', label: 'Compartir' }, { id: 'a:5b8f:1', label: 'Denegar' }]);
  const payload = templateMessagePayload('573001234567', { params: ['Rodny', 'un pedido de acceso'], payload: 'a:5b8f:open' });
  assert.equal(payload.type, 'template');
  assert.deepEqual([payload.template.name, payload.template.language.code], [ALERT_TEMPLATE.name, ALERT_TEMPLATE.language]);
  assert.deepEqual(payload.template.components, [
    { type: 'body', parameters: [{ type: 'text', text: 'Rodny' }, { type: 'text', text: 'un pedido de acceso' }] },
    { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'payload', payload: 'a:5b8f:open' }] }
  ]);
  assert.doesNotMatch(ALERT_TEMPLATE_BODY, /^\{\{|\}\}\.?$/, 'Meta rechaza una plantilla que empieza o termina con una variable');
});

test('la plantilla que se envía a revisión: utilidad, en español, un ejemplo por variable y el botón «Ver aviso»', async () => {
  const { templateDefinition } = await import('../scripts/whatsapp-alert-template.mjs');
  const definition = templateDefinition();
  assert.deepEqual([definition.name, definition.language, definition.category], ['bria_aviso', 'es', 'UTILITY']);
  const body = definition.components.find((row) => row.type === 'BODY');
  assert.equal(body.example.body_text[0].length, (body.text.match(/\{\{\d\}\}/g) || []).length);
  assert.deepEqual(definition.components.find((row) => row.type === 'BUTTONS').buttons, [{ type: 'QUICK_REPLY', text: 'Ver aviso' }]);
});

test('un aviso del pulso: el hecho, el enlace y lo que se le puede pedir a Bria; siempre se puede ocultar por hoy', () => {
  const alert = pulseAlert({ id: 'p1', title: 'Melissa sin nada en proceso', body: 'Desde las 10:05 no arranca nada.', actions: [{ label: 'Ver sus pendientes', to: '/gestion?responsable=Melissa' }, { label: 'Que Bria me resuma lo que tiene', ask: 'Resúmeme qué tiene pendiente Melissa hoy.' }] }, { origin: 'https://labs.brainstudioagencia.com' });
  assert.equal(alert.kind, 'PULSE');
  assert.equal(alert.sourceRef, 'pulse:p1');
  assert.equal(alert.text, '*Melissa sin nada en proceso*\nDesde las 10:05 no arranca nada.\n\nVer sus pendientes: https://labs.brainstudioagencia.com/gestion?responsable=Melissa');
  assert.deepEqual(alert.buttons, [{ label: 'Que Bria me resuma lo que tiene', ask: 'Resúmeme qué tiene pendiente Melissa hoy.' }, { label: 'Ocultar por hoy', act: 'PULSE_DISMISS', ref: 'p1' }]);
  assert.match(alert.topic, /trabajo de hoy/);
});

test('un pedido de acceso trae sus dos decisiones; la mañana y el cierre van enteros', () => {
  const vault = accessAlert({ type: 'VAULT', request: { id: 'r1' }, text: 'Camila necesita la contraseña de CapCut.' });
  assert.deepEqual([vault.kind, vault.sourceRef, vault.text], ['ACCESS', 'vault:r1', 'Camila necesita la contraseña de CapCut.']);
  assert.deepEqual(vault.buttons, [{ label: 'Compartir', act: 'VAULT_APPROVE', ref: 'r1' }, { label: 'Denegar', act: 'VAULT_DENY', ref: 'r1' }]);
  const module = accessAlert({ type: 'MODULE', request: { id: 'm1' }, text: 'Camila necesita acceso a Financiero.' });
  assert.deepEqual(module.buttons.map((b) => b.act), ['MODULE_APPROVE', 'MODULE_DENY']);
  const close = dailyAlert({ note: 'CIERRE_DIA', dayKey: '2026-10-22', text: '## Tu día\n\n- Cerraste **3**' });
  assert.deepEqual([close.kind, close.sourceRef, close.text, close.buttons], ['DAILY', 'CIERRE_DIA:2026-10-22', '*Tu día*\n\n• Cerraste *3*', []]);
  assert.match(close.topic, /cierre del día/);
  assert.match(dailyAlert({ note: 'LECTURA_MANANA', dayKey: '2026-10-22', text: 'x' }).topic, /lectura de la mañana/);
});
test('las opciones con contexto se vinculan a la conversación, su revisión y la posición de la opción', () => {
  const turn = { text: 'Resumen para confirmar.', quickReplies: ['Confirmar', 'Cancelar', 'Confirmar'] };
  const reply = replyForWhatsApp(turn, { conversationId: 'chat-a', revision: 4 });
  assert.deepEqual(reply.options, [{ id: 'c:chat-a:4:0', label: 'Confirmar' }, { id: 'c:chat-a:4:1', label: 'Cancelar' }]);
  assert.notEqual(reply.options[0].id, replyForWhatsApp(turn, { conversationId: 'chat-b', revision: 4 }).options[0].id);
  assert.notEqual(reply.options[0].id, replyForWhatsApp(turn, { conversationId: 'chat-a', revision: 5 }).options[0].id);
});
