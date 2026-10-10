// Lo que «Bria se adelanta» y el foco de la semana guardan en la base lateral (10 de octubre de 2026): qué avisos
// ocultó cada persona y a quién se le dejó ya el foco de esta semana. SQL parametrizado; única capa de acceso.

export const createBriaProactiveRepository = ({ pool }) => ({
  /** Claves de los avisos que esta persona ocultó y siguen ocultos. */
  async dismissedKeys(userRef, now = new Date()) {
    const { rows } = await pool.query('SELECT nudge_key FROM bria_memory.nudge_dismissals WHERE user_ref=$1 AND until_at > $2', [userRef, now]);
    return new Set(rows.map((row) => row.nudge_key));
  },
  async dismiss(userRef, key, untilAt) {
    await pool.query('INSERT INTO bria_memory.nudge_dismissals(user_ref,nudge_key,until_at) VALUES($1,$2,$3) ON CONFLICT (user_ref,nudge_key) DO UPDATE SET until_at=EXCLUDED.until_at, created_at=now()', [userRef, key, untilAt]);
    return { key, untilAt };
  },
  /** Lo vencido se limpia de vez en cuando; nada de esto es historial que importe. */
  async purgeExpired(now = new Date()) {
    const { rowCount } = await pool.query('DELETE FROM bria_memory.nudge_dismissals WHERE until_at <= $1', [now]);
    return rowCount;
  },
  async focusDelivery(weekKey, userRef) {
    const { rows } = await pool.query('SELECT conversation_id, created_at FROM bria_memory.weekly_focus_deliveries WHERE week_key=$1 AND user_ref=$2', [weekKey, userRef]);
    return rows[0] ? { weekKey, userRef, conversationId: rows[0].conversation_id, createdAt: rows[0].created_at } : null;
  },
  async recordFocusDelivery(weekKey, userRef, conversationId) {
    await pool.query('INSERT INTO bria_memory.weekly_focus_deliveries(week_key,user_ref,conversation_id) VALUES($1,$2,$3) ON CONFLICT (week_key,user_ref) DO NOTHING', [weekKey, userRef, conversationId]);
    return { weekKey, userRef, conversationId };
  }
});
