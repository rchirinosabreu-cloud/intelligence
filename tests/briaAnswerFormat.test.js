import test from 'node:test';
import assert from 'node:assert/strict';
import { answerBlocks } from '../src/lib/briaAnswerFormat.js';

// La respuesta de Bria llega como texto con viñetas y alguna negrita; la pantalla la pinta en párrafos y
// listas sin pasar por un intérprete de markdown.

test('paragraphs and bullet lists come out as blocks, with the markdown marks removed', () => {
  const text = 'Tienes **dos** tareas:\n- Subir videos (vence hoy)\n* Guion de octubre\n\nLa primera ya está vencida.';
  assert.deepEqual(answerBlocks(text), [
    { type: 'p', text: 'Tienes dos tareas:' },
    { type: 'ul', items: ['Subir videos (vence hoy)', 'Guion de octubre'] },
    { type: 'p', text: 'La primera ya está vencida.' }
  ]);
});

test('numbered lists, headings and code marks are normalized too', () => {
  assert.deepEqual(answerBlocks('## Resumen\n1. Uno\n2) Dos\n`tres`'), [
    { type: 'p', text: 'Resumen' },
    { type: 'ul', items: ['Uno', 'Dos'] },
    { type: 'p', text: 'tres' }
  ]);
  assert.deepEqual(answerBlocks(''), []);
  assert.deepEqual(answerBlocks(null), []);
  assert.deepEqual(answerBlocks('línea uno\r\nlínea dos'), [{ type: 'p', text: 'línea uno línea dos' }]);
});
