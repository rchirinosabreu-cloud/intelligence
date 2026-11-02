import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaDeleteService } from '../src/services/briaDeleteService.js';
import { createBriaDeleteTools } from '../src/services/briaDeleteTools.js';
import { createBriaDispatchService } from '../src/services/briaDispatchService.js';
import { reviewedResponse } from '../src/lib/briaResponse.js';
import { runAssistant } from '../src/lib/briaAssistant.js';
import { createConversationScopeFixture, runConversationScopeScenario } from './evals/briaConversationScopeFixture.js';

const user = { id: 'manager', userId: 'manager', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true, parrillas: true } };
const interpretation = (question, intent = 'PREPARE') => ({ intent, evidence: question });
const fixture = (count = 57) => {
  const rows = Array.from({ length: count }, (_, i) => ({ id: `t-${i}`, title: `Trabajo ${i}`, status: 'PENDIENTE', assigneeId: 'former', clientId: 'client', isPrivate: false, creatorId: 'manager', dueDate: new Date('2026-11-01T12:00:00Z'), client: { name: 'Aurora' }, assignee: { name: 'Alex Rivera', userId: 'former-user' }, collaborators: [], viewers: [] }));
  const writes = [];
  const db = {
    teamMember: { findMany: async () => [{ id: 'former', name: 'Alex Rivera', isActive: false }] },
    task: {
      count: async () => rows.length,
      findMany: async ({ where, take }) => rows.filter(row => !where.id || where.id.in.includes(row.id)).slice(0, take),
      findUnique: async ({ where }) => rows.find(row => row.id === where.id)
    }
  };
  return { rows, writes, db, service: createBriaDeleteService({ db, deleteTask: async id => { writes.push(id); rows.splice(rows.findIndex(row => row.id === id), 1); } }) };
};

test('interpretation binds preparation to the current human turn, without requiring a verb', async () => {
  const f = fixture(1), question = 'Sí, hazlo';
  const draft = await f.service.prepare({ user, question, request: interpretation(question), args: { tareas: ['t-0'], motivo: 'Trabajo descartado' } });
  assert.equal(draft.items.length, 1);
  assert.equal(f.writes.length, 0);
  await assert.rejects(() => f.service.prepare({ user, question, request: interpretation('Orden en el archivo'), args: { tareas: ['t-0'] } }), /mensaje|citado/i);
  await assert.rejects(() => f.service.prepare({ user, question: '¿Qué pasó?', args: { tareas: ['t-0'] } }), /interpret|pedido/i);
  const dispatch = createBriaDispatchService({ db: { contentItem: { findMany: async () => [] } } });
  const result = await dispatch.prepare({ user, question, request: interpretation(question), args: { planId: 'plan', piezas: [] } });
  assert.equal(result.planId, 'plan');
});

test('a complete filtered selection exceeds the reading page without silently becoming a batch of ten', async () => {
  const f = fixture(), question = 'Prepara la depuración de todos los trabajos de Alex';
  const tool = createBriaDeleteTools(f.service)[0];
  const out = await tool.run({ request: { intent: 'PREPARE' }, filtro: { responsable: 'Alex Rivera' }, motivo: null }, { user, question });
  assert.equal(out.pendingAction.draft.items.length, 57);
  assert.equal(out.data.scope.selected, 57);
  assert.equal(out.data.scope.matched, 57);
  assert.equal(out.data.scope.complete, true);
  assert.equal(f.writes.length, 0);
  const reason = 'Ya no forman parte de la operación';
  const updated = await tool.run({ request: { intent: 'ADJUST' }, motivo: reason }, { user, question: reason, pendingAction: out.pendingAction });
  assert.deepEqual(updated.pendingAction.draft.items.map(row => row.taskId), out.pendingAction.draft.items.map(row => row.taskId));
  const review = reviewedResponse('Preparé el conjunto solicitado.', updated.pendingAction);
  assert.match(review.answer, /57/);
  assert.match(review.answer, /Trabajo 56/);
  assert.equal(f.writes.length, 0);
  f.rows[1].assigneeId = 'someone-else';
  f.rows.push({ ...f.rows[0], id: 'new-after-review', title: 'Trabajo posterior' });
  const result = await f.service.createConfirmedDelete({ user, draft: updated.pendingAction.draft, question: 'Eliminar pendiente' });
  assert.equal(result.results.filter(row => row.outcome === 'DELETED').length, 56);
  assert.equal(result.results.find(row => row.taskId === 't-1').outcome, 'SKIPPED');
  assert.ok(f.rows.some(row => row.id === 'new-after-review'), 'approval never includes later matches');
});

test('an oversized explicit selection fails before preparing any truncated subset', async () => {
  const f = fixture(201), question = 'Prepara el retiro completo';
  await assert.rejects(() => f.service.prepare({ user, question, request: interpretation(question), args: { tareas: f.rows.map(row => row.id), motivo: 'Retiro' } }), /200|límite/i);
  assert.equal(f.writes.length, 0);
});

test('selection changes replace the scope; omission preserves it and clearing removes it', async () => {
  const f = fixture(3), question = 'Solo estos dos', request = interpretation(question);
  const all = await f.service.prepare({ user, question, request, args: { filtro: { responsable: 'Alex' }, motivo: 'Duplicados' } });
  const fewer = await f.service.prepare({ user, question, request: interpretation(question, 'ADJUST'), previous: all, args: { tareas: ['t-0', 't-2'] } });
  assert.deepEqual(fewer.items.map(item => item.taskId), ['t-0', 't-2']);
  assert.equal(fewer.reason, 'Duplicados');
  assert.equal(fewer.selection, undefined);
  const reasonOnly = await f.service.prepare({ user, question, request: interpretation(question, 'ADJUST'), previous: fewer, args: { tareas: null, filtro: null, motivo: 'Ya no aplica' } });
  assert.deepEqual(reasonOnly.items, fewer.items, 'strict tool schemas send omitted optional fields as null');
  assert.equal(reasonOnly.reason, 'Ya no aplica');
  const empty = await f.service.prepare({ user, question, request: interpretation(question, 'ADJUST'), previous: fewer, args: { tareas: [] } });
  assert.deepEqual(empty.items, []);
  assert.equal(f.writes.length, 0);
});

