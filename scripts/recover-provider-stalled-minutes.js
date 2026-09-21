// Gives another chance to the minutes that never got one: those whose analysis
// failed because the AI provider was unavailable (no credits, quota, 5xx) and
// spent their three attempts against a wall, so the sweep skips them forever.
//
//   node scripts/recover-provider-stalled-minutes.js              # only reports
//   node scripts/recover-provider-stalled-minutes.js --confirm REINTENTAR
//
// It never touches a minute that failed on its own merits (an empty transcript,
// for instance), nor one in the trash or excluded. It changes no content: it
// only clears the attempt counter so the normal sweep picks the minute up again.
import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { isProviderStalledMinute } from '../src/services/minuteAutomationService.js';

const CONFIRM_WORD = 'REINTENTAR';

export const confirmationGiven = (argv) => {
  const index = argv.indexOf('--confirm');
  return index !== -1 && argv[index + 1] === CONFIRM_WORD;
};

export const selectStalledMinutes = (rows = []) => rows.filter(isProviderStalledMinute);

const describe = (minute) => [
  `  · ${minute.title || 'Sin título'} (${minute.id})`,
  `    reunión: ${minute.meetingAt?.toISOString?.() || minute.meetingAt}`,
  `    estado: ${minute.status}, intentos: ${minute.retryCount}`,
  `    causa: ${String(minute.errorCode || minute.errorMessage || '').slice(0, 160)}`
].join('\n');

export const runRecovery = async ({ connectionString, apply = false, logger = console } = {}) => {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString, statement_timeout: 20000, application_name: 'recover-stalled-minutes' });
  await client.connect();
  try {
    const { rows } = await client.query(
      `SELECT "id", "title", "meetingAt", "status", "retryCount", "errorCode", "errorMessage", "deletedAt"
         FROM "MeetingMinute"
        WHERE "status" IN ('FAILED', 'PENDING_PROVIDER') AND "deletedAt" IS NULL
        ORDER BY "meetingAt" DESC`
    );
    const stalled = selectStalledMinutes(rows);
    logger.log(`Minutas detenidas por el proveedor: ${stalled.length} de ${rows.length} no terminadas.`);
    for (const minute of stalled) logger.log(describe(minute));
    if (!stalled.length) return { found: 0, recovered: 0 };
    if (!apply) {
      logger.log(`\nSimulación: no se cambió nada. Repite con  --confirm ${CONFIRM_WORD}  para reintentarlas.`);
      return { found: stalled.length, recovered: 0 };
    }
    const { rowCount } = await client.query(
      `UPDATE "MeetingMinute"
          SET "status" = 'PENDING_PROVIDER', "retryCount" = 0, "lastSeenAt" = NOW()
        WHERE "id" = ANY($1::text[])`,
      [stalled.map((minute) => minute.id)]
    );
    logger.log(`\n${rowCount} minutas vuelven a la cola. El barrido automático las procesará en el próximo ciclo.`);
    return { found: stalled.length, recovered: rowCount };
  } finally {
    await client.end().catch(() => {});
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = new URL(process.env.DATABASE_URL);
  console.log(`Base: ${target.host}${target.pathname}`);
  await runRecovery({ connectionString: process.env.DATABASE_URL, apply: confirmationGiven(process.argv) });
}
