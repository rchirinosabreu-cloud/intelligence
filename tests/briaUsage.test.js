import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeBriaUsage, createBriaUsageService } from '../src/services/briaUsageService.js';
import { createBriaUsageTools } from '../src/services/briaUsageTools.js';

// Cómo se usa Bria (10 de octubre de 2026): cifras para pulirla con el uso, nunca el contenido ni juicios.

const FALLBACK = 'No pude armar una respuesta con lo que encontré. Intenta preguntarlo de otra forma.';
const rows = [
  { actor_ref: 'u1', name: 'Rodny', role: 'user', content: '¿Quién tiene más carga?', metadata: {}, created_at: '2026-10-09T15:00:00Z' },
  { actor_ref: 'u1', name: 'Rodny', role: 'assistant', content: 'Nadie pasa de la mitad…', metadata: { toolsUsed: ['carga_del_equipo'], failures: [], usage: { calls: 2, totalTokens: 9000, cachedTokens: 6000, models: ['gpt-5.6-terra'] } }, created_at: '2026-10-09T15:00:05Z' },
  { actor_ref: 'u1', name: 'Rodny', role: 'user', content: 'la clave de capcut', metadata: {}, created_at: '2026-10-10T13:00:00Z' },
  { actor_ref: 'u1', name: 'Rodny', role: 'assistant', content: 'Te mostré el acceso.', metadata: { toolsUsed: ['buscar_acceso'], failures: [], usage: { calls: 1, totalTokens: 3000, cachedTokens: 0, models: ['gpt-5.6-terra'] } }, created_at: '2026-10-10T13:00:04Z' },
  { actor_ref: 'u2', name: 'Kamila', role: 'user', content: '¿cómo va Aristea?', metadata: {}, created_at: '2026-10-10T14:00:00Z' },
  { actor_ref: 'u2', name: 'Kamila', role: 'assistant', content: FALLBACK, metadata: { toolsUsed: ['buscar_cliente', 'operacion_de_cliente'], failures: [{ tool: 'operacion_de_cliente', message: 'timeout' }], usage: { calls: 3, totalTokens: 12000, cachedTokens: 9000, models: ['gpt-5.6-terra'] } }, created_at: '2026-10-10T14:00:09Z' }
];

test('the summary counts people, questions, tools, unanswered turns and tokens, without any content', () => {
  const out = summarizeBriaUsage(rows, { days: 7 });
  assert.equal(out.periodo, '7 días');
  assert.deepEqual(out.personas, [{ nombre: 'Rodny', preguntas: 2, ultimaVez: '2026-10-10' }, { nombre: 'Kamila', preguntas: 1, ultimaVez: '2026-10-10' }]);
  assert.deepEqual([out.preguntas, out.respuestas, out.sinRespuesta, out.conFallaDeHerramienta], [3, 3, 1, 1]);
  assert.deepEqual(out.herramientas, [{ nombre: 'buscar_acceso', veces: 1 }, { nombre: 'buscar_cliente', veces: 1 }, { nombre: 'carga_del_equipo', veces: 1 }, { nombre: 'operacion_de_cliente', veces: 1 }]);
  assert.deepEqual(out.porDia, [{ dia: '2026-10-09', preguntas: 1 }, { dia: '2026-10-10', preguntas: 2 }]);
  assert.deepEqual(out.coste, { llamadasAlModelo: 6, tokens: 24000, tokensEnCache: 15000, modelos: ['gpt-5.6-terra'] });
  assert.equal(JSON.stringify(out).includes('capcut'), false, 'no question text leaks');
});

test('the service asks the side database for the period only and the tool is for admins', async () => {
  const queries = [];
  const service = createBriaUsageService({ pool: { query: async (sql, args) => { queries.push([sql, args]); return { rows }; } } });
  const out = await service.summary({ days: 30 });
  assert.equal(out.periodo, '30 días');
  assert.match(queries[0][0], /bria_memory\.conversation_turns/);
  assert.match(queries[0][0], /LEFT JOIN public\."User"/);
  assert.deepEqual(queries[0][1], ['application', 30]);
  assert.equal((await service.summary({ days: 99 })).periodo, '7 días', 'an unknown period falls back to a week');
  const [tool] = createBriaUsageTools(service);
  assert.equal(tool.name, 'uso_de_bria');
  assert.equal(tool.allowed({ role: 'ADMIN', isActive: true, modulePermissions: { bria: true } }), true);
  assert.equal(tool.allowed({ role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true } }), false);
  const result = await tool.run({ dias: 7 });
  assert.match(result.data.instruccion, /no para evaluar a las personas/);
  assert.equal(createBriaUsageTools(null).length, 0);
});
