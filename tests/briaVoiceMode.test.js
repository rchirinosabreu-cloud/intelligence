// La voz de Bria con ElevenLabs (Rodny, 20 de noviembre de 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { speakableText, voiceConfig, hearTurn, VOICE_MAX_CHARS, VOICE_TAIL, VOICE_SILENCE_MS } from '../src/lib/briaVoice.js';
import { createElevenLabsClient } from '../src/services/elevenLabsClient.js';
import { createBriaVoiceService } from '../src/services/briaVoiceService.js';
import { createBriaVoiceRouter } from '../src/routes/api/briaVoice.js';
import { createGovernedFetch } from '../src/services/aiEgress.js';

const env = { ELEVENLABS_API_KEY: 'clave-de-prueba', ELEVENLABS_VOICE_ID: 'JBFqnCBsd6RMkjVDRZzb' };
const pm = { id: 'u1', role: 'PROJECT_MANAGER', modulePermissions: { bria: true } };
const quietLog = { record: async () => {} };

test('lo que Bria dice en voz no lleva formato, enlaces, tablas ni código, y se corta en una frase', () => {
  const said = speakableText('## Hoy\n\n- **Aristea** lleva 11 días en rojo.\n- Mira [la parrilla](https://x.co/p) y `ContentItem`.\n\n| a | b |\n|---|---|\n\n```js\nconst x = 1;\n```\nhttps://labs.x.co/ruta');
  assert.equal(said, 'Hoy. Aristea lleva 11 días en rojo. Mira la parrilla y ContentItem.');
  const long = speakableText(Array.from({ length: 80 }, (_, i) => `Esta es la frase número ${i} de una respuesta muy larga.`).join(' '));
  assert.ok(long.length <= VOICE_MAX_CHARS); assert.ok(long.endsWith(VOICE_TAIL)); assert.match(long.slice(0, -VOICE_TAIL.length).trim(), /[.!?]$/);
  assert.equal(speakableText('  '), ''); assert.equal(speakableText(null), '');
});

test('sin clave o sin voz, Bria no habla; el modelo y el tope se pueden ajustar', () => {
  assert.equal(voiceConfig({}).enabled, false);
  assert.equal(voiceConfig({ ELEVENLABS_API_KEY: 'x' }).enabled, false);
  assert.equal(voiceConfig({ ...env, ELEVENLABS_VOICE_ID: '../otra/ruta' }).enabled, false, 'el id de voz no puede traer rutas');
  const config = voiceConfig({ ...env, ELEVENLABS_MODEL_ID: 'eleven_v4_turbo', BRIA_VOICE_DAILY_CHARS: '500' });
  assert.deepEqual([config.enabled, config.model, config.dailyChars], [true, 'eleven_v4_turbo', 500]);
  assert.equal(voiceConfig({ ...env, ELEVENLABS_MODEL_ID: 'x y', BRIA_VOICE_DAILY_CHARS: '-1' }).model, 'eleven_flash_v2_5');
});

test('el turno se cierra cuando la persona ya habló y calla un rato', () => {
  let state = {}, at = 0; const feed = (level, ms) => { for (let t = 0; t < ms; t += 100) { at += 100; state = hearTurn(state, { level, at }); } return state; };
  assert.equal(feed(0.02, 3000).done, false, 'silencio antes de hablar no cierra nada');
  assert.equal(feed(0.5, 800).spoke, true);
  assert.equal(feed(0.02, VOICE_SILENCE_MS - 200).done, false);
  assert.equal(feed(0.4, 300).done, false, 'si retoma, el silencio vuelve a contar');
  assert.equal(feed(0.02, VOICE_SILENCE_MS + 100).done, true);
  let blip = {}; blip = hearTurn(blip, { level: 0.9, at: 100 }); blip = hearTurn(blip, { level: 0.9, at: 200 });
  for (let t = 300; t < 4000; t += 100) blip = hearTurn(blip, { level: 0, at: t });
  assert.equal(blip.done, false, 'un golpe corto no es hablar');
});

