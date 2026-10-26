// Caso ficticio acotado: corrección humana, nueva instancia y lectura matinal.
// Este script no administra el saldo total: su invocador debe reservarlo en el
// ledger antes de ejecutarlo. Cada solicitud además reserva antes de la red.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCaseEvalProvider } from './lib/briaResearchRuntime.js';
import { createSettledEvalFetch } from './lib/briaEvalBudget.js';
import { createPersistentMemoryFixture, runPersistentMemoryScenario } from '../tests/evals/briaPersistentMemoryFixture.js';
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
let stopped = false;
const fixture = createPersistentMemoryFixture({ generate: async request => {
  if (stopped) throw new Error('Evaluación detenida; no se reintenta.');
  try { return await provider.generate(request); } catch (error) { stopped = true; throw error; }
} });
// A bounded follow-up can reuse a successful fictional conversation and pay
// only for the morning. The original acceptance assertions still run; the
// report distinguishes this from a new end-to-end conversation.
const replayPath = process.env.BRIA_EVAL_MORNING_REPLAY || null;
if (replayPath) {
  const previous = JSON.parse(await readFile(replayPath, 'utf8'));
  const conversation = previous.outcomes?.find(row => row.phase === 'conversation');
  const morning = previous.outcomes?.find(row => row.phase === 'morning');
  if (previous.fictional !== true || previous.scenario !== 'persistent-memory' || previous.model !== model
    || !conversation?.answer || !morning?.reading?.context || previous.operationalWrites?.length) throw new Error('No valid fictional conversation available to replay.');
  const active = morning.reading.context.accounts.flatMap(account => account.facts || []);
  const corrections = previous.memoryWrites || [];
  for (const old of fixture.facts) if (!active.some(fact => fact.id === old.id)) {
    const replacement = corrections.find(fact => fact.clientId === old.clientId && fact.validFrom === old.validFrom && fact.validUntil === old.validUntil);
    if (!replacement) throw new Error('Replay does not establish the correction scope.');
    Object.assign(old, { status: 'SUPERSEDED', supersededBy: replacement.id, revision: old.revision + 1 });
  }
  fixture.facts.push(...structuredClone(corrections));
  fixture.writes.push(...structuredClone(corrections));
  fixture.teach = async () => { fixture.outcomes.push({ ...conversation, replayed: true }); return conversation.answer; };
}
let failure = null;
try { await runWithAiContext({ actorId: 'memory-director', module: 'bria', route: 'MAINTENANCE FICTIONAL PERSISTENT MEMORY' }, () => runPersistentMemoryScenario(fixture)); }
catch (error) { failure = String(error.message).replaceAll(process.env.OPENAI_API_KEY, '[REDACTADO]'); }
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify({ fictional: true, scenario: 'persistent-memory', model, effort, pass: !failure, failure,
  replayedConversation: replayPath ? path.basename(replayPath) : null,
  budget: { maxUsd: Number(process.env.BRIA_EVAL_MAX_USD), committedUsd: budget.committedUsd() }, outcomes: fixture.outcomes,
  requests: fixture.requests, reads: fixture.reads, memoryWrites: fixture.writes, operationalWrites: fixture.operationalWrites, usage }, null, 2));
console.log(JSON.stringify({ pass: !failure, failure, calls: usage.length, committedUsd: budget.committedUsd(), phases: fixture.outcomes.length }));
process.exitCode = failure ? 1 : 0;
