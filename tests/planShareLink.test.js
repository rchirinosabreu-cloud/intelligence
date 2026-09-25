import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 25 de septiembre de 2026: «cuando genero un link para compartir la parrilla, ese link no es
// fijo sino que si le vuelvo a dar a compartir, se genera otro link más, diferente, anulando el
// anterior». El enlace que ya tiene el cliente no se puede romper por volver a pulsar Compartir.

test('el enlace de una parrilla es el mismo cada vez que se pide', async () => {
  const service = await read('src/services/contentService.js');
  const share = service.slice(service.indexOf('export const generateShareToken'));

  // Antes: `randomBytes` incondicional y `update`, así que cada pulsación mataba el enlace anterior.
  assert.match(share, /findUnique[\s\S]{0,200}shareToken: true/, 'primero se mira si ya existe uno');
  assert.match(share, /if \(existing\?\.shareToken && !rotate\) return/, 'si ya hay enlace, se devuelve ese');
  assert.match(share, /\{ rotate = false \} = \{\}/, 'cambiarlo es una decisión explícita, no el camino normal');
});

test('desde la pantalla no hay forma de romper el enlace del cliente', async () => {
  const routes = await read('src/routes/api/content.js');
  const editor = await read('src/components/modules/ContentPlanDetail.jsx');

  assert.match(routes, /rotate: req\.body\?\.rotate === true/, 'el servidor solo rota si se lo piden');

  // Rodny, 25 de septiembre de 2026: «¿no es mejor eliminar la opción de generar enlace nuevo?».
  // El botón se quitó; `rotate` sigue en el servicio y en la ruta como salida de emergencia, pero
  // ninguna pantalla lo ofrece, así que pulsar Compartir no puede romper nada.
  assert.match(editor, /Copiar link/);
  assert.doesNotMatch(editor, /Generar un enlace nuevo/);
  assert.doesNotMatch(editor, /rotate: true/, 'ninguna pantalla pide rotar el enlace');
  assert.match(editor, /mutate\(\{ rotate: false \}\)/, 'copiar pide explícitamente no rotar');
  assert.doesNotMatch(editor, /Link compartido generado y copiado/, 'ya no se anuncia como recién generado');
});
