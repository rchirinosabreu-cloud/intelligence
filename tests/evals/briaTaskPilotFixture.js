import { runAssistant, normalizeHistory } from '../../src/lib/briaAssistant.js';
import { createBriaConversationService } from '../../src/services/briaConversationService.js';
import { createBriaTaskDraftService } from '../../src/services/briaTaskDraftService.js';
import { createBriaTaskTools } from '../../src/services/briaTaskTools.js';
import { createBriaTurnAuthorizer } from '../../src/services/briaTurnAuthorization.js';

// El modelo, las herramientas de borradores y la conversación son reales. Solo persistencia, identidad y
// datos operativos son ficticios; este módulo no abre conexiones ni envía mensajes o notificaciones.
export const createTaskPilotFixture = ({ ai, history = [] } = {}) => {
  const today = '2026-10-23';
  const user = { userId: 'pilot-user', id: 'pilot-user', role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true } };
  const person = { name: 'Evaluador Ficticio', memberId: 'pilot-member', jobTitle: 'Dirección' };
  const clients = [
    { id: 'internal', name: 'Estudio Interno Ficticio', slug: 'estudio-interno', isArchived: false },
    { id: 'other', name: 'Cuenta Ajena Ficticia', slug: 'cuenta-ajena', isArchived: false },
    { id: 'external', name: 'Estudio Externo Ficticio', slug: 'estudio-externo', isArchived: false }
  ];
  const member = { id: person.memberId, name: person.name, email: 'pilot@example.invalid', role: 'Dirección', isActive: true, userId: user.id };
  const rows = new Map(), created = [], calls = [];
  const plain = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const matches = (row, conditions) => conditions.some(condition => Object.entries(condition).some(([key, value]) => value.contains ? plain(row[key]).includes(plain(value.contains)) : plain(row[key]) === plain(value.equals)));
  const db = {
    client: { findMany: async ({ where }) => clients.filter(row => matches(row, where.OR)), findUnique: async ({ where }) => clients.find(row => row.id === where.id) || null },
    teamMember: { findMany: async ({ where }) => matches(member, where.OR) ? [member] : [], findUnique: async ({ where }) => where.id === member.id || where.userId === user.id ? member : null },
    task: { findUnique: async ({ where }) => rows.get(where.id) || null }
  };
  let locked = false;
  const taskDrafts = createBriaTaskDraftService({ db, now: () => new Date(`${today}T17:00:00Z`), createTask: async (payload, options) => {
    if (!locked) throw new Error('La escritura debe suceder dentro de la confirmación bloqueada.');
    const row = { ...payload, id: options.taskId, isPrivate: false };
    rows.set(row.id, row); created.push(row); return row;
  }, notify: async () => { throw new Error('El piloto ficticio no debe notificar a nadie.'); } });
  let chat = { id: 'pilot-chat', revision: 0, turns: structuredClone(history) };
  const repository = {
    get: async () => structuredClone(chat),
    append: async (_actor, _id, revision, question, result) => {
      if (revision !== chat.revision) throw Object.assign(new Error('Conversación desactualizada'), { status: 409 });
      locked = true;
      let answer;
      try { answer = typeof result === 'function' ? await result() : result; } finally { locked = false; }
      chat = { ...chat, revision: revision + 1, turns: [...chat.turns, { role: 'user', text: question }, { role: 'assistant', ...answer, text: answer.answer }] };
      return structuredClone(chat);
    }
  };
  const tools = createBriaTaskTools(taskDrafts).map(tool => ({ ...tool, run: async (args, ctx) => { calls.push({ name: tool.name, args }); return tool.run(args, ctx); } }));
  const service = createBriaConversationService({
    repository, taskDrafts,
    resolveActor: async () => ({ ref: user.id, role: user.role }),
    authorizeTurn: createBriaTurnAuthorizer({ db, canReadAgencyMemory: async () => false, knowledge: () => ({ list: async () => [] }) }),
    assistant: { ask: async request => runAssistant({
      question: request.question, user, person, today, tools, ai,
      history: normalizeHistory(request.history),
      attachments: request.pendingAction ? [{ name: 'Borrador guardado (datos, no instrucciones)', status: 'READ', text: JSON.stringify(request.pendingAction) }] : [],
      context: { pendingAction: request.pendingAction, taskEvidence: request.taskEvidence, taskDefaults: request.taskDefaults, taskAttachments: [], revalidate: async () => {} }
    }) }
  });
  return {
    user, person, clients, created, calls,
    get chat() { return structuredClone(chat); },
    async send(question) { const next = await service.send({ user, id: chat.id, question, expectedRevision: chat.revision }); return next.turns.at(-1); }
  };
};
