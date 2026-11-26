// Bria conversa con los prospectos de WhatsApp (ver src/lib/whatsappProspectAgent.js): un modelo de la API de Claude
// por el SDK oficial y la misma salida gobernada que el resto de la IA. Responde, guarda el brief en el contacto,
// completa la oportunidad y, cuando toca, pasa la conversación al equipo y se calla hasta que se la devuelvan.
// Apagado sin ANTHROPIC_API_KEY; `WHATSAPP_PROSPECTS_AI=off` lo apaga aunque la clave exista (queda solo la bienvenida).
import Anthropic from '@anthropic-ai/sdk';
import prisma from '../lib/prisma.js';
import { governedFetch } from './aiEgress.js';
import { createNotification } from './notificationService.js';
import { intakeRecipients } from './commercialRequestService.js';
import { normalizeCompanyKey } from './crmService.js';
import { formatLeadCode, bogotaDateKey } from '../lib/crmRules.js';
import { canReplyFreely } from '../lib/whatsappProspects.js';
import {
  PROSPECT_AGENT_USE_CASE, AGENT_OUTPUT_SCHEMA, AGENT_REPLY_MAX, HANDOFF_FALLBACK_TEXT,
  agentInstructions, catalogText, agentMessages, turnNote, parseAgentOutput, mergeBrief, briefNote
} from '../lib/whatsappProspectAgent.js';

export const PROSPECT_AGENT_MODEL = 'claude-opus-5-5';
const AGENT_TIMEOUT_MS = 45_000;
const AGENT_MAX_TOKENS = 8_000;
const CATALOG_TTL_MS = 10 * 60 * 1000;

/** El modelo. Devuelve el JSON del esquema como texto, o lanza. Un rechazo de seguridad vuelve como `refusal`. */
export const createProspectBrain = ({ env = process.env, fetchImpl = governedFetch, Client = Anthropic, timeoutMs = AGENT_TIMEOUT_MS } = {}) => {
  const apiKey = String(env.ANTHROPIC_API_KEY || '').trim();
  if (!apiKey || String(env.WHATSAPP_PROSPECTS_AI || '').toLowerCase() === 'off') return null;
  const model = env.WHATSAPP_PROSPECTS_MODEL || PROSPECT_AGENT_MODEL;
  return {
    model,
    async reply({ instructions, catalog, note, messages }) {
      let response = null;
      const client = new Client({
        apiKey, baseURL: 'https://api.anthropic.com', maxRetries: 1, timeout: timeoutMs,
        fetch: async (url, init = {}) => (response = await fetchImpl(url, { ...init, governanceContext: { useCase: PROSPECT_AGENT_USE_CASE }, reportsStreamUsage: true }))
      });
      try {
        // Instrucciones y catálogo primero y fijos, para reutilizarlos de un mensaje a otro; lo del momento va al final.
        // Si el modelo declina por seguridad, la API reintenta con el modelo de respaldo que corresponda.
        const message = await client.beta.messages.stream({
          model, max_tokens: AGENT_MAX_TOKENS,
          betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
          output_config: { effort: env.WHATSAPP_PROSPECTS_EFFORT || 'low', format: { type: 'json_schema', schema: AGENT_OUTPUT_SCHEMA } },
          system: [
            { type: 'text', text: instructions },
            { type: 'text', text: `Catálogo de servicios:\n\n${catalog}`, cache_control: { type: 'ephemeral' } }
          ],
          messages: [...messages, { role: 'system', content: note }]
        }, { signal: AbortSignal.timeout(timeoutMs) }).finalMessage();
        response?.reportStreamUsage?.({ payload: { usage: message.usage } });
        if (message.stop_reason === 'refusal') return { refusal: true, model: message.model || model };
        if (message.stop_reason !== 'end_turn') throw new Error(`La respuesta no terminó: ${message.stop_reason || 'incompleta'}.`);
        return { text: message.content.filter((block) => block.type === 'text').map((block) => block.text).join('').trim(), model: message.model || model };
      } catch (error) {
        response?.reportStreamUsage?.({ failed: true });
        throw error;
      }
    }
  };
};

