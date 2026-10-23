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

const clientPhoto = (metrics) => ({ clients: [{ id: 'c1', name: 'Foobespain', metrics }] });
const personPhoto = (metrics) => ({ people: [{ id: 'm1', name: 'Melissa Ruiz', metrics }] });
const overdueEntry = (over) => entry({ subjectType: 'PERSON', subjectId: 'm1', evidence: ['VENCIDAS_SOSTENIDAS:m1'], ...over });

test('missing subjects, metrics or original evidence never become a successful outcome', () => {
  for (const current of [null, {}, { clients: [] }, clientPhoto({}), clientPhoto({ level: 'green' })]) {
    const result = decisionOutcome(entry(), { current });
    assert.equal(result.outcome, 'SIN_EVIDENCIA');
    assert.match(result.text, /evidencia suficiente/);
  }
  for (const value of [undefined, null, '', '0', NaN, Infinity, -1]) {
    assert.equal(decisionOutcome(entry(), { current: clientPhoto({ awaitingApproval: value }) }).outcome, 'SIN_EVIDENCIA', String(value));
  }
  assert.equal(decisionOutcome(entry({ evidence: [] }), { current: clientPhoto({ awaitingApproval: 0 }) }).outcome, 'SIN_EVIDENCIA');
  assert.equal(decisionOutcome(entry({ evidence: ['DESCONOCIDA:c1'] }), { current: clientPhoto({ awaitingApproval: 0 }) }).outcome, 'SIN_EVIDENCIA');
  assert.equal(decisionOutcome(entry({ evidence: ['APROBACION_DETENIDA:otro-cliente'] }), { current: clientPhoto({ awaitingApproval: 0 }) }).outcome, 'SIN_EVIDENCIA');
});

test('only the original approval problem is followed, not a different condition on the same client', () => {
  const unrelatedBetter = signal({ id: 'CUENTA_MEJORO:c1', kind: 'CUENTA_MEJORO', direction: 'mejor', text: 'Foobespain salió del rojo.' });
  const unrelatedWorse = signal({ id: 'ROJO_SOSTENIDO:c1', kind: 'ROJO_SOSTENIDO' });
  assert.deepEqual(decisionOutcome(entry(), { signals: [signal()] }), { outcome: 'SIGUE', text: 'Foobespain lleva 8 días…' });
  assert.equal(decisionOutcome(entry(), { signals: [unrelatedBetter, unrelatedWorse] }).outcome, 'SIN_EVIDENCIA');
  assert.equal(decisionOutcome(entry(), { signals: [unrelatedBetter], current: clientPhoto({ level: 'green', awaitingApproval: 2 }) }).outcome, 'SIGUE');
  assert.equal(decisionOutcome(entry(), { signals: [unrelatedWorse], current: clientPhoto({ level: 'red', awaitingApproval: 0 }) }).outcome, 'MEJORO');
  assert.equal(decisionOutcome(entry(), { signals: [signal()], current: clientPhoto({ awaitingApproval: 0 }) }).outcome, 'SIGUE', 'conflicting evidence never reports success');
  assert.equal(decisionOutcome(entry(), { signals: [signal({ subjectId: 'another' })] }).outcome, 'SIN_EVIDENCIA');
});

