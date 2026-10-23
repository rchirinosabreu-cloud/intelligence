import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createWhatsAppBridgeService } from '../src/services/whatsappBridgeService.js';
import { createWhatsAppLinkRepository } from '../src/services/whatsappLinkRepository.js';
import { createBriaConversationService } from '../src/services/briaConversationService.js';
import { actionReply } from '../src/lib/briaActions.js';
import { dailyAlert } from '../src/lib/whatsappAlerts.js';
import { REPLIES } from '../src/lib/whatsappBridge.js';

// Puente y motor reales; identidad, persistencia, Meta e IA son dobles. No carga .env, no abre red ni base.
const NOW = new Date('2026-10-23T15:00:00Z');
const SOURCE = '86c579ab-b2f3-4b8b-90ba-57e693342dd5';
const USER = { id: 'owner', userId: 'owner', name: 'Dirección', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true }, sessionVersion: 2, teamMember: { isActive: true } };
const NOTE = { role: 'assistant', note: 'LECTURA_MANANA', dayKey: '2026-10-23', text: '1. Revisar la entrega.\n2. Pedir el insumo.' };
const reading = () => dailyAlert({ note: NOTE.note, dayKey: NOTE.dayKey, text: NOTE.text, conversationId: SOURCE });

const setup = ({ conversations, user = USER, failDelivery = () => false } = {}) => {
  const alerts = new Map(), inbound = new Set(), sent = [], calls = [];
  // Devolver una copia importa: así también se detecta un vínculo que solo cambió en memoria, no persistido.
  const link = { userId: USER.id, waId: 'CO.testowner', conversationId: 'active-chat', lastMessageAt: NOW, lastInboundAt: NOW, alertsOff: [] };
  const repository = {
    async linkByUser() { return { ...link }; },
    async linkByWaId() { return { ...link }; },
    async markInbound() {},
    async rememberInbound(id) { if (inbound.has(id)) return false; inbound.add(id); return true; },
    async setConversation(_user, id) { link.conversationId = id; },
    async touch(_user, at) { link.lastMessageAt = at; },
    async alertsSince() { return 0; },
    async saveAlert(input) { const row = { ...input, id: randomUUID(), status: 'PENDING' }; alerts.set(row.id, row); return row; },
    async alertById(id) { return alerts.get(id) || null; },
    async markAlertSent(id, via) { Object.assign(alerts.get(id), { status: 'SENT', via }); },
    async markAlertFailed(id) { alerts.get(id).status = 'FAILED'; },
    async markAlertOpened(id) { alerts.get(id).openedAt = NOW; }
  };
  const chats = conversations || {
    async read(_user, id) { return { id, revision: 1, turns: id === SOURCE ? [NOTE] : [] }; },
    async create() { throw new Error('No debe crear otro chat para una lectura existente.'); },
    async send(input) { calls.push(input); return { id: input.id, turns: [NOTE, { role: 'assistant', text: 'Revisemos las dos propuestas.' }] }; }
  };
  const service = createWhatsAppBridgeService({
    repository, conversations: () => chats, db: { user: { findUnique: async () => user } }, now: () => NOW,
    env: { META_APP_SECRET: 'fake', META_WHATSAPP_TOKEN: 'fake', META_WHATSAPP_PHONE_NUMBER_ID: 'fake' },
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body); sent.push(body);
      if (failDelivery(body)) return { ok: false, status: 503, json: async () => ({ error: { message: 'fallo de entrega simulado' } }) };
      return { ok: true, json: async () => ({ messages: [{ id: 'fake-out' }] }) };
    },
    signSession: () => 'fake-session', logger: { warn() {}, error() {}, info() {} }
  });
  const deliver = async () => { await service.deliverAlert({ userId: USER.id, ...reading() }); return [...alerts.values()].at(-1); };
  const reply = (text, replyId = null, messageId = randomUUID()) => service.processMessage({ messageId, from: link.waId, type: replyId ? 'interactive' : 'text', text, replyId });
  return { service, repository, alerts, link, sent, calls, chats, deliver, reply };
};

