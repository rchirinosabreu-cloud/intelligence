// Una conversación ficticia con los servicios reales. El invocador debe reservar
// primero el saldo global: este proceso aplica también un tope antes de cada red.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCaseEvalProvider } from './lib/briaResearchRuntime.js';
import { createSettledEvalFetch } from './lib/briaEvalBudget.js';
import { createGroundedAnswersFixture, runGroundedAnswersScenario, runGroundedReadPreflight, assertGroundedRecovery, GROUNDED_RECOVERY_QUESTION } from '../tests/evals/briaGroundedAnswersFixture.js';
import { runWithAiContext } from '../src/lib/aiRequestContext.js';

if (process.env.DATABASE_URL || process.env.DIRECT_URL) throw new Error('La evaluación no admite base de producción.');
const model = process.env.BRIA_EVAL_MODEL, effort = process.env.BRIA_CHAT_REASONING_EFFORT, output = process.env.BRIA_EVAL_OUTPUT;
if (!process.env.OPENAI_API_KEY || !output || !model || !['low', 'medium'].includes(effort)) throw new Error('Faltan modelo, esfuerzo, credencial o destino explícitos.');
await runGroundedReadPreflight();
const usage = [];
let stopped = false;
const budget = createSettledEvalFetch({ model, maxUsd: Number(process.env.BRIA_EVAL_MAX_USD), inputUsdPerMillion: Number(process.env.BRIA_EVAL_INPUT_USD_PER_MILLION), outputUsdPerMillion: Number(process.env.BRIA_EVAL_OUTPUT_USD_PER_MILLION), fetchImpl: async (url, init) => {
  if (stopped) throw new Error('Evaluación detenida: no se reintenta.');
  if (String(url) !== 'https://api.openai.com/v1/responses' || JSON.parse(init.body).reasoning?.effort !== effort) throw new Error('Destino o esfuerzo diferentes de la configuración evaluada.');
  try {
    const response = await fetch(url, init);
    if (!response.ok) stopped = true;
    return response;
  } catch (error) { stopped = true; throw error; }
} });
const provider = await createCaseEvalProvider({ apiKey: process.env.OPENAI_API_KEY, models: { chat: model }, usage, fetchImpl: budget.fetch });
const resumedFrom = process.env.BRIA_EVAL_RESUME_REPORT || null;
const recoverSubtotal = process.env.BRIA_EVAL_RECOVER_SUBTOTAL === '1';
let savedOutcomes = [], acceptedBefore = 0;
if (recoverSubtotal && !resumedFrom) throw new Error('La aclaración necesita los dos turnos originales.');
if (resumedFrom) {
  const prior = JSON.parse(await readFile(resumedFrom, 'utf8'));
  if (prior.fictional !== true || prior.scenario !== 'grounded-answers' || prior.model !== model || prior.effort !== effort || !Array.isArray(prior.outcomes)
    || prior.operationalWrites?.length || prior.outcomes.some(row => row.answer?.pendingAction)) throw new Error('El informe no contiene un recorrido ficticio compatible.');
  acceptedBefore = prior.acceptedTurns || 0;
  if (recoverSubtotal) {
    if (prior.outcomes.length !== 2 || acceptedBefore !== 1 || !prior.failure?.includes('requested two-client amount') || prior.outcomes.some(row => row.answer?.failures?.length)) throw new Error('Este resultado no es el subtotal omitido que se quiere aclarar.');
    savedOutcomes = prior.outcomes;
  } else savedOutcomes = prior.outcomes.slice(0, acceptedBefore);
}
const fixture = createGroundedAnswersFixture({ generate: async request => {
  if (stopped) throw new Error('Evaluación detenida; no se repite la red.');
  try { return await provider.generate(request); } catch (error) { stopped = true; throw error; }
} }, {
  initialTurns: savedOutcomes.flatMap(row => [{ role: 'user', text: row.question }, row.answer]),
  maxCalls: Number(process.env.BRIA_EVAL_MAX_CALLS), maxOutputTokens: 2800
});
let failure = null, acceptedTurns = acceptedBefore;
try {
  await runWithAiContext({ actorId: 'lifecycle-user', module: 'bria', route: 'MAINTENANCE FICTIONAL GROUNDED ANSWERS' }, async () => {
    if (recoverSubtotal) {
      await fixture.send(GROUNDED_RECOVERY_QUESTION);
      assertGroundedRecovery(fixture.outcomes.at(-1), fixture);
    } else await runGroundedAnswersScenario(fixture, { savedOutcomes, onAccepted: async (_outcome, phase) => { acceptedTurns = phase + 1; } });
  });
} catch (error) { failure = String(error.message).replaceAll(process.env.OPENAI_API_KEY, '[REDACTADO]'); }
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify({ fictional: true, scenario: 'grounded-answers', model, effort, pass: !failure, failure, acceptedTurns,
  semanticAcceptance: 'PENDIENTE_REVISION_DEL_RELATO', resumedFrom,
  ...(recoverSubtotal ? { initiallyPartialTurns: [1], recovery: { phase: 2, pass: !failure, priorPartialResultPreserved: true } } : {}),
  budget: { maxUsd: Number(process.env.BRIA_EVAL_MAX_USD), committedUsd: budget.committedUsd() },
  outcomes: [...savedOutcomes, ...fixture.outcomes], requests: fixture.requests, calls: fixture.calls, reads: fixture.reads, operationalWrites: fixture.writes, usage }, null, 2));
console.log(JSON.stringify({ pass: !failure, failure, calls: usage.length, committedUsd: budget.committedUsd(), turns: savedOutcomes.length + fixture.outcomes.length }));
process.exitCode = failure ? 1 : 0;
