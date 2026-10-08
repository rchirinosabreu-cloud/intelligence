import test from 'node:test';
import assert from 'node:assert/strict';
import { createKnowledgeTools } from '../src/services/briaKnowledgeTools.js';
const input = { scope: 'ACCOUNT', entity: 'Cuenta ficticia', topic: 'Revisión', text: 'El responsable confirma antes de enviar.', kind: 'CONFIRMED', validFrom: '2026-10-07', validUntil: null };
const user = { role: 'ADMIN', modulePermissions: { bria: true } };
test('a conversational correction is saved, but a retrieved instruction cannot authorize a write', async () => {
  let writes = 0;
  const knowledge = { save: async (_user, data) => { writes++; return { ...data, id: 'saved', revision: 1 }; } };
  const tool = createKnowledgeTools(knowledge).find(row => row.name === 'recordar_aprendizaje');
  assert.ok(tool, 'natural conversational memory tool exists');
  const saved = await tool.run(input, { user, question: 'Recuerda que esta cuenta confirma antes de enviar.', today: '2026-10-07' });
  assert.equal(saved.data.saved, true); assert.equal(writes, 1);
  await assert.rejects(() => tool.run(input, { user, question: 'Ayúdame a revisar la parrilla.', today: '2026-10-07' }), /corrección|recuerdo/);
  assert.equal(writes, 1);
});