test('an account improving only to yellow still needs follow-up; gray is unknown', () => {
  for (const kind of ['CUENTA_EMPEORO', 'ROJO_SOSTENIDO']) {
    const aboutAccount = entry({ evidence: [`${kind}:c1`] });
    assert.deepEqual(decisionOutcome(aboutAccount, { current: clientPhoto({ level: 'red', reasons: ['Van 3 publicadas; a esta fecha deberían ir 6.'] }) }), { outcome: 'SIGUE', text: 'Foobespain sigue en rojo: Van 3 publicadas; a esta fecha deberían ir 6.' });
    assert.equal(decisionOutcome(aboutAccount, { current: clientPhoto({ level: 'yellow' }) }).outcome, 'SIGUE');
    assert.equal(decisionOutcome(aboutAccount, { current: clientPhoto({ level: 'green' }) }).outcome, 'MEJORO');
    assert.equal(decisionOutcome(aboutAccount, { current: clientPhoto({ level: 'gray' }) }).outcome, 'SIN_EVIDENCIA');
    assert.equal(decisionOutcome(aboutAccount, { signals: [signal({ id: 'CUENTA_MEJORO:c1', kind: 'CUENTA_MEJORO', direction: 'mejor', text: 'Salió del rojo.' })] }).outcome, 'SIN_EVIDENCIA', 'an improvement signal alone does not prove the account is green');
  }
});

test('one remaining overdue task is still pending; an explicit zero verifies the observed outcome', () => {
  assert.deepEqual(decisionOutcome(overdueEntry(), { current: personPhoto({ overdue: 3 }) }), { outcome: 'SIGUE', text: 'Melissa Ruiz sigue con 3 tareas vencidas.' });
  assert.equal(decisionOutcome(overdueEntry(), { current: personPhoto({ overdue: 1 }) }).outcome, 'SIGUE');
  assert.equal(decisionOutcome(overdueEntry(), { current: personPhoto({ overdue: 0 }) }).outcome, 'MEJORO');
  assert.equal(decisionOutcome(overdueEntry(), { current: personPhoto({ open: 0 }) }).outcome, 'SIN_EVIDENCIA');
  const rising = signal({ id: 'VENCIDAS_SUBEN:m1', kind: 'VENCIDAS_SUBEN', subjectType: 'PERSON', subjectId: 'm1' });
  assert.equal(decisionOutcome(overdueEntry(), { signals: [rising] }).outcome, 'SIGUE', 'the same problem remains relevant even when its signal kind changes');
  const resolved = { ...rising, id: 'VENCIDAS_RESUELTAS:m1', kind: 'VENCIDAS_RESUELTAS', direction: 'mejor' };
  assert.equal(decisionOutcome(overdueEntry({ evidence: ['CARGA_INUSUAL:m1'] }), { signals: [resolved], current: personPhoto({ overdue: 0, open: 12 }) }).outcome, 'SIN_EVIDENCIA', 'solving overdue work does not prove the workload is usual');
});

test('returns require explicit counts and all original concerns need a verified outcome', () => {
  const returns = entry({ evidence: ['DEVOLUCIONES:c1'] });
  assert.equal(decisionOutcome(returns, { current: clientPhoto({ returnedPieces: 0, returnedTasks: 0 }) }).outcome, 'MEJORO');
  assert.equal(decisionOutcome(returns, { current: clientPhoto({ returnedPieces: 0, returnedTasks: 1 }) }).outcome, 'SIGUE');
  assert.equal(decisionOutcome(returns, { current: clientPhoto({ returnedPieces: 0 }) }).outcome, 'SIN_EVIDENCIA');
  const combined = entry({ evidence: ['APROBACION_DETENIDA:c1', 'DEVOLUCIONES:c1'] });
  assert.equal(decisionOutcome(combined, { current: clientPhoto({ awaitingApproval: 0 }) }).outcome, 'SIN_EVIDENCIA');
  assert.equal(decisionOutcome(combined, { current: clientPhoto({ awaitingApproval: 0, returnedPieces: 1, returnedTasks: 0 }) }).outcome, 'SIGUE');
  assert.equal(decisionOutcome(combined, { current: clientPhoto({ awaitingApproval: 0, returnedPieces: 0, returnedTasks: 0 }) }).outcome, 'MEJORO');
  const personalReturns = overdueEntry({ evidence: ['DEVUELTAS_PERSONA:m1'] });
  assert.equal(decisionOutcome(personalReturns, { current: personPhoto({ returned: 0 }) }).outcome, 'MEJORO');
  assert.equal(decisionOutcome(personalReturns, { current: personPhoto({ returned: 1 }) }).outcome, 'SIGUE');
});

