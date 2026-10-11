// Lectura de un buzón por IMAP (11 de octubre de 2026): lo único que la plataforma hace con el correo es leer. Entra con
// la contraseña de aplicación de la cuenta (nunca la de la cuenta), solo mira la bandeja de entrada, y devuelve lo
// justo: remitente, asunto, fecha, identificador y un extracto corto. El cuerpo completo solo se trae cuando una
// persona le pide a Bria resumir un correo concreto, y no se guarda.

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

export const MAIL_SNIPPET_CHARS = 280;
export const MAIL_BODY_CHARS = 6000;
export const MAIL_RECENT_LIMIT = 40;
const SNIPPET_SOURCE_BYTES = 24_000, BODY_SOURCE_BYTES = 400_000;

const text = (value, max) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
const person = (row) => row ? { address: String(row.address || '').toLowerCase(), name: text(row.name, 120) || null } : null;
const asMessage = (fetched, parsed, { snippetChars }) => {
  const from = person(fetched.envelope?.from?.[0]);
  return {
    uid: fetched.uid,
    messageId: fetched.envelope?.messageId || parsed?.messageId || null,
    inReplyTo: fetched.envelope?.inReplyTo || parsed?.inReplyTo || null,
    from: from?.address || null, fromName: from?.name || null,
    to: (fetched.envelope?.to || []).map((row) => String(row.address || '').toLowerCase()).filter(Boolean),
    subject: text(fetched.envelope?.subject, 300),
    date: fetched.internalDate ? new Date(fetched.internalDate) : (fetched.envelope?.date ? new Date(fetched.envelope.date) : null),
    snippet: text(parsed?.text || parsed?.html?.replace(/<[^>]+>/g, ' ') || '', snippetChars)
  };
};

/** Un cliente IMAP por llamada: conecta, hace lo suyo y cierra. `ImapClient` se inyecta en las pruebas. */
export const createMailboxReader = ({ ImapClient = ImapFlow, parse = simpleParser, logger = console } = {}) => {
  const withInbox = async (account, work) => {
    const client = new ImapClient({ host: account.host, port: account.port || 993, secure: true, auth: { user: account.username, pass: account.secret }, logger: false, emitLogs: false });
    await client.connect();
    try {
      const lock = await client.getMailboxLock('INBOX');
      try { return await work(client); } finally { lock.release(); }
    } finally { await client.logout().catch(() => {}); }
  };

  return {
    /** Entra y sale: si la contraseña o el servidor están mal, lanza con el motivo. */
    async testConnection(account) {
      return withInbox(account, async (client) => ({ ok: true, mailbox: client.mailbox?.path || 'INBOX', exists: client.mailbox?.exists ?? null }));
    },

    /** Lo recibido desde `since` en la bandeja de entrada, lo más nuevo al final, con extracto corto. */
    async readRecent(account, { since, limit = MAIL_RECENT_LIMIT, unseenOnly = false } = {}) {
      return withInbox(account, async (client) => {
        const criteria = { since: new Date(since), ...(unseenOnly ? { seen: false } : {}) };
        const uids = (await client.search(criteria, { uid: true })) || [];
        const chosen = uids.slice(-limit);
        if (!chosen.length) return [];
        const rows = [];
        for await (const fetched of client.fetch(chosen, { uid: true, envelope: true, internalDate: true, source: { maxLength: SNIPPET_SOURCE_BYTES } }, { uid: true })) {
          let parsed = null;
          try { parsed = fetched.source ? await parse(fetched.source) : null; } catch (error) { logger.error('[Mailbox] No se pudo leer un extracto:', error?.message || error); }
          rows.push(asMessage(fetched, parsed, { snippetChars: MAIL_SNIPPET_CHARS }));
        }
        return rows.sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0));
      });
    },

    /** Un correo concreto por su identificador, con el texto acotado; para que Bria lo resuma cuando se lo piden. */
    async readMessage(account, messageId) {
      const id = String(messageId || '').replace(/^<|>$/g, '');
      if (!id) return null;
      return withInbox(account, async (client) => {
        const uids = (await client.search({ header: { 'message-id': id } }, { uid: true })) || [];
        if (!uids.length) return null;
        for await (const fetched of client.fetch([uids[uids.length - 1]], { uid: true, envelope: true, internalDate: true, source: { maxLength: BODY_SOURCE_BYTES } }, { uid: true })) {
          const parsed = fetched.source ? await parse(fetched.source) : null;
          return { ...asMessage(fetched, parsed, { snippetChars: MAIL_SNIPPET_CHARS }), body: text(parsed?.text || parsed?.html?.replace(/<[^>]+>/g, ' ') || '', MAIL_BODY_CHARS), attachments: (parsed?.attachments || []).map((a) => ({ name: a.filename || 'adjunto', size: a.size || null })) };
        }
        return null;
      });
    }
  };
};

/** Los parámetros IMAP de los proveedores que usa la agencia; otros se escriben a mano. */
export const imapHostFor = (email) => {
  const domain = String(email || '').split('@')[1]?.toLowerCase() || '';
  if (!domain) return null;
  if (domain === 'gmail.com' || domain === 'googlemail.com') return { host: 'imap.gmail.com', port: 993 };
  // Workspace también vive en Gmail; un dominio propio en Google usa el mismo servidor.
  return { host: 'imap.gmail.com', port: 993 };
};
