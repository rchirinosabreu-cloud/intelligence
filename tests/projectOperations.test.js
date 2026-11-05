import test from 'node:test';
import assert from 'node:assert/strict';

import * as rules from '../src/lib/projectOperations.js';
import * as service from '../src/services/projectOperationsService.js';
const NOW = new Date('2026-11-04T15:00:00Z');
const quotation = (over = {}) => ({
  id: 'q1', status: 'APROBADA', consecutive: 42, accepted_at: NOW, updated_at: NOW,
  total_amount: 5000000, terms_and_conditions: 'Condiciones económicas privadas',
  items: [
    { id: 'i1', name: 'Contenido mensual', description: 'Cuatro publicaciones', quantity: 4, billingType: 'MONTHLY', price: 1000000, estimatedCost: 100 },
    { id: 'i2', name: 'Identidad gráfica', descriptionHtml: '<p>Manual de marca</p>', quantity: 1, billingType: 'ONE_TIME', price: 3000000 },
  ],
  proposal_details: { version: 1, title: 'Presencia digital', phases: [{ id: 'phase1', title: 'Preparación', completion: 'Manual aprobado', starts: 'AT_START', execution: { min: 2, max: 3, unit: 'WEEKS' } }], paymentPlans: [{ private: 'plan financiero' }] },
  ...over,
});
const FORM = { id: 'f1', quotationId: 'q1', clientId: 'c1', status: 'HABILITADO', enabledAt: NOW };
const USER = { userId: 'u1', role: 'PROJECT_MANAGER' };
const clone = value => structuredClone(value);
const fakeDb = ({ formalization = FORM, quote = quotation() } = {}) => {
  const db = { rows: [], audits: [], contracts: [{ clientId: 'c1', serviceType: 'PARRILLA' }], forms: [clone(formalization)], quotes: [clone(quote)],
    users: [{ id: 'u1', name: 'PM actual', role: 'PROJECT_MANAGER', isActive: true, teamMember: { isActive: true } }],
    clients: [{ id: 'c1', name: 'Cliente', isArchived: false, projectManagerId: 'm1' }],
    members: [{ id: 'm1', name: 'PM actual', isActive: true }],
    $transaction: async fn => {
      const before = { rows: clone(db.rows), audits: clone(db.audits) };
      try { return await fn(db); } catch (error) { Object.assign(db, before); throw error; }
    },
    user: { findUnique: async ({ where }) => db.users.find(row => row.id === where.id) || null },
    teamMember: { findUnique: async ({ where }) => db.members.find(row => row.id === where.id) || null },
    client: { findUnique: async ({ where }) => db.clients.find(row => row.id === where.id) || null },
    quotation: { findUnique: async ({ where }) => db.quotes.find(row => row.id === where.id) || null },
    projectFormalization: {
      findUnique: async ({ where }) => db.forms.find(row => row.id === where.id) || null,
      findMany: async ({ where } = {}) => db.forms.filter(row => !where?.clientId || row.clientId === where.clientId),
    },
    projectOperation: {
      findUnique: async ({ where }) => clone(db.rows.find(row => where.id ? row.id === where.id : row.formalizationId === where.formalizationId) || null),
      findMany: async ({ where }) => clone(db.rows.filter(row => row.clientId === where.clientId)),
      upsert: async ({ where, create }) => {
        let row = db.rows.find(row => row.formalizationId === where.formalizationId);
        if (!row) { row = { id: `p${db.rows.length + 1}`, createdAt: NOW, updatedAt: NOW, revision: 1, reviewStatus: 'PENDIENTE', reviewedAt: null, reviewedById: null, ...clone(create) }; db.rows.push(row); }
        return clone(row);
      },
      updateMany: async ({ where, data }) => {
        const row = db.rows.find(row => row.id === where.id && row.clientId === where.clientId && row.revision === where.revision);
        if (!row) return { count: 0 };
        const revision = row.revision + 1;
        Object.assign(row, clone(data), { revision });
        return { count: 1 };
      },
    },
    financialAuditEvent: { create: async ({ data }) => { db.audits.push(clone(data)); return data; } },
  };
  return db;
};
const prepared = async options => {
  assert.equal(typeof service.ensureProjectOperation, 'function', 'existe preparación idempotente de ficha por proyecto');
  const db = fakeDb(options);
  const row = await service.ensureProjectOperation(db, db.forms[0], { now: NOW });
  return { db, row };
};
const edit = (row, extra = {}) => ({ expectedRevision: row.revision, title: row.title, modality: row.modality, startDate: '2026-11-05', endDate: null,
  projectManagerId: 'm1', deliverables: row.deliverables, notes: '', productionDays: 0, productionHours: null, reportRequired: false, review: false, ...extra });

