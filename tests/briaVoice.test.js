// La voz de Bria según con quién y por dónde habla (1 de noviembre de 2026). En el piloto de WhatsApp del 31 de
// octubre Bria le escribió a Rodny «Rodny confirmó que…» como si le contara a otra persona, respondió largo para
// leerse en un celular y cerró con una advertencia genérica («atender un asunto no demuestra por sí solo…»).
// Tres principios, nada de plantillas: segunda persona siempre, el canal se le dice, y sin cierres de cautela.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstructions } from '../src/lib/briaAssistant.js';
import { createBriaAssistantService as createService } from '../src/services/briaAssistantService.js';

const tools = [{ name: 'mis_tareas', description: 'Tus tareas' }];
const person = { name: 'Rodny', jobTitle: 'Director' };

test('Bria speaks to the person in the second person, even when a memory or a receipt names them', () => {
  const text = buildInstructions({ person, today: '2026-11-01', tools });
  assert.match(text, /segunda persona/);
  assert.match(text, /nunca (?:en|por) tercera persona/);
  assert.match(text, /«me confirmaste»|me confirmaste/);
});

test('the channel reaches the instructions at the end, so the shared prefix stays cached', () => {
  const platform = buildInstructions({ person, today: '2026-11-01', tools });
  const whatsapp = buildInstructions({ person, today: '2026-11-01', tools, channel: 'whatsapp' });
  assert.doesNotMatch(platform, /WhatsApp/, 'in the platform nothing says WhatsApp');
  const lastLine = whatsapp.split('\n').at(-1);
  assert.match(lastLine, /WhatsApp/);
  assert.match(lastLine, /celular/);
  assert.equal(whatsapp.split('\n').slice(0, -1).join('\n'), platform.split('\n').slice(0, -1).join('\n'), 'only the last line changes with the channel');
});

test('closing with a generic caution is not Bria\'s voice', () => {
  const text = buildInstructions({ person, today: '2026-11-01', tools });
  assert.match(text, /advertencia/);
  assert.match(text, /no cierres|sin cierres/i);
});

// Que la sesión de WhatsApp lleve su canal se comprueba en tests/whatsappBridgeService.test.js.
test('the assistant tells the model the channel it is answering on', async () => {
  const seen = [];
  const row = { id: 'u', name: 'Persona', role: 'PROJECT_MANAGER', isActive: true, sessionVersion: 1, modulePermissions: { bria: true }, teamMember: { id: 'm', isActive: true } };
  const service = createService({
    agencyFacts: { recall: async () => ({ hechos: [] }) }, notebook: null, mail: null, vault: null, tools: [],
    db: { user: { findUnique: async () => row } },
    ai: { generate: async (request) => { seen.push(request.instructions); return { text: 'Listo.' }; } }
  });
  const user = () => ({ userId: 'u', role: 'PROJECT_MANAGER', sessionVersion: 1, modulePermissions: { bria: true } });
  await service.ask({ user: user(), question: 'hola', session: { token: 'navegador' } });
  await service.ask({ user: user(), question: 'hola', session: { channel: 'whatsapp' } });
  assert.doesNotMatch(seen[0].split('\n').find((line) => line.startsWith('Hoy es')), /WhatsApp/);
  assert.match(seen[1].split('\n').find((line) => line.startsWith('Hoy es')), /WhatsApp/);
});
