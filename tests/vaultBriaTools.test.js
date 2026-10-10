import test from 'node:test';
import assert from 'node:assert/strict';
import { createVaultTools } from '../src/services/vaultTools.js';
import { createBriaConversationRepository } from '../src/services/briaConversationRepository.js';
import { buildInstructions } from '../src/lib/briaAssistant.js';

// La bóveda se maneja conversando con Bria (Rodny, 9 de octubre de 2026: «si quiero guardar una contraseña
// se lo digo a Bria»), pero la contraseña nunca pasa por el modelo.

const pm = { userId: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true } };
const admin = { userId: 'u-admin', role: 'ADMIN', isActive: true, modulePermissions: { bria: true } };
const pmActor = { ref: 'u-pm', name: 'Camila', role: 'PROJECT_MANAGER', active: true, managedClientIds: ['c-sun'] };
const adminActor = { ref: 'u-admin', name: 'Rodny', role: 'ADMIN', active: true, managedClientIds: [] };
const tool = (service, name) => createVaultTools(service).find((t) => t.name === name);
const db = {
  client: { findUnique: async ({ where }) => ({ 'c-sun': { name: 'SunPartners' }, 'c-otro': { name: 'Otro cliente' } }[where.id] || null) },
  teamMember: { findMany: async () => [
    { name: 'Camila del Toro', userId: 'u-pm', user: { role: 'PROJECT_MANAGER', isActive: true } },
    { name: 'Helen Hernández', userId: 'u-cm', user: { role: 'EDITOR', isActive: true } },
    { name: 'Rodny Chirinos', userId: 'u-admin', user: { role: 'ADMIN', isActive: true } }
  ] }
};

test('saving a password: Bria gathers the account conversing and the platform shows a protected field', async () => {
  const service = { resolve: async (user) => (user.role === 'ADMIN' ? adminActor : pmActor), get: async () => null };
  const prepare = tool(service, 'preparar_acceso');
  const out = await prepare.run({ accesoId: null, clientId: 'c-sun', plataforma: 'Gmail', nombre: 'Correo de soporte', usuario: 'soporte@sunpartners.test', enlace: null, notas: null }, { user: pm, db });
  assert.equal(out.accessCapture.mode, 'NEW');
  assert.equal(out.accessCapture.clientName, 'SunPartners');
  assert.equal(out.accessCapture.username, 'soporte@sunpartners.test');
  assert.equal('secret' in out.accessCapture, false, 'the capture never carries a password');
  assert.match(out.data.instruccion, /campo protegido/);
  assert.ok(prepare.parameters.properties.contrasena === undefined && prepare.parameters.properties.secret === undefined, 'the model has no way to send a password');
  await assert.rejects(() => prepare.run({ accesoId: null, clientId: 'c-otro', plataforma: 'Gmail', nombre: null, usuario: null, enlace: null, notas: null }, { user: pm, db }), { status: 403 });
  await assert.rejects(() => prepare.run({ accesoId: null, clientId: null, plataforma: 'Canva', nombre: null, usuario: null, enlace: null, notas: null }, { user: pm, db }), { status: 403 }, 'agency accounts are for admins');
  await assert.rejects(() => prepare.run({ accesoId: null, clientId: 'c-sun', plataforma: null, nombre: null, usuario: null, enlace: null, notas: null }, { user: pm, db }), /plataforma/);
  const agency = await prepare.run({ accesoId: null, clientId: null, plataforma: 'Canva', nombre: 'Cuenta de la agencia', usuario: null, enlace: null, notas: null }, { user: admin, db });
  assert.equal(agency.accessCapture.clientName, 'Brain Studio');
});

// Rodny, 9 de octubre de 2026: «solo hay un CapCut … la idea es que haya un razonamiento detrás». Con varias
// coincidencias, Bria elige cuál mostrar; no pone todas las tarjetas delante.
test('with one match the card shows at once; with several, Bria picks which one to show', async () => {
  const rows = [
    { id: 'a1', clientName: null, platform: 'CapCut', label: 'CapCut', revision: 1 },
    { id: 'a2', clientName: 'SunPartners', platform: 'Instagram', label: 'Instagram', revision: 1 },
    { id: 'a3', clientName: 'Aristea', platform: 'Instagram', label: 'Instagram', revision: 2 }
  ];
  const service = { list: async (_u, { query }) => rows.filter((row) => row.platform.toLowerCase().includes(query)), get: async (_u, id) => rows.find((row) => row.id === id) || null };
  const one = await tool(service, 'buscar_acceso').run({ clientId: null, consulta: 'capcut' }, { user: admin });
  assert.deepEqual(one.accessCards.map((card) => card.id), ['a1']);
  const many = await tool(service, 'buscar_acceso').run({ clientId: null, consulta: 'instagram' }, { user: admin });
  assert.equal(many.accessCards, undefined, 'several matches never become a pile of cards');
  assert.deepEqual(many.data.accesos.map((row) => row.id), ['a2', 'a3']);
  assert.match(many.data.instruccion, /mostrar_acceso/);
  const show = tool(service, 'mostrar_acceso');
  const chosen = await show.run({ accesos: ['a3'] }, { user: admin });
  assert.deepEqual(chosen.accessCards.map((card) => [card.id, card.cliente]), [['a3', 'Aristea']]);
  await assert.rejects(() => show.run({ accesos: ['nada'] }, { user: admin }), { status: 404 }, 'only accesses this person can see');
  assert.equal(show.parameters.properties.accesos.maxItems, 3);
});

