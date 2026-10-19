// Lo que la memoria del tiempo y la lectura del día guardan en la base lateral (19 de octubre de 2026): la foto diaria
// de cada cuenta y de cada persona, y la lectura de cada día hábil. SQL parametrizado; única capa de acceso.

const DAY = 86_400_000;
const minusDays = (day, amount) => new Date(Date.parse(`${day}T12:00:00Z`) - amount * DAY).toISOString().slice(0, 10);
const subjectOf = (row) => ({ id: row.subject_id, name: row.subject_name, slug: row.subject_slug || null, pmId: row.pm_id || null, metrics: row.metrics });

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
  }
});
