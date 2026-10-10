// Only fictional briefs and injected entity lookups. No operational write is offered.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { loadResearchConfig } from './lib/briaResearchRuntime.js';
import { createBriaTaskDraftService } from '../src/services/briaTaskDraftService.js';
import { createBriaTaskTools } from '../src/services/briaTaskTools.js';
import { runAssistant } from '../src/lib/briaAssistant.js';
import { taskDraftStage } from '../src/lib/briaTaskDraft.js';
import { runWithAiContext } from '../src/lib/aiRequestContext.js';
if (!process.env.BRIA_EVALUATOR_ID || !process.env.BRIA_EVALUATION_OUTPUT) throw Error('Indica evaluador y archivo privado de resultados.');
Object.assign(process.env, await loadResearchConfig(process.env.BRIA_PROJECT_ENV || '.env'), { NODE_ENV: 'production' });
const { createOpenAIClient } = await import('../src/services/openAIClient.js');
const provider = createOpenAIClient({ apiKey: process.env.OPENAI_API_KEY });
const user = { userId: process.env.BRIA_EVALUATOR_ID, role: 'ADMIN', isActive: true, modulePermissions: { bria: true, gestion: true } };
const client = { id: 'fiction-client', name: 'Empresa Ficticia Alfa', slug: 'fiction', isArchived: false }, member = { id: 'fiction-member', name: 'Lucía Ficticia', isActive: true };
const drafts = createBriaTaskDraftService({ db: { client: { findMany: async () => [client] }, teamMember: { findMany: async () => [member] } }, now: () => new Date('2026-10-08T17:00:00Z'), readOnly: true });
const ai = { generate: request => provider.generate({ ...request, model: 'gpt-6-luna', reasoningEffort: 'low', maxOutputTokens: 4800 }) };
const results = [];
for (const item of [
  { id: 'missing-material-priority', question: 'Necesito crear un pendiente para Lucía Ficticia, para mañana, para Empresa Ficticia Alfa. Debe diseñar tres piezas del lanzamiento para revisión interna.', expected: 'MATERIAL' },
  { id: 'dictated-complete', question: 'Crea un pendiente para Lucía Ficticia para el 9 de octubre de 2026, para Empresa Ficticia Alfa: diseñar tres piezas del lanzamiento para revisión interna. Prioridad urgente. No añadiré referencias ni insumos.', expected: 'READY' }
]) {
  const started = Date.now();
  const result = await runWithAiContext({ actorId: user.userId, module: 'bria', route: 'MAINTENANCE FICTIONAL TASK DRAFT EVALUATION' }, () => runAssistant({ question: item.question, user, person: { name: 'Evaluador' }, today: '2026-10-08', tools: createBriaTaskTools(drafts), ai }));
  // El borrador viaja dentro de la acción común (`pendingAction.draft`, 10 de octubre de 2026).
  const draft = result.pendingAction?.draft;
  assert.equal(result.pendingAction?.type, 'TASK_CREATE');
  assert.equal(taskDraftStage(draft), item.expected); assert.equal(draft.dueDate, '2026-10-09');
  assert.equal(draft.assignee.id, member.id); assert.equal(draft.client.id, client.id);
  assert.match(draft.context, /tres|3/);
  results.push({ id: item.id, latencyMs: Date.now() - started, stage: taskDraftStage(draft), result });
  console.log(JSON.stringify({ id: item.id, stage: taskDraftStage(draft), passed: true }));
}
await writeFile(process.env.BRIA_EVALUATION_OUTPUT, JSON.stringify({ fictional: true, model: 'gpt-6-luna', operationalWrites: 0, results }, null, 2));
setTimeout(() => process.exit(0), 1500).unref();
