import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';

const url = briaTestDatabaseUrl();

test('the task board reads one PostgreSQL snapshot across active and completed tasks', { skip: !url, timeout: 30_000 }, async (t) => {
  const readerDb = new PrismaClient({ datasources: { db: { url } } });
  const writerDb = new PrismaClient({ datasources: { db: { url } } });
  let interleave = null;
  // Only schedule a real, independently committed write between the two reads.
  // Both queries and all returned rows still come from PostgreSQL through Prisma.
  const reader = readerDb.$extends({
    query: {
      task: {
        async findMany({ args, query }) {
          const crossing = interleave;
          if (!crossing) return query(args);
          if (crossing.started) {
            await crossing.finished;
            return query(args);
          }
          crossing.started = true;
          try {
            const rows = await query(args);
            await crossing.write();
            return rows;
          } finally {
            crossing.release();
          }
        }
      }
    }
  });
  globalThis.prisma = reader;
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  const { getTasks } = await import('../src/services/nativeTaskService.js');
  const clients = [];
  const makeClient = async () => {
    const client = await writerDb.client.create({ data: { name: 'Tablero ficticio de prueba', slug: randomUUID() } });
    clients.push(client.id);
    return client;
  };
  const crossReadWith = (write) => {
    let release;
    const finished = new Promise(resolve => { release = resolve; });
    interleave = { started: false, finished, release, write };
  };
  try {
    for (const [before, after, description] of [
      ['EN_CURSO', 'REALIZADA', 'completing a task does not duplicate its old and new versions'],
      ['REALIZADA', 'PENDIENTE', 'reopening a task does not make it disappear between columns']
    ]) {
      await t.test(description, async () => {
        const client = await makeClient();
        const task = await writerDb.task.create({ data: {
          clientId: client.id, title: 'Movimiento concurrente ficticio', status: before,
          completedAt: before === 'REALIZADA' ? new Date() : null
        } });
        crossReadWith(() => writerDb.task.update({ where: { id: task.id }, data: {
          status: after, completedAt: after === 'REALIZADA' ? new Date() : null
        } }));
        let rows;
        try {
          rows = await getTasks(client.id);
        } finally {
          interleave = null;
        }
        assert.equal((await writerDb.task.findUnique({ where: { id: task.id } })).status, after,
          'the independent update committed while the list was being read');
        assert.equal(rows.filter(row => row.id === task.id).length, 1,
          'a concurrent move must leave exactly one copy in the response');
        assert.equal(rows[0].status, before, 'both parts of the response describe the same point in time');
        const refreshed = await getTasks(client.id);
        assert.equal(refreshed.length, 1);
        assert.equal(refreshed[0].status, after, 'the next request sees the committed move');
      });
    }

    await t.test('the snapshot preserves the client filter, recent completion limit and private body redaction', async () => {
      const client = await makeClient();
      const otherClient = await makeClient();
      const active = await writerDb.task.create({ data: {
        clientId: client.id, title: 'Pendiente privado ficticio', status: 'PENDIENTE',
        isPrivate: true, comments: 'Cuerpo reservado de prueba'
      } });
      const older = new Date('2026-01-01T12:00:00Z');
      const completed = Array.from({ length: 201 }, (_, index) => ({
        id: randomUUID(), clientId: client.id, title: `Cierre ficticio ${index}`, status: 'REALIZADA',
        completedAt: new Date(older.getTime() + index * 1000)
      }));
      await writerDb.task.createMany({ data: completed });
      await writerDb.task.create({ data: { clientId: otherClient.id, title: 'Otro tablero ficticio' } });
      const rows = await getTasks(client.id);
      assert.equal(rows.length, 201);
      assert.ok(rows.every(row => row.clientId === client.id));
      assert.equal(rows.some(row => row.id === completed[0].id), false);
      assert.equal(rows.filter(row => row.status === 'REALIZADA').length, 200);
      const privateRow = rows.find(row => row.id === active.id);
      assert.equal(privateRow.title, active.title);
      assert.equal(privateRow.isLocked, true);
      assert.equal(Object.hasOwn(privateRow, 'comments'), false);
    });
  } finally {
    interleave = null;
    if (clients.length) {
      await writerDb.task.deleteMany({ where: { clientId: { in: clients } } });
      await writerDb.client.deleteMany({ where: { id: { in: clients } } });
    }
    await Promise.all([readerDb.$disconnect(), writerDb.$disconnect()]);
    delete globalThis.prisma;
  }
});
