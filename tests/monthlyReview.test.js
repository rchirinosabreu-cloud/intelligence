import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMonthlyReview, firstBusinessDayOf, previousMonthOf } from '../src/lib/monthlyReview.js';
import { buildClientProfitability } from '../src/lib/clientProfitability.js';
import { createMonthlyReviewService } from '../src/services/monthlyReviewService.js';

// La revisión de las cuentas al cerrar el mes (Rodny, 23 de octubre de 2026, cuarta pieza de «Bria como ojos y
// cerebro»): un mensaje el primer día hábil con lo que dejó cada cuenta, lo que cambió frente al mes anterior y qué
// conviene mirar. Lo escribe la plataforma con la cuenta de rentabilidad, sin modelo y sin juicios. Datos inventados.

const H = 3_600_000;
const work = (clientId, total) => Array.from({ length: total / 2 }, () => ({ clientId, ms: 2 * H }));
const clients = [{ id: 'c-endova', name: 'Endova' }, { id: 'c-aristea', name: 'Aristea' }, { id: 'c-nuva', name: 'Nuva' }, { id: 'c-wine', name: 'Wine & Wonder' }, { id: 'c-pablo', name: 'Pablo Hoff' }];
const month = (m, { receivables, sessions, closedTasks = [], unlinkedIncomeCents = 0 }) => buildClientProfitability({ year: 2026, month: m, clients, receivables, expenses: [{ amount: 10_000_000 }], sessions, closedTasks, unlinkedIncomeCents });
const august = month(8, { receivables: [{ clientId: 'c-endova', amount: 1_000_000 }, { clientId: 'c-aristea', amount: 4_000_000 }, { clientId: 'c-wine', amount: 5_000_000 }], sessions: [...work('c-endova', 30), ...work('c-aristea', 20), ...work('c-wine', 20), ...work(null, 30)] });
const september = month(9, {
  receivables: [{ clientId: 'c-endova', amount: 1_000_000 }, { clientId: 'c-aristea', amount: 2_000_000 }, { clientId: 'c-wine', amount: 6_000_000 }, { clientId: 'c-pablo', amount: 1_500_000 }],
  sessions: [...work('c-endova', 30), ...work('c-aristea', 30), ...work('c-wine', 10), ...work('c-nuva', 10), ...work(null, 20)],
  closedTasks: [...Array(4).fill({ clientId: 'c-aristea', measuredMs: 0 }), { clientId: 'c-aristea', measuredMs: H }],
  unlinkedIncomeCents: 70_000_000
});

test('el mensaje dice lo que dejó la agencia, las cuentas que costaron más de lo que dejaron y lo que cambió frente al mes anterior', () => {
  const { title, text } = buildMonthlyReview({ personName: 'Rodny Chirinos', current: september, previous: august });
  assert.equal(title, 'Cierre de septiembre de 2026 · cuentas');
  assert.match(text, /^Hola, Rodny\. Así cerró septiembre de 2026 en las cuentas\./);
  assert.match(text, /\*\*La agencia\*\*/);
  assert.match(text, /Ingreso de clientes \$10\.500\.000 y costo de operación \$10\.000\.000/);
  assert.match(text, /En agosto de 2026 quedaron/);
  assert.match(text, /\*\*Costaron más de lo que dejaron\*\*[\s\S]*- \*\*Endova\*\*: entró \$1\.000\.000 y costó/);
  assert.match(text, /Endova[^\n]*También quedó por debajo en agosto/, 'dice cuando pierde dos meses seguidos');
  assert.match(text, /\*\*Lo que más cambió\*\*[\s\S]*Aristea[^\n]*bajó/);
  assert.match(text, /Wine & Wonder[^\n]*subió/);
  assert.match(text, /\[Ver la rentabilidad\]\(\/financiero\?tab=rentabilidad&year=2026&month=9\)/);
});

test('lo que propone es concreto, sale de los datos y nunca juzga a nadie', () => {
  const { text, proposals } = buildMonthlyReview({ personName: 'Rodny', current: september, previous: august });
  assert.match(text, /\*\*Lo que propongo\*\*/);
  assert.ok(proposals.some((line) => /Revisar el alcance o el precio de Endova: costó más de lo que dejó en agosto y en septiembre/.test(line)));
  assert.ok(proposals.some((line) => /Confirmar si a Nuva le falta la cuenta por cobrar de septiembre: tuvo 10 h de trabajo sin ingreso/.test(line)));
  assert.ok(proposals.some((line) => /Pedir que se registre el tiempo en Aristea: solo 1 de 5 tareas cerradas lo tienen/.test(line)));
  assert.ok(proposals.some((line) => /Ligar a su cliente \$700\.000 de ingresos de septiembre/.test(line)));
  assert.ok(proposals.length <= 5);
  assert.doesNotMatch(text, /\b(mal|malo|mala|lento|flojo|culpa|desastre|pésim)/i);
});

