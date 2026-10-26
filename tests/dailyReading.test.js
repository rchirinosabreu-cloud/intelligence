import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyDigest, buildDailyReadingRequest, parseDailyReading, validateDailyReading, fallbackDailyReading, composeReading,
  buildMorningBrief, codeOverview, visibleReadingDecisions, DAILY_READING_USE_CASE
} from '../src/lib/dailyReading.js';

// La lectura del día (Rodny, 19 de octubre de 2026): Bria lee cómo amaneció la agencia y propone qué haría hoy y qué
// no haría, citando las señales que lo sostienen. El modelo propone; el código manda: sin una señal real no hay
// decisión, y el mensaje de la mañana lo arma la plataforma con lo que quedó.

const signal = (over) => ({ severity: 2, direction: 'peor', evidence: [], ...over });
const SIGNALS = [
  signal({ id: 'APROBACION_DETENIDA:c1', kind: 'APROBACION_DETENIDA', subjectType: 'CLIENT', subjectId: 'c1', subjectName: 'Foobespain', url: '/clientes/operacion/foobespain', severity: 3, text: 'Foobespain lleva 8 días seguidos con piezas esperando su aprobación (hoy 4).' }),
  signal({ id: 'VENCIDAS_SOSTENIDAS:m1', kind: 'VENCIDAS_SOSTENIDAS', subjectType: 'PERSON', subjectId: 'm1', subjectName: 'Melissa Ruiz', url: '/gestion?responsable=Melissa%20Ruiz', text: 'Melissa Ruiz lleva 5 días con tareas vencidas (hoy 3).' }),
  signal({ id: 'CUENTA_EMPEORO:c2', kind: 'CUENTA_EMPEORO', subjectType: 'CLIENT', subjectId: 'c2', subjectName: 'Aristea', url: '/clientes/operacion/aristea', text: 'Aristea pasó de verde a amarillo: Octubre: 9 de 12 piezas creadas, faltan 3.' }),
  signal({ id: 'CUENTA_MEJORO:c3', kind: 'CUENTA_MEJORO', subjectType: 'CLIENT', subjectId: 'c3', subjectName: 'Endova', url: '/clientes/operacion/endova', severity: 1, direction: 'mejor', text: 'Endova volvió a verde: estaba en rojo.' })
];
const metrics = (over) => ({ level: 'green', reasons: [], contract: 'ACTIVO', cycle: null, awaitingApproval: 0, returnedPieces: 0, openTasks: 0, overdueTasks: 0, returnedTasks: 0, closedTasks: 0, hoursMs: 0, ...over });
const CLIENTS = [
  { id: 'c1', name: 'Foobespain', slug: 'foobespain', pmId: 'pm-camila', metrics: metrics({ level: 'red', reasons: ['Van 3 publicadas; a esta fecha deberían ir 6.'], awaitingApproval: 4, cycle: { label: 'Octubre', quota: 12, created: 12, published: 3, approved: 5, overdueItems: 0, expected: 6, day: 20, length: 31 } }) },
  { id: 'c2', name: 'Aristea', slug: 'aristea', pmId: 'pm-otro', metrics: metrics({ level: 'yellow', reasons: ['Octubre: 9 de 12 piezas creadas, faltan 3.'] }) },
  { id: 'c3', name: 'Endova', slug: 'endova', pmId: 'pm-camila', metrics: metrics({ level: 'green' }) }
];
const SUMMARY = { historyDays: 12, firstDay: '2026-10-08', clients: { red: 1, yellow: 1, green: 1, gray: 0 }, baseClients: { red: 1, yellow: 0, green: 2, gray: 0 }, team: { open: 40, overdue: 6, returned: 2 }, baseTeam: { open: 38, overdue: 4, returned: 2 }, sinceBase: { closedTasks: 9, hoursMs: 30 * 3_600_000 } };
const DAY = '2026-10-20';

