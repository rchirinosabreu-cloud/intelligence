import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createOpenAIClient } from '../src/services/openAIClient.js';
import { discoveryEvaluationCases, evaluateCriterionDiscovery } from '../src/evals/briaCriterionDiscoveryEvaluation.js';

// Fixed synthetic dataset, five calls maximum. Never imports Prisma or loads .env itself.
if (!process.argv.includes('--live')) {
  console.log(JSON.stringify({ mode: 'VALIDATE_ONLY', calls: 0, plannedCalls: 5, cases: discoveryEvaluationCases.map(c => c.id) }));
} else {
  if (!process.env.OPENAI_API_KEY) throw new Error('Se requiere OPENAI_API_KEY explícita para --live.');
  const ai = createOpenAIClient({ requestTimeoutMs: 45000 });
  const result = await evaluateCriterionDiscovery({ generate: request => ai.generate(request) });
  const directory = new URL('../output/bria-evals/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const report = new URL(`discovery-${randomUUID()}.json`, directory);
  await writeFile(report, JSON.stringify(result, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ report: report.pathname, humanValidated: false, runs: result.runs.map(({ proposals, usage, ...run }) => ({ ...run, proposals: proposals?.length || 0, tokens: usage?.total_tokens })) }, null, 2));
  if (result.runs.some(r => !r.contractValid || !r.expectationMet)) process.exitCode = 1;
}
