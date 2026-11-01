import assert from 'node:assert/strict';
import { createBriaConversationService } from '../../src/services/briaConversationService.js';
import { createBriaAssistantService } from '../../src/services/briaAssistantService.js';
import { createBriaTaskDraftService } from '../../src/services/briaTaskDraftService.js';

// Servicios de producción, datos y almacenamiento cerrados y ficticios. No evalúa visión ni transporte Meta.
export const createTaskLifecycleFixture = (ai, { historicalFiles = [], assistantTools = [], assistantContext = {}, extraDb = {}, knowledge = null, assistantOptions = {}, conversationOptions = {}, session = null, initialTurns = [], initialCreated = [] } = {}) => {
  const user = { id: 'lifecycle-user', userId: 'lifecycle-user', name: 'Marina Duarte', role: 'ADMIN', isActive: true, sessionVersion: 0, modulePermissions: { bria: true, gestion: true } };
  const member = { id: 'lifecycle-member', userId: user.id, name: user.name, isActive: true };
  const collaborator = { id: 'lifecycle-nora', name: 'Nora Sáenz', isActive: true };
  const client = { id: 'lifecycle-client', name: 'Taller Aurora Ficticio', isArchived: false };
  const created = structuredClone(initialCreated), traces = [], modelRequests = [], files = new Map(historicalFiles.map(file => [file.id, file])), tasks = new Map(created.map(task => [task.id, task]));
  let locked = false, chat = { id: 'lifecycle-chat', revision: initialTurns.length / 2, turns: structuredClone(initialTurns) };
  const db = {
    user: { findUnique: async () => ({ ...user, teamMember: member }) },
    client: { findMany: async () => [client], findUnique: async () => client },
    teamMember: { findMany: async ({ where }) => [member, collaborator].filter(m => where.OR.some(c => c.name?.contains && m.name.toLowerCase().includes(c.name.contains.toLowerCase()))), findUnique: async ({ where }) => [member, collaborator].find(m => m.id === where.id || where.userId && m.userId === where.userId) },
    task: { findUnique: async ({ where }) => tasks.get(where.id) || null }, ...extraDb
  };
  const now = () => new Date('2026-10-24T17:00:00Z');
  const taskDrafts = createBriaTaskDraftService({ db, now,
    createTask: async (data, { taskId }) => { assert.equal(locked, true); const task = { ...data, id: taskId }; tasks.set(taskId, task); created.push(task); return task; },
    uploadFile: async file => ({ name: file.originalname, url: `https://storage.invalid/${encodeURIComponent(file.originalname)}`, key: file.originalname })
  });
  const assistant = createBriaAssistantService({ db, now, taskDrafts, tools: assistantTools, context: assistantContext,
    ai: { generate: async request => { modelRequests.push(structuredClone({ input: request.input, model: request.model, reasoningEffort: request.reasoningEffort, tools: request.tools?.map(tool => tool.name), planning: Boolean(request.responseSchema) })); return ai.generate(request); } },
    dispatchDrafts: null, deleteDrafts: null, actions: null, usage: null, platform: null, knowledge,
    agencyFacts: null, vault: null, mail: null, permissions: null, dailyReading: null, serviceHealth: null, notebook: null, ...assistantOptions
  });
  const repository = {
    get: async () => structuredClone(chat), attachments: async () => [...files.values()].reverse(),
    attachment: async (_actor, _id, fileId) => files.get(fileId),
    append: async (_actor, _id, revision, question, result, prepared = []) => {
      assert.equal(revision, chat.revision);
      locked = true;
      let reply;
      try { reply = typeof result === 'function' ? await result() : result; } finally { locked = false; }
      for (const file of prepared) files.set(file.id, file);
      chat = { ...chat, revision: revision + 1, turns: [...chat.turns, { role: 'user', text: question }, { role: 'assistant', ...reply, text: reply.answer }] };
      return structuredClone(chat);
    }
  };
  const service = createBriaConversationService({ repository, assistant, taskDrafts, ...conversationOptions,
    resolveActor: async () => ({ ref: user.id, role: user.role }),
    // Lectura simulada de un adjunto ficticio: no manda píxeles ni datos privados.
    prepareAttachment: async file => ({ id: 'lifecycle-photo', name: file.originalname, mime: 'image/jpeg', buffer: file.buffer, size: file.buffer.length, status: 'READ', text: 'Imagen ficticia: dos variantes de una portada del taller.' })
  });
  return { created, traces, modelRequests,
    async send(question, attached = []) {
      const result = await service.send({ user, id: chat.id, question, files: attached, expectedRevision: chat.revision, session });
      const answer = result.turns.at(-1);
      traces.push({ question, answer, writes: created.length });
      return answer;
    }
  };
};