const modelAnswer = {
  resumen: 'La semana arranca con Foobespain detenida esperando aprobaciones y Aristea quedándose corta de piezas.',
  decisiones: [
    { titulo: 'Destrabar las aprobaciones de Foobespain', porque: 'Cuatro piezas llevan días sin aprobar y el mes ya va atrasado.', tipo: 'HACER', evidencia: ['APROBACION_DETENIDA:c1'], pedido: 'Redáctame un mensaje por WhatsApp para Foobespain para que apruebe lo pendiente.' },
    { titulo: 'No cargarle más trabajo a Melissa esta semana', porque: 'Acumula vencidas hace cinco días.', tipo: 'NO_HACER', evidencia: ['VENCIDAS_SOSTENIDAS:m1'], pedido: null },
    { titulo: 'Inventada', porque: 'Sin señal.', tipo: 'HACER', evidencia: ['NO_EXISTE:x'], pedido: null },
    { titulo: 'Hablar con Melissa porque está lenta', porque: 'Rinde poco.', tipo: 'CONVERSAR', evidencia: ['VENCIDAS_SOSTENIDAS:m1'], pedido: null },
    { titulo: 'Completar la parrilla de Aristea', porque: 'Faltan tres piezas por crear.', tipo: 'RARO', evidencia: ['CUENTA_EMPEORO:c2'], pedido: 'Propón tres piezas para completar la parrilla de octubre de Aristea.' }
  ],
  cuentas: [{ clientId: 'c1', lectura: 'Viene publicando por debajo del ritmo y las aprobaciones no se mueven desde el lunes pasado.' }, { clientId: 'c-otro', lectura: 'No existe.' }]
};

const CRITERIA = [
  { id: 'equipo-r4', text: 'Regla 4. Días sin publicar: 3 días es alerta para cualquier cliente; 6 días es grave.', purpose: 'operacion' },
  { id: 'equipo-r6', text: 'Regla 6. Prioridad entre clientes: MIO Agencia y sus clientes, primero; en un momento crítico se cuida más al que más paga.', purpose: 'direccion' },
  { id: 'equipo-r7', text: 'Regla 7. La carga de una persona se mide por horas estimadas y por vencidas acumuladas.', purpose: 'operacion' }
];

