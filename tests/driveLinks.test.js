import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVE_PROVIDER, driveLinkProblem, parseDriveFileId,
  drivePreviewUrl, driveThumbnailUrl, driveOpenUrl
} from '../src/lib/driveLinks.js';

// Rodny, 24 de septiembre de 2026: un video que no cabe se puede entregar como enlace de Drive.
// Lo que llega pegado del navegador viene en varias formas y el cliente lo verá desde fuera,
// así que el enlace se entiende aquí una vez y se guarda ya resuelto.

test('reconoce las formas en que Drive reparte un enlace', () => {
  const id = '1AbC_-defGHIjklMNOpqrSTUvwx23456';

  for (const link of [
    `https://drive.google.com/file/d/${id}/view?usp=sharing`,
    `https://drive.google.com/file/d/${id}/preview`,
    `https://drive.google.com/file/d/${id}/view?usp=drive_link&resourcekey=0-abc`,
    `https://docs.google.com/file/d/${id}/edit`,
    `https://drive.google.com/open?id=${id}`,
    `https://drive.google.com/uc?export=download&id=${id}`,
    `  https://drive.google.com/file/d/${id}/view  `
  ]) {
    assert.equal(parseDriveFileId(link), id, `no entendió ${link}`);
    assert.equal(driveLinkProblem(link), null);
  }
});

test('lo que no es un archivo de Drive se rechaza diciendo por qué', () => {
  const id = '1AbC_-defGHIjklMNOpqrSTUvwx23456';

  assert.equal(driveLinkProblem(''), 'Pega el enlace del archivo en Google Drive.');
  assert.equal(
    driveLinkProblem(`https://drive.google.com/drive/folders/${id}`),
    'Ese es el enlace de una carpeta. Abre el archivo en Drive y copia el enlace del archivo.'
  );
  assert.equal(
    driveLinkProblem(`https://docs.google.com/document/d/${id}/edit`),
    'Ese enlace es de un documento de Google, no de un archivo subido a Drive.'
  );
  assert.equal(
    driveLinkProblem('https://www.dropbox.com/s/abc/video.mp4'),
    'Por ahora solo se aceptan enlaces de Google Drive.'
  );
  assert.equal(
    driveLinkProblem('http://drive.google.com/file/d/' + id + '/view'),
    'El enlace tiene que empezar por https://'
  );
  assert.equal(
    driveLinkProblem('https://drive.google.com/file/d//view'),
    'No encontré el identificador del archivo en ese enlace.'
  );

  assert.equal(parseDriveFileId('https://www.dropbox.com/s/abc/video.mp4'), null);
  assert.equal(parseDriveFileId(null), null);
});

test('del identificador salen las tres direcciones que usa la parrilla', () => {
  const id = '1AbC_-defGHIjklMNOpqrSTUvwx23456';

  assert.equal(drivePreviewUrl(id), `https://drive.google.com/file/d/${id}/preview`);
  assert.equal(driveThumbnailUrl(id), `https://drive.google.com/thumbnail?id=${id}&sz=w1600`);
  assert.equal(driveOpenUrl(id), `https://drive.google.com/file/d/${id}/view`);
  assert.equal(DRIVE_PROVIDER, 'DRIVE');

  // Un identificador inventado no produce una dirección a medias.
  for (const bad of [null, '', 'no espacios ni símbolos']) {
    assert.equal(drivePreviewUrl(bad), null);
    assert.equal(driveThumbnailUrl(bad), null);
    assert.equal(driveOpenUrl(bad), null);
  }
});
