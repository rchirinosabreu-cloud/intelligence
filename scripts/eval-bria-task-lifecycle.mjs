// Una sola conversación, proveedor real; servicios de producción con identidad y persistencia ficticias.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createCaseEvalProvider } from './lib/briaResearchRuntime.js';
import { createTaskLifecycleFixture, runTaskLifecycleScenario, historicalTaskFiles, runHistoricalTaskFilesScenario, runConversationalTaskScenario } from '../tests/evals/briaTaskLifecycleFixture.js';
import { runWithAiContext } from '../src/lib/aiRequestContext.js';
import { createInvestigationFixture, runInvestigationScenario } from '../tests/evals/briaInvestigationFixture.js';
import { createFullInquiryFixture, runFullInquiryScenario, runAgencyOverviewScenario } from '../tests/evals/briaFullInquiryFixture.js';
import { createDecisionContextFixture, runDecisionContextScenario } from '../tests/evals/briaDecisionContextFixture.js';

if (process.env.DATABASE_URL || process.env.DIRECT_URL) throw new Error('Esta evaluación no admite base de datos.');
const { OPENAI_API_KEY: apiKey, BRIA_CHAT_MODEL: model, BRIA_CHAT_REASONING_EFFORT: effort, BRIA_EVAL_OUTPUT: output } = process.env;
if (!apiKey || !output || !model || !effort) throw new Error('Inyecta credencial, configuración efectiva del chat y ruta de informe.');
const usage = [];
let stopped = false;
const provider = await createCaseEvalProvider({ apiKey, models: { chat: model }, usage, fetchImpl: (url, init) => {
  if (String(url) !== 'https://api.openai.com/v1/responses') throw new Error('Solo se permite el proveedor; sin plataforma ni otros servicios.');
  if (JSON.parse(init.body).reasoning?.effort !== effort) throw new Error('El razonamiento no coincide con la configuración de producción.');
  return fetch(url, init);
} });
// El runtime real puede intentar recuperarse de un 429/5xx: esta evaluación cierra el proveedor
// al primer error, para que ningún reintento vuelva a la red ni consuma presupuesto.
const historical = process.env.BRIA_EVAL_SCENARIO === 'historical';
const investigation = process.env.BRIA_EVAL_SCENARIO === 'investigation';
const fullInquiry = process.env.BRIA_EVAL_SCENARIO === 'full-inquiry';
const overview = process.env.BRIA_EVAL_SCENARIO === 'agency-overview';
const decisionContext = process.env.BRIA_EVAL_SCENARIO === 'decision-context';
const conversational = process.env.BRIA_EVAL_SCENARIO === 'conversational';
const evaluatedAi = { generate: async request => {
  if (stopped) throw new Error('Proveedor detenido tras el primer fallo; no se reintenta.');
  try { return await provider.generate(request); } catch (error) { stopped = true; throw error; }
} };
const resumedFrom = process.env.BRIA_EVAL_RESUME_REPORT || null;
let first = null, initialTurns = [], savedTurns = [], initialCreated = [];
if (resumedFrom) {
  const prior = JSON.parse(await readFile(resumedFrom, 'utf8'));
  if (prior.fictional !== true || prior.model !== model || prior.effort !== effort) throw new Error('Solo se puede retomar una evaluación ficticia con la misma configuración.');
  if (conversational && prior.scenario === 'conversational' && ([2, 3].includes(prior.turns.length) && prior.turns.every(turn => turn.writes === 0) || prior.turns.length === 5 && prior.created?.length === 1 && prior.turns.at(-1).answer.pendingAction?.status === 'DONE')) {
    savedTurns = prior.turns;
    initialCreated = prior.created || [];
    initialTurns = savedTurns.flatMap(turn => [{ role: 'user', text: turn.question }, turn.answer]);
  } else if (fullInquiry && prior.scenario === 'full-inquiry' && prior.turns.length === 1 && prior.turns[0].answer.investigation) {
    first = prior.turns[0].answer;
    initialTurns = [{ role: 'user', text: prior.turns[0].question }, first];
  } else throw new Error('El informe no contiene un punto de continuación compatible.');
}
const fixture = decisionContext ? createDecisionContextFixture(evaluatedAi) : fullInquiry || overview ? createFullInquiryFixture(evaluatedAi, { initialTurns, overview }) : investigation ? createInvestigationFixture(evaluatedAi) : createTaskLifecycleFixture(evaluatedAi, { initialTurns, initialCreated, historicalFiles: historical ? historicalTaskFiles : [] });
fixture.traces.push(...savedTurns);
let failure = null;
try { await runWithAiContext({ actorId: 'lifecycle-user', module: 'bria', route: 'MAINTENANCE FICTIONAL TASK LIFECYCLE' }, () => (conversational ? runConversationalTaskScenario : decisionContext ? runDecisionContextScenario : overview ? runAgencyOverviewScenario : fullInquiry ? runFullInquiryScenario : investigation ? runInvestigationScenario : historical ? runHistoricalTaskFilesScenario : runTaskLifecycleScenario)(fixture, { first, savedTurns })); }
catch (error) { failure = String(error.message).replaceAll(apiKey, '[REDACTADO]'); }
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify({ fictional: true, scenario: conversational ? 'conversational' : decisionContext ? 'decision-context' : overview ? 'agency-overview' : fullInquiry ? 'full-inquiry' : investigation ? 'investigation' : historical ? 'historical' : 'lifecycle', resumedFrom, model, effort, pass: !failure, failure, limits: {
  calls: Number(process.env.BRIA_EVAL_MAX_CALLS), inputBytes: Number(process.env.BRIA_EVAL_MAX_INPUT_BYTES), outputTokens: Number(process.env.BRIA_EVAL_MAX_OUTPUT_TOKENS)
}, turns: fixture.traces, modelRequests: fixture.modelRequests, created: fixture.created, reads: fixture.reads, writes: fixture.writes, usage }, null, 2));
console.log(failure ? `FALLA: ${failure}` : decisionContext ? 'OK: contexto por cuenta antes de priorizar; revisar también la calidad del criterio en el informe.' : overview ? 'OK: panorama general sin crear un seguimiento ni preparar cambios.' : `OK: recorrido ${investigation || fullInquiry ? 'de investigación y seguimiento sin ejecutar cambios' : 'de hora, archivos, corrección, aprobación y cierre'}.`);
console.log(`Llamadas registradas: ${usage.length}. No se repetirá el recorrido.`);
process.exitCode = failure ? 1 : 0;
