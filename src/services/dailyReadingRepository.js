// Lo que la memoria del tiempo y la lectura del día guardan en la base lateral (19 de octubre de 2026): la foto diaria
// de cada cuenta y de cada persona, y la lectura de cada día hábil. SQL parametrizado; única capa de acceso.

const DAY = 86_400_000;
const minusDays = (day, amount) => new Date(Date.parse(`${day}T12:00:00Z`) - amount * DAY).toISOString().slice(0, 10);
const subjectOf = (row) => ({ id: row.subject_id, name: row.subject_name, slug: row.subject_slug || null, pmId: row.pm_id || null, metrics: row.metrics });
// El historial se lee del registro inmutable, nunca de una copia editable en la fila de trabajo.
const decisionHistory = `COALESCE((SELECT jsonb_agg(events.event ORDER BY events.id)
  FROM bria_memory.decision_events events WHERE events.decision_log_id=decision_log.id), '[]'::jsonb) AS history`;
const verdictChanged = '(decision_log.verdict,decision_log.note) IS DISTINCT FROM (EXCLUDED.verdict,EXCLUDED.note)';

export const createDailyReadingRepository = ({ pool }) => ({
  async hasSnapshot(dayKey) {
    const { rows } = await pool.query('SELECT 1 FROM bria_memory.agency_snapshots WHERE day_key=$1 LIMIT 1', [dayKey]);
    return rows.length > 0;
  },

  /** Guarda la foto del día en una sola sentencia; repetirla el mismo día la reemplaza. */
  async saveSnapshot(dayKey, { clients = [], people = [] }) {
    const rows = [
      ...clients.map((c) => ({ subject_type: 'CLIENT', subject_id: c.id, subject_name: c.name, subject_slug: c.slug || null, pm_id: c.pmId || null, metrics: c.metrics })),
      ...people.map((p) => ({ subject_type: 'PERSON', subject_id: p.id, subject_name: p.name, subject_slug: null, pm_id: null, metrics: p.metrics }))
    ];
    if (!rows.length) return 0;
    const { rowCount } = await pool.query(`INSERT INTO bria_memory.agency_snapshots(day_key,subject_type,subject_id,subject_name,subject_slug,pm_id,metrics)
      SELECT $1, x.subject_type, x.subject_id, x.subject_name, x.subject_slug, x.pm_id, x.metrics
      FROM jsonb_to_recordset($2::jsonb) AS x(subject_type text, subject_id text, subject_name text, subject_slug text, pm_id text, metrics jsonb)
      ON CONFLICT (day_key,subject_type,subject_id) DO UPDATE SET subject_name=EXCLUDED.subject_name, subject_slug=EXCLUDED.subject_slug, pm_id=EXCLUDED.pm_id, metrics=EXCLUDED.metrics, created_at=now()`,
    [dayKey, JSON.stringify(rows)]);
    return rowCount;
  },

  /** La foto de un día, con nombres: { clients: [...], people: [...] }. */
  async snapshot(dayKey) {
    const { rows } = await pool.query('SELECT subject_type, subject_id, subject_name, subject_slug, pm_id, metrics FROM bria_memory.agency_snapshots WHERE day_key=$1 ORDER BY subject_name', [dayKey]);
    return { clients: rows.filter((r) => r.subject_type === 'CLIENT').map(subjectOf), people: rows.filter((r) => r.subject_type === 'PERSON').map(subjectOf) };
  },

  /** Las fotos anteriores a `before`, de los últimos `days` días: [{ day, clients: { id: metrics }, people: { id: metrics } }]. */
  async history(before, days = 40) {
    const { rows } = await pool.query('SELECT day_key, subject_type, subject_id, metrics FROM bria_memory.agency_snapshots WHERE day_key < $1 AND day_key >= $2 ORDER BY day_key', [before, minusDays(before, days)]);
    const byDay = new Map();
    for (const row of rows) {
      if (!byDay.has(row.day_key)) byDay.set(row.day_key, { day: row.day_key, clients: {}, people: {} });
      byDay.get(row.day_key)[row.subject_type === 'CLIENT' ? 'clients' : 'people'][row.subject_id] = row.metrics;
    }
    return [...byDay.values()];
  },

  /** La serie de una cuenta o una persona, de la más antigua a la más reciente. */
  async series(subjectType, subjectId, { days = 14, until } = {}) {
    const { rows } = await pool.query('SELECT day_key, subject_name, metrics FROM bria_memory.agency_snapshots WHERE subject_type=$1 AND subject_id=$2 AND day_key <= $3 AND day_key > $4 ORDER BY day_key', [subjectType, subjectId, until, minusDays(until, days)]);
    return rows.map((row) => ({ day: row.day_key, name: row.subject_name, metrics: row.metrics }));
  },

  async firstDay() {
    const { rows } = await pool.query('SELECT min(day_key) AS day FROM bria_memory.agency_snapshots');
    return rows[0]?.day || null;
  },

  /** La lectura se escribe una vez por día; si ya existe, se devuelve la que estaba. */
  async saveReading(dayKey, reading, { digest = null } = {}) {
    await pool.query('INSERT INTO bria_memory.daily_readings(day_key,base_day_key,source,reading,digest,model,usage) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (day_key) DO NOTHING',
      [dayKey, reading.baseDay || null, reading.source, JSON.stringify(reading), digest, reading.model || null, reading.usage ? JSON.stringify(reading.usage) : null]);
    return this.reading(dayKey);
  },
  async reading(dayKey) {
    const { rows } = await pool.query('SELECT reading FROM bria_memory.daily_readings WHERE day_key=$1', [dayKey]);
    return rows[0]?.reading || null;
  },
  async latestReading() {
    const { rows } = await pool.query('SELECT reading FROM bria_memory.daily_readings ORDER BY day_key DESC LIMIT 1');
    return rows[0]?.reading || null;
  },
  /** Las lecturas de los últimos `days` días antes de `before` (sin incluirlo), de la más reciente a la más antigua. */
  async readingsBefore(before, days = 30) {
    const { rows } = await pool.query('SELECT reading FROM bria_memory.daily_readings WHERE day_key < $1 AND day_key >= $2 ORDER BY day_key DESC', [before, minusDays(before, days)]);
    return rows.map((row) => row.reading);
  },

  /* ---- El libro de decisiones (19 de octubre de 2026) ---- */

  /** Repetir es inocuo; corregir abre otra revisión y conserva la historia anterior. */
  async recordDecision({ decision, dayKey, user, verdict, note = null, decidedAt = new Date() }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`INSERT INTO bria_memory.decision_log(id,decision_id,day_key,user_ref,user_name,title,kind,subject_type,subject_id,subject_name,evidence,verdict,note,decided_at)
      VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (decision_id,user_ref) DO UPDATE SET
        verdict=EXCLUDED.verdict, note=EXCLUDED.note,
        decided_at=CASE WHEN ${verdictChanged} THEN EXCLUDED.decided_at ELSE decision_log.decided_at END,
        revision=decision_log.revision + CASE WHEN ${verdictChanged} THEN 1 ELSE 0 END,
        outcome=CASE WHEN ${verdictChanged} THEN NULL ELSE decision_log.outcome END,
        outcome_day=CASE WHEN ${verdictChanged} THEN NULL ELSE decision_log.outcome_day END,
        outcome_text=CASE WHEN ${verdictChanged} THEN NULL ELSE decision_log.outcome_text END
      RETURNING *`,
    [decision.id, dayKey, user.ref, user.name || null, decision.title, decision.kind, decision.subjectType || null, decision.subjectId || null, decision.subjectName || null, decision.evidence || [], verdict, note, decidedAt]);
      // AFTER ya registró el evento; la transacción mantiene bloqueada la fila hasta leer su historial coherente.
      const saved = await client.query(`SELECT decision_log.*, ${decisionHistory} FROM bria_memory.decision_log WHERE id=$1`, [rows[0].id]);
      await client.query('COMMIT');
      return entryOf(saved.rows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
  /** Una observación por día durante la ventana, incluso tras mejorar, para detectar recaídas. */
  async pendingOutcomes(today, { fromDays = 1, untilDays = 14 } = {}) {
    const { rows } = await pool.query(`SELECT decision_log.*, ${decisionHistory} FROM bria_memory.decision_log
      WHERE kind <> 'NO_HACER' AND (outcome_day IS NULL OR outcome_day < $3)
        AND day_key <= $1 AND day_key >= $2 ORDER BY day_key`, [minusDays(today, fromDays), minusDays(today, untilDays), today]);
    return rows.map(entryOf);
  },
  async setOutcome(id, { outcome, text, day, expectedRevision }) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return false;
    const { rowCount } = await pool.query(`UPDATE bria_memory.decision_log SET outcome=$2, outcome_text=$3, outcome_day=$4
      WHERE id=$1 AND revision=$5 AND kind <> 'NO_HACER' AND (outcome_day IS NULL OR outcome_day < $4)
        AND day_key < $4 AND day_key >= $6`, [id, outcome, text, day, expectedRevision, minusDays(day, 14)]);
    return rowCount > 0;
  },
  /** Las entradas de los últimos `days` días hasta `today`, de todas las personas o de una. */
  async recentDecisions(today, { days = 30, userRef = null } = {}) {
    const { rows } = await pool.query(`SELECT decision_log.*, ${decisionHistory} FROM bria_memory.decision_log WHERE day_key <= $1 AND day_key >= $2 ${userRef ? 'AND user_ref=$3' : ''} ORDER BY day_key, decided_at`, userRef ? [today, minusDays(today, days), userRef] : [today, minusDays(today, days)]);
    return rows.map(entryOf);
  }
});

const entryOf = (row) => ({
  id: row.id, decisionId: row.decision_id, dayKey: row.day_key, userRef: row.user_ref, userName: row.user_name || null,
  title: row.title, kind: row.kind, subjectType: row.subject_type || null, subjectId: row.subject_id || null, subjectName: row.subject_name || null,
  evidence: row.evidence || [], verdict: row.verdict, note: row.note || null, decidedAt: row.decided_at,
  outcome: row.outcome || null, outcomeDay: row.outcome_day || null, outcomeText: row.outcome_text || null,
  revision: row.revision, history: row.history || []
});
