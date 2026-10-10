// Guarda y lee las lecturas de la semana en `bria_memory.rhythm_readings` (10 de octubre de 2026). Única capa de
// acceso a esa tabla; SQL parametrizado; nada se borra.

import { randomUUID } from 'node:crypto';

const present = (row) => row && ({
  id: row.id, weekKey: row.week_key, trigger: row.trigger, periodDays: row.period_days, reading: row.reading,
  model: row.model, generatedBy: row.generated_by_name, generatedAt: row.generated_at
});
const SELECT = 'SELECT id, week_key, trigger, period_days, reading, model, generated_by_name, generated_at FROM bria_memory.rhythm_readings';

export const createWeeklyReadingRepository = ({ pool }) => ({
  async latest() {
    return present((await pool.query(`${SELECT} ORDER BY generated_at DESC LIMIT 1`)).rows[0]) || null;
  },
  async forWeek(weekKey, { trigger = null } = {}) {
    const args = [weekKey];
    if (trigger) args.push(trigger);
    return present((await pool.query(`${SELECT} WHERE week_key = $1${trigger ? ' AND trigger = $2' : ''} ORDER BY generated_at DESC LIMIT 1`, args)).rows[0]) || null;
  },
  async save({ weekKey, trigger, periodDays, reading, digest, model = null, usage = null, actor }) {
    const row = (await pool.query(
      'INSERT INTO bria_memory.rhythm_readings(id, week_key, trigger, period_days, reading, digest, model, usage, generated_by_ref, generated_by_name) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, week_key, trigger, period_days, reading, model, generated_by_name, generated_at',
      [randomUUID(), weekKey, trigger, periodDays, reading, digest, model, usage, actor.ref, actor.name]
    )).rows[0];
    return present(row);
  },
  async history(limit = 12) {
    return (await pool.query(`${SELECT} ORDER BY generated_at DESC LIMIT $1`, [Math.min(Math.max(Number(limit) || 12, 1), 52)])).rows.map(present);
  }
});
