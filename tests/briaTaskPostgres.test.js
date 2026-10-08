import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { PrismaClient } from '@prisma/client';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createBriaConversationRepository } from '../src/services/briaConversationRepository.js';
const url = briaTestDatabaseUrl();
test('PostgreSQL rejects stale/deleted confirmation before writes and durably persists draft choices', { skip: !url }, async () => {
  const pool = new pg.Pool({ connectionString: url }), workspace = `task-test:${randomUUID()}`, actor = { ref: 'owner', role: 'ADMIN' };
  let calls = 0;
  try {
    await pool.query(await readFile(new URL('../scripts/sql/bria-conversations.sql', import.meta.url), 'utf8'));
    const repository = createBriaConversationRepository({ pool, workspace }), chat = await repository.create(actor);
    await repository.append(actor, chat.id, 0, 'Borrador', { answer: 'Prioridad', taskDraft: { id: 'draft', status: 'DRAFT' }, quickReplies: ['Normal','Alta','Urgente'] });
    const saved = await repository.get(actor, chat.id);
    assert.equal(saved.turns.at(-1).taskDraft.id, 'draft'); assert.deepEqual(saved.turns.at(-1).quickReplies, ['Normal','Alta','Urgente']);
    const write = async () => { calls++; return { answer: 'Creado' }; };
    await assert.rejects(() => repository.append(actor, chat.id, 0, 'Confirmo', write), { status: 409 });
    await assert.rejects(() => repository.append({ ...actor, ref: 'other' }, chat.id, 1, 'Confirmo', write), { status: 404 });
    assert.equal(calls, 0);
    await repository.append(actor, chat.id, 1, 'Confirmo', write); assert.equal(calls, 1);
    await repository.remove(actor, chat.id, 2);
    await assert.rejects(() => repository.append(actor, chat.id, 2, 'Confirmo', write), { status: 404 }); assert.equal(calls, 1);
  } finally { await pool.query('DELETE FROM bria_memory.conversations WHERE workspace=$1', [workspace]); await pool.end(); }
});
test('native PostgreSQL task creation preserves trusted id, human context comment and material categories', { skip: !url }, async () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  globalThis.prisma = db; process.env.DATABASE_URL = url; process.env.NODE_ENV = 'test';
  const { createTask } = await import('../src/services/nativeTaskService.js');
  const taskId = randomUUID(); let account, member, client;
  try {
    account = await db.user.create({ data: { name: 'Bria prueba aislada', email: `${randomUUID()}@example.invalid`, password: 'not-a-login', role: 'ADMIN', modulePermissions: { bria: true, gestion: true } } });
    member = await db.teamMember.create({ data: { name: 'Persona de prueba', role: 'Diseño', userId: account.id } });
    client = await db.client.create({ data: { name: 'Cliente ficticio Bria', slug: randomUUID() } });
    const task = await createTask({ id: 'ignored-untrusted-id', title: 'Preparar tres piezas', dueDate: '2026-10-09T12:00:00.000Z', assigneeId: member.id, creatorId: account.id, clientId: client.id, status: 'PENDIENTE', priority: 'ALTA', isPriority: true, comments: '', initial_comments: [{ content: 'Síntesis del contexto de prueba.' }], initial_references: [{ url: 'https://example.invalid/reference' }], initial_inputs: [{ url: 'https://example.invalid/input', name: 'brief.pdf' }] }, { taskId });
    assert.equal(task.id, taskId); assert.equal(task.completedAt, null);
    assert.equal(task.dueDate.toISOString(), '2026-10-09T12:00:00.000Z');
    assert.equal(task.taskComments[0].content, 'Síntesis del contexto de prueba.'); assert.equal(task.taskComments[0].authorId, account.id);
    assert.deepEqual(task.taskAttachments.map(row => row.category).sort(), ['INSUMO','REFERENCIA']);
    assert.equal(task.priority, 'ALTA');
  } finally {
    await db.task.deleteMany({ where: { id: taskId } });
    if (client) await db.client.delete({ where: { id: client.id } });
    if (member) await db.teamMember.delete({ where: { id: member.id } });
    if (account) await db.user.delete({ where: { id: account.id } });
    await db.$disconnect();
  }
});
