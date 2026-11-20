// El cuadro de texto de Bria crece al escribir, hasta el triple de su alto, y luego desplaza (Rodny, 10 de noviembre de 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/bria/BriaComposer.jsx', 'utf8');

test('crece con el texto hasta el triple y desde ahí desplaza', () => {
  assert.match(source, /export const COMPOSER_BASE_PX = 32;/, 'arranca en una línea (20 de noviembre de 2026)');
  assert.match(source, /export const COMPOSER_MAX_PX = 192;/);
  assert.match(source, /Math\.min\(Math\.max\(Number\(scrollHeight\) \|\| 0, COMPOSER_BASE_PX\), COMPOSER_MAX_PX\)/);
  assert.match(source, /box\.style\.overflowY = box\.scrollHeight > COMPOSER_MAX_PX \? 'auto' : 'hidden'/);
  assert.match(source, /\}, \[value, visible, inputRef\]\);/, 'se recalcula con cada cambio del texto, también con lo dictado');
  assert.match(source, /max-h-48 min-h-8/, 'de 32 a 192 px');
});

test('el cuadro de escribir lleva enviar adentro y todos sus botones redondos miden lo mismo', async () => {
  const { canSendMessage } = await import('../src/lib/briaComposer.js');
  assert.equal(canSendMessage({ value: '  ', files: [] }), false);
  assert.equal(canSendMessage({ value: 'Hola' }), true);
  assert.equal(canSendMessage({ value: '', files: [{}] }), true);
  assert.equal(canSendMessage({ value: 'Hola', blocked: true }), false);
  assert.match(source, /type="submit"[^>]*aria-label="Enviar mensaje"[^>]*disabled=\{!sendable\}/);
  assert.match(source, /data-bria-send/); assert.match(source, /data-bria-mic className=\{`\$\{disc\}[^`]*text-white/, 'el micrófono va en blanco');
  assert.match(source, /const control = '[^']*h-11 w-11/, 'área táctil de 44 px');
  assert.match(source, /const disc = '[^']*h-9 w-9/, 'un mismo círculo de 36 px');
  assert.equal((source.match(/h-11 w-11/g) || []).length, 1, 'ningún botón define otro tamaño');
});

test('la onda del dictado sale del volumen del micrófono y siempre muestra sus barras', async () => {
  const { DICTATION_BARS, pushLevel, levelOf, waveBars } = await import('../src/lib/briaComposer.js');
  assert.equal(levelOf(new Uint8Array(64).fill(128)), 0, 'silencio');
  assert.ok(levelOf(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 160 : 96))) > 0.5, 'voz');
  assert.equal(levelOf(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0))), 1, 'nunca pasa de 1');
  let levels = []; for (let i = 0; i < 40; i += 1) levels = pushLevel(levels, i / 40);
  assert.equal(levels.length, DICTATION_BARS); assert.equal(pushLevel([], 7)[0], 1); assert.equal(pushLevel([], 'x')[0], 0);
  const bars = waveBars([0, 1]);
  assert.equal(bars.length, DICTATION_BARS); assert.equal(bars.at(-1), 100); assert.equal(bars.at(-2), 12); assert.equal(bars[0], 12, 'sin medida todavía, la barra mínima');
  const dictation = readFileSync('src/components/bria/useBriaDictation.js', 'utf8');
  assert.match(dictation, /session\.unmeter\?\.\(\)/, 'al terminar o cancelar se suelta el analizador');
  assert.match(source, /data-bria-recording/);
});

test('en el celular Bria se abre a pantalla completa y sigue a la pantalla visible', () => {
  const assistant = readFileSync('src/components/bria/BriaAssistant.jsx', 'utf8');
  assert.match(assistant, /\(max-width: 639px\)/); assert.match(assistant, /window\.visualViewport/);
  assert.match(assistant, /h-\[100dvh\][^']*sm:w-\[440px\]/);
  assert.match(assistant, /document\.body\.style\.overflow = before/, 'al cerrar la página vuelve a desplazarse');
});
