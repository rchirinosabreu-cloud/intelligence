import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { assertSharedTaskDatabase, SHARED_TEST_DATABASE_URL, sharedTaskEnvironment, sharedTaskRoot, seedSharedTaskActors } from './sharedTaskSandbox.js';

export const taskPieceOutput = path.join(sharedTaskRoot, 'output/task-piece-local');
export const finalPiecePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j3ioAAAAASUVORK5CYII=', 'base64');

// Only a local byte store. AWS signing and all upload/persistence code remain real.
export async function startTaskPieceStorage({ port = 0 } = {}) {
  const objects = new Map();
  const server = createServer(async (request, response) => {
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).hostname !== '127.0.0.1') throw new Error('Not local');
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Access-Control-Allow-Headers', '*');
        response.setHeader('Access-Control-Allow-Methods', 'PUT, GET, HEAD, OPTIONS');
        response.setHeader('Access-Control-Expose-Headers', 'ETag, Content-Length, Content-Type');
      } catch { response.writeHead(403); response.end(); return; }
    }
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    const key = new URL(request.url, 'http://127.0.0.1').pathname;
    if (request.method === 'PUT') {
      const chunks = []; let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 16 * 1024 * 1024) { response.writeHead(413); response.end(); return; }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const object = { body, mimeType: request.headers['content-type'] || 'application/octet-stream', etag: `"${createHash('md5').update(body).digest('hex')}"` };
      objects.set(key, object);
      response.writeHead(200, { ETag: object.etag }); response.end(); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    const object = objects.get(key);
    if (!object) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': object.mimeType, 'Content-Length': object.body.length, ETag: object.etag });
    response.end(request.method === 'HEAD' ? undefined : object.body);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}

export async function startTaskPieceApi({ port = 8092 } = {}) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || [8091, 3181, 3182, 55451].includes(port)) throw new Error('El puerto debe ser local y distinto al preview anterior.');
  await mkdir(taskPieceOutput, { recursive: true });
  const disabledEnvironment = path.join(taskPieceOutput, 'environment-disabled');
  await writeFile(disabledEnvironment, '');
  const env = { ...sharedTaskEnvironment(), PORT: String(port), DOTENV_CONFIG_PATH: disabledEnvironment,
    AWS_ACCESS_KEY_ID: 'local-task-piece', AWS_SECRET_ACCESS_KEY: 'fictitious-local-task-piece-secret', AWS_S3_BUCKET_NAME: 'task-piece-test' };
  const child = spawn(process.execPath, [path.join(sharedTaskRoot, 'scripts/task-piece-api-local.mjs')], {
    cwd: taskPieceOutput, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  const ready = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`La API aislada no arrancó: ${output}`)), 30_000);
    child.stdout.on('data', value => { output += value; if (output.includes('TASK_PIECE_API_READY')) { clearTimeout(timeout); resolve(); } });
    child.stderr.on('data', value => { output += value; });
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`La API terminó con ${code}: ${output}`)); });
  });
  try { await ready; } catch (error) { child.kill(); throw error; }
  return { origin: `http://127.0.0.1:${port}`, logs: () => output, close: () => new Promise(resolve => { if (child.exitCode !== null) return resolve(); child.once('exit', resolve); child.kill(); }) };
}

