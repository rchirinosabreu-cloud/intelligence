// La liga del mes en el servidor (2 de noviembre de 2026): cada día hábil se evalúa a cada persona con las fuentes
// reales y se guarda en la base lateral; el dashboard lee el mes, hoy en vivo, la carrera y la bondad; los regalos
// de la semana van a una sola persona. Pruebas con dobles de la base y del repositorio, sin PostgreSQL.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformLeagueService, LEAGUE_COMPUTE_MINUTES } from '../src/services/platformLeagueService.js';

const DAY = '2026-11-03';
const at = (iso) => new Date(iso);
const members = [
  { id: 'm-rodny', name: 'Rodny', avatarUrl: null, user: { id: 'u-rodny', role: 'ADMIN', isActive: true, modulePermissions: { liga: true } } },
  { id: 'm-helen', name: 'Helen', avatarUrl: null, user: { id: 'u-helen', role: 'EDITOR', isActive: true, modulePermissions: { liga: true } } },
  { id: 'm-jesu', name: 'Jesu', avatarUrl: null, user: { id: 'u-jesu', role: 'EDITOR', isActive: true, modulePermissions: { liga: true } } }
];

const fakeDb = () => ({
  teamMember: {
    findMany: async () => members,
    findUnique: async ({ where }) => members.find((m) => m.user.id === where.userId) || null
  },
  task: {
    findMany: async ({ where, select }) => {
      if (where.returnedAt) return [{ assigneeId: 'm-jesu' }];
      // Lo cerrado el 3: Rodny con reloj y avance, a tiempo; Helen con tiempo declarado y sin avance, tarde.
      return [
        { id: 't-r', title: 'Reel', assigneeId: 'm-rodny', completedAt: at(`${DAY}T20:00:00.000Z`), dueDate: at(`${DAY}T12:00:00.000Z`) },
        { id: 't-h', title: 'Caption', assigneeId: 'm-helen', completedAt: at(`${DAY}T21:00:00.000Z`), dueDate: at(`${DAY}T12:00:00.000Z`) }
      ].filter(() => select);
    }
  },
  recognitionTaskState: { findMany: async () => [{ taskId: 't-r', originalDueDate: at(`${DAY}T12:00:00.000Z`) }, { taskId: 't-h', originalDueDate: at('2026-11-02T12:00:00.000Z') }] },
  taskWorkSession: {
    findMany: async ({ where }) => (where.taskId
      ? [{ taskId: 't-r', workerId: 'm-rodny', durationMs: 50 * 60_000, closeReason: 'PAUSED' }, { taskId: 't-h', workerId: 'm-helen', durationMs: 60 * 60_000, closeReason: 'DECLARED' }]
      : [{ workerId: 'm-rodny', durationMs: 50 * 60_000, isOverlapping: false, correctedAt: null, closeReason: 'PAUSED', startedAt: at(`${DAY}T18:00:00.000Z`), endedAt: at(`${DAY}T18:50:00.000Z`) },
        // Jesu sigue con el reloj andando al evaluar: lo que lleva se mide hasta ahora (y si pasara de 8 h, contaría como olvidado).
        { workerId: 'm-jesu', durationMs: null, isOverlapping: false, correctedAt: null, closeReason: null, startedAt: at(`${DAY}T20:00:00.000Z`), endedAt: null }])
  },
  taskComment: { findMany: async () => [{ taskId: 't-r', authorId: 'u-rodny', createdAt: at(`${DAY}T19:00:00.000Z`) }] },
  // La traza operativa: Helen dejó la primera huella del día a las 8:04 de Bogotá (una sesión iniciada a las 7:50 no cuenta: el filtro es desde las 8:00).
  operationalTraceEvent: {
    findFirst: async ({ where, orderBy }) => {
      assert.equal(orderBy.occurredAt, 'asc');
      assert.ok(where.eventType.in.includes('SESSION_STARTED') && where.eventType.in.includes('TASK_LIST_SYNCED'));
      const sameDay = where.occurredAt.gte.getTime() === at(`${DAY}T13:00:00.000Z`).getTime() && where.occurredAt.lt.getTime() === at('2026-11-04T05:00:00.000Z').getTime();
      return sameDay && where.actorId.in.includes('u-helen') ? { actorId: 'u-helen', occurredAt: at(`${DAY}T13:04:00.000Z`) } : null;
    }
  }
});

