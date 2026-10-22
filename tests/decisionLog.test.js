import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VERDICTS, OUTCOMES, normalizeVerdict, resolveDecisionRef, decisionOutcome, suppressedDecisions, isSuppressed,
  scorecard, decisionsSection, verdictWord, SUPPRESS_AFTER, SUPPRESS_DAYS, OUTCOME_AFTER_DAYS, OUTCOME_UNTIL_DAYS
} from '../src/lib/decisionLog.js';

// El libro de decisiones (Rodny, 19 de octubre de 2026: «avanza con el libro de decisiones»). Cada decisión que Bria
// propone queda anotada con lo que decidió la persona y, días después, con lo que pasó. Con eso Bria mide su acierto
// y deja de repetir lo que la dirección descarta. Lógica pura; nunca un juicio sobre nadie.

const decision = (over) => ({ id: '2026-10-20:1', title: 'Destrabar las aprobaciones de Foobespain', why: 'x', kind: 'HACER', evidence: ['APROBACION_DETENIDA:c1'], subjectType: 'CLIENT', subjectId: 'c1', subjectName: 'Foobespain', url: '/clientes/operacion/foobespain', ask: null, ...over });
const signal = (over) => ({ id: 'APROBACION_DETENIDA:c1', kind: 'APROBACION_DETENIDA', subjectType: 'CLIENT', subjectId: 'c1', subjectName: 'Foobespain', severity: 2, direction: 'peor', text: 'Foobespain lleva 8 días…', ...over });
const entry = (over) => ({ decisionId: '2026-10-20:1', dayKey: '2026-10-20', userRef: 'u1', title: 'Destrabar las aprobaciones de Foobespain', kind: 'HACER', subjectType: 'CLIENT', subjectId: 'c1', subjectName: 'Foobespain', evidence: ['APROBACION_DETENIDA:c1'], verdict: 'HECHO', note: null, decidedAt: '2026-10-20T14:00:00Z', outcome: null, outcomeDay: null, outcomeText: null, ...over });

test('a verdict is one of three words, however the person says it', () => {
  assert.deepEqual(VERDICTS, ['HECHO', 'NO', 'DESPUES']);
  for (const [said, want] of [['hecho', 'HECHO'], ['Lo hice', 'HECHO'], ['listo', 'HECHO'], ['ya', 'HECHO'], ['no', 'NO'], ['No lo voy a hacer', 'NO'], ['descartada', 'NO'], ['después', 'DESPUES'], ['luego', 'DESPUES'], ['más tarde', 'DESPUES'], ['la semana que viene', 'DESPUES']]) assert.equal(normalizeVerdict(said), want, said);
  assert.equal(normalizeVerdict('tal vez'), null);
  assert.equal(verdictWord('HECHO'), 'la hiciste');
  assert.equal(verdictWord('NO'), 'la descartaste');
  assert.equal(verdictWord('DESPUES'), 'la dejaste para después');
});

test('a decision is named by its number in the reading or by its id', () => {
  const decisions = [decision(), decision({ id: '2026-10-20:2', title: 'No cargarle más trabajo a Melissa' })];
  assert.equal(resolveDecisionRef(2, decisions)?.id, '2026-10-20:2');
  assert.equal(resolveDecisionRef('2', decisions)?.id, '2026-10-20:2');
  assert.equal(resolveDecisionRef('2026-10-20:1', decisions)?.id, '2026-10-20:1');
  assert.equal(resolveDecisionRef('melissa', decisions)?.id, '2026-10-20:2', 'a word of the title works');
  assert.equal(resolveDecisionRef(7, decisions), null);
  assert.equal(resolveDecisionRef('traba', decisions), null, 'a fragment in both titles is ambiguous');
  assert.equal(resolveDecisionRef('a', decisions), null, 'too short to mean anything');
});

test('the outcome is read from the signals, never assumed', () => {
  const today = '2026-10-22';
  assert.deepEqual(decisionOutcome(entry(), { signals: [signal()], today }), { outcome: 'SIGUE', text: 'Foobespain lleva 8 días…' });
  assert.deepEqual(decisionOutcome(entry(), { signals: [signal({ id: 'CUENTA_MEJORO:c1', kind: 'CUENTA_MEJORO', direction: 'mejor', text: 'Foobespain volvió a verde: estaba en rojo.' })], today }), { outcome: 'MEJORO', text: 'Foobespain volvió a verde: estaba en rojo.' });
  assert.deepEqual(decisionOutcome(entry(), { signals: [], today }), { outcome: 'YA_NO_SE_VE', text: 'La señal que la sostenía ya no aparece en la lectura.' });
  // Otra señal peor del mismo sujeto cuenta como «sigue», aunque sea de otro tipo.
  assert.equal(decisionOutcome(entry(), { signals: [signal({ id: 'ROJO_SOSTENIDO:c1', kind: 'ROJO_SOSTENIDO', text: 'Foobespain lleva 5 días en rojo.' })], today }).outcome, 'SIGUE');
  // Sin señal nueva, la foto de hoy manda: una cuenta que sigue en rojo no se dio por resuelta.
  const current = { clients: [{ id: 'c1', name: 'Foobespain', metrics: { level: 'red', reasons: ['Van 3 publicadas; a esta fecha deberían ir 6.'] } }], people: [{ id: 'm1', name: 'Melissa Ruiz', metrics: { overdue: 3 } }] };
  assert.deepEqual(decisionOutcome(entry(), { signals: [], current, today }), { outcome: 'SIGUE', text: 'Foobespain sigue en rojo: Van 3 publicadas; a esta fecha deberían ir 6.' });
  assert.deepEqual(decisionOutcome(entry({ subjectType: 'PERSON', subjectId: 'm1', evidence: ['VENCIDAS_SOSTENIDAS:m1'] }), { signals: [], current, today }), { outcome: 'SIGUE', text: 'Melissa Ruiz sigue con 3 tareas vencidas.' });
  assert.equal(decisionOutcome(entry(), { signals: [], current: { clients: [{ id: 'c1', name: 'Foobespain', metrics: { level: 'yellow', reasons: [] } }] }, today }).outcome, 'YA_NO_SE_VE', 'yellow is no longer the problem the decision was about');
  // Una decisión NO_HACER no se mide por desenlace: no prometía mover nada.
  assert.equal(decisionOutcome(entry({ kind: 'NO_HACER' }), { signals: [], today }), null);
  assert.deepEqual(OUTCOMES, ['MEJORO', 'YA_NO_SE_VE', 'SIGUE']);
  assert.equal(OUTCOME_AFTER_DAYS, 1);
  assert.equal(OUTCOME_UNTIL_DAYS, 14);
});

