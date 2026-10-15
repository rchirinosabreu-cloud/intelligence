// La versión general de pedir un acceso (Rodny, 15 de octubre de 2026): «si Camila está solicitando algo a lo que Bria
// no le puede dar acceso por su rol, no tiene que pedírmelo directamente, me debería aparecer a mí el anuncio … y así
// nos adelantamos aún más», y después «haz también la versión general». Lo que no es una contraseña es un módulo de la
// plataforma: Bria lo pide sola, el administrador da acceso o lo deniega desde el aviso, y a ella le llega la respuesta.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { permissionRequestNudge, permissionAnswerNudge, permissionRequestText, permissionAnswerText, permissionDecisionMessage, missingModules, grantModule } from '../src/lib/modulePermissionRequests.js';
import { isValidNudgeKey } from '../src/lib/briaNudges.js';
import { createPermissionRequestTools } from '../src/services/permissionRequestTools.js';
import { createPermissionRequestService } from '../src/services/permissionRequestService.js';
import { createPermissionRequestRepository } from '../src/services/permissionRequestRepository.js';
import { createBriaNudgeService } from '../src/services/briaNudgeService.js';
import { buildInstructions } from '../src/lib/briaAssistant.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const camila = { userId: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true, parrillas: true, clientes: true } };
const rodny = { userId: 'u-admin', role: 'ADMIN', isActive: true, modulePermissions: { bria: true } };
const pending = { id: '5d1e2f30-0000-4000-8000-000000000009', status: 'PENDING', moduleKey: 'financiero', requesterRef: 'u-pm', requesterName: 'Camila del Toro', note: 'ver cuánto debe Aristea', createdAt: '2026-10-15T15:44:00.000Z' };

test('the modules she lacks come from the single list of modules, and an admin lacks none', () => {
  const missing = missingModules(camila).map((m) => m.key);
  assert.ok(missing.includes('financiero') && missing.includes('crm') && missing.includes('cotizaciones'));
  assert.equal(missing.includes('gestion'), false);
  assert.equal(missing.includes('drive'), true, 'Drive without Minutas is missing too');
  assert.deepEqual(missingModules(rodny), []);
});

test('the admin sees «Camila necesita acceso a Financiero» with Dar acceso and Denegar; Financiero is given read-only', () => {
  const nudge = permissionRequestNudge(pending);
  assert.equal(nudge.key, `PERMISO:${pending.id}`);
  assert.equal(isValidNudgeKey(nudge.key), true);
  assert.equal(nudge.kind, 'PERMISO_SOLICITADO');
  assert.equal(nudge.title, 'Camila necesita acceso a Financiero');
  assert.match(nudge.body, /Lo pidió para «ver cuánto debe Aristea»\./);
  assert.match(nudge.body, /Se le da en solo lectura; el nivel se cambia en Equipo\./);
  assert.match(nudge.body, /Lo pidió a las 10:44\./);
  assert.deepEqual(nudge.actions, [
    { label: 'Dar acceso', decide: { scope: 'permission', requestId: pending.id, decision: 'APPROVE' } },
    { label: 'Denegar', decide: { scope: 'permission', requestId: pending.id, decision: 'DENY' } }
  ]);
  const crm = permissionRequestNudge({ ...pending, moduleKey: 'crm', note: null });
  assert.equal(crm.title, 'Camila necesita acceso a CRM');
  assert.doesNotMatch(crm.body, /solo lectura/);
});

