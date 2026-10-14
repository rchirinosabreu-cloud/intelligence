import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { decodeUploadedFilename } from '../src/lib/uploadFilename.js';

// Nombres con tildes (Rodny, 14 de octubre de 2026: «los archivos cuyo nombre tienen
// acentos o carácteres especiales no se están reconociendo»). Subió 17 documentos al
// Drive y quedaron guardados como «GestiÃ³n de Incidentes». No era la pantalla: así
// estaban en la base.
//
// La causa: el formulario manda el nombre en UTF-8, pero el estándar de los formularios
// no dice en qué codificación viene y la librería que los lee lo interpreta byte a byte
// (latin1). «ó» son dos bytes, 0xC3 0xB3, y leídos de uno en uno son «Ã» y «³».

test('un nombre con tildes mal leído se recupera', () => {
    assert.equal(decodeUploadedFilename('PRO-SI-004 GestiÃ³n de Incidentes v1.0.pdf'), 'PRO-SI-004 Gestión de Incidentes v1.0.pdf');
    assert.equal(decodeUploadedFilename('AutoevaluaciÃ³n de Cumplimiento.pdf'), 'Autoevaluación de Cumplimiento.pdf');
    assert.equal(decodeUploadedFilename('EliminaciÃ³n y DevoluciÃ³n.pdf'), 'Eliminación y Devolución.pdf');
    assert.equal(decodeUploadedFilename('DiseÃ±o de marca.ai'), 'Diseño de marca.ai');
});

// Lo más importante: un nombre que ya está bien no se puede romper al «arreglarlo».
test('un nombre que ya está bien se queda igual', () => {
    for (const nombre of [
        'Gestión de Incidentes.pdf',
        'Diseño de marca.ai',
        'Reunión con Villa Montaña.mp3',
        'informe.pdf',
        'Niño — año 2026 (v2).docx'
    ]) {
        assert.equal(decodeUploadedFilename(nombre), nombre, `no debía tocar «${nombre}»`);
    }
});

test('lo que no es latin1 se deja intacto', () => {
    // Un nombre con caracteres fuera de un byte no pudo venir mal leído de esta forma.
    assert.equal(decodeUploadedFilename('契約書.pdf'), '契約書.pdf');
    assert.equal(decodeUploadedFilename('emoji 🎬 final.mp4'), 'emoji 🎬 final.mp4');
});

test('vacío, nulo o sin tildes no cambia nada', () => {
    assert.equal(decodeUploadedFilename(''), '');
    assert.equal(decodeUploadedFilename(null), '');
    assert.equal(decodeUploadedFilename(undefined), '');
    assert.equal(decodeUploadedFilename('reporte-2026.pdf'), 'reporte-2026.pdf');
});

// Dos veces no empeora lo ya corregido: la reparación de lo guardado puede repetirse.
test('aplicarlo dos veces da lo mismo que una', () => {
    const roto = 'PRO-SI-004 GestiÃ³n de Incidentes v1.0.pdf';
    const una = decodeUploadedFilename(roto);
    assert.equal(decodeUploadedFilename(una), una);
});

// La corrección vive en la puerta, no en cada módulo: las subidas usan el almacenamiento
// compartido, que arregla el nombre antes de que nadie lo lea. Si alguien vuelve a poner
// `multer.memoryStorage()` directo, su módulo guardaría otra vez «GestiÃ³n».
test('ningún módulo abre su propia puerta de subida', async () => {
    const culpables = [];
    for await (const file of glob('src/**/*.js')) {
        const ruta = file.replace(/\\/g, '/');
        if (ruta.endsWith('src/lib/uploadStorage.js')) continue;
        const code = await readFile(file, 'utf8');
        // Toda subida pasa por el almacenamiento compartido (en memoria) o, si guarda en
        // disco, por `acceptUpload` como fileFilter. Las dos cosas viven en uploadStorage.
        if (code.includes('multer.memoryStorage()')) culpables.push(`${ruta} (usa multer.memoryStorage directo)`);
        else if (/multer\(\{/.test(code) && !code.includes('uploadStorage.js')) culpables.push(`${ruta} (recibe archivos sin pasar por uploadStorage)`);
    }
    assert.deepEqual(culpables, [], `cada subida tiene que pasar por src/lib/uploadStorage.js:\n${culpables.join('\n')}`);
});