test('la lectura conserva su conversación y ofrece revisarla; el aviso antiguo sigue siendo compatible', () => {
  const alert = reading();
  assert.equal(alert.conversationId, SOURCE);
  assert.equal(alert.buttons[0].label, 'Revisar lectura');
  assert.match(alert.buttons[0].ask, /revisar/i);
  const old = dailyAlert({ note: NOTE.note, dayKey: NOTE.dayKey, text: NOTE.text });
  assert.deepEqual(old.buttons, []);
});

test('enviar o abrir el aviso no cambia el chat activo ni interpreta una aprobación', async () => {
  const fixture = setup();
  const alert = await fixture.deliver();
  assert.equal(alert.conversationId, SOURCE, 'la referencia debe persistir hasta la respuesta');
  assert.equal(fixture.link.conversationId, 'active-chat');
  const opened = await fixture.reply('Ver aviso', `a:${alert.id}:open`);
  assert.equal(opened.outcome, 'alert-opened');
  assert.equal(fixture.link.conversationId, 'active-chat');
  assert.equal(fixture.calls.length, 0);
});

test('seleccionar Revisar lectura usa su conversación y conserva el contexto en la respuesta natural siguiente', async () => {
  const fixture = setup();
  const alert = await fixture.deliver();
  const selected = await fixture.reply('Revisar lectura', `a:${alert.id}:0`);
  assert.equal(selected.outcome, 'answered');
  assert.equal(fixture.calls[0].id, SOURCE);
  assert.equal(fixture.calls[0].user.userId, USER.id);
  assert.equal(fixture.calls[0].expectedRevision, 1);
  assert.match(fixture.calls[0].question, /revisar/i);
  assert.doesNotMatch(fixture.calls[0].question, /^(sí|dale|confirmar)$/i);
  assert.equal(fixture.link.conversationId, SOURCE);
  await fixture.reply('La 2 la dejamos para después');
  assert.deepEqual(fixture.calls.map(({ id }) => id), [SOURCE, SOURCE]);
  assert.equal(fixture.calls[1].question, 'La 2 la dejamos para después');
});

test('un fallo al revisar deja el vínculo sin borrador confirmable y repetir el botón retoma la misma lectura', async () => {
  let attempts = 0;
  const ids = [];
  const fixture = setup({ conversations: {
    async read(_user, id) { return { id, turns: [NOTE] }; },
    async send({ id }) { ids.push(id); if (++attempts === 1) throw new Error('fallo simulado'); return { id, turns: [{ role: 'assistant', text: 'Podemos retomarla.' }] }; }
  } });
  fixture.link.lastMessageAt = new Date('2026-10-22T15:00:00Z');
  const alert = await fixture.deliver();
  assert.equal((await fixture.reply('Revisar lectura', `a:${alert.id}:0`)).outcome, 'failed');
  assert.equal(fixture.link.conversationId, null, 'una respuesta que no se mostró no puede quedar lista para un sí');
  assert.match(fixture.sent.at(-1).text.body, /Revisar lectura/);
  assert.equal((await fixture.reply('Revisar lectura', `a:${alert.id}:0`)).outcome, 'answered');
  assert.deepEqual(ids, [SOURCE, SOURCE]);
});

test('si Meta no entrega la respuesta de revisión, no queda un borrador disponible para una aprobación implícita', async () => {
  const fixture = setup({ failDelivery: (body) => body.text?.body === 'Revisemos las dos propuestas.' });
  const alert = await fixture.deliver();
  assert.equal((await fixture.reply('Revisar lectura', `a:${alert.id}:0`)).outcome, 'delivery-failed');
  assert.equal(fixture.link.conversationId, null);
});

test('si no se puede invalidar el vínculo anterior, se detiene antes de preguntar al motor', async () => {
  const fixture = setup();
  const alert = await fixture.deliver();
  fixture.repository.setConversation = async () => { throw new Error('base no disponible'); };
  assert.equal((await fixture.reply('Revisar lectura', `a:${alert.id}:0`)).outcome, 'failed');
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.link.conversationId, 'active-chat');
});

