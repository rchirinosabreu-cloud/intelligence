import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaAssistantService } from '../src/services/briaAssistantService.js';
const actor = () => ({ userId: 'u', role: 'PROJECT_MANAGER', sessionVersion: 1, modulePermissions: { bria: true, gestion: true } });
const row = () => ({ id: 'u', name: 'Persona', role: 'PROJECT_MANAGER', isActive: true, sessionVersion: 1, modulePermissions: { bria: true, gestion: true }, teamMember: { id: 'm', isActive: true } });

test('the model receives the completed operation separately from historical files and open drafts', async () => {
  let seen;
  const service = createBriaAssistantService({
    db: { user: { findUnique: async () => row() } }, tools: [], mail: null, vault: null,
    ai: { generate: async request => { seen = request; return { text: 'A la orden.' }; } }
  });
  await service.ask({ user: actor(), question: 'Gracias', pendingAction: null,
    lastOperation: { id: 'finished', type: 'TASK_CREATE', status: 'DONE', title: 'Ensayo' },
    attachments: [{ id: 'old', name: 'foto.jpg', current: false, status: 'READ', text: 'Una cocina' }] });
  const terminal = seen.input.flatMap(message => message.content || []).find(part => part.text?.includes('finished'));
  assert.ok(terminal, 'the completion must reach the model, not just the conversation service');
  assert.match(terminal.text, /"status":"DONE"/);
  assert.match(seen.instructions, /históricos/);
  assert.match(seen.instructions, /terminada/);
});
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
// 22 de octubre de 2026: «Crea un evento de todo el día…» respondía «esta conversación no trae tu sesión» en la
// plataforma. La sesión llegaba a `ask` pero no a las herramientas, así que consultar_plataforma nunca tuvo manos.
test('the session that opened the chat reaches every tool, so Bria can read the platform as the person', async () => {
  let seen = 'sin llamar';
  let round = 0;
  const service = createBriaAssistantService({
    db: { user: { findUnique: async () => row() } },
    tools: [{ name: 'sonda', description: 'prueba', parameters: { type: 'object', properties: {} }, allowed: () => true, run: async (_args, ctx) => { seen = ctx.session; return { data: { ok: true } }; } }],
    ai: { generate: async () => { round += 1; return round === 1 ? { functionCalls: [{ id: 'c1', name: 'sonda', args: {} }], output: [] } : { text: 'Listo.' }; } },
    mail: null
  });
  await service.ask({ user: actor(), question: 'consulta', session: { token: 'token-de-la-persona' } });
  assert.deepEqual(seen, { token: 'token-de-la-persona' });
});
// Por WhatsApp no hay sesión del navegador (22 de octubre de 2026): Bria preparaba un evento con operar_en_plataforma
// y al confirmar fallaba. Sin sesión no se le ofrecen las manos de la plataforma.
test('without a browser session the platform hands are not offered', async () => {
  let offered;
  const service = createBriaAssistantService({
    db: { user: { findUnique: async () => row() } },
    tools: [], ai: { generate: async (request) => { offered = request.tools.map(tool => tool.name); return { text: 'Hecho.' }; } },
    mail: null
  });
  await service.ask({ user: actor(), question: 'Crea un evento para Helen', session: null });
  for (const name of ['mapa_de_plataforma', 'consultar_plataforma', 'operar_en_plataforma']) assert.equal(offered.includes(name), false, name);
  assert.equal(offered.includes('guardar_en_memoria'), true, 'lo demás sigue igual');
});
test('a revoked module is refreshed and no longer offered as a tool', async () => {
  const user = actor();
  let offered;
  const service = createBriaAssistantService({
    db: { user: { findUnique: async () => ({ ...row(), modulePermissions: { bria: true, gestion: false } }) } },
    tools: [{ name: 'task', allowed: (person) => person.modulePermissions.gestion === true, run: async () => { throw new Error('No debe ejecutarse'); } }],
    ai: { generate: async (request) => { offered = request.tools; return { text: 'Sin datos de tareas.' }; } },
    // Los buzones (11 de octubre de 2026) dependen de la misma llave que la bóveda: fuera de esta comparación.
    mail: null
  });
  const answer = await service.ask({ user, question: 'consulta', session: { token: 't' } });
  assert.equal(offered.some(tool => tool.name === 'task'), false);
  // Las manos en la plataforma (10 de octubre de 2026) se ofrecen a toda persona con Bria: sus permisos por módulo los
  // hace valer la propia API en cada operación, no la lista de herramientas.
  // La bóveda solo aparece donde hay clave de cifrado (en local sí, en CI no): no entra en la comparación.
  // Sin Gestión, Bria ofrece pedirla a un administrador (15 de octubre de 2026): pedir_permiso, nunca la herramienta de tareas.
  // La memoria del tiempo (19 de octubre de 2026) es de dirección: un project manager la lee, con el alcance de sus cuentas.
  assert.deepEqual(offered.map(tool => tool.name).filter(name => !/_acceso$/.test(name)), ['actualizar_seguimiento', 'ofrecer_opciones', 'mapa_de_plataforma', 'consultar_plataforma', 'operar_en_plataforma', 'consultar_aprendizajes', 'recordar_aprendizaje', 'retirar_recuerdo', 'memoria_de_la_agencia', 'guardar_en_memoria', 'retirar_de_memoria', 'pedir_permiso', 'lectura_de_la_agencia', 'anotar_decision']);
  assert.deepEqual(answer.sources, []);
});

