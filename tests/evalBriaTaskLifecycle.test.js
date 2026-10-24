import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskLifecycleFixture, runTaskLifecycleScenario } from './evals/briaTaskLifecycleFixture.js';

const scripted = (close = 'A la orden.') => {
  const answers = [
    { request: { intent: 'PREPARE' }, titulo: 'Ensayo de entrega', cliente: 'Taller Aurora Ficticio', responsable: 'yo', fecha: '2026-10-24', horaLimite: '15:00', especial: true, prioridad: 'urgente', colaboradores: ['Nora Sáenz'], archivos: [{ id: 'lifecycle-photo', destino: 'INSUMO' }] },
    'Listo el resumen.',
    { request: { intent: 'ADJUST' }, fecha: '2026-10-25', comentario: { tipo: 'LITERAL', texto: 'Dos variantes para revisión' }, archivos: [{ id: 'lifecycle-photo', destino: 'COMENTARIO' }] },
    'Listo el ajuste.',
    { request: { intent: 'ADJUST' }, archivos: [], comentario: { tipo: 'RETIRAR' } },
    'Listo el ajuste.',
    { request: { intent: 'ADJUST' }, comentario: { tipo: 'LITERAL', texto: 'Listo para revisión interna' } },
    'Listo el resumen.', close
  ];
  let index = 0;
  return { generate: async () => {
    assert.ok(index < answers.length, 'no hidden provider calls');
    const answer = answers[index++];
    return typeof answer === 'string' ? { text: answer } : { output: [], functionCalls: [{ id: `call-${index}`, name: 'preparar_pendiente', args: answer }] };
  } };
};
test('lifecycle evaluation runs actual conversation and assistant services, preserving edits through human approval', async () => {
  const fixture = createTaskLifecycleFixture(scripted());
  await runTaskLifecycleScenario(fixture);
  assert.equal(fixture.modelRequests.length, 9);
  assert.equal(fixture.traces.length, 6);
  assert.equal(fixture.created.length, 1);
});
test('lifecycle evaluation rejects reopening completed work in the closing response', async () => {
  const fixture = createTaskLifecycleFixture(scripted('El borrador no está disponible. Dime el cliente.'));
  await assert.rejects(runTaskLifecycleScenario(fixture), { code: 'ERR_ASSERTION' });
  assert.equal(fixture.created.length, 1);
});
