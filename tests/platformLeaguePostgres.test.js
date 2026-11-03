import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createPlatformLeagueRepository } from '../src/services/platformLeagueRepository.js';

const connectionString = briaTestDatabaseUrl();
test('PostgreSQL: restart preserves launch, pilot remains separate, weekly gift is atomic', { skip: !connectionString }, async () => {
  const database = new pg.Pool({ connectionString, max: 3 });
  const schema = `league_test_${randomUUID().replaceAll('-', '')}`;
  const sql = (await readFile(new URL('../scripts/sql/bria-league.sql', import.meta.url), 'utf8')).replaceAll('bria_memory', schema);
  const pool = { query: (text, args) => database.query(text.replaceAll('bria_memory', schema), args) };
  const repo = createPlatformLeagueRepository({ pool });
  try {
    await database.query(sql);
    const launch = await repo.startedAt();
    await database.query(sql);
    assert.equal((await repo.startedAt()).getTime(), launch.getTime());
    const month = new Date(launch.getTime() - 5 * 3600000).toISOString().slice(0, 7);
    const day = `${month}-01`;
    await pool.query("INSERT INTO bria_memory.league_days(day_key,member_id,habits) VALUES ($1,'person','{\"RELOJ\":true}')", [day]);
    await pool.query("INSERT INTO bria_memory.league_kudos(week_key,giver_member_id,receiver_member_id) VALUES ('2026-W45','giver','person')");
    assert.deepEqual(await repo.computedDays(month), []);
    assert.deepEqual(await repo.daysOfMonth(month, { before: `${month}-31` }), []);
    assert.deepEqual(await repo.kudosOfMonth(month), []);
    await repo.saveDays([{ day_key: day, member_id: 'person', habits: { RELOJ: false }, evidence: {}, extras: {} }]);
    await repo.saveDays([{ day_key: day, member_id: 'person', habits: { RELOJ: true }, evidence: {}, extras: {} }]);
    assert.deepEqual(await repo.computedDays(month), [day]);
    assert.equal((await repo.daysOfMonth(month, { before: `${month}-31` })).length, 1);
    const attempts = await Promise.allSettled([1, 2].map(() => repo.giveKudos({ week_key: '2026-W45', giver_member_id: 'giver', receiver_member_id: 'person', note: 'Gracias' })));
    assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(attempts.find(r => r.status === 'rejected').reason.code, '23505');
    assert.equal((await repo.kudosOfMonth(month)).length, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM bria_memory.league_kudos')).rows[0].n, 1, 'pilot remains intact');
  } finally {
    await database.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await database.end();
  }
});
