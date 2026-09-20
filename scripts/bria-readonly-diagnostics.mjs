// Read-only diagnostics for the Bria autonomy loops (minutes, memory, Observer,
// content-plan reviews). Opens ONE `REPEATABLE READ READ ONLY` transaction with
// a statement timeout, runs the counts and rolls back. It never writes.
//
//   node scripts/bria-readonly-diagnostics.mjs            # JSON to stdout
//   node scripts/bria-readonly-diagnostics.mjs --brief    # one line per metric
//
// Uses DATABASE_URL from the environment (.env). Print the host first so the
// reader knows which database answered.
import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';

export const DIAGNOSTIC_QUERIES = {
  minutes_by_status: `SELECT status, COUNT(*)::int AS n FROM "MeetingMinute" WHERE "deletedAt" IS NULL GROUP BY status ORDER BY status`,
  minutes_trashed: `SELECT COUNT(*)::int AS n FROM "MeetingMinute" WHERE "deletedAt" IS NOT NULL`,
  minutes_failed_detail: `SELECT id, title, "meetingAt", "retryCount", LEFT("errorMessage", 120) AS error FROM "MeetingMinute" WHERE status = 'FAILED' AND "deletedAt" IS NULL ORDER BY "meetingAt" DESC LIMIT 10`,
  minutes_span: `SELECT MIN("meetingAt") AS first_meeting, MAX("meetingAt") AS last_meeting, COUNT(*)::int AS n FROM "MeetingMinute" WHERE "deletedAt" IS NULL`,
  minutes_organizers: `SELECT "organizerEmail", COUNT(*)::int AS n FROM "MeetingMinute" WHERE "deletedAt" IS NULL GROUP BY 1 ORDER BY 2 DESC`,
  meetings_per_week_last_12: `SELECT date_trunc('week', "meetingAt")::date AS week, COUNT(*)::int AS minutes FROM "MeetingMinute" WHERE "deletedAt" IS NULL AND "meetingAt" >= now() - interval '12 weeks' GROUP BY 1 ORDER BY 1`,
  calendar_fireflies_events_per_week_last_12: `SELECT date_trunc('week', "startAt")::date AS week, COUNT(*)::int AS events_with_fireflies FROM "OperationalEvent" WHERE "captureWithFireflies" = true AND "googleCancelled" = false AND "startAt" >= now() - interval '12 weeks' AND "startAt" <= now() GROUP BY 1 ORDER BY 1`,
  meetings_by_weekday_hour_bogota: `SELECT EXTRACT(ISODOW FROM ("meetingAt" AT TIME ZONE 'America/Bogota'))::int AS isodow, EXTRACT(HOUR FROM ("meetingAt" AT TIME ZONE 'America/Bogota'))::int AS hour, COUNT(*)::int AS n FROM "MeetingMinute" WHERE "deletedAt" IS NULL GROUP BY 1, 2 ORDER BY 1, 2`,
  processing_lag_minutes: `SELECT ROUND((percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("processedAt" - "meetingAt"))/60))::numeric, 1) AS p50_min, ROUND((percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("processedAt" - "meetingAt"))/60))::numeric, 1) AS p90_min, ROUND((MAX(EXTRACT(EPOCH FROM ("processedAt" - "meetingAt"))/60))::numeric, 1) AS max_min FROM "MeetingMinute" WHERE status = 'READY' AND "processedAt" IS NOT NULL AND "deletedAt" IS NULL`,
  action_items_total: `SELECT COALESCE(SUM(jsonb_array_length("actionItems")), 0)::int AS n FROM "MeetingMinute" WHERE status = 'READY' AND "deletedAt" IS NULL AND jsonb_typeof("actionItems") = 'array'`,
  action_items_per_minute: `SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY jsonb_array_length("actionItems")) AS p50, MAX(jsonb_array_length("actionItems"))::int AS max FROM "MeetingMinute" WHERE status = 'READY' AND "deletedAt" IS NULL AND jsonb_typeof("actionItems") = 'array'`,
  action_items_with_owner_or_date: `SELECT COUNT(*) FILTER (WHERE COALESCE(item->>'owner','') <> '')::int AS with_owner, COUNT(*) FILTER (WHERE COALESCE(item->>'dueDate','') <> '')::int AS with_due, COUNT(*)::int AS total FROM "MeetingMinute" m, jsonb_array_elements(m."actionItems") AS item WHERE m.status = 'READY' AND m."deletedAt" IS NULL AND jsonb_typeof(m."actionItems") = 'array'`,
  minutes_pdf_coverage: `SELECT COUNT(*) FILTER (WHERE "summaryPdfStorageKey" IS NOT NULL AND "analysisPdfStorageKey" IS NOT NULL)::int AS with_both_pdfs, COUNT(*)::int AS ready FROM "MeetingMinute" WHERE status = 'READY' AND "deletedAt" IS NULL`,
  observer_by_status: `SELECT status, "detectorKey", COUNT(*)::int AS n, COUNT(*) FILTER (WHERE "lastActionById" IS NOT NULL)::int AS with_human_action FROM "BriaObserverSignal" GROUP BY 1, 2 ORDER BY 1, 2`,
  observer_detector_state: `SELECT "detectorKey", "activatedAt", "lastScannedAt" FROM "BriaObserverDetectorState"`,
  memory_sources: `SELECT status, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE "clientId" IS NULL)::int AS sin_cliente, MAX("indexedAt") AS last_indexed FROM "BriaMemorySource" WHERE "deletedAt" IS NULL GROUP BY status`,
  memory_chunks: `SELECT COUNT(*)::int AS fragmentos, COUNT(*) FILTER (WHERE embedding IS NULL)::int AS sin_embedding, COALESCE(SUM("tokenEstimate"), 0)::bigint AS tokens_estimados, COUNT(*) FILTER (WHERE section = 'TRANSCRIPT')::int AS transcript_chunks FROM "BriaMemoryChunk"`,
  plans_review_state: `SELECT "briaReviewState", COUNT(*)::int AS n FROM "ContentPlan" GROUP BY 1 ORDER BY 1`,
  plans_failed_detail: `SELECT id, "briaReviewAttempts", LEFT("briaReviewError", 120) AS error, "briaReviewStartedAt" FROM "ContentPlan" WHERE "briaReviewState" = 'FAILED' ORDER BY "briaReviewStartedAt" DESC NULLS LAST LIMIT 10`,
  reviews_by_trigger: `SELECT trigger, status, COUNT(*)::int AS n FROM "ContentPlanReview" GROUP BY 1, 2 ORDER BY 1, 2`,
  reviews_last_30d: `SELECT COUNT(*)::int AS n, MIN("startedAt") AS first, MAX("startedAt") AS last FROM "ContentPlanReview" WHERE "startedAt" >= now() - interval '30 days'`,
  findings_by_status: `SELECT status, COUNT(*)::int AS n FROM "ContentPlanReviewFinding" GROUP BY 1 ORDER BY 1`,
  findings_resolved_with_verification: `SELECT COUNT(*)::int AS n FROM "ContentPlanReviewFinding" WHERE status = 'RESOLVED' AND verification IS NOT NULL`,
  criteria: `SELECT status, scope, COUNT(*)::int AS n FROM "ClientEditorialCriterion" GROUP BY 1, 2 ORDER BY 1, 2`,
  criterion_discovery: `SELECT state, COUNT(*)::int AS n FROM "ClientCriterionDiscovery" GROUP BY 1`,
  agency_context_legacy: `SELECT status, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE "vectorEmbeddings" IS NULL)::int AS sin_vector FROM "AgencyContext" GROUP BY 1`,
  clients_total: `SELECT COUNT(*)::int AS n FROM "Client"`,
  tasks_by_status: `SELECT status, COUNT(*)::int AS n FROM "Task" GROUP BY 1 ORDER BY 1`,
  notifications_last_7d: `SELECT COUNT(*)::int AS n, COUNT(DISTINCT "userId")::int AS users FROM "Notification" WHERE "createdAt" >= now() - interval '7 days'`
};

export async function runDiagnostics({ connectionString, queries = DIAGNOSTIC_QUERIES, statementTimeoutMs = 20000 } = {}) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString, statement_timeout: statementTimeoutMs, application_name: 'bria-readonly-diagnostics' });
  const out = { host: new URL(connectionString).host, ranAt: new Date().toISOString(), results: {}, errors: {} };
  await client.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    for (const [name, sql] of Object.entries(queries)) {
      try {
        const { rows } = await client.query(sql);
        out.results[name] = rows;
      } catch (error) {
        out.errors[name] = error.message;
        await client.query('ROLLBACK');
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      }
    }
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
  return out;
}

const formatBrief = (out) => {
  const lines = [`Base: ${out.host} (${out.ranAt})`];
  for (const [name, rows] of Object.entries(out.results)) {
    lines.push(`${name}: ${JSON.stringify(rows)}`);
  }
  for (const [name, message] of Object.entries(out.errors)) {
    lines.push(`${name}: ERROR ${message}`);
  }
  return lines.join('\n');
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = await runDiagnostics({ connectionString: process.env.DATABASE_URL });
  console.log(process.argv.includes('--brief') ? formatBrief(out) : JSON.stringify(out, null, 2));
}
