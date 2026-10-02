import test from 'node:test';
import assert from 'node:assert/strict';
import { createClientOperationsService } from '../src/services/clientOperationsService.js';

// La Operación de clientes se calcula con lo que hay en la plataforma: parrillas, piezas, publicaciones y
// tareas. El servicio solo escribe la ficha operativa, el contrato y el informe entregado.

const NOW = new Date('2026-10-02T15:00:00.000Z'); // 2 oct, 10:00 en Bogotá
const noon = (key) => new Date(`${key}T12:00:00.000Z`);
const member = (id, name, isActive = true) => ({ id, name, avatarUrl: null, isActive });

const item = (id, date, status, extra = {}) => ({
  id, status, publishDate: noon(date), format: 'Post', objective: `Pieza ${id}`, copyText: '', captionText: '',
  finalAssetKey: null, _count: { finalAssets: 0 }, publications: [], ...extra,
});

function fixture() {
  const clients = [
    {
      id: 'c-nattal', name: 'Nattal', slug: 'nattal', logoUrl: null, isArchived: false,
      description: null, instagramUrl: null, agency: 'BRAIN', complexity: 'MEDIA',
      responsible: member('m-jarlan', 'Jarlan'), projectManager: member('m-kamila', 'Kamila'),
      contracts: [{ id: 'k1', serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-01-01', endDate: null, standBySince: null, cutDay: 1, deliverables: [{ format: 'Post', quantity: 4 }], storiesPerWeek: 3, productionDays: 0, monthlyReport: true, notes: null }],
      monthlyReports: [{ year: 2026, month: 9, deliveredAt: new Date('2026-10-01T14:00:00Z'), deliveredById: 'u-kamila' }],
      contentPlans: [
        { id: 'p-sep', year: 2026, month: 9, contentItems: [item('s1', '2026-09-02', 'PUBLICADO'), item('s2', '2026-09-09', 'PUBLICADO'), item('s3', '2026-09-16', 'PUBLICADO'), item('s4', '2026-09-23', 'PUBLICADO')] },
        { id: 'p-oct', year: 2026, month: 10, contentItems: [
          item('o1', '2026-10-01', 'APROBADO', { publications: [{ status: 'SCHEDULED' }] }),
          item('o2', '2026-10-05', 'BORRADOR', { copyText: 'ESCENA 1', finalAssetKey: 'k' }),
          item('o3', '2026-10-08', 'BORRADOR'),
        ] },
      ],
      nativeTasks: [{ id: 't1', title: 'Subir los videos', dueDate: new Date('2026-09-30T20:00:00Z'), status: 'PENDIENTE', isPrivate: false, assignee: member('m-rodny', 'Rodny') }],
    },
    {
      id: 'c-mimas', name: 'Mimas Kitchen', slug: 'mimas', logoUrl: null, isArchived: false,
      responsible: null, projectManager: null,
      contracts: [{ id: 'k2', serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-01-15', endDate: '2026-12-15', cutDay: 15, deliverables: [{ format: 'Reel', quantity: 2 }], storiesPerWeek: 0, productionDays: 0, monthlyReport: false, notes: null }],
      monthlyReports: [],
      contentPlans: [{ id: 'p-mimas-sep', year: 2026, month: 9, contentItems: [item('m1', '2026-09-20', 'APROBADO'), item('m2', '2026-10-10', 'APROBADO')] }],
      nativeTasks: [],
    },
    { id: 'c-promo', name: 'Promo Group', slug: 'promo', logoUrl: null, isArchived: false, responsible: null, projectManager: null, contracts: [], monthlyReports: [], contentPlans: [], nativeTasks: [] },
  ];
  const writes = [];
  const team = [member('m-kamila', 'Kamila'), member('m-jarlan', 'Jarlan'), member('m-old', 'Exempleado', false)];
  const db = {
    client: {
      findMany: async () => clients,
      findFirst: async ({ where }) => clients.find((c) => (where.slug ? c.slug === where.slug : c.id === where.id)) || null,
      update: async (args) => { writes.push(['client.update', args]); return clients.find((c) => c.id === args.where.id); },
    },
    teamMember: { findMany: async ({ where }) => team.filter((m) => where.id.in.includes(m.id) && m.isActive === where.isActive) },
    user: { findMany: async ({ where }) => [{ id: 'u-kamila', name: 'Kamila' }].filter((u) => where.id.in.includes(u.id)) },
    clientContract: {
      create: async (args) => { writes.push(['contract.create', args]); return args.data; },
      update: async (args) => { writes.push(['contract.update', args]); return args.data; },
    },
    clientMonthlyReport: {
      upsert: async (args) => { writes.push(['report.upsert', args]); return args.create; },
      deleteMany: async (args) => { writes.push(['report.delete', args]); return { count: 1 }; },
    },
    $transaction: async (run) => run(db),
  };
  return { db, writes, service: createClientOperationsService({ db, now: () => NOW }) };
}

test('el tablero calcula avance, atrasos y tareas con lo que hay en la plataforma', async () => {
  const { service } = fixture();
  const list = await service.listOperations();
  const nattal = list.find((c) => c.slug === 'nattal');
  assert.equal(nattal.communityManager.name, 'Jarlan');
  assert.equal(nattal.projectManager.name, 'Kamila');
  assert.equal(nattal.cycles.current.label, 'Octubre');
  assert.equal(nattal.cycles.current.created, 3);
  assert.deepEqual(nattal.cycles.current.reached, { redactada: 2, disenada: 2, aprobada: 1, programada: 1, publicada: 0 });
  assert.equal(nattal.cycles.current.overdueItems, 1, 'o1 era del 1 oct y no ha salido');
  assert.equal(nattal.cycles.current.pieces, undefined, 'el tablero no carga el detalle de cada pieza');
  assert.equal(nattal.cycles.previous.reached.publicada, 4);
  assert.equal(nattal.cycles.previous.report.by, 'Kamila');
  assert.deepEqual(nattal.openTasks, [{ id: 't1', title: 'Subir los videos', dueDate: '2026-09-30', overdue: true, assignee: { id: 'm-rodny', name: 'Rodny', avatarUrl: null } }]);
  assert.equal(nattal.evaluation.level, 'red');
});

test('con día de corte, el 2 de octubre todavía corre la parrilla de septiembre', async () => {
  const { service } = fixture();
  const mimas = (await service.listOperations()).find((c) => c.slug === 'mimas');
  assert.equal(mimas.cycles.current.label, 'Septiembre');
  assert.equal(mimas.cycles.current.start, '2026-09-15');
  assert.equal(mimas.cycles.current.created, 2);
  assert.equal(mimas.cycles.current.overdueItems, 1);
});

test('sin contrato el cliente aparece, gris y sin inventar cifras', async () => {
  const { service } = fixture();
  const promo = (await service.listOperations()).find((c) => c.slug === 'promo');
  assert.equal(promo.contract, null);
  assert.deepEqual(promo.cycles, {});
  assert.equal(promo.evaluation.level, 'gray');
});

test('la página del cliente trae las piezas y los meses anteriores con su informe', async () => {
  const { service } = fixture();
  const nattal = await service.getOperation('nattal');
  assert.deepEqual(nattal.cycles.current.pieces.map((p) => [p.id, p.date, p.title, p.planId]), [
    ['o1', '2026-10-01', 'Pieza o1', 'p-oct'], ['o2', '2026-10-05', 'Pieza o2', 'p-oct'], ['o3', '2026-10-08', 'Pieza o3', 'p-oct'],
  ]);
  assert.deepEqual(nattal.history.map((m) => [m.label, m.reached.publicada, m.report?.by ?? null]), [['Septiembre', 4, 'Kamila'], ['Agosto', 0, null], ['Julio', 0, null]]);
  await assert.rejects(() => service.getOperation('no-existe'), { status: 404 });
});

test('guardar la ficha valida, crea el contrato si no hay y nunca toca otros campos', async () => {
  const { service, writes } = fixture();
  await service.saveProfile({
    clientId: 'c-promo', actorUserId: 'u1',
    input: { description: 'Agencia aliada', agency: 'BRAIN', projectManagerId: 'm-kamila', communityManagerId: 'm-jarlan', name: 'Hackeado', isArchived: true,
      contract: { serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-09-15', endDate: '2027-01-14', cutDay: 15, deliverables: [{ format: 'Reel', quantity: 4 }], storiesPerWeek: 0, productionDays: 1, monthlyReport: true } },
  });
  const [, clientUpdate] = writes.find(([kind]) => kind === 'client.update');
  assert.deepEqual(Object.keys(clientUpdate.data).sort(), ['agency', 'complexity', 'description', 'instagramUrl', 'projectManagerId', 'responsibleId']);
  assert.equal(clientUpdate.data.responsibleId, 'm-jarlan');
  const [, created] = writes.find(([kind]) => kind === 'contract.create');
  assert.equal(created.data.clientId, 'c-promo');
  assert.equal(created.data.createdById, 'u1');
  assert.deepEqual(created.data.deliverables, [{ format: 'Reel', quantity: 4 }]);
});

test('guardar actualiza el contrato vigente y «renovar» crea uno nuevo', async () => {
  const { service, writes } = fixture();
  const contract = { serviceType: 'PARRILLA', status: 'ACTIVO', startDate: '2026-01-01', endDate: null, cutDay: 1, deliverables: [{ format: 'Post', quantity: 6 }], storiesPerWeek: 3, productionDays: 0, monthlyReport: true };
  await service.saveProfile({ clientId: 'c-nattal', actorUserId: 'u1', input: { agency: 'BRAIN', contract } });
  const [, updated] = writes.find(([kind]) => kind === 'contract.update');
  assert.equal(updated.where.id, 'k1');
  assert.equal(updated.data.updatedById, 'u1');
  await service.saveProfile({ clientId: 'c-nattal', actorUserId: 'u1', input: { agency: 'BRAIN', renew: true, contract: { ...contract, startDate: '2027-01-01' } } });
  assert.ok(writes.some(([kind, args]) => kind === 'contract.create' && args.data.startDate === '2027-01-01'));
});

test('la ficha mal llenada o con personas inactivas se rechaza con el motivo por campo', async () => {
  const { service, writes } = fixture();
  await assert.rejects(() => service.saveProfile({ clientId: 'c-nattal', actorUserId: 'u1', input: { agency: 'OTRA' } }), (error) => error.status === 422 && Boolean(error.errors.agency));
  await assert.rejects(() => service.saveProfile({ clientId: 'c-nattal', actorUserId: 'u1', input: { projectManagerId: 'm-old' } }), (error) => error.status === 422 && Boolean(error.errors.projectManagerId));
  await assert.rejects(() => service.saveProfile({ clientId: 'nadie', actorUserId: 'u1', input: {} }), { status: 404 });
  assert.equal(writes.length, 0);
});

test('«Ya se publicó» solo vale para piezas del propio cliente y pasa por el camino de la parrilla', async () => {
  const { db } = fixture();
  const updates = [];
  db.contentItem = { findFirst: async ({ where }) => (where.id === 'o1' && where.plan.clientId === 'c-nattal' ? { id: 'o1', status: 'APROBADO' } : null) };
  const service = createClientOperationsService({ db, now: () => NOW, updateItem: async (id, data) => updates.push([id, data]) });
  assert.deepEqual(await service.markPiecePublished({ clientId: 'c-nattal', itemId: 'o1' }), { id: 'o1', status: 'PUBLICADO' });
  assert.deepEqual(updates, [['o1', { status: 'PUBLICADO' }]]);
  await assert.rejects(() => service.markPiecePublished({ clientId: 'c-mimas', itemId: 'o1' }), { status: 404 });
});

test('el informe del mes se marca y se desmarca, con quién lo hizo', async () => {
  const { service, writes } = fixture();
  await service.setMonthlyReport({ clientId: 'c-nattal', year: 2026, month: 9, delivered: true, actorUserId: 'u1' });
  const [, upsert] = writes.at(-1);
  assert.deepEqual(upsert.where, { clientId_year_month: { clientId: 'c-nattal', year: 2026, month: 9 } });
  assert.equal(upsert.create.deliveredById, 'u1');
  await service.setMonthlyReport({ clientId: 'c-nattal', year: 2026, month: 9, delivered: false, actorUserId: 'u1' });
  assert.equal(writes.at(-1)[0], 'report.delete');
  await assert.rejects(() => service.setMonthlyReport({ clientId: 'c-nattal', year: 2026, month: 13, delivered: true, actorUserId: 'u1' }), { status: 400 });
});