export const historicalTaskFiles = [
  { id: 'old-kitchen-one', name: 'foto-anterior-1.jpg', mime: 'image/jpeg', status: 'READ', text: 'Imagen anterior de una cocina remodelada.', createdAt: '2026-10-24T13:00:00Z' },
  { id: 'old-kitchen-two', name: 'foto-anterior-2.jpg', mime: 'image/jpeg', status: 'READ', text: 'Otra foto anterior de la misma cocina.', createdAt: '2026-10-24T13:01:00Z' }
];

// Evalúa continuidad y voz, con respuestas a aclaraciones y una interrupción real.
// Las comprobaciones observan estado y efectos, no exigen una frase del modelo.
export const runConversationalTaskScenario = async (fixture, { savedTurns = [] } = {}) => {
  if (savedTurns.length === 5) {
    assert.deepEqual(savedTurns.map(turn => turn.writes), [0, 0, 0, 0, 1]);
    assert.equal(fixture.created.length, 1);
    assert.equal(fixture.created[0].focusDeadlineAt, '2026-10-25T22:00:00.000Z');
    assert.deepEqual(fixture.created[0].initial_comments, [{ content: 'Validar la portada con el equipo' }]);
    const closed = await fixture.send('Gracias, eso era todo.');
    assert.equal(closed.pendingAction, undefined);
    assert.deepEqual(closed.toolsUsed, []);
    assert.equal(fixture.created.length, 1);
    return;
  }
  const first = savedTurns[0]?.answer || await fixture.send('Ayúdame a dejar preparada una tarea llamada «Revisión de portada», para Taller Aurora Ficticio, a mi cargo. Todavía no sé el día. No la crees.');
  assert.equal(first.pendingAction?.type, 'TASK_CREATE');
  assert.ok(first.pendingAction.missing.length);
  assert.equal(first.approvalReview, undefined);
  const draftId = first.pendingAction.id;
  if (!savedTurns[1]) await fixture.send('Antes, explícame brevemente qué diferencia hay entre una referencia y un insumo. La tarea la seguimos enseguida.');
  assert.equal(fixture.created.length, 0);
  const ready = savedTurns[2]?.answer || await fixture.send('Ya decidí: mañana a las cuatro y media de la tarde. Conserva el nombre y lo demás; espera mi aprobación.');
  assert.equal(ready.pendingAction?.id, draftId);
  assert.equal(ready.pendingAction.draft.title, 'Revisión de portada');
  assert.equal(ready.pendingAction.draft.dueDate, '2026-10-25');
  assert.equal(ready.pendingAction.draft.focusTime, '16:30');
  assert.equal(ready.approvalReview?.actionId, draftId);
  assert.equal(fixture.created.length, 0);
  const corrected = await fixture.send('Mejor a las cinco. Añade este comentario literal: «Validar la portada con el equipo». Enséñame cómo queda.');
  assert.equal(corrected.pendingAction?.draft.focusTime, '17:00');
  assert.equal(corrected.pendingAction?.draft.context, 'Validar la portada con el equipo');
  assert.notEqual(corrected.approvalReview?.state, ready.approvalReview.state);
  assert.equal(fixture.created.length, 0);
  await fixture.send('dale, así está bien');
  assert.equal(fixture.created.length, 1);
  assert.equal(fixture.created[0].focusDeadlineAt, '2026-10-25T22:00:00.000Z');
  assert.deepEqual(fixture.created[0].initial_comments, [{ content: 'Validar la portada con el equipo' }]);
  const closed = await fixture.send('Gracias, eso era todo.');
  assert.equal(closed.pendingAction, undefined);
  assert.deepEqual(closed.toolsUsed, []);
  assert.equal(fixture.created.length, 1);
};

