import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 24 de septiembre de 2026: «me doy cuenta que le estoy mostrando también el guión, en vez de
// solamente el caption para las redes. Y no me gusta la estructura.» El portal del cliente pasa a ser
// el mes en mosaico y, al entrar en una pieza, la pieza en grande con el texto que se va a publicar.

test('el guion no sale de la agencia: ni en la respuesta ni en la pantalla', async () => {
  const controller = await read('src/controllers/publicController.js');
  const portal = await read('src/components/public/SharedContentPlan.jsx');

  // Esconderlo en la pantalla no habría servido: viajaba en el cuerpo de la respuesta y se leía
  // abriendo las herramientas del navegador. Se quita en el servidor, que es donde está la cerradura.
  // El campo, no la palabra: el comentario que explica por qué se quitó sí lo nombra.
  assert.doesNotMatch(controller, /copyText:/, 'el guion ya no se envía al portal público');
  assert.doesNotMatch(portal, /copyText/, 'y la pantalla tampoco lo conoce');

  // El texto que sí es del cliente sigue llegando.
  assert.match(controller, /captionText: item\.captionText/);
});

test('el mes se ve entero antes de entrar en una pieza', async () => {
  const portal = await read('src/components/public/SharedContentPlan.jsx');

  assert.match(portal, /openItemId/, 'hay un índice y un detalle, no una lista infinita');
  assert.match(portal, /grid-cols-2[\s\S]{0,120}lg:grid-cols-4/, 'el índice es un mosaico');
  assert.match(portal, /aprobadas/, 'el avance se dice en la cabecera');
  assert.match(portal, /approvedCount/);
});

test('en el detalle manda la pieza, no el texto', async () => {
  const portal = await read('src/components/public/SharedContentPlan.jsx');
  // Se mide el orden dentro de lo que se dibuja, no el del archivo: `splitCaption(item.captionText)`
  // se calcula arriba del `return` y adelantaría al texto sin que eso signifique nada en pantalla.
  const body = portal.slice(portal.indexOf('const PieceDetail'));
  const jsx = body.slice(body.indexOf('<article'));

  const piece = jsx.indexOf('<FinalAssetPreview');
  const caption = jsx.indexOf('Texto de la publicación');
  assert.ok(piece > 0 && caption > 0, 'el detalle muestra la pieza y el texto');
  assert.ok(piece < caption, 'la pieza va antes que el texto: es lo que el cliente aprueba');

  assert.match(jsx, /Aprobar/);
  assert.match(jsx, /Pedir un cambio|Corregir/);
});

test('el portal usa la paleta oficial, no los morados heredados', async () => {
  const portal = await read('src/components/public/SharedContentPlan.jsx');

  assert.doesNotMatch(portal, /indigo-\d{2,3}/, 'indigo estaba fuera de la paleta de marca');
  assert.doesNotMatch(portal, /violet-|purple-|fuchsia-/);
  assert.match(portal, /brand-cyan|brand-green/, 'cian y verde de marca en su lugar');
});

test('aprobar y comentar siguen confirmándose contra el servidor', async () => {
  const portal = await read('src/components/public/SharedContentPlan.jsx');

  // La regla de la verdad: el aviso de éxito vive después del await, nunca en el clic.
  // `[^)]*` no servía: la URL lleva `${getApiBaseUrl()}` y su paréntesis cortaba la búsqueda.
  assert.match(
    portal,
    /await axios\.post\([\s\S]{0,200}?approve[\s\S]{0,160}toast\.success/,
    'aprobar avisa solo cuando el servidor respondió'
  );
  assert.match(portal, /handleSubmitComment/);
  assert.match(portal, /Historial de [Ff]eedback|Lo que pediste/, 'el historial de comentarios se conserva');
  assert.match(portal, /strategicObjectives/, 'los objetivos estratégicos siguen visibles');
});
