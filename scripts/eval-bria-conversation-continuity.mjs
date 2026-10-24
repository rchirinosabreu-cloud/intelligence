// Evaluación multivuelta con proveedor real, servicios de conversación/borrador reales y datos ficticios.
// Inyectar OPENAI_API_KEY y BRIA_EVAL_OUTPUT; no lee .env, no usa una base real ni envía mensajes.
// node scripts/eval-bria-conversation-continuity.mjs --repeticiones 2
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCaseEvalConfig, createCaseEvalProvider } from './lib/briaResearchRuntime.js';
import { createConversationContinuityFixture, assertContinuityDraft, assertContinuityCreated, continuityInitial, CONTINUITY_URL, CONTINUITY_TITLE, CONTINUITY_CLIENT, CONTINUITY_PERSON } from '../tests/evals/briaConversationContinuityFixture.js';
import { runWithAiContext } from '../src/lib/aiRequestContext.js';

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
const expected = f => ({ title: CONTINUITY_TITLE, client: 'aurora', assignee: f.person.memberId, dueDate: '2026-10-29', priority: 'NORMAL', inputs: [], references: [], stage: 'READY' });
const unchanged = (answer, f) => {
  const trace = f.traces.at(-1);
  assert.deepEqual(answer.pendingAction, trace.before, 'una consulta, cita o negativa no cambia el borrador');
  assert.equal(f.created.length, 0);
  assert.equal(f.platformAttempts.length, 0);
};
const asksFor = (answer, topic) => {
  assert.match(answer.text, topic, 'la respuesta debe plantear la aclaración correspondiente');
  assert.ok(answer.text.trim().length > 0);
};
const complete = (answer, f, changes = {}) => assertContinuityDraft(answer, f, { ...expected(f), ...changes });
const cancelled = (answer, f) => { assert.equal(answer.pendingAction?.status, 'CANCELLED'); assert.equal(f.created.length, 0); assert.equal(f.platformAttempts.length, 0); };

