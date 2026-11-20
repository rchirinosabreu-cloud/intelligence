// Los buzones conectados y lo ya visto en cada uno (11 de octubre de 2026). La contraseña de aplicación se sella con
// la misma llave y la misma forma que la bóveda (AES-256-GCM atada al id del buzón) y solo se abre en el servidor
// para entrar por IMAP. SQL parametrizado; única capa de acceso a `mail_accounts` y `mail_seen`.

import { randomUUID } from 'node:crypto';
import { sealSecret, openSecret } from '../lib/vaultCrypto.js';

const publicAccount = (row) => ({
  id: row.id, email: row.email, label: row.label || null, host: row.host, port: row.port, username: row.username, isActive: row.is_active,
  connectedBy: row.connected_by_name || null, connectedAt: row.connected_at, lastReadAt: row.last_read_at || null, lastError: row.last_error || null, lastErrorAt: row.last_error_at || null
});

// «Esperando por ti»: un correo importante de un buzón activo, con borrador listo o ya avisado sin respuesta, que nadie
// ha respondido (ni por fuera ni desde Bria) en ninguno de los buzones que lo recibieron. Una sola regla para contar y listar.
const WAITING_MAIL = `FROM bria_memory.mail_seen s JOIN bria_memory.mail_accounts a ON a.id=s.account_id
  WHERE s.important AND a.is_active AND s.received_at >= $1 AND s.answered_at IS NULL AND s.replied_at IS NULL AND (s.draft_reply IS NOT NULL OR s.unanswered_notified_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM bria_memory.mail_seen r WHERE r.message_id=s.message_id AND (r.answered_at IS NOT NULL OR r.replied_at IS NOT NULL))`;

