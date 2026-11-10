// La pantalla de Decisiones de Manager (Rodny, 10 de noviembre de 2026: «los botones … no van a ningún lado, no es
// intuitivo»). Contrato de lo que no se negocia: tres respuestas con efecto, éxito solo tras el servidor, motivo
// visible, nada de códigos en inglés y soporte claro/oscuro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync('src/components/modules/ManagerDecisions.jsx', 'utf8');

test('tres respuestas con el mismo vocabulario del servidor', () => {
  assert.match(view, /Me encargo/);
  assert.match(view, /No aplica/);
  assert.match(view, /Más tarde/);
  assert.match(view, /NOT_APPLICABLE_REASONS/);
  assert.match(view, /LATER_OPTIONS/);
  assert.match(view, /responseProblem\(body\)/, 'la pantalla frena con la misma regla que el servidor');
  assert.match(view, /\/api\/manager\/decisions\/respond/);
});

test('el éxito se dice después de la respuesta del servidor y el error queda junto a la tarjeta', () => {
  const respond = view.slice(view.indexOf('const respond = useCallback'), view.indexOf('}, [request]);', view.indexOf('const respond = useCallback')));
  assert.ok(respond.indexOf('await request(') < respond.indexOf('toast.success'), 'toast después del await');
  assert.match(respond, /console\.error\([^)]*requestError\.response\?\.data/);
  assert.match(view, /role="alert"/);
});

test('primero las tres más urgentes; el resto al desplegar', () => {
  assert.match(view, /const TOP = 3;/);
  assert.match(view, /Ver las demás/);
  assert.match(view, /aria-expanded=\{showAll\}/);
});

test('Bria está presente: su retrato, su lectura y «Pedírselo a Bria»', () => {
  assert.match(view, /<BriaPortrait/);
  assert.match(view, /brain-ai-header/);
  assert.match(view, /askBria\(/);
  assert.match(view, /Lo que aprendí a no mostrarte/);
  assert.match(view, /Cómo me va contigo/);
});

test('controles táctiles de 44 px, colores de la marca y modo oscuro', () => {
  assert.match(view, /min-h-11/);
  assert.match(view, /dark:bg-zinc-950/);
  assert.doesNotMatch(view, /\b(?:purple|violet|indigo|fuchsia|sky|teal|emerald|red|rose)-\d/);
  assert.doesNotMatch(view, /#[0-9a-fA-F]{6}\b/);
});
