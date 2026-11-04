import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { compareTaskOrder } from '../src/lib/taskOrder.js';
import { reorderTaskSelection } from '../src/services/taskOrderService.js';

const url = briaTestDatabaseUrl();
test('native PostgreSQL queues keep manual priority through concurrent arrivals and lifecycle changes', { skip: !url }, async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  globalThis.prisma = db;
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  const { createTask, updateTask } = await import('../src/services/nativeTaskService.js');
  let client, member, secondMember, actor;
  try {
    actor = await db.user.create({ data: { name: 'Orden prueba', email: `${randomUUID()}@example.invalid`, password: 'not-a-login', role: 'ADMIN' } });
    client = await db.client.create({ data: { name: 'Agencia ficticia de orden', slug: randomUUID() } });
    member = await db.teamMember.create({ data: { name: 'Persona de prueba uno', role: 'Diseño' } });
    secondMember = await db.teamMember.create({ data: { name: 'Persona de prueba dos', role: 'Diseño' } });
    const create = (title, extra = {}) => createTask({ title, clientId: client.id, dueDate: '2026-11-04T12:00:00Z', creatorId: actor.id, ...extra });
    const load = async () => (await db.task.findMany({ where: { clientId: client.id, status: 'PENDIENTE' } })).sort(compareTaskOrder);
    const ids = rows => rows.map(row => row.id);
    const a = await create('A'), hidden = await create('Oculta'), b = await create('B');
    await reorderTaskSelection({ db, user: { role: 'ADMIN' }, reorderList: [{ id: b.id, sortOrder: 0 }, { id: a.id, sortOrder: 1 }], previousIds: [a.id, b.id] });
    const arrivals = await Promise.all([create('Nueva uno'), create('Nueva dos'), create('Nueva tres')]);
    let ordered = await load();
    assert.deepEqual(ids(ordered).slice(0, 3), [b.id, hidden.id, a.id]);
    assert.equal(new Set(ordered.map(row => row.sortOrder)).size, ordered.length, 'concurrent creation cannot claim the same slot');
    assert.deepEqual(new Set(ids(ordered).slice(3)), new Set(ids(arrivals)));

    await updateTask(b.id, { title: 'B corregida', dueDate: '2026-11-04T00:00:00Z' }, actor.id);
    assert.equal((await load())[0].id, b.id, 'saving the same calendar day preserves priority');
    await updateTask(b.id, { dueDate: '2026-11-05T12:00:00Z' }, actor.id);
    assert.equal((await load()).at(-1).id, b.id);
    await updateTask(a.id, { assigneeId: member.id }, actor.id);
    assert.equal((await load()).at(-1).id, a.id);
    await updateTask(a.id, { assigneeId: secondMember.id }, actor.id);
    assert.equal((await load()).at(-1).id, a.id);

    await updateTask(hidden.id, { status: 'REALIZADA' }, actor.id);
    assert.ok((await db.task.findUnique({ where: { id: hidden.id } })).completedAt);
    await updateTask(hidden.id, { status: 'PENDIENTE', reopenReason: 'CLIENT_CORRECTION', reopenNote: 'Ajuste ficticio' }, actor.id);
    ordered = await load();
    assert.equal(ordered.at(-1).id, hidden.id);
    assert.equal(ordered.at(-1).completedAt, null);

    // An arrival racing with manual ordering remains below the previously existing list.
    const prior = await load(), selected = prior.slice(0, 2);
    const [newTask] = await Promise.all([
      create('Nueva durante el arrastre'),
      reorderTaskSelection({ db, user: { role: 'ADMIN' }, reorderList: [...selected].reverse().map((row, sortOrder) => ({ id: row.id, sortOrder })), previousIds: ids(selected) })
    ]);
    ordered = await load();
    assert.deepEqual(ids(ordered).slice(0, 2), ids(selected).reverse());
    assert.equal(ordered.at(-1).id, newTask.id);

    // A stale anchor rolls back the status change as well as the attempted position.
    const before = await db.task.findUnique({ where: { id: a.id } });
    await assert.rejects(updateTask(a.id, { status: 'EN_CURSO', orderBeforeId: 'deleted-anchor' }, actor.id), { statusCode: 409 });
    assert.deepEqual(await db.task.findUnique({ where: { id: a.id } }), before);
  } finally {
    if (client) await db.task.deleteMany({ where: { clientId: client.id } });
    if (client) await db.client.delete({ where: { id: client.id } });
    for (const person of [member, secondMember]) if (person) await db.teamMember.delete({ where: { id: person.id } });
    if (actor) await db.user.delete({ where: { id: actor.id } });
    await db.$disconnect();
  }
});
