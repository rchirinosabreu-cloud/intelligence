import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { taskChangesBetween, describeTaskChange } from '../src/lib/taskChanges.js';
import { recordTaskDiff, recordTaskCreated, getTaskChangeHistory } from '../src/services/taskChangeHistoryService.js';
import { AUDIT_TABLES } from '../src/lib/auditImmutability.js';

const before = { assigneeId: 'kamila', status: 'PENDIENTE', dueDate: new Date('2026-11-18T12:00:00Z'), clientId: 'promo', title: '[Publicar] Reel', isPriority: false, priority: null };

test('solo se anota lo que cambió', () => {
  assert.deepEqual(taskChangesBetween(before, { ...before }), []);
  assert.deepEqual(taskChangesBetween(before, { ...before, assigneeId: 'rodny', dueDate: '2026-11-18T12:00:00.000Z' }),
    [{ kind: 'ASSIGNEE', fromValue: 'kamila', toValue: 'rodny' }], 'la misma fecha en otro formato no es un cambio');
  assert.deepEqual(taskChangesBetween(before, { ...before, status: 'EN_CURSO', isPriority: true, priority: 'URGENTE' }),
    [{ kind: 'STATUS', fromValue: 'PENDIENTE', toValue: 'EN_CURSO' }, { kind: 'PRIORITY', fromValue: null, toValue: 'URGENTE' }]);
});

test('cada cambio se lee como una frase corta, sin ids', () => {
  const names = { kamila: 'Kamila', rodny: 'Rodny', promo: 'Promo Group' };
  assert.equal(describeTaskChange({ kind: 'ASSIGNEE', fromValue: 'kamila', toValue: 'rodny', actorName: 'Kamila' }, names), 'Kamila cambió el responsable: Kamila → Rodny');
  assert.equal(describeTaskChange({ kind: 'CREATED', toValue: 'kamila', actorName: null }, names), 'La plataforma lo creó para Kamila');
  assert.equal(describeTaskChange({ kind: 'STATUS', toValue: 'EN_CURSO', actorName: 'Sara' }, names), 'Sara lo pasó a En proceso');
  assert.equal(describeTaskChange({ kind: 'ASSIGNEE', fromValue: 'x-borrado', toValue: null, actorName: 'Rodny' }, names), 'Rodny cambió el responsable: alguien → nadie');
  assert.match(describeTaskChange({ kind: 'DUE_DATE', fromValue: '2026-11-18', toValue: '2026-11-20', actorName: 'Rodny' }, names), /^Rodny cambió la fecha: 18 .*nov.* → 20 .*nov/);
});

test('se escribe con quién lo hizo, y un fallo al escribirlo no tumba el cambio', async () => {
  const rows = [];
  const db = { taskChangeEvent: { createMany: async ({ data }) => { rows.push(...data); return { count: data.length }; } } };
  await recordTaskDiff(db, { taskId: 't1', actorId: 'u-kamila', before, after: { ...before, assigneeId: 'rodny' } });
  await recordTaskCreated(db, { taskId: 't2', assigneeId: 'kamila' });
  assert.deepEqual(rows.map(r => [r.taskId, r.actorId, r.kind, r.fromValue, r.toValue]),
    [['t1', 'u-kamila', 'ASSIGNEE', 'kamila', 'rodny'], ['t2', null, 'CREATED', null, 'kamila']]);
  const broken = { taskChangeEvent: { createMany: async () => { throw new Error('sin tabla'); } } };
  assert.equal(await recordTaskDiff(broken, { taskId: 't1', before, after: { ...before, assigneeId: 'rodny' } }), 0);
});

test('la lectura resuelve personas y clientes, del más reciente al más antiguo', async () => {
  const db = {
    taskChangeEvent: { findMany: async ({ where, orderBy }) => {
      assert.equal(where.taskId, 't1'); assert.deepEqual(orderBy, { occurredAt: 'desc' });
      return [{ id: 'e2', kind: 'ASSIGNEE', fromValue: 'kamila', toValue: 'rodny', occurredAt: new Date(), actor: { name: 'Kamila' } },
        { id: 'e1', kind: 'CLIENT', fromValue: null, toValue: 'promo', occurredAt: new Date(), actor: null }];
    } },
    teamMember: { findMany: async ({ where }) => [{ id: 'kamila', name: 'Kamila' }, { id: 'rodny', name: 'Rodny' }].filter(m => where.id.in.includes(m.id)) },
    client: { findMany: async () => [{ id: 'promo', name: 'Promo Group' }] }
  };
  const history = await getTaskChangeHistory('t1', { db });
  assert.equal(history.events[0].actorName, 'Kamila');
  assert.equal(history.events[1].actorName, null);
  assert.deepEqual(history.names, { kamila: 'Kamila', rodny: 'Rodny', promo: 'Promo Group' });
});

test('el historial es inmutable y se crea al arrancar, sin llave hacia la tarea', () => {
  assert.ok(AUDIT_TABLES.some(t => t.name === 'TaskChangeEvent' && t.nullableRefs.includes('actorId')));
  assert.match(readFileSync('package.json', 'utf8'), /ensure-task-change-history-schema\.js/);
  assert.doesNotMatch(readFileSync('scripts/ensure-task-change-history-schema.js', 'utf8'), /REFERENCES "Task"/);
});

test('el panel lo muestra a quien abre la tarea, discreto y plegado', () => {
  const panel = readFileSync('src/components/modules/TaskSidePanel.jsx', 'utf8');
  assert.match(panel, /isEdition && <TaskChangeHistory taskId=\{formData\.id\}/);
  const view = readFileSync('src/components/modules/TaskChangeHistory.jsx', 'utf8');
  assert.match(view, /aria-expanded=\{expanded\}/);
  assert.match(view, /if \(!events\.length\) return null/);
});
