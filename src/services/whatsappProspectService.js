// Prospectos por WhatsApp (Rodny, 26 de noviembre de 2026). Quien escribe al número de la agencia sin haber vinculado
// su WhatsApp desde el perfil es un prospecto: entra solo al CRM como oportunidad (origen WhatsApp, el anuncio de Meta
// si vino de uno, responsable por defecto), su conversación queda en la ficha, recibe una bienvenida y quien lo
// atiende recibe el aviso en la campana. El equipo le responde desde la ficha dentro de las 24 horas que Meta deja.
// Reglas puras en src/lib/whatsappProspects.js; el puente (whatsappBridgeService.js) llama a `receive`.
import prisma from '../lib/prisma.js';
import { createNotification } from './notificationService.js';
import { resolveIntakeOwner, intakeRecipients, DEFAULT_INTAKE_OWNER } from './commercialRequestService.js';
import { addActivity } from './crmService.js';
import { formatLeadCode, bogotaDateKey } from '../lib/crmRules.js';
import { LEGAL_ENTITY } from '../components/public/legalEntity.js';
import { displayPhone } from '../lib/whatsappBridge.js';
import {
  parseReferral, originDetailFor, phoneKey, leadPhone, welcomeText, shouldWelcome, shouldNotify, inboundTextFor,
  canReplyFreely, cleanReply, nextStatus, CLOSED_STAGES, PROSPECT_TEXT_MAX
} from '../lib/whatsappProspects.js';
import { SERVICE_WINDOW_MS, WINDOW_MARGIN_MS } from '../lib/whatsappAlerts.js';

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const MESSAGES_SHOWN = 300;

const serializeMessage = (row) => ({
  id: row.id,
  direction: row.direction,
  author: row.author,
  authorName: row.authorName || null,
  type: row.type,
  text: row.text,
  status: row.status || null,
  error: row.error || null,
  referral: row.referral || null,
  occurredAt: row.occurredAt
});

const serializeContact = (row, at) => {
  const open = canReplyFreely(row, at);
  return {
    id: row.id,
    phone: displayPhone(row.phone) || null,
    profileName: row.profileName || null,
    lastInboundAt: row.lastInboundAt || null,
    canReply: open,
    windowClosesAt: row.lastInboundAt ? new Date(new Date(row.lastInboundAt).getTime() + SERVICE_WINDOW_MS - WINDOW_MARGIN_MS) : null
  };
};

const isOpenLead = (lead) => Boolean(lead) && !lead.archivedAt && !CLOSED_STAGES.includes(lead.stage);

