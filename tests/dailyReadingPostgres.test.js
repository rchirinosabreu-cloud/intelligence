import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createDailyReadingRepository } from '../src/services/dailyReadingRepository.js';
import { createBriaProactiveRepository } from '../src/services/briaProactiveRepository.js';

// La memoria del tiempo contra PostgreSQL real (19 de octubre de 2026). Solo corre con la base aislada de pruebas;
// usa días de 2099 para no cruzarse con nada y los borra al terminar.

const connectionString = briaTestDatabaseUrl();

test('real PostgreSQL: one photo per day and subject, its history and series, one reading and one delivery per day', { skip: !connectionString }, async () => {
  const pool = new pg.Pool({ connectionString, max: 2 });
  const days = ['2099-01-05', '2099-01-06', '2099-01-07'];
  try {
    for (let i = 0; i < 2; i += 1) {
      await pool.query(await readFile(new URL('../scripts/sql/bria-daily-reading.sql', import.meta.url), 'utf8'));
      await pool.query(await readFile(new URL('../scripts/sql/bria-proactive.sql', import.meta.url), 'utf8'));
    }
    const repo = createDailyReadingRepository({ pool });
    const metrics = (level, hoursMs) => ({ level, reasons: [], awaitingApproval: 1, hoursMs });
    await repo.saveSnapshot(days[0], { clients: [{ id: 'pg-c1', name: 'Cuenta', slug: 'cuenta', pmId: 'pm', metrics: metrics('green', 0) }], people: [{ id: 'pg-m1', name: 'Persona', metrics: { open: 3 } }] });
    await repo.saveSnapshot(days[1], { clients: [{ id: 'pg-c1', name: 'Cuenta', slug: 'cuenta', pmId: 'pm', metrics: metrics('yellow', 3600000) }], people: [] });
    // Repetir la foto del mismo día la reemplaza, no la duplica.
    await repo.saveSnapshot(days[1], { clients: [{ id: 'pg-c1', name: 'Cuenta renombrada', slug: 'cuenta', pmId: 'pm', metrics: metrics('red', 7200000) }], people: [] });
    assert.equal(await repo.hasSnapshot(days[1]), true);
    assert.equal(await repo.hasSnapshot(days[2]), false);
    const today = await repo.snapshot(days[1]);
    assert.deepEqual(today.clients, [{ id: 'pg-c1', name: 'Cuenta renombrada', slug: 'cuenta', pmId: 'pm', metrics: metrics('red', 7200000) }]);
    const history = await repo.history(days[2], 10);
    assert.deepEqual(history.map((row) => [row.day, row.clients['pg-c1']?.level, row.people['pg-m1']?.open ?? null]), [[days[0], 'green', 3], [days[1], 'red', null]]);
    assert.deepEqual((await repo.series('CLIENT', 'pg-c1', { days: 10, until: days[1] })).map((row) => row.metrics.level), ['green', 'red']);

    const reading = { day: days[1], baseDay: days[0], source: 'REGLA', decisions: [{ id: `${days[1]}:1` }], summary: { historyDays: 2 } };
    assert.deepEqual(await repo.saveReading(days[1], reading, { digest: 'd' }), reading);
    assert.deepEqual(await repo.saveReading(days[1], { ...reading, source: 'MODELO' }), reading, 'a reading is written once per day');
    assert.equal((await repo.reading(days[1])).source, 'REGLA');

    // El libro de decisiones: una fila por decisión y persona; anotar de nuevo reemplaza; el desenlace se escribe una vez.
    const decision = { id: `${days[1]}:1`, title: 'Revisar la cuenta', kind: 'HACER', subjectType: 'CLIENT', subjectId: 'pg-c1', subjectName: 'Cuenta', evidence: ['CUENTA_EMPEORO:pg-c1'] };
    const user = { ref: 'pg-user', name: 'Persona' };
    const first = await repo.recordDecision({ decision, dayKey: days[1], user, verdict: 'NO', note: 'hoy no' });
    const second = await repo.recordDecision({ decision, dayKey: days[1], user, verdict: 'HECHO', note: null });
    assert.equal(first.id, second.id, 'same decision and person: one row');
    assert.deepEqual([second.verdict, second.note, second.outcome], ['HECHO', null, null]);
    assert.deepEqual((await repo.pendingOutcomes(days[2])).map((e) => e.decisionId), [decision.id]);
    assert.equal(await repo.setOutcome(second.id, { outcome: 'SIGUE', text: 'Cuenta sigue en rojo.', day: days[2] }), true);
    assert.equal(await repo.setOutcome(second.id, { outcome: 'MEJORO', text: 'x', day: days[2] }), false, 'an outcome is written once');
    assert.deepEqual((await repo.recentDecisions(days[2], { days: 10, userRef: 'pg-user' })).map((e) => [e.verdict, e.outcome, e.outcomeDay]), [['HECHO', 'SIGUE', days[2]]]);
    assert.deepEqual((await repo.readingsBefore(days[2], 10)).map((r) => r.day), [days[1]]);

    const proactive = createBriaProactiveRepository({ pool });
    const conversationId = '00000000-0000-4000-8000-000000000001';
    await proactive.recordMorningBriefDelivery(days[1], 'pg-user', conversationId);
    await proactive.recordMorningBriefDelivery(days[1], 'pg-user', '00000000-0000-4000-8000-000000000002');
    assert.equal((await proactive.morningBriefDelivery(days[1], 'pg-user')).conversationId, conversationId, 'the first delivery stays');
  } finally {
    await pool.query('DELETE FROM bria_memory.agency_snapshots WHERE day_key = ANY($1)', [days]).catch(() => {});
    await pool.query('DELETE FROM bria_memory.daily_readings WHERE day_key = ANY($1)', [days]).catch(() => {});
    await pool.query('DELETE FROM bria_memory.decision_log WHERE day_key = ANY($1)', [days]).catch(() => {});
    await pool.query('DELETE FROM bria_memory.morning_brief_deliveries WHERE day_key = ANY($1)', [days]).catch(() => {});
    await pool.end();
  }
});
