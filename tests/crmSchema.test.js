import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const script = new URL('../scripts/ensure-crm-schema.js', import.meta.url);
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('production startup prepares the CRM tables before serving requests', async () => {
  const { scripts } = JSON.parse(await read('package.json'));
  assert.ok(scripts.start.includes('node scripts/ensure-crm-schema.js &&'));
  assert.ok(scripts.start.indexOf('ensure-crm-schema.js') < scripts.start.indexOf('node server.js'));
});

test('CRM schema bootstrap is additive, transactional and fails closed', async () => {
  assert.equal(await access(script).then(() => true, () => false), true);
  const { ensureCrmSchema } = await import(script.href);
  const statements = [];
  await ensureCrmSchema({ query: async sql => { statements.push(sql); return { rows: [] }; } });
  const sql = statements.join('\n');
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'COMMIT');
  assert.match(sql, /lock_timeout/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "CrmLead"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "CrmActivity"/);
  assert.match(sql, /"legacyCode" TEXT UNIQUE/);
  assert.match(sql, /"ownerId" TEXT REFERENCES "TeamMember"\(id\)/);
  assert.match(sql, /"clientId" TEXT REFERENCES "Client"\(id\)/);
  assert.match(sql, /"quotationId" TEXT REFERENCES "Quotation"\(id\)/);
  assert.match(sql, /"leadId" TEXT NOT NULL REFERENCES "CrmLead"\(id\)/);
  assert.match(sql, /UNIQUE\("authorId","requestId"\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "CrmLead_followup_idx"/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "CrmActivity_lead_idx"/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "CrmRequest"/);
  assert.match(sql, /"leadId" TEXT NOT NULL UNIQUE REFERENCES "CrmLead"\(id\)/);
  assert.match(sql, /ALTER TABLE "Quotation" ADD COLUMN IF NOT EXISTS "lead_id" TEXT REFERENCES "CrmLead"\(id\)/);
  assert.doesNotMatch(sql, /\b(DROP|DELETE|UPDATE|TRUNCATE)\b/);

  const failure = new Error('DDL lock timeout');
  const failed = [];
  await assert.rejects(ensureCrmSchema({ query: async sql => {
    failed.push(sql);
    if (sql.includes('CREATE TABLE')) throw failure;
    return { rows: [] };
  } }), error => error === failure);
  assert.equal(failed.at(-1), 'ROLLBACK');
  assert.ok(!failed.includes('COMMIT'));
});

test('the Prisma model and the permission key exist for the CRM module', async () => {
  const schema = await read('prisma/schema.prisma');
  assert.match(schema, /model CrmLead \{/);
  assert.match(schema, /model CrmActivity \{/);
  assert.match(schema, /modulePermissions[^\n]*\\"crm\\": false/);
  const team = await read('src/routes/api/team.js');
  assert.match(team, /crm:\s*false/);
  const teamUi = await read('src/components/modules/Team.jsx');
  assert.match(teamUi, /crm:\s*"CRM"/);
  const sidebar = await read('src/components/layout/Sidebar.jsx');
  assert.match(sidebar, /path:\s*'\/crm',\s*moduleKey:\s*'crm'/);
});
