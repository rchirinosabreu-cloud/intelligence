import test from 'node:test';
import assert from 'node:assert/strict';
import { decisionMemory, decisionMemoryMessage, isTalkEntry, normalizeResult, resolveEntryRef, talkDecision, talkVerdict } from '../src/lib/briaDecisionMemory.js';
import { normalizeVerdict } from '../src/lib/decisionLog.js';
import { createDailyReadingService } from '../src/services/dailyReadingService.js';
import { createDailyReadingTools } from '../src/services/dailyReadingTools.js';

const TODAY = '2026-11-21';
const entry = (over = {}) => ({ id: 'e1', decisionId: '2026-11-18:1', dayKey: '2026-11-18', userRef: 'rodny', userName: 'Rodny', title: 'Destrabar las aprobaciones de Aristea', kind: 'HACER', subjectName: 'Aristea', evidence: [], verdict: 'HECHO', note: null, decidedAt: '2026-11-18T15:00:00Z', outcome: null, outcomeText: null, revision: 1, ...over });

test('a proposal made in conversation becomes a decision of the same book', () => {
  const decision = talkDecision({ title: 'Mover las piezas de Foobespain a Brayan esta semana', about: 'Foobespain', day: TODAY });
  assert.equal(decision.id, 'charla:2026-11-21:mover las piezas de foobespain a brayan esta semana');
  assert.equal(decision.kind, 'HACER');
  assert.equal(decision.subjectName, 'Foobespain');
  assert.equal(isTalkEntry({ decisionId: decision.id }), true);
  assert.equal(isTalkEntry({ decisionId: '2026-11-18:1' }), false);
  assert.equal(talkDecision({ title: 'ok', day: TODAY }), null, 'una palabra suelta no es una propuesta');
});

test('accepting a proposal by voice counts as doing it; a refusal and a delay keep their meaning', () => {
  assert.equal(talkVerdict('dale, hagámoslo', normalizeVerdict), 'HECHO');
  assert.equal(talkVerdict('sí, me parece', normalizeVerdict), 'HECHO');
  assert.equal(talkVerdict('no, eso no', normalizeVerdict), 'NO');
  assert.equal(talkVerdict('sí, pero la otra semana', normalizeVerdict), 'DESPUES');
});

test('the result is read from what the person said and never guessed', () => {
  assert.equal(normalizeResult('funcionó, el cliente aprobó todo'), 'MEJORO');
  assert.equal(normalizeResult('ya no hay vencidas'), 'MEJORO');
  assert.equal(normalizeResult('no salió bien'), 'SIGUE');
  assert.equal(normalizeResult('sigue igual'), 'SIGUE');
  assert.equal(normalizeResult('hablamos el lunes'), null);
});

test('an entry is found by its subject only when the reference is not ambiguous', () => {
  const rows = [entry(), entry({ id: 'e2', decisionId: 'x', title: 'Repartir la carga de Brayan', subjectName: 'Brayan' }), entry({ id: 'e3', decisionId: 'y', title: 'Revisar la parrilla de Aristea' })];
  assert.equal(resolveEntryRef('aprobaciones de Aristea', rows).id, 'e1');
  assert.equal(resolveEntryRef('Aristea', rows), null, 'dos asuntos de la misma cuenta: no se elige uno');
  assert.equal(resolveEntryRef('e2', rows).id, 'e2');
});

test('Bria reads what she proposed, what was decided, why, and what happened', () => {
  const state = decisionMemory({
    today: TODAY, viewerRef: 'rodny',
    entries: [
      entry({ outcome: 'MEJORO', outcomeText: 'Aristea no tiene piezas esperando aprobación en la foto de hoy.' }),
      entry({ id: 'e2', decisionId: 'charla:2026-11-15:subir el precio', dayKey: '2026-11-15', title: 'Mover dos tareas de Brayan a Camila', subjectName: 'Brayan', verdict: 'HECHO', decidedAt: '2026-11-15T15:00:00Z' }),
      entry({ id: 'e3', decisionId: '2026-11-19:2', dayKey: '2026-11-19', userRef: 'camila', userName: 'Camila', title: 'Llamar a Foobespain', verdict: 'NO', note: 'Espera al cliente', decidedAt: '2026-11-19T15:00:00Z' }),
      entry({ id: 'old', dayKey: '2026-09-01', decidedAt: '2026-09-01T15:00:00Z' })
    ],
    pending: [{ id: '2026-11-20:1', title: 'Revisar la carga de Laura', kind: 'HACER' }],
    card: { anotadas: 3, lectura: 'De 9 decisiones propuestas se anotaron 3.' }
  });
  assert.equal(state.total, 3, 'lo de hace más de 30 días ya no está delante');
  assert.match(state.text, /18 de noviembre, en la lectura: «Destrabar las aprobaciones de Aristea» \(Aristea\)\. esta persona: la hiciste\. Resultado: mejoró\./);
  assert.match(state.text, /Camila: la descartaste, motivo: Espera al cliente/);
  assert.match(state.text, /15 de noviembre, en conversación/);
  assert.match(state.text, /siguen sin respuesta: «Revisar la carga de Laura»/);
  assert.match(state.text, /pregunta de pasada cómo salió: «Mover dos tareas de Brayan a Camila»/);
  const message = decisionMemoryMessage(state);
  assert.equal(message.role, 'developer');
  assert.match(message.content, /no vuelvas a proponer lo que ya se descartó/);
  assert.equal(decisionMemoryMessage(decisionMemory({ today: TODAY })), null, 'sin nada anotado no se dice nada');
});

