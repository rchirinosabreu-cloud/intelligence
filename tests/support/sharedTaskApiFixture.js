import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import { SHARED_TEST_DATABASE_URL, seedSharedTaskActors, startSharedTaskApi } from './sharedTaskSandbox.js';

export async function createSharedTaskApiFixture() {
  const api = await startSharedTaskApi();
  const seed = await seedSharedTaskActors();
  const db = new PrismaClient({ datasources: { db: { url: SHARED_TEST_DATABASE_URL } } });
  const tokens = {}, sessions = {};
  const request = async (key, route, { method = 'GET', body, expected = 200 } = {}) => {
    const response = await fetch(`${api.origin}/api${route}`, { method,
      headers: { 'Content-Type': 'application/json', ...(tokens[key] ? { Authorization: `Bearer ${tokens[key]}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    if (expected !== null) assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
    return { status: response.status, data };
  };
  try {
    for (const [key, actor] of Object.entries(seed.actors)) {
      const { data } = await request(key, '/login', { method: 'POST', body: { email: actor.email, password: actor.password } });
      assert.ok(data.token && data.user, 'la sesión viene del login real');
      tokens[key] = data.token; sessions[key] = data;
    }
  } catch (error) { await db.$disconnect(); await api.close(); throw error; }
  const createTask = async (title, extra = {}) => (await request('manager', '/tasks', { method: 'POST', expected: 201, body: {
    title, clientId: seed.client.id, assigneeId: seed.actors.ana.memberId,
    collaboratorIds: [seed.actors.bea.memberId, seed.actors.carlos.memberId],
    status: 'PENDIENTE', ...extra,
  } })).data;
  const loadTask = async (id, key = 'manager') => (await request(key, `/tasks?clientId=${seed.client.id}`)).data.find(task => task.id === id);
  const participation = (task, key) => task.participants?.find(part => part.memberId === seed.actors[key].memberId);
  const move = async (task, key, status, extra = {}, actor = key, expected = 200) => {
    const own = participation(task, key);
    assert.ok(own, `la lectura incluye participación de ${key}`);
    return request(actor, `/tasks/${task.id}/participants/${own.memberId}`, { method: 'PATCH', expected,
      body: { status, expectedRevision: own.revision, expectedRosterVersion: task.rosterVersion, ...extra } });
  };
  return { ...seed, api, db, request, createTask, loadTask, participation, move, sessions,
    close: async () => { await db.$disconnect(); await api.close(); } };
}