const fakeRepo = (seed = []) => {
  const days = new Map(seed.map((row) => [`${row.day_key}:${row.member_id}`, row]));
  const kudos = [];
  return {
    days, kudos,
    async saveDays(rows) { for (const row of rows) days.set(`${row.day_key}:${row.member_id}`, { ...row, computed_at: new Date() }); return rows.length; },
    async computedDays(monthKey) { return [...new Set([...days.values()].filter((r) => r.day_key.startsWith(monthKey)).map((r) => r.day_key))]; },
    async daysOfMonth(monthKey, { before }) { return [...days.values()].filter((r) => r.day_key.startsWith(monthKey) && r.day_key < before); },
    async kudosOfMonth(monthKey) { return kudos.filter((k) => k.month_key === monthKey); },
    async giveKudos(row) {
      if (kudos.some((k) => k.week_key === row.week_key && k.giver_member_id === row.giver_member_id)) { const error = new Error('dup'); error.code = '23505'; throw error; }
      const saved = { id: `k${kudos.length + 1}`, ...row, month_key: row.week_key.startsWith('2026-W4') ? '2026-11' : '2026-11', created_at: new Date() };
      kudos.push(saved); return saved;
    }
  };
};

const snapshots = { snapshot: async (dayKey) => (dayKey === DAY ? { people: [{ id: 'm-rodny', metrics: { overdue: 0 } }, { id: 'm-helen', metrics: { overdue: 2 } }, { id: 'm-jesu', metrics: { overdue: 0 } }] } : { people: [] }) };

test('a day is evaluated for every active person from the real sources, and saved with its evidence', async () => {
  const repo = fakeRepo();
  const service = createPlatformLeagueService({ db: fakeDb(), repository: repo, snapshots, now: () => at(`${DAY}T23:30:00.000Z`) });
  const rows = await service.evaluateDay(DAY);
  const by = Object.fromEntries(rows.map((row) => [row.memberId, row.habits]));
  assert.deepEqual(by['m-rodny'], { RELOJ: true, AL_DIA: true, A_TIEMPO: true, DOCUMENTADO: true, SIN_DEVOLUCION: true });
  assert.deepEqual(by['m-helen'], { RELOJ: false, AL_DIA: false, A_TIEMPO: false, DOCUMENTADO: false, SIN_DEVOLUCION: true }, 'declared time, two overdue at dawn, closed after the original date, no comment');
  assert.deepEqual(by['m-jesu'], { RELOJ: true, AL_DIA: true, A_TIEMPO: null, DOCUMENTADO: null, SIN_DEVOLUCION: false }, 'worked without closing; one task returned');
  const extras = Object.fromEntries(rows.map((row) => [row.memberId, row.extras]));
  assert.deepEqual(extras['m-helen'], { PRIMERO_EN_ABRIR: true, PRIMERO_EN_REUNION: null }, 'the first human trace from 8:00 was hers');
  assert.deepEqual(extras['m-rodny'], { PRIMERO_EN_ABRIR: false, PRIMERO_EN_REUNION: null });
  await service.computeAndSave(DAY);
  assert.equal(repo.days.size, 3);
  assert.match(repo.days.get(`${DAY}:m-helen`).evidence.A_TIEMPO, /0 de 1 a tiempo/);
  assert.match(repo.days.get(`${DAY}:m-rodny`).evidence.PRIMERO_EN_ABRIR, /Helen abrió primero, a las 08:04/);
  assert.deepEqual(repo.days.get(`${DAY}:m-helen`).extras, { PRIMERO_EN_ABRIR: true, PRIMERO_EN_REUNION: null }, 'the extras are saved beside the habits');
});