test('la salida a ElevenLabs pasa por la puerta de egreso: destino inventariado, modelo identificado y sin metadatos internos', async () => {
  let decision, sent;
  const client = createElevenLabsClient({ config: () => voiceConfig(env), usageLog: quietLog, governance: { assertEgress: async (context) => { decision = context; } }, fetchImpl: async (url, options) => { sent = { url, options }; return new Response('audio', { status: 200, headers: { 'content-type': 'audio/mpeg' } }); } });
  const response = await client.speak({ text: 'Hola' });
  assert.equal(await response.text(), 'audio');
  assert.deepEqual([decision.provider, decision.model, decision.useCase], ['elevenlabs', 'eleven_flash_v2_5', 'bria.voice']);
  assert.equal(sent.url, 'https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb/stream?output_format=mp3_44100_128');
  assert.equal(sent.options.headers['xi-api-key'], 'clave-de-prueba'); assert.equal(sent.options.governanceContext, undefined);
  assert.deepEqual(JSON.parse(sent.options.body), { text: 'Hola', model_id: 'eleven_flash_v2_5', language_code: 'es' });
  const blocked = createElevenLabsClient({ config: () => voiceConfig(env), usageLog: quietLog, governance: { assertEgress: async () => { throw Object.assign(new Error('no'), { code: 'AI_SCOPE_REQUIRED', status: 403 }); } }, fetchImpl: async () => { throw new Error('no debe salir'); } });
  await assert.rejects(blocked.speak({ text: 'Hola' }), { code: 'AI_SCOPE_REQUIRED' });
  await assert.rejects(createElevenLabsClient({ config: () => voiceConfig({}) }).speak({ text: 'Hola' }), { code: 'VOICE_NOT_CONFIGURED' });
  const out = createElevenLabsClient({ config: () => voiceConfig(env), usageLog: quietLog, governance: { assertEgress: async () => {} }, fetchImpl: async () => new Response('{}', { status: 401 }) });
  await assert.rejects(out.speak({ text: 'Hola' }), (failure) => failure.code === 'VOICE_KEY_REJECTED' && !failure.message.includes('clave-de-prueba'));
  // Otros destinos de ElevenLabs no están inventariados.
  const send = createGovernedFetch({ usageLog: quietLog, governance: { assertEgress: async () => {} }, fetchImpl: async () => new Response('x') });
  await assert.rejects(send('https://api.elevenlabs.io/v1/voices', { body: '{}' }), { code: 'AI_DESTINATION_INVALID' });
  await assert.rejects(send('https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb/stream', { body: '{}' }), { code: 'AI_SCOPE_REQUIRED' }, 'sin modelo no sale');
});

test('el servicio: solo quien dirige con Bria, texto limpio, tope diario apartado antes de llamar', async () => {
  const said = [];
  const client = { speak: async ({ text }) => { said.push(text); return new Response('audio'); } };
  let day = new Date('2026-11-20T15:00:00Z');
  const service = createBriaVoiceService({ client, config: () => ({ ...voiceConfig(env), dailyChars: 30 }), now: () => day });
  assert.deepEqual(service.status(pm), { enabled: true, remaining: 30 });
  assert.deepEqual(service.status({ ...pm, role: 'EDITOR' }), { enabled: false });
  assert.deepEqual(service.status({ ...pm, modulePermissions: {} }), { enabled: false });
  await assert.rejects(service.speak({ ...pm, role: 'EDITOR' }, { text: 'Hola' }), { status: 403 });
  await service.speak(pm, { text: '**Hola**, [mira](https://x.co)' });
  assert.deepEqual(said, ['Hola, mira']); assert.equal(service.status(pm).remaining, 20);
  await assert.rejects(service.speak(pm, { text: 'x'.repeat(21) }), { code: 'VOICE_DAILY_LIMIT' });
  await assert.rejects(service.speak(pm, { text: '   ' }), { code: 'VOICE_EMPTY' });
  day = new Date('2026-11-21T15:00:00Z');
  assert.equal(service.status(pm).remaining, 30, 'al día siguiente vuelve la voz');
  const failing = createBriaVoiceService({ client: { speak: async () => { throw Object.assign(new Error('x'), { status: 502 }); } }, config: () => voiceConfig(env), now: () => day });
  await assert.rejects(failing.speak(pm, { text: 'Hola' }));
  assert.equal(failing.status(pm).remaining, voiceConfig(env).dailyChars, 'lo que no se dijo no se cobra al tope');
  assert.deepEqual(createBriaVoiceService({ client, config: () => voiceConfig({}) }).status(pm), { enabled: false });
  // Con cuenta pero sin voz elegida, solo quien administra entra a ver la pantalla, y Bria no habla todavía.
  const quiet = createBriaVoiceService({ client, config: () => voiceConfig({ ELEVENLABS_API_KEY: 'k' }), now: () => day });
  const admin = { userId: 'jefe', role: 'ADMIN', modulePermissions: { bria: true } };
  assert.deepEqual(quiet.status(pm), { enabled: false }, 'sin voz elegida, el equipo todavía no la ve');
  assert.deepEqual(quiet.status(admin), { enabled: true, remaining: 20000, silent: true });
  await assert.rejects(quiet.speak(admin, { text: 'Hola' }), { code: 'VOICE_NOT_CONFIGURED' });
  // La sesión real trae userId y no id: el tope es de cada persona, no uno compartido por todos.
  const perPerson = createBriaVoiceService({ client, config: () => ({ ...voiceConfig(env), dailyChars: 10 }), now: () => day });
  const ana = { userId: 'ana', role: 'ADMIN', modulePermissions: { bria: true } }, luis = { ...ana, userId: 'luis' };
  await perPerson.speak(ana, { text: 'x'.repeat(10) });
  assert.equal(perPerson.status(ana).remaining, 0); assert.equal(perPerson.status(luis).remaining, 10);
  await perPerson.speak(luis, { text: 'Hola' });
});

