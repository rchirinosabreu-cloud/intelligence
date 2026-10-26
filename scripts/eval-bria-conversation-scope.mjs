// Recorrido único con modelo real, catálogo completo y persistencia ficticia.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createCaseEvalProvider } from './lib/briaResearchRuntime.js';
import { createSettledEvalFetch } from './lib/briaEvalBudget.js';
import { createConversationScopeFixture, runConversationScopeScenario } from '../tests/evals/briaConversationScopeFixture.js';
import { runWithAiContext } from '../src/lib/aiRequestContext.js';

if (process.env.DATABASE_URL || process.env.DIRECT_URL) throw new Error('Esta evaluación no admite base de producción.');
const model = process.env.BRIA_EVAL_MODEL, effort = process.env.BRIA_CHAT_REASONING_EFFORT, output = process.env.BRIA_EVAL_OUTPUT;
if (!process.env.OPENAI_API_KEY || !output || !model || !effort) throw new Error('Faltan configuración y destino del informe.');
const usage = [];
const budget = createSettledEvalFetch({ model, maxUsd: Number(process.env.BRIA_EVAL_MAX_USD), inputUsdPerMillion: Number(process.env.BRIA_EVAL_INPUT_USD_PER_MILLION), outputUsdPerMillion: Number(process.env.BRIA_EVAL_OUTPUT_USD_PER_MILLION), fetchImpl: async (url, init) => {
  if (String(url) !== 'https://api.openai.com/v1/responses' || JSON.parse(init.body).reasoning?.effort !== effort) throw new Error('Destino o razonamiento diferente de la configuración evaluada.');
  return fetch(url, init);
} });
const provider = await createCaseEvalProvider({ apiKey: process.env.OPENAI_API_KEY, models: { chat: model }, usage, fetchImpl: budget.fetch });
let stopped = false, savedTurns = [], initialDeleted = [];
const resumedFrom = process.env.BRIA_EVAL_RESUME_REPORT || null;
if (resumedFrom) {
  const prior = JSON.parse(await readFile(resumedFrom, 'utf8'));
  const beforeApproval = [2, 3].includes(prior.turns.length) && !prior.deleted.length && prior.turns[1].answer.pendingAction?.draft.items.length === 57;
  const afterApproval = prior.turns.length === 4 && prior.deleted.length === 57 && prior.turns.at(-1).answer.pendingAction?.status === 'DONE';
  if (prior.fictional !== true || prior.scenario !== 'conversation-scope' || prior.model !== model || prior.effort !== effort || !(beforeApproval || afterApproval)) throw new Error('No hay un punto de continuación ficticio compatible.');
  savedTurns = prior.turns;
  initialDeleted = prior.deleted;
}
const fixture = createConversationScopeFixture({ generate: async request => {
  if (stopped) throw new Error('Evaluación detenida; no se reintenta.');
  try { return await provider.generate(request); } catch (error) { stopped = true; throw error; }
} }, { initialTurns: savedTurns.flatMap(turn => [{ role: 'user', text: turn.question }, turn.answer]), initialDeleted });
fixture.traces.push(...savedTurns);
let failure = null;
try { await runWithAiContext({ actorId: 'lifecycle-user', module: 'bria', route: 'MAINTENANCE FICTIONAL CONVERSATION SCOPE' }, () => runConversationScopeScenario(fixture, { savedTurns })); }
catch (error) { failure = String(error.message).replaceAll(process.env.OPENAI_API_KEY, '[REDACTADO]'); }
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify({ fictional: true, scenario: 'conversation-scope', resumedFrom, model, effort, pass: !failure, failure, budget: { maxUsd: Number(process.env.BRIA_EVAL_MAX_USD), committedUsd: budget.committedUsd() }, turns: fixture.traces, modelRequests: fixture.modelRequests, deleted: fixture.deleted, reads: fixture.reads, writes: fixture.writes, usage }, null, 2));
console.log(JSON.stringify({ pass: !failure, failure, calls: usage.length, committedUsd: budget.committedUsd(), turns: fixture.traces.length }));
process.exitCode = failure ? 1 : 0;
