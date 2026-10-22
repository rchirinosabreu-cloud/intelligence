import test from 'node:test';
import assert from 'node:assert/strict';
import prisma from '../src/lib/prisma.js';
import { requestContentItemRevision, requestContentPlanRevision, updateContentItem, addClientComment } from '../src/services/contentService.js';

// Se ejercitan los servicios reales, sustituyendo únicamente la persistencia por memoria.
const useMemory = (t, rows) => {
  const writes = [];
  const replace = (object, key, value) => {
    const original = object[key];
    object[key] = value;
    t.after(() => { object[key] = original; });
  };
  const matches = (row, where = {}) => (!where.id || (typeof where.id === 'string' ? row.id === where.id : where.id.in.includes(row.id)))
    && (!where.status || where.status.in.includes(row.status))
    && (!Object.hasOwn(where, 'revisionRequestedAt') || row.revisionRequestedAt === where.revisionRequestedAt);
  replace(prisma.contentItem, 'findUnique', async ({ where }) => ({ ...rows.find(row => row.id === where.id) }));
  replace(prisma.contentItem, 'findMany', async () => rows.map(row => ({ ...row })));
  replace(prisma.contentItem, 'update', async ({ where, data }) => {
    writes.push({ where, data });
    const row = rows.find(row => row.id === where.id);
    Object.assign(row, data);
    return { ...row };
  });
  replace(prisma.contentItem, 'updateMany', async ({ where, data }) => {
    const chosen = rows.filter(row => matches(row, where));
    for (const row of chosen) { writes.push({ where, data }); Object.assign(row, data); }
    return { count: chosen.length };
  });
  replace(prisma, '$queryRaw', async () => [{ count: 0, exists: false }]);
  replace(prisma.contentPlan, 'findUnique', async () => null);
  replace(prisma.contentPlan, 'updateMany', async () => ({ count: 0 }));
  replace(prisma.contentPlan, 'update', async () => ({ id: 'plan' }));
  replace(prisma, '$executeRaw', async () => 0);
  replace(prisma, '$transaction', async work => work(prisma));
  return { rows, writes };
};
const published = () => ({ id: 'published', planId: 'plan', status: 'PUBLICADO', deletedAt: null, revisionRequestedAt: null, publications: [], tasks: [] });

test('la petición individual rechaza una pieza publicada sin escribir', async t => {
  const { writes } = useMemory(t, [published()]);
  await assert.rejects(requestContentItemRevision('published'), error => error.status === 409 && /publicada/.test(error.message));
  assert.equal(writes.length, 0);
});

test('una pieza aprobada todavía puede pasar a segunda revisión', async t => {
  const item = { ...published(), status: 'APROBADO' };
  useMemory(t, [item]);
  const updated = await requestContentItemRevision(item.id);
  assert.equal(updated.status, 'APROBADO');
  assert.ok(updated.revisionRequestedAt instanceof Date);
});

test('la petición individual no marca una pieza que termina de publicarse mientras se lee', async t => {
  const item = { ...published(), status: 'APROBADO' };
  useMemory(t, [item]);
  const original = prisma.contentItem.findUnique;
  prisma.contentItem.findUnique = async args => {
    const snapshot = await original(args);
    item.status = 'PUBLICADO';
    return snapshot;
  };
  await assert.rejects(requestContentItemRevision(item.id), error => error.status === 409);
  assert.equal(item.revisionRequestedAt, null);
});

test('pedir revisión del mes deja intactas las publicadas', async t => {
  const item = published();
  const approved = { ...published(), id: 'approved', status: 'APROBADO' };
  useMemory(t, [item, approved]);
  assert.deepEqual(await requestContentPlanRevision('plan'), { requested: 1 });
  assert.equal(item.revisionRequestedAt, null);
  assert.ok(approved.revisionRequestedAt instanceof Date);
});

test('una publicación que termina durante la petición del mes tampoco vuelve a revisión', async t => {
  const item = { ...published(), status: 'APROBADO' };
  useMemory(t, [item]);
  const original = prisma.contentItem.findMany;
  prisma.contentItem.findMany = async () => {
    const snapshot = await original();
    item.status = 'PUBLICADO';
    return snapshot;
  };
  assert.deepEqual(await requestContentPlanRevision('plan'), { requested: 0 });
  assert.equal(item.revisionRequestedAt, null);
});

test('una aprobación desde el portal no devuelve una pieza publicada a aprobado', async t => {
  const { writes } = useMemory(t, [published()]);
  await assert.rejects(updateContentItem('published', { status: 'APROBADO' }, { fromClientReview: true }), error => error.status === 409);
  assert.equal(writes.length, 0);
});

test('pedir cambios desde una pestaña vieja del portal no devuelve una publicada', async t => {
  const { writes } = useMemory(t, [published()]);
  await assert.rejects(addClientComment('published', 'Cambiar la foto'), error => error.status === 409);
  assert.equal(writes.length, 0);
});

test('una pieza sin publicar sigue admitiendo decisiones del cliente', async t => {
  const item = { ...published(), status: 'REALIZADO' };
  useMemory(t, [item]);
  await updateContentItem(item.id, { status: 'APROBADO' }, { fromClientReview: true });
  assert.equal(item.status, 'APROBADO');
  await addClientComment(item.id, 'Cambiar la foto');
  assert.equal(item.status, 'DEVUELTO');
  assert.match(item.comments, /Cambiar la foto/);
});
