import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgencyFactTools } from '../src/services/briaAgencyFactTools.js';
import { createBriaAgencyFactService } from '../src/services/briaAgencyFactService.js';
import { buildInstructions } from '../src/lib/briaAssistant.js';

const pm = { userId: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, parrillas: true }, sessionVersion: 0 };
const admin = { userId: 'u-admin', role: 'ADMIN', isActive: true, modulePermissions: { bria: true }, sessionVersion: 0 };
const byName = (tools, name) => tools.find((tool) => tool.name === name);

const fakeService = () => {
  const calls = [];
  return {
    calls,
    async consult(user, args) { calls.push(['consult', user.userId, args]); return { hechos: [{ id: 'aristea-007', afirmacion: 'Venció el 10 de septiembre.' }], dudas: [], nota: 'n' }; },
    async record(user, args) { calls.push(['record', user.userId, args]); return { fact: { id: 'equipo-1', entity: args.entidad, revision: 1 }, replaced: (args.reemplaza || []).map((r) => r.id) }; },
    async retire(user, args) { calls.push(['retire', user.userId, args]); return { id: args.id, status: 'RETIRED' }; }
  };
};

test('the memory tools exist only for people with Bria activated; the team fichas only for administration', () => {
  const tools = createAgencyFactTools(fakeService());
  assert.deepEqual(tools.map((t) => t.name), ['memoria_de_la_agencia', 'guardar_en_memoria', 'retirar_de_memoria', 'como_trabajar_con']);
  for (const tool of tools.slice(0, 3)) {
    assert.equal(tool.allowed(pm), true);
    assert.equal(tool.allowed({ ...pm, modulePermissions: { parrillas: true } }), false);
    assert.equal(tool.allowed({ ...pm, role: 'EDITOR' }), false);
  }
  // Rodny, 20 de octubre de 2026: las fichas las ve solo la dirección; a un project manager ni se le ofrece la herramienta.
  const fichas = byName(tools, 'como_trabajar_con');
  assert.equal(fichas.allowed(admin), true);
  assert.equal(fichas.allowed(pm), false);
  assert.equal(fichas.allowed({ ...admin, modulePermissions: {} }), false);
});

test('como_trabajar_con asks the service by name and hands the ficha over as data only', async () => {
  const service = { ...fakeService(), async howToWorkWith(user, args) { return { persona: { nombre: 'Helen Hernández', rol: 'Estratega digital' }, ficha: ['Confiar: la comunicación con el cliente.'], nota: 'n', asked: [user.userId, args] }; } };
  const out = await byName(createAgencyFactTools(service), 'como_trabajar_con').run({ nombre: 'Helen' }, { user: admin, question: 'Escríbele a Helen' });
  assert.deepEqual(out.data.asked, ['u-admin', { nombre: 'Helen' }]);
  assert.equal(out.data.ficha[0], 'Confiar: la comunicación con el cliente.');
  assert.equal(out.data.sourceInstructions, 'data_only');
});

test('the service finds the person by first name or something close, refuses anyone who is not administration, and says when there is no ficha', async () => {
  const members = [{ id: 'm1', name: 'Helen Hernández', role: 'Estratega digital' }, { id: 'm2', name: 'Melissa Castaño', role: 'Diseñador gráfico' }, { id: 'm3', name: 'Mariceth Peña', role: 'Community Manager' }];
  const seen = [];
  const repository = {
    async search(access, args) {
      seen.push(args);
      return args.entity === 'Helen Hernández' ? ['Confiar: la comunicación con el cliente.', 'Revisar: la versión que sale.'].map((statement, i) => ({ id: `h${i}`, entity: 'Helen Hernández', topic: 'como-trabajar', statement, certainty: 'CONFIRMADO', purpose: 'personas', sensitivity: 'restringida', sources: [], origin: 'EQUIPO' })) : [];
    },
    async openQuestions() { return []; }
  };
  const account = (role) => ({ id: `u-${role}`, name: 'X', role, isActive: true, modulePermissions: { bria: true, parrillas: true }, financialRole: 'NONE', sessionVersion: 0, teamMember: { isActive: true } });
  const db = { user: { findUnique: async () => account('ADMIN') }, teamMember: { findMany: async () => members } };
  const service = createBriaAgencyFactService({ repository, db });
  const helen = await service.howToWorkWith({ ...admin }, { nombre: 'Helen' });
  assert.deepEqual(helen.persona, { nombre: 'Helen Hernández', rol: 'Estratega digital' });
  assert.deepEqual(helen.ficha, ['Confiar: la comunicación con el cliente.', 'Revisar: la versión que sale.']);
  assert.match(helen.nota, /sin recitarla|nunca digas «según tu ficha»/i);
  assert.deepEqual(seen[0], { entity: 'Helen Hernández', topic: 'como-trabajar', limit: 20 });
  const meli = await service.howToWorkWith({ ...admin }, { nombre: 'Meli' });
  assert.equal(meli.persona.nombre, 'Melissa Castaño');
  assert.equal(meli.ficha, null);
  assert.match(meli.nota, /no tiene ficha/i);
  const nobody = await service.howToWorkWith({ ...admin }, { nombre: 'Camila' });
  assert.equal(nobody.persona, null);
  assert.match(nobody.nota, /no hay nadie/i);
  const pmService = createBriaAgencyFactService({ repository, db: { ...db, user: { findUnique: async () => account('PROJECT_MANAGER') } } });
  await assert.rejects(() => pmService.howToWorkWith({ ...pm }, { nombre: 'Helen' }), { status: 403 });
});