test('sin el mes anterior no compara, y sin cuentas lo dice', () => {
  const alone = buildMonthlyReview({ personName: 'Rodny', current: september, previous: null });
  assert.doesNotMatch(alone.text, /Lo que más cambió|También quedó por debajo/);
  const empty = buildMonthlyReview({ personName: 'Rodny', current: month(9, { receivables: [], sessions: [] }), previous: null });
  assert.match(empty.text, /No hay ingresos ni horas de clientes en septiembre de 2026/);
});

const fakeService = ({ at }) => {
  const deliveries = new Map(), notes = [], notified = [], whatsapp = [], asked = [];
  const people = [
    { id: 'u-rodny', name: 'Rodny Chirinos', role: 'ADMIN', teamMember: { id: 'm1', name: 'Rodny Chirinos' } },
    { id: 'u-camila', name: 'Camila', role: 'PROJECT_MANAGER', teamMember: { id: 'm2', name: 'Camila' } }
  ];
  const service = createMonthlyReviewService({
    db: {}, now: () => new Date(at), listPeople: async () => people, logger: { error() {}, log() {} },
    profitability: { read: async (period) => { asked.push(period); return period.month === 9 ? september : august; } },
    conversations: { postAssistantNote: async (actor, note) => { notes.push([actor.ref, note]); return { id: `chat-${notes.length}` }; } },
    repository: { monthlyReviewDelivery: async (key, ref) => deliveries.get(`${key}:${ref}`) || null, recordMonthlyReviewDelivery: async (key, ref, id) => { deliveries.set(`${key}:${ref}`, { conversationId: id }); return { monthKey: key, userRef: ref, conversationId: id }; } },
    notify: async (row) => notified.push(row), whatsapp: (row) => whatsapp.push(row)
  });
  return { service, notes, notified, whatsapp, asked };
};

test('el primer día hábil desde las 8:00 le deja la revisión a cada administrador, una sola vez; nunca a un project manager', async () => {
  const early = fakeService({ at: '2026-10-01T12:00:00Z' }); // 7:00 en Bogotá
  assert.equal((await early.service.runAutomatic()).skipped, 'fuera de horario');
  const { service, notes, notified, whatsapp, asked } = fakeService({ at: '2026-10-01T14:00:00Z' }); // 9:00
  const first = await service.runAutomatic();
  assert.deepEqual([first.monthKey, first.delivered, first.already], ['2026-09', 1, 0]);
  assert.deepEqual(asked, [{ year: 2026, month: 9 }, { year: 2026, month: 8 }]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0][0], 'u-rodny', 'la rentabilidad es solo de administradores');
  assert.equal(notes[0][1].title, 'Cierre de septiembre de 2026 · cuentas');
  assert.deepEqual([notified[0].type, notified[0].relatedId], ['BRIA_REVISION_MES', 'chat-1']);
  assert.equal(whatsapp[0].sourceRef, 'REVISION_MES:2026-09');
  const again = await service.runAutomatic();
  assert.deepEqual([again.delivered, again.already], [0, 1], 'un reinicio no la repite');
  assert.equal(notes.length, 1);
  const later = fakeService({ at: '2026-10-06T15:00:00Z' });
  assert.equal((await later.service.runAutomatic()).delivered, 1, 'si el servidor no estuvo el primer día hábil, sale el siguiente');
});

test('el primer día hábil del mes y el mes que se revisa, en reloj de Colombia', () => {
  assert.equal(firstBusinessDayOf('2026-11'), '2026-11-03', 'el 1 es domingo y el 2 es festivo (Todos los Santos)');
  assert.equal(firstBusinessDayOf('2026-10'), '2026-10-01');
  assert.deepEqual(previousMonthOf('2026-11-03'), { year: 2026, month: 10 });
  assert.deepEqual(previousMonthOf('2027-01-04'), { year: 2026, month: 12 });
});
