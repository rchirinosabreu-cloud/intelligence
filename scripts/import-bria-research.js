// Resumable, idempotent import of the owner's readable index, never credential candidates.
import pg from 'pg';
import { DatabaseSync } from 'node:sqlite';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadResearchConfig } from './lib/briaResearchRuntime.js';
import { learningKey } from '../src/lib/briaKnowledge.js';
import { sourceSearchChunks } from '../src/lib/briaSourceChunks.js';
const directory = process.env.BRIA_RESEARCH_DIRECTORY;
if (!directory) throw new Error('Indica la carpeta privada de investigación.');
const workspace = 'research:social.brainstudio@gmail.com';
const config = await loadResearchConfig(process.env.BRIA_PROJECT_ENV || 'C:/Proyectos/intelligence/.env');
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2 });
const db = new DatabaseSync(path.join(directory, 'private-research-search.sqlite'), { readOnly: true });
const connection = await pool.connect(), run = randomUUID();
let changed = 0, unchanged = 0, locked = false;
const clean = value => String(value || '').toWellFormed().replace(/\u0000/g, '');
const terms = value => learningKey(clean(value).replace(/[\p{L}\p{N}_]{81,}/gu, ' '));
try {
  await connection.query(await readFile(new URL('./sql/bria-knowledge.sql', import.meta.url), 'utf8'));
  locked = (await connection.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS locked', [workspace])).rows[0].locked;
  if (!locked) throw new Error('Ya hay una importación de esta memoria en curso.');
  await connection.query("UPDATE bria_memory.import_runs SET status='FAILED',error_code='INTERRUPTED',completed_at=now() WHERE workspace=$1 AND status='RUNNING'", [workspace]);
  await connection.query("INSERT INTO bria_memory.import_runs(id,workspace,status) VALUES($1,$2,'RUNNING')", [run, workspace]);
  const existing = new Map((await connection.query('SELECT id,digest,revision,status FROM bria_memory.sources WHERE workspace=$1', [workspace])).rows.map(row => [row.id, row]));
  const candidates = db.prepare("SELECT id,digest FROM sources WHERE status='indexed' ORDER BY id").all();
  const textRows = new Map(db.prepare('SELECT id,rowid FROM searchable').all().map(row => [row.id, row.rowid]));
  const pending = candidates.filter(row => { const old = existing.get(row.id); if (old?.digest === row.digest && old.status === 'INDEXED') { unchanged++; return false; } return true; });
  for (let start = 0; start < pending.length;) {
    const rows = []; let size = 0;
    while (start < pending.length && rows.length < 150 && size < 2500000) {
      const source = db.prepare('SELECT * FROM sources WHERE id=?').get(pending[start++].id);
      source.body = db.prepare('SELECT body FROM searchable WHERE rowid=?').get(textRows.get(source.id))?.body;
      if (typeof source.body !== 'string') throw new Error('Una fuente del catálogo no tiene texto indexado.');
      rows.push({ id: source.id, kind: source.kind, title: clean(source.title), source_date: source.date, locator: source.locator, digest: source.digest, revision: (existing.get(source.id)?.revision || 0) + 1, body: clean(source.body) });
      size += source.body.length;
    }
    await connection.query('BEGIN');
    try {
      const metadata = rows.map(({ body, ...row }) => row);
      await connection.query(`INSERT INTO bria_memory.sources(workspace,id,kind,title,source_date,locator,digest,revision,status) SELECT $1,id,kind,title,source_date,locator,digest,revision,'INDEXED' FROM jsonb_to_recordset($2::jsonb) AS x(id text,kind text,title text,source_date text,locator text,digest text,revision int) ON CONFLICT(workspace,id) DO UPDATE SET title=EXCLUDED.title,source_date=EXCLUDED.source_date,locator=EXCLUDED.locator,digest=EXCLUDED.digest,revision=EXCLUDED.revision,status='INDEXED',imported_at=now()`, [workspace, JSON.stringify(metadata)]);
      await connection.query(`INSERT INTO bria_memory.source_versions(workspace,source_id,revision,digest,body) SELECT $1,id,revision,digest,body FROM jsonb_to_recordset($2::jsonb) AS x(id text,revision int,digest text,body text)`, [workspace, JSON.stringify(rows.map(({ id, revision, digest, body }) => ({ id, revision, digest, body })))]);
      await connection.query('DELETE FROM bria_memory.source_search WHERE workspace=$1 AND source_id=ANY($2)', [workspace, rows.map(row => row.id)]);
      let chunks = [];
      const flush = async () => {
        if (!chunks.length) return;
        await connection.query(`INSERT INTO bria_memory.source_search(workspace,source_id,position,content,terms) SELECT $1,id,position,content,setweight(to_tsvector('simple',title),'A')||to_tsvector('simple',search_text) FROM jsonb_to_recordset($2::jsonb) AS x(id text,position int,content text,title text,search_text text)`, [workspace, JSON.stringify(chunks)]);
        chunks = [];
      };
      for (const row of rows) {
        for (const { content, position } of sourceSearchChunks(row.body)) {
          const search_text = terms(content);
          if (!/[\p{L}]{2,}/u.test(search_text)) continue;
          chunks.push({ id: row.id, position, content, title: terms(row.title), search_text });
          if (chunks.length >= 150) await flush();
        }
      }
      await flush();
      await connection.query('UPDATE bria_memory.import_runs SET cursor=$2,imported=$3,unchanged=$4 WHERE id=$1', [run, rows.at(-1).id, changed + rows.length, unchanged]);
      await connection.query('COMMIT'); changed += rows.length;
      if (changed % 1500 < rows.length || start === pending.length) console.log(JSON.stringify({ imported: changed, unchanged, total: candidates.length }));
    } catch (failure) { await connection.query('ROLLBACK'); throw failure; }
  }
  // Only a complete catalog may exclude vanished/restricted sources. Partial runs never do.
  await connection.query("UPDATE bria_memory.sources SET status='EXCLUDED' WHERE workspace=$1 AND status='INDEXED' AND NOT(id=ANY($2::text[]))", [workspace, candidates.map(row => row.id)]);
  await connection.query("UPDATE bria_memory.import_runs SET status='COMPLETED',imported=$2,unchanged=$3,completed_at=now() WHERE id=$1", [run, changed, unchanged]);
  const result = { completed: true, workspace, indexed: candidates.length, imported: changed, unchanged, storage: 'PostgreSQL', sourceInstructions: 'data_only', credentialsImported: false, asOf: '2026-10-07' };
  await writeFile(path.join(directory, 'postgres-import-status.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (failure) {
  if (locked) await connection.query("UPDATE bria_memory.import_runs SET status='FAILED',error_code=$2,completed_at=now() WHERE id=$1", [run, String(failure.code || 'IMPORT_FAILED').slice(0, 100)]).catch(() => {});
  console.error(JSON.stringify({ completed: false, imported: changed, code: failure.code || 'IMPORT_FAILED' })); process.exitCode = 1;
} finally {
  if (locked) await connection.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [workspace]);
  connection.release(); db.close(); await pool.end();
}
