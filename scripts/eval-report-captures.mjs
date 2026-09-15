import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parse as parseEnv } from 'dotenv';

const MATCH_FIELDS = ['key', 'label', 'value', 'platform', 'scope', 'unit', 'precision', 'changePct', 'contextKey', 'entityLevel', 'entityName', 'resultType'];
export const evaluateObservationReferences = (observations = [], references = []) => references.map(expected => {
  const candidates = observations.filter(item => item.key === expected.key);
  const matched = candidates.find(item => MATCH_FIELDS.every(key => !Object.hasOwn(expected, key)
    || (typeof expected[key] === 'number' ? typeof item[key] === 'number' && Math.abs(item[key] - expected[key]) < 0.000001 : item[key] === expected[key])));
  return {
    expected, status: matched ? 'MATCH' : candidates.length ? 'MISMATCH' : 'MISSING',
    valueMatch: candidates.some(item => item.value === expected.value), semanticMatch: Boolean(matched),
    observationId: matched?.observationId || null,
    candidates: matched ? [] : candidates.map(item => Object.fromEntries(MATCH_FIELDS.filter(key => item[key] !== undefined).map(key => [key, item[key]])))
  };
});

export const validateBatchFiles = (manifest) => {
  const files = Array.isArray(manifest) ? manifest : manifest?.files;
  if (!Array.isArray(files) || files.length < 1 || files.length > 14) throw new Error('El lote debe contener entre 1 y 14 imágenes; máximo 14 llamadas.');
  const ids = new Set();
  for (const file of files) {
    if (!file?.id || !/^[a-zA-Z0-9_-]+$/.test(file.id) || ids.has(file.id)) throw new Error('ID inválido o duplicado en el lote.');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.mimeType) || !file.localPath) throw new Error('Cada entrada debe ser una imagen local compatible.');
    ids.add(file.id);
  }
  return files;
};

// Reference files remain local; no client data is bundled with this evaluator.
export const validateReferenceMap = (references) => {
  if (!references || typeof references !== 'object' || Array.isArray(references)) throw new Error('Las referencias deben ser un objeto por ID de fuente.');
  for (const [sourceId, rows] of Object.entries(references)) {
    if (!/^[a-zA-Z0-9_-]+$/.test(sourceId) || !Array.isArray(rows)
      || rows.some(row => !row || typeof row !== 'object' || Array.isArray(row) || typeof row.key !== 'string' || !row.key.trim())) {
      throw new Error('Cada referencia requiere un ID válido y una lista de métricas con key.');
    }
  }
  return references;
};

const cliArgs = (argv) => {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (key === '--dry-run') { args.dryRun = true; continue; }
    if (!['--manifest', '--out', '--references', '--concurrency', '--period-start', '--period-end'].includes(key) || !argv[i + 1]) throw new Error('Argumentos inválidos. Usa --manifest archivo.json --out carpeta --concurrency 2 [--references referencias-locales.json] [--dry-run].');
    args[key.slice(2)] = argv[++i];
  }
  if (!args.manifest || !args.out) throw new Error('Se requieren --manifest y --out.');
  args.concurrency = Number(args.concurrency || 2);
  if (![1, 2].includes(args.concurrency)) throw new Error('La concurrencia permitida es 1 o 2.');
  return args;
};

