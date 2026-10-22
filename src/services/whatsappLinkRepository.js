// El vínculo número ↔ persona de Bria en WhatsApp (20 de octubre de 2026). Tablas en scripts/sql/bria-whatsapp.sql,
// sobre la reserva compartida de la base lateral. Nunca guarda el texto de un mensaje.
import { randomUUID } from 'node:crypto';

const INBOUND_RETENTION_DAYS = 30;
const PURGE_EVERY_MS = 60 * 60 * 1000;

// `wa_id` es la clave estable de quien escribe (su BSUID desde el 22 de octubre de 2026, o su número en un aviso
// antiguo sin BSUID); `phone` es su número cuando Meta lo manda, para responder por número y mostrarlo.
const linkOf = (row) => (row ? { userId: row.user_id, waId: row.wa_id, phone: row.phone || null, profileName: row.profile_name, conversationId: row.conversation_id, linkedAt: row.linked_at, lastMessageAt: row.last_message_at, lastInboundAt: row.last_inbound_at || null, alertsOff: row.alerts_off || [] } : null);
const ALERT_RETENTION_DAYS = 14;
const alertOf = (row) => (row ? { id: row.id, userId: row.user_id, kind: row.kind, sourceRef: row.source_ref, topic: row.topic, text: row.text, buttons: Array.isArray(row.buttons) ? row.buttons : [], status: row.status, via: row.via, error: row.error, createdAt: row.created_at, sentAt: row.sent_at, openedAt: row.opened_at } : null);

