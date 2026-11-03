import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createPlatformLeagueRepository } from '../src/services/platformLeagueRepository.js';

const connectionString = briaTestDatabaseUrl();
test('PostgreSQL: weekly gifts and meeting winners are atomic, old points and the launch survive the upgrade', { skip: !connectionString }, async () => {
 const database=new pg.Pool({connectionString,max:3});const schema='league_test_'+randomUUID().replaceAll('-','');
 const sql=(await readFile(new URL('../scripts/sql/bria-league.sql',import.meta.url),'utf8')).replaceAll('bria_memory',schema);
 const pool={query:(text,args)=>database.query(text.replaceAll('bria_memory',schema),args)};
 const repo=createPlatformLeagueRepository({pool});
 try {
  await database.query(sql.split('-- Cupo semanal')[0]);
  await pool.query(`INSERT INTO bria_memory.league_run_kudos(run_id,week_key,giver_member_id,receiver_member_id,created_at)
   VALUES('fresh-start-2026-11','2026-W49','legacy','person','2026-11-30T15:00:00Z'),('fresh-start-2026-11','2026-W49','legacy','person','2026-12-01T15:00:00Z')`);
  const launch=await repo.startedAt();await database.query(sql);await database.query(sql);
  assert.equal((await repo.startedAt()).getTime(),launch.getTime());
  assert.equal((await repo.kudosOfMonth('2026-11'))[0].points,10,'historical ten-point gifts keep their value');
  assert.equal((await repo.kudosOfMonth('2026-12')).length,1);
  const give=(who,date)=>repo.giveKudos({giver_member_id:who,receiver_member_id:'person',note:'Gracias',created_at:new Date(date)});
  await assert.rejects(give('legacy','2026-12-02T15:00:00Z'),e=>e.code==='23505');
  const gifts=await Promise.allSettled(['2026-11-03T15:00:00Z','2026-11-04T15:00:00Z'].map(date=>give('giver',date)));
  assert.equal(gifts.filter(r=>r.status==='fulfilled').length,1);assert.equal(gifts.find(r=>r.status==='fulfilled').value.points,5);
  assert.equal(gifts.find(r=>r.status==='rejected').reason.code,'23505');
  await assert.rejects(give('giver','2026-11-09T04:59:59Z'),e=>e.code==='23505');
  await give('giver','2026-11-09T05:00:00Z');
  assert.equal((await repo.givenInWeek('giver','2026-W46')).points,5);
  const meetings=await Promise.allSettled(['person','other'].map(member_id=>repo.awardMeeting({week_key:'2026-W45',day_key:'2026-11-03',member_id,awarded_by:'admin'})));
  assert.equal(meetings.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(meetings.find(r=>r.status==='rejected').reason.code,'23505');
  assert.equal((await repo.meetingsOfMonth('2026-11'))[0].awarded_by,'admin');
  await database.query(sql);
  assert.equal((await repo.kudosOfMonth('2026-11')).length,3);
 } finally {await database.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await database.end();}
});
