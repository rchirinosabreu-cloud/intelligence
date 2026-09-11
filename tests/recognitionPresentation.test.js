import test from 'node:test';
import assert from 'node:assert/strict';

const load = () => import('../src/lib/recognitionPresentation.js');
const event = (overrides = {}) => ({ id: 'a', kind: 'FIRST_TASK', recipient: { id: 'rodny', name: 'Rodny Chirinos' }, occurredAt: '2026-09-10T14:00:00Z', description: 'Completó su primera tarea del día.', ...overrides });

test('presentation recognizes only the six selected categories without inventing a score', async () => {
  const { recognitionLabels } = await load();
  assert.deepEqual(recognitionLabels, {
    FIRST_TASK: 'Buen comienzo', EARLY_DELIVERY: 'Entrega anticipada',
    DAILY_EIGHT: 'On fire', CAUGHT_UP: 'Al día',
    PLAN_APPROVED: 'Parrilla aprobada', WEEKLY_FIFTY: 'Ya son 50',
  });
});

test('task recognition titles require the same explicit task and recipient, never just a shared owner', async () => {
  const { recognitionTitlesForTask } = await load();
  assert.equal(typeof recognitionTitlesForTask, 'function');
  const task = { id: 'task-a', assignee: { userId: 'rodny' } };
  const first = event({ taskId: 'task-a' });
  const early = event({ id: 'early', kind: 'EARLY_DELIVERY', taskId: 'task-a' });
  const all = [first, first, early,
    event({ id: 'other-task', kind: 'DAILY_EIGHT', taskId: 'task-b' }),
    event({ id: 'other-user', kind: 'CAUGHT_UP', taskId: 'task-a', recipient: { id: 'helen', name: 'Helen' } }),
    event({ id: 'no-task', kind: 'WEEKLY_FIFTY' }),
    event({ id: 'plan', kind: 'PLAN_APPROVED', planId: 'plan-a' }),
  ];
  assert.deepEqual(recognitionTitlesForTask(task, all).sort(), ['Buen comienzo', 'Entrega anticipada']);
  assert.deepEqual(recognitionTitlesForTask({ id: 'task-a', assignee: { id: 'rodny' } }, all), []);
  assert.deepEqual(recognitionTitlesForTask({ id: 'no-recognition', assignee: { userId: 'rodny' } }, all), []);
  assert.deepEqual(recognitionTitlesForTask(null, all), []);
});

test('copy preserves the explicit line break and distinguishes eight daily tasks from fifty weekly tasks', async () => {
  const { recognitionMessages } = await load();
  assert.deepEqual(recognitionMessages, {
    FIRST_TASK: 'Eres el primero del equipo en completar una tarea.\nCada avance cuenta.',
    EARLY_DELIVERY: 'Terminaste ese pendiente antes de lo previsto. Anticiparte también suma.',
    DAILY_EIGHT: 'Hoy completaste ocho tareas. ¡Qué manera de hacer avanzar las cosas!',
    CAUGHT_UP: 'Resolviste todo lo que tenías vencido, buen trabajo.',
    PLAN_APPROVED: 'El cliente aprobó tu parrilla, mandemos a producción',
    WEEKLY_FIFTY: 'Llevas 50 tareas cumplidas en esta semana, puro trabajo y dedicación. ¡Felicidades!',
  });
});

test('feed ignores invalid records, deduplicates by ID and sorts newest first', async () => {
  const { mergeRecognitions } = await load();
  const first = event();
  const second = event({ id: 'b', occurredAt: '2026-09-10T16:00:00Z' });
  assert.deepEqual(mergeRecognitions([first], [first, second, null, event({ id: 'bad', occurredAt: 'invalid' }), event({ id: 'unknown', kind: 'POINTS' })]).map(x => x.id), ['b', 'a']);
  assert.deepEqual(mergeRecognitions([], [event({ recipient: null }), event({ description: '' })]), []);
});

test('today uses Bogota calendar dates rather than UTC boundaries', async () => {
  const { recognitionsForDay } = await load();
  const events = [event(), event({ id: 'night', occurredAt: '2026-09-11T03:59:00Z' }), event({ id: 'tomorrow', occurredAt: '2026-09-11T05:00:00Z' })];
  assert.deepEqual(recognitionsForDay(events, new Date('2026-09-10T17:00:00Z')).map(x => x.id).sort(), ['a', 'night']);
});

test('reduced motion disables movement and particles regardless of selected style', async () => {
  const { recognitionMotion } = await load();
  assert.deepEqual(recognitionMotion('celebration', true), { offset: 0, duration: 0, particles: 0 });
  assert.deepEqual(recognitionMotion('quiet', false), { offset: 0, duration: 0, particles: 0 });
  assert.equal(recognitionMotion('subtle', false).particles, 0);
  assert.ok(recognitionMotion('celebration', false).particles <= 30);
});
