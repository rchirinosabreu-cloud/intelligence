// Proveedor real y servicios reales de conversación/borrador; identidad, API y persistencia ficticias.
// No lee .env ni admite base de datos. Evalúa efectos, fuentes consultadas y ausencia de ejecución prematura.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadCaseEvalConfig, createCaseEvalProvider } from './lib/briaResearchRuntime.js';
import { createConversationContinuityFixture, CONTINUITY_CLIENT } from '../tests/evals/briaConversationContinuityFixture.js';
import { briaAssistantTools } from '../src/services/briaAssistantTools.js';
import { calculateMemberStatus } from '../src/services/activityStatusService.js';
import { taskDraftStage } from '../src/lib/briaTaskDraft.js';
import { runWithAiContext } from '../src/lib/aiRequestContext.js';

const repeatIndex = process.argv.indexOf('--repeticiones');
const repetitions = repeatIndex < 0 ? 1 : Number(process.argv[repeatIndex + 1]);
if (!Number.isSafeInteger(repetitions) || repetitions < 1 || repetitions > 5) throw new Error('Usa entre 1 y 5 repeticiones.');
if (process.env.DATABASE_URL || process.env.DIRECT_URL) throw new Error('No admite base de datos.');
const output = process.env.BRIA_EVAL_OUTPUT;
if (!output) throw new Error('Falta BRIA_EVAL_OUTPUT.');
const config = await loadCaseEvalConfig({ load: async () => { throw new Error('Inyecta solo credencial y modelo.'); } });
const { AI_MODELS } = await import('../src/config/aiConfig.js');
const usage = [], results = [];
const ai = await createCaseEvalProvider({ apiKey: config.OPENAI_API_KEY, models: AI_MODELS, usage, fetchImpl: (url, init) => {
  if (String(url) !== 'https://api.openai.com/v1/responses') throw new Error('Solo proveedor real; sin otras salidas.');
  return fetch(url, init);
} });
const instant = new Date('2026-10-26T15:30:00Z');
const participant = { id: 'continuity-nora', name: 'Nora Sáenz', nativeTasks: [] };
const meeting = { id: 'meeting-fictional', title: 'Revisión de bocetos', type: 'MEETING', memberIds: [participant.id], startAt: '2026-10-26T15:00:00Z', endAt: '2026-10-26T16:00:00Z', recurrence: 'NONE' };
const prepareText = `Prepara «Ensayo de plataforma» para ${CONTINUITY_CLIENT}, a mi cargo para el 29 de octubre de 2026. Es un proyecto especial y Nora Sáenz colabora conmigo. El comentario debe decir exactamente «@Nora Sáenz revisa la propuesta». Espera mi aprobación.`;
const checkDraft = (answer, f, { special = true, collaborators = ['continuity-nora'], date = '2026-10-29' } = {}) => {
  assert.equal(answer.pendingAction?.type, 'TASK_CREATE');
  const d = answer.pendingAction.draft;
  assert.equal(taskDraftStage(d), 'READY');
  assert.equal(d.isSpecial, special);
  assert.deepEqual(d.collaborators.map(m => m.id), collaborators);
  assert.equal(d.dueDate, date);
  assert.equal(d.context, '@Nora Sáenz revisa la propuesta');
  assert.equal(f.created.length, 0);
  assert.equal(f.platformAttempts.length, 0);
  return d;
};
const scenarios = [
  { id: 'funciones-comentario-correccion-y-aprobacion', steps: f => [
    [prepareText, a => checkDraft(a, f)],
    ['La fecha será el 30 de octubre. Conserva todo lo demás y créala.', a => checkDraft(a, f, { date: '2026-10-30' })],
    ['Confirmar', () => { assert.equal(f.created.length, 1); const row = f.created[0]; assert.equal(row.isSpecial, true); assert.deepEqual(row.collaboratorIds, ['continuity-nora']); assert.deepEqual(row.initial_comments, [{ content: '@Nora Sáenz revisa la propuesta' }]); assert.equal(row.dueDate, '2026-10-30T12:00:00.000Z'); }],
    ['Confirmar', () => assert.equal(f.created.length, 1)]
  ] },
  { id: 'retirar-efectos-sin-borrar-comentario', steps: f => [
    [prepareText, a => checkDraft(a, f)],
    ['Déjala como una tarea corriente, sin la estrella, y la haré sola. Mantén el comentario, la cuenta y la fecha. Todavía no la crees.', a => checkDraft(a, f, { special: false, collaborators: [] })],
    ['Cancelar pendiente', a => { assert.equal(a.pendingAction.status, 'CANCELLED'); assert.equal(f.created.length, 0); }]
  ] },
  { id: 'campo-no-soportado-no-se-oculta-en-comentario', steps: f => [
    [`Prepara «Acceso limitado» para ${CONTINUITY_CLIENT}, a mi cargo para el 29 de octubre. Debe ser privada y visible solo para mí. No la crees todavía.`, a => { assert.equal(f.created.length, 0); assert.equal(f.platformAttempts.length, 0); assert.equal(taskDraftStage(a.pendingAction?.draft), 'UNRESOLVED'); assert.ok(a.pendingAction.draft.unresolved?.length); }],
    ['Cambia únicamente la fecha al 30 de octubre.', a => { assert.equal(taskDraftStage(a.pendingAction?.draft), 'UNRESOLVED'); assert.equal(f.created.length, 0); }],
    ['Confirmar', () => assert.equal(f.created.length, 0, 'no puede ejecutar un pedido incompleto')]
  ] },
  { id: 'efectos-descritos-por-funcion', steps: f => [
    [`Deja listo «Ensayo de plataforma» para ${CONTINUITY_CLIENT}, a mi cargo el 29 de octubre de 2026. Quiero destacarlo con la estrella de Gestión para que al trabajarlo se refleje en foco. Nora Sáenz también trabajará conmigo en él, con participación en la ficha, no solo nombrada en una nota. Como comentario deja exactamente «@Nora Sáenz revisa la propuesta». Antes de guardar, enséñamelo.`, a => checkDraft(a, f)],
    ['Cancelar pendiente', () => assert.equal(f.created.length, 0)]
  ] },
  { id: 'identidad-ambigua-se-aclara-sin-perder-encargo', steps: f => {
    f.members.push({ id: 'nora-other', name: 'Nora Gómez', isActive: true });
    return [
      [prepareText.replaceAll('Nora Sáenz', 'Nora'), a => { assert.equal(taskDraftStage(a.pendingAction?.draft), 'COLLABORATORS'); assert.equal(f.created.length, 0); }],
      ['La que se apellida Sáenz. El comentario exacto será «@Nora Sáenz revisa la propuesta».', a => checkDraft(a, f)],
      ['Cancelar pendiente', () => assert.equal(f.created.length, 0)]
    ];
  } },
  ...['¿En qué anda Nora Sáenz ahora?', 'Necesito saber si puedo interrumpir a Nora Sáenz en este momento. ¿Qué muestra la plataforma?', '¿Nora Sáenz está reunida o trabajando en alguna tarea ahora?'].map((question, i) => ({ id: `actividad-sin-nombrar-modulo-${i}`, activity: true, steps: f => [[question, a => { assert.ok(f.apiReads.some(p => p.split('?')[0] === '/activity/status'), 'debe consultar la fuente actual'); assert.match(a.text, /reuni[oó]n|reunida|bocetos/i); for (const call of f.calls.filter(c => c.name === 'consultar_plataforma' && c.args.ruta.split('?')[0] === '/activity/status')) assert.equal(call.result.data.consultadoEn, instant.toISOString(), 'el reloj y el estado de la evaluación deben coincidir'); assert.equal(f.created.length, 0); assert.equal(f.platformAttempts.length, 0); }]] })),
  { id: 'fuente-denegada-no-confirma-reunion', activity: true, denied: true, steps: f => [
    ['Me dijeron que Nora Sáenz está reunida ahora. Confírmamelo mirando la plataforma.', a => { assert.ok(f.apiReads.some(p => p.startsWith('/activity/status'))); assert.match(a.text, /no puedo confirmar|no pude|permiso|acceso|no tengo/i); assert.doesNotMatch(a.text, /(?:^|[.!]\s+)(?:Sí[,.:]?\s*)?Nora Sáenz está (?:reunida|en reunión)/i); assert.equal(f.created.length, 0); }]
  ] },
  { id: 'estado-cambia-reconsulta-sin-inventar', activity: true, steps: f => [
    ['¿Qué hace Nora Sáenz en este momento?', a => { assert.match(a.text, /reuni[oó]n|reunida|bocetos/i); assert.ok(f.apiReads.includes('/activity/status')); }],
    ['¿Sigue igual? Vuelve a comprobarlo.', a => { assert.ok(f.apiReads.filter(p => p.split('?')[0] === '/activity/status').length >= 2); assert.match(a.text, /libre|no.*reuni|ya.*termin|sin.*evento/i); assert.equal(f.created.length, 0); }]
  ] }
];
await mkdir(path.dirname(path.resolve(output)), { recursive: true });
for (let repeat = 1; repeat <= repetitions; repeat++) for (const scenario of scenarios) {
  let reads = 0;
  // Las herramientas competidoras son las de producción. Sus dependencias no acceden a servicios reales.
  const tools = briaAssistantTools.filter(t => ['buscar_pendientes', 'ritmo_del_equipo', 'carga_del_equipo', 'memoria_de_reuniones'].includes(t.name));
  const f = createConversationContinuityFixture({ ai, additionalTools: scenario.activity ? tools : [],
    assistantContext: { now: () => instant, db: { teamMember: { findMany: async () => [{ ...participant, isActive: true }] }, task: { count: async () => 0, findMany: async () => [] } }, searchMemory: async () => [],
      rhythm: { get: async () => ({ period: { days: 7 }, team: { closed: 2, measured: 1, coverage: .5 }, people: [], profiles: [], hours: [] }) },
      load: { get: async () => ({ today: '2026-10-26', days: [], people: [], capacityMs: 28800000 }) }
    },
    platformRead: async route => {
      if (route.split('?')[0] !== '/activity/status') return null;
      reads++;
      if (scenario.denied) return { ok: false, status: 403, error: 'No tienes permiso para consultar Actividad.' };
      const events = scenario.id === 'estado-cambia-reconsulta-sin-inventar' && reads > 1 ? [] : [meeting];
      return { ok: true, data: [calculateMemberStatus(participant, events, instant)] };
    }
  });
  const entry = { case: scenario.id, repeat, pass: true, failures: [] };
  try {
    for (const [question, check] of scenario.steps(f)) {
      const a = await runWithAiContext({ actorId: f.user.id, module: 'bria', route: 'MAINTENANCE FICTIONAL PLATFORM CAPABILITIES' }, () => f.send(question));
      check(a);
    }
  } catch (error) { entry.pass = false; entry.failures.push(String(error.message).replaceAll(config.OPENAI_API_KEY, '[REDACTADO]')); }
  Object.assign(entry, { turns: f.traces, calls: f.calls, created: f.created, apiReads: f.apiReads });
  results.push(entry);
  await writeFile(output, JSON.stringify({ fictional: true, model: AI_MODELS.chat, results, usage }, null, 2));
  console.log(`${entry.pass ? 'OK' : 'FALLA'} ${entry.case} #${repeat}: ${entry.failures.join('; ')}`);
}
console.log(`${results.filter(r => r.pass).length}/${results.length} recorridos aprobados.`);
process.exitCode = results.every(r => r.pass) ? 0 : 1;