export const createWhatsAppLinkRepository = ({ pool }) => {
  let lastPurge = 0;
  const purgeOld = async () => {
    const at = Date.now();
    if (at - lastPurge < PURGE_EVERY_MS) return;
    lastPurge = at;
    await pool.query(`DELETE FROM bria_memory.whatsapp_inbound WHERE received_at < now() - interval '${INBOUND_RETENTION_DAYS} days'`);
    await pool.query('DELETE FROM bria_memory.whatsapp_link_codes WHERE expires_at < now()');
    await pool.query(`DELETE FROM bria_memory.whatsapp_alerts WHERE created_at < now() - interval '${ALERT_RETENTION_DAYS} days'`);
  };
  return {
    /** Un código vivo por persona: pedir otro invalida el anterior. Devuelve false si el código chocó con uno existente. */
    async createCode({ userId, code, expiresAt }) {
      await pool.query('DELETE FROM bria_memory.whatsapp_link_codes WHERE user_id=$1', [userId]);
      const inserted = await pool.query('INSERT INTO bria_memory.whatsapp_link_codes(code,user_id,expires_at) VALUES($1,$2,$3) ON CONFLICT (code) DO NOTHING RETURNING code', [code, userId, expiresAt]);
      return inserted.rowCount === 1;
    },
    /** Gasta el código y deja el número vinculado a su persona; un número que ya es de otra persona no se roba. */
    async consumeCode({ code, waId, phone = null, profileName, now = new Date() }) {
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const row = (await db.query('SELECT code,user_id,expires_at FROM bria_memory.whatsapp_link_codes WHERE code=$1 FOR UPDATE', [code])).rows[0];
        if (!row) { await db.query('ROLLBACK'); return { ok: false, reason: 'unknown' }; }
        await db.query('DELETE FROM bria_memory.whatsapp_link_codes WHERE code=$1', [code]);
        if (new Date(row.expires_at).getTime() < now.getTime()) { await db.query('COMMIT'); return { ok: false, reason: 'expired' }; }
        const taken = (await db.query('SELECT user_id FROM bria_memory.whatsapp_links WHERE (wa_id=$1 OR ($3::text IS NOT NULL AND (phone=$3 OR wa_id=$3))) AND user_id<>$2', [waId, row.user_id, phone])).rows[0];
        if (taken) { await db.query('COMMIT'); return { ok: false, reason: 'taken' }; }
        // Mandar el código ya es un mensaje de la persona: abre la ventana de 24 horas.
        await db.query(`INSERT INTO bria_memory.whatsapp_links(user_id,wa_id,phone,profile_name,linked_at,last_inbound_at)
          VALUES($1,$2,$3,$4,$5,$5)
          ON CONFLICT (user_id) DO UPDATE SET wa_id=EXCLUDED.wa_id, phone=EXCLUDED.phone, profile_name=EXCLUDED.profile_name, linked_at=EXCLUDED.linked_at, last_inbound_at=EXCLUDED.last_inbound_at, conversation_id=NULL, last_message_at=NULL`, [row.user_id, waId, phone, profileName || null, now]);
        await db.query('COMMIT');
        return { ok: true, userId: row.user_id };
      } catch (failure) { await db.query('ROLLBACK'); throw failure; } finally { db.release(); }
    },
    /** Por la clave de quien escribe o, si el aviso trae número, también por ese número: vale el vínculo hecho con cualquiera. */
    async linkByWaId(waId, phone = null) { return linkOf((await pool.query('SELECT * FROM bria_memory.whatsapp_links WHERE wa_id=$1 OR ($2::text IS NOT NULL AND (phone=$2 OR wa_id=$2)) ORDER BY (wa_id=$1) DESC LIMIT 1', [waId, phone])).rows[0]); },
    async setPhone(userId, phone) { await pool.query('UPDATE bria_memory.whatsapp_links SET phone=$2 WHERE user_id=$1', [userId, phone]); },
    async linkByUser(userId) { return linkOf((await pool.query('SELECT * FROM bria_memory.whatsapp_links WHERE user_id=$1', [userId])).rows[0]); },
    async setConversation(userId, conversationId) { await pool.query('UPDATE bria_memory.whatsapp_links SET conversation_id=$2 WHERE user_id=$1', [userId, conversationId]); },
    async touch(userId, at = new Date()) { await pool.query('UPDATE bria_memory.whatsapp_links SET last_message_at=$2 WHERE user_id=$1', [userId, at]); },
    async markInbound(userId, at = new Date()) { await pool.query('UPDATE bria_memory.whatsapp_links SET last_inbound_at=$2 WHERE user_id=$1', [userId, at]); },
    async setAlertsOff(userId, kinds) { await pool.query('UPDATE bria_memory.whatsapp_links SET alerts_off=$2 WHERE user_id=$1', [userId, kinds]); },
    async alertsSince(userId, since) { return Number((await pool.query('SELECT count(*)::int AS n FROM bria_memory.whatsapp_alerts WHERE user_id=$1 AND created_at >= $2', [userId, since])).rows[0]?.n || 0); },
    /** null si ese origen ya se le avisó a esa persona: un mismo pedido o cierre no llega dos veces. */
    async saveAlert({ userId, kind, sourceRef, topic = null, text, buttons = [], createdAt = new Date() }) {
      await purgeOld();
      const { rows } = await pool.query(`INSERT INTO bria_memory.whatsapp_alerts(id,user_id,kind,source_ref,topic,text,buttons,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (user_id, source_ref) DO NOTHING RETURNING *`, [randomUUID(), userId, kind, sourceRef, topic, text, JSON.stringify(buttons), createdAt]);
      return alertOf(rows[0]);
    },
    async alertById(id) {
      if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) return null;
      return alertOf((await pool.query('SELECT * FROM bria_memory.whatsapp_alerts WHERE id=$1', [id])).rows[0]);
    },
    async markAlertSent(id, via) { await pool.query("UPDATE bria_memory.whatsapp_alerts SET status='SENT', via=$2, sent_at=now(), error=NULL WHERE id=$1", [id, via]); },
    async markAlertFailed(id, error) { await pool.query("UPDATE bria_memory.whatsapp_alerts SET status='FAILED', error=$2 WHERE id=$1", [id, error]); },
    async markAlertOpened(id, at = new Date()) { await pool.query('UPDATE bria_memory.whatsapp_alerts SET opened_at=COALESCE(opened_at,$2) WHERE id=$1', [id, at]); },
    async unlink(userId) {
      await pool.query('DELETE FROM bria_memory.whatsapp_links WHERE user_id=$1', [userId]);
      await pool.query('DELETE FROM bria_memory.whatsapp_link_codes WHERE user_id=$1', [userId]);
    },
    /** true la primera vez que se ve ese mensaje; false si Meta lo volvió a mandar. */
    async rememberInbound(messageId, waId) {
      await purgeOld();
      const inserted = await pool.query("INSERT INTO bria_memory.whatsapp_inbound(message_id,wa_id,kind) VALUES($1,$2,'MESSAGE') ON CONFLICT (message_id) DO NOTHING RETURNING message_id", [messageId, waId]);
      return inserted.rowCount === 1;
    },
    async unknownRepliesSince(waId, since) {
      return Number((await pool.query("SELECT count(*)::int AS n FROM bria_memory.whatsapp_inbound WHERE wa_id=$1 AND kind='UNKNOWN_REPLY' AND received_at >= $2", [waId, since])).rows[0]?.n || 0);
    },
    async rememberUnknownReply(waId, at = new Date()) {
      await pool.query("INSERT INTO bria_memory.whatsapp_inbound(message_id,wa_id,kind,received_at) VALUES($1,$2,'UNKNOWN_REPLY',$3) ON CONFLICT DO NOTHING", [`unknown:${waId}:${at.getTime()}`, waId, at]);
    }
  };
};
