import test from 'node:test';
import assert from 'node:assert/strict';
import { createBriaTurnAuthorizer } from '../src/services/briaTurnAuthorization.js';
import { createBriaConversationService } from '../src/services/briaConversationService.js';
import { briaAssistantTools } from '../src/services/briaAssistantTools.js';
import { actionReply, wrapLegacyAction } from '../src/lib/briaActions.js';
import { runAssistant } from '../src/lib/briaAssistant.js';

const TODAY = '2026-10-23';
const user = () => ({ userId: 'pilot-user', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, gestion: true } });
const privateTask = () => ({ id: 'private-task', title: 'Cabecera visible', status: 'PENDIENTE', isPrivate: true, creatorId: 'another-user', assignee: { name: 'Otra persona', userId: 'another-user' }, client: { name: 'Cuenta ficticia' }, viewers: [], collaborators: [], comments: 'CUERPO PRIVADO' });
const draft = () => ({ id: 'pilot-draft', ownerId: 'pilot-user', status: 'DRAFT', title: 'PILOTO BRIA 2311', client: { id: 'pilot-client', name: 'Cuenta ficticia' }, assignee: { id: 'pilot-member', userId: 'pilot-user', name: 'Persona piloto' }, dueDate: '2026-10-26', priority: 'NORMAL' });
const tool = name => briaAssistantTools.find(item => item.name === name);
const fixture = () => {
  const rows = [privateTask()];
  const db = { task: { findUnique: async ({ where }) => rows.find(row => row.id === where.id) || null, findMany: async () => rows, count: async () => rows.length } };
  return { rows, db, authorize: createBriaTurnAuthorizer({ db, canReadAgencyMemory: async () => false, knowledge: () => ({ list: async () => [] }) }) };
};

test('una lista de cabeceras públicas no necesita abrir el cuerpo de una tarea privada', async () => {
  const { db, rows, authorize } = fixture();
  const who = user();
  for (const name of ['tareas_de_cliente', 'buscar_pendientes']) {
    const output = await tool(name).run(name === 'tareas_de_cliente' ? { clientId: 'pilot-client' } : {}, { db, user: who, person: { memberId: 'pilot-member' }, today: TODAY, getTasks: async () => rows });
    assert.doesNotMatch(JSON.stringify(output), /CUERPO PRIVADO/);
    assert.equal(await authorize(who, output), true, name);
  }
});

test('mis tareas conserva la lectura de tareas propias sin conceder cabeceras ajenas al perder Gestión', async () => {
  const { db, rows, authorize } = fixture();
  const who = user();
  who.modulePermissions.gestion = false;
  rows[0].assignee.userId = who.userId;
  const output = await tool('mis_tareas').run({}, { db, user: who, person: { memberId: 'pilot-member' }, today: TODAY });
  assert.equal(await authorize(who, output), true);
  rows[0].assignee.userId = 'another-user';
  assert.equal(await authorize(who, output), false);
});

test('ajustar la fecha de un borrador después de consultar cabeceras conserva la acción sin crear ninguna tarea', async () => {
  const { db, rows, authorize } = fixture();
  const who = user(), action = wrapLegacyAction('TASK_CREATE', draft());
  let stored = { id: 'pilot-chat', revision: 1, turns: [{ role: 'assistant', text: actionReply(action).answer, pendingAction: action }] };
  let writes = 0;
  const service = createBriaConversationService({
    authorizeTurn: authorize,
    resolveActor: async () => ({ ref: who.userId, role: who.role }),
    actions: { execute: async () => { writes++; assert.fail('Un ajuste no confirma el borrador'); } },
    repository: {
      get: async () => stored,
      append: async (_actor, _id, revision, question, result) => {
        assert.equal(revision, stored.revision);
        stored = { ...stored, revision: revision + 1, turns: [...stored.turns, { role: 'user', text: question }, { ...result, role: 'assistant', text: result.answer }] };
        return stored;
      }
    },
    assistant: { ask: async ({ pendingAction }) => {
      const headers = await tool('tareas_de_cliente').run({ clientId: 'pilot-client' }, { db, user: who, today: TODAY, getTasks: async () => rows });
      const adjusted = { ...pendingAction, draft: { ...pendingAction.draft, dueDate: '2026-10-27' } };
      return { ...actionReply(adjusted), pendingAction: adjusted, sources: headers.sources, toolsUsed: ['tareas_de_cliente', 'preparar_pendiente'] };
    } }
  });
  const saved = await service.send({ user: who, id: stored.id, question: 'Cambia únicamente el vencimiento al 27 de octubre de 2026. Conserva el nombre y el responsable.', expectedRevision: 1 });
  assert.equal(saved.turns.at(-1).pendingAction.draft.dueDate, '2026-10-27');
  assert.equal(saved.turns.at(-1).pendingAction.draft.title, action.draft.title);
  assert.deepEqual(saved.turns.at(-1).pendingAction.draft.assignee, action.draft.assignee);
  assert.equal(writes, 0);
});

test('las fuentes de detalle históricas siguen cerradas, incluso para administración, y reconocen userId e id', async () => {
  const { rows, authorize } = fixture();
  const turn = { sources: [{ kind: 'tarea', id: 'private-task' }] };
  assert.equal(await authorize({ ...user(), role: 'ADMIN' }, turn), false);
  rows[0].viewers.push({ userId: 'pilot-user' });
  assert.equal(await authorize(user(), turn), true);
  assert.equal(await authorize({ ...user(), userId: undefined, id: 'pilot-user' }, turn), true);
  rows[0].viewers = [];
  assert.equal(await authorize(user(), turn), false);
});

