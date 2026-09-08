import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';

const script = new URL('../scripts/ensure-quotation-proposals-schema.js', import.meta.url);

test('production startup prepares the optional proposal column before serving requests', async () => {
  const { scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.ok(scripts.start.includes('node scripts/ensure-quotation-proposals-schema.js &&'));
  assert.ok(scripts.start.indexOf('ensure-quotation-proposals-schema.js') < scripts.start.indexOf('node server.js'));
});

test('proposal schema bootstrap is additive, transactional and fails closed', async () => {
  assert.equal(await access(script).then(() => true, () => false), true, 'The additive schema bootstrap must exist');
  const { ensureQuotationProposalsSchema } = await import(script.href);
  const statements = [];
  const client = { query: async sql => { statements.push(sql); return { rows: [{ data_type: 'jsonb', is_nullable: 'YES' }] }; } };
  await ensureQuotationProposalsSchema(client);
  assert.equal(statements[0], 'BEGIN');
  assert.equal(statements.at(-1), 'COMMIT');
  assert.match(statements.join('\n'), /lock_timeout/);
  assert.match(statements.join('\n'), /statement_timeout/);
  assert.match(statements.join('\n'), /ADD COLUMN IF NOT EXISTS "proposal_details" JSONB/);
  assert.doesNotMatch(statements.join('\n'), /\b(DROP|DELETE|UPDATE|TRUNCATE)\b/);
  const failure = new Error('DDL lock timeout');
  const failedStatements = [];
  await assert.rejects(ensureQuotationProposalsSchema({ query: async sql => {
    failedStatements.push(sql);
    if (sql.includes('ALTER TABLE')) throw failure;
    return { rows: [] };
  } }), error => error === failure);
  assert.equal(failedStatements.at(-1), 'ROLLBACK');
  assert.ok(!failedStatements.includes('COMMIT'));
});