export const createProspectAgent = ({
  db = prisma,
  brain = undefined,
  env = process.env,
  now = () => new Date(),
  notify = createNotification,
  recipientsFor = intakeRecipients,
  logger = console
} = {}) => {
  const model = () => (brain === undefined ? (brain = createProspectBrain({ env })) : brain);
  let catalogCache = null;
  const catalog = async () => {
    if (catalogCache && now().getTime() - catalogCache.at < CATALOG_TTL_MS) return catalogCache.text;
    const services = await db.serviceCatalog.findMany({ where: { activo: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    catalogCache = { at: now().getTime(), text: catalogText(services) };
    return catalogCache.text;
  };

  const tellTeam = async (lead, message) => {
    const ownerUserId = lead.ownerId ? (await db.teamMember.findUnique({ where: { id: lead.ownerId }, select: { userId: true } }).catch(() => null))?.userId || null : null;
    const userIds = await recipientsFor(db, ownerUserId);
    await Promise.all(userIds.map((userId) => notify({ userId, type: 'CRM_WHATSAPP_MESSAGE', message, relatedId: lead.id, url: `/crm/oportunidades/${lead.id}` })));
  };

  const pause = async (contact, lead, reason, at) => {
    await db.crmWhatsAppContact.update({ where: { id: contact.id }, data: { botPausedAt: at, botPausedReason: reason } });
    await db.crmLead.update({ where: { id: lead.id }, data: { nextAction: `Seguir la conversación de WhatsApp: ${reason}`.slice(0, 250), nextFollowUpAt: new Date(`${bogotaDateKey(at)}T00:00:00.000Z`) } });
  };

  /** ¿Bria responde a este contacto ahora? */
  const active = (contact, at = now()) => Boolean(model()) && Boolean(contact?.dataAuthorizedAt) && !contact.botPausedAt && canReplyFreely(contact, at);

  /**
   * Un turno de Bria con el prospecto. `send(text)` responde por el mismo chat y devuelve el identificador de Meta.
   * Devuelve `{ replied, handoff }`. Nunca lanza: si algo falla, avisa al equipo y se calla.
   */
  const respond = async ({ contact, lead, send, justAuthorized = false }) => {
    const at = now();
    if (!active(contact, at) || typeof send !== 'function') return { replied: false, handoff: false, skipped: true };
    let parsed = null;
    try {
      const rows = await db.crmWhatsAppMessage.findMany({ where: { contactId: contact.id }, orderBy: { occurredAt: 'desc' }, take: 40 });
      const messages = agentMessages(rows.reverse());
      if (!messages.length) return { replied: false, handoff: false, skipped: true };
      const result = await model().reply({
        instructions: agentInstructions(),
        catalog: await catalog(),
        note: turnNote({ today: bogotaDateKey(at), contactName: contact.profileName, originDetail: lead.originDetail, justAuthorized }),
        messages
      });
      parsed = result.refusal ? { reply: '', handoff: true, handoffReason: 'Bria no pudo responder este mensaje.', brief: {} } : parseAgentOutput(result.text);
      if (!parsed) parsed = { reply: '', handoff: true, handoffReason: 'Bria no pudo entender este mensaje.', brief: {} };
    } catch (failure) {
      logger.warn?.(`[WhatsApp prospectos] Bria no pudo responder: ${failure.message}`);
      parsed = { reply: '', handoff: true, handoffReason: 'Bria no pudo responder (falla del servicio de IA).', brief: {}, failed: true };
    }

    const reply = (parsed.reply || (parsed.handoff ? HANDOFF_FALLBACK_TEXT : '')).slice(0, AGENT_REPLY_MAX * 2);
    let replied = false;
    if (reply) {
      try {
        const metaMessageId = await send(reply);
        await db.crmWhatsAppMessage.create({ data: { contactId: contact.id, leadId: lead.id, direction: 'OUT', author: 'BRIA', authorName: 'Bria', metaMessageId: metaMessageId || null, text: reply, status: 'SENT', occurredAt: now() } });
        replied = true;
      } catch (failure) {
        logger.warn?.(`[WhatsApp prospectos] La respuesta de Bria no salió: ${failure.message}`);
      }
    }

    const brief = mergeBrief(contact.brief, parsed.brief);
    await db.crmWhatsAppContact.update({ where: { id: contact.id }, data: { brief: brief || undefined, ...(replied ? { lastOutboundAt: now() } : {}) } });
    // Lo que la oportunidad aún no tiene, lo completa el brief. Nunca pisa lo que escribió el equipo.
    const fill = {};
    if (!lead.serviceInterest && brief?.serviceInterest) fill.serviceInterest = brief.serviceInterest.slice(0, 250);
    if (!lead.company && brief?.company) { fill.company = brief.company.slice(0, 200); fill.companyKey = normalizeCompanyKey(fill.company); }
    if (Object.keys(fill).length) await db.crmLead.update({ where: { id: lead.id }, data: fill }).catch((failure) => logger.warn?.(`[WhatsApp prospectos] El brief no quedó en la oportunidad: ${failure.message}`));

    if (parsed.handoff) {
      await pause(contact, lead, parsed.handoffReason, at);
      await db.crmActivity.create({ data: { leadId: lead.id, type: 'NOTA', occurredAt: at, note: [`Bria pasó la conversación de WhatsApp al equipo: ${parsed.handoffReason}`, briefNote(brief)].filter(Boolean).join('\n'), authorId: null } })
        .catch((failure) => logger.warn?.(`[WhatsApp prospectos] La nota del paso al equipo no quedó: ${failure.message}`));
      const name = lead.contactName || lead.company || 'Un prospecto';
      tellTeam(lead, `Bria te pasa a ${name} (${formatLeadCode(lead.consecutive)}) por WhatsApp: ${parsed.handoffReason}`)
        .catch((failure) => logger.error?.('[WhatsApp prospectos] El aviso no salió:', failure?.message || failure));
    }
    return { replied, handoff: Boolean(parsed.handoff) };
  };

  /** El equipo toma la conversación (Bria se calla) o se la devuelve a Bria. */
  const setActive = async (leadId, { active: on } = {}, actor = {}) => {
    const contact = await db.crmWhatsAppContact.findFirst({ where: { leadId }, orderBy: { lastInboundAt: 'desc' } });
    if (!contact) throw Object.assign(new Error('Esta oportunidad no tiene una conversación de WhatsApp.'), { statusCode: 404 });
    const at = now();
    const who = actor.userId || actor.id ? (await db.user.findUnique({ where: { id: actor.userId || actor.id }, select: { name: true } }).catch(() => null))?.name : null;
    const data = on ? { botPausedAt: null, botPausedReason: null } : { botPausedAt: at, botPausedReason: `${who || 'El equipo'} tomó la conversación.` };
    return db.crmWhatsAppContact.update({ where: { id: contact.id }, data });
  };

  return { respond, setActive, active, available: () => Boolean(model()) };
};

let instance;
export const getProspectAgent = () => instance ||= createProspectAgent();
