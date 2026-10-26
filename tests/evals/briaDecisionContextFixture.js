import assert from 'node:assert/strict';
import { createTaskLifecycleFixture } from './briaTaskLifecycleFixture.js';
import { briaAssistantTools } from '../../src/services/briaAssistantTools.js';
import { createBriaAgencyFactService } from '../../src/services/briaAgencyFactService.js';

// Different fictional clients: an unapproved month, an active obligation, and a
// historical pause superseded by a later renewal. No production data or writes.
export const createDecisionContextFixture = ai => {
  const reads = [], writes = [];
  const clients = [
    { id: 'roble', name: 'Estudio Roble Ficticio', slug: 'roble', overdue: 9, end: '2026-09-30' },
    { id: 'faro', name: 'Clínica Faro Ficticia', slug: 'faro', overdue: 4, end: '2026-12-31' },
    { id: 'lago', name: 'Hotel Lago Ficticio', slug: 'lago', overdue: 7, end: '2026-12-31' }
  ];
  const operations = clients.map(client => ({ ...client, contract: { status: 'ACTIVO', startDate: client.id === 'lago' ? '2026-10-01' : '2026-01-01', endDate: client.end, notes: client.id === 'roble' ? 'Sin renovación registrada para octubre' : 'Octubre a diciembre', deliverables: [{ format: 'Post', quantity: 12 }] }, evaluation: { level: 'red', reasons: [{ text: `${client.overdue} piezas con fecha pasada sin publicación registrada` }] }, cycles: { current: { label: 'Octubre de 2026', quota: 12, created: 12, reached: { aprobada: 12, publicada: 12 - client.overdue }, overdueItems: client.overdue } }, openTasks: [] }));
  let facts = [
    { id: 'roble-oct', clientId: 'roble', statement: 'Octubre no se contrató. Esa parrilla fue una propuesta sin autorización; no hay compromiso de publicar esas nueve piezas.', validFrom: '2026-10-01', validUntil: '2026-10-31' },
    { id: 'faro-oct', clientId: 'faro', statement: 'Octubre sí está contratado y aprobado. Faltan publicar cuatro piezas; no hay una suspensión acordada.', validFrom: '2026-10-01' },
    { id: 'lago-sep', clientId: 'lago', statement: 'La cuenta quedó suspendida durante septiembre.', validFrom: '2026-09-01', validUntil: '2026-09-30' },
    { id: 'lago-oct', clientId: 'lago', statement: 'La dirección confirmó renovación para octubre a diciembre. Las siete publicaciones pendientes de octubre son compromisos vigentes; la pausa de septiembre terminó.', validFrom: '2026-10-01', validUntil: '2026-12-31' }
  ].map(row => ({ ...row, entity: clients.find(client => client.id === row.clientId).name, topic: 'acuerdo', certainty: 'CONFIRMADO', purpose: 'operacion', sensitivity: 'normal', origin: 'EQUIPO', actorName: 'Marina Duarte', updatedAt: '2026-10-24T16:00:00Z', status: 'ACTIVE', revision: 1, sources: [] }));
  const user = { id: 'lifecycle-user', role: 'ADMIN', isActive: true, sessionVersion: 0, modulePermissions: { bria: true }, teamMember: { isActive: true } };
  const factsService = createBriaAgencyFactService({ db: { user: { findUnique: async () => user } }, repository: {
    searchClients: async (_access, selected, limit) => { reads.push('account-context'); return selected.flatMap(client => facts.filter(row => row.clientId === client.id).slice(0, limit)); },
    search: async (_access, { clientId, entity }) => { reads.push('memory'); return facts.filter(row => row.clientId === clientId || row.entity === entity); }, openQuestions: async () => [],
    getMany: async (_access, ids) => facts.filter(row => ids.includes(row.id))
  } });
  const planFor = id => { const client = clients.find(row => row.id === id); return client && { id: `${id}-plan`, client, month: 10, year: 2026, contentItems: Array.from({ length: 12 }, (_, i) => ({ id: `${id}-${i}`, objective: `Pieza ${i + 1}`, format: 'Post', publishDate: '2026-10-22', status: i < client.overdue ? 'APROBADO' : 'PUBLICADO', copyText: 'Texto ficticio', captionText: 'Texto público', finalAssetKey: 'fictional', publications: i < client.overdue ? [] : [{ status: 'PUBLISHED' }], tasks: [] })) }; };
  const fixture = createTaskLifecycleFixture(ai, { assistantTools: briaAssistantTools, assistantOptions: { agencyFacts: factsService },
    assistantContext: { knowledge: { businessContext: async (_user, selected) => ({ agency: { state: 'CONSULTADO', partial: false, learnings: [] }, accounts: selected.map(client => ({ clientId: client.id, state: 'CONSULTADO', partial: false, learnings: [] })) }) }, operations: { listOperations: async () => { reads.push('portfolio'); return operations; }, getOperation: async slug => operations.find(row => row.slug === slug) }, getTasks: async () => [],
      readActivity: async () => [], load: { get: async () => ({ people: [], days: [], forecast: null }) }, rhythm: { get: async () => ({ people: [], profiles: [], hours: [] }) }, searchMemory: async () => [], searchAgency: async () => [] },
    extraDb: { client: { findUnique: async ({ where }) => clients.find(row => row.id === where.id), findMany: async ({ where }) => { const term = where?.name?.contains || ''; return clients.filter(row => row.name.toLowerCase().includes(term.toLowerCase())); } },
      contentPlan: { findFirst: async ({ where }) => { reads.push('content'); return planFor(where.clientId); } }, task: { findMany: async () => [], count: async () => 0 }, clientEditorialCriterion: { findMany: async () => [] }, contentPlanReviewFinding: { findMany: async () => [] } }
  });
  return { ...fixture, reads, writes, pauseLago: () => { facts = [...facts.filter(row => row.clientId !== 'lago'), { ...facts.find(row => row.id === 'lago-oct'), id: 'lago-new', statement: 'El cliente acordó hoy suspender octubre y reprogramar esas siete piezas para noviembre; ya no son compromisos vencidos de octubre.', validFrom: '2026-10-24', revision: 2 }]; } };
};

export const runDecisionContextScenario = async fixture => {
  const answer = await fixture.send('¿Cómo ves el cumplimiento de las parrillas de octubre? Revisa las cuentas y dime a cuáles debemos prestar atención primero y por qué. Solo analiza, sin preparar ni ejecutar cambios.');
  assert.deepEqual(answer.failures, []);
  assert.equal(answer.pendingAction, undefined); assert.equal(answer.investigation, undefined);
  assert.equal(fixture.created.length, 0); assert.deepEqual(fixture.writes, []);
  assert.ok(fixture.reads.includes('portfolio')); assert.ok(fixture.reads.includes('account-context'));
  assert.ok(answer.sources.some(row => row.kind === 'hecho_agencia' && row.id === 'roble-oct'));
  assert.match(answer.text, /Roble/); assert.match(answer.text, /Lago/); assert.match(answer.text, /Faro/);
  assert.match(answer.text, /renova|renovó|octubre a diciembre|vigent/iu);
  assert.match(answer.text, /propuesta|no.*contrat|sin.*autoriz/iu);
};
