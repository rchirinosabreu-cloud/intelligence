import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
test('the shared conversational surface keeps server history and has no teaching form', async () => {
  const file = 'src/components/bria/BriaConversation.jsx', source = await readFile(file, 'utf8');
  await transformWithEsbuild(source, file, { loader: 'jsx', jsx: 'automatic' });
  assert.match(source, /requestBriaChat/); assert.match(source, /\/messages/); assert.match(source, /setQuestion\(value\)/);
  assert.match(source, /Historial/); assert.match(source, /Registro/); assert.match(source, /Nueva conversación/);
  assert.match(source, /brain-ai-header/); assert.match(source, /dark:/);
  assert.doesNotMatch(source, /Enseñar a Bria|Ajustar|Deshacer|BriaKnowledgePanel|Revisar y guardar/);
});
