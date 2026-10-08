import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { createBriaResearchRepository } from '../src/services/briaResearchRepository.js';
import { createBriaLivingRouter } from '../src/routes/api/briaLiving.js';

const admin = { id: 'a', role: 'ADMIN', modulePermissions: { bria: true } };
const pm = { id: 'p', role: 'PROJECT_MANAGER', modulePermissions: { bria: true } };
test('search filters source access before limiting, preserves provenance and excludes credential candidates', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bria-research-'));
  let repo;
  try {
    const db = new DatabaseSync(path.join(dir, 'private-research-search.sqlite'));
    db.exec('CREATE TABLE sources(id TEXT,kind TEXT,title TEXT,date TEXT,locator TEXT,path TEXT,digest TEXT,status TEXT); CREATE VIRTUAL TABLE searchable USING fts5(id UNINDEXED,title,body);');
    for (const [id, status, title] of [['drive:a', 'indexed', 'Cuenta A'], ['drive:b', 'indexed', 'Cuenta B'], ['drive:c', 'private_review_required', 'Secreto']]) {
      db.prepare('INSERT INTO sources VALUES(?,?,?,?,?,?,?,?)').run(id,'drive',title,'2025-01-01','https://drive.google.com/file/d/x/view','C:/private','hash',status);
      db.prepare('INSERT INTO searchable VALUES(?,?,?)').run(id,title,'producción y coordinación');
    }
    db.close();
    await writeFile(path.join(dir, 'reviewed-findings.json'), JSON.stringify({ findings: [{ id: 'f', entity: 'Cuenta A', sources: ['a'], claim: 'Alcance antiguo', qualification: 'Validar vigencia', briaOpportunity: 'Validar' }] }));
    repo = createBriaResearchRepository({ directory: dir, grants: { 'drive:a': ['p'] } });
    assert.equal((await repo.search(admin, 'producción')).length, 2);
    assert.deepEqual((await repo.search(pm, 'producción')).map((s) => s.id), ['drive:a']);
    assert.equal((await repo.search(pm, '" OR *')).length, 0);
    assert.equal((await repo.search(admin, 'producción'))[0].path, undefined);
    assert.equal((await repo.read(pm, 'drive:a')).excerpt, 'producción y coordinación');
    assert.equal(await repo.read(pm, 'drive:b'), null);
    assert.equal(await repo.read(admin, 'drive:c'), null);
    await assert.rejects(() => repo.search({ ...pm, modulePermissions: {} }, 'producción'), { status: 403 });
    await repo.review(admin, 'f', 'RESOLVED');
    assert.equal((await repo.inbox(admin))[0].status, 'RESOLVED');
    repo.close(); repo = createBriaResearchRepository({ directory: dir });
    assert.equal((await repo.inbox(admin))[0].status, 'RESOLVED');
    repo.close();
    const writer = new DatabaseSync(path.join(dir, 'private-research-search.sqlite'));
    writer.prepare('UPDATE sources SET digest=? WHERE id=?').run('changed-evidence', 'drive:a'); writer.close();
    repo = createBriaResearchRepository({ directory: dir });
    assert.equal((await repo.inbox(admin))[0].status, 'OPEN');
  } finally { repo?.close(); await rm(dir, { recursive: true, force: true }); }
});
test('living API rejects disabled sessions and ignores a role supplied by the request', async () => {
  const app = express(); app.use(express.json());
  app.use((req, _res, next) => { req.user = { ...pm, modulePermissions: {} }; next(); });
  let called = false;
  app.use(createBriaLivingRouter({ repository: { search() { called = true; return []; } } }));
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/search?q=produccion&role=ADMIN`);
    assert.equal(response.status, 403); assert.equal(called, false);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
