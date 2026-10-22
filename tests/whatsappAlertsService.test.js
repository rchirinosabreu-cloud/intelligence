import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createWhatsAppBridgeService } from '../src/services/whatsappBridgeService.js';
import { REPLIES } from '../src/lib/whatsappBridge.js';
import { accessAlert, pulseAlert, dailyAlert, ALERT_TEMPLATE } from '../src/lib/whatsappAlerts.js';

// Los avisos de Bria por WhatsApp (Rodny, 22 de octubre de 2026). Sin red ni base: repositorio, Meta, la bóveda,
// los pedidos de módulos y el pulso son dobles.

const ENV = { META_APP_SECRET: 's', META_WHATSAPP_TOKEN: 't', META_WHATSAPP_PHONE_NUMBER_ID: '1319887801213730', META_WHATSAPP_NUMBER: '+573043786298' };
const NOW = new Date('2026-10-22T15:00:00Z'); // 10:00 de Bogotá

const fakeRepository = () => {
  const links = new Map(), alerts = new Map(), seen = new Set();
  return {
    links, alerts,
    async linkByUser(userId) { return links.get(userId) || null; },
    async linkByWaId(waId, phone) { return [...links.values()].find((link) => link.waId === waId || (phone && link.phone === phone)) || null; },
    async setPhone() {},
    async setConversation(userId, id) { links.get(userId).conversationId = id; },
    async touch(userId, at) { links.get(userId).lastMessageAt = at; },
    async markInbound(userId, at) { links.get(userId).lastInboundAt = at; },
    async setAlertsOff(userId, list) { links.get(userId).alertsOff = list; },
    async rememberInbound(id) { if (seen.has(id)) return false; seen.add(id); return true; },
    async alertsSince(userId, since) { return [...alerts.values()].filter((row) => row.userId === userId && row.createdAt >= since).length; },
    async saveAlert(row) {
      if ([...alerts.values()].some((other) => other.userId === row.userId && other.sourceRef === row.sourceRef)) return null;
      const saved = { ...row, id: crypto.randomUUID(), status: 'PENDING' }; alerts.set(saved.id, saved); return saved;
    },
    async alertById(id) { return alerts.get(id) || null; },
    async markAlertSent(id, via) { Object.assign(alerts.get(id), { status: 'SENT', via }); },
    async markAlertFailed(id, error) { Object.assign(alerts.get(id), { status: 'FAILED', error }); },
    async markAlertOpened(id) { alerts.get(id).openedAt = NOW; }
  };
};

const rodny = { id: 'u-rodny', name: 'Rodny Chirinos', email: 'r@b.co', role: 'ADMIN', isActive: true, modulePermissions: { bria: true }, sessionVersion: 2, teamMember: { isActive: true } };

const build = ({ repository = fakeRepository(), fail = null, actions = {}, conversations = null } = {}) => {
  const sent = [];
  const fetchImpl = async (url, options) => {
    const body = JSON.parse(options.body);
    sent.push(body);
    if (fail && fail(body)) return { ok: false, status: 400, json: async () => ({ error: { message: 'Meta no lo aceptó' } }) };
    return { ok: true, status: 200, json: async () => ({ messages: [{ id: 'wamid.out' }] }) };
  };
  const db = { user: { findUnique: async ({ where }) => ({ 'u-rodny': rodny })[where.id] || null } };
  const asked = [];
  const chats = conversations || {
    async create() { return { id: 'c1', turns: [] }; },
    async read() { return { id: 'c1', turns: [] }; },
    async send({ question }) { asked.push(question); return { id: 'c1', turns: [{ role: 'assistant', text: 'Melissa tiene dos pendientes.' }] }; }
  };
  const service = createWhatsAppBridgeService({ repository, conversations: () => chats, db, env: ENV, fetchImpl, now: () => NOW, logger: { warn() {}, error() {}, info() {} }, scheduleWork: () => {}, actions });
  return { service, sent, repository, asked };
};
const linkRodny = (repository, extra = {}) => repository.links.set('u-rodny', { userId: 'u-rodny', waId: 'CO.1349', phone: '573001112233', conversationId: null, alertsOff: [], lastInboundAt: new Date('2026-10-22T13:00:00Z'), ...extra });

const access = accessAlert({ type: 'VAULT', request: { id: 'r1' }, text: 'Camila necesita la contraseña de CapCut.' });