const RODNY = { id: 'rodny', name: 'Rodny', role: 'ADMIN' };
const bookRepo = () => ({
  rows: [],
  async latestReading() { return null; },
  async recordDecision({ decision, dayKey, user, verdict, note, decidedAt }) {
    const row = { id: `e${this.rows.length + 1}`, decisionId: decision.id, dayKey, userRef: user.ref, userName: user.name, title: decision.title, kind: decision.kind, subjectName: decision.subjectName, subjectId: null, evidence: [], verdict, note, decidedAt: decidedAt.toISOString(), revision: 1, outcome: null, history: [] };
    this.rows.push(row); return row;
  },
  async recentDecisions(today, { userRef = null } = {}) { return this.rows.filter(row => !userRef || row.userRef === userRef); },
  async reportOutcome(id, { outcome, text, day, expectedRevision }) {
    const row = this.rows.find(item => item.id === id);
    if (!row || row.revision !== expectedRevision) return false;
    Object.assign(row, { outcome, outcomeText: text, outcomeDay: day, outcomeSource: 'PERSONA' }); return true;
  },
  async pendingOutcomes() { return this.rows.map(row => ({ ...row })); },
  async setOutcome(id, value) { Object.assign(this.rows.find(row => row.id === id), { outcome: value.outcome, outcomeText: value.text, outcomeDay: value.day, outcomeSource: 'SENALES' }); return true; }
});
const service = (repository) => createDailyReadingService({ db: {}, repository, proactive: {}, conversations: {}, now: () => new Date('2026-11-21T15:00:00Z'), logger: { warn() {}, info() {}, error() {} } });

test('a talk proposal, its decision and its result travel through the tool into the book and back in front of Bria', async () => {
  const repository = bookRepo(), readings = service(repository);
  const [, note] = createDailyReadingTools(readings);
  const saved = await note.run({ propuesta: 'Mover dos tareas de Brayan a Camila esta semana', sobre: 'Brayan', veredicto: 'dale' }, { user: RODNY });
  assert.equal(saved.data.saved, true);
  assert.equal(saved.data.origen, 'CONVERSACION');
  assert.equal(repository.rows[0].verdict, 'HECHO');
  assert.equal(repository.rows[0].dayKey, '2026-11-21');

  const result = await note.run({ decision: 'tareas de Brayan', resultado: 'funcionó, Brayan ya no tiene vencidas' }, { user: RODNY });
  assert.equal(result.data.saved, true);
  assert.equal(repository.rows[0].outcome, 'MEJORO');
  assert.match(repository.rows[0].outcomeText, /^Según Rodny: funcionó/);

  // La foto del día siguiente no sabe nada de esta propuesta: lo que contó la persona se conserva.
  assert.equal(await readings.settleOutcomes('2026-11-22', [], { clients: [], people: [] }), 0);
  assert.equal(repository.rows[0].outcomeSource, 'PERSONA');

  const memory = await readings.decisionMemory(RODNY);
  assert.match(memory.text, /en conversación: «Mover dos tareas de Brayan a Camila esta semana» \(Brayan\)\. esta persona: la hiciste\. Resultado: mejoró\. Según Rodny/);

  const unclear = await note.run({ decision: 'algo que no existe', resultado: 'funcionó' }, { user: RODNY });
  assert.equal(unclear.data.saved, false);
});

test('another person does not read or close what an administrator noted', async () => {
  const repository = bookRepo(), readings = service(repository);
  const [, note] = createDailyReadingTools(readings);
  await note.run({ propuesta: 'Mover dos tareas de Brayan a Camila esta semana', veredicto: 'sí' }, { user: RODNY });
  const camila = { id: 'camila', name: 'Camila', role: 'PROJECT_MANAGER' };
  assert.equal((await readings.decisionMemory(camila)).text, '');
  assert.equal((await note.run({ decision: 'tareas de Brayan', resultado: 'funcionó' }, { user: camila })).data.saved, false);
});