test('el alcance conserva únicamente servicios del escenario aprobado y elimina campos económicos', () => {
  assert.equal(typeof service.quotationOperationSnapshot, 'function', 'existe proyección operativa de cotización');
  const source = service.quotationOperationSnapshot(quotation({ items: [
    { id: 'x', scenarioId: 'a', selectedScenario: false, name: 'Descartado', price: 10 },
    { id: 'y', scenarioId: 'b', selectedScenario: true, scenarioName: 'Elegido', name: 'Web', description: 'Sitio publicado', quantity: 1, billingType: 'ONE_TIME', price: 20, note: 'Cobrar al iniciar' },
  ] }));
  assert.deepEqual(source.services.map(row => row.label), ['Web']);
  assert.equal(source.scenarioId, 'b');
  assert.equal(source.code, 'COT-0042');
  assert.equal(source.acceptedAt, NOW.toISOString());
  assert.doesNotMatch(JSON.stringify(source), /total_amount|price|estimatedCost|paymentPlans|Cobrar|económicas/);
});

test('una propuesta con escenarios sin elección inequívoca no inventa el alcance', () => {
  assert.equal(typeof service.quotationOperationSnapshot, 'function');
  const source = service.quotationOperationSnapshot(quotation({ items: [{ scenarioId: 'a', name: 'A' }, { scenarioId: 'b', name: 'B' }] }));
  assert.deepEqual(source.services, []);
  assert.equal(source.issue, 'SCENARIO_UNRESOLVED');
});

test('preparar preserva mensualidad existente, crea un proyecto por formalización y captura alcance sin fechas inventadas', async () => {
  const { db, row } = await prepared();
  assert.equal(row.modality, 'MIXTO');
  assert.equal(row.startDate, null);
  assert.equal(row.endDate, null);
  assert.equal(row.productionDays, null);
  assert.equal(row.productionHours, null);
  assert.equal(row.reportRequired, null);
  assert.equal(row.reviewStatus, 'PENDIENTE');
  assert.equal(row.deliverables.length, 2);
  assert.equal(row.sourceSnapshot.phases[0].completion, 'Manual aprobado');
  const again = await service.ensureProjectOperation(db, db.forms[0], { now: NOW });
  assert.equal(again.id, row.id);
  assert.equal(db.rows.length, 1);
  assert.equal(db.audits.length, 1);
  assert.deepEqual(db.contracts, [{ clientId: 'c1', serviceType: 'PARRILLA' }]);
  db.forms.push({ ...FORM, id: 'f2', quotationId: 'q2' });
  db.quotes.push(quotation({ id: 'q2' }));
  await service.ensureProjectOperation(db, db.forms[1], { now: NOW });
  assert.equal(db.rows.length, 2, 'dos proyectos del cliente no se sustituyen');
});

test('la preparación no cambia el snapshot ni las correcciones del PM al repetirse', async () => {
  const { db, row } = await prepared();
  db.rows[0].title = 'Título revisado';
  db.quotes[0].items[0].name = 'Cambio posterior';
  const again = await service.ensureProjectOperation(db, db.forms[0], { now: NOW });
  assert.equal(again.title, 'Título revisado');
  assert.equal(again.sourceSnapshot.services[0].label, row.sourceSnapshot.services[0].label);
});

test('listar es solo lectura y muestra habilitación sin contrato, anticipo ni condiciones', async () => {
  const { db } = await prepared();
  Object.assign(db.forms[0], { exceptionReason: 'privado', advanceReceivableId: 'deuda-privada', requiresContract: true });
  const before = clone(db.rows);
  const result = await service.listClientProjects(db, 'c1', USER);
  assert.equal(result[0].formalizationStatus, 'HABILITADO');
  assert.equal(result[0].source.services.length, 2);
  assert.doesNotMatch(JSON.stringify(result), /privado|advanceReceivable|requiresContract|sourceSnapshot|total_amount/);
  assert.deepEqual(db.rows, before);
});

test('una ficha pendiente de formalización es visible pero no editable ni revisable', async () => {
  const { db, row } = await prepared({ formalization: { ...FORM, status: 'PENDIENTE', enabledAt: null } });
  assert.equal((await service.listClientProjects(db, 'c1', USER))[0].formalizationStatus, 'PENDIENTE');
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row), USER), { status: 409, code: 'PROJECT_NOT_ENABLED' });
  assert.equal(db.rows[0].revision, 1);
});

test('las operaciones revalidan rol y pertenencia activa, sin confiar en el rol enviado', async () => {
  const { db, row } = await prepared();
  db.users[0].role = 'EDITOR';
  await assert.rejects(service.listClientProjects(db, 'c1', { ...USER, role: 'ADMIN' }), { status: 403 });
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row), USER), { status: 403 });
  db.users[0].role = 'ADMIN';
  db.users[0].teamMember.isActive = false;
  await assert.rejects(service.listClientProjects(db, 'c1', USER), { status: 403 });
});