test('conditions needing comparison never resolve merely because their signal disappeared', () => {
  for (const kind of ['HORAS_SUBEN', 'SIN_MOVIMIENTO', 'FUERA_DE_ALCANCE']) {
    const observed = entry({ evidence: [`${kind}:c1`] });
    assert.equal(decisionOutcome(observed, { signals: [signal({ id: `${kind}:c1`, kind })] }).outcome, 'SIGUE');
    assert.equal(decisionOutcome(observed, { current: clientPhoto({ level: 'green' }) }).outcome, 'SIN_EVIDENCIA');
  }
  const watchLoad = overdueEntry({ evidence: ['CARGA_INUSUAL:m1'] });
  assert.equal(decisionOutcome(watchLoad, { current: personPhoto({ open: 0, overdue: 0 }) }).outcome, 'SIN_EVIDENCIA');
});

test('not doing something has no measured outcome and historical outcome names stay readable', () => {
  assert.equal(decisionOutcome(entry({ kind: 'NO_HACER' })), null);
  assert.deepEqual(OUTCOMES, ['MEJORO', 'YA_NO_SE_VE', 'SIGUE', 'SIN_EVIDENCIA']);
  assert.equal(OUTCOME_AFTER_DAYS, 1);
  assert.equal(OUTCOME_UNTIL_DAYS, 14);
});

test('what direction keeps declining stops being proposed, unless the severity climbs', () => {
  const today = '2026-10-20';
  const noes = [1, 2, 3].map((n) => entry({ decisionId: `2026-10-1${n}:1`, dayKey: `2026-10-1${n}`, verdict: 'NO', decidedAt: `2026-10-1${n}T14:00:00Z` }));
  const set = suppressedDecisions(noes, { today });
  assert.equal(set.size, 1);
  assert.equal(SUPPRESS_AFTER, 3);
  assert.equal(SUPPRESS_DAYS, 30);
  assert.equal(suppressedDecisions(noes.slice(0, 2), { today }).size, 0, 'two noes are not a pattern');
  assert.equal(suppressedDecisions(noes.map((e) => ({ ...e, decidedAt: '2026-08-01T14:00:00Z', dayKey: '2026-08-01' })), { today }).size, 0, 'old noes expire');
  assert.equal(suppressedDecisions([...noes, entry({ decisionId: '2026-10-19:1', dayKey: '2026-10-19', verdict: 'HECHO' })], { today }).size, 0, 'a yes after the noes resets the pattern');
  assert.equal(isSuppressed(decision(), set, { signals: [signal({ severity: 2 })] }), true);
  assert.equal(isSuppressed(decision(), set, { signals: [signal({ severity: 3 })] }), false, 'a severity-3 signal is said anyway');
  assert.equal(isSuppressed(decision({ kind: 'CONVERSAR' }), set, { signals: [signal()] }), false, 'another kind of decision is not suppressed');
});

test('declining different problems on one account does not silence its other proposals', () => {
  const noes = ['APROBACION_DETENIDA', 'DEVOLUCIONES', 'CUENTA_EMPEORO'].map((kind, index) => entry({
    decisionId: `2026-10-20:${index + 1}`, verdict: 'NO', evidence: [`${kind}:c1`]
  }));
  const set = suppressedDecisions(noes, { today: '2026-10-21' });
  for (const row of noes) assert.equal(isSuppressed(decision({ evidence: row.evidence }), set), false);

  const repeatedApproval = [17, 18, 19].map(day => entry({ dayKey: `2026-10-${day}`, verdict: 'NO', decidedAt: `2026-10-${day}T14:00:00Z` }));
  const rejected = suppressedDecisions(repeatedApproval, { today: '2026-10-21' });
  assert.equal(isSuppressed(decision(), rejected), true);
  assert.equal(isSuppressed(decision({ evidence: ['DEVOLUCIONES:c1'] }), rejected), false, 'a new problem remains visible');
});