export async function createTaskPieceFixture({ port = 8092 } = {}) {
  assertSharedTaskDatabase(process.env.DATABASE_URL);
  if (process.env.NODE_ENV !== 'test') throw new Error('Esta fixture exige NODE_ENV=test.');
  const db = new PrismaClient({ datasources: { db: { url: SHARED_TEST_DATABASE_URL } } });
  let api;
  try {
    const [identity] = await db.$queryRaw`SELECT current_database() AS database, current_user AS username, inet_server_port() AS port`;
    assert.deepEqual(identity, { database: 'shared_tasks_demo', username: 'shared_tasks_test', port: 55451 });
    api = await startTaskPieceApi({ port });
    const seed = await seedSharedTaskActors();
    const client = await db.client.update({ where: { id: seed.client.id }, data: { name: `Cuenta Faro · Tarea y pieza ${seed.runId.slice(0, 8)}` } });
    await db.user.update({ where: { id: seed.actors.carlos.id }, data: { modulePermissions: { dashboard: true, gestion: true, parrillas: false, clientes: true } } });
    const tokens = {}, sessions = {};
    const raw = (actor, route, options = {}) => fetch(`${api.origin}/api${route}`, { ...options,
      headers: { ...(tokens[actor] ? { Authorization: `Bearer ${tokens[actor]}` } : {}), ...options.headers } });
    const request = async (actor, route, { method = 'GET', body, expected = 200 } = {}) => {
      const response = await raw(actor, route, { method, headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const data = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
      assert.equal(response.status, expected, `${method} ${route}: ${JSON.stringify(data)}`);
      return { status: response.status, data };
    };
    const upload = async (actor, itemId, name = 'pieza-final.png', expected = 201) => {
      const form = new FormData(); form.append('files', new Blob([finalPiecePng], { type: 'image/png' }), name);
      const response = await raw(actor, `/content/items/${itemId}/final-assets`, { method: 'POST', body: form });
      const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data));
      return { status: response.status, data };
    };
    for (const [key, actor] of Object.entries(seed.actors)) {
      const { data } = await request(key, '/login', { method: 'POST', body: { email: actor.email, password: actor.password } });
      assert.ok(data.token && data.user); tokens[key] = data.token; sessions[key] = data;
    }
    const plans = [], pieces = {};
    const current = new Date();
    for (const [label, offset] of [['previous', -1], ['current', 0], ['next', 1]]) {
      const period = new Date(current.getFullYear(), current.getMonth() + offset, 1);
      const year = period.getFullYear(), month = period.getMonth() + 1;
      const plan = await db.contentPlan.create({ data: { clientId: client.id, ownerId: seed.actors.manager.memberId, year, month, status: 'ACTIVO', strategicObjectives: 'Demostración local: recorrer meses y entregar el material de la misma pieza.' } });
      plans.push(plan); pieces[label] = {};
      for (const [key, status, title] of [['approved', 'APROBADO', 'Presentación aprobada'], ['production', 'EN_PRODUCCION', 'Contenido en producción'], ['published', 'PUBLICADO', 'Publicación terminada']]) {
        const item = await db.contentItem.create({ data: { planId: plan.id, objective: `${title} · ${month}/${year}`, format: 'Post', status,
          copyText: 'Guion ficticio para revisar el recorrido entre tarea y pieza.', captionText: 'Texto de ejemplo de la Agencia Faro. Sin publicaciones reales.',
          internalNotes: 'Material ficticio para demostración local.', publishDate: new Date(Date.UTC(year, month - 1, 15, 12)), publishTime: '10:00' } });
        const task = (await request('manager', '/tasks', { method: 'POST', expected: 201, body: {
          title: `[Producción] ${item.objective}`, clientId: client.id, assigneeId: seed.actors.ana.memberId, contentItemId: item.id,
          dueDate: new Date(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate(), 12)).toISOString(),
          status: key === 'published' ? 'REALIZADA' : 'PENDIENTE',
          collaboratorIds: key === 'approved' ? [seed.actors.bea.memberId, seed.actors.carlos.memberId] : []
        } })).data;
        pieces[label][key] = { ...item, taskId: task.id };
      }
    }
    const evidence = async piece => {
      const item = await db.contentItem.findUnique({ where: { id: piece.id }, select: { status: true, revisionRequestedAt: true } });
      const tasks = await db.task.findMany({ where: { contentItemId: piece.id }, orderBy: { id: 'asc' }, select: { id: true, status: true, completedAt: true, startedAt: true, accumulatedWorkMs: true, assigneeStatus: true, assigneeCompletedAt: true, collaborators: { orderBy: { memberId: 'asc' }, select: { memberId: true, status: true, completedAt: true, revision: true } } } });
      const publications = await db.socialPublication.findMany({ where: { contentItemId: piece.id }, orderBy: { id: 'asc' }, select: { id: true, status: true } });
      const assets = await db.contentItemFinalAsset.findMany({ where: { contentItemId: piece.id }, orderBy: { position: 'asc' } });
      return { itemStatus: item.status, revisionRequestedAt: item.revisionRequestedAt, tasks, publications, assets };
    };
    return { ...seed, client, plans, pieces, sessions, api, db, request, raw, upload, evidence,
      close: async () => { await db.$disconnect(); await api.close(); } };
  } catch (error) { await db.$disconnect(); await api?.close(); throw error; }
}

// Known snapshots only: this seed never reads a sheet, and the API cannot connect outside loopback.
export async function seedTaskPieceExternalPeriods(fixture) {
  assertSharedTaskDatabase(process.env.DATABASE_URL);
  const source = `https://docs.google.com/spreadsheets/d/fictitious-mio-${fixture.runId}/edit`;
  await fixture.db.client.update({ where: { id: fixture.client.id }, data: { externalPlanUrl: source } });
  const other = await fixture.db.client.create({ data: { name: `Otra cuenta ficticia · ${fixture.runId.slice(0, 8)}`, slug: `mio-other-${fixture.runId}`, status: 'ACTIVO', externalPlanUrl: `${source}?other-client=1` } });
  const rows = [
    { clientId: fixture.client.id, year: 2025, month: 10, tabName: 'OCTUBRE 2025', okAt: new Date('2025-10-15T15:00:00Z') },
    { clientId: fixture.client.id, year: 2026, month: 11, tabName: 'NOVIEMBRE 2026', okAt: new Date('2026-11-05T15:00:00Z'), problem: 'Último intento ficticio fallido; se conserva la lectura previa.' },
    { clientId: fixture.client.id, year: 2026, month: 12, tabName: 'DICIEMBRE 2026', okAt: new Date('2026-11-05T15:00:00Z') },
    { clientId: fixture.client.id, year: 2027, month: 1, tabName: 'ENERO 2027', okAt: null, problem: 'Nunca se leyó la pestaña.' },
    { clientId: fixture.client.id, year: 2026, month: 10, tabName: null, okAt: new Date('2026-10-15T15:00:00Z') },
    { clientId: other.id, year: 2024, month: 9, tabName: 'AJENA SEPTIEMBRE 2024', okAt: new Date('2024-09-15T15:00:00Z') }
  ];
  await fixture.db.externalPlanSnapshot.createMany({ data: rows.map(row => ({ ...row, pieces: [], summary: { total: 0 }, gid: '0', comments: [], layout: null })) });
  return { clientIds: [fixture.client.id, other.id], source, slug: fixture.client.slug, urlPath: `/content/external-plans/${fixture.client.slug}/periods` };
}
