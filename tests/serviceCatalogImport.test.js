import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CATALOG_MARGIN,
  calculateCatalogFinalPrice,
  mapCatalogCategory,
  resolveCatalogIdentity
} from '../src/services/serviceCatalogImport.js';

test('calcula el precio oficial con el margen operativo del 40 %', () => {
  assert.equal(CATALOG_MARGIN, 0.4);
  assert.equal(calculateCatalogFinalPrice(280000), 392000);
  assert.equal(calculateCatalogFinalPrice(41500), 58100);
});

test('mantiene en cero los conceptos de inversión publicitaria variable', () => {
  assert.equal(calculateCatalogFinalPrice(null, { variablePrice: true }), 0);
  assert.equal(calculateCatalogFinalPrice(0, { variablePrice: true }), 0);
});

test('normaliza las categorías nuevas y agrupa Marketing / IA dentro de Marketing', () => {
  assert.equal(mapCatalogCategory('Comunicación corporativa'), 'COMUNICACION_CORPORATIVA');
  assert.equal(mapCatalogCategory('Marketing / IA'), 'MARKETING');
  assert.equal(mapCatalogCategory('Merchandising / Impresión'), 'MERCHANDISING_IMPRESION');
});

test('reconoce renombres equivalentes para conservar el id del servicio', () => {
  assert.equal(resolveCatalogIdentity('Carrusel de hasta 10 slides'), 'Carrusel de hasta 5 slides');
  assert.equal(resolveCatalogIdentity('Administración Meta Ads + Google Ads'), 'Meta + Google Ads');
  assert.equal(resolveCatalogIdentity('Integración con servicios externos'), 'Integración con herramientas externas');
  assert.equal(resolveCatalogIdentity('Spot publicitario'), 'Spot publicitario/produccion');
  assert.equal(resolveCatalogIdentity('Tienda virtual - E commerce'), 'Tienda virtual');
});

test('los servicios realmente nuevos conservan su propio nombre como identidad', () => {
  assert.equal(resolveCatalogIdentity('Contenidos creativos apoyados en IA'), 'Contenidos creativos apoyados en IA');
});

test('la sincronización archiva servicios anteriores y nunca los elimina físicamente', async () => {
  const script = await readFile(new URL('../scripts/sync_service_catalog.js', import.meta.url), 'utf8');
  assert.match(script, /activo:\s*false/);
  assert.doesNotMatch(script, /deleteMany|\.delete\(/);
});

test('el esquema admite las nuevas categorías y conserva el precio comercial sugerido', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');
  assert.match(schema, /COMUNICACION_CORPORATIVA/);
  assert.match(schema, /MERCHANDISING_IMPRESION/);
  assert.match(schema, /precio_comercial_sugerido\s+Decimal\?/);
  assert.match(schema, /precio_variable\s+Boolean\s+@default\(false\)/);
  assert.match(schema, /activo\s+Boolean\s+@default\(true\)/);
});
