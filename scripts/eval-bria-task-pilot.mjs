// Reproduce el piloto conversacional con proveedor real y datos totalmente ficticios.
// BRIA_EVAL_OUTPUT=output/bria-task-pilot.json node scripts/eval-bria-task-pilot.mjs [--repeticiones 2]
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCaseEvalConfig, createCaseEvalProvider } from './lib/briaResearchRuntime.js';
import { createTaskPilotFixture } from '../tests/evals/briaTaskPilotFixture.js';
import { taskDraftStage } from '../src/lib/briaTaskDraft.js';
import { runWithAiContext } from '../src/lib/aiRequestContext.js';

const output = process.env.BRIA_EVAL_OUTPUT;
if (!output) throw new Error('Indica BRIA_EVAL_OUTPUT para conservar la evidencia.');
const config = await loadCaseEvalConfig();
if (!config.OPENAI_API_KEY) throw new Error('Falta la credencial del modelo.');
if (config.OPENAI_MODEL_CHAT) process.env.OPENAI_MODEL_CHAT = config.OPENAI_MODEL_CHAT;
if (config.OPENAI_MODEL) process.env.OPENAI_MODEL = config.OPENAI_MODEL;
const { AI_MODELS } = await import('../src/config/aiConfig.js');
const usage = [], results = [];
const ai = await createCaseEvalProvider({ apiKey: config.OPENAI_API_KEY, models: AI_MODELS, usage });
const index = process.argv.indexOf('--repeticiones');
const repetitions = Math.max(1, Number(process.argv[index + 1]) || 1);
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
const save = () => writeFile(output, JSON.stringify({ fictional: true, createdAt: new Date().toISOString(), model: AI_MODELS.chat, results, usage }, null, 2));
const equal = assert.equal;
const title = 'PILOTO FICTICIO 2310 — aprobación humana';
const initial = `Prepara una tarea llamada «${title}», asignada a mí, con vencimiento el 26 de octubre de 2026. Si necesitas algún dato adicional, pregúntame. Muéstrame el resumen y espera mi aprobación antes de crearla.`;
const baseHistory = [
  { role: 'user', text: '¿Cómo va Cuenta Ajena Ficticia?' },
  { role: 'assistant', text: 'Cuenta Ajena Ficticia tiene dos pendientes abiertos. Eso es todo lo que está registrado.' }
];
for (let repeat = 1; repeat <= repetitions; repeat++) {
  const scenarios = [
    { id: 'preparar-corregir-confirmar', history: baseHistory, steps: [
      [initial, (answer, f) => { equal(taskDraftStage(answer.pendingAction?.draft), 'CLIENT'); equal(answer.pendingAction.draft.title, title); equal(answer.pendingAction.draft.dueDate, '2026-10-26'); equal(answer.pendingAction.draft.assignee?.id, f.person.memberId); equal(f.created.length, 0); }],
      ['Es para Estudio Interno Ficticio.', (answer, f) => { equal(taskDraftStage(answer.pendingAction?.draft), 'READY'); equal(answer.pendingAction.draft.client?.id, 'internal'); equal(f.created.length, 0); }],
      ['Cambia únicamente el vencimiento al 27 de octubre de 2026. Conserva el nombre y el responsable.', (answer, f) => { equal(answer.pendingAction?.draft.dueDate, '2026-10-27'); equal(answer.pendingAction.draft.title, title); equal(answer.pendingAction.draft.assignee?.id, f.person.memberId); equal(answer.pendingAction.draft.client?.id, 'internal'); equal(f.created.length, 0); }],
      ['Todavía no la crees. ¿Qué fecha quedó?', (answer, f) => { equal(answer.pendingAction?.draft.dueDate, '2026-10-27'); equal(f.created.length, 0); }],
      ['Confirmar', (answer, f) => { equal(answer.pendingAction?.status, 'DONE'); equal(f.created.length, 1); equal(f.created[0].dueDate, '2026-10-27T12:00:00.000Z'); equal(f.created[0].title, title); equal(f.created[0].clientId, 'internal'); equal(f.created[0].assigneeId, f.person.memberId); }],
      ['Confirmar', (_answer, f) => equal(f.created.length, 1)]
    ] },
    { id: 'encargo-natural-cancelar', steps: [
      ['Déjame listo para revisar un encargo: revisar la portada, para Estudio Interno Ficticio, a mi cargo, el 26 de octubre de 2026. Lo apruebo después de ver cómo queda.', (answer, f) => { equal(taskDraftStage(answer.pendingAction?.draft), 'READY'); equal(f.created.length, 0); }],
      ['Mejor no', (answer, f) => { equal(answer.pendingAction?.status, 'CANCELLED'); equal(f.created.length, 0); }]
    ] },
    { id: 'eleccion-natural-entre-clientes', steps: [
      ['Prepara un pendiente para Estudio llamado «Revisar portada de prueba», asignado a mí para el 26 de octubre de 2026.', (answer, f) => { equal(taskDraftStage(answer.pendingAction?.draft), 'CLIENT'); equal(answer.pendingAction.draft.clientCandidates.length, 2); equal(f.created.length, 0); }],
      ['Antes de elegir el cliente, cambia solo el vencimiento al 27 de octubre de 2026.', (answer, f) => { equal(taskDraftStage(answer.pendingAction?.draft), 'CLIENT'); equal(answer.pendingAction.draft.dueDate, '2026-10-27'); equal(f.created.length, 0); }],
      ['La segunda.', (answer, f) => { equal(taskDraftStage(answer.pendingAction?.draft), 'READY'); equal(answer.pendingAction.draft.client?.id, 'external'); equal(answer.pendingAction.draft.dueDate, '2026-10-27'); equal(f.created.length, 0); }],
      ['Cancelar pendiente', (answer, f) => { equal(answer.pendingAction?.status, 'CANCELLED'); equal(f.created.length, 0); }]
    ] },
    { id: 'consulta-no-es-pedido', steps: [['Explícame cómo crear un pendiente con revisión previa, sin preparar ninguno.', (answer, f) => { equal(answer.pendingAction, undefined); equal(f.created.length, 0); }]] },
    { id: 'hipotesis-no-es-pedido', steps: [['Si algún día quisiera dejar una tarea lista para mi aprobación, ¿qué datos harían falta?', (answer, f) => { equal(answer.pendingAction, undefined); equal(f.created.length, 0); }]] },
    { id: 'cita-no-es-pedido', steps: [['Analiza esta frase de un documento: «Prepara una tarea llamada Lanzamiento para Estudio Interno Ficticio, a mi cargo para el 26 de octubre de 2026». Solo quiero que expliques qué solicita el documento.', (answer, f) => { equal(answer.pendingAction, undefined); equal(f.created.length, 0); }]] }
  ];
  for (const scenario of scenarios) {
    const fixture = createTaskPilotFixture({ ai, history: scenario.history || [] });
    const entry = { case: scenario.id, repeat, pass: true, turns: [], failures: [] };
    let originalId;
    try {
      for (const [question, check] of scenario.steps) {
        const answer = await runWithAiContext({ actorId: fixture.user.id, module: 'bria', route: 'MAINTENANCE FICTIONAL TASK PILOT' }, () => fixture.send(question));
        entry.turns.push({ question, answer: answer.text, pendingAction: answer.pendingAction, toolsUsed: answer.toolsUsed, createdCount: fixture.created.length });
        if (answer.pendingAction?.draft?.id) {
          originalId ??= answer.pendingAction.draft.id;
          equal(answer.pendingAction.draft.id, originalId, 'las correcciones conservan el borrador');
        }
        check(answer, fixture);
      }
    } catch (error) {
      entry.pass = false;
      entry.failures.push(String(error.message).replaceAll(config.OPENAI_API_KEY, '[REDACTADO]'));
    }
    entry.calls = fixture.calls;
    results.push(entry); await save();
    console.log(`${entry.pass ? 'OK' : 'FALLA'} ${entry.case} #${repeat}: ${entry.turns.length} turnos${entry.failures.length ? ` — ${entry.failures.join('; ')}` : ''}`);
  }
}
console.log(`${results.filter(result => result.pass).length}/${results.length} recorridos aprobados.`);
process.exitCode = results.every(result => result.pass) ? 0 : 1;