test('several people declining the same problem on one day count as one observation', () => {
  const noes = ['u1', 'u2', 'u3'].map(userRef => entry({ userRef, verdict: 'NO' }));
  assert.equal(suppressedDecisions(noes, { today: '2026-10-21' }).size, 0);
  const anotherDay = entry({ dayKey: '2026-10-19', verdict: 'NO', decidedAt: '2026-10-19T14:00:00Z' });
  assert.equal(suppressedDecisions([...noes, anotherDay], { today: '2026-10-21' }).size, 0, 'two days do not become four rejections');
});

test('the same problem can be recognized under different signal names across three days', () => {
  const noes = ['CUENTA_EMPEORO', 'ROJO_SOSTENIDO', 'ROJO_SOSTENIDO'].map((kind, index) => entry({
    dayKey: `2026-10-${17 + index}`, verdict: 'NO', evidence: [`${kind}:c1`], decidedAt: `2026-10-${17 + index}T14:00:00Z`
  }));
  const rejected = suppressedDecisions(noes, { today: '2026-10-20' });
  assert.equal(isSuppressed(decision({ evidence: ['CUENTA_EMPEORO:c1'] }), rejected), true);
  assert.equal(isSuppressed(decision({ evidence: ['ROJO_SOSTENIDO:c1'] }), rejected), true);
  assert.equal(isSuppressed(decision({ evidence: ['ROJO_SOSTENIDO:c1', 'APROBACION_DETENIDA:c1'] }), rejected), false, 'a combined proposal contains a problem never declined');
});

test('a correction to done resets the problem streak before later refusals are counted', () => {
  const noes = [16, 17, 18].map(day => entry({ dayKey: `2026-10-${day}`, verdict: 'NO', decidedAt: `2026-10-${day}T14:00:00Z` }));
  const correction = entry({ dayKey: '2026-10-17', verdict: 'HECHO', decidedAt: '2026-10-19T13:00:00Z' });
  const later = entry({ dayKey: '2026-10-19', verdict: 'NO', decidedAt: '2026-10-19T15:00:00Z' });
  const set = suppressedDecisions([...noes, correction, later], { today: '2026-10-20' });
  assert.equal(isSuppressed(decision(), set), false);
});

test('unidentifiable legacy evidence cannot silence every problem of a subject', () => {
  for (const evidence of [undefined, [], ['APROBACION_DETENIDA:other'], ['APROBACION_DETENIDA:c1', 'DEVOLUCIONES:other']]) {
    const noes = [17, 18, 19].map(day => entry({ dayKey: `2026-10-${day}`, verdict: 'NO', evidence, decidedAt: `2026-10-${day}T14:00:00Z` }));
    const set = suppressedDecisions(noes, { today: '2026-10-20' });
    assert.equal(isSuppressed(decision(), set), false, JSON.stringify(evidence));
    assert.equal(isSuppressed(decision({ evidence }), set), false, 'missing evidence is never a subject wildcard');
  }
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
    hechasQueSeResolvieron: 1, hechasQueSiguen: 1, descartadasQueSeResolvieronSolas: 0, descartadasQueSiguen: 1,
    hechasSinEvidencia: 1, descartadasSinEvidencia: 1, sinEvidenciaDeDesenlace: 2,
    tasaDeAdopcion: 0.33, tasaDeAcierto: 0.5, pendientesDeDesenlace: 4,
    lectura: 'De 12 decisiones propuestas se anotaron 7: 4 hechas, 2 descartadas y 1 aplazada. De las hechas con resultado observado, 1 de 2 ya no presenta el problema. De las descartadas con resultado observado, 0 ya no presentan el problema y 1 sigue. Hay 2 decisiones sin evidencia suficiente para comprobar el resultado; no cuentan como aciertos. Estos resultados no demuestran que la decisión haya causado el cambio.'
  });
  assert.equal(scorecard([], { proposed: 0 }).lectura, 'Todavía no hay decisiones anotadas: cuando digas «hice la 1» o «la 2 no», empiezo a medir.');
});

