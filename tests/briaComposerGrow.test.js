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

test('el texto en gris del dictado: tramos con techo, uno a la vez y sin errores a la vista', async () => {
  const { previewDue, PREVIEW_MAX_BYTES } = await import('../src/lib/briaComposer.js');
  assert.equal(previewDue({ elapsedMs: 1000, bytes: 9000 }), false, 'muy pronto');
  assert.equal(previewDue({ elapsedMs: 2600, bytes: 9000 }), true);
  assert.equal(previewDue({ elapsedMs: 4000, lastAtMs: 2600, bytes: 9000 }), false, 'cada 2,5 s al comienzo');
  assert.equal(previewDue({ elapsedMs: 5200, lastAtMs: 2600, bytes: 9000 }), true);
  assert.equal(previewDue({ elapsedMs: 5200, lastAtMs: 2600, bytes: 9000, pending: true }), false, 'uno a la vez');
  assert.equal(previewDue({ elapsedMs: 43000, lastAtMs: 40000, bytes: 9000 }), false, 'pasados 30 s, cada 5 s');
  assert.equal(previewDue({ elapsedMs: 45000, lastAtMs: 40000, bytes: 9000 }), true);
  assert.equal(previewDue({ elapsedMs: 95000, lastAtMs: 80000, bytes: 9000 }), false, 'pasados 90 s ya no hay adelanto');
  assert.equal(previewDue({ elapsedMs: 9000, bytes: PREVIEW_MAX_BYTES + 1 }), false);
  assert.equal(previewDue({ elapsedMs: 9000, bytes: 0 }), false);

  const { createBriaConversationService } = await import('../src/services/briaConversationService.js');
  const file = { buffer: Buffer.from('audio'), mimetype: 'audio/webm', originalname: 'dictado.webm' };
  let calls = 0, release; const gate = new Promise(resolve => { release = resolve; });
  const make = (role, transcribe) => createBriaConversationService({ resolveActor: async () => ({ ref: 'owner', role }), ai: { transcribe } });
  const service = make('ADMIN', async () => { calls += 1; await gate; return 'Hola Bria'; });
  const first = service.previewTranscription({}, file);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(await service.previewTranscription({}, file), { text: '' }, 'con uno en curso, el segundo vuelve vacío sin llamar');
  release(); assert.deepEqual(await first, { text: 'Hola Bria' }); assert.equal(calls, 1);
  assert.deepEqual(await service.previewTranscription({}, file), { text: 'Hola Bria' }, 'al terminar, se libera');
  assert.deepEqual(await make('ADMIN', async () => { throw Object.assign(new Error('x'), { code: 'NO_SPEECH' }); }).previewTranscription({}, file), { text: '' });
  assert.deepEqual(await service.previewTranscription({}, { ...file, mimetype: 'text/plain' }), { text: '' });
  await assert.rejects(() => make('EDITOR', async () => 'x').previewTranscription({}, file), { status: 403 });
  await assert.rejects(() => make('ADMIN', async () => { throw Object.assign(new Error('x'), { code: 'AI_AUTHORIZATION_REQUIRED' }); }).previewTranscription({}, file), { code: 'AI_AUTHORIZATION_REQUIRED' }, 'un bloqueo de gobierno de IA no se esconde');

  const dictation = readFileSync('src/components/bria/useBriaDictation.js', 'utf8'), routes = readFileSync('src/routes/api/briaConversations.js', 'utf8');
  assert.match(dictation, /\/dictation\/preview/); assert.match(dictation, /clearInterval\(session\.peek\)/);
  assert.ok(routes.indexOf("'/dictation/preview'") < routes.indexOf("router.use('/:id'"), 'la ruta va antes de las rutas por conversación');
  assert.match(routes, /'\/dictation\/preview', authorizeInput/);
  assert.match(source, /data-bria-dictation-preview/);
});
