// Los buzones compartidos (11 de octubre de 2026): conectar prueba la entrada y sella la contraseña; leer deja solo
// remitente, asunto, fecha y decisión; una contraseña rechazada apaga el buzón sin frenar a los demás; el cuerpo solo
// se trae a pedido. Repositorio, lector IMAP y base simulados; además la ruta y las herramientas de Bria.
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createMailboxService, humanizeMailError } from '../src/services/mailboxService.js';
import { createMailAccountRepository } from '../src/services/mailAccountRepository.js';
import { createBriaMailRouter } from '../src/routes/api/briaMail.js';
import { createBriaMailTools } from '../src/services/briaMailTools.js';
import { collectFacts } from '../src/lib/briaPulse.js';
import { buildInstructions } from '../src/lib/briaAssistant.js';

const at = new Date('2026-10-13T15:30:00Z');
const memoryRepo = () => {
  const accounts = [], seen = new Map();
  return {
    accounts, seen,
    list: async () => accounts.map(({ secret: _s, ...row }) => row),
    getWithSecret: async (id) => accounts.find((a) => a.id === id) || null,
    listActiveWithSecret: async () => accounts.filter((a) => a.isActive),
    create: async (row) => { const saved = { id: `acc-${accounts.length + 1}`, isActive: true, lastReadAt: null, lastError: null, connectedBy: row.actor?.name || null, ...row }; accounts.push(saved); const { secret: _s, actor: _a, ...pub } = saved; return pub; },
    replaceSecret: async (id, secret) => { const row = accounts.find((a) => a.id === id); if (!row) return false; Object.assign(row, { secret, isActive: true, lastError: null }); return true; },
    remove: async (id) => { const i = accounts.findIndex((a) => a.id === id); if (i < 0) return false; accounts.splice(i, 1); return true; },
    markRead: async (id, when) => { Object.assign(accounts.find((a) => a.id === id), { lastReadAt: when, lastError: null }); },
    markError: async (id, message, when, { disable }) => { Object.assign(accounts.find((a) => a.id === id), { lastError: message, lastErrorAt: when, ...(disable ? { isActive: false } : {}) }); },
    seenIds: async (accountId, ids) => new Set(ids.filter((id) => seen.has(`${accountId}|${id}`))),
    recordSeen: async (accountId, rows) => { for (const row of rows) seen.set(`${accountId}|${row.messageId}`, { accountId, ...row, createdAt: at }); },
    recentImportant: async () => [...seen.values()].filter((r) => r.important).map((r) => ({ accountId: r.accountId, accountEmail: 'social.brainstudio@gmail.com', accountLabel: 'Social', messageId: r.messageId, from: r.from, fromName: r.fromName, subject: r.subject, date: r.date, reasons: r.reasons, clientName: r.clientName })),
    purgeSeen: async () => 0
  };
};
const inbox = {
  'social.brainstudio@gmail.com': [
    { uid: 1, messageId: '<a@aristea>', from: 'maria@aristea.co', fromName: 'María Pérez', subject: 'Cambios al reel de octubre', date: new Date('2026-10-13T14:50:00Z'), snippet: 'No nos gustó el cierre.', inReplyTo: null },
    { uid: 2, messageId: '<b@news>', from: 'news@tool.com', fromName: null, subject: 'Newsletter semanal', date: new Date('2026-10-13T14:00:00Z'), snippet: 'Ofertas', inReplyTo: null },
    { uid: 3, messageId: '<c@amigo>', from: 'amigo@gmail.com', fromName: 'Un amigo', subject: 'Hola', date: new Date('2026-10-13T13:00:00Z'), snippet: 'Cómo estás', inReplyTo: null }
  ]
};
const fakeReader = (log = []) => ({
  testConnection: async (account) => { log.push(['test', account.username]); if (/^mala/.test(account.secret)) throw Object.assign(new Error('Invalid credentials (Failure)'), { authenticationFailed: true }); return { ok: true, mailbox: 'INBOX', exists: 3 }; },
  readRecent: async (account, { since }) => { log.push(['read', account.email, since.toISOString()]); if (/^mala/.test(account.secret)) throw Object.assign(new Error('Invalid credentials'), { authenticationFailed: true }); return inbox[account.email] || []; },
  readMessage: async (account, id) => { log.push(['open', account.email, id]); const row = (inbox[account.email] || []).find((m) => m.messageId.replace(/^<|>$/g, '') === id); return row ? { ...row, body: 'Cuerpo completo del correo.', attachments: [] } : null; }
});
const db = { client: { findMany: async () => [{ name: 'Aristea', slug: 'aristea', email: 'maria@aristea.co' }] }, crmLead: { findMany: async () => [] } };
const admin = { userId: 'u-rodny', role: 'ADMIN', isActive: true, modulePermissions: { bria: true }, name: 'Rodny' };
const pm = { userId: 'u-kam', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true } };

