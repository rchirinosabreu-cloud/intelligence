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

test('the memory tools exist only for people with Bria activated', () => {
  const tools = createAgencyFactTools(fakeService());
  assert.deepEqual(tools.map((t) => t.name), ['memoria_de_la_agencia', 'guardar_en_memoria', 'retirar_de_memoria']);
  for (const tool of tools) {
    assert.equal(tool.allowed(pm), true);
    assert.equal(tool.allowed({ ...pm, modulePermissions: { parrillas: true } }), false);
    assert.equal(tool.allowed({ ...pm, role: 'EDITOR' }), false);
  }
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
  const args = { afirmacion: 'Caribbean Drive terminó en agosto de 2026.', entidad: 'Caribbean Drive', clientId: null, tema: 'relacion', tipoEntidad: 'cliente', proposito: 'operacion', certeza: 'CONFIRMADO', desde: '2026-08-31', hasta: null, reemplaza: [], respondeDuda: null };
  await assert.rejects(() => save.run(args, { user: pm, question: '¿Caribbean sigue activo?' }), /corrección|enseñanza/i);
  assert.equal(service.calls.length, 0);
  const out = await save.run(args, { user: pm, question: 'Ya no trabajamos con Caribbean, terminó en agosto' });
  assert.equal(out.data.saved, true);
  assert.equal(service.calls[0][0], 'record');
});

test('forgetting needs an explicit request to forget', async () => {
  const service = fakeService();
  const retire = byName(createAgencyFactTools(service), 'retirar_de_memoria');
  await assert.rejects(() => retire.run({ id: 'x', revision: 1 }, { user: admin, question: 'Revisa esto' }), /olvidar/i);
  assert.equal((await retire.run({ id: 'x', revision: 1 }, { user: admin, question: 'Olvida ese dato, ya no aplica' })).data.retired, true);
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

test('Bria is told how to use the agency memory and that the team and the platform outrank the reading', () => {
  const tools = createAgencyFactTools(fakeService()).map(({ name, description }) => ({ name, description }));
  const text = buildInstructions({ person: { name: 'Camila' }, today: '2026-10-09', tools });
  assert.match(text, /memoria_de_la_agencia/);
  assert.match(text, /lo que el equipo confirm/i);
  assert.match(text, /plataforma actual/i);
  assert.match(text, /una sola duda/i);
});