export const createMailAccountRepository = ({ pool, key }) => ({
  async list() {
    const { rows } = await pool.query('SELECT * FROM bria_memory.mail_accounts ORDER BY connected_at');
    return rows.map(publicAccount);
  },
  /** El buzón con su contraseña abierta: solo para el lector IMAP, nunca sale de aquí hacia una ruta. */
  async getWithSecret(id) {
    const { rows } = await pool.query('SELECT * FROM bria_memory.mail_accounts WHERE id=$1', [id]);
    if (!rows[0]) return null;
    return { ...publicAccount(rows[0]), secret: openSecret(rows[0].secret_enc, key, `${rows[0].id}:secret`) };
  },
  async listActiveWithSecret() {
    const { rows } = await pool.query('SELECT * FROM bria_memory.mail_accounts WHERE is_active ORDER BY connected_at');
    return rows.map((row) => ({ ...publicAccount(row), secret: openSecret(row.secret_enc, key, `${row.id}:secret`) }));
  },
  async create({ email, label, host, port, username, secret, actor }) {
    const id = randomUUID();
    await pool.query(
      'INSERT INTO bria_memory.mail_accounts(id,email,label,host,port,username,secret_enc,connected_by_ref,connected_by_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [id, email, label || null, host, port, username, sealSecret(secret, key, `${id}:secret`), actor?.ref || null, actor?.name || null]
    );
    return (await this.list()).find((row) => row.id === id);
  },
  /** Cambiar la contraseña de un buzón ya conectado conserva su historial de correos vistos. */
  async replaceSecret(id, secret) {
    const { rowCount } = await pool.query('UPDATE bria_memory.mail_accounts SET secret_enc=$2, is_active=true, last_error=NULL, last_error_at=NULL WHERE id=$1', [id, sealSecret(secret, key, `${id}:secret`)]);
    return rowCount > 0;
  },
  async remove(id) {
    const { rowCount } = await pool.query('DELETE FROM bria_memory.mail_accounts WHERE id=$1', [id]);
    return rowCount > 0;
  },
  async markRead(id, at) {
    await pool.query('UPDATE bria_memory.mail_accounts SET last_read_at=$2, last_error=NULL, last_error_at=NULL WHERE id=$1', [id, at]);
  },
  /** Un fallo de entrada queda escrito; si es de contraseña, el buzón se apaga hasta que la cambien. */
  async markError(id, message, at, { disable = false } = {}) {
    await pool.query('UPDATE bria_memory.mail_accounts SET last_error=$2, last_error_at=$3, is_active=CASE WHEN $4 THEN false ELSE is_active END WHERE id=$1', [id, String(message || '').slice(0, 300), at, disable]);
  },
  async seenIds(accountId, messageIds = []) {
    if (!messageIds.length) return new Set();
    const { rows } = await pool.query('SELECT message_id FROM bria_memory.mail_seen WHERE account_id=$1 AND message_id = ANY($2::text[])', [accountId, messageIds]);
    return new Set(rows.map((row) => row.message_id));
  },
  async recordSeen(accountId, rows) {
    for (const row of rows) {
      await pool.query(
        'INSERT INTO bria_memory.mail_seen(account_id,message_id,from_address,from_name,subject,received_at,important,reasons,client_name,severity) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (account_id,message_id) DO NOTHING',
        [accountId, row.messageId, row.from || null, row.fromName || null, String(row.subject || '').slice(0, 300), row.date || null, Boolean(row.important), row.reasons || [], row.clientName || null, row.severity || null]
      );
    }
  },
  /** Los correos que Bria marcó importantes en una ventana, para que los liste en el chat. */
  async recentImportant(since, { limit = 30 } = {}) {
    const { rows } = await pool.query('SELECT s.*, a.email AS account_email, a.label AS account_label FROM bria_memory.mail_seen s JOIN bria_memory.mail_accounts a ON a.id=s.account_id WHERE s.important AND s.created_at >= $1 ORDER BY s.received_at DESC NULLS LAST LIMIT $2', [since, limit]);
    return rows.map((row) => ({ accountId: row.account_id, accountEmail: row.account_email, accountLabel: row.account_label || null, messageId: row.message_id, from: row.from_address, fromName: row.from_name, subject: row.subject, date: row.received_at, reasons: row.reasons || [], clientName: row.client_name || null }));
  },
  /** El resumen y el borrador que Bria dejó listos para un correo importante (20 de noviembre de 2026). Nunca el cuerpo. */
  async saveDraft(accountId, messageId, { summary, reply }) {
    await pool.query('UPDATE bria_memory.mail_seen SET draft_summary=$3, draft_reply=$4 WHERE account_id=$1 AND message_id=$2', [accountId, messageId, String(summary || '').slice(0, 400), String(reply || '').slice(0, 1500)]);
  },
  /** Los borradores vigentes de esos correos, por id de correo: lo que la tarjeta muestra al abrirse. */
  async draftsFor(messageIds = []) {
    if (!messageIds.length) return new Map();
    const { rows } = await pool.query(`SELECT DISTINCT ON (s.message_id) s.message_id, s.draft_summary, s.draft_reply, s.from_address, s.subject, a.email AS account_email, a.is_active,
        EXISTS (SELECT 1 FROM bria_memory.mail_seen r WHERE r.message_id=s.message_id AND r.replied_at IS NOT NULL) AS replied
      FROM bria_memory.mail_seen s JOIN bria_memory.mail_accounts a ON a.id=s.account_id WHERE s.message_id = ANY($1::text[]) AND s.draft_reply IS NOT NULL ORDER BY s.message_id, s.created_at`, [messageIds]);
    return new Map(rows.map((row) => [row.message_id, { summary: row.draft_summary || '', reply: row.draft_reply, from: row.from_address || null, subject: row.subject || '', accountEmail: row.is_active ? row.account_email : null, replied: Boolean(row.replied) }]));
  },
  /**
   * Los correos importantes que siguen sin respuesta vista: recibidos entre `from` y `until`, de importancia 2 o más,
   * que todavía no entraron al pulso como «sin respuesta» o que entraron en esta misma jornada (`notifiedSince`).
   */
  async unansweredCandidates({ from, until, notifiedSince, limit = 8 }) {
    const { rows } = await pool.query(`SELECT s.*, a.email AS account_email, a.label AS account_label FROM bria_memory.mail_seen s JOIN bria_memory.mail_accounts a ON a.id=s.account_id
      WHERE s.important AND a.is_active AND s.answered_at IS NULL AND COALESCE(s.severity, 2) >= 2 AND s.received_at >= $1 AND s.received_at <= $2
        AND (s.unanswered_notified_at IS NULL OR s.unanswered_notified_at >= $3) ORDER BY s.received_at LIMIT $4`, [from, until, notifiedSince, limit]);
    return rows.map((row) => ({ accountId: row.account_id, accountEmail: row.account_email, accountLabel: row.account_label || null, messageId: row.message_id, from: row.from_address, fromName: row.from_name, subject: row.subject, date: row.received_at, reasons: row.reasons || [], clientName: row.client_name || null, severity: row.severity || 2, notifiedAt: row.unanswered_notified_at || null, draft: row.draft_reply ? { summary: row.draft_summary || '', reply: row.draft_reply } : null }));
  },
  /**
   * Los correos importantes que ya salieron como «sin respuesta» y siguen sin un enviado que los cite: lo que la
   * lectura de la mañana recuerda. Solo lo que ya se comprobó contra los enviados; un mismo correo, una vez.
   */
  async stillUnanswered({ from, limit = 6 }) {
    const { rows } = await pool.query(`SELECT DISTINCT ON (s.message_id) s.message_id, s.from_address, s.from_name, s.subject, s.received_at, s.client_name FROM bria_memory.mail_seen s JOIN bria_memory.mail_accounts a ON a.id=s.account_id
      WHERE s.important AND a.is_active AND s.answered_at IS NULL AND s.unanswered_notified_at IS NOT NULL AND s.received_at >= $1
        AND NOT EXISTS (SELECT 1 FROM bria_memory.mail_seen r WHERE r.message_id=s.message_id AND r.answered_at IS NOT NULL) ORDER BY s.message_id, s.received_at LIMIT $2`, [from, limit]);
    return rows.map((row) => ({ messageId: row.message_id, from: row.from_address, fromName: row.from_name, subject: row.subject, date: row.received_at, clientName: row.client_name || null }));
  },
  /**
   * Los que ya se avisaron como «sin respuesta» en una jornada anterior y siguen sin respuesta vista: no vuelven al
   * pulso, pero se siguen cotejando con los enviados para anotar la respuesta que llegó después.
   */
  async notifiedUnanswered({ from, notifiedBefore, limit = 20 }) {
    const { rows } = await pool.query(`SELECT s.account_id, s.message_id FROM bria_memory.mail_seen s JOIN bria_memory.mail_accounts a ON a.id=s.account_id
      WHERE s.important AND a.is_active AND s.answered_at IS NULL AND s.unanswered_notified_at < $2 AND s.received_at >= $1 ORDER BY s.received_at DESC LIMIT $3`, [from, notifiedBefore, limit]);
    return rows.map((row) => ({ accountId: row.account_id, messageId: row.message_id }));
  },
  /**
   * Enviar con aprobación (20 de noviembre de 2026). `replyTarget`: el correo importante al que se responde, en el
   * primer buzón activo que lo recibió. `claimReply` lo aparta antes de enviar para que dos clics no manden dos
   * respuestas (vale para el mismo correo en dos buzones); `releaseReply` lo suelta si el envío falló.
   */
  async waitingCount(since) {
    return Number((await pool.query(`SELECT count(DISTINCT s.message_id)::int AS n ${WAITING_MAIL}`, [since])).rows[0]?.n || 0);
  },
  /** Los mismos correos que cuenta `waitingCount`, uno por correo, para que Bria los nombre cuando se los piden. */
  async waitingList(since, { limit = 20 } = {}) {
    const { rows } = await pool.query(`SELECT DISTINCT ON (s.message_id) s.*, a.email AS account_email, a.label AS account_label ${WAITING_MAIL} ORDER BY s.message_id, s.created_at`, [since]);
    return rows.sort((a, b) => new Date(b.received_at || 0) - new Date(a.received_at || 0)).slice(0, limit)
      .map((row) => ({ accountEmail: row.account_email, accountLabel: row.account_label || null, messageId: row.message_id, from: row.from_address, fromName: row.from_name, subject: row.subject, date: row.received_at, reasons: row.reasons || [], clientName: row.client_name || null, hasDraft: Boolean(row.draft_reply), notifiedUnanswered: Boolean(row.unanswered_notified_at) }));
  },
  async replyTarget(messageId) {
    const { rows } = await pool.query(`SELECT s.account_id, s.message_id, s.from_address, s.subject, s.important,
        (SELECT max(r.replied_at) FROM bria_memory.mail_seen r WHERE r.message_id=s.message_id) AS replied_at
      FROM bria_memory.mail_seen s JOIN bria_memory.mail_accounts a ON a.id=s.account_id WHERE s.message_id=$1 AND a.is_active ORDER BY s.created_at LIMIT 1`, [messageId]);
    const row = rows[0];
    return row ? { accountId: row.account_id, messageId: row.message_id, from: row.from_address, subject: row.subject, important: Boolean(row.important), repliedAt: row.replied_at || null } : null;
  },
  async repliesSince(actorRef, since) {
    return Number((await pool.query('SELECT count(DISTINCT message_id)::int AS n FROM bria_memory.mail_seen WHERE replied_by_ref=$1 AND replied_at >= $2', [actorRef, since])).rows[0]?.n || 0);
  },
  async claimReply(accountId, messageId, actor, at) {
    // Dos pedidos a la vez: sin candado, cada uno ve «nadie ha respondido» en su propia foto y los dos apartan. El
    // candado por correo los pone en fila dentro de la transacción; el segundo ya ve lo que anotó el primero.
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`bria-mail-reply:${messageId}`]);
      const { rowCount } = await db.query(`UPDATE bria_memory.mail_seen SET replied_at=$2, replied_by_ref=$3, replied_by_name=$4 WHERE message_id=$1
        AND NOT EXISTS (SELECT 1 FROM bria_memory.mail_seen r WHERE r.message_id=$1 AND r.replied_at IS NOT NULL)`, [messageId, at, actor.ref, actor.name || null]);
      await db.query('COMMIT');
      return rowCount > 0;
    } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    finally { db.release(); }
  },
  async releaseReply(accountId, messageId) {
    await pool.query('UPDATE bria_memory.mail_seen SET replied_at=NULL, replied_by_ref=NULL, replied_by_name=NULL WHERE message_id=$1', [messageId]);
  },
  async markAnswered(accountId, messageId, at) {
    await pool.query('UPDATE bria_memory.mail_seen SET answered_at=$3 WHERE account_id=$1 AND message_id=$2 AND answered_at IS NULL', [accountId, messageId, at]);
  },
  async markUnansweredNotified(accountId, messageId, at) {
    await pool.query('UPDATE bria_memory.mail_seen SET unanswered_notified_at=$3 WHERE account_id=$1 AND message_id=$2 AND unanswered_notified_at IS NULL', [accountId, messageId, at]);
  },
  async purgeSeen(before) {
    const { rowCount } = await pool.query('DELETE FROM bria_memory.mail_seen WHERE created_at < $1', [before]);
    return rowCount;
  }
});
