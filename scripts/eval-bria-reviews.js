import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { briaReviewCases } from '../evals/bria/editorial-cases.js';
import { validateBriaEvaluationCases, runBriaReviewEvaluation } from '../src/evals/briaReviewEvaluation.js';
import { createOpenAIClient } from '../src/services/openAIClient.js';
import { buildContentPlanReviewBatches } from '../src/services/briaReviewBatches.js';

export const parseBriaEvalArgs = argv => {
  const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
    live: { type: 'boolean', default: false }, variant: { type: 'string', default: 'candidate' },
    cases: { type: 'string' }, repeats: { type: 'string', default: '1' }, 'max-calls': { type: 'string', default: '40' }
  } });
  const repeats = Number(values.repeats), maxCalls = Number(values['max-calls']);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 5) throw new Error('Las repeticiones deben estar entre 1 y 5.');
  if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > 200) throw new Error('El presupuesto debe estar entre 1 y 200 llamadas.');
  if (!['baseline', 'candidate'].includes(values.variant)) throw new Error('Variante desconocida.');
  const requested = values.cases?.split(',');
  if (requested && (new Set(requested).size !== requested.length || requested.some(id => !briaReviewCases.some(sample => sample.id === id)))) throw new Error('Selección de casos desconocida o repetida.');
  return { live: values.live, variant: values.variant, repeats, maxCalls, cases: requested ? briaReviewCases.filter(sample => requested.includes(sample.id)) : briaReviewCases };
};

const main = async () => {
  const options = parseBriaEvalArgs(process.argv.slice(2));
  const validation = validateBriaEvaluationCases(options.cases);
  const plannedCalls = options.cases.reduce((n, sample) => n + buildContentPlanReviewBatches(sample.snapshot).length * options.repeats, 0);
  if (plannedCalls > options.maxCalls) throw new Error(`El presupuesto no cubre ${plannedCalls} llamadas.`);
  if (!options.live) {
    console.log(JSON.stringify({ ...validation, mode: 'VALIDATE_ONLY', providerCalls: 0, modelQualityMeasured: false, plannedCalls, variant: options.variant }, null, 2));
    return;
  }
  if (!process.env.OPENAI_API_KEY) throw new Error('Para --live se necesita OPENAI_API_KEY. No se cargan credenciales automáticamente.');
  const result = await runBriaReviewEvaluation({ ...options, ai: createOpenAIClient(), signal: AbortSignal.timeout(20 * 60 * 1000) });
  // Fixed ignored output directory, exclusive creation. No customer data or database writes.
  const outputDirectory = fileURLToPath(new URL('../output/bria-evals/', import.meta.url));
  await mkdir(outputDirectory, { recursive: true });
  const reportPath = path.join(outputDirectory, `${new Date().toISOString().replace(/[:.]/g, '-')}-${options.variant}-${randomUUID()}.json`);
  await writeFile(reportPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ reportPath, variant: result.variant, decision: result.decision, summary: result.summary }, null, 2));
  if (result.summary.failedRuns) process.exitCode = 1;
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error('Evaluación de Bria:', error.response?.data || error.message);
    process.exitCode = 1;
  });
}
