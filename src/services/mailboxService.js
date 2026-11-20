// Los buzones compartidos de la agencia y lo que Bria hace con ellos (Rodny, 11 de octubre de 2026). Conectar es de
// administradores: se prueba la entrada por IMAP antes de guardar nada, y la contraseña de aplicación se sella en el
// servidor. Leer es cosa del pulso: cada tramo mira lo recibido desde la última lectura (como mucho 24 horas), decide
// con reglas qué correo importa (`mailImportance.js`) y guarda solo remitente, asunto, fecha y decisión. El cuerpo
// solo se trae cuando una persona le pide a Bria resumir un correo concreto, y no se guarda.

import prisma from '../lib/prisma.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { vaultKey } from '../lib/vaultCrypto.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { assessMail, describeMail, describeUnanswered, gmailLink, addressOf, domainOf, UNANSWERED_AFTER_MS, UNANSWERED_WINDOW_MS } from '../lib/mailImportance.js';
import { buildMailDraftRequest, parseMailDraft, validateMailDraft, MAIL_DRAFTS_PER_RUN, MAIL_DRAFT_MIN_SEVERITY } from '../lib/mailDraft.js';
import { AI_MODELS } from '../config/aiConfig.js';
import { runWithAiContext } from '../lib/aiRequestContext.js';
import { bogotaDate, isBusinessDay } from '../lib/colombiaBusinessDays.js';
import { dayLabel } from '../lib/teamLoad.js';
import { workdayStart } from '../lib/briaNudges.js';
import { createOpenAIClient } from './openAIClient.js';
import { createMailAccountRepository } from './mailAccountRepository.js';
import { createMailboxReader, imapHostFor } from './mailboxReader.js';
import { createMailboxSender } from './mailboxSender.js';
import { replyProblem, recipientProblem, replySubject, replyRecipient } from '../lib/mailReply.js';

