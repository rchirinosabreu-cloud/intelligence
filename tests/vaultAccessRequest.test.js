// Pedir un acceso de la bóveda (Rodny, 15 de octubre de 2026): «Camila podría decir “necesito la contraseña de
// capcut, por favor solicítasela a Rodny” y la Bria de Rodny le dé un anuncio, “Camila necesita la contraseña de
// capcut”, con dos opciones, “compartir” y “denegar”; si le doy compartir, a Camila le aparece, y si le doy denegar,
// a Camila le aparece que Rodny denegó tu acceso a esta contraseña».
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestNudge, answerNudge, requestNotificationText, answerNotificationText, decisionMessage } from '../src/lib/vaultAccessRequests.js';
import { isValidNudgeKey } from '../src/lib/briaNudges.js';
import { createVaultTools } from '../src/services/vaultTools.js';
import { createVaultService } from '../src/services/vaultService.js';
import { createVaultRepository } from '../src/services/vaultRepository.js';
import { createBriaNudgeService } from '../src/services/briaNudgeService.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const pm = { userId: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true } };
const admin = { userId: 'u-admin', role: 'ADMIN', isActive: true, modulePermissions: { bria: true } };
const capcut = { platform: 'CapCut', label: 'CapCut', clientName: null, kind: 'ACCESO', platformCount: 0 };
const pending = { id: '7b0c1f4e-2c8a-4d9e-9f00-000000000001', status: 'PENDING', credentialId: 'cred-1', credential: capcut, requesterRef: 'u-pm', requesterName: 'Camila del Toro', note: null, createdAt: '2026-10-15T15:40:00.000Z' };

test('the admin sees «Camila necesita la contraseña de CapCut» with Compartir and Denegar, and a block says it shares everything inside', () => {
  const nudge = requestNudge(pending);
  assert.equal(nudge.key, `ACCESO:${pending.id}`);
  assert.equal(isValidNudgeKey(nudge.key), true);
  assert.equal(nudge.kind, 'ACCESO_SOLICITADO');
  assert.equal(nudge.title, 'Camila necesita la contraseña de CapCut');
  assert.match(nudge.body, /Acceso de Brain Studio\./);
  assert.match(nudge.body, /Lo pidió a las 10:40\./);
  assert.deepEqual(nudge.actions, [
    { label: 'Compartir', decide: { requestId: pending.id, decision: 'APPROVE' } },
    { label: 'Denegar', decide: { requestId: pending.id, decision: 'DENY' } }
  ]);
  const block = requestNudge({ ...pending, note: 'Para editar el reel de Aristea', credential: { ...capcut, label: 'Herramientas de diseño', kind: 'BLOQUE', platformCount: 12 } });
  assert.match(block.body, /Es un bloque con 12 accesos: compartirlo deja ver todos\./);
  assert.match(block.body, /«Para editar el reel de Aristea»/);
  const client = requestNudge({ ...pending, credential: { ...capcut, platform: 'Instagram', label: 'Instagram', clientName: 'Aristea' } });
  assert.match(client.body, /Acceso de Aristea\./);
});

