import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const dialog = readFileSync(new URL('../src/components/ui/dialog.jsx', import.meta.url), 'utf8');

// Rodny, 18 de noviembre de 2026: «por qué aparecen esos bordes negros sobre botones y muchas cosas en la plataforma?»
test('el anillo de foco es el cian de la marca, nunca negro', () => {
  assert.match(css, /--ring: 191\.3 100% 37\.5%;/);
  assert.doesNotMatch(css, /--ring: 240 10% 3\.9%;/);
});

test('en botones y enlaces el foco solo se dibuja con el teclado; los campos de texto conservan el suyo', () => {
  const rule = css.match(/:is\(([^)]*)\):focus:not\(:focus-visible\)\s*\{([^}]*)\}/);
  assert.ok(rule, 'existe la regla global');
  assert.match(rule[1], /button/);
  assert.match(rule[1], /\ba\b/);
  assert.doesNotMatch(rule[1], /input|textarea|select/, 'un campo de texto sigue mostrando dónde se escribe');
  assert.match(rule[2], /--tw-ring-shadow: 0 0 #0000 !important/);
  assert.match(dialog, /focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none data-\[state=open\]/, 'la X de los diálogos usa focus-visible');
});