test('daily reading tools receive the validated user identity and current team member', async () => {
  const user = { ...actor(), id: 'obsolete-id', teamMember: { id: 'obsolete-member' } };
  const current = { ...row(), teamMember: { id: 'current-member', name: 'PM actual', isActive: true } };
  let seen, round = 0;
  const service = createBriaAssistantService({
    db: { user: { findUnique: async ({ where }) => { assert.equal(where.id, 'u'); return current; } } },
    tools: [], mail: null, vault: null,
    dailyReading: { explain: async ({ user: person }) => { seen = structuredClone(person); return { fecha: '2026-10-23' }; } },
    ai: { generate: async () => ++round === 1 ? { functionCalls: [{ id: 'read', name: 'lectura_de_la_agencia', args: {} }], output: [] } : { text: 'Esta es tu lectura.' } }
  });
  await service.ask({ user, question: 'Revisa mis cuentas' });
  assert.equal(seen.id, 'u', 'el libro propio se consulta por la identidad validada');
  assert.equal(seen.userId, 'u');
  assert.deepEqual(seen.teamMember, current.teamMember, 'el alcance usa la ficha actual del PM');
});

test('a changed team member is refreshed before the next tool executes', async () => {
  let member = 'first-member', seen, round = 0;
  const service = createBriaAssistantService({
    db: { user: { findUnique: async () => ({ ...row(), teamMember: { id: member, isActive: true } }) } },
    tools: [], mail: null, vault: null,
    dailyReading: { explain: async ({ user }) => { seen = structuredClone(user); return {}; } },
    ai: { generate: async () => {
      if (++round !== 1) return { text: 'Esta es tu lectura.' };
      member = 'new-member';
      return { functionCalls: [{ id: 'read', name: 'lectura_de_la_agencia', args: {} }], output: [] };
    } }
  });
  await service.ask({ user: actor(), question: 'Revisa mis cuentas' });
  assert.equal(seen.teamMember?.id, 'new-member');
  assert.equal(seen.id, 'u');
});

test('the source reading day reaches decision tools even when the model omits the day', async () => {
  let seen, round = 0;
  const service = createBriaAssistantService({
    db: { user: { findUnique: async () => row() } }, tools: [], mail: null, vault: null,
    dailyReading: { recordVerdict: async (input) => { seen = input; return { saved: true }; } },
    ai: { generate: async () => ++round === 1 ? { functionCalls: [{ id: 'note', name: 'anotar_decision', args: { decision: '2', veredicto: 'hecho' } }], output: [] } : { text: 'Listo.' } }
  });
  await service.ask({ user: actor(), question: 'La 2 ya la hice', readingDay: '2026-10-22' });
  assert.equal(seen.dia, '2026-10-22', 'una lectura anterior no se convierte en la última por omitir el modelo el día');
});
