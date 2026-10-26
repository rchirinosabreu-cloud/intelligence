// Investigación y continuación con servicios reales, almacenamiento ficticio y
// catálogo de WhatsApp. El invocador reserva el saldo global antes de arrancar.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCaseEvalProvider } from './lib/briaResearchRuntime.js';
import { createSettledEvalFetch } from './lib/briaEvalBudget.js';
import { createDecisionInvestigationFixture, runDecisionInvestigationScenario, runDecisionInvestigationContinuation } from '../tests/evals/briaDecisionInvestigationFixture.js';
import { runWithAiContext } from '../src/lib/aiRequestContext.js';

if (process.env.DATABASE_URL || process.env.DIRECT_URL) throw new Error('Esta evaluación no admite base de producción.');
const model = process.env.BRIA_EVAL_MODEL, effort = process.env.BRIA_CHAT_REASONING_EFFORT, output = process.env.BRIA_EVAL_OUTPUT;
if (!process.env.OPENAI_API_KEY || !output || !model || effort !== 'low') throw new Error('Faltan configuración de evaluación, razonamiento low o destino del informe.');
const usage = [];
const budget = createSettledEvalFetch({ model, maxUsd: Number(process.env.BRIA_EVAL_MAX_USD), inputUsdPerMillion: Number(process.env.BRIA_EVAL_INPUT_USD_PER_MILLION), outputUsdPerMillion: Number(process.env.BRIA_EVAL_OUTPUT_USD_PER_MILLION), fetchImpl: async (url, init) => {
  if (String(url) !== 'https://api.openai.com/v1/responses' || JSON.parse(init.body).reasoning?.effort !== effort) throw new Error('Destino o razonamiento diferente de la configuración evaluada.');
  return fetch(url, init);
} });
const provider = await createCaseEvalProvider({ apiKey: process.env.OPENAI_API_KEY, models: { chat: model }, usage, fetchImpl: budget.fetch });
const resumedFrom = process.env.BRIA_EVAL_RESUME_REPORT || null;
let prior = null;
if (resumedFrom) {
  prior = JSON.parse(await readFile(resumedFrom, 'utf8'));
  if (prior.fictional !== true || prior.scenario !== 'decision-investigation' || prior.model !== model || prior.effort !== effort
    || prior.turns?.length !== 1 || prior.operationalWrites?.length || !prior.turns[0].answer.investigation
    || prior.turns[0].answer.pendingAction) throw new Error('No hay una investigación ficticia compatible para continuar.');
}
let stopped = false;
const fixture = createDecisionInvestigationFixture({ generate: async request => {
  if (stopped) throw new Error('Evaluación detenida; no se reintenta.');
  try { return await provider.generate(request); } catch (error) { stopped = true; throw error; }
} }, { initialTurns: prior ? prior.turns.flatMap(turn => [{ role: 'user', text: turn.question }, turn.answer]) : [] });
if (prior) fixture.traces.push(...prior.turns);
let failure = null;
try { await runWithAiContext({ actorId: 'lifecycle-user', module: 'bria', route: 'MAINTENANCE FICTIONAL DECISION INVESTIGATION' }, () => prior ? runDecisionInvestigationContinuation(fixture, prior.turns[0].answer) : runDecisionInvestigationScenario(fixture)); }
catch (error) { failure = String(error.message).replaceAll(process.env.OPENAI_API_KEY, '[REDACTADO]'); }
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify({ fictional: true, scenario: 'decision-investigation', model, effort, pass: !failure, failure,
  scope: prior ? 'continuation' : 'full', resumedFrom, priorAcceptance: prior ? { pass: prior.pass, failure: prior.failure } : null,
  budget: { maxUsd: Number(process.env.BRIA_EVAL_MAX_USD), committedUsd: budget.committedUsd() }, turns: fixture.traces,
  modelRequests: fixture.modelRequests, reads: fixture.reads, operationalWrites: fixture.writes, usage }, null, 2));
console.log(JSON.stringify({ pass: !failure, failure, calls: usage.length, committedUsd: budget.committedUsd(), turns: fixture.traces.length }));
process.exitCode = failure ? 1 : 0;
