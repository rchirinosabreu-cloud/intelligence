// One supervised pass of the retention sweep, for when waiting for the timer
// is not what you want. It deletes for real, so it asks for two separate
// confirmations: the same switch the scheduler obeys, and an explicit word on
// the command line. Neither alone is enough.
//
//   node scripts/run-task-attachment-retention.js --confirm BORRAR
import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_RETENTION_DAYS,
  retentionEnabled,
  retentionDaysFrom,
  reportRetentionPlan,
  runRetentionSweep,
  purgeColumnsPresent,
} from '../src/services/taskAttachmentRetentionService.js';

const CONFIRM_WORD = 'BORRAR';

export function confirmationGiven(argv) {
  const index = argv.indexOf('--confirm');
  return index !== -1 && argv[index + 1] === CONFIRM_WORD;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fail = (message) => { console.error(message); process.exitCode = 1; };
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

  if (!retentionEnabled(process.env)) {
    fail('La limpieza está desactivada. Pon TASK_ATTACHMENT_RETENTION_ENABLED=true antes de ejecutarla a mano.');
  } else if (!confirmationGiven(process.argv)) {
    fail(`Esto borra archivos de forma permanente. Repite el comando añadiendo:  --confirm ${CONFIRM_WORD}`);
  } else {
    const retentionDays = retentionDaysFrom(process.env);
    const bucket = process.env.AWS_S3_BUCKET_NAME || 'chat-evidence';
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, max: 2 });
    try {
      const target = new URL(process.env.DATABASE_URL);
      console.log(`Base: ${target.host}${target.pathname}`);
      console.log(`Bucket: ${bucket}`);
      console.log(`Plazo: ${retentionDays} días desde que la tarea se marcó como realizada.\n`);

      if (!(await purgeColumnsPresent(pool))) {
        fail('Faltan las columnas de seguimiento. Despliega primero; sin ellas no se borra nada.');
      } else {
        const plan = await reportRetentionPlan(pool, { retentionDays, bucket, limit: 5000, tracked: true });
        console.log(`Se van a borrar ${plan.purgeable.length} archivos de conversaciones de pendientes cerrados.`);
        if (!plan.purgeable.length) {
          console.log('No hay nada que borrar.');
        } else {
          const { deleteFromS3 } = await import('../src/services/s3Service.js');
          const result = await runRetentionSweep(
            pool,
            { remove: (key) => deleteFromS3(key) },
            { retentionDays, bucket, limit: 5000, tracked: true },
          );
          console.log(`\nReclamados: ${result.claimed}`);
          console.log(`Borrados:   ${result.purged}`);
          console.log(`Reintentables (fallo de almacenamiento, siguen disponibles): ${result.restored}`);
          if (result.restored)
            console.log('Los reintentables volvieron a quedar activos; la siguiente pasada los intentará de nuevo.');
        }
      }
    } catch (error) {
      fail(`[Task attachment retention] Falló: ${error.message}`);
    } finally {
      await pool.end();
    }
  }
}
