import test from 'node:test';
import assert from 'node:assert/strict';
import { createGovernanceService } from '../src/services/aiGovernanceService.js';

// Reportar un incidente desde cualquier puesto (12 de octubre de 2026). Base de datos simulada:
// esto prueba las reglas del servicio, no la escritura real en PostgreSQL.

const CLOCK = new Date('2026-10-12T15:42:37.512Z');

function fakePool({ users = {}, clients = ['c-1'], incidents = [] } = {}) {
  const writes = { incidents: [], updates: [], events: [] };
  const query = async (sql, params = []) => {
    if (/^(BEGIN|COMMIT|ROLLBACK)|pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (/FROM "User" u JOIN "TeamMember"/.test(sql)) {
      const user = users[params[0]];
      if (!user || !user.active) return { rows: [] };
      if (/role='ADMIN'/.test(sql) && user.role !== 'ADMIN') return { rows: [] };
      return { rows: [{ id: params[0], name: user.name }] };
    }
    if (/FROM "Client" WHERE id=\$1/.test(sql)) return { rows: clients.includes(params[0]) ? [{ id: params[0] }] : [] };
    if (/INSERT INTO "AiGovernanceIncident"/.test(sql)) {
      const columns = sql.match(/\(id,(.+?)\) VALUES/)[1].split(',').map((c) => c.replace(/"/g, ''));
      const row = { id: params[0], version: 1, createdAt: CLOCK, ...Object.fromEntries(columns.map((c, i) => [c, params[i + 1]])) };
      writes.incidents.push(row); return { rows: [row] };
    }
    if (/UPDATE "AiGovernanceIncident"/.test(sql)) {
      const current = incidents.find((r) => r.id === params[0]);
      const columns = [...sql.matchAll(/"(\w+)"=\$(\d+)/g)].map((m) => m[1]);
      const next = { ...current, ...Object.fromEntries(columns.map((c, i) => [c, params[i + 1]])), version: current.version + 1 };
      writes.updates.push(next); return { rows: [next] };
    }
    if (/SELECT \* FROM "AiGovernanceIncident" WHERE id=\$1/.test(sql)) return { rows: incidents.filter((r) => r.id === params[0]) };
    if (/SELECT \* FROM "AiGovernanceIncident" ORDER BY/.test(sql)) return { rows: incidents };
    if (/INSERT INTO "AiGovernanceEvent"/.test(sql)) { writes.events.push(params); return { rows: [] }; }
    throw new Error(`Consulta no prevista: ${sql}`);
  };
  return { writes, pool: { query, connect: async () => ({ query, release() {} }) } };
}

const people = {
  'u-ana': { name: 'Ana Pérez', active: true, role: 'EDITOR' },
  'u-old': { name: 'Ex miembro', active: false, role: 'EDITOR' },
  'u-admin': { name: 'Rodny', active: true, role: 'ADMIN' }
};

test('cualquier persona activa del equipo reporta; queda abierto, a su nombre y con la hora del servidor', async () => {
  const { pool, writes } = fakePool({ users: people });
  const service = createGovernanceService({ pool, clock: () => CLOCK });
  const result = await service.report('u-ana', { description: 'Me llegó un correo pidiendo mi clave.', affectsClient: 'NO_SE', occurredAt: '2026-10-12T09:15' });
  assert.deepEqual(Object.keys(result).sort(), ['id', 'reportedAt', 'reporterName']);
  assert.equal(result.reporterName, 'Ana Pérez');
  assert.equal(result.reportedAt, CLOCK.toISOString());

  const [row] = writes.incidents;
  assert.equal(row.status, 'OPEN');
  assert.equal(row.ownerId, 'u-ana', 'el responsable inicial es quien reporta; administración lo reasigna');
  assert.equal(row.clientId, null);
  assert.equal(row.data.reportedById, 'u-ana');
  assert.equal(row.data.reportedByName, 'Ana Pérez');
  assert.equal(row.data.reportSource, 'TEAM_REPORT');
  assert.equal(row.data.reportedAt, CLOCK.toISOString(), 'la hora exacta del reporte');
  assert.equal(row.data.detectedAt, '2026-10-12T15:42:00.000Z', 'el conocimiento va al minuto, como el formulario de administración');
  assert.equal(row.data.occurredAt, '2026-10-12T14:15:00.000Z');
  assert.equal(row.data.affectsClient, 'NO_SE');
  assert.equal(row.data.description, 'Me llegó un correo pidiendo mi clave.');
  assert.equal(row.data.incidentType, undefined, 'el tipo lo decide administración');
  assert.match(row.name, /^Reporte de Ana Pérez: Me llegó un correo/);
  assert.ok(row.name.length <= 180);
  // «No sé» se trata como posible aviso: el plazo de 24 horas corre desde la ocurrencia.
  assert.equal(new Date(row.notificationDueAt).toISOString(), '2026-10-13T14:15:00.000Z');

  assert.equal(writes.events.length, 1);
  assert.equal(writes.events[0][3], 'u-ana');
  assert.equal(writes.events[0][4], 'CREATED');
});

test('se puede nombrar al cliente; uno inexistente se rechaza', async () => {
  const { pool, writes } = fakePool({ users: people });
  const service = createGovernanceService({ pool, clock: () => CLOCK });
  await service.report('u-ana', { description: 'Mandé la parrilla a otro cliente.', affectsClient: 'SI', clientId: 'c-1' });
  assert.equal(writes.incidents[0].clientId, 'c-1');
  await assert.rejects(service.report('u-ana', { description: 'x', affectsClient: 'SI', clientId: 'c-404' }), (e) => e.status === 400 && /cliente/.test(e.message));
});

test('quien no está en el equipo activo no puede reportar', async () => {
  const { pool, writes } = fakePool({ users: people });
  const service = createGovernanceService({ pool, clock: () => CLOCK });
  await assert.rejects(service.report('u-old', { description: 'x', affectsClient: 'NO' }), (e) => e.status === 403);
  await assert.rejects(service.report('u-nadie', { description: 'x', affectsClient: 'NO' }), (e) => e.status === 403);
  assert.equal(writes.incidents.length, 0);
});

test('reportar no da acceso al registro: listar sigue siendo solo de administración', async () => {
  const { pool } = fakePool({ users: people });
  const service = createGovernanceService({ pool, clock: () => CLOCK });
  await assert.rejects(service.list('u-ana', 'incidents'), (e) => e.status === 403);
});

const reported = {
  id: 'inc-1', name: 'Reporte de Ana', status: 'OPEN', ownerId: 'u-ana', clientId: null, version: 1,
  notificationDueAt: new Date('2026-10-13T15:42:00Z'), createdAt: CLOCK,
  data: { description: 'Perdí el teléfono.', detectedAt: '2026-10-12T15:42:00.000Z', affectsClient: 'NO_SE', reportedById: 'u-ana', reportedByName: 'Ana Pérez', reportedAt: CLOCK.toISOString(), reportSource: 'TEAM_REPORT' }
};

test('administración completa el reporte sin perder quién lo hizo ni cuándo', async () => {
  const { pool, writes } = fakePool({ users: people, incidents: [reported] });
  const service = createGovernanceService({ pool, clock: () => new Date('2026-10-12T16:00:00Z') });
  await service.save('u-admin', 'incidents', 'inc-1', {
    name: 'Teléfono perdido', status: 'OPEN', expectedVersion: 1, reason: 'Triage',
    data: { description: 'Perdí el teléfono.', ownerId: 'u-admin', severity: 'LOW', detectedAt: '2026-10-12T10:42', impact: 'Sin datos de clientes.', incidentType: 'DEVICE_LOSS', affectsClient: 'NO' }
  });
  const [next] = writes.updates;
  assert.equal(next.data.reportedById, 'u-ana');
  assert.equal(next.data.reportedByName, 'Ana Pérez');
  assert.equal(next.data.reportedAt, CLOCK.toISOString());
  assert.equal(next.data.reportSource, 'TEAM_REPORT');
  assert.equal(next.data.affectsClient, 'NO');
});

test('el listado no muestra plazo de aviso cuando el incidente no afecta a un cliente', async () => {
  const noClient = { ...reported, id: 'inc-2', data: { ...reported.data, affectsClient: 'NO' } };
  const legacy = { ...reported, id: 'inc-3', data: { description: 'x', detectedAt: '2026-10-01T10:00:00.000Z', recipientEmail: 'c@empresa.co' }, notificationDueAt: new Date('2026-10-02T10:00:00Z') };
  const { pool } = fakePool({ users: people, incidents: [noClient, legacy] });
  const service = createGovernanceService({ pool, clock: () => new Date('2026-10-20T16:00:00Z') });
  const { items } = await service.list('u-admin', 'incidents');
  const [a, b] = items;
  assert.equal(a.noticeRequired, false);
  assert.equal(a.notificationDueAt, null);
  assert.equal(a.notificationOverdue, false);
  assert.equal(b.noticeRequired, true, 'una fila anterior con correo sigue exigiendo el aviso');
  assert.equal(b.notificationOverdue, true);
});
