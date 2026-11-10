// La pantalla de Decisiones de Manager (Rodny, 10 de noviembre de 2026: «los botones … no van a ningún lado, no es
// intuitivo»). Contrato de lo que no se negocia: tres respuestas con efecto, éxito solo tras el servidor, motivo
// visible, nada de códigos en inglés y soporte claro/oscuro.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const view = readFileSync('src/components/modules/ManagerDecisions.jsx', 'utf8');

test('tres respuestas con el mismo vocabulario del servidor', () => {
  assert.match(view, /Me encargo/);
  assert.match(view, />Descartar</);
  assert.doesNotMatch(view, /No aplica|<textarea/, 'Descartar no pide nota; solo «Otro motivo» abre un campo');
  assert.match(view, /reason\.value === 'OTRO' \? setMode\('other'\) : send\(\{ respuesta: 'DESCARTAR', motivo: reason\.value \}\)/, 'elegir el motivo ya guarda');
  assert.match(view, /Más tarde/);
  assert.match(view, /DISCARD_REASONS/);
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

test('siempre seis a la vista; al responder una entra la siguiente, sin «ver las demás»', () => {
  assert.match(view, /const TOP = MAX_DECISIONS_PER_WEEK;/);
  assert.match(view, /'Pedir a Bria'/);
  assert.doesNotMatch(view, /Hazlo, Bria/);
  assert.match(view, /if \(await send\(\{ respuesta: 'HACER' \}\)\) askBria\(card\.ask\)/, 'Bria se abre solo después de guardar la respuesta');
  assert.match(view, /ids: card\.refs/, 'una tarjeta agrupada responde por todas');
  assert.match(view, /Quedó a cargo de otras personas/);
  assert.match(view, /xl:grid-cols-3/);
  assert.match(view, /openLabel\(card\.url\)/, 'el enlace dice a dónde lleva');
  assert.doesNotMatch(view, /bg-zinc-900 px-4/, 'ningún botón negro: el principal es el cian de la plataforma');
  assert.doesNotMatch(view, /Ver las demás|showAll/);
  assert.match(view, /items-start gap-3 lg:grid-cols-2/, 'abrir una sección no estira a la de al lado');
  assert.match(view, /markSeen\(currentUser\?\.id/, 'lo que está a la vista deja de ser nuevo para el menú');
});

test('Bria está presente: su retrato, su lectura y «Pedírselo a Bria»', () => {
  assert.match(view, /<BriaPortrait/);
  assert.match(view, /brain-ai-header/);
  assert.match(view, /askBria\(/);
  assert.match(view, /Lo que aprendí a no mostrarte/);
  assert.doesNotMatch(view, /Cómo me va contigo|semanas anteriores/, 'Rodny los quitó el 10 de noviembre de 2026');
});

test('controles táctiles de 44 px, colores de la marca y modo oscuro', () => {
  assert.match(view, /min-h-11/);
  assert.match(view, /dark:bg-zinc-950/);
  assert.doesNotMatch(view, /\b(?:purple|violet|indigo|fuchsia|sky|teal|emerald|red|rose)-\d/);
  assert.doesNotMatch(view, /#[0-9a-fA-F]{6}\b/);
});