test('Camila sees the answer: given, with a way into the module, or denied', () => {
  const granted = permissionAnswerNudge({ ...pending, status: 'APPROVED', decidedByName: 'Rodny Chirinos' });
  assert.equal(granted.kind, 'PERMISO_CONCEDIDO');
  assert.equal(granted.title, 'Rodny te dio acceso a Financiero');
  assert.deepEqual(granted.actions, [{ label: 'Abrir Financiero', href: '/financiero' }], 'a full load, so the menu reads the new permission');
  const denied = permissionAnswerNudge({ ...pending, status: 'DENIED', decidedByName: 'Rodny Chirinos' });
  assert.equal(denied.kind, 'PERMISO_DENEGADO');
  assert.equal(denied.title, 'Rodny denegó tu acceso a Financiero');
  assert.deepEqual(denied.actions, []);
  assert.equal(permissionRequestText(pending), 'Camila necesita acceso a Financiero.');
  assert.equal(permissionAnswerText({ ...pending, status: 'APPROVED', decidedByName: 'Rodny Chirinos' }), 'Rodny te dio acceso a Financiero.');
  assert.equal(permissionAnswerText({ ...pending, status: 'DENIED', decidedByName: 'Rodny Chirinos' }), 'Rodny denegó tu acceso a Financiero.');
  assert.equal(permissionDecisionMessage({ ...pending, status: 'APPROVED' }), 'Le diste acceso a Financiero a Camila.');
  assert.equal(permissionDecisionMessage({ ...pending, status: 'DENIED' }), 'Le negaste a Camila el acceso a Financiero.');
  assert.equal(permissionDecisionMessage({ ...pending, decidedByName: 'Francisco Villa' }, { alreadyDecided: true }), 'Francisco ya lo había decidido.');
});

test('granting turns on the same box as Equipo and nothing else; Financiero starts read-only and keeps a level it already had', () => {
  const plain = grantModule({ role: 'PROJECT_MANAGER', modulePermissions: { bria: true, gestion: true } }, 'crm');
  assert.equal(plain.modulePermissions.crm, true);
  assert.equal(plain.modulePermissions.gestion, true);
  assert.equal(plain.modulePermissions.bria, true);
  assert.equal('financialRole' in plain, false, 'no financial change for another module');
  const money = grantModule({ role: 'PROJECT_MANAGER', modulePermissions: { bria: true }, financialRole: 'NONE' }, 'financiero');
  assert.deepEqual([money.modulePermissions.financiero, money.hasFinancialAccess, money.financialRole], [true, true, 'VIEWER']);
  assert.equal(grantModule({ role: 'PROJECT_MANAGER', modulePermissions: {}, financialRole: 'APPROVER' }, 'financiero').financialRole, 'APPROVER');
  assert.throws(() => grantModule({ role: 'PROJECT_MANAGER', modulePermissions: {} }, 'boveda'), /no existe/);
});

