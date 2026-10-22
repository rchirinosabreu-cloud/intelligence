// Bria en WhatsApp (Rodny, 20 de octubre de 2026): el puente entre el número de la agencia y el motor de Bria de
// siempre. Lo que llega por WhatsApp entra a una conversación de Bria de la persona vinculada —con su identidad,
// sus permisos y las mismas puertas que el chat de la plataforma— y lo que Bria responde sale como texto por la
// API de Meta. Sin sesión del navegador: las «manos» que piden la sesión (operar_en_plataforma) no están aquí, y
// Bria lo dice; las acciones propias (pendientes, despachos, memoria) sí, porque corren con la identidad.
import prisma from '../lib/prisma.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { runWithAiContext } from '../lib/aiRequestContext.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { META_GRAPH_ORIGIN, META_GRAPH_VERSION } from './metaGraphService.js';
import { createWhatsAppLinkRepository } from './whatsappLinkRepository.js';
import {
  verifyMetaSignature, webhookChallenge, parseInboundMessages, describeNotice, isStatusOnlyNotice, maskWaId, linkCodeIn, generateLinkCode, linkMessage, displayPhone, waMeLink,
  splitForWhatsApp, replyForWhatsApp, textWithOptions, optionsMessagePayload, textMessagePayload, readReceiptPayload, REPLIES, LINK_CODE_TTL_MS, UNKNOWN_SENDER_REPLIES_PER_DAY,
  INTERACTIVE_BODY_MAX, OPTIONS_PROMPT
} from '../lib/whatsappBridge.js';
import {
  ALERT_KINDS, ALERT_ACTIONS, isWindowOpen, alertsEnabled, withinAlertHours, parseAlertReplyId, alertOptions, templateMessagePayload
} from '../lib/whatsappAlerts.js';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Ningún día manda más avisos que estos por persona, pase lo que pase en la plataforma. */
export const ALERTS_PER_DAY = 12;
const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'equipo';

// Lo que hace cada botón de un aviso, con las mismas puertas que el aviso encima de Bria. Se cargan al usarlas:
// esos servicios avisan por WhatsApp y un import directo sería circular.
const defaultActions = {
  vault: async () => (await import('./vaultService.js')).getVaultService(),
  permissions: async () => (await import('./permissionRequestService.js')).getPermissionRequestService(),
  pulse: async () => (await import('./briaProactiveRepository.js')).createBriaProactiveRepository({ pool: getSidecarPool() })
};
const SEND_TIMEOUT_MS = 20 * 1000;
const httpError = (status, message, code) => Object.assign(new Error(message), { status, code });
const bogotaDay = (date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);