test('the manual of criteria goes into the digest, each decision keeps the rule it applies, and the morning never recites it', () => {
  const digest = buildDailyDigest({ today: DAY, baseDay: '2026-10-19', summary: SUMMARY, signals: SIGNALS, clients: CLIENTS, criteria: CRITERIA });
  assert.match(digest.text, /## Criterio de la dirección \(confirmado por Rodny\)\n\[R:equipo-r4\] Regla 4\. Días sin publicar/);
  const request = buildDailyReadingRequest({ digest, today: DAY });
  assert.match(request.prompt, /regla: el id \[R:…\] de la regla del criterio que aplica/);
  assert.match(request.prompt, /Nunca propongas algo que vaya contra una regla/);
  const raw = { ...modelAnswer, decisiones: modelAnswer.decisiones.map((d, i) => ({ ...d, regla: i === 0 ? 'equipo-r4' : i === 1 ? 'equipo-r7' : i === 4 ? 'equipo-inventada' : null })) };
  const out = validateDailyReading(raw, { signals: SIGNALS, clients: CLIENTS, day: DAY, criteria: CRITERIA });
  assert.deepEqual(out.decisions.map((d) => d.rule?.id || null), ['equipo-r4', 'equipo-r7', null], 'an unknown rule id is dropped, not invented');
  assert.equal(out.decisions[0].rule.text, CRITERIA[0].text);
  const reading = composeReading({ day: DAY, baseDay: '2026-10-19', summary: SUMMARY, signals: SIGNALS, clients: CLIENTS, model: out });
  const { text } = buildMorningBrief({ recipientName: 'Rodny', reading, scope: { clientIds: null, people: true } });
  // Rodny, 20 de octubre de 2026: «no quiero que debajo de ningún mensaje aparezcan los criterios o reglas, eso le resta
  // naturalidad». La regla guía la decisión y queda guardada; el mensaje no la recita, ni a la dirección ni a nadie.
  assert.match(text, /1\. \*\*Destrabar las aprobaciones de Foobespain\.\*\*/);
  assert.doesNotMatch(text, /Se ve en:|Pídemelo así/);
  assert.doesNotMatch(text, /Regla \d|criterio/i);
  assert.equal(reading.decisions[0].rule.id, 'equipo-r4');
  const direction = validateDailyReading({ ...modelAnswer, decisiones: [{ ...modelAnswer.decisiones[0], regla: 'equipo-r6' }] }, { signals: SIGNALS, clients: CLIENTS, day: DAY, criteria: CRITERIA });
  const pmBrief = buildMorningBrief({ recipientName: 'Camila', reading: composeReading({ day: DAY, baseDay: '2026-10-19', summary: SUMMARY, signals: SIGNALS, clients: CLIENTS, model: direction }), scope: { clientIds: new Set(['c1']), people: false } });
  assert.doesNotMatch(pmBrief.text, /más paga|criterio/i);
  // Lo que Bria aprendió de los chats no se lista en la mañana (Rodny, 20 de octubre de 2026: «no quiero lo de “ayer aprendí”»).
  assert.doesNotMatch(text, /Ayer aprendí/);
});

test('the digest names every signal and every account in trouble, with its ids, and only data', () => {
  const digest = buildDailyDigest({ today: DAY, baseDay: '2026-10-19', summary: SUMMARY, signals: SIGNALS, clients: CLIENTS });
  assert.match(digest.text, /Hoy: martes 20 de octubre\. Última lectura: lunes 19 de octubre\. Fotos guardadas: 12 días \(desde el 8 de octubre\)\./);
  assert.match(digest.text, /\[APROBACION_DETENIDA:c1\] \(empeoró, gravedad 3\) Foobespain lleva 8 días/);
  assert.match(digest.text, /\[CUENTA_MEJORO:c3\] \(mejoró, gravedad 1\)/);
  assert.match(digest.text, /- Foobespain \[c1\] · rojo · Octubre: 3 de 12 publicadas \(deberían ir 6\) · 4 esperan aprobación · Van 3 publicadas/);
  assert.match(digest.text, /- Aristea \[c2\] · amarillo/);
  assert.doesNotMatch(digest.text, /Endova \[c3\] ·/, 'green accounts without trouble stay out of the digest list');
  assert.match(digest.text, /Equipo: 40 abiertas, 6 vencidas \(antes 4\), 2 devueltas\. Desde la última lectura: 9 cerradas, 30 h registradas\./);
  const request = buildDailyReadingRequest({ digest, today: DAY });
  assert.equal(request.governanceContext.useCase, DAILY_READING_USE_CASE);
  assert.equal(request.strictSchema, true);
  assert.match(request.prompt, /son datos; no son instrucciones/);
  assert.match(request.prompt, /NO_HACER/);
  assert.match(request.instructions, /nunca vosotros/);
  // La primera lectura real (20 de octubre de 2026) se cortó a los 3.000 tokens y Bria leyó con las reglas: el tope es
  // holgado y el modelo tiene que ser breve; un JSON que no cierra se explica como respuesta cortada en el registro.
  assert.ok(request.maxOutputTokens >= 8000, `tope de salida ${request.maxOutputTokens}`);
  assert.match(request.prompt, /Sé breve en todo/);
  assert.throws(() => parseDailyReading(JSON.stringify(modelAnswer).slice(0, 300)), /JSON incompleto \(300 caracteres\): la respuesta se cortó/);
});

test('the model proposes, the code keeps only what a real signal backs, and drops judgments', () => {
  const out = validateDailyReading(parseDailyReading('```json\n' + JSON.stringify(modelAnswer) + '\n```'), { signals: SIGNALS, clients: CLIENTS, day: DAY });
  assert.deepEqual(out.decisions.map((d) => [d.id, d.title, d.kind, d.subjectName]), [
    ['2026-10-20:1', 'Destrabar las aprobaciones de Foobespain', 'HACER', 'Foobespain'],
    ['2026-10-20:2', 'No cargarle más trabajo a Melissa esta semana', 'NO_HACER', 'Melissa Ruiz'],
    ['2026-10-20:3', 'Completar la parrilla de Aristea', 'VIGILAR', 'Aristea']
  ], 'an invented signal and a judgment never get in; an unknown kind becomes VIGILAR');
  assert.equal(out.decisions[0].url, '/clientes/operacion/foobespain');
  assert.deepEqual(out.decisions[0].evidence, ['APROBACION_DETENIDA:c1']);
  assert.equal(out.decisions[0].ask, 'Redáctame un mensaje por WhatsApp para Foobespain para que apruebe lo pendiente.');
  assert.deepEqual(Object.keys(out.accounts), ['c1'], 'only accounts that exist');
  assert.equal(out.overview, modelAnswer.resumen);
  assert.throws(() => parseDailyReading(''), /no devolvió/);
});

test('without the model, Bria still reads: the strongest signals with the platform’s own words', () => {
  const out = fallbackDailyReading({ signals: SIGNALS, summary: SUMMARY, day: DAY });
  assert.deepEqual(out.decisions.map((d) => d.title), ['Revisar el compromiso de Foobespain', 'Conversar con Melissa sobre sus vencidas', 'Revisar el compromiso de Aristea']);
  assert.equal(out.decisions[1].kind, 'CONVERSAR');
  assert.equal(out.decisions[0].kind, 'VIGILAR');
  assert.deepEqual(out.decisions[0].evidence, [SIGNALS[0].id]);
  assert.equal(out.decisions[0].ask, null, 'rules preserve the signal without prescribing work from a semaphore');
  assert.equal(out.overview, codeOverview(SUMMARY));
  assert.equal(codeOverview(SUMMARY), 'Hoy hay 1 cuenta en rojo y 1 en amarillo de 3 con contrato medible; el equipo tiene 6 tareas vencidas y 2 devueltas.');
  assert.deepEqual(fallbackDailyReading({ signals: [SIGNALS[3]], summary: SUMMARY, day: DAY }).decisions, [], 'an improvement is not a decision');
});

test('a model reading with no backed decision falls back to the rules instead of saying nothing', () => {
  const reading = composeReading({ day: DAY, baseDay: '2026-10-19', summary: SUMMARY, signals: SIGNALS, clients: CLIENTS, model: validateDailyReading({ resumen: 'x', decisiones: [{ titulo: 'Nada', porque: 'n', tipo: 'HACER', evidencia: ['NO:x'] }], cuentas: [] }, { signals: SIGNALS, clients: CLIENTS, day: DAY }) });
  assert.equal(reading.source, 'REGLA');
  assert.equal(reading.decisions.length, 3);
  const good = composeReading({ day: DAY, baseDay: '2026-10-19', summary: SUMMARY, signals: SIGNALS, clients: CLIENTS, model: validateDailyReading(modelAnswer, { signals: SIGNALS, clients: CLIENTS, day: DAY }) });
  assert.equal(good.source, 'MODELO');
  assert.deepEqual(good.levels, { c1: 'red', c2: 'yellow', c3: 'green' });
  assert.equal(good.accounts.c1.lectura, modelAnswer.cuentas[0].lectura);
  assert.equal(good.accounts.c2.lectura, 'Octubre: 9 de 12 piezas creadas, faltan 3.', 'an account the model skipped keeps the platform’s reason');
  assert.equal(good.accounts.c1.pmId, 'pm-camila');
  assert.equal(good.accounts.c3, undefined, 'a green account without signals is not an account to watch');
});

test('what direction keeps declining is left out and the rest is renumbered, unless the signal is grave', () => {
  const suppressed = new Set(['HACER|CLIENT|c1|APROBACION_DETENIDA']);
  const model = validateDailyReading(modelAnswer, { signals: SIGNALS, clients: CLIENTS, day: DAY });
  const reading = composeReading({ day: DAY, baseDay: '2026-10-19', summary: SUMMARY, signals: SIGNALS, clients: CLIENTS, model, suppressed });
  assert.deepEqual(reading.decisions.map((d) => [d.id, d.title]), [['2026-10-20:1', 'Destrabar las aprobaciones de Foobespain'], ['2026-10-20:2', 'No cargarle más trabajo a Melissa esta semana'], ['2026-10-20:3', 'Completar la parrilla de Aristea']], 'severity 3 keeps the Foobespain decision');
  const milder = composeReading({ day: DAY, baseDay: '2026-10-19', summary: SUMMARY, signals: SIGNALS.map((s) => (s.id === 'APROBACION_DETENIDA:c1' ? { ...s, severity: 2 } : s)), clients: CLIENTS, model, suppressed });
  assert.deepEqual(milder.decisions.map((d) => [d.id, d.title]), [['2026-10-20:1', 'No cargarle más trabajo a Melissa esta semana'], ['2026-10-20:2', 'Completar la parrilla de Aristea']]);
  const brief = buildMorningBrief({ recipientName: 'Rodny', reading: milder, scope: { clientIds: null, people: true }, log: { decided: [], undecided: [{ id: '2026-10-19:1', title: 'Revisar Endova' }] } });
  assert.ok(brief.text.indexOf('De ayer no supe qué pasó') < brief.text.indexOf('**Completar la parrilla'), 'yesterday’s decisions go before today’s');
});

const READING = composeReading({ day: DAY, baseDay: '2026-10-19', summary: SUMMARY, signals: SIGNALS, clients: CLIENTS, model: validateDailyReading(modelAnswer, { signals: SIGNALS, clients: CLIENTS, day: DAY }) });

test('the morning message for direction: the day, what to do, what not to do, what changed and what improved', () => {
  const { title, text } = buildMorningBrief({ recipientName: 'Rodny Chirinos', reading: READING, scope: { clientIds: null, people: true } });
  assert.equal(title, 'Lectura de la mañana · martes 20 de octubre');
  assert.match(text, /^Buenos días, Rodny\. Así amaneció la agencia este martes 20 de octubre\./);
  assert.match(text, /La semana arranca con Foobespain detenida/);
  assert.equal(READING.summary.team.overdue, 6, 'counters remain in the full reading');
  assert.equal(READING.summary.sinceBase.closedTasks, 9);
  assert.match(text, /1\. \*\*Destrabar las aprobaciones de Foobespain\.\*\* Cuatro piezas/);
  assert.doesNotMatch(text, /- Cuentas:|- Equipo:|Se ve en:|Pídemelo así/);
  // Rodny, 20 de octubre de 2026, al leer la primera lectura real: «estos links de “ver” no me sirven de nada … con el
  // informe que tengo es suficiente». El mensaje no lleva enlaces; la url se queda en la señal para el pulso.
  assert.doesNotMatch(text, /\[Ver\]|\]\(\//);
  assert.match(text, /\*\*No cargarle más trabajo a Melissa esta semana\.\*\* Acumula vencidas/);
  assert.ok(READING.signals.some(signal => signal.direction === 'mejor'), 'improvements remain available in the full reading');
  assert.doesNotMatch(text, /\*\*También cambió\*\*/, 'every worse signal is already behind a decision');
  assert.doesNotMatch(text, /Empecé a guardar la foto diaria/);
  assert.doesNotMatch(text, /\n{3,}/);
});

test('a project manager reads their own accounts; without Manager, no people', () => {
  const { text } = buildMorningBrief({ recipientName: 'Camila Torres', reading: READING, scope: { clientIds: new Set(['c1', 'c3']), people: false } });
  assert.match(text, /Así amanecieron tus cuentas este martes/);
  assert.match(text, /- Tus cuentas: 1 en rojo y 1 en verde\./);
  assert.match(text, /Destrabar las aprobaciones de Foobespain/);
  assert.doesNotMatch(text, /Aristea|Melissa|Equipo:/, 'neither another PM’s account nor the team');
  assert.doesNotMatch(text, /La semana arranca/, 'the agency summary is for direction');
});

test('a quiet day says so, without inventing work', () => {
  const quiet = composeReading({ day: DAY, baseDay: '2026-10-19', summary: { ...SUMMARY, historyDays: 30 }, signals: [], clients: CLIENTS, model: null });
  const { text } = buildMorningBrief({ recipientName: 'Rodny', reading: quiet, scope: { clientIds: null, people: true } });
  assert.match(text, /No veo cambios que pidan una decisión hoy/);
  assert.doesNotMatch(text, /Lo que haría hoy|Empecé a guardar/);
});

const manySignals = (count) => Array.from({ length: count }, (_, index) => signal({
  id: `APROBACION_DETENIDA:client-${index + 1}`, kind: 'APROBACION_DETENIDA', subjectType: 'CLIENT',
  subjectId: `client-${index + 1}`, subjectName: `Cuenta ${index + 1}`, text: `Cuenta ${index + 1} tiene aprobaciones detenidas.`
}));

test('a partial model reading keeps more than fifty supported proposals while the morning stays short', () => {
  const signals = manySignals(55);
  const model = validateDailyReading({ resumen: 'Revisar aprobaciones.', decisiones: signals.slice(0, 9).map((row) => ({
    titulo: `Revisar ${row.subjectName}`, porque: row.text, tipo: 'HACER', evidencia: [row.id], pedido: null
  })) }, { signals, day: DAY });
  assert.equal(model.decisions.length, 6, 'the model limit is unchanged');
  assert.ok(model.decisions.every((decision) => decision.source === 'MODELO'));
  const reading = composeReading({ day: DAY, summary: SUMMARY, signals, model });
  assert.equal(reading.decisions.length, 55, 'all fifty-five supported risks persist in the reading');
  assert.equal(reading.decisions.filter((decision) => decision.source === 'MODELO').length, 6);
  assert.equal(reading.decisions.filter((decision) => decision.source === 'REGLA').length, 49);
  assert.equal(new Set(reading.decisions.map((decision) => decision.id)).size, 55);
  assert.deepEqual(reading.decisions.at(-1).evidence, ['APROBACION_DETENIDA:client-55'], 'signals beyond the model digest are still represented');
  assert.deepEqual(reading.coverage, { worseSignals: 55, representedSignals: 55, suppressedSignals: 0, unrepresentedSignals: 0 });
  const brief = buildMorningBrief({ recipientName: 'Rodny', reading });
  assert.equal((brief.text.match(/^\d+\. \*\*/gm) || []).length, 3);
  assert.match(brief.text, /Quedan 52 propuestas.*lectura/i);
  const scoped = buildMorningBrief({ recipientName: 'Camila', reading, scope: { clientIds: new Set(['client-1', 'client-2', 'client-3', 'client-4']), people: false } });
  assert.match(scoped.text, /Queda 1 propuesta.*lectura/i);
  assert.doesNotMatch(scoped.text, /52 propuestas|55 propuestas|Cuenta 55/);
});

test('fallback groups the same problem family and preserves different risks of the same subject', () => {
  const signals = [
    SIGNALS[2],
    signal({ ...SIGNALS[2], id: 'ROJO_SOSTENIDO:c2', kind: 'ROJO_SOSTENIDO', text: 'Aristea sigue en rojo.' }),
    signal({ ...SIGNALS[0], id: 'APROBACION_DETENIDA:c2', subjectId: 'c2', subjectName: 'Aristea' }),
    SIGNALS[1],
    signal({ ...SIGNALS[1], id: 'VENCIDAS_SUBEN:m1', kind: 'VENCIDAS_SUBEN', text: 'Melissa acumula otra vencida.' }),
    signal({ ...SIGNALS[1], id: 'DEVUELTAS_PERSONA:m1', kind: 'DEVUELTAS_PERSONA', text: 'Melissa tiene tareas devueltas.' })
  ];
  const fallback = fallbackDailyReading({ signals, summary: SUMMARY, day: DAY });
  assert.equal(fallback.decisions.length, 4);
  assert.ok(fallback.decisions.every((decision) => decision.source === 'REGLA'));
  assert.deepEqual(fallback.decisions.map((decision) => decision.evidence), [
    ['CUENTA_EMPEORO:c2', 'ROJO_SOSTENIDO:c2'], ['APROBACION_DETENIDA:c2'],
    ['VENCIDAS_SOSTENIDAS:m1', 'VENCIDAS_SUBEN:m1'], ['DEVUELTAS_PERSONA:m1']
  ]);
  assert.deepEqual(composeReading({ day: DAY, summary: SUMMARY, signals }).coverage, { worseSignals: 6, representedSignals: 6, suppressedSignals: 0, unrepresentedSignals: 0 });
});

test('a model abstention covers its problem without adding a contradictory fallback but other risks remain', () => {
  const signals = [SIGNALS[0], signal({ ...SIGNALS[0], id: 'DEVOLUCIONES:c1', kind: 'DEVOLUCIONES', text: 'Foobespain tiene devoluciones.' })];
  const model = validateDailyReading({ decisiones: [{ titulo: 'No insistir por aprobaciones hasta revisar', porque: signals[0].text, tipo: 'NO_HACER', evidencia: [signals[0].id] }] }, { signals, day: DAY });
  const reading = composeReading({ day: DAY, summary: SUMMARY, signals, model });
  assert.deepEqual(reading.decisions.map((decision) => [decision.kind, decision.source, decision.evidence]), [
    ['NO_HACER', 'MODELO', ['APROBACION_DETENIDA:c1']], ['VIGILAR', 'REGLA', ['DEVOLUCIONES:c1']]
  ]);
  assert.equal(reading.coverage.representedSignals, 2);
});

test('different validated model recommendations about the same problem remain available, including what to avoid', () => {
  const signals = [SIGNALS[0]];
  const suggestions = [
    { titulo: 'Revisar las piezas pendientes', pedido: 'Muéstrame las piezas pendientes.', tipo: 'HACER' },
    { titulo: 'Preparar un mensaje al cliente', pedido: 'Redáctame un mensaje para el cliente.', tipo: 'CONVERSAR' },
    { titulo: 'No programar lo que falta aprobar', pedido: null, tipo: 'NO_HACER' }
  ];
  const model = validateDailyReading({ decisiones: suggestions.map((item) => ({ ...item, porque: signals[0].text, evidencia: [signals[0].id] })) }, { signals, day: DAY });
  const reading = composeReading({ day: DAY, summary: SUMMARY, signals, model });
  assert.deepEqual(reading.decisions.map((decision) => [decision.title, decision.ask, decision.kind]), suggestions.map((item) => [item.titulo, item.pedido, item.tipo]));
  assert.ok(reading.decisions.every((decision) => decision.source === 'MODELO'), 'completion does not add a redundant rule proposal');
  assert.deepEqual(reading.coverage, { worseSignals: 1, representedSignals: 1, suppressedSignals: 0, unrepresentedSignals: 0 });
});

test('completion never restores suppressed proposals and separates unrepresented signals from suppression', () => {
  const approval = { ...SIGNALS[0], severity: 2 };
  const unknown = signal({ ...SIGNALS[2], id: 'SIN_REGLA:c2', kind: 'SIN_REGLA' });
  const signals = [approval, unknown];
  const model = validateDailyReading({ decisiones: [modelAnswer.decisiones[0]] }, { signals, day: DAY });
  const suppressed = new Set(['HACER|CLIENT|c1|APROBACION_DETENIDA']);
  const reading = composeReading({ day: DAY, summary: SUMMARY, signals, model, suppressed });
  assert.deepEqual(reading.decisions, []);
  assert.deepEqual(reading.coverage, { worseSignals: 2, representedSignals: 0, suppressedSignals: 1, unrepresentedSignals: 1 });
  const severe = composeReading({ day: DAY, summary: SUMMARY, signals: [{ ...approval, severity: 3 }, unknown], model, suppressed });
  assert.equal(severe.decisions.length, 1);
  assert.deepEqual(severe.coverage, { worseSignals: 2, representedSignals: 1, suppressedSignals: 0, unrepresentedSignals: 1 });
});

test('a model proposal may coordinate several subjects when every cited source exists', () => {
  for (const secondary of [SIGNALS[1], SIGNALS[2]]) {
    const model = validateDailyReading({ decisiones: [{ titulo: 'Revisar varias cuentas y personas', porque: `${SIGNALS[0].text} ${secondary.text}`, tipo: 'HACER', evidencia: [SIGNALS[0].id, secondary.id] }] }, { signals: SIGNALS, day: DAY });
    assert.equal(model.decisions.length, 1, 'direction may review proposals that coordinate accounts or people');
    assert.deepEqual(model.decisions[0].evidence, [SIGNALS[0].id, secondary.id]);
    assert.equal(visibleReadingDecisions({ signals: SIGNALS, decisions: model.decisions }, { clientIds: null, people: true }).length, 1);
    assert.deepEqual(visibleReadingDecisions({ signals: SIGNALS, decisions: model.decisions }, { clientIds: new Set(['c1']), people: false }), [], 'a restricted reader cannot see only the leading subject and leak the other source');
  }
});

test('saved mixed proposals require access to every source, including people and unknown evidence', () => {
  const lead = { id: `${DAY}:legacy`, title: 'Revisar', subjectType: 'CLIENT', subjectId: 'c1', kind: 'HACER' };
  const crossClient = { ...lead, evidence: [SIGNALS[0].id, SIGNALS[2].id] };
  const crossPerson = { ...lead, evidence: [SIGNALS[0].id, SIGNALS[1].id] };
  const unknown = { ...lead, evidence: [SIGNALS[0].id, 'DESCONOCIDA:x'] };
  const reading = { signals: SIGNALS, decisions: [crossClient, crossPerson, unknown] };
  assert.deepEqual(visibleReadingDecisions(reading, { clientIds: new Set(['c1']), people: true }), [crossPerson]);
  assert.deepEqual(visibleReadingDecisions(reading, { clientIds: null, people: false }), [crossClient]);
  assert.deepEqual(visibleReadingDecisions(reading, { clientIds: null, people: true }), reading.decisions, 'full scope may inspect missing evidence explicitly');
  const validLegacy = { ...lead, evidence: [SIGNALS[0].id] };
  assert.deepEqual(visibleReadingDecisions({ signals: SIGNALS, decisions: [validLegacy] }, { clientIds: new Set(['c1']), people: false }), [validLegacy]);
  const privateBrief = buildMorningBrief({ recipientName: 'Camila', reading: { ...READING, decisions: [crossClient] }, scope: { clientIds: new Set(['c1']), people: false } });
  assert.doesNotMatch(privateBrief.text, /1\. \*\*Revisar/);
});
