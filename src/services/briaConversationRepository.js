import { randomUUID, createHash } from 'node:crypto';
import { knowledgeError } from '../lib/briaKnowledge.js';
import { briaChatPrefix } from './briaChatStorage.js';
import { drainBriaChatPurges } from './briaChatPurge.js';
const fingerprint = actor => createHash('sha256').update(JSON.stringify({ role: actor.role, permissions: Object.entries(actor.permissions || {}).sort() })).digest('hex');
const summary = row => ({ id: row.id, title: row.title, revision: row.revision, updatedAt: row.updated_at });
export const createBriaConversationRepository = ({ pool, workspace, storage, requireStorage = false }) => ({
  async list(actor) { return (await pool.query('SELECT id,title,revision,updated_at FROM bria_memory.conversations WHERE workspace=$1 AND actor_ref=$2 ORDER BY updated_at DESC LIMIT 100', [workspace, actor.ref])).rows.map(summary); },
  async create(actor) { return { ...summary((await pool.query('INSERT INTO bria_memory.conversations(id,workspace,actor_ref) VALUES($1,$2,$3) RETURNING *', [randomUUID(), workspace, actor.ref])).rows[0]), turns: [] }; },
  async get(actor, id) {
    const row = (await pool.query('SELECT * FROM bria_memory.conversations WHERE workspace=$1 AND actor_ref=$2 AND id=$3', [workspace, actor.ref, id])).rows[0];
    if (!row) return null;
    const turns = (await pool.query('SELECT position,role,content,metadata FROM bria_memory.conversation_turns WHERE conversation_id=$1 ORDER BY position', [id])).rows.map(turn => ({ id: `${id}:${turn.position}`, role: turn.role, text: turn.content, ...turn.metadata, permissionChanged: turn.role === 'assistant' && turn.metadata.accessFingerprint !== fingerprint(actor) }));
    return { ...summary(row), turns };
  },
  async attachments(actor, id) {
    const rows = (await pool.query('SELECT a.* FROM bria_memory.conversation_attachments a JOIN bria_memory.conversations c ON c.id=a.conversation_id WHERE c.workspace=$1 AND c.actor_ref=$2 AND c.id=$3 ORDER BY a.position DESC,a.created_at DESC LIMIT 5', [workspace, actor.ref, id])).rows;
    return Promise.all(rows.map(async row => {
      if (row.storage_key && !storage) throw knowledgeError('Los adjuntos no están disponibles ahora.', 503);
      return { id: row.id, name: row.name, mime: row.mime, text: row.extracted_text, status: row.status, warning: row.warning,
        buffer: row.original_bytes || (row.status === 'PDF' ? await storage.read(workspace, actor, id, row.storage_key, row.original_sha256) : null),
        analysisData: row.analysis_bytes || (row.analysis_key ? await storage.read(workspace, actor, id, row.analysis_key, row.analysis_sha256) : null) };
    }));
  },
  async attachment(actor, id, fileId) {
    const row = (await pool.query('SELECT a.name,a.mime,a.original_bytes,a.storage_key,a.original_sha256 FROM bria_memory.conversation_attachments a JOIN bria_memory.conversations c ON c.id=a.conversation_id WHERE c.workspace=$1 AND c.actor_ref=$2 AND c.id=$3 AND a.id=$4', [workspace, actor.ref, id, fileId])).rows[0];
    if (row?.storage_key && !storage) throw knowledgeError('Los adjuntos no están disponibles ahora.', 503);
    return row ? { name: row.name, mime: row.mime, buffer: row.original_bytes || await storage.read(workspace, actor, id, row.storage_key, row.original_sha256) } : null;
  },
  async remove(actor, id, expectedRevision) {
    const db = await pool.connect();
    let bucketPending = false;
    try {
      await db.query('BEGIN');
      const row = (await db.query('SELECT revision FROM bria_memory.conversations WHERE workspace=$1 AND actor_ref=$2 AND id=$3 FOR UPDATE', [workspace, actor.ref, id])).rows[0];
      if (!row) throw knowledgeError('No encontramos esa conversación.', 404);
      if (row.revision !== expectedRevision) throw knowledgeError('La conversación cambió. Recárgala antes de borrarla.', 409);
      bucketPending = !!storage || (await db.query('SELECT 1 FROM bria_memory.conversation_attachments WHERE conversation_id=$1 AND storage_key IS NOT NULL LIMIT 1', [id])).rows.length > 0;
      if (bucketPending) await db.query('INSERT INTO bria_memory.conversation_purges(id,workspace,actor_ref,prefix) VALUES($1,$2,$3,$4)', [id, workspace, actor.ref, briaChatPrefix(workspace, actor, id)]);
      // Learning is independently owned and deliberately has no chat cascade.
      await db.query('DELETE FROM bria_memory.conversations WHERE id=$1 AND workspace=$2 AND actor_ref=$3', [id, workspace, actor.ref]);
      await db.query('COMMIT');
    } catch (failure) { await db.query('ROLLBACK'); throw failure; } finally { db.release(); }
    if (bucketPending && storage) {
      try { bucketPending = !await drainBriaChatPurges({ pool, storage, id, limit: 1 }); }
      catch { bucketPending = true; }
    }
    return { deleted: true, filesPending: bucketPending };
  },
  async append(actor, id, expectedRevision, question, result, files = []) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const row = (await db.query('SELECT * FROM bria_memory.conversations WHERE workspace=$1 AND actor_ref=$2 AND id=$3 FOR UPDATE', [workspace, actor.ref, id])).rows[0];
      if (!row) throw knowledgeError('No encontramos esa conversación.', 404);
      if (row.revision !== expectedRevision) throw knowledgeError('La conversación cambió en otra ventana. Recárgala.', 409);
      if (files.length && requireStorage && !storage) throw knowledgeError('El almacenamiento de Bria no está disponible ahora.', 503);
      // Business writes run only after the owned parent lock and revision check.
      if (typeof result === 'function') result = await result();
      const metadata = { sources: result.sources || [], failures: result.failures || [], toolsUsed: result.toolsUsed || [], ...(result.taskDraft ? { taskDraft: result.taskDraft } : {}), ...(result.dispatchDraft ? { dispatchDraft: result.dispatchDraft } : {}), ...(result.deleteDraft ? { deleteDraft: result.deleteDraft } : {}), ...(result.pendingAction ? { pendingAction: result.pendingAction } : {}), ...(result.accessCards ? { accessCards: result.accessCards } : {}), ...(result.accessCapture ? { accessCapture: result.accessCapture } : {}), ...(result.quickReplies ? { quickReplies: result.quickReplies } : {}), ...(result.usage ? { usage: result.usage } : {}), accessFingerprint: fingerprint(actor) };
      const userMetadata = { attachments: files.map(({ id: fileId, name, size, status, warning }) => ({ id: fileId, name, size, status, warning })) };
      await db.query('INSERT INTO bria_memory.conversation_turns(conversation_id,position,role,content,metadata) VALUES($1,$2,\'user\',$3,$7),($1,$4,\'assistant\',$5,$6)', [id, row.revision * 2, question, row.revision * 2 + 1, result.answer, metadata, userMetadata]);
      // Upload while holding the parent lock: deletion cannot purge and then race a late upload.
      for (const file of files) {
        const stored = storage ? await storage.put(workspace, actor, id, file) : {};
        await db.query('INSERT INTO bria_memory.conversation_attachments(id,conversation_id,position,name,mime,original_bytes,analysis_bytes,extracted_text,status,warning,storage_key,original_sha256,analysis_key,analysis_sha256,size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)', [file.id, id, row.revision * 2, file.name, file.mime, storage ? null : file.buffer, storage ? null : file.analysisData, file.text, file.status, file.warning, stored.storage_key || null, stored.original_sha256 || null, stored.analysis_key || null, stored.analysis_sha256 || null, stored.size_bytes || file.buffer.length]);
      }
      await db.query("UPDATE bria_memory.conversations SET revision=revision+1,title=CASE WHEN revision=0 THEN $4 ELSE title END,updated_at=now() WHERE workspace=$1 AND actor_ref=$2 AND id=$3", [workspace, actor.ref, id, question.slice(0, 90)]);
      await db.query('COMMIT');
      return this.get(actor, id);
    } catch (failure) { await db.query('ROLLBACK'); throw failure; } finally { db.release(); }
  }
});
