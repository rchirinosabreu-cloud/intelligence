import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createPlatformLeagueRepository } from '../src/services/platformLeagueRepository.js';

const connectionString = briaTestDatabaseUrl();
test('PostgreSQL: restart preserves launch, pilot remains separate, monthly gift is atomic', { skip: !connectionString }, async () => {
  const database = new pg.Pool({ connectionString, max: 3 });
  const schema = `league_test_${randomUUID().replaceAll('-', '')}`;
  const sql = (await readFile(new URL('../scripts/sql/bria-league.sql', import.meta.url), 'utf8')).replaceAll('bria_memory', schema);
  const pool = { query: (text, args) => database.query(text.replaceAll('bria_memory', schema), args) };
  const repo = createPlatformLeagueRepository({ pool });
  try {
    // Upgrade a real weekly schema containing two historical gifts in the same month.
    await database.query(sql.split('-- El cupo mensual')[0]);
    await pool.query(`INSERT INTO bria_memory.league_run_kudos(run_id,week_key,giver_member_id,receiver_member_id,created_at)
      VALUES ('fresh-start-2026-11','2000-W02','previous','person','2000-01-10T15:00:00Z'),
             ('fresh-start-2026-11','2000-W03','previous','person','2000-01-17T15:00:00Z')`);
    await database.query(sql);
    assert.equal((await repo.kudosOfMonth('2000-01')).length, 2, 'upgrade preserves all existing gifts');
    await assert.rejects(repo.giveKudos({ giver_member_id: 'previous', receiver_member_id: 'person', note: '', created_at: new Date('2000-01-24T15:00:00Z') }), e => e.code === '23505');
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
    const attempts = await Promise.allSettled([3, 17].map(day => repo.giveKudos({ created_at: new Date(`${month}-${String(day).padStart(2, '0')}T15:00:00Z`), giver_member_id: 'giver', receiver_member_id: 'person', note: 'Gracias' })));
    assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(attempts.find(r => r.status === 'rejected').reason.code, '23505');
    assert.equal((await repo.kudosOfMonth(month)).length, 1);
    // November 30 and December 1 share an ISO week; UTC December 1 before 05:00 is still November.
    await repo.giveKudos({ giver_member_id: 'boundary', receiver_member_id: 'person', note: '', created_at: new Date('2026-11-30T15:00:00Z') });
    await assert.rejects(repo.giveKudos({ giver_member_id: 'boundary', receiver_member_id: 'person', note: '', created_at: new Date('2026-12-01T04:59:59Z') }), e => e.code === '23505');
    await repo.giveKudos({ giver_member_id: 'boundary', receiver_member_id: 'person', note: '', created_at: new Date('2026-12-01T05:00:00Z') });
    await database.query(sql);
    await assert.rejects(repo.giveKudos({ giver_member_id: 'boundary', receiver_member_id: 'person', note: '', created_at: new Date('2026-12-15T15:00:00Z') }), e => e.code === '23505');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM bria_memory.league_kudos')).rows[0].n, 1, 'pilot remains intact');
  } finally {
    await database.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await database.end();
  }
});
