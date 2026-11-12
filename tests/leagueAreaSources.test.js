// Las lecturas por área de la liga (Rodny, 12 de noviembre de 2026: «Sí, hábitos por área»). Doble de la base: nunca
// toca PostgreSQL. Lo que sale de la foto del momento (parrillas, CRM, pautas, piezas de hoy) solo se lee para hoy; lo
// que tiene fecha de registro (gestiones, movimientos) vale también para un día pasado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLeagueAreaSources } from '../src/services/leagueAreaSources.js';

const DAY = '2026-11-12';
const start = new Date(`${DAY}T05:00:00.000Z`), end = new Date('2026-11-13T05:00:00.000Z');
const members = [
  { id: 'm-kamila', name: 'Kamila', user: { id: 'u-kamila' } },
  { id: 'm-francys', name: 'Francys', user: { id: 'u-francys' } },
  { id: 'm-elisa', name: 'Elisa', user: { id: 'u-elisa' } },
  { id: 'm-rodny', name: 'Rodny', user: { id: 'u-rodny' } },
  { id: 'm-brayan', name: 'Brayan', user: { id: 'u-brayan' } }
];
const inWindow = (where, value) => value >= where.gte && value < where.lt;

const fakeDb = (calls = []) => ({
  crmActivity: { findMany: async ({ where }) => { calls.push('crmActivity'); assert.ok(where.type.in.includes('LLAMADA') && !where.type.in.includes('NOTA'));
    // La gestión de un toque desde la banda no juega: su nota la escribe la plataforma, no la persona.
    return [{ authorId: 'u-francys', note: 'Pidió la propuesta en PDF para el lunes', result: null, requestId: null, createdAt: new Date(`${DAY}T15:00:00Z`) },
      { authorId: 'u-francys', note: '.', result: '', requestId: 'r-2', createdAt: new Date(`${DAY}T16:00:00Z`) },
      { authorId: 'u-francys', note: 'Registrado desde el aviso de seguimiento.', result: null, requestId: 'aviso-n1', createdAt: new Date(`${DAY}T17:00:00Z`) }]
      .filter((row) => inWindow(where.createdAt, row.createdAt) && where.authorId.in.includes(row.authorId)); } },
  financialRecord: { findMany: async ({ where }) => { calls.push('financialRecord'); assert.deepEqual(where.origin, { not: 'IMPORT' }); assert.equal(where.voidedAt, null);
    return [{ createdById: 'u-elisa', notes: null, reference: null, attachmentUrl: null, documents: [{ id: 'd1' }] }, { createdById: 'u-elisa', notes: 'Quincena', reference: null, attachmentUrl: null, documents: [] }]; } },
  accountsPayable: { findMany: async () => { calls.push('accountsPayable'); return [{ createdById: 'u-elisa', notes: null, documentNumber: null, documents: [] }]; } },
  crmLead: { findMany: async ({ where }) => { calls.push('crmLead'); assert.equal(where.archivedAt, null);
    return [{ ownerId: 'm-francys', stage: 'PROPUESTA_ENVIADA', nextFollowUpAt: '2026-11-10', archivedAt: null }, { ownerId: 'm-francys', stage: 'NEGOCIACION', nextFollowUpAt: '2026-11-20', archivedAt: null }]; } },
  adBudget: { findMany: async () => { calls.push('adBudget'); return [{ id: 'b1', responsibleId: 'm-kamila', client: { isArchived: false } }, { id: 'b2', responsibleId: 'm-kamila', client: { isArchived: true } }]; } },
  contentItem: { findMany: async ({ where }) => { calls.push('contentItem');
    assert.equal(where.publishDate.gte.toISOString(), `${DAY}T00:00:00.000Z`);
    assert.deepEqual(where.plan.clientId.in.sort(), ['c-endova', 'c-verona']);
    return [{ status: 'PUBLICADO', plan: { clientId: 'c-verona' } }, { status: 'APROBADO', plan: { clientId: 'c-verona' } }, { status: 'PROGRAMADO', plan: { clientId: 'c-endova' } }]; } }
});
const plans = async ({ includeClean }) => {
  assert.equal(includeClean, true, 'clean accounts are needed to know who played');
  return [
    { clientId: 'c-verona', clientName: 'Verona', overdue: 2, communityManager: { userId: 'u-kamila' }, projectManager: { userId: 'u-rodny' } },
    { clientId: 'c-endova', clientName: 'Endova', overdue: 0, communityManager: { userId: 'u-kamila' }, projectManager: { userId: 'u-kamila' } }
  ];
};
const describe = (row) => ({ id: row.id, pendingClose: row.id === 'b1' ? { cycle: { key: '2026-10' } } : null });
const now = () => new Date(`${DAY}T20:00:00Z`);

