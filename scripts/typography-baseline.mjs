// Cuenta, archivo por archivo, la tipografía hecha a mano que queda en las pantallas (Rodny, 10 de noviembre de 2026:
// «¿cómo hacemos para que la plataforma tenga esa consistencia visual, tipográfica?»). La prueba
// tests/typographyRoles.test.js no deja que ningún archivo suba de su cuenta ni que uno nuevo empiece con alguna: el
// desorden solo puede bajar. Al migrar una pantalla a los papeles de texto (brain-type-*), regenerar con
//   node scripts/typography-baseline.mjs --write
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const BASELINE_PATH = join(ROOT, 'tests', 'fixtures', 'typographyBaseline.json');

// Lo que rompe la escala: un peso extra negro y un tamaño escrito en píxeles.
export const HANDMADE_TYPE = /\b(?:[a-z0-9-]+:)*(?:font-black|font-extrabold|text-\[\d+(?:\.\d+)?px\])/g;

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : /\.(jsx|tsx)$/.test(name) ? [path] : [];
});

export const countHandmadeType = () => Object.fromEntries(walk(join(ROOT, 'src', 'components'))
  .map((path) => [relative(ROOT, path).split(sep).join('/'), (readFileSync(path, 'utf8').match(HANDMADE_TYPE) || []).length])
  .filter(([, count]) => count > 0)
  .sort(([a], [b]) => a.localeCompare(b)));

if (process.argv.includes('--write')) {
  const counts = countHandmadeType();
  writeFileSync(BASELINE_PATH, `${JSON.stringify(counts, null, 2)}\n`);
  console.log(`${Object.keys(counts).length} archivos, ${Object.values(counts).reduce((a, b) => a + b, 0)} usos`);
}