test('Bria asks on her own: the tool is offered only to whom lacks something, and the instructions name what she lacks', async () => {
  const calls = [];
  let answer = { created: true, request: pending, admins: ['Rodny Chirinos'] };
  const service = { request: async (_u, key, note) => { calls.push([key, note]); return answer; } };
  const [tool] = createPermissionRequestTools(service);
  assert.equal(tool.name, 'pedir_permiso');
  assert.equal(tool.allowed(camila), true);
  assert.equal(tool.allowed(rodny), false, 'an admin enters everything');
  assert.ok(tool.parameters.properties.modulo.enum.includes('financiero'));
  const out = await tool.run({ modulo: 'financiero', para: 'ver cuánto debe Aristea' }, { user: camila, question: '¿Cuánto nos debe Aristea?' });
  assert.deepEqual(calls.at(-1), ['financiero', 'ver cuánto debe Aristea']);
  assert.match(out.data.instruccion, /Ya se lo pediste a Rodny Chirinos/);
  answer = { created: false, deniedRecently: true, request: { ...pending, status: 'DENIED', decidedByName: 'Rodny Chirinos' } };
  assert.match((await tool.run({ modulo: 'financiero', para: null }, { user: camila })).data.instruccion, /Rodny Chirinos denegó hace poco/);
  answer = { alreadyHas: true };
  assert.match((await tool.run({ modulo: 'crm', para: null }, { user: camila })).data.instruccion, /ya tiene acceso/);
  const text = buildInstructions({ person: { name: 'Camila' }, today: '2026-10-15', tools: [{ name: 'pedir_permiso', description: tool.description }], user: camila });
  assert.match(text, /22\. Si la persona pide algo de un módulo que su cuenta no tiene/);
  assert.match(text.split('\n').at(-1), /Módulos que no tiene: .*Financiero/, 'the per-person list goes last, for the prompt cache');
  assert.doesNotMatch(buildInstructions({ person: { name: 'Rodny' }, today: '2026-10-15', tools: [], user: rodny }), /Módulos que no tiene/);
  assert.match(read('src/lib/briaAssistant.js'), /pedir_permiso: '/);
  assert.match(read('src/services/briaPlatformTools.js'), /pedir_permiso/, 'a 403 from the platform points to the same request');
  assert.match(read('src/services/briaAssistantService.js'), /createPermissionRequestTools\(/);
});

const people = [
  { id: 'u-admin', name: 'Rodny Chirinos', role: 'ADMIN', isActive: true, modulePermissions: {}, teamMember: { name: 'Rodny Chirinos', isActive: true } },
  { id: 'u-pm', name: 'Camila del Toro', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true }, financialRole: 'NONE', teamMember: { name: 'Camila del Toro', isActive: true } }
];
const fakeDb = (users, updates = []) => {
  const db = {
    user: {
      findUnique: async ({ where }) => users.find((u) => u.id === where.id) || null,
      findMany: async () => users.filter((u) => u.role === 'ADMIN' && u.isActive && u.teamMember?.isActive),
      update: async ({ where, data }) => { updates.push([where.id, data]); return { id: where.id, ...data }; }
    }
  };
  db.$transaction = async (work) => work(db);
  return db;
};

test('the service: notifies admins once, grants on approval through one write, and undoes its claim if granting fails', async () => {
  const notes = [], updates = [], released = [];
  const repository = {
    create: async () => ({ created: true, request: pending }),
    get: async () => pending,
    claim: async (id, decision, actor) => ({ ...pending, status: decision === 'APPROVE' ? 'APPROVED' : 'DENIED', decidedByName: actor.name }),
    release: async (id) => { released.push(id); }
  };
  const service = createPermissionRequestService({ repository, db: fakeDb(people, updates), notify: async (row) => { notes.push(row); } });
  await assert.rejects(() => service.request(camila, 'boveda', null), { status: 400 });
  await assert.rejects(() => service.request(rodny, 'crm', null), { status: 400 });
  assert.deepEqual(await service.request({ ...camila }, 'gestion', null), { alreadyHas: true });
  const asked = await service.request(camila, 'financiero', '  ver cuánto debe Aristea ');
  assert.deepEqual(asked.admins, ['Rodny Chirinos']);
  assert.deepEqual(notes.map((n) => [n.userId, n.type, n.message]), [['u-admin', 'MODULE_ACCESS_REQUESTED', 'Camila necesita acceso a Financiero.']]);
  repository.create = async () => ({ created: false, request: pending });
  await service.request(camila, 'financiero', null);
  assert.equal(notes.length, 1, 'asking again does not notify again');
  await assert.rejects(() => service.decide(camila, pending.id, 'APPROVE'), { status: 403 });
  const given = await service.decide(rodny, pending.id, 'APPROVE');
  assert.equal(given.message, 'Le diste acceso a Financiero a Camila.');
  assert.deepEqual(updates.at(-1)[0], 'u-pm');
  assert.equal(updates.at(-1)[1].modulePermissions.financiero, true);
  assert.equal(updates.at(-1)[1].financialRole, 'VIEWER');
  assert.deepEqual(notes.at(-1), { userId: 'u-pm', type: 'MODULE_ACCESS_GRANTED', message: 'Rodny te dio acceso a Financiero.', relatedId: pending.id, url: '/financiero' });
  const before = updates.length;
  await service.decide(rodny, pending.id, 'DENY');
  assert.equal(updates.length, before, 'denying changes no account');
  assert.equal(notes.at(-1).type, 'MODULE_ACCESS_DENIED');
  const gone = createPermissionRequestService({ repository, db: fakeDb([people[0], { ...people[1], isActive: false }]), notify: async () => {} });
  await assert.rejects(() => gone.decide(rodny, pending.id, 'APPROVE'), /ya no está activa/);
  assert.deepEqual(released, [pending.id], 'a failed grant puts the request back to pending');
  repository.claim = async () => null;
  repository.get = async () => ({ ...pending, status: 'DENIED', decidedByName: 'Francisco Villa' });
  const twice = await service.decide(rodny, pending.id, 'APPROVE');
  assert.equal(twice.alreadyDecided, true);
  assert.equal(twice.message, 'Francisco ya lo había decidido.');
});

test('the repository: one open request per module and person, a recent denial respected, and the decision claimed atomically', async () => {
  const queries = [];
  const pool = { query: async (sql, args) => { queries.push([sql, args]); return /^INSERT/.test(sql) ? { rows: [{ id: pending.id, module_key: 'financiero', requester_ref: 'u-pm', requester_name: 'Camila del Toro', status: 'PENDING', created_at: new Date() }] } : { rows: [] }; } };
  const repo = createPermissionRequestRepository({ pool });
  const out = await repo.create({ moduleKey: 'financiero', requesterRef: 'u-pm', requesterName: 'Camila del Toro', note: null });
  assert.equal(out.created, true);
  assert.ok(queries.some(([sql, args]) => /status = 'DENIED' AND decided_at > now\(\)/.test(sql) && args.includes(7)));
  assert.ok(queries.some(([sql]) => /ON CONFLICT \(module_key, requester_ref\) WHERE status = 'PENDING' DO NOTHING/.test(sql)));
  await repo.claim(pending.id, 'APPROVE', { ref: 'u-admin', name: 'Rodny Chirinos' });
  assert.ok(queries.some(([sql]) => /UPDATE bria_memory\.permission_requests SET status = \$2.*WHERE id = \$1 AND status = 'PENDING' RETURNING \*/s.test(sql)));
  const sql = read('scripts/sql/bria-proactive.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS bria_memory\.permission_requests/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS permission_requests_open ON bria_memory\.permission_requests\(module_key, requester_ref\) WHERE status = 'PENDING'/);
});

test('module requests ride with the vault ones on Bria’s notices, and the X marks Camila’s answer as seen', async () => {
  const marked = [];
  const permissions = {
    nudges: async (user) => (user.role === 'ADMIN' ? [permissionRequestNudge(pending)] : [permissionAnswerNudge({ ...pending, status: 'APPROVED', decidedByName: 'Rodny' })]),
    dismissAnswer: async (_u, id) => { marked.push(id); return true; }
  };
  const vault = { accessNudges: async () => [], dismissAnswer: async () => false };
  const repository = { dismissedKeys: async () => new Set(), focusDelivery: async () => null, dailyCloseDelivery: async () => null, hasRecentRun: async () => true, activeMessages: async () => [{ id: 'p1', kinds: ['VENCE_HOY'], title: 'Algo vence hoy', actions: [] }], dismiss: async (_u, key, untilAt) => ({ key, untilAt }) };
  const service = createBriaNudgeService({ repository, vault, permissions, now: () => new Date('2026-10-15T16:00:00Z') });
  assert.deepEqual((await service.list(rodny)).nudges.map((n) => n.kind), ['PERMISO_SOLICITADO', 'VENCE_HOY']);
  assert.equal((await service.list(camila)).nudges[0].title, 'Rodny te dio acceso a Financiero');
  assert.equal((await service.dismiss(camila, `PERMISO:${pending.id}`)).untilAt, null);
  assert.deepEqual(marked, [pending.id]);
});

test('the card decides through the nudge route, opens the module with a full load, and the notices have titles', () => {
  const card = read('src/components/bria/BriaNudge.jsx');
  assert.match(card, /scope === 'permission'/);
  assert.match(card, /requestBriaNudges\(`\/permission-requests\/\$\{requestId\}\/decision`, \{ method: 'POST', body: \{ decision \} \}\)/);
  assert.match(card, /item\.href/);
  const route = read('src/routes/api/briaNudges.js');
  assert.match(route, /router\.post\('\/permission-requests\/:id\/decision'/);
  const titles = read('src/utils/notificationUtils.js');
  for (const type of ['MODULE_ACCESS_REQUESTED', 'MODULE_ACCESS_GRANTED', 'MODULE_ACCESS_DENIED']) assert.match(titles, new RegExp(`type === '${type}'`));
  assert.match(read('src/components/layout/AppLayout.jsx'), /notif\.type === 'MODULE_ACCESS_GRANTED'[\s\S]{0,400}window\.location\.assign\(notif\.url\)/, 'the granted notice opens the module with a full load');
  assert.match(read('docs/BASE_DE_DATOS_LATERAL.md'), /`permission_requests`/);
  assert.match(read('prisma/schema.prisma'), /permission_requests/);
  assert.match(read('docs/BRIA_SE_ADELANTA.md'), /Pedir acceso a un módulo/);
});
