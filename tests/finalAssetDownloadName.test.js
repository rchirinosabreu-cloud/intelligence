import test from 'node:test';
import assert from 'node:assert/strict';
import { finalAssetDownloadName } from '../src/lib/finalAssetDownloadName.js';

test('conserva el nombre subido, incluidos tildes, espacios y extensión original',()=>{
  for(const name of ['Vacante – edición final.MP4','Carrusel 02.png','Diseño.pdf'])
    assert.equal(finalAssetDownloadName({name,mimeType:'video/mp4'},{title:'Otro título'}),name);
});
test('sin nombre usa el título y tipo del archivo, nunca la clave interna',()=>{
  assert.equal(finalAssetDownloadName({storageKey:'uuid.mp4',mimeType:'video/mp4'},{title:'Vacante creativa'}),'Vacante creativa.mp4');
  assert.equal(finalAssetDownloadName({mimeType:'video/webm'},{title:'Vacante creativa'},1),'Vacante creativa - 2.webm');
  assert.equal(finalAssetDownloadName({mimeType:'application/pdf'},{}),'Entregable.pdf');
  assert.equal(finalAssetDownloadName({mimeType:'unknown'},{}),'Entregable');
});