test('dentro de las 24 horas el aviso sale entero, con sus botones, y queda guardado una sola vez', async () => {
  const { service, sent, repository } = build();
  linkRodny(repository);
  const result = await service.deliverAlert({ userId: 'u-rodny', ...access });
  assert.equal(result.outcome, 'sent');
  assert.equal(result.via, 'SESSION');
  assert.equal(sent[0].type, 'interactive');
  assert.equal(sent[0].to, '573001112233');
  assert.equal(sent[0].interactive.body.text, 'Camila necesita la contraseña de CapCut.');
  const [alert] = repository.alerts.values();
  assert.deepEqual(sent[0].interactive.action.buttons.map((b) => [b.reply.id, b.reply.title]), [[`a:${alert.id}:0`, 'Compartir'], [`a:${alert.id}:1`, 'Denegar']]);
  assert.equal((await service.deliverAlert({ userId: 'u-rodny', ...access })).outcome, 'duplicate', 'el mismo pedido no llega dos veces');
});

test('fuera de las 24 horas sale la plantilla con «Ver aviso»; si Meta la rechaza, el aviso queda fallido y no se reintenta', async () => {
  const { service, sent, repository } = build();
  linkRodny(repository, { lastInboundAt: new Date('2026-10-20T15:00:00Z') });
  const result = await service.deliverAlert({ userId: 'u-rodny', ...dailyAlert({ note: 'CIERRE_DIA', dayKey: '2026-10-22', text: 'Cerraste **3**.' }) });
  assert.deepEqual([result.outcome, result.via], ['sent', 'TEMPLATE']);
  const [alert] = repository.alerts.values();
  assert.equal(sent[0].type, 'template');
  assert.equal(sent[0].template.name, ALERT_TEMPLATE.name);
  assert.deepEqual(sent[0].template.components[0].parameters.map((p) => p.text), ['Rodny', 'tu cierre del día']);
  assert.equal(sent[0].template.components[1].parameters[0].payload, `a:${alert.id}:open`);

  const blocked = build({ fail: (body) => body.type === 'template' });
  linkRodny(blocked.repository, { lastInboundAt: null });
  const failed = await blocked.service.deliverAlert({ userId: 'u-rodny', ...access });
  assert.equal(failed.outcome, 'failed');
  assert.equal([...blocked.repository.alerts.values()][0].status, 'FAILED');
  assert.equal(blocked.sent.length, 1);
});

test('lo que no se manda: sin vínculo, apagado en el perfil, un pedido de acceso de noche, sin Bria, o sin configurar', async () => {
  const none = build();
  assert.equal((await none.service.deliverAlert({ userId: 'u-rodny', ...access })).outcome, 'not-linked');
  const off = build(); linkRodny(off.repository, { alertsOff: ['ACCESS'] });
  assert.equal((await off.service.deliverAlert({ userId: 'u-rodny', ...access })).outcome, 'off');
  const night = build(); linkRodny(night.repository);
  const late = createWhatsAppBridgeService({ repository: night.repository, conversations: () => null, db: { user: { findUnique: async () => rodny } }, env: ENV, fetchImpl: async () => { throw new Error('no debería salir'); }, now: () => new Date('2026-10-23T03:30:00Z'), logger: { warn() {}, error() {}, info() {} } });
  assert.equal((await late.deliverAlert({ userId: 'u-rodny', ...access })).outcome, 'quiet-hours');
  const offline = createWhatsAppBridgeService({ repository: fakeRepository(), env: {}, logger: { warn() {}, error() {}, info() {} } });
  assert.equal((await offline.deliverAlert({ userId: 'u-rodny', ...access })).outcome, 'not-configured');
  assert.equal(none.sent.length + off.sent.length, 0);
});

test('tocar «Compartir» decide el pedido como Rodny, con su identidad, y le dice lo que pasó', async () => {
  const decisions = [];
  const vault = { decideRequest: async (user, id, decision) => { decisions.push([user.userId, user.sessionVersion, id, decision]); return { decided: true, message: 'Listo: Camila ya puede ver la contraseña de CapCut.' }; } };
  const { service, sent, repository } = build({ actions: { vault: async () => vault } });
  linkRodny(repository);
  await service.deliverAlert({ userId: 'u-rodny', ...access });
  const [alert] = repository.alerts.values();
  const result = await service.processMessage({ messageId: 'w1', from: 'CO.1349', phone: '573001112233', type: 'interactive', text: 'Compartir', replyId: `a:${alert.id}:0` });
  assert.equal(result.outcome, 'alert-action');
  assert.deepEqual(decisions, [['u-rodny', 2, 'r1', 'APPROVE']]);
  assert.equal(sent.at(-1).text.body, 'Listo: Camila ya puede ver la contraseña de CapCut.');
  assert.ok(repository.links.get('u-rodny').lastInboundAt.getTime() === NOW.getTime(), 'su mensaje abre otra vez la ventana');
});

