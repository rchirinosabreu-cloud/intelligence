// Los gestos de la mascota y la consulta desde la mascota (Rodny, 11 de octubre de 2026: «cuando poso el cursor
// sobre ella, aparecen dos iconos … la barra de consulta escribiendo o enviando un audio, ninguno es un chat nuevo …
// cuando uno pasa el cursor, hace un movimiento, cuando está escribiendo, se inclina … un movimiento suave y
// natural siempre»). La regla del gesto es pura; el movimiento es CSS sobre el lienzo y respeta reduced motion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { briaGesture, GESTURES } from '../src/lib/briaMascotGesture.js';

const css = readFileSync('src/index.css', 'utf8');
const assistant = readFileSync('src/components/bria/BriaAssistant.jsx', 'utf8');
const quickAsk = readFileSync('src/components/bria/BriaQuickAsk.jsx', 'utf8');
const mascot = readFileSync('src/components/bria/BriaMascot.jsx', 'utf8');
const composer = readFileSync('src/components/bria/BriaComposer.jsx', 'utf8');
const dictation = readFileSync('src/components/bria/useBriaDictation.js', 'utf8');
const nudge = readFileSync('src/components/bria/BriaNudge.jsx', 'utf8');

test('the gesture follows what the person is doing: listening wins over typing, typing over hovering, and resting is no gesture', () => {
  assert.deepEqual(GESTURES, ['hover', 'typing', 'listening']);
  assert.equal(briaGesture({}), null);
  assert.equal(briaGesture({ hovered: true }), 'hover');
  assert.equal(briaGesture({ hovered: true, typing: true }), 'typing');
  assert.equal(briaGesture({ typing: true }), 'typing');
  assert.equal(briaGesture({ typing: true, listening: true }), 'listening');
  assert.equal(briaGesture({ hovered: true, listening: true }), 'listening');
  // Mientras Bria trabaja o celebra, la pose del lienzo manda: el gesto no se superpone.
  assert.equal(briaGesture({ hovered: true, busy: true }), null);
  assert.equal(briaGesture({ typing: true, busy: true }), null);
});

test('the gestures are smooth CSS transforms on the canvas, never on the fixed button, and reduced motion stops them', () => {
  assert.match(mascot, /data-bria-gesture=\{gesture \|\| undefined\}/);
  assert.match(css, /\[data-bria-mascot\]\s*\{[^}]*transition:\s*transform[^}]*\}/);
  for (const gesture of GESTURES) assert.match(css, new RegExp(`\\[data-bria-mascot\\]\\[data-bria-gesture="${gesture}"\\]`), `a transform for ${gesture}`);
  assert.match(css, /@keyframes bria-sway/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*\[data-bria-mascot\][^}]*(?:transition:\s*none|animation:\s*none)/);
  assert.doesNotMatch(assistant, /data-bria-assistant-trigger[^>]*style=/, 'the trigger keeps its place; only the canvas moves');
});

test('the quick question lives behind the mascot: two round icons on hover or focus, write or dictate, and neither starts a new chat', () => {
  assert.match(assistant, /data-bria-dock/);
  assert.match(assistant, /aria-label="Escribir una consulta"/);
  assert.match(assistant, /aria-label="Dictar una consulta"/);
  assert.match(assistant, /<Edit2 className=/);
  assert.match(assistant, /<Mic className=/);
  assert.match(css, /@media \(hover: hover\)\s*\{[^@]*\.bria-dock:hover \.bria-dock-tools/);
  assert.match(css, /\.bria-dock:focus-within \.bria-dock-tools/);
  assert.match(assistant, /onMouseEnter=\{\(\) => setHovered\(true\)\}/);
  assert.match(assistant, /<BriaQuickAsk[^>]*mode=\{quickAsk\}/);
  assert.match(assistant, /<BriaNudge userId=\{currentUser\.id\} hidden=\{open \|\| Boolean\(quickAsk\)\} \/>/);
  assert.doesNotMatch(assistant + quickAsk, /Iniciar nuevo chat|nuevo chat/i);
  assert.match(quickAsk, /placeholder="Haz tu consulta"/);
  assert.match(quickAsk, /aria-label="Haz tu consulta a Bria"/);
  assert.match(quickAsk, /<Activity className=/);
  assert.match(quickAsk, /if \(quickAskBria\(question\)\) \{ setQuestion\(''\); onClose\(\); \}/);
  assert.match(quickAsk, /onTyping\?\.\(/, 'typing is reported so the mascot leans');
  assert.match(quickAsk, /onListening\?\.\(/, 'recording is reported so the mascot sways');
  assert.match(quickAsk, /Recuerda que puedes consultarme algo de la plataforma\./);
  assert.match(quickAsk, /brain-popover-surface/);
  assert.match(quickAsk, /onKeyDown=\{event => \{ if \(event\.key === 'Escape'\)/);
});

test('dictation is one shared hook: the chat composer and the quick question record and transcribe the same way', () => {
  assert.match(dictation, /export function useBriaDictation\(/);
  assert.match(dictation, /request\('\/dictation', \{ method: 'POST', body \}\)/);
  assert.match(dictation, /BRIA_AUDIO_MAX_BYTES/);
  assert.match(dictation, /elapsed >= 300/, 'five minutes at most, as before');
  assert.match(composer, /useBriaDictation\(/);
  assert.match(quickAsk, /useBriaDictation\(/);
  assert.doesNotMatch(composer, /new MediaRecorder/, 'the composer no longer records on its own');
  assert.doesNotMatch(quickAsk, /new MediaRecorder/);
});

test('the card above the mascot only exists when Bria has something to say: no permanent box', () => {
  assert.match(nudge, /if \(hidden \|\| !nudge\) return null;/);
  assert.doesNotMatch(nudge, /data-bria-quick-ask|Haz tu consulta|QUICK_ASK_REMINDERS/);
  assert.match(nudge, /data-bria-nudge=\{nudge\.kind\}/);
});

test('the pieces speak Latin American Spanish, support both themes and use brand tokens only', () => {
  for (const source of [assistant, quickAsk]) {
    assert.match(source, /dark:/);
    assert.doesNotMatch(source, /\b(?:bg|text|border)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald|amber|orange)-/);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{6}/);
    assert.doesNotMatch(source, /vosotros|tenéis|podéis|\bos\b/);
    assert.doesNotMatch(source, /new Date\(\)/);
  }
});
