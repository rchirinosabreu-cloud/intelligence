import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const bootstrapPath = 'scripts/ensure-quality-streak-schema.js';
const loadBootstrap = async () => {
  assert.equal(existsSync(bootstrapPath), true, 'quality streak bootstrap must exist');
  return import('../scripts/ensure-quality-streak-schema.js');
};

test('quality streak tracks an explicit observation start without defaults or changes to legacy history', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const model = schema.match(/model SystemStreak \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(model);
  for (const field of ['cleanSinceAt', 'trackingStartedAt']) {
    assert.match(model, new RegExp(`${field}\\s+DateTime\\?\\s+@db\\.Timestamptz\\(\\)`));
    assert.doesNotMatch(model.split('\n').find(line => line.includes(field)), /@default/);
  }
  assert.match(model, /highestStreak\s+Int\s+@default\(0\)/);
  assert.match(model, /lastResetAt\s+DateTime\?/);
  assert.match(model, /lastIncrementedAt\s+DateTime\?/);
  assert.match(schema, /provider\s*=\s*"postgresql"/);
});

test('server startup requires the additive quality streak bootstrap first', () => {
  const { scripts } = JSON.parse(readFileSync('package.json', 'utf8'));
  const steps = scripts.start.split(' && ');
  const bootstrapIndex = steps.indexOf(`node ${bootstrapPath}`);
  assert.ok(bootstrapIndex >= 0);
  assert.ok(bootstrapIndex < steps.indexOf('node server.js'));
});

test('bootstrap only adds nullable columns under a transaction and never invents historical streaks', async () => {
  const { ensureQualityStreakSchema } = await loadBootstrap();
  const queries = [];
  await ensureQualityStreakSchema({ query: async sql => { queries.push(sql); } });
  assert.equal(queries[0], 'BEGIN');
  assert.equal(queries.at(-1), 'COMMIT');
  const ddl = queries.join('\n');
  assert.match(ddl, /SET LOCAL lock_timeout/);
  assert.match(ddl, /SET LOCAL statement_timeout/);
  assert.match(ddl, /pg_advisory_xact_lock/);
  for (const field of ['cleanSinceAt', 'trackingStartedAt']) {
    assert.match(ddl, new RegExp(`ADD COLUMN IF NOT EXISTS "${field}" TIMESTAMPTZ`));
  }
  assert.doesNotMatch(ddl, /\b(UPDATE|DELETE|INSERT|TRUNCATE|DROP|DEFAULT|NOT NULL)\b/i);
  assert.doesNotMatch(ddl, /highestStreak|lastResetAt|lastIncrementedAt|currentStreak/);
});

test('bootstrap rolls back and propagates a schema error so startup cannot falsely succeed', async () => {
  const { ensureQualityStreakSchema } = await loadBootstrap();
  const queries = [];
  const failure = new Error('database permission denied');
  await assert.rejects(ensureQualityStreakSchema({ query: async sql => {
    queries.push(sql);
    if (sql.includes('ALTER TABLE')) throw failure;
  } }), error => error === failure);
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal(queries.includes('COMMIT'), false);
});
