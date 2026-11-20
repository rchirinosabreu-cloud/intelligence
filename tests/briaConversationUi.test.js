import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
test('the shared conversational surface keeps server history and has no teaching form', async () => {
  const file = 'src/components/bria/BriaConversation.jsx', source = await readFile(file, 'utf8');
  await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
  assert.match(source, /requestBriaChat/); assert.match(source, /\/messages/); assert.match(source, /setQuestion\(value\)/);
  assert.match(source, /Historial/); assert.match(source, /Registro/); assert.match(source, /Nueva conversación/);
  assert.match(source, /data-bria-aura/); assert.match(source, /BriaIsotipo/); assert.match(source, /dark:bg-bria-night/); // la guía de marca de Bria (18 de noviembre de 2026)
  assert.doesNotMatch(source, /brain-ai-header/, 'el chat ya no lleva la franja de color en la cabecera');
  assert.doesNotMatch(source, /Enseñar a Bria|Ajustar|Deshacer|BriaKnowledgePanel|Revisar y guardar/);
});
test('el inicio de Bria cabe completo: no recorta a Bria ni las sugerencias en ventanas bajas', async () => {
  const source = await readFile('src/components/bria/BriaConversation.jsx', 'utf8');
  const home = source.slice(source.indexOf('data-bria-home'), source.indexOf('</ul></div>}', source.indexOf('data-bria-home')));
  assert.match(home, /data-bria-home className="[^"]*min-h-full/, 'crece con su contenido en vez de recortarlo');
  assert.doesNotMatch(home, /data-bria-home className="(?:[^"]* )?h-full/);
  assert.match(home, /Bria3D mood="reposo" className="[^"]*clamp\([^"]*vh/, 'la mascota mide según el alto de la ventana');
  assert.match(home, /\[@media\(max-height:760px\)\]:flex-row/, 'en ventanas bajas Bria pasa al lado del saludo');
  assert.equal((home.match(/suggestions\.map/g) || []).length, 1, 'las sugerencias siguen completas');
});