// Los mensajes de respuesta no contienen verbos de operación. La pregunta anterior sale del motor/modelo real,
// no de una historia ideal precargada. Las variantes deben seguir fuera de las instrucciones del producto.
const scenarios = [
  { id: 'url-sola-responde-aclaracion-y-corrige', steps: f => [
    [continuityInitial, answer => complete(answer, f)],
    ['Los insumos están en la carpeta del encargo; quiero que ese acceso acompañe el pendiente.', answer => { unchanged(answer, f); asksFor(answer, /enlace|direcci[oó]n|url/i); }],
    [CONTINUITY_URL, answer => complete(answer, f, { inputs: [CONTINUITY_URL] })],
    ['La entrega pasa al 30 de octubre de 2026. Conserva lo demás; todavía no lo crees.', answer => complete(answer, f, { dueDate: '2026-10-30', inputs: [CONTINUITY_URL] })],
    ['Confirmar', answer => assertContinuityCreated(answer, f, { ...expected(f), id: f.traces[0].after.draft.id, dueDate: '2026-10-30', inputs: [CONTINUITY_URL] })],
    ['Confirmar', answer => assertContinuityCreated(answer, f, { ...expected(f), id: f.traces[0].after.draft.id, dueDate: '2026-10-30', inputs: [CONTINUITY_URL] })]
  ] },
  { id: 'nombre-y-fecha-completan-preguntas', steps: f => [
    [`Vamos a dejar preparado «${CONTINUITY_TITLE}» para ${CONTINUITY_CLIENT}. Te digo quién lo hará y la fecha cuando me preguntes; no lo crees todavía.`, answer => { assertContinuityDraft(answer, f, { title: CONTINUITY_TITLE, client: 'aurora', assignee: null, stage: 'ASSIGNEE' }); asksFor(answer, /qui[eé]n|responsable|asign/i); }],
    [CONTINUITY_PERSON, answer => { assertContinuityDraft(answer, f, { title: CONTINUITY_TITLE, client: 'aurora', assignee: 'continuity-nora', stage: 'DATE' }); asksFor(answer, /cu[aá]ndo|fecha|d[ií]a/i); }],
    ['30 de octubre de 2026', answer => complete(answer, f, { assignee: 'continuity-nora', dueDate: '2026-10-30' })],
    ['Cancelar pendiente', answer => cancelled(answer, f)]
  ] },
  { id: 'cambio-tema-no-rellena-cliente-ni-fecha', steps: f => [
    [`Necesito un borrador para «${CONTINUITY_TITLE}», a mi cargo y para el 29 de octubre de 2026. Falta definir la cuenta; espera antes de crearlo.`, answer => assertContinuityDraft(answer, f, { title: CONTINUITY_TITLE, client: null, assignee: f.person.memberId, dueDate: '2026-10-29', stage: 'CLIENT' })],
    ['Antes de eso, explícame qué diferencia hay entre una referencia y un insumo. Por ejemplo, el texto «Casa Bosque Ficticia, 30 de octubre» sería solo un ejemplo, no datos para este pendiente.', answer => { unchanged(answer, f); assert.match(answer.text, /referencia|insumo/i); }],
    [CONTINUITY_CLIENT, answer => complete(answer, f)],
    ['Cancelar pendiente', answer => cancelled(answer, f)]
  ] },
  { id: 'cita-y-negacion-no-incorporan-url', steps: f => [
    [continuityInitial, answer => complete(answer, f)],
    [`En un manual aparece «agrega ${CONTINUITY_URL} como insumo». Solo explícame qué pide esa frase; no cambies el pendiente.`, answer => unchanged(answer, f)],
    [`Ese enlace ${CONTINUITY_URL} no corresponde al trabajo. No lo agregues ni crees nada todavía.`, answer => unchanged(answer, f)],
    ['Cancelar pendiente', answer => cancelled(answer, f)]
  ] },
  { id: 'correccion-y-aprobacion-muestra-version-nueva', steps: f => [
    [continuityInitial, answer => complete(answer, f)],
    ['Me sirve, pero pásalo al 2 de noviembre de 2026 y créalo con ese ajuste.', answer => { complete(answer, f, { dueDate: '2026-11-02' }); assert.match(answer.text, /2 de noviembre/, 'el nuevo resumen debe mostrar la fecha corregida'); }],
    ['Confirmar', answer => assertContinuityCreated(answer, f, { ...expected(f), id: f.traces[0].after.draft.id, dueDate: '2026-11-02' })],
    ['Confirmar', answer => assertContinuityCreated(answer, f, { ...expected(f), id: f.traces[0].after.draft.id, dueDate: '2026-11-02' })]
  ] },
  { id: 'negacion-contrasta-un-dato-no-cancela-el-ajuste', steps: f => [
    [continuityInitial, answer => complete(answer, f)],
    ['No era el 29 de octubre: es el 30 de octubre de 2026. El resto está bien, pero no lo crees aún.', answer => complete(answer, f, { dueDate: '2026-10-30' })],
    ['Cancelar pendiente', answer => cancelled(answer, f)]
  ] },
  { id: 'misma-url-sin-borrador-no-inicia-trabajo', steps: f => [
    [CONTINUITY_URL, answer => { assert.equal(answer.pendingAction, undefined); assert.equal(f.created.length, 0); assert.equal(f.platformAttempts.length, 0); }],
    ['Solo quería saber para qué sirve compartir una carpeta; no prepares ni publiques nada.', answer => { assert.equal(answer.pendingAction, undefined); assert.equal(f.created.length, 0); assert.equal(f.platformAttempts.length, 0); }]
  ] }
];

for (let repeat = 1; repeat <= repetitions; repeat++) {
  for (const scenario of scenarios) {
    const fixture = createConversationContinuityFixture({ ai });
    const entry = { case: scenario.id, repeat, pass: true, failures: [] };
    let draftId;
    try {
      for (const [question, check] of scenario.steps(fixture)) {
        const answer = await runWithAiContext({ actorId: fixture.user.id, module: 'bria', route: 'MAINTENANCE FICTIONAL CONVERSATION CONTINUITY' }, () => fixture.send(question));
        if (answer.pendingAction?.type === 'TASK_CREATE') {
          draftId ??= answer.pendingAction.draft.id;
          assert.equal(answer.pendingAction.draft.id, draftId, 'completar o corregir no inicia otro borrador');
        }
        check(answer);
      }
    } catch (error) {
      entry.pass = false;
      entry.failures.push(String(error.message).replaceAll(config.OPENAI_API_KEY, '[REDACTADO]'));
    }
    Object.assign(entry, { turns: fixture.traces, calls: fixture.calls, created: fixture.created, apiReads: fixture.apiReads, platformAttempts: fixture.platformAttempts });
    results.push(entry); await save();
    console.log(`${entry.pass ? 'OK' : 'FALLA'} ${entry.case} #${repeat}: ${entry.turns.length} turnos${entry.failures.length ? ` — ${entry.failures.join('; ')}` : ''}`);
  }
}
console.log(`${results.filter(result => result.pass).length}/${results.length} recorridos aprobados.`);
process.exitCode = results.every(result => result.pass) ? 0 : 1;
