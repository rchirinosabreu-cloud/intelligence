import test from 'node:test';
import assert from 'node:assert/strict';
import { createManagerDecisionService } from '../src/services/managerDecisionService.js';

const NOW = new Date('2026-11-10T15:00:00.000Z');
const user = { id: 'u1', name: 'Rodny', role: 'ADMIN', teamMember: { name: 'Rodny Chirinos' } };

const fakeReading = (over = {}) => {
  const calls = [];
  return {
    calls,
    async decisionBoard() {
      return {
        reading: { day: '2026-11-10', signals: [{ id: 'S:c1', severity: 3, text: 'Verona lleva 8 días en rojo.' }] },
        decisions: [{ id: '2026-11-10:1', kind: 'HACER', title: 'Revisar Verona', evidence: ['S:c1'], subjectName: 'Verona' }],
        entries: [], scorecard: { lectura: 'Todavía no hay decisiones anotadas.' }
      };
    },
    async recordVerdict(args) { calls.push(args); return { saved: true }; },
    ...over
  };
};

const fakeDb = (signal) => {
  const updates = [];
  return {
    updates,
    briaObserverSignal: {
      async findMany({ where }) { return where.status === 'DISMISSED' ? [] : signal ? [signal] : []; },
      async findUnique() { return signal; },
      async updateMany(args) { updates.push(args); return { count: args.where.updatedAt === signal.updatedAt ? 1 : 0 }; }
    },
    client: { async findMany() { return [{ id: 'c1', name: 'Verona' }]; } }
  };
};

const signal = { id: 's1', status: 'OPEN', category: 'PENDING_REGISTRATION', sourceKind: 'MEETING_MINUTE', severity: 'warning', clientId: 'c1', title: 'Falta el contrato', evidence: 'Hay que subir el contrato', metadata: { origen: 'minuta' }, updatedAt: new Date('2026-11-09T10:00:00Z') };
const quiet = { info() {}, error() {} };

test('el tablero junta la lectura y el Observer con los nombres de los clientes', async () => {
  const service = createManagerDecisionService({ db: fakeDb(signal), reading: fakeReading(), now: () => NOW, logger: quiet });
  const board = await service.board(user);
  assert.deepEqual(board.pending.map(card => card.key), ['L:2026-11-10:1', 'O:s1']);
  assert.equal(board.pending[1].subjectName, 'Verona');
  assert.equal(board.readingDay, '2026-11-10');
});

test('responder a la lectura escribe en el libro de decisiones el día de esa decisión', async () => {
  const reading = fakeReading();
  const service = createManagerDecisionService({ db: fakeDb(signal), reading, now: () => NOW, logger: quiet });
  await service.respond(user, { source: 'LECTURA', id: '2026-11-10:1', respuesta: 'NO_APLICA', motivo: 'ESPERA_CLIENTE' });
  assert.deepEqual(reading.calls, [{ user, ref: '2026-11-10:1', veredicto: 'NO', nota: 'No aplica: Espera al cliente.', dia: '2026-11-10' }]);
});

test('si el libro no la encuentra, se dice el motivo y no se finge el éxito', async () => {
  const reading = fakeReading({ async recordVerdict() { return { saved: false, motivo: 'No sé a cuál decisión te refieres.' }; } });
  const service = createManagerDecisionService({ db: fakeDb(signal), reading, now: () => NOW, logger: quiet });
  await assert.rejects(service.respond(user, { source: 'LECTURA', id: '2026-11-10:9', respuesta: 'HACER' }), (error) => error.status === 409 && /No sé a cuál/.test(error.message));
});

test('«no aplica» en el Observer guarda el motivo sin perder el resto de la señal', async () => {
  const db = fakeDb(signal);
  const service = createManagerDecisionService({ db, reading: fakeReading(), now: () => NOW, logger: quiet });
  await service.respond(user, { source: 'OBSERVER', id: 's1', respuesta: 'NO_APLICA', motivo: 'NO_PRIORIDAD', nota: 'Lo vemos en enero' });
  const [update] = db.updates;
  assert.deepEqual(update.where, { id: 's1', status: 'OPEN', updatedAt: signal.updatedAt });
  assert.equal(update.data.status, 'DISMISSED');
  assert.equal(update.data.lastActionById, 'u1');
  assert.equal(update.data.metadata.origen, 'minuta');
  assert.deepEqual(update.data.metadata.dismissal, { reason: 'NO_PRIORIDAD', label: 'No es prioridad ahora', note: 'Lo vemos en enero', by: 'u1', byName: 'Rodny Chirinos', at: NOW.toISOString() });
});

test('«más tarde» aplaza hasta un día hábil a las 8:00', async () => {
  const db = fakeDb(signal);
  const service = createManagerDecisionService({ db, reading: fakeReading(), now: () => NOW, logger: quiet });
  await service.respond(user, { source: 'OBSERVER', id: 's1', respuesta: 'MAS_TARDE', hasta: 'MANANA' });
  assert.equal(db.updates[0].data.status, 'SNOOZED');
  assert.equal(db.updates[0].data.snoozedUntil.toISOString(), '2026-11-11T13:00:00.000Z');
});

test('una señal ya cerrada o cambiada por otra persona no se pisa', async () => {
  const closed = createManagerDecisionService({ db: fakeDb({ ...signal, status: 'DISMISSED' }), reading: fakeReading(), now: () => NOW, logger: quiet });
  await assert.rejects(closed.respond(user, { source: 'OBSERVER', id: 's1', respuesta: 'HACER' }), (error) => error.status === 409);
  const db = fakeDb(signal);
  db.briaObserverSignal.updateMany = async () => ({ count: 0 });
  const raced = createManagerDecisionService({ db, reading: fakeReading(), now: () => NOW, logger: quiet });
  await assert.rejects(raced.respond(user, { source: 'OBSERVER', id: 's1', respuesta: 'HACER' }), (error) => error.status === 409 && /cambió/.test(error.message));
});

test('una respuesta incompleta se rechaza antes de tocar nada', async () => {
  const db = fakeDb(signal);
  const service = createManagerDecisionService({ db, reading: fakeReading(), now: () => NOW, logger: quiet });
  await assert.rejects(service.respond(user, { source: 'OBSERVER', id: 's1', respuesta: 'NO_APLICA' }), (error) => error.status === 400 && /motivo/.test(error.message));
  assert.equal(db.updates.length, 0);
});