test('actualizar requiere cliente coincidente y revisión vigente', async () => {
  const { db, row } = await prepared();
  db.clients.push({ id: 'c2', name: 'Otro', isArchived: false });
  await assert.rejects(service.updateProjectOperation(db, 'c2', row.id, edit(row), USER), { status: 404 });
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { expectedRevision: 0 }), USER), { status: 409 });
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { expectedRevision: '1' }), USER), { status: 400 });
});

test('revisar necesita los datos operativos explícitos y no inventa un responsable o comienzo', async () => {
  const { db, row } = await prepared();
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { review: true, startDate: null }), USER), { status: 400 });
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { review: true, projectManagerId: null }), USER), { status: 400 });
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { review: true, deliverables: [] }), USER), { status: 400 });
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { review: true, productionDays: null }), USER), { status: 400 });
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { review: true, productionDays: 2, productionHours: null }), USER), { status: 400 });
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { review: true, reportRequired: null }), USER), { status: 400 });
  db.members[0].isActive = false;
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { review: true }), USER), { status: 400 });
});

test('revisar requiere cantidades y unidades operativas y una alternativa comercial resuelta', async () => {
  const { db, row } = await prepared();
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { review: true,
    deliverables: [{ id: 'x', label: 'Piezas', quantity: null, unit: 'piezas' }] }), USER), { status: 400 });
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { review: true,
    deliverables: [{ id: 'x', label: 'Piezas', quantity: 4, unit: null }] }), USER), { status: 400 });
  db.rows[0].sourceSnapshot.issue = 'SCENARIO_UNRESOLVED';
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, { review: true }), USER), { status: 409, code: 'PROJECT_SOURCE_UNRESOLVED' });
});

test('guardar una ficha incompleta mantiene pendiente y revisar completa sella la versión y autor', async () => {
  const { db, row } = await prepared();
  const draft = await service.updateProjectOperation(db, 'c1', row.id, edit(row, { startDate: null }), USER, { now: NOW });
  assert.equal(draft.revision, 2);
  assert.equal(draft.reviewStatus, 'PENDIENTE');
  assert.ok(draft.missing.length);
  const reviewed = await service.updateProjectOperation(db, 'c1', row.id, edit(draft, { review: true }), USER, { now: NOW });
  assert.equal(reviewed.reviewStatus, 'REVISADO');
  assert.equal(reviewed.revision, 3);
  assert.equal(reviewed.reviewedBy.id, 'u1');
  assert.deepEqual(db.rows[0].sourceSnapshot, row.sourceSnapshot);
  assert.equal(db.audits.at(-1).actorId, 'u1');
});

test('editar una ficha ya revisada requiere revisar otra vez y conserva el origen', async () => {
  const { db, row } = await prepared();
  const reviewed = await service.updateProjectOperation(db, 'c1', row.id, edit(row, { review: true }), USER);
  const changed = await service.updateProjectOperation(db, 'c1', row.id, edit(reviewed, { title: 'Nuevo nombre' }), USER);
  assert.equal(changed.reviewStatus, 'PENDIENTE');
  assert.equal(changed.reviewedAt, null);
  assert.equal(changed.reviewedBy, null);
  assert.deepEqual(db.rows[0].sourceSnapshot, row.sourceSnapshot);
});

test('un guardado concurrente no sobrescribe una revisión que avanzó', async () => {
  const { db, row } = await prepared();
  db.projectOperation.updateMany = async () => ({ count: 0 });
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row), USER), { status: 409, code: 'PROJECT_REVISION_CONFLICT' });
  assert.equal(db.rows[0].revision, 1);
});

test('si la auditoría falla la actualización no se confirma', async () => {
  const { db, row } = await prepared();
  db.financialAuditEvent.create = async () => { throw new Error('auditoría no disponible'); };
  await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row), USER), /auditoría/);
  assert.equal(db.rows[0].revision, 1);
});

test('el formulario rechaza fechas inválidas, cantidades negativas y campos de origen falsificados', async () => {
  assert.equal(typeof rules.normalizeProjectOperation, 'function');
  const { db, row } = await prepared();
  for (const extra of [
    { startDate: '2026-02-30' }, { endDate: '2026-11-01' }, { modality: 'INVENTADA' },
    { deliverables: [{ id: 'x', label: 'x', quantity: -1 }] }, { sourceSnapshot: { quotationId: 'otra' } }, { review: 'true' },
  ]) await assert.rejects(service.updateProjectOperation(db, 'c1', row.id, edit(row, extra), USER), { status: 400 });
});
