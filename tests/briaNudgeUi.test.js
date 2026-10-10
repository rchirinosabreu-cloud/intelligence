// «Bria se adelanta» en pantalla (10 de octubre de 2026): un aviso discreto encima de la mascota, con la superficie
// de los popovers, que nunca abre el chat solo ni manda nada; la X oculta por hoy en el servidor; el foco de la
// semana se abre en su conversación. Contratos de código fuente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openBriaConversation, onBriaOpen, BRIA_OPEN_EVENT } from '../src/lib/briaAsk.js';

const nudge = readFileSync('src/components/bria/BriaNudge.jsx', 'utf8');
const assistant = readFileSync('src/components/bria/BriaAssistant.jsx', 'utf8');
const conversation = readFileSync('src/components/bria/BriaConversation.jsx', 'utf8');
const layout = readFileSync('src/components/layout/AppLayout.jsx', 'utf8');
const routes = readFileSync('src/routes/index.js', 'utf8');
const server = readFileSync('server.js', 'utf8');

test('the nudge sits above the mascot, on the shared popover surface, with the mascot portrait and only when the panel is closed', () => {
  assert.match(assistant, /<BriaNudge userId=\{currentUser\.id\} hidden=\{open\} \/>/);
  assert.match(nudge, /brain-popover-surface fixed right-4 z-\[49\]/);
  assert.match(nudge, /bottom-\[calc\(1rem\+env\(safe-area-inset-bottom\)\+5\.75rem\)\]/);
  assert.match(nudge, /<BriaPortrait className="h-9 w-9 shrink-0" \/>/);
  assert.match(nudge, /if \(hidden \|\| !nudge\) return null;/);
  assert.match(nudge, /role="status" aria-label="Aviso de Bria" data-bria-nudge=\{nudge\.kind\}/);
  assert.match(nudge, /Bria se adelanta/);
  assert.match(nudge, /data-bria-nudge-count>1 de \{nudges\.length\}/);
});

test('the actions leave the message written in Bria or open Gestión; nothing is sent by itself and the X hides on the server', () => {
  assert.match(nudge, /onClick=\{\(\) => askBria\(nudge\.ask\)\}>Pedírselo a Bria/);
  assert.match(nudge, /onClick=\{\(\) => openBriaConversation\(nudge\.conversationId\)\}>Leer en Bria/);
  assert.match(nudge, /<Link to=\{nudge\.url\}[^>]*>Ver en Gestión/);
  assert.doesNotMatch(nudge, /\/messages/, 'the nudge never talks to the chat endpoint');
  assert.match(nudge, /aria-label="Ocultar por hoy"/);
  assert.match(nudge, /request\('\/dismiss', \{ method: 'POST', body: \{ key: nudge\.key \} \}\)/);
  assert.ok(nudge.indexOf('setNudges(rows => rows.filter') > nudge.indexOf("await request('/dismiss'"), 'the card disappears only after the server confirmed');
  assert.match(nudge, /document\.visibilityState === 'visible'/);
  assert.doesNotMatch(nudge, /new Date\(\)/, 'no clock in the component');
});

test('opening a conversation from outside: the panel opens, the chat loads it and refreshes the list; the bell routes the Monday focus there', () => {
  assert.match(assistant, /onBriaOpen\(\(\) => \{ setOpen\(true\)/);
  assert.match(conversation, /onBriaOpen\(async id => \{ await openChatRef\.current\?\.\(id\); loadHistory\(\)/);
  assert.match(layout, /notif\.type === 'BRIA_FOCO_SEMANAL'/);
  assert.match(layout, /openBriaConversation\(notif\.relatedId\)/);
  const listeners = new Map();
  globalThis.window = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name) => listeners.delete(name), dispatchEvent: (event) => listeners.get(event.type)?.(event) };
  globalThis.CustomEvent = class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
  const seen = [];
  const stop = onBriaOpen((id) => seen.push(id));
  assert.equal(openBriaConversation(' c-1 '), true);
  assert.equal(openBriaConversation(''), false);
  assert.deepEqual(seen, ['c-1']);
  stop();
  assert.equal(listeners.has(BRIA_OPEN_EVENT), false);
  delete globalThis.window; delete globalThis.CustomEvent;
});

test('the route hangs under /api/bria (excluded from Bria’s own map) and the Monday focus is scheduled at start-up', () => {
  assert.match(routes, /router\.use\('\/bria\/nudges', createBriaNudgeRouter\(\)\);/);
  assert.match(server, /initWeeklyFocusScheduler\(\);/);
  for (const source of [nudge]) {
    assert.match(source, /dark:text-zinc-300/);
    assert.doesNotMatch(source, /\b(?:bg|text|border)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald|amber|orange)-/);
    assert.doesNotMatch(source, /#[0-9a-fA-F]{6}/);
    assert.doesNotMatch(source, /vosotros|tenéis|podéis/);
  }
});
