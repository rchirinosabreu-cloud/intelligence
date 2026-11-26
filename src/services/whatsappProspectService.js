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
  canReplyFreely, cleanReply, nextStatus, CLOSED_STAGES, PROSPECT_TEXT_MAX,
  consentAnswer, CONSENT_BUTTONS, CONSENT_THANKS_TEXT, CONSENT_DECLINED_TEXT
} from '../lib/whatsappProspects.js';
import { PRIVACY_POLICY_VERSION } from '../lib/privacyPolicy.js';
import { shouldRemindConsent, CONSENT_REMINDER_TEXT } from '../lib/whatsappProspectAgent.js';
import { getProspectAgent } from './whatsappProspectAgentService.js';
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
    dataAuthorizedAt: row.dataAuthorizedAt || null,
    authorizationPending: !row.dataAuthorizedAt,
    botPausedAt: row.botPausedAt || null,
    botPausedReason: row.botPausedReason || null,
    brief: row.brief || null,
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
  logger = console,
  prospectAgent = undefined
} = {}) => {
  // Bria con IA (src/services/whatsappProspectAgentService.js). `null` la apaga; sin pasarla, la del servicio.
  const agent = () => (prospectAgent === undefined ? (prospectAgent = getProspectAgent()) : prospectAgent);
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
   * «No acepto»: se borra la conversación y el contacto. Si la oportunidad la creó su mensaje y nadie del equipo la ha
   * gestionado, se retira (sin nombre ni número, descartada y archivada); si ya era una oportunidad trabajada, queda
   * una nota y se avisa para que el equipo decida qué más retirar.
   */
  const decline = async (contact, { send, at }) => {
    const outcome = await db.$transaction(async (tx) => {
      const lead = contact.leadId ? await tx.crmLead.findUnique({ where: { id: contact.leadId } }) : null;
      const worked = lead ? await tx.crmActivity.count({ where: { leadId: lead.id, authorId: { not: null } } }) : 0;
      const retire = Boolean(lead) && contact.createdLeadId === lead.id && worked === 0;
      await tx.crmWhatsAppMessage.deleteMany({ where: { contactId: contact.id } });
      await tx.crmWhatsAppContact.delete({ where: { id: contact.id } });
      if (retire) {
        await tx.crmLead.update({
          where: { id: lead.id },
          data: {
            contactName: 'Datos retirados por su titular', phone: null, email: null, company: null, companyKey: null, notes: null,
            stage: 'DESCARTADO', lostReason: 'No autorizó el tratamiento de sus datos', closedAt: at, archivedAt: at, nextAction: null, nextFollowUpAt: null
          }
        });
      } else if (lead) {
        await tx.crmActivity.create({ data: { leadId: lead.id, type: 'NOTA', occurredAt: at, note: 'No autorizó por WhatsApp el tratamiento de sus datos: se borró la conversación. Revisar qué más se debe retirar de esta oportunidad.', authorId: null } });
      }
      return { lead, retire };
    });
    if (send) {
      try { await send(CONSENT_DECLINED_TEXT); }
      catch (failure) { logger.warn?.(`[WhatsApp prospectos] La confirmación del retiro no salió: ${failure.message}`); }
    }
    if (outcome.lead && !outcome.retire) {
      const ownerUserId = outcome.lead.ownerId ? (await db.teamMember.findUnique({ where: { id: outcome.lead.ownerId }, select: { userId: true } }).catch(() => null))?.userId || null : null;
      recipientsFor(db, ownerUserId)
        .then((userIds) => Promise.all(userIds.map((userId) => notify({
          userId,
          type: 'CRM_WHATSAPP_MESSAGE',
          message: `${outcome.lead.contactName || 'Un prospecto'} (${formatLeadCode(outcome.lead.consecutive)}) no autorizó el tratamiento de sus datos por WhatsApp.`,
          relatedId: outcome.lead.id,
          url: `/crm/oportunidades/${outcome.lead.id}`
        }))))
        .catch((failure) => logger.error?.('[WhatsApp prospectos] El aviso no salió:', failure?.message || failure));
    }
    return { outcome: 'prospect-declined', leadId: outcome.retire ? null : outcome.lead?.id || null };
  };

  /**
   * Un mensaje de alguien que no es del equipo. `send(text)` le responde por el mismo chat y devuelve el
   * identificador de Meta. Nunca lanza hacia el puente por un aviso o una bienvenida que no salió.
   */
  const receive = async (message, { send } = {}) => {
    const at = now();
    const answer = consentAnswer(message);
    if (answer === 'DECLINE') {
      const known = await db.crmWhatsAppContact.findUnique({ where: { waId: message.from } });
      if (known) return decline(known, { send, at });
    }
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
          ...(createdLead ? { createdLeadId: lead.id } : {}),
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
    let turn = null;
    const record = async (text, extra = {}) => {
      const metaMessageId = await send(text, extra);
      await db.crmWhatsAppMessage.create({ data: { contactId: contact.id, leadId: lead.id, direction: 'OUT', author: 'BRIA', authorName: 'Bria', metaMessageId: metaMessageId || null, text, status: 'SENT', occurredAt: now() } });
    };
    if (answer === 'ACCEPT' && !contact.dataAuthorizedAt && contact.welcomedAt) {
      // La prueba de la autorización: cuándo y con qué versión de la política, en el contacto y en la oportunidad.
      await db.crmWhatsAppContact.update({ where: { id: contact.id }, data: { dataAuthorizedAt: at, dataAuthorizationVersion: PRIVACY_POLICY_VERSION } });
      await db.crmActivity.create({ data: { leadId: lead.id, type: 'NOTA', occurredAt: at, note: `Autorizó por WhatsApp el tratamiento de sus datos (política ${PRIVACY_POLICY_VERSION}).`, authorId: null } })
        .catch((failure) => logger.warn?.(`[WhatsApp prospectos] La autorización quedó en el contacto pero no en la oportunidad: ${failure.message}`));
      contact.dataAuthorizedAt = at;
      // Con Bria activa, ella agradece y sigue con lo que la persona ya contó; si no, el agradecimiento fijo.
      if (send && agent()?.active(contact, at)) turn = { justAuthorized: true };
      else if (send) {
        try { await record(CONSENT_THANKS_TEXT); await db.crmWhatsAppContact.update({ where: { id: contact.id }, data: { lastOutboundAt: now() } }); }
        catch (failure) { logger.warn?.(`[WhatsApp prospectos] El agradecimiento no salió: ${failure.message}`); }
      }
    } else if (send && !contact.dataAuthorizedAt && shouldWelcome(contact, at)) {
      const text = welcomeText({ name: contact.profileName, privacyUrl: privacyUrl() });
      try {
        const metaMessageId = await send(text, { buttons: CONSENT_BUTTONS });
        await db.crmWhatsAppMessage.create({ data: { contactId: contact.id, leadId: lead.id, direction: 'OUT', author: 'BRIA', authorName: 'Bria', metaMessageId: metaMessageId || null, text, status: 'SENT', occurredAt: now() } });
        await db.crmWhatsAppContact.update({ where: { id: contact.id }, data: { welcomedAt: at, lastOutboundAt: now() } });
      } catch (failure) {
        logger.warn?.(`[WhatsApp prospectos] La bienvenida no salió: ${failure.message}`);
      }
    } else if (send && contact.dataAuthorizedAt) {
      turn = {};
    } else if (send && shouldRemindConsent(contact, at)) {
      // Escribió sin tocar «Acepto»: sin autorización su mensaje no va a la IA; se le recuerda con los botones.
      try {
        await record(CONSENT_REMINDER_TEXT, { buttons: CONSENT_BUTTONS });
        await db.crmWhatsAppContact.update({ where: { id: contact.id }, data: { consentReminderAt: at, lastOutboundAt: now() } });
      } catch (failure) {
        logger.warn?.(`[WhatsApp prospectos] El recordatorio de autorización no salió: ${failure.message}`);
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
    let agentResult = null;
    if (turn && agent()) {
      try { agentResult = await agent().respond({ contact, lead, send: (text) => send(text), ...turn }); }
      catch (failure) { logger.warn?.(`[WhatsApp prospectos] Bria no pudo atender: ${failure.message}`); }
    }
    return { outcome: createdLead ? 'prospect-new' : 'prospect-message', leadId: lead.id, ...(agentResult ? { agent: agentResult } : {}) };
  };

  /** La conversación de WhatsApp de una oportunidad, para su ficha. */
  const conversationForLead = async (leadId) => {
    const at = now();
    const lead = await db.crmLead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) throw httpError(404, 'Oportunidad no encontrada.');
    const contacts = await db.crmWhatsAppContact.findMany({ where: { leadId }, orderBy: { lastInboundAt: 'desc' } });
    const rows = await db.crmWhatsAppMessage.findMany({ where: { leadId }, orderBy: { occurredAt: 'desc' }, take: MESSAGES_SHOWN });
    return { contacts: contacts.map((row) => serializeContact(row, at)), messages: rows.reverse().map(serializeMessage), maxLength: PROSPECT_TEXT_MAX, briaAvailable: Boolean(agent()?.available()) };
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
    // Quien responde desde la ficha toma la conversación: Bria deja de contestar hasta que se la devuelvan.
    await db.crmWhatsAppContact.update({ where: { id: contact.id }, data: { lastOutboundAt: at, ...(contact.botPausedAt ? {} : { botPausedAt: at, botPausedReason: `${author?.name || 'El equipo'} respondió desde la ficha.` }) } });
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

  /** El equipo toma la conversación o se la devuelve a Bria. */
  const setBria = async (leadId, payload = {}, actor = {}) => {
    if (typeof payload.active !== 'boolean') throw httpError(400, 'Indica si Bria atiende o no esta conversación.');
    if (!agent() || (payload.active && !agent().available())) throw httpError(409, 'Bria no puede atender prospectos todavía: falta activar la IA en el servidor.');
    const row = await agent().setActive(leadId, payload, actor);
    return { contact: serializeContact(row, now()) };
  };

  return { receive, conversationForLead, reply, recordStatuses, setBria };
};

let instance;
export const getWhatsAppProspectService = () => instance ||= createWhatsAppProspectService();