test('Camila sees the answer: shared, with a way to ask Bria for it, or denied, in Rodny’s words', () => {
  const approved = answerNudge({ ...pending, status: 'APPROVED', decidedByName: 'Rodny Chirinos', decidedAt: '2026-10-15T15:45:00.000Z' });
  assert.equal(approved.kind, 'ACCESO_COMPARTIDO');
  assert.equal(approved.title, 'Rodny compartió contigo la contraseña de CapCut');
  assert.deepEqual(approved.actions, [{ label: 'Ver la contraseña', ask: 'Dame la contraseña de CapCut de Brain Studio' }]);
  const denied = answerNudge({ ...pending, status: 'DENIED', decidedByName: 'Rodny Chirinos' });
  assert.equal(denied.kind, 'ACCESO_DENEGADO');
  assert.equal(denied.title, 'Rodny denegó tu acceso a la contraseña de CapCut');
  assert.deepEqual(denied.actions, []);
  assert.equal(requestNotificationText(pending), 'Camila necesita la contraseña de CapCut (Brain Studio).');
  assert.equal(answerNotificationText({ ...pending, status: 'APPROVED', decidedByName: 'Rodny Chirinos' }), 'Rodny compartió contigo la contraseña de CapCut (Brain Studio).');
  assert.equal(answerNotificationText({ ...pending, status: 'DENIED', decidedByName: 'Rodny Chirinos' }), 'Rodny denegó tu acceso a la contraseña de CapCut.');
  for (const text of [decisionMessage({ ...pending, status: 'APPROVED' }), decisionMessage({ ...pending, status: 'DENIED' }), decisionMessage({ ...pending, status: 'DENIED', decidedByName: 'Francisco Villa' }, { alreadyDecided: true })]) assert.ok(text.length <= 70, text);
  assert.equal(decisionMessage({ ...pending, status: 'APPROVED' }), 'Compartiste la contraseña de CapCut con Camila.');
  assert.equal(decisionMessage({ ...pending, status: 'DENIED' }), 'Le negaste a Camila la contraseña de CapCut.');
  assert.equal(decisionMessage({ ...pending, status: 'DENIED', decidedByName: 'Francisco Villa' }, { alreadyDecided: true }), 'Francisco ya lo había decidido.');
});