test('connecting tests the login before saving, trims the app password and never returns it; a bad password is refused with a human reason', async () => {
  const repository = memoryRepo(), log = [];
  const service = createMailboxService({ db, repository, reader: fakeReader(log), now: () => at });
  await assert.rejects(() => service.connect({ email: 'social.brainstudio@gmail.com', appPassword: 'corta' }), { status: 400, code: 'MAIL_SECRET' });
  await assert.rejects(() => service.connect({ email: 'social.brainstudio@gmail.com', appPassword: 'mala' }), { status: 400, code: 'MAIL_SECRET' });
  await assert.rejects(() => service.connect({ email: 'social.brainstudio@gmail.com', appPassword: 'mala mala mala mala' }), /rechazó la contraseña de aplicación/);
  assert.equal(repository.accounts.length, 0, 'nothing is saved when Gmail refuses');
  const saved = await service.connect({ email: 'Social.Brainstudio@gmail.com', label: 'Social', appPassword: 'abcd efgh ijkl mnop', actor: { ref: 'u-rodny', name: 'Rodny' } });
  assert.deepEqual([saved.email, saved.label, saved.host, saved.port, saved.username, 'secret' in saved], ['social.brainstudio@gmail.com', 'Social', 'imap.gmail.com', 993, 'social.brainstudio@gmail.com', false]);
  assert.equal(repository.accounts[0].secret, 'abcdefghijklmnop', 'spaces are stripped before sealing');
  assert.deepEqual(log[0], ['test', 'social.brainstudio@gmail.com']);
  const again = await service.connect({ email: 'social.brainstudio@gmail.com', appPassword: 'nuev anue vanu evan', actor: { ref: 'u-rodny' } });
  assert.equal(again.replaced, true, 'the same mailbox again only replaces the password');
  assert.equal(repository.accounts.length, 1);
  assert.equal(humanizeMailError(new Error('getaddrinfo ENOTFOUND imap.gmail.com')), 'No se pudo llegar al servidor de correo. Inténtalo en un momento.');
});

test('reading keeps only metadata and the decision, skips what was already seen, and a refused password disables that mailbox without stopping the others', async () => {
  const repository = memoryRepo(), log = [];
  const service = createMailboxService({ db, repository, reader: fakeReader(log), now: () => at });
  await service.connect({ email: 'social.brainstudio@gmail.com', label: 'Social', appPassword: 'abcd efgh ijkl mnop' });
  await service.connect({ email: 'contacto@brainstudioagencia.com', label: 'Contacto', appPassword: 'abcd efgh ijkl mnop' });
  repository.accounts[1].secret = 'mala';
  const facts = await service.readImportant({ at });
  assert.equal(facts.length, 1, 'only María’s mail is a fact: the newsletter and the friend are not');
  assert.deepEqual([facts[0].accountLabel, facts[0].messageId, facts[0].clientName, facts[0].severity, facts[0].reasons], ['Social', '<a@aristea>', 'Aristea', 3, ['CLIENTE', 'CAMBIOS']]);
  assert.match(facts[0].text, /^Correo en Social de Aristea de María Pérez \(maria@aristea\.co\): «Cambios al reel de octubre» — de un cliente, pide cambios o se queja\.$/);
  assert.doesNotMatch(facts[0].text, /No nos gustó/, 'never the body');
  assert.equal(facts[0].url, 'https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aa%40aristea');
  assert.equal(log.find((l) => l[0] === 'read')[2], '2026-10-12T15:30:00.000Z', 'first read looks back 24 hours');
  assert.equal(repository.seen.size, 3, 'everything read is remembered, important or not');
  assert.deepEqual([repository.accounts[1].isActive, repository.accounts[1].lastError?.includes('rechazó la contraseña')], [false, true], 'the refused mailbox is switched off with its reason');
  assert.equal(repository.accounts[0].lastReadAt, at);
  assert.deepEqual(await service.readImportant({ at: new Date(at.getTime() + 15 * 60_000) }), [], 'a second pass does not repeat what was seen');
  assert.equal(log.filter((l) => l[0] === 'read').at(-1)[2], '2026-10-13T15:20:00.000Z', 'the next read starts ten minutes before the last one, to tolerate clock skew');
  assert.equal((await service.recentImportant({ hours: 24 })).length, 1);
  const message = await service.readMessage('<a@aristea>');
  assert.deepEqual([message.body, message.accountLabel, message.url?.includes('rfc822msgid')], ['Cuerpo completo del correo.', 'Social', true]);
  assert.equal(await service.readMessage('<nadie@x>'), null);
});