test('la ruta entrega el audio y nunca un texto vacío', async () => {
  const app = express(); app.use(express.json()); let user = pm;
  app.use((req, _res, next) => { req.user = user; next(); });
  app.use('/voice', createBriaVoiceRouter({ service: { status: () => ({ enabled: true, remaining: 5 }), speak: async (_user, { text }) => { if (text === 'tope') throw Object.assign(new Error('Bria ya habló lo de hoy.'), { status: 429, code: 'VOICE_DAILY_LIMIT' }); return new Response(`audio:${text}`, { headers: { 'content-type': 'audio/mpeg' } }); } } }));
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}/voice`;
  const post = (text) => fetch(`${base}/speak`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  try {
    assert.deepEqual(await (await fetch(base)).json(), { enabled: true, remaining: 5 });
    const ok = await post('Hola'); assert.equal(ok.headers.get('content-type'), 'audio/mpeg'); assert.equal(await ok.text(), 'audio:Hola'); assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.equal((await post('  ')).status, 400); assert.equal((await post(undefined)).status, 400);
    const limit = await post('tope'); assert.equal(limit.status, 429); assert.equal((await limit.json()).code, 'VOICE_DAILY_LIMIT');
    user = { ...pm, modulePermissions: {} }; assert.equal((await fetch(base)).status, 403);
  } finally { server.close(); }
});

test('la pantalla de voz: fases, qué se dice y cómo se abre', async () => {
  const { readFileSync } = await import('node:fs');
  const { transformWithEsbuild } = await import('vite');
  const mode = readFileSync('src/components/bria/BriaVoiceMode.jsx', 'utf8'), composer = readFileSync('src/components/bria/BriaComposer.jsx', 'utf8'), conversation = readFileSync('src/components/bria/BriaConversation.jsx', 'utf8'), dictation = readFileSync('src/components/bria/useBriaDictation.js', 'utf8');
  await transformWithEsbuild(mode, 'BriaVoiceMode.jsx', { loader: 'jsx', jsx: 'automatic' });
  assert.match(mode, /handsFree: true/); assert.match(mode, /send\(said\)/, 'lo dicho entra al chat por el mismo envío de siempre');
  assert.match(mode, /replyToSpeak\(chat, spoken\.current\)/); assert.match(mode, /VOICE_DAILY_LIMIT/);
  assert.match(mode, /aria-label="Cerrar la voz"/); assert.match(mode, /Pausar el micrófono/); assert.match(mode, /Interrumpir a Bria/);
  assert.match(mode, /env\(safe-area-inset-bottom\)/); assert.match(mode, /clamp\([^)]*vh/, 'el círculo mide según el alto de la pantalla');
  assert.match(dictation, /hearTurn\(session\.turn/); assert.match(dictation, /callbacks\.current\.onIdle/);
  assert.match(composer, /onVoice && !sendable/, 'el botón de voz solo ocupa el lugar de enviar con el cuadro vacío');
  assert.match(conversation, /voiceReady && view === 'chat' \? openVoice : undefined/, 'sin voz configurada no hay botón');
  assert.match(conversation, /new Audio\('data:audio\/wav;base64,/, 'el audio se estrena dentro del toque');
  // El círculo plano cuenta el estado con movimiento: en pantalla no hay rótulos, texto dictado ni lista de voces.
  const orb = readFileSync('src/components/bria/BriaVoiceOrb.jsx', 'utf8');
  await transformWithEsbuild(orb, 'BriaVoiceOrb.jsx', { loader: 'jsx', jsx: 'automatic' });
  assert.match(mode, /<BriaVoiceOrb state=/); assert.doesNotMatch(mode, /Bria3D|data-bria-voice-pick|data-bria-voice-heard|preview/);
  assert.match(mode, /role="status" aria-live="polite" className="sr-only"/, 'el estado se dice solo a los lectores de pantalla');
  assert.match(orb, /prefers-reduced-motion/); assert.match(orb, /if \(current !== 'paused'\) clock \+=/, 'en pausa las nubes no se mueven'); assert.doesNotMatch(orb, /shadow|inset/, 'plano: sin brillo ni sombra de esfera');
  assert.match(dictation, /if \(handsFree \|\| recording\.current !== session/, 'en la voz no se pide el texto en gris');
  assert.match(mode, /if \(!reply \|\| silent\)/, 'sin voz elegida no se pide audio');
  // Hablar mientras escribe: la pantalla recibe el texto en vivo y manda a decir cada frase completa.
  assert.match(mode, /nextSpeech\(liveText, state\.said, \{ first: state\.total === 0 \}\)/);
  assert.match(conversation, /liveText=\{live\.text\}/); assert.match(conversation, /send\(said, \{ channel: 'voz' \}\)/);
  assert.match(mode, /!paused && !busy && voice === 'idle'/, 'no se graba mientras Bria todavía escribe');
  // Funciones puras, copiadas de sus módulos para probarlas sin el empaquetador.
  const pure = [mode.match(/export const replyToSpeak = [^\n]+/)[0], mode.match(/export const orbLevel = [^\n]+/)[0], orb.match(/export const orbEnergy = [\s\S]*?\n};/)[0]].join('\n');
  const { orbEnergy, orbLevel, replyToSpeak } = await import(`data:text/javascript,${encodeURIComponent(pure)}`);
  assert.equal(orbLevel([]), 0); assert.equal(orbLevel([0, 0.5]), 0.5); assert.equal(orbLevel([9]), 1);
  assert.equal(orbEnergy('paused', 1), 0); assert.equal(orbEnergy('thinking'), 0.85); assert.equal(orbEnergy('listening', 0), 0.18); assert.equal(orbEnergy('listening', 5), 1);
  assert.ok(orbEnergy('speaking', 0, 0.4) >= 0.45 && orbEnergy('speaking', 0, 0.4) <= 0.85);
  const chat = { turns: [{ id: 'u1', role: 'user', text: 'Hola' }, { id: 'a1', role: 'assistant', text: 'Hola, Rodny.' }] };
  assert.equal(replyToSpeak(chat, null).id, 'a1'); assert.equal(replyToSpeak(chat, 'a1'), null, 'no repite lo ya dicho');
  assert.equal(replyToSpeak({ turns: [chat.turns[0]] }, null), null); assert.equal(replyToSpeak(null, null), null);
  assert.equal(replyToSpeak({ turns: [{ id: 'a2', role: 'assistant', text: '  ' }] }, null), null);
});

test('hablar mientras escribe: los trozos salen en fin de frase, el primero pronto', async () => {
  const { nextSpeech, VOICE_SILENCE_MS } = await import('../src/lib/briaVoice.js');
  const text = 'Claro que sí, Rodny. Hoy tienes dos reuniones: una a las tres con Aristea y otra a las cinco con el equipo. También hay un correo sin responder de ayer.';
  assert.equal(nextSpeech('Claro que', 0, { first: true }), null, 'sin frase completa todavía no dice nada');
  assert.equal(nextSpeech('Sí. ', 0, { first: true }), null, 'una frase demasiado corta espera a la siguiente');
  const first = nextSpeech(text, 0, { first: true });
  assert.equal(first.text, 'Claro que sí, Rodny. Hoy tienes dos reuniones: una a las tres con Aristea y otra a las cinco con el equipo. '.slice(0, first.to)); assert.ok(first.to <= 110 && /[.]\s?$/.test(first.text.trimEnd() + ' '));
  assert.equal(nextSpeech('Cuesta 3.5 millones y', 0, { first: true }), null, 'un decimal no es fin de frase');
  assert.equal(nextSpeech(text, first.to), null, 'lo que sigue espera a tener una frase larga o el final');
  const rest = nextSpeech(text, first.to, { final: true });
  assert.equal(first.text + rest.text, text, 'nada se pierde ni se repite'); assert.equal(rest.to, text.length);
  assert.equal(nextSpeech(text, text.length, { final: true }), null);
  assert.ok(VOICE_SILENCE_MS <= 1000, 'el turno se cierra con menos de un segundo de silencio');
});

test('el canal de voz llega a las instrucciones como último renglón y pide respuestas habladas y cortas', async () => {
  const { buildInstructions } = await import('../src/lib/briaAssistant.js');
  const args = { person: { name: 'Rodny', jobTitle: 'Director' }, today: '2026-11-21', tools: [{ name: 'mis_tareas', description: 'Tus tareas' }] };
  const platform = buildInstructions(args), voice = buildInstructions({ ...args, channel: 'voz' });
  assert.match(voice.split('\n').at(-1), /hablada/); assert.match(voice.split('\n').at(-1), /una a tres frases/);
  assert.equal(voice.split('\n').slice(0, -1).join('\n'), platform.split('\n').slice(0, -1).join('\n'), 'solo cambia el último renglón');
  const routes = (await import('node:fs')).readFileSync('src/routes/api/briaConversations.js', 'utf8');
  assert.match(routes, /req\.body\?\.channel === 'voz'/);
});