test('si la plataforma cambió el chat entre leerlo y responder, se pide revisar la respuesta actual', async () => {
  const fixture = setup();
  const alert = await fixture.deliver();
  fixture.chats.send = async () => { throw Object.assign(new Error('La conversación cambió. Revisa su última respuesta antes de confirmar.'), { status: 409, code: 'BRIA_CONVERSATION_STALE' }); };
  assert.equal((await fixture.reply('Revisar lectura', `a:${alert.id}:0`)).outcome, 'stale-conversation');
  assert.match(fixture.sent.at(-1).text.body, /conversación cambió/);
  assert.equal(fixture.link.conversationId, null);
});

test('si falla fijar el chat tras mostrar la respuesta, el chat previo no queda disponible para un sí equivocado', async () => {
  const fixture = setup();
  const alert = await fixture.deliver();
  const save = fixture.repository.setConversation;
  fixture.repository.setConversation = async (user, id) => { if (id) throw new Error('fallo al enlazar'); await save(user, id); };
  assert.equal((await fixture.reply('Revisar lectura', `a:${alert.id}:0`)).outcome, 'conversation-link-failed');
  assert.equal(fixture.link.conversationId, null);
  assert.match(fixture.sent.at(-1).text.body, /Revisar lectura/);
});

for (const review of [false, true]) {
  test(`un resumen no entregado en el chat ya activo no se confirma con dale (${review ? 'revisión' : 'conversación habitual'})`, async () => {
    const ready = { id: 'act-not-seen', ownerId: USER.id, type: 'TASK_UPDATE', status: 'DRAFT', title: 'Cambiar prioridad', summary: ['Prioridad: Alta'], missing: [], warnings: [] };
    const rows = new Map([[SOURCE, { id: SOURCE, revision: 1, turns: [NOTE] }]]);
    let writes = 0;
    const engine = createBriaConversationService({
      repository: {
        async get(_actor, id) { return rows.get(id) || null; },
        async create() { const chat = { id: randomUUID(), revision: 0, turns: [] }; rows.set(chat.id, chat); return chat; },
        async append(_actor, id, revision, question, result) {
          const stored = rows.get(id); assert.equal(stored.revision, revision);
          const response = typeof result === 'function' ? await result() : result;
          const saved = { ...stored, revision: revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: response.answer, ...response }] };
          rows.set(id, saved); return saved;
        }
      },
      resolveActor: async () => ({ ref: USER.id, role: 'ADMIN' }),
      assistant: { ask: async () => ({ ...actionReply(ready), pendingAction: ready, sources: [], failures: [] }) },
      actions: { execute: async () => { writes += 1; return { text: 'Actualizado.' }; } }
    });
    let reject = true;
    const fixture = setup({ conversations: engine, failDelivery: (body) => reject && (body.interactive?.body?.text?.includes('Prioridad: Alta') || body.text?.body?.includes('Prioridad: Alta')) });
    fixture.link.conversationId = SOURCE;
    const alert = await fixture.deliver();
    const result = await fixture.reply(review ? 'Revisar lectura' : 'Prepara el cambio de prioridad', review ? `a:${alert.id}:0` : null);
    assert.equal(result.outcome, 'delivery-failed');
    assert.equal(fixture.link.conversationId, null);
    reject = false;
    await fixture.reply('dale');
    assert.equal(writes, 0, 'el sí nunca llega al borrador que Meta no entregó');
    assert.notEqual(fixture.link.conversationId, SOURCE);
  });
}

test('si Meta rechaza el botón de lectura, el texto no ofrece una respuesta que perdería el contexto', async () => {
  const fixture = setup({ failDelivery: (body) => body.type === 'interactive' });
  await fixture.deliver();
  assert.match(fixture.sent.at(-1).text.body, /plataforma|Intelligence/i);
  assert.doesNotMatch(fixture.sent.at(-1).text.body, /Puedes responder/);
  assert.equal(fixture.link.conversationId, 'active-chat');
});