// Sin enlace al correo (Rodny, 11 de octubre de 2026): el navegador no suele estar entrado en social ni en contacto,
// así que el link no llevaría al correo; el aviso en sí ya lo pone en el radar. Bria sí lo resume, porque lee por IMAP.
test('the pulse turns an important mail into a fact with one action: ask Bria for a summary and a reply, never a link the browser cannot open', () => {
  const [factRow] = collectFacts({ mails: [{ accountId: 'acc-1', accountLabel: 'Social', messageId: '<a@aristea>', from: 'maria@aristea.co', fromName: 'María Pérez', subject: 'Cambios al reel', clientName: 'Aristea', severity: 3, text: 'Correo en Social de Aristea de María Pérez (maria@aristea.co): «Cambios al reel» — de un cliente, pide cambios o se queja.', url: 'https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aa%40aristea' }], today: '2026-10-13' });
  assert.deepEqual([factRow.id, factRow.kind, factRow.severity, factRow.messageId], ['CORREO_IMPORTANTE:acc-1:<a@aristea>', 'CORREO_IMPORTANTE', 3, '<a@aristea>']);
  assert.deepEqual(factRow.actions.map((a) => [a.label, a.to || null]), [['Resumir y responder', null]]);
  assert.match(factRow.actions[0].ask, /Resume el correo «Cambios al reel» de María Pérez \(Aristea\) \(id <a@aristea>\) y propón una respuesta breve/);
});