// Rodny, el mismo día: «no tiene que pedírmelo directamente, me debería aparecer a mí el anuncio de lo que Camila
// esté solicitando … y así nos adelantamos aún más». Pedir la contraseña ya es el pedido.
test('asking for a password she cannot see already sends the request: at once with one match, chosen by Bria with several', async () => {
  const calls = [];
  let hidden = [{ id: 'cred-1', clientName: null, platform: 'CapCut', label: 'CapCut', kind: 'ACCESO', platformCount: 0 }];
  let answer = { created: true, request: pending, admins: ['Rodny Chirinos'] };
  const service = {
    list: async () => [],
    requestable: async (_u, filters) => { calls.push(['requestable', filters]); return hidden; },
    requestAccess: async (_u, id, note) => { calls.push(['request', id, note]); return answer; }
  };
  const tools = createVaultTools(service);
  const search = tools.find((t) => t.name === 'buscar_acceso');
  const one = await search.run({ clientId: null, consulta: 'capcut' }, { user: pm, question: 'Cuál es la clave de capcut?' });
  assert.deepEqual(calls.at(-1), ['request', 'cred-1', null], 'no need to ask: the request goes out');
  assert.deepEqual(one.data.accesos, []);
  assert.deepEqual(one.data.sinPermiso, [{ id: 'cred-1', cliente: 'Brain Studio', plataforma: 'CapCut', nombre: 'CapCut' }]);
  assert.equal(one.data.pedido, true);
  assert.match(one.data.instruccion, /Ya se lo pediste a Rodny Chirinos/);
  assert.equal(one.accessCards, undefined, 'nothing is shown');
  answer = { created: false, request: pending, admins: ['Rodny Chirinos'] };
  assert.match((await search.run({ clientId: null, consulta: 'capcut' }, { user: pm })).data.instruccion, /ya estaba pedido/);
  answer = { created: false, deniedRecently: true, request: { ...pending, status: 'DENIED', decidedByName: 'Rodny Chirinos' } };
  const denied = await search.run({ clientId: null, consulta: 'capcut' }, { user: pm });
  assert.equal(denied.data.pedido, false);
  assert.match(denied.data.instruccion, /Rodny Chirinos denegó hace poco/);
  hidden = [...hidden, { id: 'cred-2', clientName: 'Aristea', platform: 'CapCut', label: 'CapCut', kind: 'ACCESO', platformCount: 0 }];
  calls.length = 0;
  const many = await search.run({ clientId: null, consulta: 'capcut' }, { user: pm });
  assert.equal(calls.some(([name]) => name === 'request'), false, 'with several, Bria picks which one first');
  assert.match(many.data.instruccion, /pídelo con pedir_acceso sin preguntarle/);
  const adminSearch = await search.run({ clientId: null, consulta: 'nada' }, { user: admin });
  assert.equal(adminSearch.data.sinPermiso, undefined, 'an admin sees the whole vault; there is nothing to ask for');
  const ask = tools.find((t) => t.name === 'pedir_acceso');
  assert.equal(ask.allowed(pm), true);
  assert.equal(ask.allowed(admin), false);
  answer = { created: true, request: pending, admins: ['Rodny Chirinos'] };
  const out = await ask.run({ accesoId: 'cred-2', nota: 'Para editar un reel' }, { user: pm, question: 'la de Aristea' });
  assert.deepEqual(calls.at(-1), ['request', 'cred-2', 'Para editar un reel']);
  assert.deepEqual(out.data.administradores, ['Rodny Chirinos']);
  assert.match(read('src/lib/briaAssistant.js'), /pedir_acceso: '/, 'the tool has its progress phrase');
  assert.match(read('src/lib/briaAssistant.js'), /se le pide a un administrador sin que ella tenga que pedirlo/);
});

const fakeDb = (users) => ({
  user: {
    findUnique: async ({ where }) => users.find((u) => u.id === where.id) || null,
    findMany: async () => users.filter((u) => u.role === 'ADMIN' && u.isActive && u.teamMember?.isActive)
  },
  client: { findMany: async () => [] }
});
const people = [
  { id: 'u-admin', name: 'Rodny Chirinos', role: 'ADMIN', isActive: true, sessionVersion: 0, teamMember: { id: 'm-admin', name: 'Rodny Chirinos', isActive: true } },
  { id: 'u-pm', name: 'Camila del Toro', role: 'PROJECT_MANAGER', isActive: true, sessionVersion: 0, teamMember: { id: 'm-pm', name: 'Camila del Toro', isActive: true } }
];

test('the service sends the request to every active admin once, and the decision back to Camila', async () => {
  const notes = [];
  const repository = {
    requestAccess: async () => ({ created: true, request: pending }),
    getRequest: async () => pending,
    decideRequest: async (actor, id, decision) => ({ decided: true, request: { ...pending, status: decision === 'APPROVE' ? 'APPROVED' : 'DENIED', decidedByName: actor.name } })
  };
  const whatsapp = [];
  const service = createVaultService({ repository, db: fakeDb(people), notify: async (row) => { notes.push(row); }, whatsapp: (alert) => whatsapp.push(alert) });
  const asked = await service.requestAccess(pm, 'cred-1', '  Para editar  ');
  assert.deepEqual(asked.admins, ['Rodny Chirinos']);
  assert.deepEqual(notes.map((n) => [n.userId, n.type, n.message]), [['u-admin', 'VAULT_ACCESS_REQUESTED', 'Camila necesita la contraseña de CapCut (Brain Studio).']]);
  // Por WhatsApp, el mismo aviso con Compartir / Denegar (22 de octubre de 2026); nunca un valor de la bóveda.
  assert.deepEqual(whatsapp.map((a) => [a.userId, a.kind, a.sourceRef, a.text, a.buttons.map((b) => b.act).join(',')]), [['u-admin', 'ACCESS', `vault:${pending.id}`, 'Camila necesita la contraseña de CapCut (Brain Studio).', 'VAULT_APPROVE,VAULT_DENY']]);
  repository.requestAccess = async () => ({ created: false, request: pending });
  await service.requestAccess(pm, 'cred-1', null);
  assert.equal(notes.length, 1, 'asking again does not notify again');
  assert.equal(whatsapp.length, 1);
  repository.requestAccess = async () => ({ created: false, deniedRecently: true, request: { ...pending, status: 'DENIED' } });
  await service.requestAccess(pm, 'cred-1', null);
  assert.equal(notes.length, 1, 'a recent denial is respected: no new notice');
  await assert.rejects(() => service.decideRequest(pm, pending.id, 'APPROVE'), { status: 403 });
  const shared = await service.decideRequest(admin, pending.id, 'APPROVE');
  assert.equal(shared.message, 'Compartiste la contraseña de CapCut con Camila.');
  assert.deepEqual(notes.at(-1), { userId: 'u-pm', type: 'VAULT_ACCESS_SHARED', message: 'Rodny compartió contigo la contraseña de CapCut (Brain Studio).', relatedId: pending.id });
  await service.decideRequest(admin, pending.id, 'DENY');
  assert.deepEqual([notes.at(-1).type, notes.at(-1).message], ['VAULT_ACCESS_DENIED', 'Rodny denegó tu acceso a la contraseña de CapCut.']);
  const gone = createVaultService({ repository, db: fakeDb([people[0], { ...people[1], role: 'EDITOR' }]), notify: async () => {} });
  await assert.rejects(() => gone.decideRequest(admin, pending.id, 'APPROVE'), /ya no es project manager/);
  const silent = createVaultService({ repository, db: fakeDb(people), notify: async () => { throw new Error('push caído'); }, logger: { error() {} } });
  assert.equal((await silent.decideRequest(admin, pending.id, 'DENY')).decided, true, 'a notice that fails never undoes the decision');
});

test('the repository: only accesses she cannot see, one open request per access, and approving shares it with its event', async () => {
  const queries = [];
  const credential = { id: 'cred-1', client_id: null, client_name: null, platform: 'CapCut', label: 'CapCut', kind: 'ACCESO', platforms: [], status: 'ACTIVE', shared_user_ids: [], revision: 3 };
  const request = { id: pending.id, credential_id: 'cred-1', requester_ref: 'u-pm', requester_name: 'Camila del Toro', note: null, status: 'PENDING', created_at: new Date() };
  const answer = (sql) => {
    if (/FROM vault\.access_requests WHERE id=\$1 FOR UPDATE/.test(sql)) return { rows: [request] };
    if (/FROM vault\.credentials c LEFT JOIN public\."Client" cl ON cl\.id = c\.client_id WHERE c\.id = \$1/.test(sql)) return { rows: [credential] };
    if (/^INSERT INTO vault\.access_requests/.test(sql)) return { rows: [request] };
    if (/^UPDATE vault\.credentials SET shared_user_ids/.test(sql)) return { rows: [{ revision: 4 }] };
    if (/^UPDATE vault\.access_requests SET status/.test(sql)) return { rows: [{ ...request, status: 'APPROVED', decided_by_name: 'Rodny' }] };
    return { rows: [] };
  };
  const client = { query: async (sql, args) => { queries.push([sql, args]); return answer(sql); }, release() {} };
  const repo = createVaultRepository({ pool: { connect: async () => client, query: async (sql, args) => { queries.push([sql, args]); return answer(sql); } }, key: Buffer.alloc(32) });
  const camila = { ref: 'u-pm', name: 'Camila del Toro', role: 'PROJECT_MANAGER', active: true, managedClientIds: [] };
  const rodny = { ref: 'u-admin', name: 'Rodny Chirinos', role: 'ADMIN', active: true, managedClientIds: [] };
  await repo.requestable(camila, { query: 'capcut' });
  assert.ok(queries.some(([sql]) => /NOT \(\$1::boolean OR c\.client_id = ANY/.test(sql)), 'only what she cannot see');
  assert.deepEqual(await repo.requestable(rodny, { query: 'capcut' }), []);
  const created = await repo.requestAccess(camila, 'cred-1', null);
  assert.equal(created.created, true);
  assert.ok(queries.some(([sql, args]) => /status = 'DENIED' AND decided_at > now\(\)/.test(sql) && args[2] === 7), 'a denial of the last week is looked for first');
  assert.ok(queries.some(([sql]) => /ON CONFLICT \(credential_id, requester_ref\) WHERE status = 'PENDING' DO NOTHING/.test(sql)));
  await assert.rejects(() => repo.decideRequest(camila, pending.id, 'APPROVE'), { status: 403 });
  queries.length = 0;
  const decided = await repo.decideRequest(rodny, pending.id, 'APPROVE');
  assert.equal(decided.request.status, 'APPROVED');
  const share = queries.find(([sql]) => /^UPDATE vault\.credentials SET shared_user_ids/.test(sql));
  assert.ok(share, 'approving adds her to the access');
  assert.equal(share[1][1], 'u-pm');
  const event = queries.find(([sql]) => /INSERT INTO vault\.credential_events/.test(sql));
  assert.deepEqual(event[1][4], ['sharedUserIds']);
  assert.match(event[1][5], /Pedido de acceso de Camila del Toro/);
  queries.length = 0;
  request.status = 'DENIED';
  const again = await repo.decideRequest(rodny, pending.id, 'APPROVE');
  assert.equal(again.alreadyDecided, true, 'a second admin does not decide twice');
  assert.equal(queries.some(([sql]) => /^UPDATE/.test(sql)), false);
  const sql = read('scripts/sql/vault.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS vault\.access_requests/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS vault_access_requests_open ON vault\.access_requests\(credential_id, requester_ref\) WHERE status = 'PENDING'/);
});

test('the requests ride on Bria’s notices: first in line, and the X marks Camila’s answer as seen', async () => {
  const marked = [];
  const vault = {
    accessNudges: async (user) => (user.role === 'ADMIN' ? [requestNudge(pending)] : [answerNudge({ ...pending, status: 'DENIED', decidedByName: 'Rodny' })]),
    dismissAnswer: async (_user, id) => { marked.push(id); return true; }
  };
  const repository = { dismissedKeys: async () => new Set(), focusDelivery: async () => null, dailyCloseDelivery: async () => null, hasRecentRun: async () => true, activeMessages: async () => [{ id: 'p1', kinds: ['VENCE_HOY'], title: 'Algo vence hoy', actions: [] }], dismiss: async (_u, key, untilAt) => ({ key, untilAt }) };
  const service = createBriaNudgeService({ repository, vault, now: () => new Date('2026-10-15T16:00:00Z') });
  const forRodny = await service.list(admin);
  assert.deepEqual(forRodny.nudges.map((n) => n.kind), ['ACCESO_SOLICITADO', 'VENCE_HOY']);
  const forCamila = await service.list(pm);
  assert.equal(forCamila.nudges[0].title, 'Rodny denegó tu acceso a la contraseña de CapCut');
  const out = await service.dismiss(pm, `ACCESO:${pending.id}`);
  assert.deepEqual(marked, [pending.id]);
  assert.equal(out.untilAt, null);
  const failing = createBriaNudgeService({ repository, vault: { accessNudges: async () => { throw new Error('bóveda caída'); } }, now: () => new Date('2026-10-15T16:00:00Z'), logger: { error() {} } });
  assert.deepEqual((await failing.list(admin)).nudges.map((n) => n.kind), ['VENCE_HOY'], 'a vault failure never hides the other notices');
});

test('the card answers with two buttons that call the vault, and the notices have their titles', () => {
  const card = read('src/components/bria/BriaNudge.jsx');
  assert.match(card, /item\.decide/);
  assert.match(card, /requestVault\(`\/requests\/\$\{requestId\}\/decision`, \{ method: 'POST', body: \{ decision \} \}\)/);
  assert.match(card, /toast\.success\(out\.message\)/, 'the success line comes from the server, after it answered');
  assert.match(card, /data-bria-nudge-decision/);
  const route = read('src/routes/api/vault.js');
  assert.match(route, /router\.post\('\/requests\/:id\/decision', handle\(\(req\) => vault\(\)\.decideRequest\(req\.user, req\.params\.id, req\.body\?\.decision\)\)\);/);
  const titles = read('src/utils/notificationUtils.js');
  for (const type of ['VAULT_ACCESS_REQUESTED', 'VAULT_ACCESS_SHARED', 'VAULT_ACCESS_DENIED']) assert.match(titles, new RegExp(`type === '${type}'`));
  assert.match(read('docs/BASE_DE_DATOS_LATERAL.md'), /`access_requests`/);
  assert.match(read('docs/BOVEDA_DE_ACCESOS.md'), /Pedir un acceso/);
});
