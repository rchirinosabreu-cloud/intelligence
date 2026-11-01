import test from 'node:test';
import assert from 'node:assert/strict';
import { createPersistentMemoryFixture, runPersistentMemoryScenario } from './evals/briaPersistentMemoryFixture.js';

const fixtureFor = (correction = {}) => {
  let read = false, saved = false;
  return createPersistentMemoryFixture({ generate: async request => {
    if (request.responseSchema?.properties.decisiones) {
      assert.match(request.prompt, /Octubre no se contrató/);
      assert.match(request.prompt, /septiembre/);
      return { text: JSON.stringify({ resumen: 'Faro tiene entregas vigentes. Roble necesita separar septiembre de la propuesta de octubre.', decisiones: [
        { titulo: 'Revisar las entregas de Faro', porque: 'Tiene un compromiso vigente de octubre.', tipo: 'HACER', evidencia: ['signal-faro'], memoria: ['faro-october'], pedido: null, regla: null },
        { titulo: 'No reclamar la propuesta de octubre de Roble', porque: 'Octubre no se contrató; los dos compromisos de septiembre siguen por aclarar.', tipo: 'NO_HACER', evidencia: ['signal-roble'], memoria: ['memory-1', 'roble-september'], pedido: null, regla: null }
      ], cuentas: [{ clientId: 'roble', lectura: 'Separar la propuesta de octubre de los compromisos de septiembre.' }, { clientId: 'faro', lectura: 'Entrega contratada vigente.' }] }) };
    }
    if (!read) { read = true; return { functionCalls: [{ id: 'read', name: 'memoria_de_la_agencia', args: { consulta: 'acuerdo', clientId: 'roble', entidad: null } }] }; }
    if (!saved) { saved = true; return { functionCalls: [{ id: 'save', name: 'guardar_en_memoria', args: { request: { intent: 'CORRECT' }, entidad: 'Estudio Roble Ficticio', clientId: 'roble', tipoEntidad: 'cliente', tema: 'acuerdo', afirmacion: 'Octubre no se contrató: la parrilla era una propuesta sin autorización.', certeza: 'CONFIRMADO', proposito: 'operacion', desde: '2026-10-01', hasta: '2026-10-31', reemplaza: [{ id: 'roble-october', revision: 1 }], respondeDuda: null, ...correction } }] }; }
    return { text: 'La corrección quedó guardada para octubre; conservo aparte los compromisos de septiembre.' };
  } }, { runtimeEnv: { BRIA_CHAT_MODEL: 'gpt-6-luna', BRIA_CHAT_REASONING_EFFORT: 'low' } });
};

test('a conversational correction survives a new service and changes the next morning without changing counters', async t => {
  const fixture = fixtureFor();
  const result = await runPersistentMemoryScenario(fixture);
  assert.equal(result.reading.source, 'MODELO');
  assert.equal(result.reading.decisions[0].subjectId, 'faro');
  assert.equal(result.reading.decisions.find(row => row.subjectId === 'roble').kind, 'NO_HACER');
  assert.deepEqual(fixture.operationalWrites, []);
  assert.equal(fixture.facts.find(row => row.id === 'roble-october').status, 'SUPERSEDED');
  assert.equal(fixture.facts.find(row => row.id === 'roble-september').status, 'ACTIVE');
  assert.ok(fixture.requests.filter(row => row.phase !== 'morning').every(row => row.maxOutputTokens === 4800));
  t.diagnostic(`Dry request bounds only (no provider calls): ${JSON.stringify(fixture.requests)}`);
});

test('acceptance rejects storing a second October fact while the contradicted fact remains active', async () => {
  const fixture = fixtureFor({ reemplaza: [] });
  await assert.rejects(runPersistentMemoryScenario(fixture), /the contradicted October agreement must be superseded/);
  assert.equal(fixture.requests.some(row => row.phase === 'morning'), false, 'do not spend a morning call after a failed correction');
});

test('acceptance rejects reception date as the beginning of the corrected agreement', async () => {
  const fixture = fixtureFor({ desde: '2026-10-26', hasta: null, reemplaza: [] });
  await assert.rejects(runPersistentMemoryScenario(fixture), /the correction must apply to the whole October agreement/);
  assert.equal(fixture.requests.some(row => row.phase === 'morning'), false);
});
