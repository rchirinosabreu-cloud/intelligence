import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationDigest, buildOperationRequest, validateOperationModel, parseOperationModel, operationModelText, operationModelMessage, operationModelSection, OPERATION_MODEL_USE_CASE } from '../src/lib/briaOperationModel.js';
import { createPmSessionService } from '../src/services/briaPmSessionService.js';
import { buildMorningBrief } from '../src/lib/dailyReading.js';

const names = new Map([['c1', 'Nattal'], ['c2', 'Café Origen'], ['c3', 'Tranquila']]);
const day = (n) => `2026-11-${String(n).padStart(2, '0')}`;
// Diez fotos: Nattal empeora (vencidas 1 → 10, siempre en rojo al final); Café Origen espera aprobación todos los días.
const history = Array.from({ length: 10 }, (_, index) => ({ day: day(11 + index), clients: {
  c1: { level: index > 4 ? 'red' : 'yellow', overdueTasks: index + 1, returnedPieces: 1, returnedTasks: 1, awaitingApproval: 0, hoursMs: 3_600_000, cycle: { published: 4, quota: 12, expected: 8 } },
  c2: { level: 'green', overdueTasks: 0, returnedPieces: 0, returnedTasks: 0, awaitingApproval: 3, hoursMs: 0 },
  c3: { level: 'green', overdueTasks: 0, returnedPieces: 0, returnedTasks: 0, awaitingApproval: 0, hoursMs: 0 },
  huérfana: { level: 'red', overdueTasks: 99 }
} }));
const digestOf = (extra = {}) => buildOperationDigest({ today: day(20), weekKey: '2026-W47', history, names, ...extra });

test('los datos resumen cada cuenta con su serie, dejan las tranquilas en un renglón y no traen personas', () => {
  const digest = digestOf({ book: '- 18 de noviembre: «Mover dos tareas». Resultado: mejoró.', sessions: [{ day: day(19), summary: 'Tres entregas en riesgo.' }], previous: 'La operación venía estable.' });
  assert.equal(digest.days, 10);
  assert.equal(digest.refs.get('C1'), 'Nattal');
  assert.equal(digest.refs.get('C2'), 'Café Origen');
  assert.match(digest.text, /\[C1\] Nattal · 10 fotos · en rojo 5 días, en amarillo 5 · vencidas 1 → 10 \(máximo 10\) · devoluciones 2 → 2 \(máximo 2\)/);
  assert.match(digest.text, /parrilla del ciclo: 4 publicadas de 12, deberían ir 8 · horas registradas 10/);
  assert.match(digest.text, /\[C2\] Café Origen .* esperando aprobación 3 → 3 \(máximo 3\), 10 días con algo esperando/);
  assert.match(digest.text, /Cuentas tranquilas todo el periodo: Tranquila\./);
  assert.match(digest.text, /Últimos 7 días \(7 fotos\)/);
  assert.match(digest.text, /Hace 1 semana \(3 fotos\)/);
  assert.match(digest.text, /Libro de decisiones/);
  assert.match(digest.text, /sesiones de project manager recientes/);
  assert.match(digest.text, /modelo de la semana anterior/);
  // Una cuenta sin nombre conocido no entra como cuenta citable.
  assert.equal([...digest.refs.values()].length, 2);
  assert.equal(buildOperationDigest({ today: day(20), weekKey: '2026-W47', history: history.slice(0, 3), names }), null);
  const request = buildOperationRequest({ digest });
  assert.equal(request.useCase, OPERATION_MODEL_USE_CASE);
  assert.match(request.system, /nunca de personas/);
});