test('today: each person gets the checks of what she carries, and nobody else\'s', async () => {
  const sources = createLeagueAreaSources({ db: fakeDb(), listOverduePlans: plans, describeBudget: describe, now });
  const checks = await sources.read({ dayKey: DAY, isToday: true, start, end, members });
  const kamila = checks.get('m-kamila');
  assert.deepEqual(kamila.AL_DIA.map((c) => [c.source, c.ok]), [['Parrillas', false], ['Pautas', false]], 'an archived client does not count');
  assert.match(kamila.AL_DIA[0].text, /2 piezas con fecha pasada sin publicar: Verona/);
  assert.equal(kamila.AL_DIA[0].text.includes('Endova'), false);
  assert.deepEqual(kamila.A_TIEMPO.map((c) => c.text), ['2 de 3 piezas de hoy publicadas o programadas.'], 'the same account counts once even if she is CM and PM');
  const rodny = checks.get('m-rodny');
  assert.deepEqual(rodny.AL_DIA.map((c) => c.text), ['2 piezas con fecha pasada sin publicar: Verona.'], 'the PM of the account answers for it too');
  assert.deepEqual(rodny.A_TIEMPO.map((c) => c.text), ['1 de 2 piezas de hoy publicadas o programadas.']);
  const francys = checks.get('m-francys');
  assert.deepEqual(francys.AL_DIA, [{ source: 'CRM', ok: false, text: '1 seguimiento vencido.' }]);
  assert.deepEqual(francys.DOCUMENTADO, [{ source: 'CRM', ok: false, text: '1 de 2 gestiones con nota.' }]);
  assert.deepEqual(checks.get('m-elisa').DOCUMENTADO, [{ source: 'Financiero', ok: false, text: '2 de 3 registros con soporte o nota.' }]);
  assert.deepEqual(checks.get('m-brayan'), { AL_DIA: [], A_TIEMPO: [], DOCUMENTADO: [] }, 'without anything in those modules nothing is added');
});

test('a past day only reads what carries its own date: no snapshot of today is used to judge yesterday', async () => {
  const calls = [];
  const sources = createLeagueAreaSources({ db: fakeDb(calls), listOverduePlans: async () => { calls.push('plans'); return []; }, describeBudget: describe, now });
  const checks = await sources.read({ dayKey: '2026-11-11', isToday: false, start: new Date('2026-11-11T05:00:00Z'), end: start, members });
  assert.deepEqual(calls.sort(), ['accountsPayable', 'crmActivity', 'financialRecord']);
  assert.deepEqual(checks.get('m-kamila'), { AL_DIA: [], A_TIEMPO: [], DOCUMENTADO: [] });
  assert.equal(checks.get('m-francys').DOCUMENTADO.length, 0, 'yesterday had none of her gestiones in the window');
});

test('a source that fails is left out and logged; the others still count', async () => {
  const db = fakeDb();
  db.crmLead.findMany = async () => { throw new Error('crm down'); };
  const logged = [];
  const sources = createLeagueAreaSources({ db, listOverduePlans: async () => { throw new Error('plans down'); }, describeBudget: describe, now, logger: { error: (...args) => logged.push(args.join(' ')) } });
  const checks = await sources.read({ dayKey: DAY, isToday: true, start, end, members });
  assert.deepEqual(checks.get('m-francys').AL_DIA, []);
  assert.deepEqual(checks.get('m-kamila').AL_DIA.map((c) => c.source), ['Pautas']);
  assert.equal(checks.get('m-elisa').DOCUMENTADO.length, 1);
  assert.equal(logged.length, 2);
});

test('a database without those models (the other test doubles) reads nothing and never reaches the real database', async () => {
  const sources = createLeagueAreaSources({ db: {}, now });
  const checks = await sources.read({ dayKey: DAY, isToday: true, start, end, members });
  assert.deepEqual(checks.get('m-kamila'), { AL_DIA: [], A_TIEMPO: [], DOCUMENTADO: [] });
});

test('today\'s snapshot is reused for a few minutes: opening the cup repeatedly does not reread every account', async () => {
  const calls = [];
  let clock = new Date(`${DAY}T20:00:00Z`);
  const sources = createLeagueAreaSources({ db: fakeDb(calls), listOverduePlans: async (args) => { calls.push('plans'); return plans(args); }, describeBudget: describe, now: () => clock });
  await sources.read({ dayKey: DAY, isToday: true, start, end, members });
  await sources.read({ dayKey: DAY, isToday: true, start, end, members });
  assert.equal(calls.filter((call) => call === 'plans').length, 1);
  clock = new Date(clock.getTime() + 6 * 60_000);
  await sources.read({ dayKey: DAY, isToday: true, start, end, members });
  assert.equal(calls.filter((call) => call === 'plans').length, 2);
});
