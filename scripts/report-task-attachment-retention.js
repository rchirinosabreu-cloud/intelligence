// Read-only report of what the retention sweep would delete. It opens no
// write transaction and never touches storage, so it is safe to point at any
// database, including production, to size the problem before enabling anything.
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_RETENTION_DAYS,
  reportRetentionPlan,
  retentionCutoff,
} from '../src/services/taskAttachmentRetentionService.js';

const REASONS = {
  'task-not-completed': 'la tarea no está realizada',
  'no-completion-date': 'no tiene fecha de finalización',
  'inside-window': 'todavía dentro del plazo',
  'already-handled': 'ya procesado antes',
  'not-our-storage': 'el archivo no está en nuestro bucket',
  'missing-row': 'registro vacío',
};

export function formatRetentionReport(plan, { retentionDays, cutoff, bucket }) {
  const lines = [
    `Plazo: ${retentionDays} días desde que la tarea se marcó como realizada.`,
    `Se borrarían archivos de tareas finalizadas antes de ${cutoff.toISOString()}.`,
    `Bucket: ${bucket}`,
    '',
    `Candidatos revisados: ${plan.scanned}`,
    `A BORRAR: ${plan.purgeable.length}`,
  ];
  const kept = Object.entries(plan.kept);
  if (kept.length) {
    lines.push('Se conservan:');
    for (const [reason, count] of kept.sort((a, b) => b[1] - a[1]))
      lines.push(`  ${count}  ${REASONS[reason] || reason}`);
  }
  if (plan.purgeable.length) {
    lines.push('', 'Primeros archivos que se borrarían:');
    for (const item of plan.purgeable.slice(0, 15))
      lines.push(`  ${item.storageKey}`);
    if (plan.purgeable.length > 15)
      lines.push(`  … y ${plan.purgeable.length - 15} más`);
  }
  lines.push('', 'Este informe no borró nada.');
  return lines.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const retentionDays = Number(process.env.TASK_ATTACHMENT_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  const limit = Number(process.env.TASK_ATTACHMENT_RETENTION_REPORT_LIMIT || 5000);
  const bucket = process.env.AWS_S3_BUCKET_NAME || 'chat-evidence';
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!Number.isFinite(retentionDays) || retentionDays < 1)
    throw new Error('TASK_ATTACHMENT_RETENTION_DAYS must be a positive number of days');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, max: 2 });
  try {
    const now = new Date();
    const plan = await reportRetentionPlan(pool, { now, retentionDays, limit, bucket });
    console.log(formatRetentionReport(plan, { retentionDays, cutoff: retentionCutoff(now, retentionDays), bucket }));
    if (plan.scanned === limit)
      console.log(`\nAviso: se alcanzó el límite de ${limit} filas revisadas; puede haber más.`);
  } catch (error) {
    console.error('[Task attachment retention] Report failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
