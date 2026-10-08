import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInstructions } from '../src/lib/briaAssistant.js';
import { toolByName } from '../src/services/briaAssistantTools.js';
test('current platform plans are authoritative and actual copy is available for review', async () => {
  const instructions = buildInstructions({ today: '2026-10-07', tools: [{ name: 'parrilla_de_cliente', description: '' }] });
  assert.match(instructions, /plataforma.*primero|primero.*plataforma/i);
  const reader = toolByName('leer_piezas_de_parrilla'); assert.ok(reader);
  const rows = [{ id: 'piece', objective: 'Servicio', copyText: 'Guion real de prueba', captionText: 'Texto visible del cliente', publishDate: '2026-10-15T12:00:00Z', status: 'BORRADOR', plan: { id: 'plan', strategicObjectives: 'Objetivo de octubre', client: { name: 'Cuenta ficticia' } } }];
  const result = await reader.run({ planId: 'plan', desde: 0 }, { db: { contentItem: { findMany: async args => { assert.equal(args.where.plan.deletedAt, null); return rows; } } } });
  assert.match(result.data.piezas[0].guion, /Guion real/); assert.equal(result.sources[0].url, '/parrillas/plan?item=piece');
});
