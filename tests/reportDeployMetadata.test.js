import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { REPORT_EVIDENCE_PIPELINE_VERSION } from '../src/routes/api/reportEvidenceRoutes.js';

// Execute the route's actual metadata code with isolated environment values.
// Importing the full Express module would initialize Prisma and storage clients.
const route = await fs.readFile(new URL('../src/routes/api/reports.js', import.meta.url), 'utf8');
const definition = route.match(/export function getReportPipelineStatus\([^)]*\)\s*\{[\s\S]*?^\}/m)?.[0];
assert.ok(definition, 'The route must expose its deployment metadata');
const commitDeclaration = route.match(/^const REPORT_DEPLOY_COMMIT = .*;$/m)?.[0] || '';
const statusFor = env => JSON.parse(JSON.stringify(vm.runInNewContext(
  `${commitDeclaration}\n${definition.replace(/^export /, '')}\ngetReportPipelineStatus();`,
  { process: { env }, REPORT_PIPELINE_VERSION: REPORT_EVIDENCE_PIPELINE_VERSION }
)));

test('report metadata identifies the Railway commit when no explicit override is configured', () => {
  assert.deepEqual(statusFor({ RAILWAY_GIT_COMMIT_SHA: 'a'.repeat(40) }), {
    pipelineVersion: 'report-evidence-2026-09-16.1', commit: 'a'.repeat(40)
  });
});

test('an explicit report deployment commit takes precedence over Railway metadata', () => {
  assert.equal(statusFor({ REPORT_DEPLOY_COMMIT: 'b'.repeat(40), RAILWAY_GIT_COMMIT_SHA: 'a'.repeat(40) }).commit, 'b'.repeat(40));
});

test('an empty override falls back to Railway and missing metadata identifies development', () => {
  assert.equal(statusFor({ REPORT_DEPLOY_COMMIT: '', RAILWAY_GIT_COMMIT_SHA: 'a'.repeat(40) }).commit, 'a'.repeat(40));
  assert.equal(statusFor({}).commit, 'development');
  assert.equal(statusFor({ REPORT_DEPLOY_COMMIT: '', RAILWAY_GIT_COMMIT_SHA: '' }).commit, 'development');
});
