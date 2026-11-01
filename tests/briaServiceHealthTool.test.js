import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServiceHealthTools } from '../src/services/briaServiceHealthTools.js';

// El semáforo de servicios, a pedido (Rodny, 22 de octubre de 2026: «mejor sin avisos por servicio caído, a menos que
// se pregunte»). Bria no avisa de una caída por WhatsApp, pero si un administrador le pregunta, responde.

const summary = { overall: 'RED', lastCheckedAt: '2026-10-22T15:00:00.000Z', troubled: [{ id: 'openai', label: 'OpenAI', light: 'RED', reason: 'Sin crédito.' }, { id: 'fireflies', label: 'Fireflies', light: 'YELLOW', reason: 'Falló una vez.' }] };

test('solo un administrador con Bria la tiene, y responde con lo que dice el semáforo', async () => {
  const [tool] = createServiceHealthTools({ getSummary: async () => summary });
  assert.equal(tool.name, 'estado_de_servicios');
  assert.equal(tool.allowed({ role: 'ADMIN', modulePermissions: { bria: true } }), true);
  assert.equal(tool.allowed({ role: 'PROJECT_MANAGER', modulePermissions: { bria: true } }), false);
  const { data } = await tool.run();
  assert.equal(data.general, 'rojo');
  assert.deepEqual(data.conProblemas, [{ servicio: 'OpenAI', color: 'rojo', motivo: 'Sin crédito.' }, { servicio: 'Fireflies', color: 'amarillo', motivo: 'Falló una vez.' }]);
  assert.equal(data.revisadoEn, '2026-10-22T15:00:00.000Z');
  const calm = await createServiceHealthTools({ getSummary: async () => ({ overall: 'GREEN', lastCheckedAt: null, troubled: [] }) })[0].run();
  assert.deepEqual([calm.data.general, calm.data.conProblemas], ['verde', []]);
  assert.deepEqual(createServiceHealthTools(null), []);
});

test('la herramienta está conectada a Bria, con su frase de avance y su instrucción', () => {
  const service = readFileSync(new URL('../src/services/briaAssistantService.js', import.meta.url), 'utf8');
  assert.match(service, /createServiceHealthTools\(/);
  const assistant = readFileSync(new URL('../src/lib/briaAssistant.js', import.meta.url), 'utf8');
  assert.match(assistant, /estado_de_servicios: '/);
  // La guía vive en la descripción de la herramienta (31 de octubre de 2026), no en las instrucciones fijas.
  const [tool] = createServiceHealthTools({ getSummary: async () => ({}) });
  assert.match(tool.description, /Nunca avises una caída sin que te pregunten/);
  assert.match(tool.description, /responde con lo que dice el semáforo/);
});