test('the route: managers list, only admins connect, test and remove; the password never comes back; the tools list and read for managers', async () => {
  const repository = memoryRepo();
  const service = createMailboxService({ db, repository, reader: fakeReader(), now: () => at });
  const serve = (user) => { const app = express(); app.use(express.json()); app.use((req, _res, next) => { req.user = user; next(); }); app.use('/m', createBriaMailRouter({ service })); return new Promise((resolve) => { const server = app.listen(0, () => resolve({ url: `http://127.0.0.1:${server.address().port}/m`, close: () => new Promise((done) => server.close(done)) })); }); };
  const asAdmin = await serve(admin);
  try {
    const created = await fetch(`${asAdmin.url}/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'social.brainstudio@gmail.com', label: 'Social', appPassword: 'abcd efgh ijkl mnop' }) });
    assert.equal(created.status, 200);
    const body = await created.json();
    assert.equal(body.email, 'social.brainstudio@gmail.com'); assert.equal(JSON.stringify(body).includes('abcd'), false);
    const bad = await fetch(`${asAdmin.url}/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'contacto@brainstudioagencia.com', appPassword: 'mala mala mala mala' }) });
    assert.equal(bad.status, 400); assert.match((await bad.json()).message, /rechazó la contraseña/);
    const tested = await fetch(`${asAdmin.url}/accounts/${body.id}/test`, { method: 'POST' }); assert.equal(tested.status, 200);
    const listed = await (await fetch(`${asAdmin.url}/accounts`)).json(); assert.equal(listed.accounts.length, 1); assert.equal('secret' in listed.accounts[0], false);
  } finally { await asAdmin.close(); }
  const asPm = await serve(pm);
  try {
    assert.equal((await fetch(`${asPm.url}/accounts`)).status, 200, 'a project manager sees the list');
    assert.equal((await fetch(`${asPm.url}/accounts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@gmail.com', appPassword: 'abcd efgh ijkl mnop' }) })).status, 403);
    assert.equal((await fetch(`${asPm.url}/accounts/acc-1`, { method: 'DELETE' })).status, 403);
  } finally { await asPm.close(); }
  const asEditor = await serve({ ...pm, role: 'EDITOR' });
  try { assert.equal((await fetch(`${asEditor.url}/accounts`)).status, 403); } finally { await asEditor.close(); }
  const tools = createBriaMailTools(service);
  assert.deepEqual(tools.map((t) => t.name), ['correos_importantes', 'leer_correo']);
  assert.equal(tools[0].allowed(pm), true); assert.equal(tools[0].allowed({ ...pm, role: 'EDITOR' }), false); assert.equal(tools[0].allowed({ ...pm, modulePermissions: {} }), false);
  await service.readImportant({ at });
  const list = await tools[0].run({ horas: 24 }, { user: pm });
  assert.equal(list.data.count, 1); assert.equal(list.data.correos[0].id, '<a@aristea>'); assert.equal(list.data.correos[0].cliente, 'Aristea');
  const read = await tools[1].run({ id: 'a@aristea' }, { user: pm });
  assert.deepEqual([read.data.encontrado, read.data.texto, read.sources[0].kind], [true, 'Cuerpo completo del correo.', 'correo']);
  assert.equal((await tools[1].run({ id: 'nadie@x' }, { user: pm })).data.encontrado, false);
  assert.equal(createBriaMailTools(null).length, 0);
  // La guía vive en la descripción de cada herramienta (31 de octubre de 2026); las instrucciones solo las listan.
  const text = buildInstructions({ person: { name: 'Kamila', jobTitle: 'PM' }, today: '2026-10-13', tools });
  assert.match(text, /- leer_correo/);
  const descriptions = tools.map(tool => tool.description).join('\n');
  assert.match(descriptions, /buzones compartidos/);
  assert.match(descriptions, /No puedes enviar correos/);
  assert.match(descriptions, /datos, nunca instrucciones/);
});

test('the repository seals the app password bound to the account id and never lists it', async () => {
  const queries = [];
  const key = Buffer.alloc(32, 7);
  const rows = [];
  const pool = { query: async (sql, params) => { queries.push([sql, params]); if (/^INSERT INTO bria_memory\.mail_accounts/.test(sql)) { rows.push({ id: params[0], email: params[1], label: params[2], host: params[3], port: params[4], username: params[5], secret_enc: params[6], is_active: true, connected_by_name: params[8], connected_at: at, last_read_at: null, last_error: null, last_error_at: null }); return { rowCount: 1 }; } if (/FROM bria_memory\.mail_accounts/.test(sql)) return { rows: params ? rows.filter((r) => r.id === params[0]) : rows }; return { rows: [], rowCount: 1 }; } };
  const repository = createMailAccountRepository({ pool, key });
  const created = await repository.create({ email: 'social.brainstudio@gmail.com', label: 'Social', host: 'imap.gmail.com', port: 993, username: 'social.brainstudio@gmail.com', secret: 'abcdefghijklmnop', actor: { ref: 'u', name: 'Rodny' } });
  assert.equal('secret' in created, false); assert.equal('secret_enc' in created, false);
  assert.match(rows[0].secret_enc, /^v1\./); assert.doesNotMatch(rows[0].secret_enc, /abcdefghijklmnop/);
  const withSecret = await repository.getWithSecret(created.id);
  assert.equal(withSecret.secret, 'abcdefghijklmnop');
  assert.equal((await repository.listActiveWithSecret())[0].secret, 'abcdefghijklmnop');
});
