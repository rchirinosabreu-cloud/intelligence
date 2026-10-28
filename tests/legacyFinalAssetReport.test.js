import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LEGACY_QUERIES, runLegacyFinalAssetReport, formatLegacyFinalAssetReport
} from '../scripts/report-legacy-final-assets.js';
import { isReadOnlyQuery } from '../scripts/security-review-railway-2026-10.mjs';

// ¿Queda alguna pieza con la pieza final en el formato de antes de los carruseles? (Rodny, 28 de octubre de
// 2026). El informe se apunta a producción, así que no puede poder escribir, y no puede leer nada de lo que
// se redacta en una pieza: ni guion, ni texto de publicación, ni notas internas.

const script = readFileSync(new URL('../scripts/report-legacy-final-assets.js', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

test('cada consulta es de solo lectura y no lee lo que se escribe en una pieza', () => {
  for (const [name, { sql, que }] of Object.entries(LEGACY_QUERIES)) {
    assert.ok(isReadOnlyQuery(sql), `${name} no es de solo lectura`);
    assert.doesNotMatch(sql, /copyText|captionText|internalNotes|comments|password|secret/i, `${name} lee contenido`);
    // Ni la clave del almacenamiento: para contar basta saber si está.
    assert.doesNotMatch(sql, /"finalAssetKey"(?!\s+IS (?:NOT )?NULL)/, `${name} saca la clave del almacenamiento`);
    assert.ok(que.length > 20, `${name} no se explica`);
  }
});

// Sin base de pruebas no se puede ejecutar el SQL, pero sí comprobar que cada tabla y columna que nombra
// existe: es el fallo realista, una letra de más en un nombre entre comillas.
test('cada identificador que nombra el SQL existe en el esquema', () => {
  const known = new Set();
  for (const match of schema.matchAll(/^(?:model|enum)\s+(\w+)/gm)) known.add(match[1]);
  for (const match of schema.matchAll(/^\s{2}(\w+)\s+\S/gm)) known.add(match[1]);
  const sql = Object.values(LEGACY_QUERIES).map(({ sql: text }) => text).join('\n');
  assert.ok(sql.includes('ContentItemFinalAsset'), 'no se encontró ninguna consulta que revisar');
  const referenced = new Set([...sql.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)].map((match) => match[1]));
  const unknown = [...referenced].filter((identifier) => !known.has(identifier));
  assert.deepEqual(unknown, [], `identificadores que no están en el esquema: ${unknown.join(', ')}`);
});

// Una pieza borrada, o la de una parrilla borrada, no la ve nadie: contarla daría trabajo que no existe.
test('lo que se cuenta como pendiente está vigente y sin ningún archivo del formato nuevo', () => {
  for (const name of ['por_mes', 'por_estado', 'invisibles_en_el_editor']) {
    const { sql } = LEGACY_QUERIES[name];
    assert.match(sql, /archivos_nuevos = 0/, `${name} no exige que no tenga archivos nuevos`);
    assert.match(sql, /NOT pieza_borrada AND NOT parrilla_borrada/, `${name} cuenta piezas borradas`);
  }
  assert.match(LEGACY_QUERIES.resumen.sql, /solo_el_antiguo_y_vigentes/);
});

test('corre todo en una transacción de solo lectura y la descarta', async () => {
  const queries = [];
  class Client {
    async connect() {}
    async query(sql) {
      queries.push(sql);
      return { rows: /con_archivo_antiguo/.test(sql) ? [{ con_archivo_antiguo: 4, solo_el_antiguo: 2, solo_el_antiguo_y_vigentes: 1, tambien_con_archivos_nuevos: 2, la_mas_reciente: '2026-08-20' }] : [] };
    }
    async end() {}
  }
  const out = await runLegacyFinalAssetReport({ connectionString: 'postgresql://u:p@db.example:5432/x', Client });
  assert.equal(queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.equal(out.base, 'db.example:5432');
  const texto = formatLegacyFinalAssetReport(out);
  assert.match(texto, /Solo lectura: nada se cambió\./);
  assert.match(texto, /Hay 1 pieza\(s\) vigente\(s\)/);
});

test('con cero pendientes lo dice, porque es lo que autoriza retirar el camino viejo', () => {
  const out = {
    base: 'db.example:5432', ejecutado: '2026-10-28T12:00:00.000Z', errores: {},
    resultados: { resumen: [{ con_archivo_antiguo: 0, solo_el_antiguo: 0, solo_el_antiguo_y_vigentes: 0, tambien_con_archivos_nuevos: 0, la_mas_reciente: null }] }
  };
  assert.match(formatLegacyFinalAssetReport(out), /No queda ninguna pieza vigente con solo el archivo viejo/);
});

// El informe señala y explica; la decisión de tocar algo es de una persona.
test('el informe no corrige nada ni lo propone solo', () => {
  assert.doesNotMatch(script, /--confirmar|updateMany|prisma\./);
  assert.match(script, /Solo lectura/);
});
