import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQueries, runDiagnosis } from '../scripts/diagnose-missing-content-plan.mjs';

// Rodny, 9 de octubre de 2026: «la parrilla de Mima's Kitchen no aparece, ¿se borró?». No se había
// borrado nada: ese cliente trabaja de mitad a mitad de mes y las piezas de octubre viven en la
// parrilla de septiembre. Esta prueba protege el diagnóstico que lo demostró.

test('el diagnóstico solo lee', () => {
  const queries = Object.entries(buildQueries('mima'));
  assert.ok(queries.length >= 6, 'cubre cliente, parrillas, borrados, mes equivocado, fechas y contrato');
  for (const [name, sql] of queries) {
    const sinTextos = sql.replace(/'[^']*'/g, "''");
    assert.doesNotMatch(sinTextos, /\b(INSERT|UPDATE|DELETE\s+FROM|DROP|ALTER|TRUNCATE|CREATE)\b/i, `${name} no escribe`);
  }
});

test('la auditoría guarda la ruta normalizada en `path`, no en `pathname`', () => {
  // Primer error al escribirlo: `metadata->>'pathname' LIKE '/api/content/plans/%'` no devolvía nada,
  // y de ahí se habría concluido que nadie borró la parrilla. `operationalAuditMiddleware` guarda
  // `{ ...describePlatformMutation(), method, statusCode }`, y ahí la clave es `path`, ya con `:id`.
  const { borrados_de_parrillas: sql } = buildQueries('mima');
  assert.match(sql, /metadata->>'path' IN \('\/api\/content\/plans\/:id', '\/api\/content\/items\/:id'\)/);
  assert.doesNotMatch(sql, /pathname/);
});

test('el texto a buscar se valida antes de conectar', async () => {
  // Las consultas lo interpolan, así que la puerta está en la validación.
  for (const malo of ['x', '', 'a'.repeat(41), "a' OR '1'='1", 'a; DROP TABLE "Client"', '%']) {
    await assert.rejects(
      () => runDiagnosis({ connectionString: 'postgres://u:p@127.0.0.1:1/d', needle: malo }),
      /solo puede llevar/,
      `rechaza ${JSON.stringify(malo)}`
    );
  }
  // Y un nombre de cliente de verdad pasa la validación (falla después, al no haber base).
  await assert.rejects(
    () => runDiagnosis({ connectionString: 'postgres://u:p@127.0.0.1:1/d', needle: "mima's kitchen" }),
    (error) => !/solo puede llevar/.test(error.message)
  );
  await assert.rejects(() => runDiagnosis({ needle: 'mima' }), /Falta DATABASE_URL/);
});

test('cuenta las piezas con y sin borrar, porque borrar una pieza es un borrado suave', () => {
  // `deleteContentItem` marca `deletedAt`; la fila se queda. Por eso `piezas` (todas) y
  // `piezas_vivas` (sin borrar) son dos columnas: con las dos en cero nadie borró nada,
  // nunca hubo piezas. Esa fue la prueba de que la parrilla de octubre nació vacía.
  const { parrillas: sql } = buildQueries('mima');
  assert.match(sql, /COUNT\(\*\)::int FROM "ContentItem" i WHERE i\."planId" = p\.id\) AS piezas/);
  assert.match(sql, /i\."deletedAt" IS NULL\) AS piezas_vivas/);
  assert.match(sql, /p\."deletedAt"/, 'y dice si la parrilla misma está borrada');
});
