import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DRIVE_PROVIDER } from '../src/lib/driveLinks.js';
import { driveAssetUrls, driveEmbedAspect, finalAssetKind, finalAssetShapeProblem, isDriveAsset } from '../src/lib/finalAssetShape.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 24 de septiembre de 2026: «quiero ambos porque ambos los necesito en mi labor diaria y de
// entrega». Una pieza final pesada se entrega de dos maneras: subiéndola directo al almacenamiento sin
// pasar por el servidor, o dejando el enlace de Drive. Este contrato vigila que ninguna de las dos
// rompa la que ya funcionaba ni abra una puerta de más.

const FILE_ASSET = { storageKey: 'content-plans/x/2026-09/i/final-assets/1_a_reel.mp4', mimeType: 'video/mp4', size: 30 };
const DRIVE_ASSET = { externalProvider: DRIVE_PROVIDER, externalFileId: '1AbC_-defGHIjklMNOpqrSTUvwx23456', externalUrl: 'https://drive.google.com/file/d/1AbC_-defGHIjklMNOpqrSTUvwx23456/view' };

test('una pieza final es un archivo nuestro o un enlace, nunca las dos cosas ni ninguna', () => {
  assert.equal(finalAssetShapeProblem(FILE_ASSET), null);
  assert.equal(finalAssetShapeProblem(DRIVE_ASSET), null);

  assert.equal(
    finalAssetShapeProblem({ ...FILE_ASSET, ...DRIVE_ASSET }),
    'Una pieza final no puede ser un archivo y un enlace a la vez.'
  );
  assert.equal(finalAssetShapeProblem({ name: 'vacía' }), 'Una pieza final necesita un archivo o un enlace.');
  assert.equal(
    finalAssetShapeProblem({ externalUrl: 'https://drive.google.com/file/d/abc/view' }),
    'Ese enlace no quedó resuelto en un archivo de Drive.',
    'un enlace sin identificador resuelto no se guarda: al pintarlo no habría qué mostrar'
  );

  assert.equal(finalAssetKind(DRIVE_ASSET), 'drive');
  assert.equal(finalAssetKind(FILE_ASSET), 'video');
  assert.equal(finalAssetKind({ storageKey: 'k', mimeType: 'image/png' }), 'image');
  assert.equal(finalAssetKind({ storageKey: 'k', mimeType: 'application/pdf' }), 'file');

  assert.equal(isDriveAsset(FILE_ASSET), false);
  assert.equal(driveAssetUrls(FILE_ASSET), null, 'un archivo nuestro no tiene direcciones de Drive');
  assert.deepEqual(driveAssetUrls(DRIVE_ASSET), {
    embedUrl: 'https://drive.google.com/file/d/1AbC_-defGHIjklMNOpqrSTUvwx23456/preview',
    thumbnailUrl: 'https://drive.google.com/thumbnail?id=1AbC_-defGHIjklMNOpqrSTUvwx23456&sz=w1600',
    openUrl: 'https://drive.google.com/file/d/1AbC_-defGHIjklMNOpqrSTUvwx23456/view'
  });
});

test('la base guarda las dos mitades como opcionales, con un script aditivo', async () => {
  const schema = await read('prisma/schema.prisma');
  const block = schema.match(/model ContentItemFinalAsset \{[\s\S]*?\n\}/)[0];

  assert.match(block, /storageKey\s+String\?\s+@unique/, 'una fila de enlace no tiene clave de almacenamiento');
  assert.match(block, /mimeType\s+String\?/);
  assert.match(block, /size\s+Int\?/);
  assert.match(block, /externalUrl\s+String\?/);
  assert.match(block, /externalProvider\s+String\?/);
  assert.match(block, /externalFileId\s+String\?/);

  const script = await read('scripts/ensure-content-final-asset-links-schema.js');
  assert.match(script, /ADD COLUMN IF NOT EXISTS "externalUrl"/);
  assert.match(script, /ALTER COLUMN "storageKey" DROP NOT NULL/);
  assert.doesNotMatch(script, /DROP COLUMN|DELETE FROM|TRUNCATE/, 'aditivo: nada que borre datos');
  assert.match(script, /to_regclass/, 'una base sin la tabla todavía no es un error');

  const pkg = JSON.parse(await read('package.json'));
  assert.match(pkg.scripts.start, /ensure-content-final-asset-links-schema\.js/, 'encadenado en el arranque');
  assert.ok(pkg.dependencies['@aws-sdk/s3-request-presigner'], 'el permiso firmado necesita el presigner');
});

