import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';

const context = new AsyncLocalStorage();
let calendarPool;
const getPool = () => calendarPool ||= new pg.Pool({
  connectionString: process.env.DATABASE_URL, max: 2, connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 1000, allowExitOnIdle: true
});
const lockError = () => Object.assign(new Error('Hay otra sincronización de calendario en curso. Vuelve a intentarlo.'), { code: 'GOOGLE_CALENDAR_BUSY' });

export function assertCalendarSyncLock() {
  const active = context.getStore();
  if (active?.lost) throw Object.assign(new Error('Se perdió el bloqueo de sincronización; el trabajo queda pendiente.'), { code: 'GOOGLE_SYNC_PENDING', preserveLocal: true });
}

export function googleCalendarRequestOptions(options = {}) {
  assertCalendarSyncLock();
  return { timeout: 15000, retry: false, ...options, ...(context.getStore()?.controller ? { signal: context.getStore().controller.signal } : {}) };
}

// A session lock spans committed local intent and remote I/O without a long DB
// transaction. PostgreSQL releases it on process/connection loss, across replicas.
export async function withCalendarSyncLock(task, { pool = getPool() } = {}) {
  if (context.getStore()) { assertCalendarSyncLock(); return task(); }
  const client = await pool.connect();
  const state = { lost: false, controller: new AbortController() };
  const onError = () => { state.lost = true; state.controller.abort(); };
  client.on('error', onError);
  let locked = false;
  let discard = false;
  try {
    const result = await client.query('SELECT pg_try_advisory_lock(20260907, 731) AS locked');
    locked = result.rows[0]?.locked === true;
    if (!locked) throw lockError();
    return await context.run(state, task);
  } finally {
    if (locked && !state.lost) {
      try { await client.query('SELECT pg_advisory_unlock(20260907, 731)'); }
      catch { discard = true; }
    }
    client.removeListener('error', onError);
    client.release(discard || state.lost);
  }
}
