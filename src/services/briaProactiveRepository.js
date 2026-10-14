// Lo que «Bria se adelanta», el foco de la semana y el pulso guardan en la base lateral (10 de octubre de 2026): qué
// avisos ocultó cada persona, a quién se le dejó ya el foco de esta semana, qué horas corrió el pulso y qué dijo.
// SQL parametrizado; única capa de acceso.

import { randomUUID } from 'node:crypto';

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
  },

  /* ---- El pulso de Bria (10 de octubre de 2026) ---- */

  /** Reclama una hora: solo quien inserta la fila corre el pulso de esa hora (réplicas y reinicios no la repiten). */
  async claimRun(hourKey) {
    const { rowCount } = await pool.query('INSERT INTO bria_memory.pulse_runs(hour_key) VALUES($1) ON CONFLICT (hour_key) DO NOTHING', [hourKey]);
    return rowCount > 0;
  },
  async hasRecentRun(now, withinMs) {
    const { rows } = await pool.query('SELECT 1 FROM bria_memory.pulse_runs WHERE ran_at > $1 LIMIT 1', [new Date(new Date(now).getTime() - withinMs)]);
    return rows.length > 0;
  },
  /** Lo que ya se le dijo a la persona: cuántos hoy, cuántos esta hora, qué huellas, qué tipos ha ocultado en la semana. */
  async pulseState(userRef, { dayStart, hourStart, muteSince }) {
    const [today, kinds] = await Promise.all([
      pool.query('SELECT title, kinds, fingerprints, created_at FROM bria_memory.pulse_messages WHERE user_ref=$1 AND created_at >= $2 ORDER BY created_at', [userRef, dayStart]),
      pool.query('SELECT k AS kind, count(*)::int AS count FROM bria_memory.pulse_messages, unnest(kinds) AS k WHERE user_ref=$1 AND dismissed_at >= $2 GROUP BY k', [userRef, muteSince])
    ]);
    return {
      saidToday: today.rows.length,
      saidThisHour: today.rows.filter((row) => new Date(row.created_at) >= hourStart).length,
      said: today.rows.map((row) => ({ title: row.title, kinds: row.kinds })),
      saidFingerprints: new Set(today.rows.flatMap((row) => row.fingerprints || [])),
      dismissalsByKind: Object.fromEntries(kinds.rows.map((row) => [row.kind, row.count]))
    };
  },
  async insertMessages(userRef, rows, { expiresAt, model = null, usage = null, createdAt = new Date() }) {
    const saved = [];
    for (const row of rows) {
      const id = randomUUID();
      await pool.query('INSERT INTO bria_memory.pulse_messages(id,user_ref,kinds,fact_ids,fingerprints,title,body,ask,url,task_ids,urgency,source,model,usage,expires_at,created_at,actions) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)',
        [id, userRef, row.kinds, row.factIds, row.fingerprints, row.title, row.body || '', row.ask || null, row.url || null, row.taskIds || [], row.urgency, row.source, row.source === 'MODELO' ? model : null, row.source === 'MODELO' ? usage : null, expiresAt, createdAt, JSON.stringify(row.actions || [])]);
      saved.push({ id, ...row });
    }
    return saved;
  },
  async activeMessages(userRef, now = new Date()) {
    const { rows } = await pool.query('SELECT id, kinds, title, body, ask, url, task_ids, urgency, actions, created_at, resolution, resolved_at, follow_up FROM bria_memory.pulse_messages WHERE user_ref=$1 AND dismissed_at IS NULL AND expires_at > $2 ORDER BY created_at DESC', [userRef, now]);
    return rows.map((row) => ({ id: row.id, kinds: row.kinds, title: row.title, body: row.body, ask: row.ask, url: row.url, taskIds: row.task_ids, urgency: row.urgency, actions: Array.isArray(row.actions) ? row.actions : [], createdAt: row.created_at, resolution: row.resolution || null, resolvedAt: row.resolved_at || null, followUp: row.follow_up || null }));
  },
  async dismissMessage(userRef, id, now = new Date()) {
    const { rowCount } = await pool.query('UPDATE bria_memory.pulse_messages SET dismissed_at=$3 WHERE user_ref=$1 AND id=$2 AND dismissed_at IS NULL', [userRef, id, now]);
    return rowCount > 0;
  },

  /* ---- El seguimiento de los avisos y el cierre del día (14 de octubre de 2026) ---- */

  /** Los avisos vivos de todas las personas que todavía no tienen desenlace: ni resueltos, ni ocultos, ni vencidos. */
  async pendingFollowUps(now = new Date()) {
    const { rows } = await pool.query('SELECT id, user_ref, kinds, fact_ids, task_ids, created_at, followed_up_at FROM bria_memory.pulse_messages WHERE resolved_at IS NULL AND dismissed_at IS NULL AND expires_at > $1 ORDER BY created_at', [now]);
    return rows.map((row) => ({ id: row.id, userRef: row.user_ref, kinds: row.kinds, factIds: row.fact_ids, taskIds: row.task_ids, createdAt: row.created_at, followedUpAt: row.followed_up_at }));
  },
  async resolveMessage(id, text, now = new Date()) {
    const { rowCount } = await pool.query('UPDATE bria_memory.pulse_messages SET resolved_at=$2, resolution=$3 WHERE id=$1 AND resolved_at IS NULL', [id, now, text]);
    return rowCount > 0;
  },
  /** El recordatorio de «sigue igual» se escribe una sola vez por aviso. */
  async markFollowedUp(id, text, now = new Date()) {
    const { rowCount } = await pool.query('UPDATE bria_memory.pulse_messages SET followed_up_at=$2, follow_up=$3 WHERE id=$1 AND followed_up_at IS NULL', [id, now, text]);
    return rowCount > 0;
  },
  /** Lo que Bria le avisó a una persona desde `dayStart`, con su desenlace, para el cierre del día. */
  async messagesOfDay(userRef, dayStart) {
    const { rows } = await pool.query('SELECT id, title, kinds, resolution, resolved_at, follow_up, dismissed_at, created_at FROM bria_memory.pulse_messages WHERE user_ref=$1 AND created_at >= $2 ORDER BY created_at', [userRef, dayStart]);
    return rows.map((row) => ({ id: row.id, title: row.title, kinds: row.kinds, resolution: row.resolution || null, resolvedAt: row.resolved_at || null, followUp: row.follow_up || null, dismissedAt: row.dismissed_at || null, createdAt: row.created_at }));
  },
  async dailyCloseDelivery(dayKey, userRef) {
    const { rows } = await pool.query('SELECT conversation_id, created_at FROM bria_memory.daily_close_deliveries WHERE day_key=$1 AND user_ref=$2', [dayKey, userRef]);
    return rows[0] ? { dayKey, userRef, conversationId: rows[0].conversation_id, createdAt: rows[0].created_at } : null;
  },
  async recordDailyCloseDelivery(dayKey, userRef, conversationId) {
    await pool.query('INSERT INTO bria_memory.daily_close_deliveries(day_key,user_ref,conversation_id) VALUES($1,$2,$3) ON CONFLICT (day_key,user_ref) DO NOTHING', [dayKey, userRef, conversationId]);
    return { dayKey, userRef, conversationId };
  }
});
