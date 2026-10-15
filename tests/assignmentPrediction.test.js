import test from 'node:test';
import assert from 'node:assert/strict';
import * as controller from '../src/controllers/teamRhythmController.js';
import { readFileSync } from 'node:fs';
import { createTeamLoadService } from '../src/services/teamLoadService.js';
import { buildContextProfiles } from '../src/lib/workPrediction.js';

const H = 3600000;
function service({ hidden = false, publishTime = '18:00' } = {}) {
  const records = ['b','r'].flatMap(personId => [1,2,3].map(i => ({ id: `${personId}${i}`, personId, personName: personId, workType: 'Reel', clientId: 'x', clientName: 'X', complexity: 'MEDIA', measuredMs: (personId === 'b' ? 4 : 1.5) * H })));
  const profiles = buildContextProfiles(records);
  const old = { id: 't', title: '[Producción] Reel: X', assigneeId: 'b', clientId: 'x', aiComplexity: 'MEDIA', isPrivate: hidden, creatorId: 'creator', contentItem: { format: 'Reel', publishDate: new Date('2026-10-14T12:00:00Z'), publishTime } };
  return createTeamLoadService({ now: () => new Date('2026-10-14T20:00:00Z'),
    rhythm: { get: async () => ({ people: [], types: [], profiles }) },
    db: { task: { findMany: async () => [{ ...old, status: 'PENDIENTE', dueDate: new Date('2026-10-14T12:00:00Z') }], findUnique: async () => old },
      teamMember: { findMany: async () => [{ id: 'b', name: 'Brayan' }, { id: 'r', name: 'Rodny' }] }, client: { findUnique: async () => ({ id: 'x', name: 'X' }) } }
  });
}

test('a publication date without an hour still limits a later proposed delivery, without inventing an exact time', async () => {
  const result = await service({ publishTime: null }).preview({ taskId: 't', title: '[Producción] Reel: X', assigneeId: 'b', clientId: 'x', dueDay: '2026-10-16' }, { userId: 'manager' });
  assert.equal(result.dueDay, '2026-10-14');
  assert.equal(result.deadlineAt, null);
  assert.equal(result.deadlineSource, 'publicacion_fecha');
  assert.equal(result.risk, 'riesgo');
});

test('preview replaces the existing task instead of adding its hours twice and uses its publication hour', async () => {
  const engine = service();
  assert.equal(typeof engine.preview, 'function');
  const result = await engine.preview({ taskId: 't', title: '[Producción] Reel: X', assigneeId: 'b', clientId: 'x', dueDay: '2026-10-14' }, { userId: 'manager' });
  assert.equal(result.remainingMs, 4 * H);
  assert.equal(result.committedToDeadlineMs, 4 * H);
  assert.equal(result.deadlineAt, '2026-10-14T23:00:00.000Z');
  assert.equal(result.risk, 'riesgo');
  const other = await engine.preview({ taskId: 't', title: '[Producción] Reel: X', assigneeId: 'r', clientId: 'x', dueDay: '2026-10-14' }, { userId: 'manager' });
  assert.equal(other.remainingMs, 1.5 * H);
  assert.equal(other.risk, 'ok');
});

test('preview cannot reveal protected task context or accept browser-provided effort', async () => {
  const engine = service({ hidden: true });
  assert.equal(typeof engine.preview, 'function');
  await assert.rejects(engine.preview({ taskId: 't', title: 'Reel', assigneeId: 'b', clientId: 'x', dueDay: '2026-10-14', remainingMs: 0 }, { userId: 'other' }), error => error.status === 403);
  await assert.rejects(service().preview({ title: 'Reel', assigneeId: 'b', clientId: 'x', dueDay: '2026-02-31' }, { userId: 'manager' }), error => error.status === 400);
});

test('private tasks keep their public title and client, while the forecast excludes protected classification and piece context', async () => {
  const map = await service({ hidden: true }).get();
  const row = map.forecast.people.find(p => p.personId === 'b').tasks[0];
  assert.equal(row.title, '[Producción] Reel: X');
  assert.equal(row.clientId, 'x');
  assert.equal(row.workType, 'Reel', 'the format can be inferred from the public title');
  assert.equal(row.complexity, null);
  assert.equal(row.deadlineAt, null, 'the protected publication is not used in a shared response');
});

test('an explicit evening commitment is shown as the actual deadline, even though the nominal workday ends earlier', async () => {
  const engine = service();
  const result = await engine.preview({ title: 'Reel', assigneeId: 'b', clientId: 'x', dueDay: '2026-10-14', focusDeadlineAt: '2026-10-15T01:00:00Z' }, { userId: 'manager' });
  assert.equal(result.deadlineAt, '2026-10-15T01:00:00.000Z');
});

test('assignment prediction is authenticated behind both Manager gates and has no write action', () => {
  const routes = readFileSync('src/routes/index.js', 'utf8');
  assert.match(routes, /router\.post\('\/manager\/rhythm\/assignment-preview', requireModulePermission\('manager'\), requireManagerRole/);
});

test('a preview controller returns a calculation and refuses invalid drafts without leaking internal errors', async () => {
  assert.equal(typeof controller.createAssignmentPreviewHandler, 'function');
  let body;
  const service = { preview: async (draft, viewer) => { body = { draft, viewer }; return { risk: 'riesgo', remainingMs: 14400000, sample: 3 }; } };
  const res = { code: 200, status(n) { this.code=n; return this; }, json(value) { this.body=value; return this; } };
  await controller.createAssignmentPreviewHandler(service)({ body: { title: 'Reel', assigneeId: 'b', clientId: 'x' }, user: { userId: 'manager' } }, res);
  assert.equal(res.body.risk, 'riesgo');
  assert.equal(body.viewer.userId, 'manager');
  await controller.createAssignmentPreviewHandler({ preview: async () => { throw new Error('database password secret'); } })({ body: {} }, res);
  assert.equal(res.code, 500);
  assert.doesNotMatch(res.body.error, /password|secret/);
});
