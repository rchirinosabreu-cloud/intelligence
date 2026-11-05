import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { normalizeOperationProfile, contractQuota } from '../src/lib/clientOperations.js';
import { createClientOperationsService } from '../src/services/clientOperationsService.js';

const contract = () => ({ serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-11-01', cutDay: 1,
  deliverables: [{ format: 'Reel', quantity: 2 }, { format: 'Post', quantity: 2 }], storiesPerWeek: 3, productionDays: 1, monthlyReport: true, notes: 'Alcance previamente registrado.' });
const scope = () => ({ version: 1,
  contentLimits: [{ format: 'Video', quantity: 2, rule: 'MINIMO' }, { format: 'Carrusel', quantity: 8, rule: 'MAXIMO' }],
  stories: { quantity: 3, period: 'DIAS_SEMANA', perOccasion: null },
  production: { included: true, quantity: 2, period: 'MES', hours: 2.5, rule: 'EXACTA', hoursRule: 'MAXIMO' },
  additionalServices: [{ id: 'blog', category: 'BLOG', label: 'Artículos', quantity: 2, unit: 'artículos', frequency: 'MES', notes: null }],
  reviewPending: 'Precisar historias por ocasión.',
});
const normalize = value => normalizeOperationProfile({ contract: { ...contract(), scopeDetails: value } });

test('la ficha conserva alcance estructurado separado del cupo, historias y jornadas heredadas', () => {
  const input = scope();
  const result = normalize(input);
  assert.equal(result.valid, true);
  assert.deepEqual(result.value.contract.scopeDetails, input);
  assert.equal(contractQuota(result.value.contract), 4, 'ni mínimos ni máximos ni servicios incrementan el cupo');
  assert.deepEqual(result.value.contract.deliverables, contract().deliverables);
  assert.equal(result.value.contract.storiesPerWeek, 3);
  assert.equal(result.value.contract.productionDays, 1);
});

test('omitir alcance no inventa datos y null lo retira expresamente', () => {
  const omitted = normalizeOperationProfile({ contract: contract() });
  assert.equal(Object.hasOwn(omitted.value.contract, 'scopeDetails'), false);
  const cleared = normalize(null);
  assert.equal(cleared.valid, true);
  assert.equal(cleared.value.contract.scopeDetails, null);
});

test('desconocido, cero y exclusión explícita son distintos; las notas no generan alcance', () => {
  const unknown = normalize({ stories: { quantity: '', period: 'MES', perOccasion: null }, production: { included: null, quantity: null, hours: '' } });
  assert.equal(unknown.valid, true);
  assert.equal(unknown.value.contract.scopeDetails.stories.quantity, null);
  assert.equal(unknown.value.contract.scopeDetails.production.included, null);
  assert.equal(unknown.value.contract.scopeDetails.production.hours, null);
  const excluded = normalize({ production: { included: false, quantity: 0, hours: 0 } });
  assert.equal(excluded.valid, true);
  assert.equal(excluded.value.contract.scopeDetails.production.quantity, 0);
  const legacy = normalizeOperationProfile({ contract: { ...contract(), notes: '20 videos y 4 jornadas, 3 días de historias' } });
  assert.equal(Object.hasOwn(legacy.value.contract, 'scopeDetails'), false);
});

test('las horas tienen una regla independiente de la cantidad de jornadas', () => {
  const result = normalize({ production: { included: true, quantity: 2, period: 'MES', hours: 3, rule: 'EXACTA', hoursRule: 'MAXIMO' } });
  assert.equal(result.value.contract.scopeDetails.production.rule, 'EXACTA');
  assert.equal(result.value.contract.scopeDetails.production.hoursRule, 'MAXIMO');
  assert.equal(normalize({ production: { hours: 3 } }).value.contract.scopeDetails.production.hoursRule, 'EXACTA');
});

