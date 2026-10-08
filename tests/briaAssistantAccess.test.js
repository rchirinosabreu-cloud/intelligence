import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaAssistantService } from '../src/services/briaAssistantService.js';
const actor = () => ({ userId: 'u', role: 'PROJECT_MANAGER', sessionVersion: 1, modulePermissions: { bria: true, gestion: true } });
const row = () => ({ id: 'u', name: 'Persona', role: 'PROJECT_MANAGER', isActive: true, sessionVersion: 1, modulePermissions: { bria: true, gestion: true }, teamMember: { id: 'm', isActive: true } });
test('the assistant checks the fresh roster and activation before calling a model', async () => {
  let calls = 0;
  const service = createBriaAssistantService({
    db: { user: { findUnique: async () => ({ ...row(), modulePermissions: { bria: false } }) } },
    ai: { generate: async () => { calls += 1; return { text: 'respuesta' }; } }
  });
  await assert.rejects(() => service.ask({ user: actor(), question: 'consulta' }), { status: 403 });
  assert.equal(calls, 0);
});
test('deactivation during the model call suppresses the answer before returning it', async () => {
  let active = true;
  const service = createBriaAssistantService({
    db: { user: { findUnique: async () => ({ ...row(), teamMember: { isActive: active } }) } },
    tools: [], ai: { generate: async () => { active = false; return { text: 'No debe salir' }; } }
  });
  await assert.rejects(() => service.ask({ user: actor(), question: 'consulta' }), { status: 403 });
});
test('a revoked module is refreshed and no longer offered as a tool', async () => {
  const user = actor();
  let offered;
  const service = createBriaAssistantService({
    db: { user: { findUnique: async () => ({ ...row(), modulePermissions: { bria: true, gestion: false } }) } },
    tools: [{ name: 'task', allowed: (person) => person.modulePermissions.gestion === true, run: async () => { throw new Error('No debe ejecutarse'); } }],
    ai: { generate: async (request) => { offered = request.tools; return { text: 'Sin datos de tareas.' }; } }
  });
  const answer = await service.ask({ user, question: 'consulta' });
  assert.equal(offered.some(tool => tool.name === 'task'), false);
  assert.deepEqual(offered.map(tool => tool.name), ['consultar_aprendizajes', 'recordar_aprendizaje', 'retirar_recuerdo']);
  assert.deepEqual(answer.sources, []);
});