test('revocar Gestión o eliminar la tarea invalida también su cabecera', async () => {
  const { db, rows, authorize } = fixture();
  const who = user();
  const headers = await tool('tareas_de_cliente').run({ clientId: 'pilot-client' }, { db, user: who, today: TODAY, getTasks: async () => rows });
  assert.equal(await authorize(who, headers), true);
  who.modulePermissions.gestion = false;
  assert.equal(await authorize(who, headers), false);
  who.modulePermissions.gestion = true;
  rows.length = 0;
  assert.equal(await authorize(who, headers), false);
});

test('consultar una cabecera después del detalle no diluye la autorización del detalle al reunir fuentes', async () => {
  const { db, rows, authorize } = fixture();
  const who = user();
  let round = 0;
  const output = await runAssistant({
    user: who, person: { name: 'Persona piloto' }, today: TODAY, question: 'Consulta ficticia',
    context: { db, getTasks: async () => rows },
    tools: [{ name: 'detalle_ficticio', description: 'Detalle de prueba', parameters: { type: 'object', properties: {} }, allowed: () => true, run: async () => ({ data: { detalle: 'Dato con acceso que puede revocarse' }, sources: [{ kind: 'tarea', id: 'private-task' }] }) }, tool('tareas_de_cliente')],
    ai: { generate: async () => round++ === 0
      ? { functionCalls: [{ id: 'one', name: 'detalle_ficticio', args: {} }, { id: 'two', name: 'tareas_de_cliente', args: { clientId: 'pilot-client' } }], output: [] }
      : { text: 'Respuesta', output: [] } }
  });
  assert.equal(output.sources.length, 2, 'el detalle y la cabecera son evidencias distintas');
  assert.equal(await authorize(who, output), false, 'la cabecera pública no abre el detalle privado');
});

test('un rechazo durante la respuesta deja un diagnóstico acotado sin texto, ids ni borrador privado', async () => {
  const { authorize } = fixture();
  const who = user(), logs = [];
  const service = createBriaConversationService({
    authorizeTurn: authorize,
    resolveActor: async () => ({ ref: who.userId, role: who.role }),
    logger: { warn: (...args) => logs.push(args) },
    repository: { get: async () => ({ id: 'chat-sensible', revision: 1, turns: [] }), append: async () => assert.fail('No se guarda una respuesta rechazada') },
    assistant: { ask: async () => ({ answer: 'CUERPO SECRETO', sources: [{ kind: 'tarea', id: 'private-task', label: 'TÍTULO SECRETO' }], toolsUsed: ['buscar_pendientes'], pendingAction: wrapLegacyAction('TASK_CREATE', draft()) }) }
  });
  await assert.rejects(service.send({ user: who, id: 'chat-sensible', question: 'PREGUNTA SECRETA' }), { status: 403, code: 'BRIA_SOURCE_ACCESS_CHANGED' });
  assert.equal(logs.length, 1);
  assert.deepEqual(logs[0][1], { phase: 'response', sourceKinds: ['tarea'], actionType: 'TASK_CREATE', toolsUsed: ['buscar_pendientes'] });
  assert.doesNotMatch(JSON.stringify(logs), /SECRETO|SECRETA|private-task|pilot-user|pilot-draft|chat-sensible|PILOTO BRIA/);
});

test('eliminar una fuente histórica durante el turno conserva el pedido humano sin publicar la respuesta ni ejecutar', async () => {
  const { rows, authorize } = fixture();
  rows[0].isPrivate = false;
  const who = user();
  let chat = { id: 'chat', revision: 1, turns: [{ role: 'assistant', text: 'DETALLE ANTERIOR', sources: [{ kind: 'tarea', id: 'private-task' }] }] };
  const requests = [];
  const service = createBriaConversationService({
    authorizeTurn: authorize, resolveActor: async () => ({ ref: who.userId, role: who.role }), logger: { warn() {} },
    repository: {
      get: async () => structuredClone(chat),
      append: async (_actor, _id, revision, question, result) => {
        assert.equal(revision, chat.revision);
        assert.notEqual(typeof result, 'function');
        chat = { ...chat, revision: revision + 1, turns: [...chat.turns, { role: 'user', text: question }, { role: 'assistant', ...result, text: result.answer }] };
        return structuredClone(chat);
      }
    },
    assistant: { ask: async request => {
      requests.push(request);
      if (requests.length === 1) {
        rows.length = 0;
        return { answer: 'RESPUESTA CONTAMINADA', sources: [], pendingAction: wrapLegacyAction('TASK_CREATE', draft()) };
      }
      return { answer: 'Retomemos el pedido y revisemos un nuevo borrador.', sources: [] };
    } }
  });
  const question = 'Prepara otro proyecto especial con colaborador y entrega hoy';
  const interrupted = await service.send({ user: who, id: 'chat', question });
  assert.equal(interrupted.turns.at(-2).text, question);
  assert.match(interrupted.turns.at(-1).text, /conserv|guard/i);
  assert.equal(interrupted.turns.at(-1).pendingAction, undefined);
  assert.doesNotMatch(JSON.stringify(interrupted), /DETALLE ANTERIOR|RESPUESTA CONTAMINADA|pilot-draft/);
  await service.send({ user: who, id: 'chat', question: 'Le subes también esta imagen' });
  assert.ok(requests[1].history.some(turn => turn.role === 'user' && turn.text === question));
  assert.equal(requests[1].pendingAction, null);
});
