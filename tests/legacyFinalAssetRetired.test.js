import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// El camino viejo de la pieza final, retirado (Rodny, 28 de octubre de 2026).
//
// Hasta el 26 de agosto de 2026 una pieza tenía **un solo archivo final** en cuatro columnas de la propia
// pieza. Ese día llegaron los carruseles y cada archivo pasó a ser su propia fila, con su posición, que es
// el orden en que sale publicado. Las columnas viejas se quedaron ahí, con media plataforma leyéndolas «por
// si acaso»: el servidor fingía que ese archivo era uno más de la lista y lo marcaba `isLegacy`, el portal
// lo mandaba aparte, y seis servicios preguntaban por él antes de mirar la tabla de verdad.
//
// `npm run parrillas:pieza-final-antigua` contra producción, ese día: **cero piezas** con esas columnas
// puestas. Ni vigentes, ni borradas, ni mezcladas con archivos nuevos. Así que el camino se retira entero.
//
// **Las columnas se quedan en la base, en desuso y sin lectores**, como `ClientHealth`: borrarlas es una
// decisión aparte y no hace falta para esto.

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const LEGACY_COLUMNS = ['finalAssetKey', 'finalAssetName', 'finalAssetMimeType', 'finalAssetSize'];

// Lo que leía el archivo único. Si alguien vuelve a añadir un lector, esta lista lo encuentra.
const SIN_LECTORES = [
  'src/services/briaAssistantTools.js',
  'src/services/clientOperationsService.js',
  'src/services/socialPublishingService.js',
  'src/services/socialImageDerivativeService.js',
  'src/controllers/publicController.js',
  'src/routes/api/content.js',
  'src/routes/index.js',
  'src/components/modules/ContentPlanDetail.jsx',
  'src/lib/platformCatalog.js',
  'src/lib/operationalMutationLabels.js',
  'scripts/lib/briaResearchPlatform.js'
];

test('ningún archivo de la plataforma lee ya las cuatro columnas del archivo único', () => {
  for (const path of SIN_LECTORES) {
    const source = read(path);
    for (const column of LEGACY_COLUMNS) {
      assert.doesNotMatch(source, new RegExp(`\\b${column}\\b`), `${path} todavía nombra ${column}`);
    }
  }
});

test('las columnas se conservan en la base, en desuso, y el esquema lo dice', () => {
  const schema = read('prisma/schema.prisma');
  for (const column of LEGACY_COLUMNS) assert.match(schema, new RegExp(`\\b${column}\\b`), `${column} no se borra de la base`);
  // Quien las vea en el esquema tiene que saber por qué siguen ahí y que nadie las lee.
  assert.match(schema, /en desuso[\s\S]{0,700}finalAssetKey/);
});

test('las rutas del archivo único ya no existen', () => {
  const routes = read('src/routes/api/content.js');
  assert.doesNotMatch(routes, /'\/items\/:id\/final-asset'/, 'la ruta en singular se retiró');
  assert.doesNotMatch(routes, /uploadContentItemFinalAsset\b(?!s)/);
  // Lo de los carruseles, que es el camino vivo, sigue entero.
  assert.match(routes, /carouselUpload\.array\('files', FINAL_ASSET_MAX_FILES\)/);
  assert.match(routes, /items\/:id\/final-assets\/:assetId/);

  const publicRoutes = read('src/routes/index.js');
  assert.doesNotMatch(publicRoutes, /items\/:id\/final-asset'/, 'el portal tampoco sirve el archivo único');
  assert.match(publicRoutes, /public\/parrilla\/:token\/items\/:id\/final-assets\/:assetId/);
});

test('el servidor no vuelve a escribir esas columnas aunque se las pidan', () => {
  // Siguen existiendo en la base, así que un PATCH con esos campos las escribiría y nadie las mostraría.
  const service = read('src/services/contentService.js');
  assert.match(service, /const RETIRED_FINAL_ASSET_FIELDS = \['finalAssetKey', 'finalAssetName', 'finalAssetMimeType', 'finalAssetSize'\]/);
  assert.match(service, /const withoutRetiredFields = /);
  // Y el único sitio donde el servicio las nombra es esa lista: ni las lee ni las entrega.
  for (const column of LEGACY_COLUMNS) {
    assert.equal((service.match(new RegExp(`\\b${column}\\b`, 'g')) || []).length, 1, `${column} se nombra más de una vez`);
  }
  // Lo que entra a crear y a actualizar una pieza pasa por ahí.
  assert.match(service, /withoutRetiredFields\(/);
});

test('el portal del cliente entrega una sola lista de archivos', () => {
  const controller = read('src/controllers/publicController.js');
  assert.doesNotMatch(controller, /finalAsset:/, 'ya no hay un archivo aparte del de la lista');
  assert.doesNotMatch(controller, /getPublicFinalAsset\b(?!ById)/);
  assert.match(controller, /finalAssets:\s*\(item\.finalAssets \|\| \[\]\)\.map/);
  assert.match(controller, /getPublicFinalAssetById/);
});

test('la rejilla del editor ya no aparta un archivo que no se puede mover', () => {
  const editor = read('src/components/modules/ContentPlanDetail.jsx');
  assert.doesNotMatch(editor, /isLegacy/);
  // Todas las miniaturas se arrastran, que es lo que define el orden del carrusel publicado.
  assert.match(editor, /const canDrag = canReorder && !saving;/);
});

test('la pieza que entrega el servidor trae solo su lista de archivos y su portada', () => {
  const service = read('src/services/contentService.js');
  assert.doesNotMatch(service, /legacyFinalAsset/);
  assert.match(service, /\.\.\.withPublicCover\(item\)/);
  assert.match(service, /finalAssets: item\.finalAssets \|\| \[\]/);
});
