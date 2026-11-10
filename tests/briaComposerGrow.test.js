// El cuadro de texto de Bria crece al escribir, hasta el triple de su alto, y luego desplaza (Rodny, 10 de noviembre de 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/bria/BriaComposer.jsx', 'utf8');

test('crece con el texto hasta el triple y desde ahí desplaza', () => {
  assert.match(source, /export const COMPOSER_BASE_PX = 64;/);
  assert.match(source, /COMPOSER_MAX_PX = COMPOSER_BASE_PX \* 3/);
  assert.match(source, /Math\.min\(Math\.max\(Number\(scrollHeight\) \|\| 0, COMPOSER_BASE_PX\), COMPOSER_MAX_PX\)/);
  assert.match(source, /box\.style\.overflowY = box\.scrollHeight > COMPOSER_MAX_PX \? 'auto' : 'hidden'/);
  assert.match(source, /\}, \[value, visible, inputRef\]\);/, 'se recalcula con cada cambio del texto, también con lo dictado');
  assert.match(source, /max-h-48 min-h-16/, '192 px: el triple de 64');
});
