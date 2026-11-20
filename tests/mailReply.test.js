// Enviar correos con aprobación (Rodny, 20 de noviembre de 2026: «enviar correos con tu aprobación»). Bria prepara
// la respuesta; la envía una persona con un clic y una confirmación, desde el buzón que recibió el correo y solo a
// quien lo escribió. El modelo nunca envía: no hay herramienta, solo esta ruta detrás de un botón.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createMailboxService, MAIL_REPLIES_PER_DAY } from '../src/services/mailboxService.js';
import { replyProblem, replySubject, MAIL_REPLY_MAX } from '../src/lib/mailReply.js';
import { smtpFor, createMailboxSender } from '../src/services/mailboxSender.js';
import { withMailDrafts } from '../src/lib/briaNudges.js';

const AT = new Date('2026-11-23T15:00:00Z');
const account = { id: 'acc-1', email: 'contacto@agencia.co', username: 'contacto@agencia.co', label: 'Contacto', secret: 'app-pass', isActive: true };
const row = (extra = {}) => ({ accountId: 'acc-1', messageId: '<m1@cliente.co>', from: 'Rodrigo <rodrigo@cliente.co>', subject: 'Formalización de servicios', important: true, repliedAt: null, ...extra });
const build = ({ mail = row(), sentToday = 0, failSend = null } = {}) => {
  const state = { claimed: [], released: [], answered: [], sent: [] };
  const repository = {
    async listActiveWithSecret() { return [account]; },
    async replyTarget(messageId) { return mail && mail.messageId === messageId ? mail : null; },
    async repliesSince() { return sentToday; },
    async claimReply(accountId, messageId, actor, at) { if (mail.repliedAt) return false; mail.repliedAt = at; state.claimed.push([accountId, messageId, actor.ref]); return true; },
    async releaseReply(accountId, messageId) { mail.repliedAt = null; state.released.push(messageId); },
    async markAnswered(accountId, messageId, at) { state.answered.push([messageId, at.toISOString()]); }
  };
  const sender = { async send(from, message) { if (failSend) throw failSend; state.sent.push({ from: from.email, ...message }); return { messageId: '<out@agencia.co>' }; } };
  const service = createMailboxService({ db: {}, repository, reader: {}, sender, now: () => AT, logger: { error() {}, info() {} } });
  return { service, state, mail };
};
const actor = { ref: 'u-rodny', name: 'Rodny' };

test('a reply goes from the mailbox that received the mail, only to who wrote it, threaded under the original', async () => {
  const { service, state } = build();
  const out = await service.sendReply({ messageId: '<m1@cliente.co>', text: '  Hola Rodrigo, recibido. Mañana te envío el contrato.  ', actor });
  assert.deepEqual(out, { sent: true, to: 'rodrigo@cliente.co', from: 'contacto@agencia.co', subject: 'Re: Formalización de servicios' });
  assert.deepEqual(state.sent, [{ from: 'contacto@agencia.co', to: 'rodrigo@cliente.co', subject: 'Re: Formalización de servicios', text: 'Hola Rodrigo, recibido. Mañana te envío el contrato.', inReplyTo: '<m1@cliente.co>', references: '<m1@cliente.co>' }]);
  assert.deepEqual(state.claimed, [['acc-1', '<m1@cliente.co>', 'u-rodny']]);
  assert.deepEqual(state.answered, [['<m1@cliente.co>', AT.toISOString()]], 'a sent reply stops the «sin respuesta» notice');
});

test('the recipient never comes from the request, and what should not be sent is refused before anything leaves', async () => {
  const refused = async (options, input, status, pattern) => {
    const { service, state } = build(options);
    await assert.rejects(service.sendReply({ messageId: '<m1@cliente.co>', actor, ...input }), (error) => error.status === status && pattern.test(error.message));
    assert.equal(state.sent.length, 0);
  };
  await refused({}, { text: 'Hola [nombre], el valor es [precio].' }, 400, /corchetes/);
  await refused({}, { text: '   ' }, 400, /Escribe/);
  await refused({}, { text: 'x'.repeat(MAIL_REPLY_MAX + 1) }, 400, /larga/);
  await refused({}, { text: 'La contraseña es 1234' }, 400, /contraseñas/);
  await refused({ mail: row({ repliedAt: AT }) }, { text: 'Hola.' }, 409, /ya se respondió/);
  await refused({ mail: row({ from: 'no-reply@banco.co' }) }, { text: 'Hola.' }, 400, /no recibe respuestas/);
  await refused({ mail: row({ from: 'contacto@agencia.co' }) }, { text: 'Hola.' }, 400, /buzón de la agencia/);
  await refused({ mail: row({ important: false }) }, { text: 'Hola.' }, 404, /No encontré/);
  await refused({ mail: row({ messageId: '<otro>' }) }, { text: 'Hola.' }, 404, /No encontré/);
  await refused({ sentToday: MAIL_REPLIES_PER_DAY }, { text: 'Hola.' }, 429, /por hoy/);
  const { service, state } = build();
  await service.sendReply({ messageId: '<m1@cliente.co>', text: 'Hola.', actor, to: 'otro@fuera.co', subject: 'Otro asunto' });
  assert.deepEqual([state.sent[0].to, state.sent[0].subject], ['rodrigo@cliente.co', 'Re: Formalización de servicios']);
});

