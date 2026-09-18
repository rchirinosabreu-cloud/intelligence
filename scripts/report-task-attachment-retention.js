// Read-only report of what the retention sweep would delete. It opens no
// write transaction and never touches storage, so it is safe to point at any
// database, including production, to size the problem before enabling anything.
// Reads .env so an operator can run it without exporting anything. That points
// it at the real database by default, which is the point: it only reads.
import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_RETENTION_DAYS,
  collectRetentionCandidates,
  summarizePurgePlan,
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
  if (plan.byPlacement) {
    lines.push(
      '',
      'De los que se borrarían, dónde están colgados:',
      `  ${plan.byPlacement.conversation}  en la conversación del pendiente (un comentario)`,
      `  ${plan.byPlacement.card}  sueltos en la card, sin comentario`,
    );
    for (const [category, count] of plan.byPlacement.categories)
      lines.push(`       de esos, ${count} con categoría ${category}`);
  }
  if (plan.skippedOrigins?.length) {
    lines.push(
      '',
      'De los descartados por no estar en el bucket, de dónde vienen:',
      '(si alguno es un bucket nuestro con otro nombre, esos archivos nunca se limpiarían)',
    );
    for (const [origin, count] of plan.skippedOrigins)
      lines.push(`  ${count}  ${origin}`);
  }
  lines.push('', 'Este informe no borró nada.');
  return lines.join('\n');
}

/** Where the files we refused to touch actually live. Only the origin and the
 * first path segment, never the rest of the path. */
export function skippedOrigins(rows, bucket) {
  const counts = new Map();
  for (const row of rows) {
    let label = 'url ilegible';
    try {
      const url = new URL(row.url);
      const first = url.pathname.split('/').filter(Boolean)[0] || '';
      label = `${url.host}/${first}`;
    } catch { /* keep the fallback label */ }
    if (label.endsWith(`/${bucket}`)) continue;
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
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
    const rows = await collectRetentionCandidates(pool, { now, retentionDays, limit });
    const plan = summarizePurgePlan(rows, { now, retentionDays, bucket });
    plan.skippedOrigins = skippedOrigins(rows, bucket);

    // A comment attachment and a file dropped straight on the card are not the
    // same thing to the person who uploaded them; count them apart.
    const byId = new Map(rows.map((row) => [row.id, row]));
    const doomed = plan.purgeable.map((item) => byId.get(item.id)).filter(Boolean);
    const onCard = doomed.filter((row) => !row.commentId);
    const categories = new Map();
    for (const row of onCard)
      categories.set(row.category, (categories.get(row.category) || 0) + 1);
    plan.byPlacement = {
      conversation: doomed.length - onCard.length,
      card: onCard.length,
      categories: [...categories.entries()].sort((a, b) => b[1] - a[1]),
    };
    // Say out loud which database was read, so nobody mistakes one for another.
    const target = new URL(process.env.DATABASE_URL);
    console.log(`Base consultada: ${target.host}${target.pathname}\n`);
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
