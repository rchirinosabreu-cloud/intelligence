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
  recognitionAward: { groupBy: async () => [], findMany: async () => [] },
  teamMember: {
    findMany: async () => members,
    findUnique: async ({ where }) => members.find((m) => m.user.id === where.userId) || null
  },
  task: {
    findMany: async ({ where, select }) => {
      if (where.createdAt) return [
        { id: 'created-r', creatorId: 'u-rodny', taskComments: [{ content: 'Contexto' }], taskAttachments: [] },
        { id: 'created-h', creatorId: 'u-helen', taskComments: [], taskAttachments: [] }
      ];
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

test('league sends bundled avatar keys for known people without altering the points', async () => {
  const service = createPlatformLeagueService({ db: fakeDb(), repository: fakeRepo(), snapshots, now: () => at(`${DAY}T19:00:00.000Z`) });
  const league = await service.leagueFor({ userId: 'u-rodny' });
  assert.equal(league.race.lanes.find(p => p.isSelf).pixelAvatarKey, 'rodny');
  assert.equal(league.score, 25);
});

test('recognition collection reads only the current recipient and Bogotá month, without task details or writes', async () => {
  const db = fakeDb();
  const calls = [];
  db.recognitionAward = {
    groupBy: async (args) => { calls.push(args); return [{ kind: 'FIRST_TASK', _count: { _all: 2 } }]; },
    findMany: async (args) => { calls.push(args); return [{ id: 'award-1', kind: 'FIRST_TASK', occurredAt: at('2026-11-02T14:00:00Z') }]; }
  };
  const service = createPlatformLeagueService({ db, repository: fakeRepo(), snapshots, now: () => at(`${DAY}T19:00:00.000Z`) });
  const result = await service.recognitionsFor({ userId: 'u-rodny' });
  assert.equal(result.month, '2026-11');
  assert.deepEqual(result.counts, { FIRST_TASK: 2 });
  assert.equal(result.total, 2);
  assert.equal(result.recent[0].id, 'award-1');
  assert.equal(result.hasMore, false);
  for (const call of calls) {
    assert.equal(call.where.recipientId, 'u-rodny');
    assert.equal(call.where.occurredAt.gte.toISOString(), '2026-11-01T05:00:00.000Z');
    assert.equal(call.where.occurredAt.lt.toISOString(), '2026-12-01T05:00:00.000Z');
    assert.ok(call.where.kind.in.includes('FIRST_TASK'));
  }
  assert.deepEqual(calls[1].select, { id: true, kind: true, occurredAt: true }, 'no private task/client/title data');
});

test('collection respects module permissions and marks a limited recent list as partial', async () => {
  const db = fakeDb();
  db.teamMember.findUnique = async () => ({ id: 'm', isActive: true, user: { role: 'EDITOR', isActive: true, modulePermissions: { liga: true, parrillas: true, gestion: false } } });
  db.recognitionAward.groupBy = async ({ where }) => { assert.deepEqual(where.kind.in, ['PLAN_APPROVED']); return [{ kind: 'PLAN_APPROVED', _count: { _all: 18 } }]; };
  db.recognitionAward.findMany = async ({ take }) => Array.from({ length: take }, (_, i) => ({ id: `a-${i}`, kind: 'PLAN_APPROVED', occurredAt: new Date() }));
  const service = createPlatformLeagueService({ db, repository: fakeRepo(), snapshots, now: () => at(`${DAY}T19:00:00.000Z`) });
  const result = await service.recognitionsFor({ userId: 'u' });
  assert.equal(result.recent.length, 12);
  assert.equal(result.hasMore, true);
  assert.equal(result.total, 18);
  db.teamMember.findUnique = async () => ({ id: 'm', isActive: false, user: { isActive: true, modulePermissions: { liga: true } } });
  await assert.rejects(service.recognitionsFor({ userId: 'u' }), e => e.statusCode === 404);
});

const fakeRepo = (seed = []) => {
  const days = new Map(seed.map((row) => [`${row.day_key}:${row.member_id}`, row]));
  const kudos = [];
  return {
    days, kudos,
    meetings: [],
    async givenInWeek(memberId, weekKey) { return kudos.find(k => k.giver_member_id === memberId && k.week_key === weekKey) || null; },
    async meetingsOfMonth(monthKey) { return this.meetings.filter(m => m.day_key.startsWith(monthKey)); },
    async awardMeeting(row) { if (this.meetings.some(m => m.week_key === row.week_key)) throw Object.assign(new Error("duplicate"), {code:"23505"}); const saved = {id:"meeting",...row}; this.meetings.push(saved); return saved; },
    startedAt: async () => at("2026-10-01T05:00:00Z"),
    async saveDays(rows) { for (const row of rows) days.set(`${row.day_key}:${row.member_id}`, { ...row, computed_at: new Date() }); return rows.length; },
    async computedDays(monthKey) { return [...new Set([...days.values()].filter((r) => r.day_key.startsWith(monthKey)).map((r) => r.day_key))]; },
    async daysOfMonth(monthKey, { before }) { return [...days.values()].filter((r) => r.day_key.startsWith(monthKey) && r.day_key < before); },
    async kudosOfMonth(monthKey) { return kudos.filter((k) => k.month_key === monthKey); },
    async giveKudos(row) {
      const monthKey = new Date(new Date(row.created_at || `${DAY}T19:00:00Z`).getTime() - 5 * 3600000).toISOString().slice(0, 7);
      if (kudos.some((k) => k.week_key === row.week_key && k.giver_member_id === row.giver_member_id)) { const error = new Error('dup'); error.code = '23505'; throw error; }
      const saved = { id: `k${kudos.length + 1}`, ...row, month_key: monthKey, points: 5, created_at: row.created_at || at(`${DAY}T19:00:00Z`) };
      kudos.push(saved); return saved;
    }
  };
};

const snapshotPerson = (id, overdue) => ({ id, metrics: { overdue, deadlineEvidence: {
  policy: 'task-calendar-v1', complete: true, capturedAt: `${DAY}T11:02:00Z`,
  tasks: Array.from({ length: overdue }, (_, i) => ({ id: `task-${i}`, overdue: true }))
} } });
const snapshots = { snapshot: async (dayKey) => (dayKey === DAY ? { people: [snapshotPerson('m-rodny', 0), snapshotPerson('m-helen', 2), snapshotPerson('m-jesu', 0)] } : { people: [] }) };

test('old or incomplete dawn counts cannot penalize or reward Al día', async () => {
  for (const deadlineEvidence of [undefined, { policy: 'task-calendar-v1', complete: false }]) {
    const service = createPlatformLeagueService({ db: fakeDb(), repository: fakeRepo(),
      snapshots: { snapshot: async () => ({ people: [{ id: 'm-rodny', metrics: { overdue: 4, deadlineEvidence } }] }) }, now: () => at(`${DAY}T19:00:00Z`) });
    const result = await service.leagueFor({ userId: 'u-rodny' });
    assert.equal(result.today.habits.AL_DIA, null);
    assert.match(result.today.evidence.AL_DIA, /no permite comprobar/i);
  }
});

test('live habits can change without reducing confirmed points, including gifts and awards received today', async () => {
  const repo = fakeRepo([{ day_key: '2026-11-02', member_id: 'm-rodny', habits: { RELOJ: true }, extras: {} }]);
  await repo.giveKudos({ week_key: '2026-W45', giver_member_id: 'm-helen', receiver_member_id: 'm-rodny' });
  repo.meetings.push({ day_key: DAY, member_id: 'm-rodny', week_key: '2026-W45' });
  const db = fakeDb();
  db.recognitionAward.findMany = async () => [{ id: 'award', recipientId: 'u-rodny', occurredAt: at(`${DAY}T19:00:00Z`) }];
  const service = createPlatformLeagueService({ db, repository: repo, snapshots, now: () => at(`${DAY}T22:00:00Z`) });
  const before = await service.leagueFor({ userId: 'u-rodny' });
  assert.deepEqual(before.scoreBreakdown, { confirmed: 25, provisional: 25 });
  assert.equal(before.today.isProvisional, true);
  const find = db.task.findMany;
  db.task.findMany = async args => args.where.returnedAt ? [{ assigneeId: 'm-rodny' }] : find(args);
  const after = await service.leagueFor({ userId: 'u-rodny' });
  assert.deepEqual(after.scoreBreakdown, { confirmed: 25, provisional: 20 });
  assert.equal(after.score, 45);
  assert.deepEqual(after.race.lanes.find(lane => lane.isSelf).scoreBreakdown, after.scoreBreakdown);
});

test('a saved daily close confirms today once and survives later source changes', async () => {
  const repo = fakeRepo();
  const db = fakeDb();
  const service = createPlatformLeagueService({ db, repository: repo, snapshots, now: () => at(`${DAY}T23:15:00Z`) });
  await service.computeAndSave(DAY);
  const find = db.task.findMany;
  db.task.findMany = async args => args.where.returnedAt ? [{ assigneeId: 'm-rodny' }] : find(args);
  const result = await service.leagueFor({ userId: 'u-rodny' });
  assert.deepEqual(result.scoreBreakdown, { confirmed: 25, provisional: 0 });
  assert.equal(result.score, 25);
  assert.equal(result.today.isProvisional, false);
  assert.equal(result.today.habits.SIN_DEVOLUCION, true);
  assert.equal(result.today.evidence.SIN_DEVOLUCION, 'Nada devuelto.');
});

test('a fresh league starts at zero, excludes old daily evidence and never backfills before launch', async () => {
  const cutoff = at(`${DAY}T22:00:00Z`);
  const repo = fakeRepo();
  repo.startedAt = async () => cutoff;
  const db = fakeDb();
  const windows = [];
  db.task.findMany = async ({ where }) => { windows.push(where); return []; };
  db.taskWorkSession.findMany = async () => [];
  const service = createPlatformLeagueService({ db, repository: repo, snapshots, now: () => cutoff });
  const league = await service.leagueFor({ userId: 'u-rodny' });
  assert.equal(league.score, 0);
  assert.ok(league.race.lanes.every(person => person.score === 0));
  assert.equal(league.streak.days, 0);
  assert.equal(league.position, null, 'zero points must not create a winner by alphabetical order');
  assert.equal(league.startsAt, cutoff.toISOString());
  assert.ok(windows.every(where => (where.createdAt || where.completedAt || where.returnedAt).gte.getTime() === cutoff.getTime()));
  const savedDays = [];
  service.computeAndSave = async day => savedDays.push(day);
  await service.runAutomatic();
  assert.ok(savedDays.every(day => day >= DAY));
  await assert.rejects(service.readDay('2026-11-02'), /inicio/i);
});

test('the recognition collection starts at the same durable cutoff', async () => {
  const cutoff = at(`${DAY}T22:00:00Z`);
  const repo = fakeRepo(); repo.startedAt = async () => cutoff;
  const db = fakeDb();
  db.recognitionAward.groupBy = async ({ where }) => { assert.equal(where.occurredAt.gte.getTime(), cutoff.getTime()); return []; };
  const service = createPlatformLeagueService({ db, repository: repo, snapshots, now: () => cutoff });
  assert.equal((await service.recognitionsFor({ userId: 'u-rodny' })).total, 0);
});

test('a weekend does not add live habit points that disappear when the month is saved', async () => {
  const service = createPlatformLeagueService({ db: fakeDb(), repository: fakeRepo(), snapshots, now: () => at('2026-11-07T19:00:00Z') });
  const league = await service.leagueFor({ userId: 'u-rodny' });
  assert.equal(league.score, 0);
  assert.equal(league.today.points, 0);
  assert.deepEqual(league.scoreBreakdown, { confirmed: 0, provisional: 0 });
  assert.equal(league.today.isProvisional, false);
  assert.equal(league.today.isConfirmed, false, 'a weekend is not a recorded daily close');
});

test('created context credits the creator, accepts human comments or active files and excludes later context', async () => {
  const db = fakeDb();
  const originalFind = db.task.findMany;
  db.task.findMany = async args => {
    if (!args.where.createdAt) return originalFind(args);
    assert.deepEqual(args.select.taskComments.where, { type: 'human', createdAt: { lt: at('2026-11-04T05:00:00Z') } });
    assert.deepEqual(args.select.taskAttachments.where, { purgeState: 'ACTIVE', createdAt: { lt: at('2026-11-04T05:00:00Z') } });
    return [
      { id: 'new-r', creatorId: 'u-rodny', taskComments: [{ content: 'Contexto del encargo' }], taskAttachments: [] },
      { id: 'new-h', creatorId: 'u-helen', taskComments: [], taskAttachments: [{ id: 'file' }] },
      { id: 'new-j', creatorId: 'u-jesu', taskComments: [{ content: '  ' }], taskAttachments: [] },
    ];
  };
  const service = createPlatformLeagueService({ db, repository: fakeRepo(), snapshots, now: () => at(`${DAY}T22:00:00Z`) });
  const rows = await service.evaluateDay(DAY);
  assert.equal(rows.find(r => r.memberId === 'm-rodny').habits.DOCUMENTADO, true);
  assert.equal(rows.find(r => r.memberId === 'm-helen').habits.DOCUMENTADO, true);
  assert.equal(rows.find(r => r.memberId === 'm-jesu').habits.DOCUMENTADO, false);
});

test('the collection changes month at Bogotá midnight and handles a new year', async () => {
  for (const [instant, start, end] of [
    ['2026-11-01T04:59:00Z', '2026-10-01T05:00:00.000Z', '2026-11-01T05:00:00.000Z'],
    ['2027-01-01T04:59:00Z', '2026-12-01T05:00:00.000Z', '2027-01-01T05:00:00.000Z'],
  ]) {
    const db = fakeDb();
    db.recognitionAward.groupBy = async ({ where }) => {
      assert.equal(where.occurredAt.gte.toISOString(), start);
      assert.equal(where.occurredAt.lt.toISOString(), end);
      return [];
    };
    const service = createPlatformLeagueService({ db, repository: fakeRepo(), snapshots, now: () => at(instant) });
    assert.equal((await service.recognitionsFor({ userId: 'u-rodny' })).month, start.slice(0, 7));
  }
});

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
  assert.equal(league.score, 55, 'ten habits at 5 each, plus one gift at 10');
  assert.deepEqual(league.today.habits, { RELOJ: true, AL_DIA: true, A_TIEMPO: true, DOCUMENTADO: true, SIN_DEVOLUCION: true });
  assert.deepEqual({ earned: league.today.earned, possible: league.today.possible, extrasEarned: league.today.extrasEarned, points: league.today.points }, { earned: 5, possible: 5, extrasEarned: [], points: 30 });
  assert.deepEqual(league.today.extras, { PRIMERO_EN_ABRIR: false, PRIMERO_EN_REUNION: null }, 'the extras object survives beside today’s points');
  assert.equal(league.streak.days, 2);
  assert.equal(league.kudos.score, 5);
  assert.equal(league.kudos.received[0].from, 'Helen');
  assert.equal(league.race.lanes.length, 3);
  assert.deepEqual(league.race.lanes.map((lane) => lane.name), ['Helen', 'Jesu', 'Rodny'], 'fixed order by name, never by score');
  assert.equal(league.race.lanes.find((lane) => lane.isSelf).score, 55);
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

test('five weekly points renew Monday in Bogotá, not at the month boundary', async () => {
 const repo=fakeRepo();let time=at('2026-11-03T19:00:00Z');
 const service=createPlatformLeagueService({db:fakeDb(),repository:repo,snapshots,now:()=>time});
 const gift=await service.giveKudos({userId:'u-rodny',memberId:'m-helen',note:' Gracias '});
 assert.equal(gift.points,5);assert.equal(gift.weekKey,'2026-W45');
 time=at('2026-11-09T04:59:59Z');
 await assert.rejects(service.giveKudos({userId:'u-rodny',memberId:'m-helen'}),e=>e.statusCode===409);
 time=at('2026-11-09T05:00:00Z');
 await service.giveKudos({userId:'u-rodny',memberId:'m-helen'});
 time=at('2026-11-30T19:00:00Z');await service.giveKudos({userId:'u-rodny',memberId:'m-helen'});
 time=at('2026-12-01T19:00:00Z');
 assert.equal((await service.leagueFor({userId:'u-rodny'})).kudos.givenThisWeek.name,'Helen');
 await assert.rejects(service.giveKudos({userId:'u-rodny',memberId:'m-jesu'}),e=>e.statusCode===409);
 await assert.rejects(service.giveKudos({userId:'u-helen',memberId:'m-helen'}),e=>e.statusCode===400);
 await assert.rejects(service.giveKudos({userId:'u-helen',memberId:'missing'}),e=>e.statusCode===404);
 await assert.rejects(service.giveKudos({userId:'u-helen',memberId:'m-rodny',note:'a'.repeat(121)}),e=>e.statusCode===400);
});
test('only an admin records one traffic winner per week; saved days and repeated reads do not double its ten points or badge points', async()=>{
 const repo=fakeRepo();const db=fakeDb();const service=createPlatformLeagueService({db,repository:repo,snapshots,now:()=>at(DAY+'T19:00:00Z')});
 await assert.rejects(service.awardMeeting({userId:'u-helen',memberId:'m-rodny',day:DAY}),e=>e.statusCode===403);
 for(const day of ['2026-11-04','2026-10-01','invalid']) await assert.rejects(service.awardMeeting({userId:'u-rodny',memberId:'m-helen',day}),e=>e.statusCode===400);
 await service.awardMeeting({userId:'u-rodny',memberId:'m-rodny',day:DAY});
 assert.equal(repo.meetings[0].awarded_by,'u-rodny');
 await assert.rejects(service.awardMeeting({userId:'u-rodny',memberId:'m-helen',day:DAY}),e=>e.statusCode===409);
 db.recognitionAward.findMany=async({where,select})=>{ assert.equal(where.occurredAt.gte.toISOString(),'2026-11-01T05:00:00.000Z');assert.deepEqual(select,{id:true,recipientId:true,occurredAt:true});return [{id:'a',recipientId:'u-rodny',occurredAt:at(DAY+'T15:00:00Z')}];};
 for(let i=0;i<2;i++){const league=await service.leagueFor({userId:'u-rodny'});assert.equal(league.score,40);assert.equal(league.today.points,40);assert.equal(league.recognitionPoints,5);assert.equal(league.meetings.canManage,true);}
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
