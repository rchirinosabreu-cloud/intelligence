import assert from 'node:assert/strict';
import { createBriaConversationService } from '../../src/services/briaConversationService.js';
import { createBriaAssistantService } from '../../src/services/briaAssistantService.js';
import { createBriaTaskDraftService } from '../../src/services/briaTaskDraftService.js';

// Servicios de producción, datos y almacenamiento cerrados y ficticios. No evalúa visión ni transporte Meta.
export const createTaskLifecycleFixture = ai => {
  const user = { id: 'lifecycle-user', userId: 'lifecycle-user', name: 'Marina Duarte', role: 'ADMIN', isActive: true, sessionVersion: 0, modulePermissions: { bria: true, gestion: true } };
  const member = { id: 'lifecycle-member', userId: user.id, name: user.name, isActive: true };
  const collaborator = { id: 'lifecycle-nora', name: 'Nora Sáenz', isActive: true };
  const client = { id: 'lifecycle-client', name: 'Taller Aurora Ficticio', isArchived: false };
  const created = [], traces = [], modelRequests = [], files = new Map(), tasks = new Map();
  let locked = false, chat = { id: 'lifecycle-chat', revision: 0, turns: [] };
  const db = {
    user: { findUnique: async () => ({ ...user, teamMember: member }) },
    client: { findMany: async () => [client], findUnique: async () => client },
    teamMember: { findMany: async ({ where }) => [member, collaborator].filter(m => where.OR.some(c => c.name?.contains && m.name.toLowerCase().includes(c.name.contains.toLowerCase()))), findUnique: async ({ where }) => [member, collaborator].find(m => m.id === where.id || where.userId && m.userId === where.userId) },
    task: { findUnique: async ({ where }) => tasks.get(where.id) || null }
  };
  const now = () => new Date('2026-10-24T17:00:00Z');
  const taskDrafts = createBriaTaskDraftService({ db, now,
    createTask: async (data, { taskId }) => { assert.equal(locked, true); const task = { ...data, id: taskId }; tasks.set(taskId, task); created.push(task); return task; },
    uploadFile: async file => ({ name: file.originalname, url: `https://storage.invalid/${encodeURIComponent(file.originalname)}`, key: file.originalname })
  });
  const assistant = createBriaAssistantService({ db, now, taskDrafts, tools: [],
    ai: { generate: async request => { modelRequests.push(structuredClone({ input: request.input, model: request.model, reasoningEffort: request.reasoningEffort })); return ai.generate(request); } },
    dispatchDrafts: null, deleteDrafts: null, actions: null, usage: null, platform: null, knowledge: null,
    agencyFacts: null, vault: null, mail: null, permissions: null, dailyReading: null, serviceHealth: null
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
  const service = createBriaConversationService({ repository, assistant, taskDrafts,
    resolveActor: async () => ({ ref: user.id, role: user.role }),
    // Lectura simulada de un adjunto ficticio: no manda píxeles ni datos privados.
    prepareAttachment: async file => ({ id: 'lifecycle-photo', name: file.originalname, mime: 'image/jpeg', buffer: file.buffer, size: file.buffer.length, status: 'READ', text: 'Imagen ficticia: dos variantes de una portada del taller.' })
  });
  return { created, traces, modelRequests,
    async send(question, attached = []) {
      const result = await service.send({ user, id: chat.id, question, files: attached, expectedRevision: chat.revision });
      const answer = result.turns.at(-1);
      traces.push({ question, answer, writes: created.length });
      return answer;
    }
  };
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