test('a failed send frees the mail so it can be tried again, and says why without leaking the server error', async () => {
  const { service, state, mail } = build({ failSend: Object.assign(new Error('Invalid login: 535 postgres://secreto'), { responseCode: 535 }) });
  await assert.rejects(service.sendReply({ messageId: '<m1@cliente.co>', text: 'Hola.', actor }), (error) => error.status === 502 && !/postgres/.test(error.message));
  assert.deepEqual(state.released, ['<m1@cliente.co>']);
  assert.equal(mail.repliedAt, null);
  assert.equal(state.answered.length, 0);
});

test('pure rules: subject, problems and the SMTP of the mailbox', () => {
  assert.equal(replySubject('RE: Hola'), 'RE: Hola');
  assert.equal(replySubject(''), 'Re: (sin asunto)');
  assert.equal(replySubject('Hola\r\nBcc: x@y.co'), 'Re: Hola Bcc: x@y.co', 'a subject cannot bring headers');
  assert.equal(replyProblem({ text: 'Hola.', to: 'a@b.co', ours: [] }), null);
  assert.deepEqual(smtpFor({ email: 'contacto@agencia.co', username: 'contacto@agencia.co', secret: 'p' }), { host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'contacto@agencia.co', pass: 'p' } });
});

test('the sender hands nodemailer exactly one recipient and plain text', async () => {
  const mails = [];
  const sender = createMailboxSender({ transportFactory: (config) => ({ config, sendMail: async (mail) => { mails.push([config.auth.user, mail]); return { messageId: '<x>' }; }, close() {} }) });
  await sender.send(account, { to: 'rodrigo@cliente.co', subject: 'Re: Hola', text: 'Hola.', inReplyTo: '<m1>', references: '<m1>' });
  assert.deepEqual(mails, [['contacto@agencia.co', { from: 'contacto@agencia.co', to: 'rodrigo@cliente.co', subject: 'Re: Hola', text: 'Hola.', inReplyTo: '<m1>', references: '<m1>' }]]);
});

test('the card gets who the reply goes to and from; the route is for managers with Bria and Bria has no tool to send', () => {
  const actions = withMailDrafts([{ label: 'Ver borrador', draftOf: '<m1>' }], new Map([['<m1>', { summary: 's', reply: 'r', to: 'rodrigo@cliente.co', from: 'contacto@agencia.co', subject: 'Re: Hola', canSend: true }]]));
  assert.deepEqual(actions, [{ label: 'Ver borrador', draft: { summary: 's', reply: 'r', messageId: '<m1>', to: 'rodrigo@cliente.co', from: 'contacto@agencia.co', subject: 'Re: Hola', canSend: true } }]);
  const route = readFileSync('src/routes/api/briaMail.js', 'utf8');
  assert.match(route, /router\.post\('\/reply', handle\(/);
  assert.match(route, /router\.use\(managers\)/);
  assert.doesNotMatch(readFileSync('src/services/briaMailTools.js', 'utf8'), /sendReply|enviar_correo/);
  const card = readFileSync('src/components/bria/BriaNudge.jsx', 'utf8');
  assert.match(card, /data-bria-nudge-send-confirm/);
  assert.match(card, /Sí, enviar/);
});

test('el destinatario es la dirección completa de quien escribió, o ninguna: nunca una recortada', async () => {
  const { replyRecipient } = await import('../src/lib/mailReply.js');
  assert.equal(replyRecipient('Ana@Cliente.co'), 'ana@cliente.co');
  assert.equal(replyRecipient('Ana Pérez <ana.perez+obra@cliente.com.co>'), 'ana.perez+obra@cliente.com.co');
  assert.equal(replyRecipient("o'connor@client.co"), "o'connor@client.co", 'no se convierte en connor@client.co');
  for (const bad of ['', null, 'sin arroba', 'a@b', 'ana@cliente.co, otro@x.co', 'ana @cliente.co', 'ana@cliente.co\r\nBcc: x@y.co', '<a@b.co> <c@d.co>', 'ñandú@cliente.co']) assert.equal(replyRecipient(bad), null, String(bad));
});

test('apartar la respuesta va en una transacción con candado por correo: dos pedidos a la vez no envían dos', async () => {
  const { createMailAccountRepository } = await import('../src/services/mailAccountRepository.js');
  const seen = []; let released = 0;
  const client = { async query(sql, params) { seen.push([String(sql).replace(/\s+/g, ' ').trim(), params]); return { rowCount: 1, rows: [] }; }, release() { released += 1; } };
  const pool = { async connect() { return client; }, async query() { throw new Error('apartar no puede ir fuera de la transacción'); } };
  const repo = createMailAccountRepository({ pool });
  assert.equal(await repo.claimReply('acc', '<m1@x>', { ref: 'user:1', name: 'Ana' }, new Date('2026-11-20T15:00:00Z')), true);
  assert.deepEqual(seen.map(([sql]) => sql.split(' ').slice(0, 2).join(' ')), ['BEGIN', 'SELECT pg_advisory_xact_lock(hashtextextended($1,', 'UPDATE bria_memory.mail_seen', 'COMMIT']);
  assert.match(seen[1][1][0], /<m1@x>/, 'el candado es por correo, así vale para el mismo correo en dos buzones');
  assert.equal(released, 1);
  const failing = { async query(sql) { if (/^UPDATE/.test(String(sql).trim())) throw new Error('caída'); return { rowCount: 0, rows: [] }; }, release() { released += 1; } };
  await assert.rejects(createMailAccountRepository({ pool: { async connect() { return failing; } } }).claimReply('acc', 'm', { ref: 'u' }, new Date()), /caída/);
  assert.equal(released, 2, 'la conexión se devuelve aunque falle');
});