test('la validación deja solo lo que cita cuentas reales o cifras y descarta juicios y aprendizajes sin libro', () => {
  const raw = {
    resumen: 'La operación se carga en una cuenta.',
    patrones: [
      { titulo: 'Nattal acumula vencidas', evidencia: 'Pasó de 1 a 10 vencidas en diez fotos.', cuentas: ['[C1]'] },
      { titulo: 'La agencia mejora', evidencia: 'Las devoluciones bajaron de 4 a 2 por día.', cuentas: [] },
      { titulo: 'Sin sustento', evidencia: 'Se siente pesado.', cuentas: ['C9'] },
      { titulo: 'Juicio', evidencia: 'El equipo es lento con 3 cuentas.', cuentas: ['C1'] }
    ],
    cuellos: [{ titulo: 'Aprobaciones que no llegan', evidencia: '3 piezas esperan hace 10 días.', cuentas: ['c2'] }],
    aprendizajes: [{ titulo: 'Mover tareas sirvió', evidencia: 'Mejoró después del 18.' }],
    vigilar: [{ titulo: 'Nattal', porque: 'Sigue subiendo.', cuentas: ['C1'] }, { titulo: 'Todo', porque: 'Hay 5 cosas.', cuentas: [] }],
    cambio: 'Antes estaba estable.'
  };
  const without = validateOperationModel(raw, digestOf());
  assert.deepEqual(without.patterns.map((item) => item.title), ['Nattal acumula vencidas', 'La agencia mejora']);
  assert.deepEqual(without.patterns[0].accounts, ['Nattal']);
  assert.deepEqual(without.bottlenecks[0].accounts, ['Café Origen']);
  assert.deepEqual(without.watch.map((item) => item.title), ['Nattal']);
  assert.equal(without.lessons.length, 0, 'sin libro no hay aprendizajes');
  assert.equal(without.change, '', 'sin modelo anterior no hay cambio');
  assert.equal(without.rejected, 4);
  const withBook = validateOperationModel(raw, digestOf({ book: 'x', previous: 'y' }));
  assert.equal(withBook.lessons.length, 1);
  assert.equal(withBook.change, 'Antes estaba estable.');
  const text = operationModelText(withBook);
  assert.match(text, /Patrón 1: Nattal acumula vencidas\. .* Cuentas: Nattal\./);
  assert.match(text, /Vigilar 1: Nattal\. Sigue subiendo\./);
  assert.match(operationModelMessage(withBook).content, /no instrucciones/);
  assert.match(operationModelSection(withBook).join('\n'), /Esta semana voy a vigilar: Nattal\./);
  assert.equal(operationModelMessage(validateOperationModel(null, digestOf())), null);
  assert.equal(parseOperationModel('no es json'), null);
});

const repoOf = (overrides = {}) => {
  const saved = new Map();
  return {
    saved,
    operationModel: async (week) => saved.get(week) || null,
    latestOperationModel: async () => [...saved.values()].at(-1) || null,
    saveOperationModel: async (week, model) => { if (!saved.has(week)) saved.set(week, model); return saved.get(week); },
    history: async () => history, snapshot: async () => ({ clients: [...names].map(([id, name]) => ({ id, name })), people: [] }),
    recentDecisions: async () => [], pmSessionsSince: async () => [], ...overrides
  };
};
const answer = JSON.stringify({ resumen: 'Una cuenta concentra el riesgo.', patrones: [{ titulo: 'Nattal acumula vencidas', evidencia: 'De 1 a 10.', cuentas: ['C1'] }], cuellos: [], aprendizajes: [], vigilar: [], cambio: '' });

test('el servicio hace un modelo por semana, en día hábil, y solo administración lo lee', async () => {
  const calls = [];
  const repository = repoOf();
  const brain = { plan: async (request) => { calls.push(request.useCase); return { text: answer, model: 'm', usage: { input_tokens: 1 } }; } };
  const logger = { info: () => {}, warn: () => {}, error: () => {} };
  // Viernes 20 de noviembre de 2026, 7:00 en Bogotá.
  const at = new Date('2026-11-20T12:00:00Z');
  const service = createPmSessionService({ db: {}, repository, brain, now: () => at, logger });
  const made = await service.ensureModel(at);
  assert.equal(made.weekKey, '2026-W47');
  assert.equal(made.patterns[0].accounts[0], 'Nattal');
  assert.deepEqual(calls, [OPERATION_MODEL_USE_CASE]);
  await service.ensureModel(at);
  assert.equal(calls.length, 1, 'la semana ya tiene modelo');
  assert.equal((await service.operationModel({ role: 'ADMIN' })).summary, 'Una cuenta concentra el riesgo.');
  assert.equal(await service.operationModel({ role: 'PROJECT_MANAGER' }), null);
  assert.equal(await service.operationModel({ role: 'ADMIN' }, new Date('2026-12-20T12:00:00Z')), null, 'un modelo viejo ya no se sirve');
  // Sábado: no se hace. Sin modelo disponible: tampoco. Con un fallo: no lanza.
  const weekend = createPmSessionService({ db: {}, repository: repoOf(), brain, now: () => at, logger });
  assert.equal(await weekend.ensureModel(new Date('2026-11-21T12:00:00Z')), null);
  assert.equal(await createPmSessionService({ db: {}, repository: repoOf(), brain: null, logger }).ensureModel(at), null);
  assert.equal(await createPmSessionService({ db: {}, repository: repoOf({ history: async () => { throw new Error('sin base'); } }), brain, logger }).ensureModel(at), null);
});

test('el mensaje de la mañana lleva la mirada de la semana cuando se le pasa', () => {
  const operation = validateOperationModel(JSON.parse(answer), digestOf());
  const reading = { day: day(20), source: 'REGLA', summary: { clients: { red: 1, yellow: 0, green: 2, gray: 0 }, team: { overdue: 10, returned: 2, open: 17 } }, signals: [{ id: 's' }], decisions: [] };
  const { text } = buildMorningBrief({ recipientName: 'Dirección', reading, operation });
  assert.match(text, /Cómo viene la operación \(mi mirada de la semana\)/);
  assert.doesNotMatch(buildMorningBrief({ recipientName: 'Dirección', reading }).text, /mirada de la semana/);
});
