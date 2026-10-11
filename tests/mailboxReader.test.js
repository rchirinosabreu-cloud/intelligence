// La lectura IMAP de un buzón (11 de octubre de 2026): abre y cierra en cada llamada, solo la bandeja de entrada, y
// devuelve lo justo: remitente, asunto, fecha, identificador y extracto. Cliente IMAP simulado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createMailboxReader, imapHostFor, MAIL_SNIPPET_CHARS } from '../src/services/mailboxReader.js';

const account = { host: 'imap.gmail.com', port: 993, username: 'social.brainstudio@gmail.com', secret: 'abcd efgh ijkl mnop' };
const messages = [
  { uid: 11, envelope: { messageId: '<a@x>', from: [{ address: 'Maria@Aristea.co', name: 'María Pérez' }], to: [{ address: 'social.brainstudio@gmail.com' }], subject: 'Cambios al reel', date: '2026-10-11T13:00:00Z' }, internalDate: '2026-10-11T13:00:00Z', source: Buffer.from('cuerpo-a') },
  { uid: 12, envelope: { messageId: '<b@x>', inReplyTo: '<ours@brain>', from: [{ address: 'pedro@foobe.es' }], to: [], subject: 'Re: Propuesta', date: '2026-10-11T12:00:00Z' }, internalDate: '2026-10-11T12:00:00Z', source: Buffer.from('cuerpo-b') }
];
const fakeClient = (log) => class {
  constructor(options) { log.push(['new', options.host, options.auth.user, options.secure]); this.mailbox = { path: 'INBOX', exists: 2 }; }
  async connect() { log.push(['connect']); }
  async getMailboxLock(path) { log.push(['lock', path]); return { release: () => log.push(['release']) }; }
  async search(criteria) { log.push(['search', criteria]); return criteria.header ? [12] : [11, 12]; }
  async *fetch(uids, query) { log.push(['fetch', uids, query.source]); for (const row of messages) if (uids.includes(row.uid)) yield row; }
  async logout() { log.push(['logout']); }
};
const parse = async (source) => ({ text: `Texto de ${source.toString()} `.repeat(40), attachments: source.toString() === 'cuerpo-b' ? [{ filename: 'propuesta.pdf', size: 1200 }] : [] });

test('readRecent opens INBOX once, searches since the date, parses a bounded source and returns compact rows oldest first', async () => {
  const log = [];
  const reader = createMailboxReader({ ImapClient: fakeClient(log), parse, logger: { error: () => {} } });
  const rows = await reader.readRecent(account, { since: new Date('2026-10-10T13:00:00Z') });
  assert.deepEqual(log[0], ['new', 'imap.gmail.com', 'social.brainstudio@gmail.com', true]);
  assert.deepEqual(log.slice(1, 3), [['connect'], ['lock', 'INBOX']]);
  assert.deepEqual(log[3][1], { since: new Date('2026-10-10T13:00:00Z') });
  assert.deepEqual(log[4][2], { maxLength: 24_000 }, 'only a bounded slice of the source is downloaded for the snippet');
  assert.deepEqual(log.slice(-2), [['release'], ['logout']]);
  assert.deepEqual(rows.map((r) => r.messageId), ['<b@x>', '<a@x>'], 'oldest first');
  assert.deepEqual([rows[1].from, rows[1].fromName, rows[1].subject, rows[1].to], ['maria@aristea.co', 'María Pérez', 'Cambios al reel', ['social.brainstudio@gmail.com']]);
  assert.equal(rows[0].inReplyTo, '<ours@brain>');
  assert.ok(rows[1].snippet.length <= MAIL_SNIPPET_CHARS);
  assert.equal('body' in rows[1], false, 'recent rows never carry the body');
});

test('readMessage finds one message by its id, returns the bounded body and attachment names; a missing id is null', async () => {
  const log = [];
  const reader = createMailboxReader({ ImapClient: fakeClient(log), parse });
  const message = await reader.readMessage(account, '<b@x>');
  assert.deepEqual(log.find((row) => row[0] === 'search')[1], { header: { 'message-id': 'b@x' } });
  assert.deepEqual([message.messageId, message.attachments], ['<b@x>', [{ name: 'propuesta.pdf', size: 1200 }]]);
  assert.ok(message.body.length <= 6000);
  assert.equal(await reader.readMessage(account, ''), null);
});

test('testConnection reports the inbox and a login failure surfaces; the client is always logged out', async () => {
  const log = [];
  const reader = createMailboxReader({ ImapClient: fakeClient(log), parse });
  assert.deepEqual(await reader.testConnection(account), { ok: true, mailbox: 'INBOX', exists: 2 });
  const Broken = class extends fakeClient(log) { async connect() { throw Object.assign(new Error('Invalid credentials (Failure)'), { authenticationFailed: true }); } };
  await assert.rejects(() => createMailboxReader({ ImapClient: Broken, parse }).testConnection(account), /Invalid credentials/);
  assert.deepEqual(imapHostFor('social.brainstudio@gmail.com'), { host: 'imap.gmail.com', port: 993 });
  assert.deepEqual(imapHostFor('contacto@brainstudioagencia.com'), { host: 'imap.gmail.com', port: 993 });
  assert.equal(imapHostFor('sin-arroba'), null);
});
