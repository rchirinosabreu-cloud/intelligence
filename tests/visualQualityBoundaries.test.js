import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('application shell avoids persistent animated blur decorations', async () => {
  const source = await read('src/components/layout/AppLayout.jsx');

  assert.doesNotMatch(source, /Ambient Glow|Top Left Orb|Bottom Right Orb|Center Orb/);
  assert.doesNotMatch(source, /blur-\[(?:120|140)px\]/);
});

test('new platform dialog supports both themes and the destructive token', async () => {
  const source = await read('src/components/ui/ConfirmDialog.jsx');

  assert.match(source, /bg-white/);
  assert.match(source, /dark:bg-slate-900/);
  assert.match(source, /bg-destructive/);
  assert.match(source, /text-destructive/);
  assert.doesNotMatch(source, /#[Ee]11[Dd]48/, 'Shared dialogs must consume the global token instead of duplicating its hex value.');
});

// Roboto Condensed es la tipografía del negocio (Rodny, 10 de octubre de 2026). Se declara en dos
// sitios y nada más: el enlace de Google Fonts en la cabecera y `fontFamily.sans` de Tailwind, de
// donde la toma el `body`. Quien la escriba a mano en una pantalla la deja fuera de cualquier
// cambio futuro, que es justo lo que pasó con la rejilla del calendario.
test('la tipografía de marca se carga una sola vez desde la cabecera', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(html, /fonts\.googleapis\.com\/css2\?family=Roboto\+Condensed/);
  // Los pesos: la plataforma usa de `font-medium` (500) a `font-black` (900), y hay cursivas.
  assert.match(html, /ital,wght@0,100\.\.900;1,100\.\.900/, 'el eje variable cubre todos los pesos y la cursiva');
  assert.doesNotMatch(css, /@import[^;]*fonts\.googleapis\.com/, 'nunca por @import: bloquea el pintado');
});

test('la familia se declara en un solo sitio y nadie la escribe a mano', async () => {
  const tailwind = await readFile(new URL('../tailwind.config.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8');

  assert.match(tailwind, /sans: \['Roboto Condensed', 'Roboto', 'system-ui', 'sans-serif'\]/);
  assert.match(css, /--brain-font-sans: 'Roboto Condensed', 'Roboto', system-ui, sans-serif;/);
  assert.match(css, /@apply [^;]*font-sans/, 'el body hereda la familia de Tailwind');

  // Un rincón que pinta fuera del árbol (la rejilla de react-datepicker) usa el token, no el nombre.
  const familias = [...css.matchAll(/font-family:\s*([^;]+);/g)].map(match => match[1].trim());
  for (const familia of familias) {
    assert.match(familia, /var\(--brain-font-sans\)|^var\(/, `«font-family: ${familia}» tiene que salir del token`);
  }
});

test('las muestras locales se ven con la misma tipografía que producción', async () => {
  // Si una muestra carga otra fuente, lo que se revisa y lo que se captura no es lo que se despliega.
  const { readdir } = await import('node:fs/promises');
  const dir = new URL('../tests/fixtures/', import.meta.url);
  const nombres = (await readdir(dir)).filter(name => name.endsWith('.html'));

  for (const nombre of nombres) {
    const html = await readFile(new URL(nombre, dir), 'utf8');
    if (!html.includes('fonts.googleapis.com')) continue;
    assert.match(html, /family=Roboto\+Condensed/, `${nombre} carga la tipografía de marca`);
    assert.doesNotMatch(html, /family=DM\+Sans/, `${nombre} ya no carga DM Sans`);
  }
});
