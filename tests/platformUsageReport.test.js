import test from 'node:test';
import assert from 'node:assert/strict';
import { USAGE_QUERIES, parseDays, mapCoverage, runUsageReport, formatUsage } from '../scripts/report-platform-usage.mjs';
import { isReadOnlyQuery } from '../scripts/security-review-railway-2026-10.mjs';

// El reporte de qué usa el equipo (22 de octubre de 2026) corre contra producción: tiene que ser incapaz de escribir
// y nunca leer contenido, solo qué operación, cuántas veces y cuántas personas.

test('cada consulta es de solo lectura y no lee contenido', () => {
  for (const [name, { sql, que }] of Object.entries(USAGE_QUERIES)) {
    assert.ok(isReadOnlyQuery(sql), `${name} no es de solo lectura`);
    assert.doesNotMatch(sql, /"content"|"message"|"description"|"text"|password|secret/i, `${name} lee contenido`);
    assert.ok(que.length > 20);
  }
});

test('los días se validan', () => {
  assert.equal(parseDays(), 60);
  assert.equal(parseDays('90'), 90);
  for (const bad of ['0', '400', 'ayer', '30; DROP TABLE x']) assert.throws(() => parseDays(bad), /Días no válidos/);
});

test('cada operación dice si el mapa de Bria la conoce y si describe sus campos', () => {
  assert.deepEqual(mapCoverage({ metodo: 'POST', ruta: '/api/activity/events' }), { enElMapa: true, conCampos: true, operacion: 'POST /activity/events' });
  assert.equal(mapCoverage({ metodo: 'PATCH', ruta: '/api/activity/events/:id' }).enElMapa, true, 'los ids ya vienen como :id');
  assert.deepEqual(mapCoverage({ metodo: 'POST', ruta: '/api/no-existe' }), { enElMapa: false, conCampos: false, operacion: null });
  assert.equal(mapCoverage({ metodo: 'DELETE', ruta: '/api/activity/events/:id' }).conCampos, true, 'un borrado no lleva cuerpo');
});

test('corre todo en una transacción de solo lectura, la descarta y marca el mapa en cada fila', async () => {
  const queries = [];
  class Client {
    async connect() {}
    async query(sql) { queries.push(sql); return { rows: /PLATFORM_MUTATION/.test(sql) ? [{ metodo: 'POST', ruta: '/api/activity/events', modulo: 'Actividad', veces: 12, personas: 3, ultima: new Date('2026-10-22T20:00:00Z'), por_whatsapp: 1 }] : [] }; }
    async end() {}
  }
  const out = await runUsageReport({ connectionString: 'postgresql://u:p@db.example:5432/x', days: 30, Client });
  assert.equal(queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal(out.resultados.operaciones[0].operacion, 'POST /activity/events');
  assert.match(formatUsage(out), /Solo lectura: nada se cambió\./);
  assert.match(formatUsage(out), /enElMapa: sí/);
});
