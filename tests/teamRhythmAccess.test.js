// Quién ve Ritmo: la misma puerta que el resto de Manager, en la ruta, en Bria y al volver a abrir una
// conversación (9 de octubre de 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toolByName } from '../src/services/briaAssistantTools.js';
import { createTeamRhythmHandler } from '../src/controllers/teamRhythmController.js';

const H = 3_600_000;
const manager = { userId: 'u1', role: 'PROJECT_MANAGER', modulePermissions: { manager: true, bria: true } };

test('the route sits behind the Manager module and a leadership role', () => {
  const routes = readFileSync('src/routes/index.js', 'utf8');
  assert.match(routes, /'\/manager\/rhythm',\s*requireModulePermission\('manager'\),\s*requireManagerRole,\s*teamRhythmController\.getTeamRhythm/);
  assert.match(readFileSync('src/services/briaConversationApplication.js', 'utf8'), /\['minuta', 'ritmo'\]\.includes\(source\.kind\)/, 'an old answer stops showing to someone who lost access');
});

test('a failure answers in words, never with the technical cause', async () => {
  const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  const original = console.error; console.error = () => {};
  try { await createTeamRhythmHandler({ get: async () => { throw new Error('connection refused 10.0.0.1'); } })({ query: { days: '30' } }, res); }
  finally { console.error = original; }
  assert.equal(res.code, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /10\.0\.0\.1/);
});

test('Bria answers about one person with coverage first and the tasks behind each finding', async () => {
  const tool = toolByName('ritmo_del_equipo');
  assert.equal(tool.allowed(manager), true);
  assert.equal(tool.allowed({ userId: 'u2', role: 'EDITOR', modulePermissions: { manager: true } }), false);
  assert.equal(tool.allowed({ userId: 'u3', role: 'PROJECT_MANAGER', modulePermissions: { manager: false } }), false);
  const rhythm = { get: async ({ days }) => ({
    period: { days }, team: { closed: 10, measured: 6, coverage: 0.6 },
    people: [
      { personName: 'Brayan Torres', closed: 4, measured: 3, coverage: 0.75, byType: [{ workType: 'Video', measured: 3, medianMs: 2 * H, minMs: H, maxMs: 4 * H, teamMedianMs: H, comparable: true }], findings: [{ kind: 'HEAVY_DAY', message: 'Brayan cerró 2 tareas de Video el 6 de octubre…', taskIds: ['t1', 't2'] }] },
      { personName: 'Helen Hernández', closed: 6, measured: 3, coverage: 0.5, byType: [], findings: [] }
    ],
    tasks: { t1: { title: 'Video A' }, t2: { title: 'Video B' } }
  }) };
  const out = await tool.run({ persona: 'brayan', dias: 90 }, { rhythm });
  assert.equal(out.data.periodo, '90 días');
  assert.deepEqual(out.data.personas.map((p) => p.nombre), ['Brayan Torres']);
  assert.equal(out.data.personas[0].cobertura, '75 %');
  assert.deepEqual(out.data.personas[0].hallazgos[0].tareas, ['Video A', 'Video B']);
  assert.equal(out.data.personas[0].porTipo[0].restoDelEquipo, '1 h');
  assert.match(out.data.instruccion, /cobertura antes de sacar conclusiones/);
  assert.equal(out.sources[0].kind, 'ritmo');
});