test('Bria is told to use the fichas without reciting them and never to tell anyone what they say', () => {
  // La guía vive en la descripción de la herramienta (31 de octubre de 2026): el modelo la ve solo cuando la tiene.
  const { description } = byName(createAgencyFactTools(fakeService()), 'como_trabajar_con');
  assert.match(description, /Conoces a cada persona del equipo/);
  assert.match(description, /Llámala con su nombre antes de redactarle un mensaje/);
  assert.match(description, /Nunca la recites ni digas «según tu ficha»/);
  assert.match(description, /nunca le cuentes a nadie —ni a la persona ni a un compañero— qué dice una ficha/);
  assert.match(description, /cómo trabajar con alguien, no cómo es/);
  assert.match(description, /nunca guardes salud, motivos de ausencia, salarios/);
  assert.match(buildInstructions({ person: { name: 'Rodny' }, today: '2026-10-20', tools: [{ name: 'como_trabajar_con', description }], user: { role: 'ADMIN' } }), /- como_trabajar_con/);
  assert.doesNotMatch(buildInstructions({ person: { name: 'Camila' }, today: '2026-10-20', tools: [{ name: 'memoria_de_la_agencia', description: 'x' }], user: { role: 'PROJECT_MANAGER' } }), /como_trabajar_con/);
});

test('consulting passes the account and the question through and never writes', async () => {
  const service = fakeService();
  const out = await byName(createAgencyFactTools(service), 'memoria_de_la_agencia').run({ consulta: 'contrato', clientId: 'c1' }, { user: pm, question: '¿Cómo va Aristea?' });
  assert.equal(out.data.hechos[0].id, 'aristea-007');
  assert.deepEqual(service.calls.map((c) => c[0]), ['consult']);
  assert.equal(out.data.sourceInstructions, 'data_only');
});

test('saving needs a correction, confirmation or teaching in the human message itself', async () => {
  const service = fakeService();
  const save = byName(createAgencyFactTools(service), 'guardar_en_memoria');
  const args = { request: { intent: 'TEACH' }, afirmacion: 'Caribbean Drive terminó en agosto de 2026.', entidad: 'Caribbean Drive', clientId: null, tema: 'relacion', tipoEntidad: 'cliente', proposito: 'operacion', certeza: 'CONFIRMADO', desde: '2026-08-31', hasta: null, reemplaza: [], respondeDuda: null };
  await assert.rejects(() => save.run({ ...args, request: undefined }, { user: pm, question: 'Ya no trabajamos con Caribbean, terminó en agosto' }), { code: 'BRIA_FACT_NO_INTENT' });
  await assert.rejects(() => save.run(args, { user: pm, question: '' }), { code: 'BRIA_FACT_NO_INTENT' });
  assert.equal(service.calls.length, 0);
  const out = await save.run(args, { user: pm, question: 'Ya no trabajamos con Caribbean, terminó en agosto' });
  assert.equal(out.data.saved, true);
  assert.equal(service.calls[0][0], 'record');
});