test('the automatic run computes today from 18:05 on business days and backfills the missing days of the month, never a weekend', async () => {
  const repo = fakeRepo([{ day_key: '2026-11-02', member_id: 'm-rodny', habits: {}, evidence: {} }]);
  const early = createPlatformLeagueService({ db: fakeDb(), repository: repo, snapshots, now: () => at(`${DAY}T15:00:00.000Z`) }); // 10:00 Bogotá
  const first = await early.runAutomatic();
  assert.equal(first.today, null, 'too early for today');
  assert.deepEqual(first.backfilled, [], 'the 2nd is already there; the 1st is Sunday');
  const late = createPlatformLeagueService({ db: fakeDb(), repository: repo, snapshots, now: () => at('2026-11-04T23:10:00.000Z') }); // miércoles 18:10 Bogotá
  const second = await late.runAutomatic();
  assert.equal(second.today, '2026-11-04');
  assert.deepEqual(second.backfilled, [DAY], 'the 3rd was missing');
  assert.equal(LEAGUE_COMPUTE_MINUTES, 18 * 60 + 5);
  const weekend = createPlatformLeagueService({ db: fakeDb(), repository: repo, snapshots, now: () => at('2026-11-07T23:10:00.000Z') });
  assert.equal((await weekend.runAutomatic()).today, null, 'Saturday computes nothing new');
});

test('the league of a person: the month so far plus today live, the lanes of the whole team, position, podium and the gifts', async () => {
  const repo = fakeRepo([
    { day_key: '2026-11-02', member_id: 'm-rodny', habits: { RELOJ: true, AL_DIA: true, A_TIEMPO: true, DOCUMENTADO: true, SIN_DEVOLUCION: true }, evidence: {} },
    { day_key: '2026-11-02', member_id: 'm-helen', habits: { RELOJ: false, AL_DIA: true, A_TIEMPO: null, DOCUMENTADO: null, SIN_DEVOLUCION: true }, evidence: {} }
  ]);
  await repo.giveKudos({ week_key: '2026-W45', giver_member_id: 'm-helen', receiver_member_id: 'm-rodny', note: 'Por el reel.' });
  const service = createPlatformLeagueService({ db: fakeDb(), repository: repo, snapshots, now: () => at(`${DAY}T19:00:00.000Z`) }); // 14:00 Bogotá del 3
  const league = await service.leagueFor({ userId: 'u-rodny' });
  assert.equal(league.month, '2026-11');
  assert.equal(league.score, 60, 'ten habits at 5 each, plus one gift at 10');
  assert.deepEqual(league.today.habits, { RELOJ: true, AL_DIA: true, A_TIEMPO: true, DOCUMENTADO: true, SIN_DEVOLUCION: true });
  assert.deepEqual({ earned: league.today.earned, possible: league.today.possible, extrasEarned: league.today.extrasEarned, points: league.today.points }, { earned: 5, possible: 5, extrasEarned: [], points: 25 });
  assert.deepEqual(league.today.extras, { PRIMERO_EN_ABRIR: false, PRIMERO_EN_REUNION: null }, 'the extras object survives beside today’s points');
  assert.equal(league.streak.days, 2);
  assert.equal(league.kudos.score, 10);
  assert.equal(league.kudos.received[0].from, 'Helen');
  assert.equal(league.race.lanes.length, 3);
  assert.deepEqual(league.race.lanes.map((lane) => lane.name), ['Helen', 'Jesu', 'Rodny'], 'fixed order by name, never by score');
  assert.equal(league.race.lanes.find((lane) => lane.isSelf).score, 60);
  assert.equal(league.race.lanes.find((lane) => lane.name === 'Helen').score, 20, 'two habits on the 2nd, one today and the extra for opening first');
  assert.ok(!('level' in league.race.lanes[0]), 'no levels anywhere');
  assert.deepEqual(league.race.track, { max: 100, marks: [0, 25, 50, 75, 100] });
  assert.equal(league.position.rank, 1);
  assert.equal(league.position.of, 3);
  assert.equal(league.podium[0].name, 'Rodny');
  assert.equal(league.nextStep, null, 'nothing lost yet');
  assert.match(league.closesOn, /lunes 30/);
  assert.equal(league.winner, null);
  const helen = await service.leagueFor({ userId: 'u-helen' });
  assert.equal(helen.kudos.givenThisWeek.name, 'Rodny');
  assert.equal(helen.nextStep.key, 'RELOJ');
  assert.deepEqual(helen.today.extrasEarned, ['PRIMERO_EN_ABRIR']);
  assert.equal(helen.today.points, 10);
});

