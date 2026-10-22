import test from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_QUERIES, isReadOnlyQuery, parseSince, runSecurityReview, formatReview, DEFAULT_SINCE } from '../scripts/security-review-railway-2026-10.mjs';

// La revisión tras el aviso de seguridad de Railway (21 de octubre de 2026) corre contra producción, así que tiene que
// ser incapaz de escribir: cada consulta es un SELECT, la transacción es READ ONLY y nunca lee un valor de la bóveda.

test('todas las consultas son de solo lectura y ninguna toca un valor cifrado de la bóveda', () => {
  assert.ok(Object.keys(REVIEW_QUERIES).length >= 10);
  for (const [name, { sql, que }] of Object.entries(REVIEW_QUERIES)) {
    assert.ok(isReadOnlyQuery(sql), `${name} no es de solo lectura`);
    assert.doesNotMatch(sql, /secret_enc|username_enc|notes_enc|"password"|"mfaSecret"|"mfaPendingSecret"|"mfaRecoveryCodes"/, `${name} lee un secreto`);
    assert.ok(que.length > 20 && !/vosotros|podéis|tenéis/.test(que), `${name} necesita una explicación en español`);
  }
});

test('el guardián de solo lectura rechaza escrituras aunque vengan disfrazadas', () => {
  assert.equal(isReadOnlyQuery('SELECT 1'), true);
  assert.equal(isReadOnlyQuery("SELECT 'DELETE FROM x' AS texto"), true, 'una palabra dentro de un texto no cuenta');
  for (const sql of ['DELETE FROM "User"', 'UPDATE "User" SET role = 1', 'WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x', 'SELECT 1; DROP TABLE t', 'CREATE ROLE x', 'ALTER USER postgres PASSWORD \'x\'', 'COPY t TO \'/tmp/x\'']) {
    assert.equal(isReadOnlyQuery(sql), false, sql);
  }
});

test('la fecha de corte se valida y va en UTC', () => {
  assert.equal(parseSince(), `${DEFAULT_SINCE} 00:00:00`);
  assert.equal(parseSince('2026-10-19'), '2026-10-19 00:00:00');
  assert.throws(() => parseSince('ayer'), /Fecha de corte no válida/);
  assert.throws(() => parseSince("2026-10-19'; DROP TABLE x;--"), /Fecha de corte no válida/);
});

test('corre en una transacción READ ONLY en UTC, pasa el corte como parámetro, sigue tras un error y siempre descarta', async () => {
  const calls = [];
  class FakeClient {
    constructor(options) { calls.push(['options', options.application_name]); }
    async connect() { calls.push(['connect']); }
    async query(sql, params) {
      calls.push(['query', sql, params]);
      if (sql.includes('pg_extension')) throw new Error('permiso denegado');
      return { rows: sql.startsWith('SELECT') ? [{ ok: 1, cuando: new Date('2026-10-21T10:00:00Z') }] : [] };
    }
    async end() { calls.push(['end']); }
  }
  const out = await runSecurityReview({ connectionString: 'postgres://u:p@db.example:5432/railway', since: '2026-10-20 00:00:00', Client: FakeClient });
  assert.equal(out.base, 'db.example:5432');
  assert.equal(calls[0][1], 'revision-seguridad-railway');
  const sqls = calls.filter((c) => c[0] === 'query').map((c) => c[1]);
  assert.equal(sqls[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(sqls[1], "SET LOCAL TIME ZONE 'UTC'");
  assert.ok(sqls.every((sql) => /^(BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY|SET LOCAL TIME ZONE 'UTC'|ROLLBACK|SELECT|WITH)/.test(sql)), 'solo lectura, nada más');
  assert.equal(sqls.at(-1), 'ROLLBACK');
  assert.equal(calls.at(-1)[0], 'end');
  assert.match(out.errores.extensiones, /permiso denegado/);
  assert.ok(out.resultados.administradores, 'sigue después de un error');
  const withCutoff = calls.filter((c) => c[0] === 'query' && c[1].includes('$1'));
  assert.ok(withCutoff.length > 5 && withCutoff.every((c) => c[2][0] === '2026-10-20 00:00:00'), 'el corte va como parámetro, nunca pegado al SQL');
  const text = formatReview(out);
  assert.match(text, /^Base: db\.example:5432 · corte: 2026-10-20 00:00:00 UTC/);
  assert.match(text, /Solo lectura: nada se cambió\./);
  assert.match(text, /No se pudo leer: permiso denegado/);
  assert.match(text, /cuando: 2026-10-21T10:00:00Z/);
});

test('se niega a correr si alguien añade una consulta que escribe', async () => {
  await assert.rejects(runSecurityReview({ connectionString: 'postgres://u:p@h/db', queries: { mala: { que: 'x', sql: 'DELETE FROM "User"' } }, Client: class { } }), /no es de solo lectura/);
});
