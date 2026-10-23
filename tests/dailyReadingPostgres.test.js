import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { briaTestDatabaseUrl } from './support/briaTestDatabase.js';
import { createDailyReadingRepository } from '../src/services/dailyReadingRepository.js';
import { createBriaProactiveRepository } from '../src/services/briaProactiveRepository.js';
import { AUDIT_TABLES, ensureAuditImmutability } from '../src/lib/auditImmutability.js';

// La memoria del tiempo contra PostgreSQL real (19 de octubre de 2026). Solo corre con la base aislada de pruebas;
// Cada prueba usa un esquema propio: el historial inmutable nunca se limpia borrando filas de auditoría compartida.

const connectionString = briaTestDatabaseUrl();
const schemaSql = () => readFile(new URL('../scripts/sql/bria-daily-reading.sql', import.meta.url), 'utf8');
const isolatedPool = () => {
  const raw = new pg.Pool({ connectionString, max: 3 });
  const schema = `daily_reading_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const scoped = (sql) => sql.replaceAll('bria_memory', schema);
  return {
    schema,
    query: (sql, params) => raw.query(scoped(sql), params),
    connect: async () => {
      const client = await raw.connect();
      return { query: (sql, params) => client.query(scoped(sql), params), release: () => client.release() };
    },
    end: async () => {
      try { await raw.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
      finally { await raw.end(); }
    }
  };
};

test('real PostgreSQL: one photo per day and subject, its history and series, one reading and one delivery per day', { skip: !connectionString }, async () => {
  const pool = isolatedPool();
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

    // El libro de decisiones: una fila de trabajo por decisión y persona; la historia conserva cada cambio.
    const decision = { id: `${days[1]}:1`, title: 'Revisar la cuenta', kind: 'HACER', subjectType: 'CLIENT', subjectId: 'pg-c1', subjectName: 'Cuenta', evidence: ['CUENTA_EMPEORO:pg-c1'] };
    const user = { ref: 'pg-user', name: 'Persona' };
    const first = await repo.recordDecision({ decision, dayKey: days[1], user, verdict: 'NO', note: 'hoy no' });
    const second = await repo.recordDecision({ decision, dayKey: days[1], user, verdict: 'HECHO', note: null });
    assert.equal(first.id, second.id, 'same decision and person: one row');
    assert.deepEqual([second.verdict, second.note, second.outcome], ['HECHO', null, null]);
    assert.deepEqual((await repo.pendingOutcomes(days[2])).map((e) => e.decisionId), [decision.id]);
    assert.equal(await repo.setOutcome(second.id, { outcome: 'SIGUE', text: 'Cuenta sigue en rojo.', day: days[2], expectedRevision: second.revision }), true);
    assert.equal(await repo.setOutcome(second.id, { outcome: 'MEJORO', text: 'x', day: days[2], expectedRevision: second.revision }), false, 'one observation per day');
    assert.deepEqual((await repo.recentDecisions(days[2], { days: 10, userRef: 'pg-user' })).map((e) => [e.verdict, e.outcome, e.outcomeDay]), [['HECHO', 'SIGUE', days[2]]]);
    assert.deepEqual((await repo.readingsBefore(days[2], 10)).map((r) => r.day), [days[1]]);

    const proactive = createBriaProactiveRepository({ pool });
    const conversationId = '00000000-0000-4000-8000-000000000001';
    await proactive.recordMorningBriefDelivery(days[1], 'pg-user', conversationId);
    await proactive.recordMorningBriefDelivery(days[1], 'pg-user', '00000000-0000-4000-8000-000000000002');
    assert.equal((await proactive.morningBriefDelivery(days[1], 'pg-user')).conversationId, conversationId, 'the first delivery stays');
  } finally {
    await pool.end();
  }
});

test('real PostgreSQL: observations continue daily, preserve corrections and reject stale workers', { skip: !connectionString }, async () => {
  const pool = isolatedPool();
  const day = '2099-02-02', user = { ref: 'pg-decision-followup', name: 'Dirección' };
  const decision = { id: `${day}:followup`, title: 'Resolver vencidas', kind: 'HACER', subjectType: 'CLIENT', subjectId: 'pg-followup', evidence: ['VENCIDAS_NUEVAS:pg-followup'] };
  try {
    await pool.query(await readFile(new URL('../scripts/sql/bria-daily-reading.sql', import.meta.url), 'utf8'));
    const repo = createDailyReadingRepository({ pool });
    const first = await repo.recordDecision({ decision, dayKey: day, user, verdict: 'HECHO', decidedAt: new Date(`${day}T15:00:00Z`) });
    assert.equal(first.revision, 1);
    assert.deepEqual(first.history.map((event) => event.verdict), ['HECHO'], 'the inserted verdict is immediately readable');
    assert.equal(await repo.setOutcome(first.id, { outcome: 'SIN_EVIDENCIA', text: 'Sin foto.', day: '2099-02-03', expectedRevision: first.revision }), true);
    const repeat = await repo.recordDecision({ decision, dayKey: day, user, verdict: 'HECHO', decidedAt: new Date('2099-02-03T16:00:00Z') });
    assert.equal(repeat.revision, 1, 'a retried verdict is idempotent');
    assert.equal(repeat.outcome, 'SIN_EVIDENCIA', 'retry does not erase observation');
    assert.equal(repeat.decidedAt.toISOString(), `${day}T15:00:00.000Z`);
    assert.equal((await repo.pendingOutcomes('2099-02-03')).some((e) => e.id === first.id), false);
    assert.equal((await repo.pendingOutcomes('2099-02-04')).some((e) => e.id === first.id), true);
    const writes = await Promise.all([
      repo.setOutcome(first.id, { outcome: 'MEJORO', text: 'Cero vencidas.', day: '2099-02-04', expectedRevision: first.revision }),
      repo.setOutcome(first.id, { outcome: 'MEJORO', text: 'Cero vencidas.', day: '2099-02-04', expectedRevision: first.revision })
    ]);
    assert.equal(writes.filter(Boolean).length, 1, 'two workers record only one daily observation');
    assert.equal((await repo.pendingOutcomes('2099-02-05')).some((e) => e.id === first.id), true, 'improvement still gets checked for recurrence');
    assert.equal(await repo.setOutcome(first.id, { outcome: 'SIGUE', text: 'Venció otra pieza.', day: '2099-02-05', expectedRevision: first.revision }), true);
    const corrected = await repo.recordDecision({ decision, dayKey: day, user, verdict: 'DESPUES', note: 'Esperar insumos' });
    assert.equal(corrected.revision, 2);
    assert.equal(corrected.outcome, null);
    assert.deepEqual(corrected.history.filter((e) => e.type === 'OUTCOME').map((e) => e.outcome), ['SIN_EVIDENCIA', 'MEJORO', 'SIGUE']);
    assert.deepEqual(corrected.history.filter((e) => e.type === 'VERDICT').map((e) => e.verdict), ['HECHO', 'DESPUES']);
    assert.equal(await repo.setOutcome(first.id, { outcome: 'MEJORO', text: 'Cálculo anterior.', day: '2099-02-06', expectedRevision: first.revision }), false, 'human correction wins over stale worker');
    assert.equal(await repo.setOutcome(first.id, { outcome: 'MEJORO', text: 'Sin versión.', day: '2099-02-06' }), false, 'missing revision fails closed');
    assert.equal(await repo.setOutcome(first.id, { outcome: 'SIGUE', text: 'Observado.', day: '2099-02-06', expectedRevision: corrected.revision }), true);
    await pool.query(await readFile(new URL('../scripts/sql/bria-daily-reading.sql', import.meta.url), 'utf8'));
    const [saved] = await repo.recentDecisions('2099-02-06', { userRef: user.ref });
    assert.equal(saved.history.length, 6, 'schema reapplication preserves complete history');
    assert.deepEqual(saved.history.map((event) => event.type), ['VERDICT', 'OUTCOME', 'OUTCOME', 'OUTCOME', 'VERDICT', 'OUTCOME'], 'human reset does not append an empty outcome');
    assert.equal((await repo.pendingOutcomes('2099-02-17')).some((e) => e.id === first.id), false, 'follow-up stops after fourteen days');
    const abstain = await repo.recordDecision({ decision: { ...decision, id: `${day}:abstain`, kind: 'NO_HACER' }, dayKey: day, user, verdict: 'HECHO' });
    assert.equal((await repo.pendingOutcomes('2099-02-07')).some((e) => e.id === abstain.id), false);
  } finally {
    await pool.end();
  }
});

test('real PostgreSQL: legacy verdict and outcome survive first correction after additive upgrade', { skip: !connectionString }, async () => {
  const pool = isolatedPool();
  const user = { ref: 'pg-decision-legacy' }, day = '2099-03-02';
  const decision = { id: `${day}:legacy`, title: 'Revisar', kind: 'HACER' };
  try {
    // Install the original table before the additive follow-up section, with no event trigger yet.
    const sql = await schemaSql();
    await pool.query(sql.split('-- Seguimiento revisable')[0].replace("'SIGUE','SIN_EVIDENCIA'", "'SIGUE'"));
    await pool.query(`INSERT INTO bria_memory.decision_log(id,decision_id,day_key,user_ref,title,kind,verdict,outcome,outcome_day,outcome_text)
      VALUES(gen_random_uuid(),$1,$2,$3,'Revisar','HACER','HECHO','YA_NO_SE_VE','2099-03-03','Observación antigua')`, [decision.id, day, user.ref]);
    const observed = (await pool.query(`INSERT INTO bria_memory.decision_log(id,decision_id,day_key,user_ref,title,kind,verdict,outcome,outcome_day,outcome_text)
      VALUES(gen_random_uuid(),$1,$2,$3,'Observar','VIGILAR','HECHO','YA_NO_SE_VE','2099-03-03','Otra observación antigua') RETURNING id`, [`${decision.id}:observed`, day, user.ref])).rows[0];
    await pool.query(sql);
    const constraint = "SELECT oid FROM pg_constraint WHERE conrelid='bria_memory.decision_log'::regclass AND conname='decision_log_outcome_check'";
    const upgradedOid = (await pool.query(constraint)).rows[0].oid;
    await pool.query(sql);
    assert.equal((await pool.query(constraint)).rows[0].oid, upgradedOid, 'an upgraded outcome constraint is not replaced at every startup');
    const repo = createDailyReadingRepository({ pool });
    const changed = await repo.recordDecision({ decision, dayKey: day, user, verdict: 'NO', note: 'Cambio de criterio' });
    assert.equal(changed.history[0].verdict, 'HECHO');
    assert.equal(changed.history[0].outcome, 'YA_NO_SE_VE');
    assert.equal(changed.history[0].outcomeText, 'Observación antigua');
    assert.equal(changed.history[1].verdict, 'NO');
    assert.equal(changed.history.length, 2);
    assert.deepEqual((await repo.recentDecisions('2099-03-04', { userRef: user.ref })).find((entry) => entry.id === changed.id).history, changed.history);
    assert.equal(await repo.setOutcome(observed.id, { outcome: 'SIN_EVIDENCIA', text: 'Sin foto actual.', day: '2099-03-04', expectedRevision: 1 }), true, 'the former constraint accepts the new explicit unknown state after upgrade');
    const observedHistory = (await repo.recentDecisions('2099-03-04', { userRef: user.ref })).find((entry) => entry.id === observed.id).history;
    assert.deepEqual(observedHistory.map((event) => [event.type, event.outcome]), [['VERDICT', 'YA_NO_SE_VE'], ['OUTCOME', 'SIN_EVIDENCIA']], 'a first observation also preserves the legacy verdict and outcome');
  } finally {
    await pool.end();
  }
});

test('real PostgreSQL: decision events are immutable, ordered and survive removal of the working row', { skip: !connectionString }, async () => {
  const pool = isolatedPool();
  try {
    await pool.query(await schemaSql());
    const tables = AUDIT_TABLES.filter((spec) => spec.name === 'decision_events').map((spec) => ({ ...spec, schema: pool.schema }));
    const installed = await ensureAuditImmutability(pool, { tables, functionSchema: pool.schema });
    assert.deepEqual(installed.protected, [`${pool.schema}.decision_events`]);
    const repo = createDailyReadingRepository({ pool });
    const entry = await repo.recordDecision({ decision: { id: '2099-04-01:immutable', title: 'Revisar', kind: 'HACER' }, dayKey: '2099-04-01', user: { ref: 'pg-immutable' }, verdict: 'HECHO' });
    await repo.setOutcome(entry.id, { outcome: 'SIGUE', text: 'Sigue pendiente.', day: '2099-04-02', expectedRevision: entry.revision });
    const events = (await pool.query('SELECT id, event FROM bria_memory.decision_events WHERE decision_log_id=$1 ORDER BY id', [entry.id])).rows;
    assert.deepEqual(events.map((row) => row.event.type), ['VERDICT', 'OUTCOME']);
    assert.ok(BigInt(events[0].id) < BigInt(events[1].id), 'identity orders events independently of timestamps');
    const rejected = /no se puede modificar ni borrar/;
    await assert.rejects(pool.query("UPDATE bria_memory.decision_events SET event=event || '{\"verdict\":\"NO\"}'::jsonb WHERE decision_log_id=$1", [entry.id]), rejected);
    await assert.rejects(pool.query('DELETE FROM bria_memory.decision_events WHERE decision_log_id=$1', [entry.id]), rejected);
    await assert.rejects(pool.query('TRUNCATE bria_memory.decision_events'), rejected);
    await pool.query('DELETE FROM bria_memory.decision_log WHERE id=$1', [entry.id]);
    assert.deepEqual((await pool.query('SELECT id, event FROM bria_memory.decision_events WHERE decision_log_id=$1 ORDER BY id', [entry.id])).rows, events, 'no cascading delete can erase evidence');
    const columns = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='decision_log'", [pool.schema]);
    assert.equal(columns.rows.some((row) => row.column_name === 'history'), false, 'history has no mutable copy in the working table');
    assert.deepEqual((await ensureAuditImmutability(pool, { tables, functionSchema: pool.schema })).changed, [], 'guard installation is idempotent');
  } finally {
    await pool.end();
  }
});