for (const scenario of ['ajeno', 'vencido', 'futuro', 'conversación borrada', 'permisos cambiados', 'lectura distinta']) {
  test(`un aviso ${scenario} no revela texto ni lleva la respuesta a otro chat`, async () => {
    const fixture = setup();
    const alert = await fixture.deliver();
    if (scenario === 'ajeno') alert.userId = 'other';
    if (scenario === 'vencido') alert.createdAt = new Date('2026-10-09T15:00:00Z');
    if (scenario === 'futuro') alert.createdAt = new Date('2026-10-24T15:00:00Z');
    if (scenario === 'conversación borrada') fixture.chats.read = async () => { throw Object.assign(new Error('No existe'), { status: 404 }); };
    if (scenario === 'permisos cambiados') fixture.chats.read = async () => ({ id: SOURCE, turns: [{ role: 'assistant', text: 'Tu acceso cambió.' }] });
    if (scenario === 'lectura distinta') fixture.chats.read = async () => ({ id: SOURCE, turns: [{ ...NOTE, dayKey: '2026-10-22' }] });
    for (const index of ['open', 0]) {
      const result = await fixture.reply('Revisar lectura', `a:${alert.id}:${index}`);
      assert.equal(result.outcome, 'alert-gone');
      assert.equal(fixture.sent.at(-1).text.body, REPLIES.alertGone);
    }
    assert.equal(fixture.calls.length, 0);
    assert.equal(fixture.link.conversationId, 'active-chat');
  });
}

test('sin Bria vigente no se abre ni revisa la lectura guardada', async () => {
  const fixture = setup();
  const alert = await fixture.deliver();
  const denied = setup({ user: { ...USER, isActive: false } });
  denied.alerts.set(alert.id, alert);
  assert.equal((await denied.reply('Revisar lectura', `a:${alert.id}:0`)).outcome, 'not-allowed');
  assert.equal(denied.calls.length, 0);
});

test('el motor real solo ejecuta tras mostrar el resumen y recibir la aprobación humana; reentregar el botón no duplica', async () => {
  const ready = { id: 'action-1', ownerId: USER.id, type: 'TASK_UPDATE', status: 'DRAFT', title: 'Cambiar el pendiente', summary: ['Prioridad: Alta'], missing: [], warnings: [] };
  let stored = { id: SOURCE, revision: 2, turns: [NOTE, { role: 'assistant', text: actionReply(ready).answer, pendingAction: ready }] };
  let writes = 0, locked = false;
  const engine = createBriaConversationService({
    repository: {
      async get(actor, id) { assert.equal(actor.ref, USER.id); return id === SOURCE ? stored : null; },
      async append(_actor, _id, revision, question, result) {
        assert.equal(revision, stored.revision);
        locked = true; const response = typeof result === 'function' ? await result() : result; locked = false;
        stored = { ...stored, revision: revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: response.answer, ...response }] };
        return stored;
      }
    },
    resolveActor: async () => ({ ref: USER.id, role: 'ADMIN' }),
    assistant: { ask: async () => ({ ...actionReply(ready), pendingAction: ready, sources: [], failures: [] }) },
    actions: { execute: async () => { assert.equal(locked, true); writes += 1; return { text: 'El pendiente se actualizó.' }; } }
  });
  const fixture = setup({ conversations: engine });
  const alert = await fixture.deliver();
  assert.equal((await fixture.reply('Revisar lectura', `a:${alert.id}:0`, 'selected-once')).outcome, 'answered');
  assert.equal(writes, 0, 'revisar nunca aprueba la acción que ya estaba preparada');
  assert.deepEqual(await fixture.reply('Revisar lectura', `a:${alert.id}:0`, 'selected-once'), { skipped: 'duplicate' });
  await fixture.reply('dale');
  assert.equal(writes, 1);
  await fixture.reply('Confirmar');
  assert.equal(writes, 1, 'la confirmación repetida no ejecuta una acción terminada');
});

