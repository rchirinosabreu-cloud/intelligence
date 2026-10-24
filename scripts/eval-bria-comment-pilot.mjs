// Proveedor real, conversación y herramientas reales, datos/API/almacenamiento completamente ficticios.
// Requiere OPENAI_API_KEY inyectada y BRIA_EVAL_OUTPUT; no abre .env ni recibe conexión a la plataforma.
// node scripts/eval-bria-comment-pilot.mjs --repeticiones 2
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCaseEvalConfig, createCaseEvalProvider } from './lib/briaResearchRuntime.js';
import { createCommentPilotFixture, assertCommentDraft, assertCommentPublished, COMMENT_PILOT_REQUEST, COMMENT_PILOT_CORRECTION, COMMENT_PILOT_TEXT } from '../tests/evals/briaCommentPilotFixture.js';
import { runWithAiContext } from '../src/lib/aiRequestContext.js';
import { actionStage } from '../src/lib/briaActions.js';

const output = process.env.BRIA_EVAL_OUTPUT;
if (!output) throw new Error('Indica BRIA_EVAL_OUTPUT para conservar la evidencia.');
if (process.env.DATABASE_URL || process.env.DIRECT_URL) throw new Error('La evaluación ficticia no admite conexiones de base de datos.');
const config = await loadCaseEvalConfig({ load: async () => { throw new Error('Inyecta la credencial del modelo; esta evaluación no abre archivos de entorno.'); } });
if (!config.OPENAI_API_KEY) throw new Error('Falta la credencial del modelo.');
const { AI_MODELS } = await import('../src/config/aiConfig.js');
const usage = [], results = [];
const ai = await createCaseEvalProvider({ apiKey: config.OPENAI_API_KEY, models: AI_MODELS, usage, fetchImpl: (url, init) => {
  const target = new URL(url);
  if (target.origin !== 'https://api.openai.com' || target.pathname !== '/v1/responses') throw new Error('La evaluación solo permite contactar al proveedor del modelo.');
  return fetch(url, init);
} });
const index = process.argv.indexOf('--repeticiones');
const repetitions = index < 0 ? 1 : Number(process.argv[index + 1]);
if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 10) throw new Error('Usa entre 1 y 10 repeticiones.');
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
const createdAt = new Date().toISOString();
const save = () => writeFile(output, JSON.stringify({ fictional: true, createdAt, model: AI_MODELS.chat, results, usage }, null, 2));
const scenarios = [
  { id: 'dos-homonimas-corregir-confirmar-una-vez', historical: true, steps: f => [
    [COMMENT_PILOT_REQUEST, f.photos, answer => { assertCommentDraft(answer, f); assert.equal(f.uploadedIds.length, 2); assert.equal(new Set(f.uploadedIds).size, 2); }],
    [COMMENT_PILOT_CORRECTION, [], answer => assertCommentDraft(answer, f, { content: COMMENT_PILOT_TEXT })],
    ['Confirmar', [], answer => assertCommentPublished(answer, f)],
    ['Confirmar', [], answer => assertCommentPublished(answer, f)]
  ] },
  { id: 'dos-imagenes-cancelar', steps: f => [
    [COMMENT_PILOT_REQUEST, f.photos, answer => { assertCommentDraft(answer, f); assert.equal(f.uploadedIds.length, 2); }],
    ['Cancelar', [], answer => { assert.equal(answer.pendingAction?.status, 'CANCELLED'); assert.equal(f.writes.length, 0); }]
  ] },
  { id: 'homonimas-historicas-preguntar-y-elegir-natural', historical: true, steps: f => [
    ['Agrégale a ese pendiente el archivo «captura-piloto.png» de los que envié antes, con el comentario «Captura histórica seleccionada». Muéstrame el resumen antes de publicar.', [], answer => {
      assert.equal(f.writes.length, 0);
      assert.notEqual(actionStage(answer.pendingAction), 'READY', 'la ambigüedad debe resolverse antes de ofrecer una operación lista para confirmar');
      assert.equal((answer.pendingAction?.payload?.files || []).length, 0, 'un nombre histórico ambiguo no puede elegir una imagen');
      assert.match(answer.text, /cu[aá]l|elige|elegir|dos|varias|mismo nombre|identificador/i, 'debe explicar que necesita distinguir el archivo');
      for (const file of f.previousFiles) assert.ok(!answer.text.includes(file.id), 'la elección humana no debe exigir identificadores internos');
    }],
    ['Usa la imagen de color coral. Mantén el comentario «Captura histórica seleccionada». Solo prepara el resumen.', [], answer => assertCommentDraft(answer, f, { content: 'Captura histórica seleccionada', ids: [f.previousFiles[1].id] })],
    ['Cancelar', [], answer => { assert.equal(answer.pendingAction?.status, 'CANCELLED'); assert.equal(f.writes.length, 0); }]
  ] }
];
for (let repeat = 1; repeat <= repetitions; repeat++) {
  for (const scenario of scenarios) {
    const fixture = await createCommentPilotFixture({ ai, historical: scenario.historical });
    const entry = { case: scenario.id, repeat, pass: true, turns: [], failures: [] };
    let actionId;
    try {
      for (const [input, files, check] of scenario.steps(fixture)) {
        const question = typeof input === 'function' ? input(fixture) : input;
        const answer = await runWithAiContext({ actorId: fixture.user.id, module: 'bria', route: 'MAINTENANCE FICTIONAL COMMENT PILOT' }, () => fixture.send(question, files));
        entry.turns.push({ question, uploadedNames: files.map(file => file.originalname), answer: answer.text, pendingAction: answer.pendingAction, toolsUsed: answer.toolsUsed, writeCount: fixture.writes.length });
        if (answer.pendingAction?.type === 'PLATFORM') {
          actionId ??= answer.pendingAction.id;
          assert.equal(answer.pendingAction.id, actionId, 'la corrección conserva la acción revisada');
        }
        check(answer);
      }
    } catch (error) {
      entry.pass = false;
      entry.failures.push(String(error.message).replaceAll(config.OPENAI_API_KEY, '[REDACTADO]'));
    }
    entry.calls = fixture.calls;
    entry.writes = fixture.writes.map(write => ({ ...write, files: write.files.map(({ buffer, ...file }) => ({ ...file, size: buffer.length, sha256: createHash('sha256').update(buffer).digest('hex') })) }));
    results.push(entry);
    await save();
    console.log(`${entry.pass ? 'OK' : 'FALLA'} ${entry.case} #${repeat}: ${entry.turns.length} turnos${entry.failures.length ? ` — ${entry.failures.join('; ')}` : ''}`);
  }
}
console.log(`${results.filter(result => result.pass).length}/${results.length} recorridos aprobados.`);
process.exitCode = results.every(result => result.pass) ? 0 : 1;
