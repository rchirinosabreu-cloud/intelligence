// Bria en WhatsApp (Rodny, 20 de octubre de 2026): el puente entre el número de la agencia y el motor de Bria de
// siempre. Lo que llega por WhatsApp entra a una conversación de Bria de la persona vinculada —con su identidad,
// sus permisos y las mismas puertas que el chat de la plataforma— y lo que Bria responde sale como texto por la
// API de Meta. No hay navegador: cada mensaje lleva una sesión corta de la persona (whatsappSession.js, 22 de
// octubre de 2026) para que las manos de Bria en la plataforma entren por las mismas puertas que el navegador.
import prisma from '../lib/prisma.js';
import { canUseBria } from '../lib/briaLivingMemory.js';
import { runWithAiContext } from '../lib/aiRequestContext.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { META_GRAPH_ORIGIN, META_GRAPH_VERSION } from './metaGraphService.js';
import { createWhatsAppLinkRepository } from './whatsappLinkRepository.js';
import { signWhatsAppSession } from '../lib/whatsappSession.js';
import {
  verifyMetaSignature, webhookChallenge, parseInboundMessages, describeNotice, isStatusOnlyNotice, maskWaId, linkCodeIn, generateLinkCode, linkMessage, displayPhone, waMeLink,
  splitForWhatsApp, replyForWhatsApp, textWithOptions, optionsMessagePayload, textMessagePayload, typingPayload, REPLIES, LINK_CODE_TTL_MS, UNKNOWN_SENDER_REPLIES_PER_DAY,
  INTERACTIVE_BODY_MAX, isMetaMediaUrl, mediaFileName, WHATSAPP_MEDIA_MAX_BYTES
} from '../lib/whatsappBridge.js';
/** Cuánto se espera a que la persona termine de mandar lo que manda seguido (la foto y luego el texto). */
export const WHATSAPP_BATCH_WINDOW_MS = 2500;
import {
  ALERT_KINDS, ALERT_ACTIONS, isWindowOpen, alertsEnabled, withinAlertHours, isAlertCurrent, parseAlertReplyId, alertOptions, templateMessagePayload
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
  actions = {},
  signSession = signWhatsAppSession,
  // Lo que alguien manda seguido (la foto y enseguida «regístralo») se junta en una sola respuesta.
  batchWindowMs = WHATSAPP_BATCH_WINDOW_MS,
  delay = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); })
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

  // Un archivo recibido (22 de octubre de 2026): Meta da su dirección por el identificador y se descarga con el mismo
  // token, en la cabecera. Solo de sus servidores, por https, y hasta 20 MB.
  const readMedia = async (path, { json = true } = {}) => {
    const response = await fetchImpl(path, { headers: { Authorization: `Bearer ${config().token}` }, signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    if (!response.ok) throw httpError(response.status || 502, `Meta respondió ${response.status} al pedir el archivo`, 'WHATSAPP_MEDIA');
    return json ? response.json() : response;
  };
  const downloadMedia = async (media, messageId) => {
    const info = await readMedia(`${META_GRAPH_ORIGIN}/${META_GRAPH_VERSION}/${encodeURIComponent(media.id)}?phone_number_id=${encodeURIComponent(config().phoneNumberId)}`);
    if (Number(info?.file_size) > WHATSAPP_MEDIA_MAX_BYTES) throw httpError(413, 'Archivo demasiado grande', 'WHATSAPP_MEDIA_TOO_BIG');
    if (!isMetaMediaUrl(info?.url)) throw httpError(502, 'La dirección del archivo no es de Meta', 'WHATSAPP_MEDIA');
    const response = await readMedia(info.url, { json: false });
    if (response.url && !isMetaMediaUrl(response.url)) throw httpError(502, 'El archivo se redirigió fuera de Meta', 'WHATSAPP_MEDIA');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw httpError(502, 'El archivo llegó vacío', 'WHATSAPP_MEDIA');
    if (buffer.length > WHATSAPP_MEDIA_MAX_BYTES) throw httpError(413, 'Archivo demasiado grande', 'WHATSAPP_MEDIA_TOO_BIG');
    const mimetype = media.mimeType || info.mime_type || 'application/octet-stream';
    return { buffer, originalname: mediaFileName({ ...media, mimeType: mimetype }, messageId), mimetype: media.kind === 'audio' ? mimetype : mimetype.split(';')[0].trim(), size: buffer.length };
  };
  const sendText = async (to, text) => { for (const part of splitForWhatsApp(text)) await messages(textMessagePayload(to, part)); };
  // Las opciones acompañan el último trozo de la respuesta, sin añadir una voz del transporte.
  // Si Meta no acepta los botones, las opciones se dicen en texto.
  const sendReply = async (to, { text, options = [], optionsUnavailable = null }) => {
    const parts = splitForWhatsApp(text);
    if (!options.length || !parts.length) { for (const part of parts) await messages(textMessagePayload(to, part)); return; }
    parts.push(...splitForWhatsApp(parts.pop(), INTERACTIVE_BODY_MAX));
    for (const part of parts.slice(0, -1)) await messages(textMessagePayload(to, part));
    const body = parts.at(-1);
    const payload = optionsMessagePayload(to, body, options);
    const fallback = optionsUnavailable ? `${body}\n\n${optionsUnavailable}` : textWithOptions({ text: body, options });
    if (!payload) { await sendText(to, fallback); return; }
    try { await messages(payload); }
    catch (failure) {
      logger.warn?.(`[WhatsApp] Los botones no salieron (${failure.message}); van en texto.`);
      await sendText(to, fallback);
    }
  };
  const markRead = async (messageId) => {
    try { await graph(`${config().phoneNumberId}/messages`, typingPayload(messageId)); }
    catch (failure) { logger.warn?.(`[WhatsApp] No se pudo marcar como leído: ${failure.message}`); }
  };

  const loadUser = async (userId) => db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, isActive: true, modulePermissions: true, sessionVersion: true, hasFinancialAccess: true, financialRole: true, teamMember: { select: { isActive: true } } }
  });
  // La sesión corta de este mensaje (22 de octubre de 2026): sin ella Bria no tiene manos en la plataforma. Si no se
  // puede firmar, Bria sigue respondiendo sin esas manos; nunca se cae el mensaje por esto.
  const sessionFor = (row) => {
    try { return { token: signSession(row) }; }
    catch (failure) { logger.warn?.(`[WhatsApp] Sin sesión corta para este mensaje: ${failure.message}`); return null; }
  };
  const allowed = (row) => Boolean(row) && row.isActive !== false && row.teamMember?.isActive !== false && canUseBria(row);
  // La misma forma que deja `authenticateToken` en req.user: el motor de Bria no distingue por dónde llegó la persona.
  const sessionUser = (row) => ({ userId: row.id, id: row.id, name: row.name, email: row.email, role: row.role, modulePermissions: row.modulePermissions, hasFinancialAccess: row.hasFinancialAccess, financialRole: row.financialRole, sessionVersion: row.sessionVersion, isActive: row.isActive });

  // Cada día es una conversación, como en la plataforma: así el aprendizaje nocturno la lee por día y el historial
  // no crece sin fin. Dentro del mismo día se sigue la misma, para que «Confirmar» encuentre su acción.
  const conversationFor = async (user, link, at) => {
    const service = conversations();
    const sameDay = link.lastMessageAt && bogotaDay(new Date(link.lastMessageAt)) === bogotaDay(at);
    if (link.conversationId && sameDay) {
      try { return await service.read(user, link.conversationId); }
      catch (failure) { if (failure.status !== 404) throw failure; }
    }
    return service.create(user);
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
  const sendAlertContent = (to, alert) => sendReply(to, {
    text: alert.text, options: alertOptions(alert),
    // Sin botón no hay una selección inequívoca de la lectura. No prometer que escribir su rótulo cambia de chat.
    optionsUnavailable: alert.conversationId ? 'No pude mostrar el botón para revisar esta lectura. Ábrela en el chat de Bria de la plataforma.' : null
  });

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
    const gone = async () => { await sendText(to, REPLIES.alertGone); return { outcome: 'alert-gone' }; };
    if (!alert || alert.userId !== link.userId || !isAlertCurrent(alert, now())) return gone();
    let sourceChat = null;
    if (alert.conversationId) {
      try { sourceChat = await conversations().read(user, alert.conversationId); }
      catch (failure) { if ([403, 404].includes(failure.status)) return gone(); throw failure; }
      // `read` exige propietario y sanea lo que ya no puede ver: un turno sin permiso pierde su metadata.
      // No reenviar la copia del aviso si esa lectura se borró, cambió de acceso o apunta a otro origen.
      if (!sourceChat?.turns?.some((turn) => turn.role === 'assistant' && turn.note && `${turn.note}:${turn.dayKey || turn.monthKey}` === alert.sourceRef)) return gone();
    }
    if (parsed.index === 'open') {
      await repository.markAlertOpened?.(alert.id, now());
      await sendAlertContent(to, alert);
      return { outcome: 'alert-opened' };
    }
    const button = alert.buttons?.[parsed.index];
    if (!button) { await sendText(to, REPLIES.alertGone); return { outcome: 'alert-gone' }; }
    if (button.ask) return { ask: button.ask, sourceChat };
    if (!ALERT_ACTIONS.includes(button.act)) { await sendText(to, REPLIES.alertGone); return { outcome: 'alert-gone' }; }
    try { await sendText(to, await runAlertAction(user, button)); }
    catch (failure) {
      const told = failure.status >= 400 && failure.status < 500 && failure.message;
      if (!told) logger.error('[WhatsApp] Un botón de aviso falló:', failure.code || failure.message || failure);
      await sendText(to, told || REPLIES.failed);
    }
    return { outcome: 'alert-action', action: button.act };
  };

  // `message.medias` llega cuando se juntaron varios mensajes seguidos (ver `accept`); uno suelto trae `media`.
  const processMessage = async (message, { alreadyRemembered = false } = {}) => {
    if (!alreadyRemembered && !await repository.rememberInbound(message.messageId, message.from)) return { skipped: 'duplicate' };
    // Se busca por BSUID y por número: un vínculo hecho con uno se reconoce aunque el siguiente mensaje traiga el otro.
    const link = await repository.linkByWaId(message.from, message.phone || null);
    if (!link) return handleUnknown(message);
    if (message.phone && link.phone !== message.phone) await repository.setPhone?.(link.userId, message.phone);
    // Cada mensaje de la persona abre otra vez la ventana de 24 horas en la que Bria le puede escribir libre.
    await repository.markInbound?.(link.userId, now());
    const row = await loadUser(link.userId);
    if (!allowed(row)) { await sendText(replyTo(message), REPLIES.notAllowed); return { outcome: 'not-allowed' }; }
    const medias = message.medias || (message.media ? [message.media] : []);
    if (!message.text && !medias.length) { await sendText(replyTo(message), message.type === 'unsupported' ? REPLIES.unsupported : REPLIES.onlyText); return { outcome: 'only-text' }; }
    await markRead(message.messageId);
    const user = sessionUser(row);
    let question = message.text || '';
    // Fotos y documentos entran al chat como archivos; una nota de voz se transcribe y se responde a lo que se dijo.
    const files = [];
    for (const media of medias) {
      let upload;
      try { upload = await downloadMedia(media, message.messageId); }
      catch (failure) {
        if (failure.code === 'WHATSAPP_MEDIA_TOO_BIG') { await sendText(replyTo(message), REPLIES.mediaTooBig); return { outcome: 'media-too-big' }; }
        logger.error('[WhatsApp] No se pudo descargar un archivo:', failure.code || failure.message || failure);
        await sendText(replyTo(message), REPLIES.mediaFailed);
        return { outcome: 'media-failed' };
      }
      if (media.kind !== 'audio') { files.push(upload); continue; }
      try { question = [question, (await conversations().transcribe(user, upload)).text].filter(Boolean).join('\n'); }
      catch (failure) {
        logger.warn?.(`[WhatsApp] Nota de voz sin transcribir: ${failure.code || failure.message}`);
        await sendText(replyTo(message), REPLIES.noSpeech);
        return { outcome: 'no-speech' };
      }
    }
    const at = now();
    let saved, chat, selectedChat = null;
    try {
      const alertReply = parseAlertReplyId(message.replyId);
      if (alertReply) {
        const handled = await handleAlertReply(user, link, message, alertReply);
        if (!handled.ask) return handled;
        question = handled.ask;
        selectedChat = handled.sourceChat;
      }
      chat = selectedChat || await conversationFor(user, link, at);
      if (message.replyId && !alertReply) {
        const lastAssistant = [...(chat.turns || [])].reverse().find((turn) => turn.role === 'assistant');
        const option = message.replyId.startsWith('c:')
          ? replyForWhatsApp(lastAssistant, { conversationId: chat.id, revision: chat.revision }).options.find((row) => row.id === message.replyId)
          : null;
        if (!option) { await sendText(replyTo(message), REPLIES.optionGone); return { outcome: 'stale-option' }; }
        // La opción pertenece a la respuesta actual. Su texto sale del turno guardado, no del título de Meta.
        question = option.label;
      }
      // Capturar primero el chat y quitar el vínculo antes de que el motor guarde otra respuesta. Si el motor,
      // Meta o el guardado final fallan, un «sí» posterior no puede confirmar un resumen que nunca llegó.
      // También vale para un chat ya activo; si no podemos invalidarlo, no llamamos al motor.
      await repository.setConversation(link.userId, null);
      saved = await runWithAiContext({ actorId: user.userId, module: 'whatsapp', route: 'POST /api/whatsapp/webhook' }, () => conversations().send({ user, id: chat.id, question, files, session: sessionFor(row), expectedRevision: chat.revision }));
    } catch (failure) {
      if (failure.code === 'BRIA_CONVERSATION_STALE') { await sendText(replyTo(message), failure.message); return { outcome: 'stale-conversation' }; }
      if (failure.status === 409) { await sendText(replyTo(message), REPLIES.busy); return { outcome: 'busy' }; }
      if (failure.code === 'BRIA_PLATFORM_SESSION') { await sendText(replyTo(message), REPLIES.needsPlatform); return { outcome: 'needs-platform' }; }
      // Un rechazo de la plataforma o de una regla (4xx) trae su motivo en palabras: se dice, como en el chat de la plataforma.
      if (failure.status >= 400 && failure.status < 500 && failure.message) { await sendText(replyTo(message), failure.message); return { outcome: 'rejected', reason: failure.code || null }; }
      logger.error('[WhatsApp] Bria no pudo responder:', failure.code || failure.message || failure);
      await sendText(replyTo(message), selectedChat ? 'No pude revisar la lectura. Toca «Revisar lectura» para retomarla.' : REPLIES.failed);
      return { outcome: 'failed' };
    }
    const turn = [...(saved?.turns || [])].reverse().find((item) => item.role === 'assistant');
    try { await sendReply(replyTo(message), replyForWhatsApp(turn, { conversationId: chat.id, revision: saved?.revision })); }
    catch (failure) {
      logger.error('[WhatsApp] No se pudo entregar la respuesta:', failure.code || failure.message || failure);
      return { outcome: 'delivery-failed' };
    }
    // La conversación solo vuelve a quedar activa tras entregar su respuesta completa. La lectura original
    // permanece en su aviso para retomarla si falla; los demás chats conservan su historial en la plataforma.
    try {
      await repository.touch(link.userId, at);
      await repository.setConversation(link.userId, chat.id);
    } catch (failure) {
      logger.error('[WhatsApp] No se pudo enlazar la conversación:', failure.code || failure.message || failure);
      await sendText(replyTo(message), selectedChat
        ? 'No pude enlazar esta lectura. Toca «Revisar lectura» para retomarla antes de confirmar.'
        : 'No pude conservar este chat para continuar por aquí. Retómalo en Bria de la plataforma antes de confirmar.');
      return { outcome: 'conversation-link-failed' };
    }
    return { outcome: 'answered', conversationId: saved?.id || null };
  };

  /**
   * Un aviso de la plataforma por WhatsApp (22 de octubre de 2026). Se guarda una sola vez por persona y origen; dentro
   * de la ventana de 24 horas sale entero y con botones, fuera de ella como la plantilla `bria_aviso`. Nunca lanza:
   * un aviso que no sale queda anotado y la campana sigue siendo la que avisa.
   */
  const deliverAlert = async ({ userId, kind, sourceRef, conversationId = null, topic, text, buttons = [] }) => {
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
    const alert = await repository.saveAlert({ userId, kind, sourceRef, conversationId, topic, text: String(text).trim(), buttons, createdAt: at });
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
      if (message.type === 'unsupported') logger.warn?.(`[WhatsApp] Contenido no entregado por Meta: tipo=unsupported errores=${message.errorCodes?.join(',') || 'sin código'}.`);
      accept(message);
    }
    return { status: 200, body: { accepted: true, messages: messages.length } };
  };

  // Lo que alguien manda seguido se junta (22 de octubre de 2026): en WhatsApp la gente manda la foto y enseguida
  // «regístralo» como dos mensajes. Se espera un momento, se juntan en una sola pregunta con sus archivos y Bria
  // responde una vez; y lo de cada persona se atiende en orden, para que el segundo no choque con el primero.
  const inbox = new Map();
  const queues = new Map();
  const enqueue = (key, work) => {
    const run = (queues.get(key) || Promise.resolve()).catch(() => {}).then(work);
    queues.set(key, run);
    run.finally(() => { if (queues.get(key) === run) queues.delete(key); }).catch(() => {});
    return run;
  };
  const flush = async (key) => {
    const batch = inbox.get(key) || [];
    inbox.delete(key);
    const fresh = [];
    for (const message of batch) if (await repository.rememberInbound(message.messageId, message.from)) fresh.push(message);
    if (!fresh.length) return [{ message: batch.at(-1), result: { skipped: 'duplicate' } }];
    // Un toque de botón es una respuesta concreta: se atiende tal cual, en su orden.
    if (fresh.length === 1 || fresh.some((message) => message.replyId)) {
      const out = [];
      for (const message of fresh) out.push({ message, result: await processMessage(message, { alreadyRemembered: true }) });
      return out;
    }
    const last = fresh.at(-1);
    const merged = { ...last, text: fresh.map((message) => message.text).filter(Boolean).join('\n') || null, media: null, medias: fresh.map((message) => message.media).filter(Boolean).slice(0, 5), replyId: null };
    return [{ message: merged, result: await processMessage(merged, { alreadyRemembered: true }) }];
  };
  const accept = (message) => {
    const key = message.from;
    if (inbox.has(key)) { inbox.get(key).push(message); return; }
    inbox.set(key, [message]);
    scheduleWork(() => delay(batchWindowMs)
      .then(() => enqueue(key, () => flush(key)))
      .then((rows) => { for (const { message: done, result } of rows) logger.info?.(`[WhatsApp] Mensaje de ${maskWaId(done.from)} (${done.medias?.length ? `${done.type}+${done.medias.length} archivos` : done.type}): ${result?.outcome || result?.skipped || 'sin resultado'}${result?.reason ? ` (${result.reason})` : ''}.`); })
      .catch((failure) => logger.error('[WhatsApp] Falló un mensaje:', failure.code || failure.message || failure)));
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