test('el repositorio guarda y recupera la conversación fuente en el aviso, sin guardar mensajes nuevos', async () => {
  const queries = [];
  const row = { id: randomUUID(), user_id: USER.id, kind: 'DAILY', source_ref: `${NOTE.note}:${NOTE.dayKey}`, text: NOTE.text, buttons: [], conversation_id: SOURCE };
  const repo = createWhatsAppLinkRepository({ pool: { query: async (sql, params) => { queries.push({ sql, params }); return { rows: /INSERT INTO bria_memory.whatsapp_alerts|SELECT \* FROM bria_memory.whatsapp_alerts/.test(sql) ? [row] : [], rowCount: 1 }; } } });
  const saved = await repo.saveAlert({ userId: USER.id, ...reading(), createdAt: NOW });
  assert.equal(saved.conversationId, SOURCE);
  const insert = queries.find(({ sql }) => sql.startsWith('INSERT INTO bria_memory.whatsapp_alerts'));
  assert.match(insert.sql, /conversation_id/);
  assert.ok(insert.params.includes(SOURCE));
  assert.equal((await repo.alertById(row.id)).conversationId, SOURCE);
});

test('los botones viejos no confirman otra acción al cambiar de chat o avanzar; el botón actual conserva la decisión humana', async () => {
  const rows = new Map([
    ['active-chat', { id: 'active-chat', revision: 0, turns: [] }],
    [SOURCE, { id: SOURCE, revision: 1, turns: [NOTE] }]
  ]);
  let proposed = 0;
  const executed = [];
  const engine = createBriaConversationService({
    repository: {
      async get(_actor, id) { return rows.get(id) || null; },
      async append(_actor, id, revision, question, result) {
        const stored = rows.get(id); assert.equal(stored.revision, revision);
        const response = typeof result === 'function' ? await result() : result;
        const saved = { ...stored, revision: revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { role: 'assistant', text: response.answer, ...response }] };
        rows.set(id, saved); return saved;
      }
    },
    resolveActor: async () => ({ ref: USER.id, role: 'ADMIN' }),
    assistant: { ask: async () => {
      const ready = { id: `action-${++proposed}`, ownerId: USER.id, type: 'TASK_UPDATE', status: 'DRAFT', title: `Cambio ${proposed}`, summary: ['Prioridad: Alta'], missing: [], warnings: [] };
      return { ...actionReply(ready), pendingAction: ready, sources: [], failures: [] };
    } },
    actions: { execute: async ({ action }) => { executed.push(action.id); return { text: 'Actualizado.' }; } }
  });
  const fixture = setup({ conversations: engine });
  const lastButton = () => fixture.sent.filter((body) => body.type === 'interactive').at(-1).interactive.action.buttons[0].reply.id;
  await fixture.reply('Prepara el primer cambio');
  const firstChatButton = lastButton();
  const alert = await fixture.deliver();
  await fixture.reply('Revisar lectura', `a:${alert.id}:0`);
  const firstReadingButton = lastButton();
  assert.equal((await fixture.reply('Confirmar', firstChatButton)).outcome, 'stale-option');
  assert.equal((await fixture.reply('Confirmar', 'q:Confirmar')).outcome, 'stale-option');
  assert.deepEqual(executed, []);
  await fixture.reply('Prepara otro cambio en esta lectura');
  const currentButton = lastButton();
  assert.equal((await fixture.reply('Confirmar', firstReadingButton)).outcome, 'stale-option');
  assert.deepEqual(executed, []);
  // El texto presentado por Meta puede estar truncado o manipulado: manda la opción guardada en la respuesta.
  assert.equal((await fixture.reply('Cancelar', currentButton)).outcome, 'answered');
  assert.deepEqual(executed, ['action-3']);
  assert.equal((await fixture.reply('Confirmar', currentButton)).outcome, 'stale-option');
  assert.deepEqual(executed, ['action-3']);
});