test('un rechazo de la plataforma se dice con su motivo, y un aviso que no es suyo o ya no existe se reconoce', async () => {
  const vault = { decideRequest: async () => { throw Object.assign(new Error('Ese pedido ya no existe.'), { status: 404 }); } };
  const { service, sent, repository } = build({ actions: { vault: async () => vault } });
  linkRodny(repository);
  await service.deliverAlert({ userId: 'u-rodny', ...access });
  const [alert] = repository.alerts.values();
  await service.processMessage({ messageId: 'w1', from: 'CO.1349', type: 'interactive', text: 'Denegar', replyId: `a:${alert.id}:1` });
  assert.equal(sent.at(-1).text.body, 'Ese pedido ya no existe.');
  const gone = await service.processMessage({ messageId: 'w2', from: 'CO.1349', type: 'interactive', text: 'Denegar', replyId: 'a:00000000-0000-0000-0000-000000000000:1' });
  assert.equal(gone.outcome, 'alert-gone');
  assert.equal(sent.at(-1).text.body, REPLIES.alertGone);
});

test('«Ver aviso» de la plantilla trae el aviso completo; un botón de pregunta va a Bria; «Ocultar por hoy» oculta el aviso del pulso', async () => {
  const dismissed = [];
  const pulse = { dismissMessage: async (userRef, id) => { dismissed.push([userRef, id]); return true; } };
  const { service, sent, repository, asked } = build({ actions: { pulse: async () => pulse } });
  linkRodny(repository, { lastInboundAt: null });
  const alert = pulseAlert({ id: 'p1', title: 'Melissa sin nada en proceso', body: 'Desde las 10:05.', actions: [{ label: 'Que Bria me resuma', ask: 'Resúmeme qué tiene Melissa hoy.' }] });
  await service.deliverAlert({ userId: 'u-rodny', ...alert });
  const [saved] = repository.alerts.values();
  const opened = await service.processMessage({ messageId: 'w1', from: 'CO.1349', type: 'button', text: 'Ver aviso', replyId: `a:${saved.id}:open` });
  assert.equal(opened.outcome, 'alert-opened');
  assert.equal(sent.at(-1).type, 'interactive');
  assert.match(sent.at(-1).interactive.body.text, /Melissa sin nada en proceso/);
  const answered = await service.processMessage({ messageId: 'w2', from: 'CO.1349', type: 'interactive', text: 'Que Bria me resuma', replyId: `a:${saved.id}:0` });
  assert.equal(answered.outcome, 'answered');
  assert.deepEqual(asked, ['Resúmeme qué tiene Melissa hoy.'], 'el botón manda la pregunta completa');
  await service.processMessage({ messageId: 'w3', from: 'CO.1349', type: 'interactive', text: 'Ocultar por hoy', replyId: `a:${saved.id}:1` });
  assert.deepEqual(dismissed, [['u-rodny', 'p1']]);
  assert.equal(sent.at(-1).text.body, REPLIES.dismissed);
});

test('las preferencias: vienen encendidas y cada quien apaga las suyas; a quien no administra no se le ofrecen los pedidos de acceso', async () => {
  const { service, repository } = build();
  linkRodny(repository);
  assert.deepEqual((await service.status('u-rodny', { role: 'ADMIN' })).alerts.map((row) => [row.kind, row.on]), [['ACCESS', true], ['DAILY', true], ['PULSE', true]]);
  await service.setAlert('u-rodny', 'PULSE', false);
  assert.deepEqual(repository.links.get('u-rodny').alertsOff, ['PULSE']);
  assert.deepEqual((await service.status('u-rodny', { role: 'PROJECT_MANAGER' })).alerts.map((row) => row.kind), ['DAILY', 'PULSE']);
  await assert.rejects(service.setAlert('u-rodny', 'SEMAFORO', true), { status: 400 });
});