const H = 3_600_000;
export const MAIL_LOOKBACK_MS = 24 * H;
export const MAIL_SEEN_RETENTION_MS = 30 * 24 * H;
const FREE_MAIL = new Set(['gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'me.com']);
const isAuthFailure = (error) => Boolean(error?.authenticationFailed) || /invalid credentials|authentication failed|AUTHENTICATIONFAILED|application-specific password/i.test(String(error?.responseText || error?.message || ''));

export const humanizeMailError = (error) => {
  if (isAuthFailure(error)) return 'Gmail rechazó la contraseña de aplicación. Genera una nueva en la cuenta (Seguridad → Contraseñas de aplicaciones) y vuelve a conectarla.';
  const text = String(error?.message || error || '');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(text)) return 'No se pudo llegar al servidor de correo. Inténtalo en un momento.';
  return `No se pudo leer el buzón: ${text.slice(0, 160)}`;
};

const defaultGenerate = async (request) => {
  const result = await createOpenAIClient({ models: AI_MODELS }).generate(request);
  return { text: result.text };
};

/** Días hábiles de Colombia después del día en que llegó y hasta hoy, los dos en reloj de Bogotá. */
export const businessDaysSince = (received, at) => {
  const today = bogotaDate(at);
  let day = bogotaDate(received), count = 0;
  while (day < today) {
    day = new Date(new Date(`${day}T00:00:00Z`).getTime() + 24 * H).toISOString().slice(0, 10);
    if (isBusinessDay(day)) count += 1;
  }
  return count;
};

/** Ninguna persona envía más respuestas que estas en un día desde los avisos. */
export const MAIL_REPLIES_PER_DAY = 20;

export const createMailboxService = ({ db = prisma, repository, reader, sender, generate, now = () => new Date(), logger = console } = {}) => {
  const repo = repository || createMailAccountRepository({ pool: getSidecarPool(), key: vaultKey() });
  const imap = reader || createMailboxReader({ logger });
  const smtp = sender || createMailboxSender();
  const label = (account) => account.label || account.email.split('@')[0];
  // Con un repositorio inyectado (pruebas y muestras) el modelo real nunca se llama: solo el que se inyecte.
  const draftWith = generate || (repository ? null : defaultGenerate);

  /**
   * El borrador listo (20 de noviembre de 2026): Bria abre ese correo, lo resume y propone la respuesta. El cuerpo
   * pasa por el modelo y no se guarda; quedan el resumen y el borrador. Un fallo deja el aviso sin borrador, nada más.
   */
  const prepareDraft = async (account, message, assessment) => {
    if (!draftWith || typeof imap.readMessage !== 'function') return null;
    try {
      const full = await imap.readMessage(account, String(message.messageId).replace(/^<|>$/g, ''));
      if (!full?.body) return null;
      const request = buildMailDraftRequest({ message: full, mailboxLabel: label(account), clientName: assessment.client?.name || null });
      const answer = await runWithAiContext({ actorId: null, module: 'bria', route: 'SCHEDULER mail-draft' }, () => draftWith(request));
      const draft = validateMailDraft(parseMailDraft(answer?.text));
      if (!draft) return null;
      if (typeof repo.saveDraft === 'function') await repo.saveDraft(account.id, message.messageId, draft);
      return draft;
    } catch (error) { logger.error('[Mailbox] No se pudo preparar el borrador de un correo:', error?.message || error); return null; }
  };

  /** Los clientes como los ve la regla: nombre, correos conocidos y dominios propios (nunca gmail y parecidos). */
  const readClients = async () => {
    const [clients, leads] = await Promise.all([
      db.client.findMany({ where: { isArchived: false }, select: { name: true, slug: true, email: true } }),
      db.crmLead?.findMany ? db.crmLead.findMany({ where: { clientId: { not: null } }, select: { clientId: true, email: true, client: { select: { name: true, slug: true } } } }).catch(() => []) : []
    ]);
    const byName = new Map();
    const add = (name, slug, email) => {
      if (!name) return;
      const row = byName.get(name) || { name, slug: slug || null, emails: [], domains: [] };
      const address = addressOf(email);
      if (address) { row.emails.push(address); const domain = domainOf(address); if (domain && !FREE_MAIL.has(domain) && !row.domains.includes(domain)) row.domains.push(domain); }
      byName.set(name, row);
    };
    for (const client of clients) add(client.name, client.slug, client.email);
    for (const lead of leads || []) add(lead.client?.name, lead.client?.slug, lead.email);
    return [...byName.values()];
  };

  return {
    async list() { return repo.list(); },

    /** Prueba la entrada y guarda. La contraseña llega una vez, se sella y no vuelve a salir. */
    async connect({ email, label: name, appPassword, actor }) {
      const address = addressOf(email);
      if (!address) throw knowledgeError('Escribe el correo del buzón.', 400, 'MAIL_EMAIL');
      const secret = String(appPassword || '').replace(/\s+/g, '');
      if (secret.length < 12) throw knowledgeError('Pega la contraseña de aplicación completa (16 caracteres, con o sin espacios).', 400, 'MAIL_SECRET');
      const server = imapHostFor(address);
      const draft = { host: server.host, port: server.port, username: address, secret };
      try { await imap.testConnection(draft); }
      catch (error) { throw knowledgeError(humanizeMailError(error), isAuthFailure(error) ? 400 : 502, 'MAIL_CONNECT'); }
      const existing = (await repo.list()).find((row) => row.email === address);
      if (existing) { await repo.replaceSecret(existing.id, secret); return { ...(await repo.list()).find((row) => row.id === existing.id), replaced: true }; }
      return repo.create({ email: address, label: String(name || '').trim().slice(0, 60) || null, host: server.host, port: server.port, username: address, secret, actor });
    },

    async test(id) {
      const account = await repo.getWithSecret(id);
      if (!account) throw knowledgeError('Ese buzón no existe.', 404, 'MAIL_ACCOUNT');
      try { const out = await imap.testConnection(account); await repo.markRead(id, now()); return { ok: true, ...out }; }
      catch (error) { await repo.markError(id, humanizeMailError(error), now(), { disable: isAuthFailure(error) }); throw knowledgeError(humanizeMailError(error), isAuthFailure(error) ? 400 : 502, 'MAIL_CONNECT'); }
    },

    async remove(id) {
      if (!await repo.remove(id)) throw knowledgeError('Ese buzón no existe.', 404, 'MAIL_ACCOUNT');
      return { removed: true };
    },

    /**
     * Lo nuevo e importante en todos los buzones activos, listo para el pulso: una fila por correo con su hecho.
     * Un buzón que falla se anota y no frena a los demás; una contraseña rechazada apaga ese buzón.
     */
    async readImportant({ at = now() } = {}) {
      const accounts = await repo.listActiveWithSecret();
      if (!accounts.length) return [];
      const clients = await readClients();
      const ourAddresses = accounts.map((account) => account.email);
      const out = [];
      let drafted = 0;
      for (const account of accounts) {
        const since = new Date(Math.max(account.lastReadAt ? new Date(account.lastReadAt).getTime() - 10 * 60_000 : 0, at.getTime() - MAIL_LOOKBACK_MS));
        let messages;
        try { messages = await imap.readRecent(account, { since }); }
        catch (error) {
          logger.error('[Mailbox] No se pudo leer un buzón:', account.email, error?.message || error);
          await repo.markError(account.id, humanizeMailError(error), at, { disable: isAuthFailure(error) });
          continue;
        }
        const withId = messages.filter((m) => m.messageId);
        const seen = await repo.seenIds(account.id, withId.map((m) => m.messageId));
        const fresh = withId.filter((m) => !seen.has(m.messageId));
        const rows = fresh.map((message) => {
          const assessment = assessMail(message, { clients, ourAddresses });
          return { message, assessment, record: { messageId: message.messageId, from: message.from, fromName: message.fromName, subject: message.subject, date: message.date, important: Boolean(assessment), reasons: assessment?.reasons || [], clientName: assessment?.client?.name || null, severity: assessment?.severity || null } };
        });
        await repo.recordSeen(account.id, rows.map((row) => row.record));
        await repo.markRead(account.id, at);
        for (const { message, assessment } of rows) {
          if (!assessment) continue;
          // El mismo correo en dos buzones (social reenvía a contacto) es un solo hecho: queda el primero que se leyó.
          if (out.some((row) => row.messageId === message.messageId)) continue;
          // Como mucho dos borradores por lectura, de lo más importante primero: el resto se pide en el chat.
          let draft = null;
          if (assessment.severity >= MAIL_DRAFT_MIN_SEVERITY && drafted < MAIL_DRAFTS_PER_RUN) { drafted += 1; draft = await prepareDraft(account, message, assessment); }
          out.push({ ...(draft ? { draft } : {}), accountId: account.id, accountEmail: account.email, accountLabel: label(account), messageId: message.messageId, from: message.from, fromName: message.fromName, subject: message.subject, date: message.date, clientName: assessment.client?.name || null, reasons: assessment.reasons, severity: assessment.severity, text: describeMail(message, assessment, { mailboxLabel: label(account) }), url: gmailLink(message.messageId) });
        }
      }
      try { await repo.purgeSeen(new Date(at.getTime() - MAIL_SEEN_RETENTION_MS)); } catch { /* la limpieza nunca frena una lectura */ }
      return out;
    },

    /**
     * Los correos importantes que siguen sin respuesta (20 de noviembre de 2026): pasó al menos un día hábil y 24
     * horas, y en los enviados de ningún buzón de la agencia (vistos todos) hay algo que los cite. Lo respondido se anota y no
     * vuelve; lo demás entra al pulso durante una jornada. Responder por otro canal no se ve: por eso el aviso dice
     * «sin una respuesta enviada desde los buzones», y se oculta como cualquier otro.
     */
    async readUnanswered({ at = now() } = {}) {
      if (typeof repo.unansweredCandidates !== 'function' || typeof imap.repliedTo !== 'function') return [];
      const candidates = (await repo.unansweredCandidates({ from: new Date(at.getTime() - UNANSWERED_WINDOW_MS), until: new Date(at.getTime() - UNANSWERED_AFTER_MS), notifiedSince: workdayStart(at) }))
        .map((mail) => ({ ...mail, businessDays: businessDaysSince(mail.date, at) })).filter((mail) => mail.businessDays >= 1);
      // Lo avisado en jornadas anteriores no vuelve al pulso, pero se sigue cotejando: si la respuesta salió después,
      // se anota, y la lectura de la mañana deja de contarlo como pendiente.
      const followed = typeof repo.notifiedUnanswered === 'function' ? await repo.notifiedUnanswered({ from: new Date(at.getTime() - UNANSWERED_WINDOW_MS), notifiedBefore: workdayStart(at) }) : [];
      if (!candidates.length && !followed.length) return [];
      const ids = candidates.map((mail) => mail.messageId);
      for (const mail of followed) if (!ids.includes(mail.messageId)) ids.push(mail.messageId);
      const answered = new Set();
      const accounts = await repo.listActiveWithSecret();
      let checked = 0;
      for (const account of accounts) {
        try {
          const found = await imap.repliedTo(account, ids);
          if (!found) continue;
          checked += 1;
          for (const id of found) answered.add(id);
        } catch (error) { logger.error('[Mailbox] No se pudieron revisar los enviados de un buzón:', account.email, error?.message || error); }
      }
      // Solo se afirma «sin respuesta» si se vieron los enviados de todos los buzones conectados: la respuesta pudo
      // salir del que no se dejó revisar. Lo que sí se encontró respondido se anota igual.
      const complete = accounts.length > 0 && checked === accounts.length;
      for (const mail of followed) if (answered.has(String(mail.messageId).replace(/^<|>$/g, ''))) await repo.markAnswered(mail.accountId, mail.messageId, at);
      const out = [];
      for (const mail of candidates) {
        const id = String(mail.messageId).replace(/^<|>$/g, '');
        if (answered.has(id)) { await repo.markAnswered(mail.accountId, mail.messageId, at); continue; }
        if (!complete) continue;
        if (!mail.notifiedAt) await repo.markUnansweredNotified(mail.accountId, mail.messageId, at);
        if (out.some((row) => row.messageId === mail.messageId)) continue;
        const accountLabel = mail.accountLabel || mail.accountEmail?.split('@')[0] || null;
        out.push({ accountId: mail.accountId, accountEmail: mail.accountEmail, accountLabel, messageId: mail.messageId, from: mail.from, fromName: mail.fromName, subject: mail.subject, date: mail.date, clientName: mail.clientName, severity: mail.severity, businessDays: mail.businessDays, draft: mail.draft,
          text: describeUnanswered({ ...mail, accountLabel }, { dayLabel: dayLabel(bogotaDate(mail.date)), businessDays: mail.businessDays }) });
      }
      return out;
    },

    /** Los borradores vigentes de esos correos (id → { summary, reply }), para la tarjeta. */
    async draftsFor(messageIds = []) {
      if (typeof repo.draftsFor !== 'function') return new Map();
      const drafts = await repo.draftsFor([...new Set(messageIds.filter(Boolean))]);
      const ours = [...drafts.values()].map((draft) => draft.accountEmail).filter(Boolean);
      // A quién iría la respuesta y desde qué buzón, para que la tarjeta lo diga antes de enviar. Lo decide el servidor.
      return new Map([...drafts].map(([id, draft]) => {
        const to = replyRecipient(draft.from);
        return [id, { summary: draft.summary, reply: draft.reply, to, from: draft.accountEmail || null, subject: replySubject(draft.subject), canSend: Boolean(draft.accountEmail) && !draft.replied && !recipientProblem(to, ours), replied: Boolean(draft.replied) }];
      }));
    },

    /**
     * Enviar con aprobación (20 de noviembre de 2026): una persona envía la respuesta que revisó, desde el buzón que
     * recibió el correo y solo a quien lo escribió. El destinatario y el asunto salen de lo guardado, nunca del
     * pedido. Se aparta antes de enviar (dos clics no son dos correos) y, si el envío falla, se suelta.
     */
    async sendReply({ messageId, text, actor, at = now() } = {}) {
      const target = messageId && typeof repo.replyTarget === 'function' ? await repo.replyTarget(String(messageId)) : null;
      if (!target || !target.important) throw knowledgeError('No encontré ese correo entre los que Bria marcó importantes.', 404, 'MAIL_REPLY_NOT_FOUND');
      if (target.repliedAt) throw knowledgeError('Ese correo ya se respondió desde aquí.', 409, 'MAIL_REPLY_DONE');
      const accounts = await repo.listActiveWithSecret();
      const account = accounts.find((row) => row.id === target.accountId);
      if (!account) throw knowledgeError('El buzón que recibió ese correo ya no está conectado.', 409, 'MAIL_REPLY_NO_ACCOUNT');
      const to = replyRecipient(target.from);
      const issue = replyProblem({ text, to, ours: accounts.map((row) => row.email) });
      if (issue) throw knowledgeError(issue.message, issue.status, 'MAIL_REPLY_INVALID');
      if (await repo.repliesSince(actor.ref, new Date(`${bogotaDate(at)}T05:00:00.000Z`)) >= MAIL_REPLIES_PER_DAY) throw knowledgeError('Ya enviaste muchas respuestas desde aquí por hoy. Las demás envíalas desde tu correo.', 429, 'MAIL_REPLY_LIMIT');
      if (!await repo.claimReply(account.id, target.messageId, actor, at)) throw knowledgeError('Ese correo ya se respondió desde aquí.', 409, 'MAIL_REPLY_DONE');
      const subject = replySubject(target.subject);
      const reference = `<${String(target.messageId).replace(/^<|>$/g, '')}>`;
      try { await smtp.send(account, { to, subject, text: String(text).trim(), inReplyTo: reference, references: reference }); }
      catch (error) {
        logger.error('[Mailbox] No se pudo enviar una respuesta:', account.email, error?.responseCode || error?.code || 'error');
        await repo.releaseReply(account.id, target.messageId);
        throw knowledgeError(isAuthFailure(error) || error?.responseCode === 535 ? 'Gmail rechazó la contraseña de aplicación de ese buzón. Un administrador debe volver a conectarlo.' : 'No se pudo enviar la respuesta. Inténtalo en un momento o envíala desde tu correo.', 502, 'MAIL_REPLY_FAILED');
      }
      try { await repo.markAnswered(account.id, target.messageId, at); } catch (error) { logger.error('[Mailbox] La respuesta salió pero no se pudo anotar:', error?.message || error); }
      logger.info?.(`[Mailbox] Respuesta enviada desde ${account.email} por ${actor.ref}.`);
      return { sent: true, to, from: account.email, subject };
    },

    /** Los correos marcados importantes en las últimas horas, para que Bria los liste. */
    async recentImportant({ hours = 24 } = {}) {
      return repo.recentImportant(new Date(now().getTime() - hours * H));
    },

    /**
     * Lo que la lectura de la mañana dice del correo (20 de noviembre de 2026): lo importante que Bria leyó desde
     * `since` y lo que ya avisó como «sin respuesta» en la última semana y sigue así. Solo lee lo guardado.
     */
    async morningDigest({ since, at = now() } = {}) {
      const seen = new Set();
      const once = (rows) => rows.filter((row) => row.messageId && !seen.has(row.messageId) && seen.add(row.messageId));
      const unanswered = typeof repo.stillUnanswered === 'function' ? once(await repo.stillUnanswered({ from: new Date(at.getTime() - UNANSWERED_WINDOW_MS) })) : [];
      return { unanswered, recent: once(await repo.recentImportant(since)) };
    },

    /** «Esperando por ti»: cuántos correos importantes tienen un borrador listo o ya se avisaron sin respuesta, y siguen así. */
    async waitingCount({ since } = {}) {
      return typeof repo.waitingCount === 'function' ? repo.waitingCount(since || new Date(now().getTime() - UNANSWERED_WINDOW_MS)) : 0;
    },

    /** Los correos que esa cuenta nombra, con la misma regla, para que Bria los liste cuando se los piden. */
    async waitingMail({ since } = {}) {
      return typeof repo.waitingList === 'function' ? repo.waitingList(since || new Date(now().getTime() - UNANSWERED_WINDOW_MS)) : [];
    },

    /** Un correo concreto, con cuerpo acotado, buscado en todos los buzones activos; para resumirlo a pedido. */
    async readMessage(messageId) {
      const id = String(messageId || '').replace(/^<|>$/g, '').trim();
      if (!id) return null;
      for (const account of await repo.listActiveWithSecret()) {
        try {
          const message = await imap.readMessage(account, id);
          if (message) return { ...message, accountEmail: account.email, accountLabel: label(account), url: gmailLink(message.messageId || id) };
        } catch (error) { logger.error('[Mailbox] No se pudo abrir un correo:', account.email, error?.message || error); }
      }
      return null;
    }
  };
};

let instance;
export const getMailboxService = () => instance ||= createMailboxService();