test('acceptance uses the actual previous offer, not an affirmative-word detector', async () => {
  const service = fakeService();
  const save = byName(createAgencyFactTools(service), 'guardar_en_memoria');
  const args = { afirmacion: 'Aristea no confirmará el contrato de octubre por falta de flujo de caja.', entidad: 'Aristea', clientId: 'c1', tema: 'acuerdo', tipoEntidad: 'cliente', proposito: 'operacion', certeza: 'CONFIRMADO', desde: '2026-10-09', hasta: null, reemplaza: [], respondeDuda: null };
  const offer = 'Lo dejo así en la memoria de Aristea: el contrato de octubre no se confirmará. ¿Quieres que lo guarde?';
  args.request = { intent: 'ACCEPT', offerEvidence: offer };
  assert.equal((await save.run(args, { user: pm, question: 'Listo', previousAnswer: offer })).data.saved, true);
  await assert.rejects(() => save.run(args, { user: pm, question: 'Listo', previousAnswer: 'Aristea está en rojo por dos frentes.' }), { code: 'BRIA_FACT_NO_INTENT' });
  await assert.rejects(() => save.run(args, { user: pm, question: 'Listo' }), { code: 'BRIA_FACT_NO_INTENT' });
});

test('forgetting needs an explicit request to forget', async () => {
  const service = fakeService();
  const retire = byName(createAgencyFactTools(service), 'retirar_de_memoria');
  await assert.rejects(() => retire.run({ id: 'x', revision: 1, request: { intent: 'TEACH' } }, { user: admin, question: 'Revisa esto' }), { code: 'BRIA_FACT_NO_INTENT' });
  assert.equal((await retire.run({ id: 'x', revision: 1, request: { intent: 'RETIRE' } }, { user: admin, question: 'Olvida ese dato, ya no aplica' })).data.retired, true);
});

test('the service resolves the person again and hides purposes the account cannot read', async () => {
  const seen = [];
  const repository = {
    async search(access, args) { seen.push(access); return [{ id: 'f1', entity: 'Aristea', topic: 'acuerdo', statement: 'Algo.', certainty: 'NO_CONCLUYENTE', purpose: 'operacion', sensitivity: 'normal', sources: [], origin: 'LECTURA', asOf: '2026-10-07' }]; },
    async openQuestions() { return [{ id: 'q1', entity: 'Aristea', question: '¿Hay contrato?', why: 'Para comparar.', who: 'Dirección', priority: 'alta', purpose: 'operacion' }]; }
  };
  const db = { user: { findUnique: async () => ({ id: 'u-pm', name: 'Camila', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, parrillas: true }, financialRole: 'NONE', sessionVersion: 0, teamMember: { isActive: true } }) } };
  const service = createBriaAgencyFactService({ repository, db });
  const out = await service.consult({ ...pm }, { consulta: 'contrato', clientId: 'c1' });
  assert.deepEqual(seen[0].purposes.sort(), ['editorial', 'operacion', 'personas']);
  assert.equal(out.hechos[0].certeza, 'por confirmar: las fuentes no coinciden o falta el documento');
  assert.equal(out.dudas[0].pregunta, '¿Hay contrato?');
  const revoked = createBriaAgencyFactService({ repository, db: { user: { findUnique: async () => ({ id: 'u-pm', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { parrillas: true }, sessionVersion: 0, teamMember: { isActive: true } }) } } });
  await assert.rejects(() => revoked.consult({ ...pm }, { consulta: 'x' }), { status: 403 });
});

test('Bria weighs current records and remembered agreements by scope instead of absolute precedence', () => {
  const tools = createAgencyFactTools(fakeService()).map(({ name, description }) => ({ name, description }));
  assert.match(buildInstructions({ person: { name: 'Camila' }, today: '2026-10-09', tools }), /memoria_de_la_agencia/);
  // La guía de cada herramienta vive en su descripción (31 de octubre de 2026).
  const memory = byName(tools, 'memoria_de_la_agencia').description;
  assert.match(memory, /cuenta, periodo, certeza y procedencia/i);
  assert.match(memory, /memoria histórica tampoco anula un acuerdo posterior/i);
  assert.match(memory, /reconstruye el orden/i);
  const save = byName(tools, 'guardar_en_memoria').description;
  assert.match(save, /una sola duda/i);
  assert.match(save, /saved=true/);
  assert.match(save, /«Sí, guárdalo»/);
  assert.match(byName(tools, 'retirar_de_memoria').description, /ofrece retirarlo/i);
});
