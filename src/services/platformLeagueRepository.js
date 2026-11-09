// La liga desde su nuevo inicio: toda lectura y escritura queda separada del piloto conservado.

export const LEAGUE_RUN_ID = 'fresh-start-2026-11';
export const createPlatformLeagueRepository = ({ pool }) => ({
  async startedAt() {
    const { rows } = await pool.query('SELECT started_at FROM bria_memory.league_runs WHERE id = $1', [LEAGUE_RUN_ID]);
    if (!rows[0]) throw new Error('Falta preparar el inicio de la liga.');
    return new Date(rows[0].started_at);
  },
  /** Guarda (o reemplaza) los puntos de un día para varias personas en una sola sentencia. */
  async saveDays(rows) {
    if (!rows.length) return 0;
    const { rowCount } = await pool.query(`INSERT INTO bria_memory.league_run_days(run_id, day_key, member_id, habits, extras, evidence)
      SELECT $2, x.day_key, x.member_id, x.habits, COALESCE(x.extras, '{}'::jsonb), x.evidence
      FROM jsonb_to_recordset($1::jsonb) AS x(day_key text, member_id text, habits jsonb, extras jsonb, evidence jsonb)
      ON CONFLICT (run_id, day_key, member_id) DO UPDATE SET habits=EXCLUDED.habits, extras=EXCLUDED.extras, evidence=EXCLUDED.evidence, computed_at=now()`,
    [JSON.stringify(rows), LEAGUE_RUN_ID]);
    return rowCount;
  },

  /** Los días de un mes que ya tienen cálculo. */
  async computedDays(monthKey) {
    const { rows } = await pool.query('SELECT DISTINCT day_key FROM bria_memory.league_run_days WHERE day_key LIKE $1 AND run_id = $2 ORDER BY day_key', [`${monthKey}-%`, LEAGUE_RUN_ID]);
    return rows.map((row) => row.day_key);
  },

  /** Todas las filas del mes anteriores a un día: [{ day_key, member_id, habits, extras }]. */
  async daysOfMonth(monthKey, { before }) {
    const { rows } = await pool.query('SELECT day_key, member_id, habits, extras, evidence FROM bria_memory.league_run_days WHERE day_key LIKE $1 AND day_key < $2 AND run_id = $3 ORDER BY day_key', [`${monthKey}-%`, before, LEAGUE_RUN_ID]);
    return rows;
  },

  /** Las filas de un tramo de días (ambos incluidos) anteriores a un día: la semana, que puede cruzar de mes. */
  async daysInRange(fromDay, toDay, { before }) {
    const { rows } = await pool.query('SELECT day_key, member_id, habits, extras, evidence FROM bria_memory.league_run_days WHERE day_key >= $1 AND day_key <= $2 AND day_key < $3 AND run_id = $4 ORDER BY day_key', [fromDay, toDay, before, LEAGUE_RUN_ID]);
    return rows;
  },

  /** Los regalos de una semana de Bogotá («2026-W46»), dentro de esta edición. */
  async kudosOfWeek(weekKey) {
    const { rows } = await pool.query(`SELECT id, week_key, giver_member_id, receiver_member_id, note, points, created_at
      FROM bria_memory.league_run_kudos WHERE run_id = $1 AND week_key = $2 ORDER BY created_at`, [LEAGUE_RUN_ID, weekKey]);
    return rows;
  },

  async meetingsOfWeek(weekKey) {
    const { rows } = await pool.query(`SELECT id, week_key, day_key, member_id, awarded_by FROM bria_memory.league_meeting_awards
      WHERE run_id=$1 AND week_key=$2 ORDER BY day_key`, [LEAGUE_RUN_ID, weekKey]);
    return rows;
  },

  /** Los regalos recibidos en el mes de Bogotá, dentro de esta edición. */
  async kudosOfMonth(monthKey) {
    const [year, month] = monthKey.split('-').map(Number);
    const { rows } = await pool.query(`SELECT id, week_key, giver_member_id, receiver_member_id, note, points, created_at
      FROM bria_memory.league_run_kudos WHERE run_id = $1 AND created_at >= $2 AND created_at < $3 ORDER BY created_at`,
    [LEAGUE_RUN_ID, new Date(`${monthKey}-01T05:00:00.000Z`), new Date(Date.UTC(year, month, 1, 5))]);
    return rows;
  },

  async givenInWeek(memberId, weekKey) {
    const { rows } = await pool.query(`SELECT receiver_member_id, note, points FROM bria_memory.league_run_kudos
      WHERE run_id=$1 AND giver_member_id=$2 AND week_key=$3 ORDER BY created_at LIMIT 1`, [LEAGUE_RUN_ID, memberId, weekKey]);
    return rows[0] || null;
  },
  async meetingsOfMonth(monthKey) {
    const { rows } = await pool.query(`SELECT id, week_key, day_key, member_id, awarded_by FROM bria_memory.league_meeting_awards
      WHERE run_id=$1 AND day_key LIKE $2 ORDER BY day_key`, [LEAGUE_RUN_ID, `${monthKey}-%`]);
    return rows;
  },
  async awardMeeting({ week_key, day_key, member_id, awarded_by }) {
    const { rows } = await pool.query(`INSERT INTO bria_memory.league_meeting_awards(run_id,week_key,day_key,member_id,awarded_by)
      VALUES($1,$2,$3,$4,$5) RETURNING id`, [LEAGUE_RUN_ID, week_key, day_key, member_id, awarded_by]);
    return rows[0];
  },
  /** Un regalo de cinco puntos por semana de Bogotá; la base rechaza el segundo (23505). */
  async giveKudos({ giver_member_id, receiver_member_id, note, created_at = new Date() }) {
    const { rows } = await pool.query(`INSERT INTO bria_memory.league_run_kudos(run_id, week_key, giver_member_id, receiver_member_id, note, created_at)
      VALUES ($1, to_char($2::timestamptz AT TIME ZONE 'America/Bogota', 'IYYY-"W"IW'), $3, $4, $5, $2)
      RETURNING id, week_key, giver_member_id, receiver_member_id, note, points, created_at`, [LEAGUE_RUN_ID, created_at, giver_member_id, receiver_member_id, note]);
    return rows[0];
  }
});
