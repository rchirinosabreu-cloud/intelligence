import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Contrato de la entrada a Bria desde cualquier pantalla (6 de octubre de 2026).
const read = (file) => readFileSync(new URL(file, import.meta.url), 'utf8');
const component = read('../src/components/bria/BriaAssistant.jsx');
const layout = read('../src/components/layout/AppLayout.jsx');

test('the entry to Bria lives in the header of every screen, next to the service dot', () => {
  assert.match(layout, /import BriaAssistant from '@\/components\/bria\/BriaAssistant'/);
  assert.ok(layout.indexOf('<BriaAssistant currentUser={currentUser} />') > 0);
  assert.ok(layout.indexOf('<BriaAssistant') < layout.indexOf('<ServiceHealthDot'));
  assert.match(component, /aria-label="Preguntarle a Bria"/);
});

test('it asks the server as the session and shows the answer only after the server answers', () => {
  assert.match(component, /\/api\/bria\/ask/);
  assert.match(component, /Authorization: `Bearer \$\{token\}`/);
  const send = component.slice(component.indexOf('const send = async'), component.indexOf('const send = async') + 1400);
  assert.ok(send.indexOf('await askBria') < send.indexOf("role: 'assistant'"), 'la respuesta se pinta después del await');
  assert.match(send, /toast\.error/);
  assert.match(send, /setQuestion\(value\)/, 'la pregunta vuelve al campo si falla');
  assert.match(component, /console\.error\('\[BriaAssistant\]/);
  assert.doesNotMatch(component, /toast\.success/);
});

test('it is an AI surface: gradient header with the mascot, centered dialog, both themes, no local colors', () => {
  assert.match(component, /brain-ai-header/);
  assert.match(component, /brainstudio-mascot-tip\.png/);
  assert.match(component, /sm:max-w-xl/);
  assert.match(component, /onOpenAutoFocus/);
  assert.match(component, /dark:bg-zinc-950/);
  assert.match(component, /dark:text-zinc-100/);
  assert.doesNotMatch(component, /\b(?:bg|text|border|ring)-(?:red|rose|purple|violet|indigo|fuchsia|sky|teal|emerald)-/);
  assert.doesNotMatch(component, /#[0-9a-fA-F]{6}\b/);
});

test('sources open the place in the platform and close the dialog; Enter sends, Shift+Enter keeps writing', () => {
  assert.match(component, /navigate\(source\.url\)/);
  assert.match(component, /setOpen\(false\)/);
  assert.match(component, /event\.key === 'Enter' && !event\.shiftKey/);
  assert.match(component, /maxLength=\{1000\}/);
});

test('the texts are Latin American Spanish and the people see what Bria can and cannot do', () => {
  assert.doesNotMatch(component, /vosotros|podéis|tenéis|\bos\b/);
  assert.match(component, /Solo respondo con lo que hay en la plataforma/);
  assert.match(component, /Una parte de la consulta falló/);
});
