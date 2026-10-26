import test from 'node:test';
import assert from 'node:assert/strict';
import { readDecisionContext } from '../src/services/briaDecisionContext.js';
import { briaAssistantTools } from '../src/services/briaAssistantTools.js';

const clients = [{ id: 'c1', name: 'Estudio Roble', slug: 'roble' }, { id: 'c2', name: 'Clínica Faro', slug: 'faro' }];
const learning = { id: 'old-agreement', scope: 'ACCOUNT', contextClientId: 'c1', entity: 'roble', topic: 'continuidad', text: 'Las piezas de octubre se prepararon sin acuerdo de continuidad.', kind: 'CONFIRMED', status: 'ACTIVE', revision: 3, validFrom: '2026-10-01', validUntil: '2026-10-31', author: 'Dirección', updatedAt: '2026-10-26T15:00:00Z' };
const agency = { ...learning, id: 'old-proposal', scope: 'AGENCY', contextClientId: null, entity: 'agencia', kind: 'PROPOSAL', text: 'Propuesta de revisión semanal de compromisos.' };
const context = () => ({
  user: { id: 'u', role: 'ADMIN' }, today: '2026-10-26', logger: { warn() {} },
  agencyFacts: { contextForClients: async (_user, selected) => ({ cuentas: selected.map(client => ({ clientId: client.id, estado: 'CONSULTADO', parcial: false, hechos: [{ id: `fact-${client.id}`, afirmacion: 'Dato actual de la cuenta.' }] })) }) },
  knowledge: { businessContext: async (_user, selected) => ({ agency: { state: 'CONSULTADO', partial: false, learnings: [agency] }, accounts: selected.map(client => ({ clientId: client.id, state: 'CONSULTADO', partial: false, learnings: client.id === 'c1' ? [learning] : [] })) }) },
  operations: { listOperations: async () => clients.map(client => ({ ...client, evaluation: { level: 'red' }, cycles: { current: { overdueItems: 9 } } })), getOperation: async () => clients[0] }
});

test('decision context joins existing business learning with facts without upgrading its certainty or changing periods', async () => {
  const result = await readDecisionContext(context(), clients);
  const account = result.forClient('c1');
  assert.equal(result.partial, false);
  assert.equal(account.hechos[0].id, 'fact-c1');
  assert.equal(account.aprendizajesAnteriores.registros[0].afirmacion, learning.text);
  assert.equal(account.aprendizajesAnteriores.registros[0].certeza, 'CONFIRMED');
  assert.equal(account.aprendizajesAnteriores.registros[0].revision, 3);
  assert.equal(account.aprendizajesAnteriores.registros[0].hasta, '2026-10-31');
  assert.equal(result.agency.registros[0].certeza, 'PROPOSAL');
  assert.deepEqual(result.sources.filter(source => source.kind === 'aprendizaje').map(source => source.id).sort(), ['old-agreement', 'old-proposal']);
});

test('portfolio includes general agency learning once, while all three operational tools attach account learning', async () => {
  const ctx = context();
  const find = name => briaAssistantTools.find(tool => tool.name === name);
  const portfolio = await find('cartera_de_operacion').run({}, ctx);
  assert.equal(portfolio.data.contextoAgencia.registros.length, 1);
  assert.equal(JSON.stringify(portfolio.data).split(agency.text).length - 1, 1, 'shared context must not multiply by account count');
  assert.equal(portfolio.data.cuentas.find(row => row.clientId === 'c1').contexto.aprendizajesAnteriores.registros.length, 1);
  assert.equal(portfolio.data.cuentas[0].mesActual.vencidas, 9, 'remembering does not rewrite operational counters');
  const detail = await find('operacion_de_cliente').run({ slug: 'roble' }, ctx);
  assert.equal(detail.data.operacion.contexto.aprendizajesAnteriores.registros[0].id, learning.id);
  assert.equal(detail.data.contextoAgencia.registros[0].id, agency.id);
  const plan = await find('parrilla_de_cliente').run({ clientId: 'c1' }, { ...ctx, db: { contentPlan: { findFirst: async () => ({ id: 'p1', client: clients[0], month: 10, year: 2026, contentItems: [] }) } } });
  assert.equal(plan.data.parrilla.contexto.aprendizajesAnteriores.registros[0].id, learning.id);
  assert.equal(plan.data.contextoAgencia.registros[0].id, agency.id);
});

test('an unavailable old memory store leaves current evidence usable but declares partial context', async () => {
  const ctx = context();
  ctx.knowledge.businessContext = async () => { throw new Error('PRIVATE connection details'); };
  const result = await readDecisionContext(ctx, clients);
  assert.equal(result.partial, true);
  assert.equal(result.forClient('c1').estado, 'CONSULTADO');
  assert.equal(result.forClient('c1').hechos.length, 1);
  assert.equal(result.forClient('c1').aprendizajesAnteriores.estado, 'NO_DISPONIBLE');
  assert.equal(result.agency.estado, 'NO_DISPONIBLE');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
  delete ctx.knowledge;
  assert.equal((await readDecisionContext(ctx, clients)).partial, true);
});

test('legacy context propagates lost authorization and revalidates the turn before returning evidence', async () => {
  const ctx = context();
  ctx.knowledge.businessContext = async () => { throw Object.assign(new Error('revoked'), { status: 403 }); };
  await assert.rejects(readDecisionContext(ctx, clients), { status: 403 });
  let checks = 0;
  await assert.rejects(readDecisionContext({ ...context(), revalidate: async () => { if (++checks > 1) throw Object.assign(new Error('deleted'), { status: 404 }); } }, clients), { status: 404 });
});

test('a non-manager can still read an authorized editorial plan without requesting business memory', async () => {
  const ctx = context();
  ctx.user = { id: 'collaborator', role: 'COLLABORATOR' };
  let calls = 0;
  ctx.knowledge.businessContext = async () => { calls++; throw Object.assign(new Error('restricted'), { status: 403 }); };
  const result = await briaAssistantTools.find(tool => tool.name === 'parrilla_de_cliente').run({ clientId: 'c1' }, { ...ctx, db: { contentPlan: { findFirst: async () => ({ id: 'p1', client: clients[0], month: 10, year: 2026, contentItems: [] }) } } });
  assert.equal(calls, 0);
  assert.equal(result.data.parrilla.id, 'p1');
  assert.equal(result.data.contextoAgencia.estado, 'NO_DISPONIBLE');
});

test('context never presents personal, revoked or wrongly associated learning as account evidence', async () => {
  const ctx = context();
  ctx.knowledge.businessContext = async () => ({ agency: { state: 'CONSULTADO', partial: false, learnings: [agency, { ...agency, id: 'personal', scope: 'PERSONAL' }] }, accounts: [
    { clientId: 'c1', state: 'CONSULTADO', partial: true, learnings: [learning, { ...learning, id: 'revoked', status: 'REVOKED' }, { ...learning, id: 'other-account', contextClientId: 'c2' }] },
    { clientId: 'c2', state: 'CONSULTADO', partial: false, learnings: [] }
  ] });
  const result = await readDecisionContext(ctx, clients);
  assert.equal(result.partial, true);
  assert.deepEqual(result.forClient('c1').aprendizajesAnteriores.registros.map(row => row.id), ['old-agreement']);
  assert.doesNotMatch(JSON.stringify(result.sources), /personal|revoked|other-account/);
});
