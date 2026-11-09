import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTaskBoardOrder } from '../src/lib/taskOrder.js';
import { projectTaskParticipations } from '../src/lib/taskParticipationBoard.js';
import { recognitionTransaction } from '../src/services/recognitionService.js';

test('el orden manual prevalece también en realizadas sin reescribir su cierre', () => {
  const recent = { id: 'recent', status: 'REALIZADA', completedAt: '2026-11-09T12:00:00Z', boardOrder: { status: 'REALIZADA', sortOrder: 1 } };
  const old = { id: 'old', status: 'REALIZADA', completedAt: '2026-11-08T12:00:00Z', boardOrder: { status: 'REALIZADA', sortOrder: 0 } };
  assert.deepEqual([recent, old].sort(compareTaskBoardOrder).map(t => t.id), ['old', 'recent']);
});

test('dos participaciones de la misma tarea conservan posiciones independientes', () => {
  const task = { id: 'one', sharedProgress: true, status: 'EN_CURSO', sortOrder: 4,
    participants: ['ana', 'bea'].map(memberId => ({ memberId, status: 'PENDIENTE' })),
    cardOrders: [{ memberId: 'ana', status: 'PENDIENTE', sortOrder: 2 }, { memberId: 'bea', status: 'PENDIENTE', sortOrder: 0 }] };
  const cards = projectTaskParticipations([task]).sort(compareTaskBoardOrder);
  assert.deepEqual(cards.map(c => c.participation.memberId), ['bea', 'ana']);
  assert.equal(task.status, 'EN_CURSO');
});

test('una posición de otra columna no reemplaza la cola vigente', () => {
  const a = { id: 'a', status: 'PENDIENTE', sortOrder: 1, boardOrder: { status: 'EN_CURSO', sortOrder: 0 } };
  const b = { id: 'b', status: 'PENDIENTE', sortOrder: 0 };
  assert.deepEqual([a,b].sort(compareTaskBoardOrder).map(t => t.id), ['b','a']);
});

test('las escrituras SQL de prioridad reintentan solo conflictos transaccionales reales', async () => {
  for (const code of ['40001', '40P01', '23505']) {
    let attempts = 0;
    const db = { $transaction: async work => {
      attempts++;
      if (attempts === 1) throw Object.assign(new Error('SQL de prueba'), { code: 'P2010', meta: { code } });
      return work({ $executeRaw: async () => {} });
    } };
    const result = recognitionTransaction(db, async () => 'confirmado');
    if (code === '23505') { await assert.rejects(result); assert.equal(attempts, 1); }
    else { assert.equal(await result, 'confirmado'); assert.equal(attempts, 2); }
  }
});
