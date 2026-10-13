import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  CLIENT_COMMENT_COUNTER_FROM,
  CLIENT_COMMENT_MAX_CHARS,
  clientCommentProblem,
  normalizeClientComment
} from '../src/lib/clientComment.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Rodny, 13 de octubre de 2026. Una clienta de Wine & Wonder escribió un comentario largo en el
// portal, pulsó Enviar cuatro veces (21:05:00, 21:05:05, 21:05:08 y 21:06:09) y las cuatro le
// respondió «Error al enviar el comentario». El servidor **sí** decía el motivo —pasaba de 2000
// caracteres— pero el portal lo mandaba a `console.error`. Se rindió y dejó escrito en la pieza:
// «Post en el whatsapp, daba error aqui». Otro comentario suyo de 276 caracteres sí entró.

test('el motivo se dice con la cifra y con la salida, nunca un código', () => {
  assert.equal(clientCommentProblem('Cambiemos la foto'), null);
  assert.equal(clientCommentProblem('   '), 'Escribe lo que quieres que ajustemos.');
  assert.equal(clientCommentProblem(null), 'Escribe lo que quieres que ajustemos.');

  const largo = clientCommentProblem('a'.repeat(CLIENT_COMMENT_MAX_CHARS + 1));
  assert.match(largo, /caracteres/);
  assert.match(largo, /dos partes/, 'dice qué hacer, no solo que no cabe');
  assert.doesNotMatch(largo, /[A-Z_]{6,}/, 'nunca un código');

  // El tope se mide sobre el texto recortado, igual que lo que se guarda.
  assert.equal(clientCommentProblem(`  ${'a'.repeat(CLIENT_COMMENT_MAX_CHARS)}  `), null);
  assert.equal(normalizeClientComment('  hola  '), 'hola');
});

test('caben los comentarios que el cliente escribe de verdad', () => {
  // El de 276 caracteres entraba; el largo no. 2000 no alcanzaba para el feedback real.
  assert.ok(CLIENT_COMMENT_MAX_CHARS >= 5000, `el tope es ${CLIENT_COMMENT_MAX_CHARS}`);
  assert.equal(clientCommentProblem('a'.repeat(2500)), null, 'lo que antes se rechazaba ahora entra');
  assert.ok(CLIENT_COMMENT_COUNTER_FROM < CLIENT_COMMENT_MAX_CHARS, 'el contador avisa antes del tope');
});

test('la regla es una sola: la misma la comprueban la pantalla y el servidor', async () => {
  const controller = await read('src/controllers/publicController.js');
  const portal = await read('src/components/public/SharedContentPlan.jsx');

  assert.match(controller, /import \{ clientCommentProblem, normalizeClientComment \} from '\.\.\/lib\/clientComment\.js'/);
  assert.match(controller, /const problem = clientCommentProblem\(normalizedComment\);/);
  assert.match(controller, /if \(problem\) return res\.status\(400\)\.json\(\{ error: problem \}\);/);
  // La cerradura sigue en el servidor: la pantalla avisa antes, pero no es lo que protege.
  assert.doesNotMatch(controller, /2000/, 'el número ya no está escrito a mano en el controlador');

  assert.match(portal, /from '@\/lib\/clientComment'/);
  assert.match(portal, /const problem = clientCommentProblem\(clientComment\);\s*\n\s*if \(problem\) \{/, 'se comprueba antes de gastar el envío');
});

test('el cliente ve el motivo junto al campo y no pierde lo escrito', async () => {
  const portal = await read('src/components/public/SharedContentPlan.jsx');

  // Lo que respondió el servidor se enseña tal cual, no una frase genérica.
  assert.match(portal, /const motivo = error\.response\?\.data\?\.error;/);
  assert.match(portal, /setCommentError\(motivo \|\|/);
  assert.doesNotMatch(portal, /toast\.error\('Error al enviar el comentario'\)/, 'ya no existe el aviso que no decía nada');

  // Va junto al campo, anunciado, no en un aviso que se va solo.
  assert.match(portal, /role="alert"/);
  assert.match(portal, /aria-describedby=\{commentProblem \? `comment-problem-\$\{item\.id\}` : undefined\}/);
  assert.match(portal, /aria-invalid=\{commentProblem \? 'true' : undefined\}/);

  // El texto solo se borra tras el éxito: puede corregirlo y reenviarlo sin reescribirlo.
  const fallo = portal.indexOf('const motivo = error.response?.data?.error;');
  const limpiezaTrasFallo = portal.indexOf("setClientComment('')", fallo);
  const finDelCatch = portal.indexOf('} finally {', fallo);
  assert.ok(limpiezaTrasFallo === -1 || limpiezaTrasFallo > finDelCatch, 'un fallo nunca borra lo que escribió');

  // Y el contador aparece antes de llegar al tope.
  assert.match(portal, /showCounter \? `\$\{commentLength\.toLocaleString\('es-CO'\)\} \/ \$\{CLIENT_COMMENT_MAX_CHARS/);
});