for (const [label, value, field] of [
  ['versión futura', { version: 2 }, 'version'],
  ['array en lugar de objeto', [], ''],
  ['formato desconocido', { contentLimits: [{ format: 'PUBLICADO', quantity: 2 }] }, 'contentLimits.0.format'],
  ['formato duplicado', { contentLimits: [{ format: 'Video', quantity: 2 }, { format: 'Video', quantity: 3 }] }, 'contentLimits.1.format'],
  ['cantidad booleana', { contentLimits: [{ format: 'Video', quantity: true }] }, 'contentLimits.0.quantity'],
  ['cantidad objeto', { stories: { quantity: {} } }, 'stories.quantity'],
  ['cantidad array', { stories: { quantity: [3] } }, 'stories.quantity'],
  ['cantidad infinita', { stories: { quantity: Infinity } }, 'stories.quantity'],
  ['cantidad negativa', { stories: { quantity: -1 } }, 'stories.quantity'],
  ['historias fraccionarias', { stories: { quantity: 2.5 } }, 'stories.quantity'],
  ['más de siete días', { stories: { quantity: 8, period: 'DIAS_SEMANA' } }, 'stories.quantity'],
  ['periodo desconocido', { stories: { quantity: 3, period: 'DIA' } }, 'stories.period'],
  ['incluida como texto', { production: { included: 'false' } }, 'production.included'],
  ['exclusión con jornadas', { production: { included: false, quantity: 1 } }, 'production.quantity'],
  ['exclusión con horas', { production: { included: false, hours: 2 } }, 'production.hours'],
  ['horas de una jornada excesivas', { production: { hours: 25 } }, 'production.hours'],
  ['jornadas fraccionarias', { production: { quantity: 1.5 } }, 'production.quantity'],
  ['mínimo no autorizado para horas', { production: { hoursRule: 'MINIMO' } }, 'production.hoursRule'],
  ['servicio sin etiqueta', { additionalServices: [{ id: 'x', category: 'WEB' }] }, 'additionalServices.0.label'],
  ['servicio con categoría inválida', { additionalServices: [{ id: 'x', category: 'FINANZAS', label: 'Uno' }] }, 'additionalServices.0.category'],
  ['servicios repetidos', { additionalServices: [{ id: 'x', category: 'WEB', label: 'Uno' }, { id: 'x', category: 'BLOG', label: 'Dos' }] }, 'additionalServices.1.id'],
  ['nota demasiado larga', { reviewPending: 'x'.repeat(2001) }, 'reviewPending'],
]) {
  test(`el alcance rechaza ${label} sin coerción silenciosa`, () => {
    const result = normalize(value);
    assert.equal(result.valid, false);
    assert.ok(result.errors[`contract.scopeDetails${field ? `.${field}` : ''}`]);
  });
}

test('solo se guardan claves operativas y se aceptan números de formulario sin volver vacíos cero', () => {
  const result = normalize({ ...scope(), privateValue: 123, production: { included: null, quantity: '2', hours: '1.5', price: 500 },
    additionalServices: [{ id: 'web', category: 'WEB', label: ' Actualización ', quantity: '1.5', unit: 'horas', frequency: 'CONTRATO', notes: ' Revisar ', amount: 500 }] });
  assert.equal(result.valid, true);
  const saved = result.value.contract.scopeDetails;
  assert.equal(Object.hasOwn(saved, 'privateValue'), false);
  assert.equal(Object.hasOwn(saved.production, 'price'), false);
  assert.equal(saved.production.quantity, 2);
  assert.equal(saved.production.hours, 1.5);
  assert.equal(saved.additionalServices[0].quantity, 1.5);
  assert.equal(saved.additionalServices[0].label, 'Actualización');
  assert.equal(Object.hasOwn(saved.additionalServices[0], 'amount'), false);
});

function fixture(initialScope = scope()) {
  const row = { id: 'scope-client', slug: 'scope-client', name: 'Cliente ficticio', isArchived: false,
    contracts: [{ id: 'scope-contract', ...contract(), scopeDetails: initialScope }], contentPlans: [], nativeTasks: [], monthlyReports: [], observations: [] };
  const writes = [];
  const db = {
    client: { findMany: async () => [row], findFirst: async () => row, update: async args => { writes.push(['profile', args.data]); return row; } },
    teamMember: { findMany: async () => [] },
    clientContract: {
      update: async args => { writes.push(['update', args.data]); Object.assign(row.contracts[0], args.data, args.data.scopeDetails === Prisma.DbNull ? { scopeDetails: null } : {}); return row.contracts[0]; },
      create: async args => { writes.push(['create', args.data]); const created = { id: 'renewal', ...args.data }; row.contracts.unshift(created); return created; },
    },
    $transaction: async fn => fn(db),
  };
  return { row, writes, service: createClientOperationsService({ db, now: () => new Date('2026-11-05T15:00:00Z') }) };
}

test('leer el alcance es aditivo y no cambia ninguna cifra o historial de operación', async () => {
  const { row, service, writes } = fixture(null);
  const before = await service.getOperation(row.slug);
  row.contracts[0].scopeDetails = scope();
  const after = await service.getOperation(row.slug);
  assert.deepEqual(after.contract.scopeDetails, scope());
  assert.equal(before.contract.scopeDetails, null);
  assert.deepEqual(after.cycles, before.cycles);
  assert.deepEqual(after.history, before.history);
  assert.deepEqual(after.evaluation, before.evaluation);
  assert.equal(writes.length, 0);
});