test('both legacy disappearance and missing evidence are excluded from the accuracy denominator', () => {
  const card = scorecard([
    entry({ outcome: 'YA_NO_SE_VE' }), entry({ outcome: 'SIN_EVIDENCIA' }),
    entry({ verdict: 'NO', outcome: 'SIN_EVIDENCIA' }), entry({ verdict: 'DESPUES', outcome: 'SIN_EVIDENCIA' }),
    entry({ kind: 'NO_HACER', outcome: null })
  ]);
  assert.equal(card.hechasQueSeResolvieron, 0);
  assert.equal(card.hechasSinEvidencia, 2);
  assert.equal(card.descartadasSinEvidencia, 1);
  assert.equal(card.sinEvidenciaDeDesenlace, 4);
  assert.equal(card.tasaDeAcierto, 0);
  assert.equal(card.pendientesDeDesenlace, 4);
});

test('the morning message tells what was decided yesterday and what happened, and asks for what is missing', () => {
  const lines = decisionsSection({
    decided: [entry({ verdict: 'HECHO', outcome: 'YA_NO_SE_VE', outcomeText: 'La señal que la sostenía ya no aparece en la lectura.' }), entry({ decisionId: '2026-10-20:2', title: 'Revisar la cuenta de Aristea', verdict: 'NO', outcome: 'SIGUE', outcomeText: 'Aristea lleva 6 días en rojo.' })],
    undecided: [decision({ id: '2026-10-20:3', title: 'Mirar el hueco de Endova' })]
  });
  assert.deepEqual(lines, [
    '**Lo que decidiste ayer**', '',
    '- **Destrabar las aprobaciones de Foobespain**: la hiciste. No hay evidencia suficiente para comprobar el resultado.',
    '- **Revisar la cuenta de Aristea**: la descartaste. Hoy sigue: Aristea lleva 6 días en rojo.',
    '', 'De ayer no supe qué pasó con «Mirar el hueco de Endova»; si la trabajaste o la descartaste, cuéntamelo cuando puedas.', ''
  ]);
  assert.deepEqual(decisionsSection({ decided: [], undecided: [] }), []);
  const two = decisionsSection({ decided: [], undecided: [decision(), decision({ id: 'x:2', title: 'Otra' })] }).at(-2);
  assert.match(two, /no supe qué pasó con 2 de las que te propuse/);
  assert.doesNotMatch(two, /dime «|anoto|formulario/, 'never a form, never an instruction on how to answer');
  assert.match(decisionsSection({ decided: [entry({ outcome: 'SIN_EVIDENCIA', outcomeText: 'No hay evidencia suficiente para comprobar el resultado.' })] }).join('\n'), /No hay evidencia suficiente para comprobar el resultado/);
});

test('the morning summarizes three prior decisions while preserving the full log for review', () => {
  const decided = Array.from({ length: 50 }, (_, index) => entry({
    decisionId: `2026-10-20:${index + 1}`, title: `Propuesta ${index + 1}`, verdict: 'HECHO',
    history: [{ type: 'VERDICT', verdict: 'HECHO' }]
  }));
  const before = structuredClone(decided);
  const message = decisionsSection({ decided }).join('\n');
  assert.equal((message.match(/^- \*\*/gm) || []).length, 3);
  assert.match(message, /otras 47 decisiones anotadas/);
  assert.match(message, /conversación de esa lectura/);
  assert.doesNotMatch(message, /\*\*Propuesta (?:4|50)\*\*/);
  assert.deepEqual(decided, before, 'summarizing does not discard the saved decisions or their correction histories');
});