test('the weekly gift: to one other person, once per week, with a short note; the errors say why', async () => {
  const repo = fakeRepo();
  const service = createPlatformLeagueService({ db: fakeDb(), repository: repo, snapshots, now: () => at(`${DAY}T19:00:00.000Z`) });
  const gift = await service.giveKudos({ userId: 'u-rodny', memberId: 'm-helen', note: 'Resolvió el carrusel.' });
  assert.equal(gift.weekKey, '2026-W45');
  assert.equal(gift.to.name, 'Helen');
  await assert.rejects(() => service.giveKudos({ userId: 'u-rodny', memberId: 'm-jesu', note: 'otra' }), (error) => error.statusCode === 409 && /ya regalaste/.test(error.message));
  await assert.rejects(() => service.giveKudos({ userId: 'u-helen', memberId: 'm-helen', note: '' }), (error) => error.statusCode === 400 && /a ti/.test(error.message));
  await assert.rejects(() => service.giveKudos({ userId: 'u-helen', memberId: 'm-nadie', note: '' }), (error) => error.statusCode === 404);
  await assert.rejects(() => service.giveKudos({ userId: 'u-helen', memberId: 'm-rodny', note: 'x'.repeat(121) }), (error) => error.statusCode === 400 && /120/.test(error.message));
});

test('the pilot: only the accounts with the «Liga del mes» box in Equipo get the league and the gift; the rest get 404 and the trophy stays hidden; an administrator without the box is out too; the daily computation still runs for everyone', async () => {
  const repo = fakeRepo();
  // Solo Rodny tiene la casilla; Helen no, y el administrador Jesu tampoco.
  const boxes = { 'u-rodny': { liga: true }, 'u-helen': { gestion: true }, 'u-jesu': {} };
  const db = fakeDb();
  db.teamMember.findUnique = async ({ where }) => {
    const member = members.find((m) => m.user.id === where.userId);
    return member ? { ...member, user: { ...member.user, role: member.user.id === 'u-jesu' ? 'ADMIN' : member.user.role, modulePermissions: boxes[member.user.id] } } : null;
  };
  const service = createPlatformLeagueService({ db, repository: repo, snapshots, now: () => at(`${DAY}T19:00:00.000Z`) });
  const league = await service.leagueFor({ userId: 'u-rodny' });
  assert.equal(league.race.lanes.length, 3, 'Rodny sees the whole team');
  await assert.rejects(() => service.leagueFor({ userId: 'u-helen' }), (error) => error.statusCode === 404 && error.code === 'LEAGUE_NOT_OPEN');
  await assert.rejects(() => service.giveKudos({ userId: 'u-helen', memberId: 'm-rodny', note: '' }), (error) => error.statusCode === 404 && error.code === 'LEAGUE_NOT_OPEN');
  await assert.rejects(() => service.leagueFor({ userId: 'u-jesu' }), (error) => error.code === 'LEAGUE_NOT_OPEN', 'an administrator without the box does not see it either');
  assert.equal(await service.computeAndSave(DAY), 3, 'the three people are evaluated and saved regardless');
});