test('changing a password keeps the account and its version', async () => {
  const service = { resolve: async () => pmActor, get: async (_u, id) => (id === 'a1' ? { id: 'a1', clientId: 'c-sun', clientName: 'SunPartners', platform: 'Gmail', label: 'Correo de soporte', revision: 4 } : null) };
  const out = await tool(service, 'preparar_acceso').run({ accesoId: 'a1', clientId: null, plataforma: null, nombre: null, usuario: null, enlace: null, notas: null }, { user: pm, db });
  assert.deepEqual([out.accessCapture.mode, out.accessCapture.credentialId, out.accessCapture.revision, out.accessCapture.platform], ['UPDATE', 'a1', 4, 'Gmail']);
  await assert.rejects(() => tool(service, 'preparar_acceso').run({ accesoId: 'nada', clientId: null, plataforma: null, nombre: null, usuario: null, enlace: null, notas: null }, { user: pm, db }), { status: 404 });
});

test('retiring needs an explicit request; who-saw and sharing are for admins', async () => {
  const calls = [];
  const service = {
    retire: async (_u, id, version) => { calls.push(['retire', id, version]); return { label: 'Correo de soporte' }; },
    reveals: async () => [{ persona: 'Camila', via: 'BRIA', fecha: '2026-10-09T15:00:00Z' }],
    get: async () => ({ id: 'a1', revision: 2, sharedUserIds: [] }),
    update: async (_u, id, version, changes) => { calls.push(['update', id, version, changes]); return {}; }
  };
  const retire = tool(service, 'retirar_acceso');
  await assert.rejects(() => retire.run({ accesoId: 'a1', version: 2 }, { user: pm, question: '¿Ese correo sigue activo?' }), /pida retirar/);
  assert.equal((await retire.run({ accesoId: 'a1', version: 2 }, { user: pm, question: 'Elimina ese acceso, ya no se usa' })).data.retirado, true);
  assert.deepEqual(calls[0], ['retire', 'a1', 2]);
  assert.equal(tool(service, 'quien_vio_acceso').allowed(pm), false);
  assert.equal(tool(service, 'quien_vio_acceso').allowed(admin), true);
  assert.equal((await tool(service, 'quien_vio_acceso').run({ accesoId: 'a1' }, { user: admin })).data.lecturas[0].desde, 'Bria');
  const share = tool(service, 'compartir_acceso');
  assert.equal(share.allowed(pm), false);
  await assert.rejects(() => share.run({ accesoId: 'a1', version: 2, personas: ['Helen'] }, { user: admin, question: 'Compártelo con Helen', db }), /No identifiqué/, 'only admins and PMs can receive a password');
  await share.run({ accesoId: 'a1', version: 2, personas: ['Camila'] }, { user: admin, question: 'Compártelo con Camila', db });
  assert.deepEqual(calls.at(-1), ['update', 'a1', 2, { sharedUserIds: ['u-pm'] }]);
});

test('the conversation keeps the access cards and the protected field, and Bria is told never to take a password in the chat', async () => {
  const queries = [];
  const client = { query: async (sql, args) => { queries.push([sql, args]); if (/^SELECT \* FROM bria_memory.conversations/.test(sql)) return { rows: [{ id: 'c1', revision: 0 }] }; return { rows: [] }; }, release() {} };
  const pool = { connect: async () => client, query: async () => ({ rows: [{ id: 'c1', title: 't', revision: 1, updated_at: new Date() }] }) };
  const repo = createBriaConversationRepository({ pool, workspace: 'test' });
  repo.get = async () => ({ id: 'c1', turns: [] });
  await repo.append({ ref: 'u', role: 'ADMIN', permissions: {} }, 'c1', 0, 'Guarda la clave del correo', { answer: 'Escríbela abajo', accessCards: [{ id: 'a1' }], accessCapture: { captureId: 'k1', platform: 'Gmail' } });
  const insert = queries.find(([sql]) => /INSERT INTO bria_memory.conversation_turns/.test(sql));
  const metadata = insert[1][5];
  assert.deepEqual(metadata.accessCards, [{ id: 'a1' }]);
  assert.equal(metadata.accessCapture.captureId, 'k1');
  const text = buildInstructions({ person: { name: 'Rodny' }, today: '2026-10-09', tools: createVaultTools({}).map(({ name, description }) => ({ name, description })) });
  assert.match(text, /campo protegido/);
  assert.match(text, /nunca pides que la escriban en el chat/);
});
