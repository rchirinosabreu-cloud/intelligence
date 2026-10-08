// Idempotent live maintenance. Verify an object before clearing its inline copy.
export const migrateBriaChatAttachments = async ({ pool, storage, maxFiles = 500 }) => {
  if (!storage) throw new Error('BRIA_CHAT_STORAGE_NOT_CONFIGURED');
  let migrated = 0;
  for (let index = 0; index < maxFiles; index++) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const parent = (await db.query(`SELECT c.id,c.workspace,c.actor_ref FROM bria_memory.conversations c WHERE EXISTS(SELECT 1 FROM bria_memory.conversation_attachments a WHERE a.conversation_id=c.id AND a.original_bytes IS NOT NULL) ORDER BY c.created_at FOR UPDATE SKIP LOCKED LIMIT 1`)).rows[0];
      if (!parent) { await db.query('COMMIT'); break; }
      const file = (await db.query('SELECT * FROM bria_memory.conversation_attachments WHERE conversation_id=$1 AND original_bytes IS NOT NULL ORDER BY created_at LIMIT 1 FOR UPDATE', [parent.id])).rows[0];
      const stored = await storage.put(parent.workspace, { ref: parent.actor_ref }, parent.id, { id: file.id, buffer: file.original_bytes, analysisData: file.analysis_bytes });
      await db.query('UPDATE bria_memory.conversation_attachments SET storage_key=$2,original_sha256=$3,analysis_key=$4,analysis_sha256=$5,size_bytes=$6,original_bytes=NULL,analysis_bytes=NULL WHERE id=$1', [file.id, stored.storage_key, stored.original_sha256, stored.analysis_key, stored.analysis_sha256, stored.size_bytes]);
      await db.query('COMMIT'); migrated++;
    } catch (failure) { await db.query('ROLLBACK'); throw failure; } finally { db.release(); }
  }
  const remaining = (await pool.query('SELECT count(*)::int AS n FROM bria_memory.conversation_attachments WHERE original_bytes IS NOT NULL')).rows[0].n;
  return { migrated, remaining };
};
