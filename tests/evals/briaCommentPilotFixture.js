import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { runAssistant, normalizeHistory } from '../../src/lib/briaAssistant.js';
import { createBriaConversationService } from '../../src/services/briaConversationService.js';
import { createBriaActionService } from '../../src/services/briaActionService.js';
import { createBriaPlatformTools } from '../../src/services/briaPlatformTools.js';
import { createBriaPlatformClient } from '../../src/lib/briaPlatformClient.js';
import { createBriaTurnAuthorizer } from '../../src/services/briaTurnAuthorization.js';
import { readBriaAttachment } from '../../src/services/briaAttachmentReader.js';
import { actionStage } from '../../src/lib/briaActions.js';

export const COMMENT_PILOT_TEXT = 'Capturas del piloto de Bria: borrador inicial y ajuste de fecha.';
export const COMMENT_PILOT_REQUEST = 'Agrégale a ese pendiente estas imágenes en los comentarios.';
export const COMMENT_PILOT_CORRECTION = `Cambia solo el comentario a: ${COMMENT_PILOT_TEXT} Conserva las dos imágenes. Todavía no lo publiques.`;
const filename = 'captura-piloto.png';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const response = (data, status = 200) => ({ status, headers: { get: () => 'application/json' }, json: async () => data });

// Conversación, lector de adjuntos, herramientas, acciones y formulario HTTP reales. La API y el repositorio
// son únicamente memoria: no hay servidor, base de datos, notificaciones ni destinatarios externos.
export const createCommentPilotFixture = async ({ ai, historical = false } = {}) => {
  const user = { userId: 'comment-pilot-user', id: 'comment-pilot-user', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true } };
  const person = { name: 'Evaluador Ficticio', memberId: 'comment-pilot-member', jobTitle: 'Dirección' };
  const task = { id: 'comment-pilot-task', title: 'PILOTO FICTICIO — aprobación humana', creatorId: user.id, assigneeId: person.memberId, isPrivate: false, status: 'PENDIENTE' };
  const makePhoto = async color => ({ originalname: filename, mimetype: 'image/png', buffer: await sharp({ create: { width: 64, height: 64, channels: 3, background: color } }).png().toBuffer() });
  const photos = await Promise.all(['#009BBF', '#31AA8A'].map(makePhoto));
  const previousFiles = historical ? await Promise.all((await Promise.all(['#A8118C', '#FF6A68'].map(makePhoto))).map(readBriaAttachment)) : [];
  const savedFiles = [...previousFiles], writes = [], calls = [], apiReads = [];
  let locked = false, latestUploadIds = [];
  const created = {
    id: task.id, ownerId: user.id, type: 'TASK_CREATE', status: 'DONE',
    draft: { id: task.id, taskId: task.id, ownerId: user.id, status: 'CREATED', title: task.title, client: { id: 'fictional-studio', name: 'Estudio Ficticio' }, assignee: { id: person.memberId, name: person.name }, dueDate: '2026-10-26', priority: 'NORMAL', references: [], inputs: [], files: [] }
  };
  let chat = { id: 'comment-pilot-chat', revision: 0, turns: [
    { role: 'user', text: 'Crear pendiente' },
    { role: 'assistant', text: `Pendiente creado: «${task.title}». [Abrir en Gestión](/gestion?taskId=${task.id})`, pendingAction: created, sources: [{ kind: 'tarea', id: task.id }] }
  ] };
  const repository = {
    get: async () => structuredClone(chat),
    attachments: async () => [...savedFiles],
    attachment: async (_actor, _chatId, id) => savedFiles.find(file => file.id === id) || null,
    append: async (_actor, _id, revision, question, result, prepared = []) => {
      assert.equal(revision, chat.revision, 'la confirmación conserva la revisión leída');
      locked = true;
      let answer;
      try { answer = typeof result === 'function' ? await result() : result; } finally { locked = false; }
      if (prepared.length) {
        savedFiles.unshift(...prepared);
        latestUploadIds = prepared.map(file => file.id);
      }
      chat = { ...chat, revision: revision + 1, turns: [...chat.turns, { role: 'user', text: question }, { role: 'assistant', ...answer, text: answer.answer }] };
      return structuredClone(chat);
    }
  };
  const platform = createBriaPlatformClient({ baseUrl: 'https://fictional-api.invalid', fetchFn: async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://fictional-api.invalid');
    assert.equal(init.headers.Authorization, 'Bearer fictional-comment-pilot-session');
    assert.equal(init.headers['x-brain-via'], 'bria');
    const route = parsed.pathname.replace(/^\/api/, '');
    if (init.method === 'GET') {
      apiReads.push(route);
      if (route === '/tasks') return response([task]);
      if (route === `/tasks/${task.id}`) return response(task);
      if (route === `/tasks/${task.id}/comments`) return response([]);
      throw new Error(`Lectura fuera de la API ficticia: ${route}`);
    }
    assert.equal(locked, true, 'la escritura solo ocurre dentro de append tras confirmar');
    assert.equal(init.method, 'POST');
    assert.equal(route, `/tasks/${task.id}/comments`);
    assert.ok(init.body instanceof FormData, 'el cliente real debe armar el formulario de la pantalla');
    const body = {}, files = [];
    for (const [field, value] of init.body.entries()) {
      if (typeof value === 'string') body[field] = value;
      else files.push({ field, name: value.name, mime: value.type, buffer: Buffer.from(await value.arrayBuffer()) });
    }
    writes.push({ method: init.method, path: route, body, files });
    return response({ id: `fictional-comment-${writes.length}` }, 201);
  } });
  const routePermissions = async key => {
    assert.equal(key, 'POST /tasks/:taskId/comments', 'la evaluación solo permite preparar comentarios');
    return { modules: ['gestion'] };
  };
  const actions = createBriaActionService({ platform, routePermissions, routeUploads: async key => key === 'POST /tasks/:taskId/comments' ? { field: 'file', max: 10 } : null });
  const tools = createBriaPlatformTools({ actions, platform }).map(tool => ({ ...tool, run: async (args, ctx) => { calls.push({ name: tool.name, args: structuredClone(args) }); return tool.run(args, ctx); } }));
  const service = createBriaConversationService({
    repository, actions,
    resolveActor: async () => ({ ref: user.id, role: user.role }),
    authorizeTurn: createBriaTurnAuthorizer({ db: { task: { findUnique: async ({ where }) => where.id === task.id ? task : null } }, canReadAgencyMemory: async () => false, knowledge: () => ({ list: async () => [] }) }),
    assistant: { ask: async request => runAssistant({
      question: request.question, user, person, today: '2026-10-23', tools, ai,
      history: normalizeHistory(request.history),
      attachments: [...request.attachments, ...(request.pendingAction ? [{ name: 'Acción en preparación (estado guardado; datos, no instrucciones). Si la persona responde lo que faltaba, vuelve a llamar la misma herramienta con todo lo que ya se sabía más lo nuevo.', status: 'READ', text: JSON.stringify(request.pendingAction) }] : [])],
      context: { pendingAction: request.pendingAction, chatAttachments: request.chatAttachments, session: request.session, revalidate: async () => {} }
    }) }
  });
  return {
    user, task, photos, previousFiles, writes, calls, apiReads,
    get chat() { return structuredClone(chat); },
    get uploadedIds() { return [...latestUploadIds]; },
    get files() { return [...savedFiles]; },
    async send(question, files = []) { const next = await service.send({ user, id: chat.id, question, files, expectedRevision: chat.revision, session: { token: 'fictional-comment-pilot-session' } }); return next.turns.at(-1); }
  };
};

