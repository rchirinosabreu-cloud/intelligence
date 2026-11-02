// La liga del mes en la base lateral (2 de noviembre de 2026): los cinco puntos de cada persona y día, y los regalos
// de bondad de cada semana. SQL parametrizado; única capa de acceso a `bria_memory.league_days` y `league_kudos`.

export const createPlatformLeagueRepository = ({ pool }) => ({
  /** Guarda (o reemplaza) los puntos de un día para varias personas en una sola sentencia. */
  async saveDays(rows) {
    if (!rows.length) return 0;
    const { rowCount } = await pool.query(`INSERT INTO bria_memory.league_days(day_key, member_id, habits, extras, evidence)
      SELECT x.day_key, x.member_id, x.habits, COALESCE(x.extras, '{}'::jsonb), x.evidence
      FROM jsonb_to_recordset($1::jsonb) AS x(day_key text, member_id text, habits jsonb, extras jsonb, evidence jsonb)
      ON CONFLICT (day_key, member_id) DO UPDATE SET habits=EXCLUDED.habits, extras=EXCLUDED.extras, evidence=EXCLUDED.evidence, computed_at=now()`,
    [JSON.stringify(rows)]);
    return rowCount;
  },

  /** Los días de un mes que ya tienen cálculo. */
  async computedDays(monthKey) {
    const { rows } = await pool.query('SELECT DISTINCT day_key FROM bria_memory.league_days WHERE day_key LIKE $1 ORDER BY day_key', [`${monthKey}-%`]);
    return rows.map((row) => row.day_key);
  },

  /** Todas las filas del mes anteriores a un día: [{ day_key, member_id, habits, extras }]. */
  async daysOfMonth(monthKey, { before }) {
    const { rows } = await pool.query('SELECT day_key, member_id, habits, extras FROM bria_memory.league_days WHERE day_key LIKE $1 AND day_key < $2 ORDER BY day_key', [`${monthKey}-%`, before]);
    return rows;
  },

  /** Los regalos cuyo lunes cae en el mes. */
  async kudosOfMonth(monthKey) {
    const { rows } = await pool.query(`SELECT id, week_key, giver_member_id, receiver_member_id, note, created_at
      FROM bria_memory.league_kudos WHERE to_char(created_at AT TIME ZONE 'America/Bogota', 'YYYY-MM') = $1 ORDER BY created_at`, [monthKey]);
    return rows;
  },

  /** Un regalo de la semana; la base rechaza el segundo de la misma persona (23505). */
  async giveKudos({ week_key, giver_member_id, receiver_member_id, note }) {
    const { rows } = await pool.query(`INSERT INTO bria_memory.league_kudos(week_key, giver_member_id, receiver_member_id, note)
      VALUES ($1, $2, $3, $4) RETURNING id, week_key, giver_member_id, receiver_member_id, note, created_at`, [week_key, giver_member_id, receiver_member_id, note]);
    return rows[0];
  }
});
