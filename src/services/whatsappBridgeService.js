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
  verifyMetaSignature, webhookChallenge, parseInboundMessages, describeNotice, maskWaId, linkCodeIn, generateLinkCode, linkMessage, displayPhone, waMeLink,
  splitForWhatsApp, answerForWhatsApp, textMessagePayload, readReceiptPayload, REPLIES, LINK_CODE_TTL_MS, UNKNOWN_SENDER_REPLIES_PER_DAY
} from '../lib/whatsappBridge.js';

const DAY_MS = 24 * 60 * 60 * 1000;
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
  scheduleWork = (work) => queueMicrotask(work)
} = {}) => {
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
  const sendText = async (to, text) => { for (const part of splitForWhatsApp(text)) await graph(`${config().phoneNumberId}/messages`, textMessagePayload(to, part)); };
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

  const processMessage = async (message) => {
    if (!await repository.rememberInbound(message.messageId, message.from)) return { skipped: 'duplicate' };
    // Se busca por BSUID y por número: un vínculo hecho con uno se reconoce aunque el siguiente mensaje traiga el otro.
    const link = await repository.linkByWaId(message.from, message.phone || null);
    if (!link) return handleUnknown(message);
    if (message.phone && link.phone !== message.phone) await repository.setPhone?.(link.userId, message.phone);
    const row = await loadUser(link.userId);
    if (!allowed(row)) { await sendText(replyTo(message), REPLIES.notAllowed); return { outcome: 'not-allowed' }; }
    if (!message.text) { await sendText(replyTo(message), REPLIES.onlyText); return { outcome: 'only-text' }; }
    await markRead(message.messageId);
    const user = sessionUser(row);
    const at = now();
    let saved;
    try {
      const chat = await conversationFor(user, link, at);
      saved = await runWithAiContext({ actorId: user.userId, module: 'whatsapp', route: 'POST /api/whatsapp/webhook' }, () => conversations().send({ user, id: chat.id, question: message.text, session: null }));
    } catch (failure) {
      if (failure.status === 409) { await sendText(replyTo(message), REPLIES.busy); return { outcome: 'busy' }; }
      logger.error('[WhatsApp] Bria no pudo responder:', failure.code || failure.message || failure);
      await sendText(replyTo(message), REPLIES.failed);
      return { outcome: 'failed' };
    }
    const turn = [...(saved?.turns || [])].reverse().find((item) => item.role === 'assistant');
    await sendText(replyTo(message), answerForWhatsApp(turn));
    await repository.touch(link.userId, at);
    return { outcome: 'answered', conversationId: saved?.id || null };
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
    if (!messages.length) logger.info?.(`[WhatsApp] Aviso sin mensajes para atender (número esperado ${c.phoneNumberId || 'sin configurar'}): ${describeNotice(body)}`);
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

  const status = async (userId) => {
    const link = await repository.linkByUser(userId);
    const c = config();
    return { configured: configured(), number: c.number, numberDisplay: displayPhone(c.number), linked: Boolean(link), phone: link ? (displayPhone(link.phone || link.waId) || null) : null, linkedAt: link?.linkedAt || null, lastMessageAt: link?.lastMessageAt || null };
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

  return { handleWebhook, verificationChallenge: (query) => webhookChallenge(query, config().verifyToken), processMessage, status, createLinkCode, unlink, configured };
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