test('what direction keeps declining stops being proposed, unless the severity climbs', () => {
  const today = '2026-10-20';
  const noes = [1, 2, 3].map((n) => entry({ decisionId: `2026-10-1${n}:1`, dayKey: `2026-10-1${n}`, verdict: 'NO', decidedAt: `2026-10-1${n}T14:00:00Z` }));
  const set = suppressedDecisions(noes, { today });
  assert.deepEqual([...set], ['HACER|CLIENT|c1']);
  assert.equal(SUPPRESS_AFTER, 3);
  assert.equal(SUPPRESS_DAYS, 30);
  assert.equal(suppressedDecisions(noes.slice(0, 2), { today }).size, 0, 'two noes are not a pattern');
  assert.equal(suppressedDecisions(noes.map((e) => ({ ...e, decidedAt: '2026-08-01T14:00:00Z', dayKey: '2026-08-01' })), { today }).size, 0, 'old noes expire');
  assert.equal(suppressedDecisions([...noes, entry({ decisionId: '2026-10-19:1', dayKey: '2026-10-19', verdict: 'HECHO' })], { today }).size, 0, 'a yes after the noes resets the pattern');
  assert.equal(isSuppressed(decision(), set, { signals: [signal({ severity: 2 })] }), true);
  assert.equal(isSuppressed(decision(), set, { signals: [signal({ severity: 3 })] }), false, 'a severity-3 signal is said anyway');
  assert.equal(isSuppressed(decision({ kind: 'CONVERSAR' }), set, { signals: [signal()] }), false, 'another kind of decision is not suppressed');
});

test('the scorecard counts decisions, never people', () => {
  const entries = [
    entry({ decisionId: 'a', verdict: 'HECHO', outcome: 'YA_NO_SE_VE' }),
    entry({ decisionId: 'b', verdict: 'HECHO', outcome: 'MEJORO' }),
    entry({ decisionId: 'c', verdict: 'HECHO', outcome: 'SIGUE' }),
    entry({ decisionId: 'd', verdict: 'NO', outcome: 'YA_NO_SE_VE' }),
    entry({ decisionId: 'e', verdict: 'NO', outcome: 'SIGUE' }),
    entry({ decisionId: 'f', verdict: 'DESPUES', outcome: null }),
    entry({ decisionId: 'g', verdict: 'HECHO', outcome: null })
  ];
  const card = scorecard(entries, { proposed: 12 });
  assert.deepEqual(card, {
    propuestas: 12, anotadas: 7, hechas: 4, descartadas: 2, aplazadas: 1,
    hechasQueSeResolvieron: 2, hechasQueSiguen: 1, descartadasQueSeResolvieronSolas: 1, descartadasQueSiguen: 1,
    tasaDeAdopcion: 0.33, tasaDeAcierto: 0.67, pendientesDeDesenlace: 2,
    lectura: 'De 12 decisiones propuestas se anotaron 7: 4 hechas, 2 descartadas y 1 aplazada. De las hechas con desenlace, 2 de 3 se resolvieron. De las descartadas, 1 se resolvió sola y 1 sigue.'
  });
  assert.equal(scorecard([], { proposed: 0 }).lectura, 'Todavía no hay decisiones anotadas: cuando digas «hice la 1» o «la 2 no», empiezo a medir.');
});

test('the morning message tells what was decided yesterday and what happened, and asks for what is missing', () => {
  const lines = decisionsSection({
    decided: [entry({ verdict: 'HECHO', outcome: 'YA_NO_SE_VE', outcomeText: 'La señal que la sostenía ya no aparece en la lectura.' }), entry({ decisionId: '2026-10-20:2', title: 'Revisar la cuenta de Aristea', verdict: 'NO', outcome: 'SIGUE', outcomeText: 'Aristea lleva 6 días en rojo.' })],
    undecided: [decision({ id: '2026-10-20:3', title: 'Mirar el hueco de Endova' })]
  });
  assert.deepEqual(lines, [
    '**Lo que decidiste ayer**', '',
    '- **Destrabar las aprobaciones de Foobespain**: la hiciste. Hoy la señal que la sostenía ya no aparece en la lectura.',
    '- **Revisar la cuenta de Aristea**: la descartaste. Hoy sigue: Aristea lleva 6 días en rojo.',
    '', 'De ayer no supe qué pasó con «Mirar el hueco de Endova»; si la trabajaste o la descartaste, cuéntamelo cuando puedas.', ''
  ]);
  assert.deepEqual(decisionsSection({ decided: [], undecided: [] }), []);
  const two = decisionsSection({ decided: [], undecided: [decision(), decision({ id: 'x:2', title: 'Otra' })] }).at(-2);
  assert.match(two, /no supe qué pasó con 2 de las que te propuse/);
  assert.doesNotMatch(two, /dime «|anoto|formulario/, 'never a form, never an instruction on how to answer');
});
