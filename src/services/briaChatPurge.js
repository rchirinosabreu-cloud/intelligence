import { randomUUID } from 'node:crypto';

// A lease lets more than one replica retry safely. A failed bucket never restores a chat.
export const drainBriaChatPurges = async ({ pool, storage, id, limit = 10 }) => {
  if (!storage) return false;
  let complete = true;
  for (let index = 0; index < limit; index++) {
    const token = randomUUID();
    const job = (await pool.query(`UPDATE bria_memory.conversation_purges SET lease_token=$1,lease_until=now()+interval '10 minutes'
      WHERE id=(SELECT id FROM bria_memory.conversation_purges WHERE ($2::uuid IS NULL OR id=$2)
      AND (lease_until IS NULL OR lease_until<now()) AND ($2::uuid IS NOT NULL OR next_attempt_at<=now())
      ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`, [token, id || null])).rows[0];
    if (!job) break;
    try {
      await storage.purgePrefix(job.prefix);
      await pool.query('DELETE FROM bria_memory.conversation_purges WHERE id=$1 AND lease_token=$2', [job.id, token]);
    } catch {
      complete = false;
      await pool.query(`UPDATE bria_memory.conversation_purges SET attempts=attempts+1,next_attempt_at=now()+least(3600,30*power(2,least(attempts,7)))*interval '1 second',lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2`, [job.id, token]);
    }
    if (id) break;
  }
  if (id) return !(await pool.query('SELECT 1 FROM bria_memory.conversation_purges WHERE id=$1', [id])).rows.length;
  return complete;
};

export const startBriaChatPurgeWorker = ({ pool, storage }) => {
  let running = false;
  const tick = async () => {
    if (running || !storage) return;
    running = true;
    try { await drainBriaChatPurges({ pool, storage }); }
    catch { console.error('[BriaChatPurge] No se pudo procesar el borrado pendiente.'); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 60000); timer.unref();
  void tick();
  return () => clearInterval(timer);
};