test('una edición antigua que omite scopeDetails conserva el dato guardado', async () => {
  const { row, service, writes } = fixture();
  const result = await service.saveProfile({ clientId: row.id, input: { contract: contract() } });
  assert.equal(Object.hasOwn(writes.find(([kind]) => kind === 'update')[1], 'scopeDetails'), false);
  assert.deepEqual(result.contract.scopeDetails, scope());
});

test('guardar y borrar alcance usan JSON y DbNull explícitos, sin alterar notas ni cupo', async () => {
  const { row, service, writes } = fixture(null);
  await service.saveProfile({ clientId: row.id, input: { contract: { ...contract(), scopeDetails: scope() } } });
  const update = writes.find(([kind]) => kind === 'update')[1];
  assert.deepEqual(update.scopeDetails, scope());
  assert.deepEqual(update.deliverables, contract().deliverables);
  assert.equal(update.notes, contract().notes);
  const result = await service.saveProfile({ clientId: row.id, input: { contract: { ...contract(), scopeDetails: null } } });
  assert.equal(writes.filter(([kind]) => kind === 'update').at(-1)[1].scopeDetails, Prisma.DbNull);
  assert.equal(result.contract.scopeDetails, null);
});

test('renovar sin alcance explícito deja la nueva ficha vacía y conserva la anterior', async () => {
  const { row, service, writes } = fixture();
  const previous = structuredClone(row.contracts[0]);
  const result = await service.saveProfile({ clientId: row.id, input: { renew: true, contract: { ...contract(), startDate: '2027-01-01' } } });
  assert.equal(Object.hasOwn(writes.find(([kind]) => kind === 'create')[1], 'scopeDetails'), false);
  assert.equal(row.contracts[0].scopeDetails ?? null, null, 'la renovación futura no hereda el alcance');
  assert.equal(result.contract.id, previous.id, 'la ficha conserva el contrato que ya está en curso');
  assert.deepEqual(result.contract.scopeDetails, previous.scopeDetails);
  assert.deepEqual(row.contracts[1], previous);
});

test('alcance inválido se rechaza antes de cualquier escritura', async () => {
  const { row, service, writes } = fixture();
  await assert.rejects(service.saveProfile({ clientId: row.id, input: { contract: { ...contract(), scopeDetails: { production: { included: false, quantity: 2 } } } } }), error => error.status === 422 && Boolean(error.errors['contract.scopeDetails.production.quantity']));
  assert.equal(writes.length, 0);
});

test('editar alcance conserva responsables ya asignados aunque ya no estén activos', async () => {
  const { row, service, writes } = fixture();
  row.projectManagerId = 'pm-previous';
  row.responsibleId = 'cm-previous';
  // Ninguna de las personas sigue activa; los IDs ya asignados se conservan.
  await service.saveProfile({ clientId: row.id, input: { projectManagerId: row.projectManagerId, communityManagerId: row.responsibleId, contract: { ...contract(), scopeDetails: scope() } } });
  const profile = writes.find(([kind]) => kind === 'profile')[1];
  assert.equal(profile.projectManagerId, 'pm-previous');
  assert.equal(profile.responsibleId, 'cm-previous');
});

test('omitir responsables conserva asignaciones; null explícito sí permite retirarlas', async () => {
  const { row, service, writes } = fixture();
  row.projectManagerId = 'pm-previous';
  row.responsibleId = 'cm-previous';
  await service.saveProfile({ clientId: row.id, input: { contract: contract() } });
  const profile = writes.find(([kind]) => kind === 'profile')[1];
  assert.equal(Object.hasOwn(profile, 'projectManagerId'), false);
  assert.equal(Object.hasOwn(profile, 'responsibleId'), false);
  await service.saveProfile({ clientId: row.id, input: { projectManagerId: null } });
  assert.equal(writes.filter(([kind]) => kind === 'profile').at(-1)[1].projectManagerId, null);
  assert.equal(Object.hasOwn(writes.filter(([kind]) => kind === 'profile').at(-1)[1], 'responsibleId'), false);
});

for (const field of ['projectManagerId', 'communityManagerId']) {
  test(`conservar responsables no permite asignar otro inactivo como ${field}`, async () => {
    const { row, service, writes } = fixture();
    row.projectManagerId = 'pm-previous'; row.responsibleId = 'cm-previous';
    await assert.rejects(service.saveProfile({ clientId: row.id, input: { [field]: 'other-inactive' } }), error => error.status === 422 && Boolean(error.errors[field]));
    assert.equal(writes.length, 0);
  });
}
