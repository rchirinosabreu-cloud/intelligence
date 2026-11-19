import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Rodny, 18 de noviembre de 2026: «botón oscuro y letra oscura … es una forma de razonar … cómo manejar los
// contrastes» y, al ver el cian con azul noche, «oscuro sobre oscuro». Un botón es claramente claro con letra oscura o
// claramente oscuro con letra clara; nunca de tono medio. La medición real va en tests/browser/buttonContrast.mjs.
const css = readFileSync('src/index.css', 'utf8');
const button = readFileSync('src/components/ui/button.jsx', 'utf8');

test('the primary token is deep cyan with white in light and light cyan with night in dark', () => {
  const [light, dark] = [...css.matchAll(/--primary: ([^;]+);\s*--primary-foreground: ([^;]+);/g)].map(m => [m[1], m[2]]);
  assert.deepEqual(light, ['191.2 100% 29.4%', '0 0% 100%']);
  assert.deepEqual(dark, ['191.3 75% 72%', '211 72% 13%']);
});

test('the shared Button and every primary button read the token, never a hand-written cyan with white', () => {
  assert.match(button, /default: 'bg-primary text-primary-foreground hover:bg-primary\/90'/);
  const offenders = execSync(`grep -rnoE 'className="[^"]*"' src --include=*.jsx || true`, { encoding: 'utf8', maxBuffer: 1e9 }).split('\n')
    .filter(line => /(^|[" ])bg-(brand-cyan|\[#009EB9\]|\[#009BBF\]|primary)( |")/.test(line) && /( |")text-white( |")/.test(line));
  assert.deepEqual(offenders, [], 'un botón cian con letra blanca escrita a mano queda de tono medio o falla en oscuro');
});