export const createWhatsAppBridgeService = ({
  repository,
  conversations,
  db = prisma,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  random,
  logger = console,
  scheduleWork = (work) => queueMicrotask(work),
  actions = {}
} = {}) => {
  const act = { ...defaultActions, ...actions };
  const config = () => ({
    token: env.META_WHATSAPP_TOKEN || '',
    phoneNumberId: env.META_WHATSAPP_PHONE_NUMBER_ID ? String(env.META_WHATSAPP_PHONE_NUMBER_ID) : '',
    appSecret: env.META_APP_SECRET || '',
    verifyToken: env.META_WHATSAPP_VERIFY_TOKEN || '',
    number: env.META_WHATSAPP_NUMBER || ''
  });
  const configured = () => { const c = config(); return Boolean(c.token && c.phoneNumberId && c.appSecret); };

  // El token va en la cabecera: las URLs acaban en registros y el token no.
  const graph = async (path, payload) => {
    const { token } = config();
    const response = await fetchImpl(`${META_GRAPH_ORIGIN}/${META_GRAPH_VERSION}/${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      redirect: 'error',
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS)
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || body?.error) throw httpError(response.status || 502, body?.error?.message || `Meta respondió ${response.status}`, 'META_WHATSAPP_SEND');
    return body;
  };
  const messages = (payload) => graph(`${config().phoneNumberId}/messages`, payload);
  const sendText = async (to, text) => { for (const part of splitForWhatsApp(text)) await messages(textMessagePayload(to, part)); };
  // Texto y opciones: lo largo sale antes en texto y las opciones van con el último trozo (o con una línea corta si
  // ese trozo no cabe en un mensaje con botones). Si Meta no acepta los botones, las opciones se dicen en texto.
  const sendReply = async (to, { text, options = [] }) => {
    const parts = splitForWhatsApp(text);
    if (!options.length || !parts.length) { for (const part of parts) await messages(textMessagePayload(to, part)); return; }
    const last = parts.at(-1);
    const fits = last.length <= INTERACTIVE_BODY_MAX;
    for (const part of fits ? parts.slice(0, -1) : parts) await messages(textMessagePayload(to, part));
    const body = fits ? last : OPTIONS_PROMPT;
    const payload = optionsMessagePayload(to, body, options);
    if (!payload) { await sendText(to, textWithOptions({ text: body, options })); return; }
    try { await messages(payload); }
    catch (failure) {
      logger.warn?.(`[WhatsApp] Los botones no salieron (${failure.message}); van en texto.`);
      await sendText(to, textWithOptions({ text: body, options }));
    }
  };
  const markRead = async (messageId) => {
    try { await graph(`${config().phoneNumberId}/messages`, readReceiptPayload(messageId)); }
    catch (failure) { logger.warn?.(`[WhatsApp] No se pudo marcar como leído: ${failure.message}`); }
  };

  const loadUser = async (userId) => db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, isActive: true, modulePermissions: true, sessionVersion: true, teamMember: { select: { isActive: true } } }
  });
  const allowed = (row) => Boolean(row) && row.isActive !== false && row.teamMember?.isActive !== false && canUseBria(row);
  // La misma forma que deja `authenticateToken` en req.user: el motor de Bria no distingue por dónde llegó la persona.
  const sessionUser = (row) => ({ userId: row.id, id: row.id, name: row.name, email: row.email, role: row.role, modulePermissions: row.modulePermissions, sessionVersion: row.sessionVersion, isActive: row.isActive });

  // Cada día es una conversación, como en la plataforma: así el aprendizaje nocturno la lee por día y el historial
  // no crece sin fin. Dentro del mismo día se sigue la misma, para que «Confirmar» encuentre su acción.
  const conversationFor = async (user, link, at) => {
    const service = conversations();
    const sameDay = link.lastMessageAt && bogotaDay(new Date(link.lastMessageAt)) === bogotaDay(at);
    if (link.conversationId && sameDay) {
      try { return await service.read(user, link.conversationId); }
      catch (failure) { if (failure.status !== 404) throw failure; }
    }
    const chat = await service.create(user);
    await repository.setConversation(user.userId, chat.id);
    return chat;
  };

  // A quién se responde: al número si vino en este mensaje y, si no, al BSUID (Meta no siempre manda el número).
  const replyTo = (message) => message.phone || message.from;

  const handleUnknown = async (message) => {
    const at = now();
    const code = linkCodeIn(message.text);
    if (code) {
      const outcome = await repository.consumeCode({ code, waId: message.from, phone: message.phone || null, profileName: message.profileName, now: at });
      if (outcome.ok) {
        const row = await loadUser(outcome.userId);
        await sendText(replyTo(message), REPLIES.linked(row?.name));
        logger.info?.(`[WhatsApp] Número vinculado a ${outcome.userId}.`);
        return { outcome: 'linked', userId: outcome.userId };
      }
      await sendText(replyTo(message), REPLIES.invalidCode);
      return { outcome: 'invalid-code', reason: outcome.reason };
    }
    if (await repository.unknownRepliesSince(message.from, new Date(at.getTime() - DAY_MS)) >= UNKNOWN_SENDER_REPLIES_PER_DAY) return { outcome: 'ignored' };
    await repository.rememberUnknownReply(message.from, at);
    await sendText(replyTo(message), REPLIES.unknown);
    return { outcome: 'unknown' };
  };

  // Un aviso guardado, con sus botones: dentro de la ventana de 24 horas, o después de que la persona tocó «Ver aviso».
  const sendAlertContent = (to, alert) => sendReply(to, { text: alert.text, options: alertOptions(alert) });

  // Lo que hace un botón de un aviso. Un rechazo de la plataforma (4xx) se dice con su motivo; otra falla, en general.
  const runAlertAction = async (user, button) => {
    const decision = button.act.endsWith('_APPROVE') ? 'APPROVE' : 'DENY';
    if (button.act.startsWith('VAULT_')) return (await (await act.vault()).decideRequest(user, button.ref, decision))?.message || REPLIES.done;
    if (button.act.startsWith('MODULE_')) return (await (await act.permissions()).decide(user, button.ref, decision))?.message || REPLIES.done;
    await (await act.pulse()).dismissMessage(user.userId, button.ref, now());
    return REPLIES.dismissed;
  };
  const handleAlertReply = async (user, link, message, parsed) => {
    const alert = await repository.alertById?.(parsed.alertId);
    const to = replyTo(message);
    if (!alert || alert.userId !== link.userId) { await sendText(to, REPLIES.alertGone); return { outcome: 'alert-gone' }; }
    if (parsed.index === 'open') {
      await repository.markAlertOpened?.(alert.id, now());
      await sendAlertContent(to, alert);
      return { outcome: 'alert-opened' };
    }
    const button = alert.buttons?.[parsed.index];
    if (!button) { await sendText(to, REPLIES.alertGone); return { outcome: 'alert-gone' }; }
    if (button.ask) return { ask: button.ask };
    if (!ALERT_ACTIONS.includes(button.act)) { await sendText(to, REPLIES.alertGone); return { outcome: 'alert-gone' }; }
    try { await sendText(to, await runAlertAction(user, button)); }
    catch (failure) {
      const told = failure.status >= 400 && failure.status < 500 && failure.message;
      if (!told) logger.error('[WhatsApp] Un botón de aviso falló:', failure.code || failure.message || failure);
      await sendText(to, told || REPLIES.failed);
    }
    return { outcome: 'alert-action', action: button.act };
  };

  const processMessage = async (message) => {
    if (!await repository.rememberInbound(message.messageId, message.from)) return { skipped: 'duplicate' };
    // Se busca por BSUID y por número: un vínculo hecho con uno se reconoce aunque el siguiente mensaje traiga el otro.
    const link = await repository.linkByWaId(message.from, message.phone || null);
    if (!link) return handleUnknown(message);
    if (message.phone && link.phone !== message.phone) await repository.setPhone?.(link.userId, message.phone);
    // Cada mensaje de la persona abre otra vez la ventana de 24 horas en la que Bria le puede escribir libre.
    await repository.markInbound?.(link.userId, now());
    const row = await loadUser(link.userId);
    if (!allowed(row)) { await sendText(replyTo(message), REPLIES.notAllowed); return { outcome: 'not-allowed' }; }
    if (!message.text) { await sendText(replyTo(message), REPLIES.onlyText); return { outcome: 'only-text' }; }
    await markRead(message.messageId);
    const user = sessionUser(row);
    let question = message.text;
    const alertReply = parseAlertReplyId(message.replyId);
    if (alertReply) {
      const handled = await handleAlertReply(user, link, message, alertReply);
      if (!handled.ask) return handled;
      question = handled.ask;
    }
    const at = now();
    let saved;
    try {
      const chat = await conversationFor(user, link, at);
      saved = await runWithAiContext({ actorId: user.userId, module: 'whatsapp', route: 'POST /api/whatsapp/webhook' }, () => conversations().send({ user, id: chat.id, question, session: null }));
    } catch (failure) {
      if (failure.status === 409) { await sendText(replyTo(message), REPLIES.busy); return { outcome: 'busy' }; }
      if (failure.code === 'BRIA_PLATFORM_SESSION') { await sendText(replyTo(message), REPLIES.needsPlatform); return { outcome: 'needs-platform' }; }
      logger.error('[WhatsApp] Bria no pudo responder:', failure.code || failure.message || failure);
      await sendText(replyTo(message), REPLIES.failed);
      return { outcome: 'failed' };
    }
    const turn = [...(saved?.turns || [])].reverse().find((item) => item.role === 'assistant');
    await sendReply(replyTo(message), replyForWhatsApp(turn));
    await repository.touch(link.userId, at);
    return { outcome: 'answered', conversationId: saved?.id || null };
  };

  /**
   * Un aviso de la plataforma por WhatsApp (22 de octubre de 2026). Se guarda una sola vez por persona y origen; dentro
   * de la ventana de 24 horas sale entero y con botones, fuera de ella como la plantilla `bria_aviso`. Nunca lanza:
   * un aviso que no sale queda anotado y la campana sigue siendo la que avisa.
   */
  const deliverAlert = async ({ userId, kind, sourceRef, topic, text, buttons = [] }) => {
    if (!configured()) return { outcome: 'not-configured' };
    if (!ALERT_KINDS.includes(kind) || !sourceRef || !String(text || '').trim()) return { outcome: 'invalid' };
    const link = await repository.linkByUser(userId);
    if (!link) return { outcome: 'not-linked' };
    if (!alertsEnabled(link.alertsOff, kind)) return { outcome: 'off' };
    const at = now();
    if (!withinAlertHours(kind, at)) return { outcome: 'quiet-hours' };
    const row = await loadUser(userId);
    if (!allowed(row)) return { outcome: 'not-allowed' };
    if (await repository.alertsSince(userId, new Date(at.getTime() - DAY_MS)) >= ALERTS_PER_DAY) return { outcome: 'daily-limit' };
    const alert = await repository.saveAlert({ userId, kind, sourceRef, topic, text: String(text).trim(), buttons, createdAt: at });
    if (!alert) return { outcome: 'duplicate' };
    const to = link.phone || link.waId;
    const via = isWindowOpen(link.lastInboundAt, at) ? 'SESSION' : 'TEMPLATE';
    try {
      if (via === 'SESSION') await sendAlertContent(to, alert);
      else await messages(templateMessagePayload(to, { params: [firstName(row.teamMember?.name || row.name), topic || 'tu trabajo'], payload: `a:${alert.id}:open` }));
      await repository.markAlertSent(alert.id, via);
      return { outcome: 'sent', via, alertId: alert.id };
    } catch (failure) {
      logger.warn?.(`[WhatsApp] Un aviso (${kind}) no salió por ${via === 'SESSION' ? 'mensaje' : 'plantilla'}: ${failure.message}`);
      await repository.markAlertFailed(alert.id, String(failure.message || 'error').slice(0, 300));
      return { outcome: 'failed', via };
    }
  };

  const setAlert = async (userId, kind, on) => {
    if (!ALERT_KINDS.includes(kind)) throw httpError(400, 'Ese tipo de aviso no existe.', 'WHATSAPP_ALERT_UNKNOWN');
    const link = await repository.linkByUser(userId);
    if (!link) throw httpError(409, 'Primero vincula tu WhatsApp.', 'WHATSAPP_NOT_LINKED');
    const off = new Set(link.alertsOff || []);
    if (on) off.delete(kind); else off.add(kind);
    const list = ALERT_KINDS.filter((item) => off.has(item));
    await repository.setAlertsOff(userId, list);
    return { kind, on: !list.includes(kind) };
  };

  const handleWebhook = async ({ rawBody, signature, body }) => {
    const refuse = (status, error, reason) => { logger.warn?.(`[WhatsApp] Aviso rechazado (${error}): ${reason}`); return { status, body: { error } }; };
    const c = config();
    if (!c.appSecret) return refuse(503, 'WHATSAPP_WEBHOOK_DISABLED', 'falta META_APP_SECRET en el servidor.');
    if (!verifyMetaSignature({ rawBody, signature, appSecret: c.appSecret })) {
      return refuse(401, 'WHATSAPP_SIGNATURE_INVALID', signature ? 'la firma no coincide con META_APP_SECRET.' : 'el aviso llegó sin la cabecera x-hub-signature-256.');
    }
    // Solo lo que llegó a nuestro número: una cuenta de WhatsApp puede tener más de uno.
    const messages = parseInboundMessages(body).filter((message) => !message.phoneNumberId || !c.phoneNumberId || message.phoneNumberId === c.phoneNumberId);
    // Un aviso firmado que no deja nada que atender se dice en el registro, con su forma y sin su contenido: si
    // no, un formato nuevo de Meta o un número distinto se pierden en silencio.
    if (!messages.length && !isStatusOnlyNotice(body)) logger.info?.(`[WhatsApp] Aviso sin mensajes para atender (número esperado ${c.phoneNumberId || 'sin configurar'}): ${describeNotice(body)}`);
    if (!configured()) {
      if (messages.length) logger.warn?.('[WhatsApp] Llegaron mensajes pero falta META_WHATSAPP_TOKEN o META_WHATSAPP_PHONE_NUMBER_ID.');
      return { status: 200, body: { accepted: true, ignored: messages.length } };
    }
    // Se responde a Meta antes de trabajar: un webhook que espera al modelo vence y Meta lo reenvía.
    for (const message of messages) {
      scheduleWork(() => processMessage(message)
        .then((result) => logger.info?.(`[WhatsApp] Mensaje de ${maskWaId(message.from)} (${message.type}): ${result?.outcome || result?.skipped || 'sin resultado'}${result?.reason ? ` (${result.reason})` : ''}.`))
        .catch((failure) => logger.error('[WhatsApp] Falló un mensaje:', failure.code || failure.message || failure)));
    }
    return { status: 200, body: { accepted: true, messages: messages.length } };
  };

  // Los pedidos de acceso solo le llegan a administración: a los demás ni se les ofrece el interruptor.
  const status = async (userId, { role = null } = {}) => {
    const link = await repository.linkByUser(userId);
    const c = config();
    const kinds = ALERT_KINDS.filter((kind) => kind !== 'ACCESS' || role === 'ADMIN');
    return {
      configured: configured(), number: c.number, numberDisplay: displayPhone(c.number), linked: Boolean(link), phone: link ? (displayPhone(link.phone || link.waId) || null) : null, linkedAt: link?.linkedAt || null, lastMessageAt: link?.lastMessageAt || null,
      alerts: link ? kinds.map((kind) => ({ kind, on: alertsEnabled(link.alertsOff, kind) })) : []
    };
  };

  const createLinkCode = async (userId) => {
    if (!configured()) throw httpError(503, 'Bria en WhatsApp todavía no está configurada.', 'WHATSAPP_NOT_CONFIGURED');
    const expiresAt = new Date(now().getTime() + LINK_CODE_TTL_MS);
    let code = null;
    for (let attempt = 0; attempt < 5 && !code; attempt += 1) {
      const candidate = generateLinkCode(random);
      if (await repository.createCode({ userId, code: candidate, expiresAt })) code = candidate;
    }
    if (!code) throw httpError(503, 'No se pudo generar el código. Inténtalo de nuevo.', 'WHATSAPP_CODE_COLLISION');
    const c = config();
    const message = linkMessage(code);
    return { code, message, expiresAt: expiresAt.toISOString(), number: c.number, numberDisplay: displayPhone(c.number), link: waMeLink(c.number, message) };
  };

  const unlink = async (userId) => { await repository.unlink(userId); return { linked: false }; };

  return { handleWebhook, verificationChallenge: (query) => webhookChallenge(query, config().verifyToken), processMessage, status, createLinkCode, unlink, configured, deliverAlert, setAlert };
};

let instance;
export const getWhatsAppBridgeService = () => instance ||= createWhatsAppBridgeService({
  repository: createWhatsAppLinkRepository({ pool: getSidecarPool() }),
  conversations: () => applicationConversations()
});

let applicationConversationsInstance;
const applicationConversations = () => {
  if (!applicationConversationsInstance) throw httpError(503, 'Bria todavía no está lista.', 'BRIA_NOT_READY');
  return applicationConversationsInstance;
};
// El motor de Bria se carga aparte (arrastra OpenAI, almacenamiento y la base) y se conecta al arrancar el servidor.
export const connectWhatsAppBridge = async () => {
  const { getApplicationConversationService } = await import('./briaConversationApplication.js');
  applicationConversationsInstance = getApplicationConversationService();
  return getWhatsAppBridgeService();
};