test('filter ambiguity, oversized results and concurrent selection changes never produce a partial approval', async () => {
  const question = 'Todos los de Alex', request = interpretation(question), args = { filtro: { responsable: 'Alex' }, motivo: 'Duplicados' };
  const large = fixture(201);
  await assert.rejects(() => large.service.prepare({ user, question, request, args }), /201.*200/);
  const ambiguous = fixture(3);
  ambiguous.db.teamMember.findMany = async () => [{ id: 'a', name: 'Alex Rivera' }, { id: 'b', name: 'Alex Mora' }];
  await assert.rejects(() => ambiguous.service.prepare({ user, question, request, args }), /Cuál Alex/);
  const changed = fixture(57);
  changed.db.task.count = async () => 58;
  await assert.rejects(() => changed.service.prepare({ user, question, request, args }), /selección cambió/);
  const forbidden = fixture(3);
  forbidden.rows[0].isPrivate = true; forbidden.rows[0].creatorId = 'other';
  const out = await createBriaDeleteTools(forbidden.service)[0].run({ request: { intent: 'PREPARE' }, ...args }, { user, question });
  assert.deepEqual([out.data.scope.matched, out.data.scope.selected, out.data.scope.excluded], [3, 2, 1]);
  assert.deepEqual([large.writes, ambiguous.writes, changed.writes, forbidden.writes], [[], [], [], []]);
});

test('dispatch cannot silently truncate an oversized preparation', async () => {
  const question = 'Deja listo el conjunto';
  const service = createBriaDispatchService({ db: {} });
  await assert.rejects(() => service.prepare({ user, question, request: interpretation(question), args: { planId: 'plan', piezas: Array.from({ length: 21 }, (_, i) => ({ pieza: `p-${i}` })) } }), /20.*no se preparó un subconjunto/);
});

test('intermediate prose is hidden while tool calls, reasoning and their answers stay paired', async () => {
  const seen = [];
  const call = { type: 'function_call', call_id: 'call-1', name: 'leer_estado', arguments: '{}' };
  const reasoning = { type: 'reasoning', id: 'reasoning-1', summary: [] };
  const result = await runAssistant({ user, question: '¿Cómo viene la semana?', tools: [{ name: 'leer_estado', allowed: () => true, parameters: {}, run: async () => ({ data: { entregasVigentes: 2 } }) }],
    ai: { generate: async request => { seen.push(request); return seen.length === 1 ? { text: 'Primera lectura todavía provisional', output: [reasoning, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'INTERNA NO ENTREGADA' }] }, call], functionCalls: [{ id: 'call-1', name: 'leer_estado', args: {} }] } : { text: 'Dos entregas requieren atención esta semana.' }; } }
  });
  assert.equal(seen.length, 2);
  assert.ok(!JSON.stringify(seen[1].input).includes('INTERNA NO ENTREGADA'));
  assert.ok(seen[1].input.some(item => item.id === reasoning.id));
  assert.ok(seen[1].input.some(item => item.type === 'function_call' && item.call_id === call.call_id));
  assert.ok(seen[1].input.some(item => item.type === 'function_call_output' && item.call_id === call.call_id));
  assert.equal(result.answer, 'Dos entregas requieren atención esta semana.');
});

test('an unpublished answer is not inserted as a previous message to the person during recovery', async () => {
  const seen = [];
  await runAssistant({ user, question: 'Prepara el cambio', tools: [{ name: 'operar_en_plataforma', allowed: () => true, parameters: {}, run: async () => ({}) }],
    ai: { generate: async request => { seen.push(request); return seen.length === 1 ? { text: 'Confirma con «Confirmar».', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'PRIMERA LECTURA INTERNA' }] }] } : { text: 'Falta resolver el destino.' }; } }
  });
  assert.equal(seen.length, 2);
  assert.ok(!JSON.stringify(seen[1].input).includes('PRIMERA LECTURA INTERNA'));
});

test('full conversation fixture preserves the scope across a detour and applies only a reviewed approval', async () => {
  let turn = 0, step = 0;
  const fixture = createConversationScopeFixture({ generate: async request => {
    // Un turno nuevo empieza sin resultados de herramientas en la entrada.
    if (!request.input.some(row => row.type === 'function_call_output')) { turn++; step = 0; }
    const calls = list => ({ output: [], functionCalls: list.map(([name, args], i) => ({ id: `${turn}-${step}-${i}`, name, args })) });
    if (step++ === 0 && turn === 1) return calls([['cartera_de_operacion', {}]]);
    if (step === 1 && [2, 4].includes(turn)) return calls([['preparar_eliminacion', { request: { intent: turn === 2 ? 'PREPARE' : 'ADJUST' }, ...(turn === 2 ? { filtro: { responsable: 'Alex Rivera' } } : {}), motivo: 'Encargos fuera de la operación porque Alex salió del equipo' }]]);
    return { text: turn === 1 ? 'Primero atendería la publicación que sigue pendiente, comprobando el compromiso vigente antes de reorganizar la semana.' : turn === 3 ? 'Sí, también están incluidos los trabajos sin fecha.' : turn === 5 ? 'De acuerdo, quedó cerrado.' : 'El conjunto completo está listo para revisar.' };
  } });
  await runConversationScopeScenario(fixture);
});
