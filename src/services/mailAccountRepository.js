// Los buzones conectados y lo ya visto en cada uno (11 de octubre de 2026). La contraseña de aplicación se sella con
// la misma llave y la misma forma que la bóveda (AES-256-GCM atada al id del buzón) y solo se abre en el servidor
// para entrar por IMAP. SQL parametrizado; única capa de acceso a `mail_accounts` y `mail_seen`.

import { randomUUID } from 'node:crypto';
import { sealSecret, openSecret } from '../lib/vaultCrypto.js';

const publicAccount = (row) => ({
  id: row.id, email: row.email, label: row.label || null, host: row.host, port: row.port, username: row.username, isActive: row.is_active,
  connectedBy: row.connected_by_name || null, connectedAt: row.connected_at, lastReadAt: row.last_read_at || null, lastError: row.last_error || null, lastErrorAt: row.last_error_at || null
});

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
        'INSERT INTO bria_memory.mail_seen(account_id,message_id,from_address,from_name,subject,received_at,important,reasons,client_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (account_id,message_id) DO NOTHING',
        [accountId, row.messageId, row.from || null, row.fromName || null, String(row.subject || '').slice(0, 300), row.date || null, Boolean(row.important), row.reasons || [], row.clientName || null]
      );
    }
  },
  /** Los correos que Bria marcó importantes en una ventana, para que los liste en el chat. */
  async recentImportant(since, { limit = 30 } = {}) {
    const { rows } = await pool.query('SELECT s.*, a.email AS account_email, a.label AS account_label FROM bria_memory.mail_seen s JOIN bria_memory.mail_accounts a ON a.id=s.account_id WHERE s.important AND s.created_at >= $1 ORDER BY s.received_at DESC NULLS LAST LIMIT $2', [since, limit]);
    return rows.map((row) => ({ accountId: row.account_id, accountEmail: row.account_email, accountLabel: row.account_label || null, messageId: row.message_id, from: row.from_address, fromName: row.from_name, subject: row.subject, date: row.received_at, reasons: row.reasons || [], clientName: row.client_name || null }));
  },
  async purgeSeen(before) {
    const { rowCount } = await pool.query('DELETE FROM bria_memory.mail_seen WHERE created_at < $1', [before]);
    return rowCount;
  }
});
