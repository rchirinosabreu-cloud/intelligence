// Una sola conversación, proveedor real; servicios de producción con identidad y persistencia ficticias.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCaseEvalProvider } from './lib/briaResearchRuntime.js';
import { createTaskLifecycleFixture, runTaskLifecycleScenario, historicalTaskFiles, runHistoricalTaskFilesScenario } from '../tests/evals/briaTaskLifecycleFixture.js';
import { runWithAiContext } from '../src/lib/aiRequestContext.js';
import { createInvestigationFixture, runInvestigationScenario } from '../tests/evals/briaInvestigationFixture.js';
import { createFullInquiryFixture, runFullInquiryScenario } from '../tests/evals/briaFullInquiryFixture.js';

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
const evaluatedAi = { generate: async request => {
  if (stopped) throw new Error('Proveedor detenido tras el primer fallo; no se reintenta.');
  try { return await provider.generate(request); } catch (error) { stopped = true; throw error; }
} };
const fixture = fullInquiry ? createFullInquiryFixture(evaluatedAi) : investigation ? createInvestigationFixture(evaluatedAi) : createTaskLifecycleFixture(evaluatedAi, { historicalFiles: historical ? historicalTaskFiles : [] });
let failure = null;
try { await runWithAiContext({ actorId: 'lifecycle-user', module: 'bria', route: 'MAINTENANCE FICTIONAL TASK LIFECYCLE' }, () => (fullInquiry ? runFullInquiryScenario : investigation ? runInvestigationScenario : historical ? runHistoricalTaskFilesScenario : runTaskLifecycleScenario)(fixture)); }
catch (error) { failure = String(error.message).replaceAll(apiKey, '[REDACTADO]'); }
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
await writeFile(output, JSON.stringify({ fictional: true, scenario: fullInquiry ? 'full-inquiry' : investigation ? 'investigation' : historical ? 'historical' : 'lifecycle', model, effort, pass: !failure, failure, limits: {
  calls: Number(process.env.BRIA_EVAL_MAX_CALLS), inputBytes: Number(process.env.BRIA_EVAL_MAX_INPUT_BYTES), outputTokens: Number(process.env.BRIA_EVAL_MAX_OUTPUT_TOKENS)
}, turns: fixture.traces, modelRequests: fixture.modelRequests, created: fixture.created, reads: fixture.reads, writes: fixture.writes, usage }, null, 2));
console.log(failure ? `FALLA: ${failure}` : `OK: recorrido ${investigation || fullInquiry ? 'de investigación y seguimiento sin ejecutar cambios' : 'de hora, archivos, corrección, aprobación y cierre'}.`);
console.log(`Llamadas registradas: ${usage.length}. No se repetirá el recorrido.`);
process.exitCode = failure ? 1 : 0;