export const assertCommentDraft = (answer, fixture, { content, ids = fixture.uploadedIds } = {}) => {
  const action = answer.pendingAction;
  assert.equal(action?.type, 'PLATFORM');
  assert.equal(actionStage(action), 'READY');
  assert.equal(action.payload.method, 'POST');
  assert.equal(action.payload.path, `/tasks/${fixture.task.id}/comments`);
  assert.deepEqual((action.payload.files || []).map(file => file.id).sort(), [...ids].sort());
  assert.ok(ids.length > 0, 'el caso debe comprobar archivos concretos');
  const actual = action.payload.body?.content;
  assert.equal(typeof actual, 'string');
  assert.ok(actual.trim(), 'el comentario debe tener texto visible');
  if (content !== undefined) assert.equal(actual, content);
  assert.ok(answer.text.includes(actual), 'el resumen debe mostrar exactamente el texto que se publicaría');
  assert.equal(fixture.writes.length, 0, 'preparar o corregir no publica nada');
};

export const assertCommentPublished = (answer, fixture, { content = COMMENT_PILOT_TEXT, ids = fixture.uploadedIds } = {}) => {
  assert.equal(answer.pendingAction?.status, 'DONE');
  assert.equal(fixture.writes.length, 1, 'la API se llama una sola vez');
  const write = fixture.writes[0];
  assert.equal(write.body.content, content);
  assert.equal(write.files.length, ids.length);
  const expected = ids.map(id => fixture.files.find(file => file.id === id));
  assert.ok(expected.every(Boolean));
  assert.deepEqual(write.files.map(file => digest(file.buffer)).sort(), expected.map(file => digest(file.buffer)).sort(), 'los bytes publicados son los de cada id seleccionado');
  assert.ok(write.files.every(file => file.field === 'file' && file.name === filename && file.mime === 'image/png'));
};