export const createWhatsAppProspectService = ({
  db = prisma,
  env = process.env,
  now = () => new Date(),
  notify = createNotification,
  resolveOwner = resolveIntakeOwner,
  recipientsFor = intakeRecipients,
  logActivity = addActivity,
  logger = console
} = {}) => {
  const privacyUrl = () => {
    const base = String(env.APP_URL || LEGAL_ENTITY.platformUrl).trim().replace(/\/+$/, '');
    return /^https:\/\//.test(base) ? `${base}/privacidad` : null;
  };

  // La oportunidad abierta de la misma persona, por su número: los últimos 10 dígitos, como sea que esté escrito.
  const openLeadByPhone = async (tx, key) => {
    if (!key) return null;
    const candidates = await tx.crmLead.findMany({
      where: { archivedAt: null, stage: { notIn: CLOSED_STAGES }, phone: { contains: key.slice(-4) } },
      orderBy: { enteredAt: 'desc' },
      take: 20
    });
    return candidates.find((lead) => phoneKey(lead.phone) === key) || null;
  };

  /**
   * Un mensaje de alguien que no es del equipo. `send(text)` le responde por el mismo chat y devuelve el
   * identificador de Meta. Nunca lanza hacia el puente por un aviso o una bienvenida que no salió.
   */
  const receive = async (message, { send } = {}) => {
    const at = now();
    const referral = parseReferral(message.referral);
    const key = phoneKey(message.phone);
    const owner = await resolveOwner(db, env.CRM_INTAKE_OWNER || DEFAULT_INTAKE_OWNER).catch(() => null);
    const saved = await db.$transaction(async (tx) => {
      let contact = await tx.crmWhatsAppContact.findUnique({ where: { waId: message.from } });
      if (!contact) {
        contact = await tx.crmWhatsAppContact.create({ data: { waId: message.from, phone: message.phone || null, phoneKey: key, profileName: message.profileName || null } });
      }
      const previousInboundAt = contact.lastInboundAt;
      let lead = contact.leadId ? await tx.crmLead.findUnique({ where: { id: contact.leadId } }) : null;
      if (!isOpenLead(lead)) lead = await openLeadByPhone(tx, key || contact.phoneKey);
      let createdLead = false;
      if (!lead) {
        const originDetail = originDetailFor(referral);
        lead = await tx.crmLead.create({
          data: {
            origin: 'WHATSAPP',
            originDetail,
            enteredAt: at,
            enteredAtEstimated: false,
            contactName: message.profileName || contact.profileName || leadPhone(message.phone) || 'Prospecto de WhatsApp',
            phone: leadPhone(message.phone || contact.phone),
            stage: 'POR_GESTIONAR',
            ownerId: owner?.id || null,
            nextAction: 'Responder por WhatsApp',
            nextFollowUpAt: new Date(`${bogotaDateKey(at)}T00:00:00.000Z`),
            createdById: null
          }
        });
        await tx.crmActivity.create({
          data: { leadId: lead.id, type: 'NOTA', occurredAt: at, note: `Llegó por WhatsApp. ${originDetail}.`, result: 'Pendiente de primera respuesta.', authorId: null }
        });
        createdLead = true;
      }
      contact = await tx.crmWhatsAppContact.update({
        where: { id: contact.id },
        data: {
          leadId: lead.id,
          lastInboundAt: at,
          ...(message.phone ? { phone: message.phone, phoneKey: key } : {}),
          ...(message.profileName ? { profileName: message.profileName } : {})
        }
      });
      await tx.crmWhatsAppMessage.create({
        data: {
          contactId: contact.id, leadId: lead.id, direction: 'IN', author: 'CONTACT', metaMessageId: message.messageId || null,
          type: String(message.type || 'text').slice(0, 30), text: inboundTextFor(message), referral: referral || undefined, occurredAt: at
        }
      });
      await tx.crmLead.update({ where: { id: lead.id }, data: { updatedAt: at } });
      return { contact, lead, createdLead, previousInboundAt };
    });

    const { contact, lead, createdLead, previousInboundAt } = saved;
    if (send && shouldWelcome(contact, at)) {
      const text = welcomeText({ name: contact.profileName, privacyUrl: privacyUrl() });
      try {
        const metaMessageId = await send(text);
        await db.crmWhatsAppMessage.create({ data: { contactId: contact.id, leadId: lead.id, direction: 'OUT', author: 'BRIA', authorName: 'Bria', metaMessageId: metaMessageId || null, text, status: 'SENT', occurredAt: now() } });
        await db.crmWhatsAppContact.update({ where: { id: contact.id }, data: { welcomedAt: at, lastOutboundAt: now() } });
      } catch (failure) {
        logger.warn?.(`[WhatsApp prospectos] La bienvenida no salió: ${failure.message}`);
      }
    }

    if (shouldNotify({ createdLead, previousInboundAt }, at)) {
      const name = lead.contactName || lead.company || 'Prospecto de WhatsApp';
      const code = formatLeadCode(lead.consecutive);
      const ownerUserId = lead.ownerId ? (await db.teamMember.findUnique({ where: { id: lead.ownerId }, select: { userId: true } }).catch(() => null))?.userId || null : null;
      recipientsFor(db, ownerUserId)
        .then((userIds) => Promise.all(userIds.map((userId) => notify({
          userId,
          type: 'CRM_WHATSAPP_MESSAGE',
          message: createdLead ? `Nuevo lead por WhatsApp: ${name} (${code}). ${lead.originDetail || ''}`.trim() : `${name} (${code}) volvió a escribir por WhatsApp.`,
          relatedId: lead.id,
          url: `/crm/oportunidades/${lead.id}`
        }))))
        .catch((failure) => logger.error?.('[WhatsApp prospectos] El aviso no salió:', failure?.message || failure));
    }
    return { outcome: createdLead ? 'prospect-new' : 'prospect-message', leadId: lead.id };
  };

  /** La conversación de WhatsApp de una oportunidad, para su ficha. */
  const conversationForLead = async (leadId) => {
    const at = now();
    const lead = await db.crmLead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) throw httpError(404, 'Oportunidad no encontrada.');
    const contacts = await db.crmWhatsAppContact.findMany({ where: { leadId }, orderBy: { lastInboundAt: 'desc' } });
    const rows = await db.crmWhatsAppMessage.findMany({ where: { leadId }, orderBy: { occurredAt: 'desc' }, take: MESSAGES_SHOWN });
    return { contacts: contacts.map((row) => serializeContact(row, at)), messages: rows.reverse().map(serializeMessage), maxLength: PROSPECT_TEXT_MAX };
  };

  /**
   * Una respuesta del equipo desde la ficha. `sendMessage(to, text)` la manda por Meta y devuelve su identificador.
   * Queda en la conversación y como gestión «WhatsApp» de la oportunidad (cuenta como primer contacto).
   */
  const reply = async (leadId, payload = {}, actor = {}, { sendMessage } = {}) => {
    const cleaned = cleanReply(payload.text);
    if (cleaned.error) throw httpError(400, cleaned.error);
    if (typeof sendMessage !== 'function') throw httpError(503, 'WhatsApp todavía no está configurado en el servidor.');
    const at = now();
    const contact = await db.crmWhatsAppContact.findFirst({ where: { leadId }, orderBy: { lastInboundAt: 'desc' } });
    if (!contact) throw httpError(404, 'Esta oportunidad no tiene una conversación de WhatsApp.');
    if (!canReplyFreely(contact, at)) {
      throw httpError(409, 'Pasaron más de 24 horas desde el último mensaje de esta persona. WhatsApp solo deja escribirle con una plantilla aprobada; mientras llegan las plantillas, llámala o escríbele por otro medio.');
    }
    const userId = actor.userId || actor.id || null;
    const author = userId ? await db.user.findUnique({ where: { id: userId }, select: { name: true } }).catch(() => null) : null;
    let metaMessageId;
    try { metaMessageId = await sendMessage(contact.phone || contact.waId, cleaned.text); }
    catch (failure) {
      logger.warn?.(`[WhatsApp prospectos] Una respuesta del equipo no salió: ${failure.message}`);
      throw httpError(502, 'WhatsApp no aceptó el mensaje. Inténtalo de nuevo en un momento.');
    }
    const row = await db.crmWhatsAppMessage.create({
      data: { contactId: contact.id, leadId, direction: 'OUT', author: 'TEAM', authorId: userId, authorName: author?.name || null, metaMessageId: metaMessageId || null, text: cleaned.text, status: 'SENT', occurredAt: at }
    });
    await db.crmWhatsAppContact.update({ where: { id: contact.id }, data: { lastOutboundAt: at } });
    let lead = null;
    try {
      lead = (await logActivity(db, leadId, { type: 'WHATSAPP', occurredAt: at.toISOString(), note: cleaned.text.slice(0, 500), result: 'Enviado desde Intelligence' }, actor, at)).lead;
    } catch (failure) {
      logger.warn?.(`[WhatsApp prospectos] El mensaje salió pero no quedó como gestión: ${failure.message}`);
    }
    return { message: serializeMessage(row), lead };
  };

  /** Los estados de entrega que manda Meta (enviado, entregado, leído, fallido) sobre los mensajes que salieron. */
  const recordStatuses = async (statuses = []) => {
    for (const { messageId, status } of statuses) {
      const row = await db.crmWhatsAppMessage.findUnique({ where: { metaMessageId: messageId } }).catch(() => null);
      if (!row || row.direction !== 'OUT') continue;
      const next = nextStatus(row.status, status);
      if (next !== row.status) await db.crmWhatsAppMessage.update({ where: { id: row.id }, data: { status: next } });
    }
  };

  return { receive, conversationForLead, reply, recordStatuses };
};

let instance;
export const getWhatsAppProspectService = () => instance ||= createWhatsAppProspectService();
