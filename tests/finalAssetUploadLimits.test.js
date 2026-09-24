import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FINAL_ASSET_MAX_BYTES, FINAL_ASSET_MAX_FILES, FINAL_ASSET_MAX_TOTAL_BYTES, FINAL_ASSET_DIRECT_MAX_BYTES,
  checkFinalAssetSelection, fileTooLargeMessage, formatFileSize, planFinalAssetUpload,
  tooManyFilesMessage, tooMuchAtOnceMessage
} from '../src/lib/uploadLimits.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const MB = 1024 * 1024;
const GB = 1024 * MB;

// Rodny, 24 de septiembre de 2026: un video de 30 MB no subía a la pieza final y el aviso decía
// «FILE_TOO_LARGE». El tope real eran 25 MB puestos dos veces, y el mensaje era un código en inglés.

test('a normal video fits, and what does not fit is explained in words', () => {
  assert.equal(FINAL_ASSET_MAX_BYTES, 100 * MB, 'un reel de minuto y medio en buena calidad cabe');
  assert.equal(checkFinalAssetSelection([{ name: 'reel.mp4', size: 30 * MB }]), null, 'los 30 MB de Rodny suben');

  // Ya no hay un peso que sencillamente no entre: lo que no cabe por el servidor sube directo al
  // almacenamiento. El mensaje sigue existiendo y lo usa el muro del servidor, que no tiene ese camino.
  assert.equal(
    fileTooLargeMessage({ name: 'campaña.mov', size: 140 * MB }),
    '«campaña.mov» pesa 140 MB y el máximo por archivo es 100 MB.',
    'el aviso dice el archivo, su peso y el límite, nunca un código'
  );
  assert.equal(fileTooLargeMessage(null), 'Ese archivo supera el máximo de 100 MB por archivo.', 'sin el archivo delante, al menos el límite');
  assert.equal(
    checkFinalAssetSelection([{ name: 'máster.mov', size: 3 * GB }]),
    '«máster.mov» pesa 3 GB y el máximo por archivo es 2 GB.',
    'por encima de lo que admite una entrega firmada sí se rechaza, con el límite correcto'
  );

  const many = Array.from({ length: FINAL_ASSET_MAX_FILES + 1 }, (_, index) => ({ name: `foto-${index}.jpg`, size: MB }));
  assert.equal(checkFinalAssetSelection(many), tooManyFilesMessage());

  assert.equal(checkFinalAssetSelection([]), 'Selecciona al menos un archivo.');
  assert.equal(formatFileSize(30 * MB), '30 MB');
  assert.equal(formatFileSize(1.5 * MB), '1,5 MB');
  assert.equal(formatFileSize(400 * 1024), '400 KB');
  assert.equal(formatFileSize(2 * GB), '2 GB');
});

test('the heavy stuff takes the direct road, and what already worked keeps its road', () => {
  assert.equal(FINAL_ASSET_DIRECT_MAX_BYTES, 2 * GB);
  assert.equal(FINAL_ASSET_MAX_TOTAL_BYTES, 200 * MB);

  assert.deepEqual(
    planFinalAssetUpload([{ name: 'reel.mp4', size: 30 * MB }]),
    { problem: null, mode: 'server' },
    'lo que hoy funciona no cambia de camino: si la subida directa fallara, no rompe lo de siempre'
  );
  assert.deepEqual(
    planFinalAssetUpload([{ name: 'máster.mov', size: 600 * MB }]),
    { problem: null, mode: 'direct' },
    'un archivo que no cabe en la memoria del servidor va por su cuenta'
  );

  // Tres de 90 MB: ninguno pasa el tope por archivo, pero juntos no caben en un solo envío al servidor.
  const heavy = Array.from({ length: 3 }, (_, index) => ({ name: `video-${index}.mp4`, size: 90 * MB }));
  assert.deepEqual(planFinalAssetUpload(heavy), { problem: null, mode: 'direct' });
  assert.equal(
    tooMuchAtOnceMessage(270 * MB),
    'Estás subiendo 270 MB de una vez y el máximo por envío es 200 MB. Divídelo en varias cargas.',
    'el muro del servidor conserva su frase para un cliente viejo que mande todo por el formulario'
  );

  assert.equal(planFinalAssetUpload([]).mode, null);
});

test('the limit lives in one place: the route, the storage and the screen read the same number', async () => {
  const route = await read('src/routes/api/content.js');
  assert.match(route, /limits: \{ fileSize: FINAL_ASSET_MAX_BYTES, files: 1 \}/);
  assert.match(route, /limits: \{ fileSize: FINAL_ASSET_MAX_BYTES, files: FINAL_ASSET_MAX_FILES \}/);
  assert.doesNotMatch(route, /25 \* 1024 \* 1024|50 \* 1024 \* 1024/, 'ningún tope suelto en la ruta');
  assert.match(route, /receiveFinalAssets\(upload\.single\('file'\)\)/);
  assert.match(route, /receiveFinalAssets\(carouselUpload\.array\('files', FINAL_ASSET_MAX_FILES\)\)/);
  assert.match(route, /error\?\.code === 'LIMIT_FILE_SIZE'[\s\S]{0,160}fileTooLargeMessage/, 'el 413 contesta una frase, no el código');
  assert.match(route, /total > FINAL_ASSET_MAX_TOTAL_BYTES/, 'multer no suma el envío: lo suma la ruta');

  // El guardado tenía su propio tope de 25 MB que ganaba siempre: ahora quien llama fija el suyo.
  const storage = await read('src/services/s3Service.js');
  assert.match(storage, /uploadToS3 = async \(file, folder = "chat", \{ maxBytes = 25 \* 1024 \* 1024 \} = \{\}\)/);
  assert.match(storage, /validateUploadFile\(file, \{ maxBytes \}\)/);

  const service = await read('src/services/contentService.js');
  assert.equal((service.match(/maxBytes: FINAL_ASSET_MAX_BYTES/g) || []).length, 2, 'la pieza suelta y el carrusel');
  assert.match(service, /throw new Error\(fileTooLargeMessage\(oversized\)\)/);

  const screen = await read('src/components/modules/ContentPlanDetail.jsx');
  // La pantalla ya no solo avisa: además elige el camino, así que lee el plan completo, no solo el motivo.
  assert.match(screen, /const \{ problem, mode \} = planFinalAssetUpload\(files\);/, 'la pantalla avisa antes de gastar la subida');
  assert.match(screen, /toast\.error\(problem\)/);
  assert.match(screen, /finalAssetUploadMutation\.mutate\(\{ itemId, files, mode \}\)/);
});