test('el navegador sube directo, pero el servidor decide la clave y comprueba lo que llegó', async () => {
  const storage = await read('src/services/s3Service.js');
  assert.match(storage, /AllowedMethods: \["GET", "HEAD", "PUT", "OPTIONS"\]/, 'sin PUT el navegador ni lo intenta');
  assert.match(storage, /export const createSignedUpload/);
  assert.match(storage, /export const headS3Object/);

  const service = await read('src/services/contentService.js');
  assert.match(
    service,
    /if \(!key\.startsWith\(`\$\{basePath\}\/`\)\) throw new Error\('Ese archivo no pertenece a esta pieza\.'\)/,
    'la clave la elige el servidor: aceptar cualquiera dejaría colgar el archivo de otro cliente'
  );
  assert.match(service, /const object = await headS3Object\(key\);/, 'el peso real se lee del almacenamiento');
  assert.match(service, /object\.size > FINAL_ASSET_DIRECT_MAX_BYTES/);
  assert.match(service, /if \(object\.size <= 0\)/, 'un objeto vacío no se confirma como pieza');
  assert.match(service, /!\/\^image\\\/\|\^video\\\/\/\.test\(object\.mimeType/, 'el tipo también sale del almacenamiento');

  // Confirmar es lo que crea la fila: mientras no se confirme, en la parrilla no aparece nada a medias.
  assert.match(service, /export const confirmContentItemFinalAssets/);
  assert.match(service, /export const createFinalAssetUploadTickets/);

  const routes = await read('src/routes/api/content.js');
  assert.match(routes, /router\.post\('\/items\/:id\/final-assets\/direct-upload'/);
  assert.match(routes, /router\.post\('\/items\/:id\/final-assets\/confirm'/);

  const screen = await read('src/components/modules/ContentPlanDetail.jsx');
  assert.match(screen, /const uploadFinalAssetsDirect = async/);
  assert.match(screen, /axios\.put\(ticket\.url, files\[index\]/, 'el archivo va al almacenamiento, no al servidor');
  assert.match(screen, /Math\.min\(99,/, 'el 100 % se reserva para la confirmación del servidor');
  assert.match(screen, /Subiendo al almacenamiento…/);
});

test('el enlace de Drive se resuelve al guardarlo y se muestra sin servir bytes nuestros', async () => {
  const service = await read('src/services/contentService.js');
  assert.match(service, /export const addContentItemDriveAsset/);
  assert.match(service, /const problem = driveLinkProblem\(url\);/);
  assert.match(service, /externalFileId = parseDriveFileId\(url\)/, 'se guarda ya resuelto, no el texto crudo');
  assert.match(service, /Ese archivo de Drive ya está en esta pieza\./);

  const routes = await read('src/routes/api/content.js');
  assert.match(routes, /router\.post\('\/items\/:id\/final-assets\/drive'/);
  assert.match(
    routes,
    /if \(isDriveAsset\(asset\)\) return res\.status\(409\)/,
    'pedir los bytes de un enlace no puede acabar en un error de almacenamiento'
  );

  const publicController = await read('src/controllers/publicController.js');
  assert.match(publicController, /const drive = driveAssetUrls\(asset\);/);
  assert.match(publicController, /if \(isDriveAsset\(asset\)\) return res\.status\(409\)/);

  const shared = await read('src/components/public/SharedContentPlan.jsx');
  assert.match(shared, /const isDrive = Boolean\(asset\.embedUrl\);/);
  assert.match(shared, /src=\{asset\.embedUrl\}/);
  assert.match(shared, /Abrir en Drive/);

  const screen = await read('src/components/modules/ContentPlanDetail.jsx');
  assert.match(screen, /const DriveLinkDialog/);
  assert.match(screen, /Revisa los permisos en Drive\./, 'el único fallo que la plataforma no puede ver se avisa al pegarlo');
  assert.match(screen, /Cualquier persona con el enlace/);
});

test('un reel de Drive se ve vertical, no achatado', async () => {
  // Rodny, 25 de septiembre de 2026: «no me gusta como se ve, creo que podría verse más alto, porque
  // normalmente son 9:16». Google no dice la forma del video; el formato de la pieza sí la sabe.
  assert.equal(driveEmbedAspect('Reel'), '9 / 16');
  assert.equal(driveEmbedAspect('Video'), '9 / 16');
  assert.equal(driveEmbedAspect('Historia'), '9 / 16');
  assert.equal(driveEmbedAspect('Carrusel'), '16 / 9');
  assert.equal(driveEmbedAspect('Post'), '16 / 9');
  assert.equal(driveEmbedAspect(null), '16 / 9', 'sin formato, lo de siempre');

  const shared = await read('src/components/public/SharedContentPlan.jsx');
  assert.match(shared, /const aspectRatio = driveEmbedAspect\(format\)/);
  assert.match(shared, /format=\{item\.format\}/, 'el portal le pasa el formato de la pieza');
  // Un 9:16 a lo ancho de la columna mediría mil píxeles de alto: hay que acotar el ancho.
  assert.match(shared, /isVerticalPiece \? 'max-w-\[380px\]'/);

  const editor = await read('src/components/modules/ContentPlanDetail.jsx');
  assert.match(editor, /aspectRatio: driveEmbedAspect\(item\.format\)/, 'la miniatura del editor también');
});

test('el único sitio ajeno que la plataforma incrusta es el reproductor de Drive', async () => {
  const security = await read('src/config/security.js');
  const policy = security.match(/setHeader\('Content-Security-Policy', \[[\s\S]*?\]\.join/)[0];

  assert.match(policy, /"frame-src https:\/\/drive\.google\.com"/);
  assert.doesNotMatch(policy, /frame-src[^"]*\*/, 'nunca un comodín');
  assert.match(policy, /"default-src 'self'"/, 'lo demás sigue cerrado');
  assert.match(policy, /"object-src 'none'"/);

  // El CORS del bucket se aplica al arrancar, NUNCA en la cadena de `npm start`: un almacenamiento
  // caído dejaría el servidor sin levantar.
  const server = await read('server.js');
  assert.match(server, /configureS3Cors\(\);/);
  const pkg = JSON.parse(await read('package.json'));
  assert.doesNotMatch(pkg.scripts.start, /cors/i);
});