async function loadAPIEnvironment() {
  // Select only API settings: never load DATABASE_URL or initialize persistence.
  const contents = await fs.readFile('.env', 'utf8').catch(error => error.code === 'ENOENT' ? '' : Promise.reject(error));
  const local = parseEnv(contents);
  for (const key of ['OPENAI_API_KEY', 'OPENAI_MODEL', 'OPENAI_MODEL_VISION', 'OPENAI_MODEL_REPORT_VISION']) {
    if (!process.env[key] && local[key]) process.env[key] = local[key];
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = cliArgs(argv);
  const files = validateBatchFiles(JSON.parse(await fs.readFile(args.manifest, 'utf8')));
  const references = args.references ? validateReferenceMap(JSON.parse(await fs.readFile(args.references, 'utf8'))) : {};
  for (const file of files) {
    const stats = await fs.stat(file.localPath);
    if (!stats.isFile()) throw new Error('La imagen no es un archivo: ' + file.id);
  }
  const reportPeriod = { start: args['period-start'] || null, end: args['period-end'] || null };
  if (args.dryRun) {
    console.log(JSON.stringify({ dryRun: true, files: files.length, maximumCalls: files.length, concurrency: args.concurrency, clients: [...new Set(files.map(file => file.client))], reportPeriod,
      referenceSources: files.filter(file => references[file.id]?.length).length,
      checkpoints: files.reduce((sum, file) => sum + (references[file.id]?.length || 0), 0) }));
    return;
  }
  await loadAPIEnvironment();
  if (!process.env.OPENAI_API_KEY) throw new Error('Falta OPENAI_API_KEY.');
  await fs.mkdir(args.out, { recursive: true });
  // Refuse accidental repeated paid runs into an existing output folder.
  for (const file of files) {
    if (await fs.access(path.join(args.out, file.id + '.json')).then(() => true, () => false)) throw new Error('La salida ya contiene esta captura: ' + file.id + '. Usa otra carpeta para una evaluación nueva.');
  }
  const { extractMetricsWithOpenAI, validateAndCleanSourceExtraction } = await import('../src/services/reportVisionService.js');
  const { buildEvidenceReport } = await import('../src/lib/reportEvidence.js');
  const extractorSource = await fs.readFile(new URL('../src/services/reportVisionService.js', import.meta.url), 'utf8');
  const extractorHash = createHash('sha256').update(extractorSource).digest('hex');
  await fs.writeFile(path.join(args.out, 'extractor-source.snapshot.js'), extractorSource);
  const results = new Array(files.length);
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const index = next++;
      const file = files[index];
      const started = Date.now();
      let result;
      try {
        // One request per image, with no automatic retry or narrative request.
        const extracted = await extractMetricsWithOpenAI(await fs.readFile(file.localPath), file.mimeType, {
          sourceId: file.id, clientName: file.client, reportPeriod
        });
        const cleaned = validateAndCleanSourceExtraction(extracted, { sourceId: file.id, reportPeriod });
        result = {
          sourceId: file.id, client: file.client, title: file.title, sourceUrl: file.url,
          status: 'EXTRACTED', durationMs: Date.now() - started, extractorHash, extracted, cleaned,
          referenceChecks: evaluateObservationReferences(cleaned.observations, references[file.id] || [])
        };
      } catch (error) {
        const safeMessage = String(error?.message || error).split(process.env.OPENAI_API_KEY).join('[REDACTED]');
        result = { sourceId: file.id, client: file.client, title: file.title, status: 'FAILED', durationMs: Date.now() - started, error: safeMessage };
      }
      results[index] = result;
      await fs.writeFile(path.join(args.out, file.id + '.json'), JSON.stringify(result, null, 2));
      console.log(JSON.stringify({ completed: results.filter(Boolean).length, total: files.length, sourceId: file.id, client: file.client, status: result.status, checks: result.referenceChecks?.map(item => item.status) || [] }));
    }
  };
  await Promise.all(Array.from({ length: args.concurrency }, worker));
  const clients = [...new Set(files.map(file => file.client))].map(client => ({
    client, evidenceReport: buildEvidenceReport(results.filter(result => result.client === client && result.cleaned).map(result => ({ ...result.cleaned, sourceId: result.sourceId })), { reportPeriod })
  }));
  const checks = results.flatMap(result => result.referenceChecks || []);
  const usages = results.map(result => result.extracted?.extractionMetadata?.usage).filter(Boolean);
  const knownTokens = key => usages.some(usage => usage[key] !== null) ? usages.reduce((sum, usage) => sum + (usage[key] || 0), 0) : null;
  const summary = {
    scope: 'Real vision extraction, local files only. No production DB, narrative generation or publication.',
    referenceStatus: args.references ? 'LOCAL_REFERENCES; selected checkpoints, not complete accuracy certification' : 'NOT_PROVIDED; no accuracy checkpoints evaluated',
    reportPeriod, extractorHash, model: results.find(result => result.extracted?.extractionMetadata?.model)?.extracted.extractionMetadata.model || process.env.OPENAI_MODEL_REPORT_VISION || process.env.OPENAI_MODEL_VISION || process.env.OPENAI_MODEL || null,
    usage: { responsesWithUsage: usages.length, inputTokensKnown: knownTokens('inputTokens'), outputTokensKnown: knownTokens('outputTokens'), totalTokensKnown: knownTokens('totalTokens'), cachedInputTokensKnown: knownTokens('cachedInputTokens') },
    requested: files.length, extracted: results.filter(result => result.status === 'EXTRACTED').length,
    failed: results.filter(result => result.status === 'FAILED').length,
    checkpoints: { total: checks.length, valuesMatched: checks.filter(check => check.valueMatch).length, matched: checks.filter(check => check.status === 'MATCH').length, mismatched: checks.filter(check => check.status === 'MISMATCH').length, missing: checks.filter(check => check.status === 'MISSING').length },
    clients
  };
  await fs.writeFile(path.join(args.out, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify({ complete: true, extracted: summary.extracted, failed: summary.failed, checkpoints: summary.checkpoints }));
  if (summary.failed || summary.checkpoints.mismatched || summary.checkpoints.missing) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
