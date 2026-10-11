// Los buzones compartidos de la agencia y lo que Bria hace con ellos (Rodny, 11 de octubre de 2026). Conectar es de
// administradores: se prueba la entrada por IMAP antes de guardar nada, y la contraseña de aplicación se sella en el
// servidor. Leer es cosa del pulso: cada tramo mira lo recibido desde la última lectura (como mucho 24 horas), decide
// con reglas qué correo importa (`mailImportance.js`) y guarda solo remitente, asunto, fecha y decisión. El cuerpo
// solo se trae cuando una persona le pide a Bria resumir un correo concreto, y no se guarda.

import prisma from '../lib/prisma.js';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { vaultKey } from '../lib/vaultCrypto.js';
import { getSidecarPool } from '../lib/sidecarPool.js';
import { assessMail, describeMail, gmailLink, addressOf, domainOf } from '../lib/mailImportance.js';
import { createMailAccountRepository } from './mailAccountRepository.js';
import { createMailboxReader, imapHostFor } from './mailboxReader.js';

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

export const createMailboxService = ({ db = prisma, repository, reader, now = () => new Date(), logger = console } = {}) => {
  const repo = repository || createMailAccountRepository({ pool: getSidecarPool(), key: vaultKey() });
  const imap = reader || createMailboxReader({ logger });
  const label = (account) => account.label || account.email.split('@')[0];

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
          return { message, assessment, record: { messageId: message.messageId, from: message.from, fromName: message.fromName, subject: message.subject, date: message.date, important: Boolean(assessment), reasons: assessment?.reasons || [], clientName: assessment?.client?.name || null } };
        });
        await repo.recordSeen(account.id, rows.map((row) => row.record));
        await repo.markRead(account.id, at);
        for (const { message, assessment } of rows) {
          if (!assessment) continue;
          out.push({ accountId: account.id, accountEmail: account.email, accountLabel: label(account), messageId: message.messageId, from: message.from, fromName: message.fromName, subject: message.subject, date: message.date, clientName: assessment.client?.name || null, reasons: assessment.reasons, severity: assessment.severity, text: describeMail(message, assessment, { mailboxLabel: label(account) }), url: gmailLink(message.messageId) });
        }
      }
      try { await repo.purgeSeen(new Date(at.getTime() - MAIL_SEEN_RETENTION_MS)); } catch { /* la limpieza nunca frena una lectura */ }
      return out;
    },

    /** Los correos marcados importantes en las últimas horas, para que Bria los liste. */
    async recentImportant({ hours = 24 } = {}) {
      return repo.recentImportant(new Date(now().getTime() - hours * H));
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