export const runHistoricalTaskFilesScenario = async fixture => {
  const initial = await fixture.send('Prepara una tarea llamada «Ensayo sin imagen nueva», para Taller Aurora Ficticio, asignada a mí para mañana a las 3 p. m. Usa esta imagen como insumo. Muéstrame cómo quedaría y espera mi aprobación.');
  assert.equal(fixture.created.length, 0);
  assert.equal(initial.pendingAction?.type, 'TASK_CREATE', 'the missing file must not lose the task request');
  assert.deepEqual(initial.pendingAction.draft.files, [], 'old images cannot substitute for a missing new upload');
  assert.ok(initial.pendingAction.missing.length, 'creation remains blocked until the image is clarified');
  assert.ok(!initial.quickReplies?.includes('Crear pendiente'));
  const next = await fixture.send('Esta es la imagen que quiero usar. Conserva los demás datos y espera mi aprobación.', [{ originalname: 'portada.jpg', buffer: Buffer.from('fictional-new-image') }]);
  assert.equal(next.pendingAction?.draft.id, initial.pendingAction.draft.id);
  assert.deepEqual(next.pendingAction.draft.files.map(file => file.id), ['lifecycle-photo']);
  assert.equal(next.pendingAction.draft.focusTime, '15:00');
  assert.equal(next.pendingAction.draft.dueDate, '2026-10-25');
  assert.deepEqual(next.pendingAction.missing, []);
  assert.equal(fixture.created.length, 0);
  await fixture.send('Crear pendiente');
  assert.equal(fixture.created.length, 1);
  assert.equal(fixture.created[0].initial_inputs.length, 1);
  assert.equal(fixture.created[0].initial_inputs[0].name, 'portada.jpg');
  const last = await fixture.send('Gracias.');
  assert.equal(last.pendingAction, undefined);
  assert.deepEqual(last.toolsUsed, []);
  assert.equal(fixture.created.length, 1);
};

export const runTaskLifecycleScenario = async fixture => {
  const first = await fixture.send('Deja lista para revisar una tarea llamada «Ensayo de entrega», para Taller Aurora Ficticio, a mi cargo. Es especial y urgente, Nora Sáenz colabora conmigo y la necesito hoy a las 3pm. Esta foto va como insumo. Espera mi aprobación.', [{ originalname: 'portada.jpg', buffer: Buffer.from('fictional-file') }]);
  const check = answer => {
    assert.equal(answer.pendingAction?.type, 'TASK_CREATE');
    const draft = answer.pendingAction.draft;
    assert.equal(draft.title, 'Ensayo de entrega');
    assert.equal(draft.client?.id, 'lifecycle-client');
    assert.equal(draft.assignee?.id, 'lifecycle-member');
    assert.equal(draft.isSpecial, true); assert.equal(draft.priority, 'URGENTE');
    assert.deepEqual(draft.collaborators.map(m => m.id), ['lifecycle-nora']);
    assert.equal(draft.focusTime, '15:00');
    assert.equal(fixture.created.length, 0);
    return draft;
  };
  const initial = check(first);
  assert.equal(initial.dueDate, '2026-10-24');
  assert.deepEqual(initial.files.map(f => [f.id, f.destination]), [['lifecycle-photo', 'INSUMO']]);
  const corrected = check(await fixture.send('Mejor para mañana a la misma hora. La foto ponla como adjunto de un comentario que diga exactamente «Dos variantes para revisión». Todavía no guardes.'));
  assert.equal(corrected.dueDate, '2026-10-25');
  assert.equal(corrected.context, 'Dos variantes para revisión');
  assert.deepEqual(corrected.files.map(f => [f.id, f.destination]), [['lifecycle-photo', 'COMENTARIO']]);
  const removed = check(await fixture.send('Dejemos fuera la foto y ese comentario. Conserva todo lo demás y muéstramelo antes de crear.'));
  assert.equal(removed.dueDate, '2026-10-25'); assert.deepEqual(removed.files, []); assert.ok(!removed.context);
  const final = check(await fixture.send('Comentario final: «Listo para revisión interna». Conserva la tarea sin la imagen; enséñame el resumen.'));
  assert.equal(final.context, 'Listo para revisión interna');
  assert.deepEqual(final.files, []);
  await fixture.send('Crear pendiente');
  assert.equal(fixture.created.length, 1);
  assert.equal(fixture.created[0].focusDeadlineAt, '2026-10-25T20:00:00.000Z');
  assert.deepEqual(fixture.created[0].initial_inputs, []);
  assert.deepEqual(fixture.created[0].tempAttachments, []);
  assert.deepEqual(fixture.created[0].initial_comments, [{ content: 'Listo para revisión interna' }]);
  const closed = await fixture.send('Gracias, con eso terminamos.');
  assert.equal(fixture.created.length, 1);
  assert.equal(closed.pendingAction, undefined);
  assert.deepEqual(closed.toolsUsed, []);
  assert.doesNotMatch(closed.text, /borrador.*(?:no.*disponible|retomar)|(?:dime|cu[aá]l|qu[eé]).*(?:cliente|t[ií]tulo)/i);
};
