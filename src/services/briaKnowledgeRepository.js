import { randomUUID } from 'node:crypto';
import { learningKey, learningVisible, knowledgeError, validateLearning } from '../lib/briaKnowledge.js';
import { publicEvidence } from '../lib/briaLivingMemory.js';
import { sourceSearchChunks } from '../lib/briaSourceChunks.js';
const selectLearning = "SELECT l.*,to_char(valid_from,'YYYY-MM-DD') AS from_key,to_char(valid_until,'YYYY-MM-DD') AS until_key FROM bria_memory.learnings l";
const present = row => row && ({ id: row.id, scope: row.scope, entity: row.entity, topic: row.topic, text: row.content, kind: row.kind, status: row.status, validFrom: row.from_key, validUntil: row.until_key, revision: row.revision, subjectRef: row.subject_ref, author: row.actor_name, updatedAt: row.updated_at });
const searchableText = text => learningKey(String(text).replace(/[\p{L}\p{N}_]{81,}/gu, ' ')).replace(/\u0000/g, '');
export const createBriaKnowledgeRepository = ({ pool, workspace }) => {
  if (!workspace) throw new Error('La memoria necesita un espacio explícito.');
  const access = (row, actor) => row && learningVisible(row, actor);
  const transaction = async work => {
    const db = await pool.connect();
    try { await db.query('BEGIN'); const result = await work(db); await db.query('COMMIT'); return result; }
    catch (failure) { await db.query('ROLLBACK'); if (failure.code === '23505') throw knowledgeError('Ese tema ya tiene un aprendizaje. Ábrelo para ajustarlo.', 409, 'LEARNING_EXISTS'); throw failure; }
    finally { db.release(); }
  };
  const locked = async (db, actor, id, expectedRevision) => {
    const current = present((await db.query(`${selectLearning} WHERE workspace=$1 AND id=$2 FOR UPDATE`, [workspace, id])).rows[0]);
    if (!access(current, actor)) throw knowledgeError('Aprendizaje no disponible.', 404, 'LEARNING_NOT_FOUND');
    if (current.revision !== expectedRevision) throw knowledgeError('Este aprendizaje cambió. Recarga antes de ajustarlo.', 409, 'LEARNING_VERSION_CONFLICT');
    return current;
  };
  const record = async (db, actor, before, after, action, reason) => db.query('INSERT INTO bria_memory.learning_events(id,learning_id,revision,action,before_data,after_data,actor_ref,actor_name,reason) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [randomUUID(), after.id, after.revision, action, before, after, actor.ref, actor.name, reason]);
  const update = async (db, actor, before, learning, status, action, reason) => {
    const row = (await db.query(`UPDATE bria_memory.learnings SET content=$3,kind=$4,valid_from=$5,valid_until=$6,status=$7,revision=revision+1,actor_ref=$8,actor_name=$9,updated_at=now() WHERE workspace=$1 AND id=$2 RETURNING *`, [workspace, before.id, learning.text, learning.kind, learning.validFrom, learning.validUntil, status, actor.ref, actor.name])).rows[0];
    const after = present({ ...row, from_key: learning.validFrom, until_key: learning.validUntil });
    await record(db, actor, before, after, action, reason); return after;
  };
  return {
    workspace,
    async list(actor, query = '') {
      // Visibility is enforced before the limit, including personal knowledge hidden from other admins.
      const args = [workspace, actor.ref, actor.role === 'ADMIN', actor.accountIds || []];
      let filter = '';
      const terms = learningKey(query).match(/[\p{L}\p{N}]{3,}/gu)?.filter(word => !['que','para','como','con','del','una','los','las','quien','tiene','desde'].includes(word)).slice(0, 16) || [];
      if (terms.length) { args.push(terms.map(word => `%${word}%`)); filter = " AND (entity_key||' '||topic_key) ILIKE ANY($5)"; }
      return (await pool.query(`${selectLearning} WHERE workspace=$1 AND ((scope='PERSONAL' AND subject_ref=$2) OR scope='AGENCY' OR (scope='ACCOUNT' AND ($3 OR entity=ANY($4))))${filter} ORDER BY updated_at DESC,id LIMIT 100`, args)).rows.map(present);
    },
    async save({ actor, learning: raw, id, expectedRevision, reason = 'Enseñanza explícita del equipo', revalidate }) {
      const learning = validateLearning(raw);
      return transaction(async db => {
        if (id) {
          const before = await locked(db, actor, id, expectedRevision);
          await revalidate?.(before);
          if (before.scope !== learning.scope || learningKey(before.entity) !== learningKey(learning.entity) || learningKey(before.topic) !== learningKey(learning.topic)) throw knowledgeError('El alcance y el tema se conservan; crea otro aprendizaje para cambiarlos.');
          return update(db, actor, before, learning, 'ACTIVE', 'UPDATE', reason);
        }
        await revalidate?.();
        const row = (await db.query(`INSERT INTO bria_memory.learnings(id,workspace,scope,entity,entity_key,topic,topic_key,subject_ref,content,kind,valid_from,valid_until,actor_ref,actor_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`, [randomUUID(), workspace, learning.scope, learning.entity, learningKey(learning.entity), learning.topic, learningKey(learning.topic), learning.scope === 'PERSONAL' ? actor.ref : '*', learning.text, learning.kind, learning.validFrom, learning.validUntil, actor.ref, actor.name])).rows[0];
        const after = present({ ...row, from_key: learning.validFrom, until_key: learning.validUntil });
        await record(db, actor, null, after, 'CREATE', reason); return after;
      });
    },
    async history(actor, id) {
      const row = present((await pool.query(`${selectLearning} WHERE workspace=$1 AND id=$2`, [workspace, id])).rows[0]);
      if (!access(row, actor)) throw knowledgeError('Aprendizaje no disponible.', 404, 'LEARNING_NOT_FOUND');
      return (await pool.query('SELECT revision,action,before_data AS before,after_data AS after,actor_name AS author,reason,recorded_at AS at FROM bria_memory.learning_events WHERE learning_id=$1 ORDER BY revision DESC', [id])).rows;
    },
    async undo({ actor, id, expectedRevision, revalidate }) {
      return transaction(async db => {
        const before = await locked(db, actor, id, expectedRevision); await revalidate?.(before);
        const event = (await db.query('SELECT before_data FROM bria_memory.learning_events WHERE learning_id=$1 AND revision=$2', [id, before.revision])).rows[0];
        if (!event) throw knowledgeError('No encontramos el historial del cambio.', 409);
        const restored = event.before_data || before;
        return update(db, actor, before, restored, event.before_data ? restored.status : 'REVOKED', 'UNDO', 'Deshacer el último cambio');
      });
    },
    async revoke({ actor, id, expectedRevision, revalidate }) {
      return transaction(async db => {
        const before = await locked(db, actor, id, expectedRevision); await revalidate?.(before);
        return update(db, actor, before, before, 'REVOKED', 'REVOKE', 'Retirar de la memoria vigente');
      });
    },
    async importSource(source) {
      if (source.status !== 'indexed') return { changed: false, excluded: true };
      return transaction(async db => {
        const old = (await db.query('SELECT digest,revision,status FROM bria_memory.sources WHERE workspace=$1 AND id=$2 FOR UPDATE', [workspace, source.id])).rows[0];
        if (old?.digest === source.digest && old.status === 'INDEXED') return { changed: false };
        const revision = (old?.revision || 0) + 1;
        await db.query(`INSERT INTO bria_memory.sources(workspace,id,kind,title,source_date,locator,digest,revision,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'INDEXED') ON CONFLICT(workspace,id) DO UPDATE SET title=$4,source_date=$5,locator=$6,digest=$7,revision=$8,status='INDEXED',imported_at=now()`, [workspace, source.id, source.kind, source.title, source.date, source.locator, source.digest, revision]);
        const body = String(source.body || '').toWellFormed().replace(/\u0000/g, '');
        await db.query('INSERT INTO bria_memory.source_versions(workspace,source_id,revision,digest,body) VALUES($1,$2,$3,$4,$5)', [workspace, source.id, revision, source.digest, body]);
        await db.query('DELETE FROM bria_memory.source_search WHERE workspace=$1 AND source_id=$2', [workspace, source.id]);
        // Long encoded strings do not help retrieval; original readable text remains in source_versions.
        const chunks = sourceSearchChunks(body).map(row => ({ ...row, search_text: searchableText(row.content) }));
        for (let start = 0; start < chunks.length; start += 200) await db.query(`INSERT INTO bria_memory.source_search(workspace,source_id,position,content,terms) SELECT $1,$2,position,content,setweight(to_tsvector('simple',$3),'A')||to_tsvector('simple',search_text) FROM jsonb_to_recordset($4::jsonb) AS x(position int,content text,search_text text)`, [workspace, source.id, searchableText(source.title), JSON.stringify(chunks.slice(start, start + 200))]);
        return { changed: true, revision };
      });
    },
    async excludeMissing(ids) { await pool.query("UPDATE bria_memory.sources SET status='EXCLUDED' WHERE workspace=$1 AND status='INDEXED' AND NOT(id=ANY($2::text[]))", [workspace, ids]); },
    async excludeSources(ids) { if (ids.length) await pool.query("UPDATE bria_memory.sources SET status='EXCLUDED' WHERE workspace=$1 AND id=ANY($2::text[])", [workspace, ids]); },
    async search(user, query) {
      if (user.role !== 'ADMIN') return []; // External corpus ACL is unknown: research owner only.
      const words = searchableText(query).match(/[\p{L}\p{N}]{2,}/gu)?.slice(0, 12) || [];
      if (!words.length) return [];
      const match = words.map(word => `"${word}"`).join(' OR ');
      const rows = (await pool.query(`SELECT * FROM (SELECT DISTINCT ON(s.id) s.*,c.content AS matched_content,ts_rank(c.terms,websearch_to_tsquery('simple',$2)) AS rank FROM bria_memory.sources s JOIN bria_memory.source_search c ON c.workspace=s.workspace AND c.source_id=s.id WHERE s.workspace=$1 AND s.status='INDEXED' AND c.terms@@websearch_to_tsquery('simple',$2) ORDER BY s.id,rank DESC) hits ORDER BY rank DESC LIMIT 8`, [workspace, match])).rows;
      return rows.map(row => {
        const body = row.matched_content || '', normalized = learningKey(body);
        const positions = words.map(word => normalized.indexOf(word)).filter(position => position >= 0);
        const start = positions.length ? Math.max(0, Math.min(...positions) - 300) : 0;
        return publicEvidence({ ...row, date: row.source_date, excerpt: body.slice(start, start + 1800) });
      });
    },
    async read(user, id, offset = 0) {
      if (user.role !== 'ADMIN') return null;
      const start = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
      const row = (await pool.query(`SELECT s.*,substring(v.body,$3+1,1800) AS excerpt,length(v.body) AS size FROM bria_memory.sources s JOIN bria_memory.source_versions v ON v.workspace=s.workspace AND v.source_id=s.id AND v.revision=s.revision WHERE s.workspace=$1 AND s.id=$2 AND s.status='INDEXED'`, [workspace, id, start])).rows[0];
      return row ? { ...publicEvidence({ ...row, date: row.source_date }), offset: start, nextOffset: row.size > start + 1800 ? start + 1800 : null } : null;
    },
    async status() {
      const sources = (await pool.query("SELECT count(*)::int AS indexed FROM bria_memory.sources WHERE workspace=$1 AND status='INDEXED'", [workspace])).rows[0];
      const run = (await pool.query('SELECT status,imported,unchanged,error_code,started_at,completed_at FROM bria_memory.import_runs WHERE workspace=$1 ORDER BY started_at DESC LIMIT 1', [workspace])).rows[0];
      return { storage: 'PostgreSQL', ...sources, latestImport: run || null };
    }
  };
};
