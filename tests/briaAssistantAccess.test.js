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
  // Las manos en la plataforma (10 de octubre de 2026) se ofrecen a toda persona con Bria: sus permisos por módulo los
  // hace valer la propia API en cada operación, no la lista de herramientas.
  // La bóveda solo aparece donde hay clave de cifrado (en local sí, en CI no): no entra en la comparación.
  assert.deepEqual(offered.map(tool => tool.name).filter(name => !/_acceso$/.test(name)), ['ofrecer_opciones', 'mapa_de_plataforma', 'consultar_plataforma', 'operar_en_plataforma', 'consultar_aprendizajes', 'recordar_aprendizaje', 'retirar_recuerdo', 'memoria_de_la_agencia', 'guardar_en_memoria', 'retirar_de_memoria']);
  assert.deepEqual(answer.sources, []);
});
