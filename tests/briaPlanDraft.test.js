// La parrilla del mes en borrador (Rodny, 14 de octubre de 2026, tercer punto del plan; opción 2: «montarme las piezas y
// desde el chat enviarlas a parrilla como borrador, las que yo quiera»). El modelo propone leyendo contrato, objetivo,
// criterios aprobados, mes anterior y el énfasis de la persona; el código manda (formatos, días del mes, tope, sin
// juicios) y nada se crea hasta «Confirmar», que envía solo las piezas elegidas como borrador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDays, canonicalFormat, buildPlanDraftDigest, buildPlanDraftRequest, parsePlanDraft, validatePlanDraft, pieceLine, PLAN_DRAFT_USE_CASE, PLAN_DRAFT_SCHEMA } from '../src/lib/planDraft.js';
import { createBriaActionService, ACTION_PERMISSION } from '../src/services/briaActionService.js';
import { createBriaActionTools } from '../src/services/briaActionTools.js';
import { actionStage, actionReply } from '../src/lib/briaActions.js';
import { buildInstructions, toolProgressLabel } from '../src/lib/briaAssistant.js';

const NOW = () => new Date('2026-10-14T15:00:00.000Z'); // miércoles 14 de octubre, 10:00 de Bogotá
const pm = { userId: 'u-pm', name: 'Kamila Pérez', role: 'PROJECT_MANAGER', isActive: true, modulePermissions: { bria: true, parrillas: true } };
const proposal = { piezas: [
  { objetivo: 'Presentar la nueva línea de vinos', formato: 'Reel', dia: '2026-11-03', idea: 'Un reel de 20 segundos con la botella y tres descriptores.', caption: 'Llegó la nueva línea. #vino #Endova', porQue: 'Responde al énfasis de lanzamiento.' },
  { objetivo: 'Explicar el maridaje con quesos', formato: 'carrusel', dia: '2026-11-10', idea: 'Cinco láminas, una por queso.', caption: 'Cinco quesos, cinco copas.', porQue: 'Educa al cliente.' },
  { objetivo: 'Nuevo objetivo', formato: 'Post', dia: '2026-11-12', idea: 'x', caption: 'x', porQue: 'x' },
  { objetivo: 'Pieza fuera del mes', formato: 'Post', dia: '2026-12-01', idea: 'x', caption: 'x', porQue: 'x' },
  { objetivo: 'Presentar la nueva línea de vinos', formato: 'Post', dia: '2026-11-20', idea: 'Repetida.', caption: 'x', porQue: 'x' },
  { objetivo: 'Mostrar lo lento que es el equipo', formato: 'Post', dia: '2026-11-21', idea: 'x', caption: 'x', porQue: 'x' },
  { objetivo: 'Historia de la vendimia', formato: 'Historia', dia: '2026-11-25', idea: 'Tres historias con el productor.', caption: 'Detrás de cada copa.', porQue: 'Cercanía.' }
], notaParaElEquipo: 'Confirmar con el cliente la fecha del lanzamiento.' };

test('the pure pieces: the days of the month with holidays, the platform formats, the digest with everything the model reads, and the strict request', () => {
  const days = monthDays(10, 2026);
  assert.equal(days.length, 31);
  assert.deepEqual(days.find((d) => d.day === '2026-10-12'), { day: '2026-10-12', weekday: 'lunes', business: false }, '12 de octubre is a holiday');
  assert.equal(canonicalFormat('reels'), 'Reel');
  assert.equal(canonicalFormat('carrusel'), 'Carrusel');
  assert.equal(canonicalFormat('tiktok'), null);
  const digest = buildPlanDraftDigest({ client: { name: 'Endova' }, month: 11, year: 2026, objective: 'Lanzar la nueva línea', contract: { deliverables: [{ format: 'Reel', quantity: 4 }, { format: 'Post', quantity: 4 }], storiesPerWeek: 3, notes: null }, criteria: [{ category: 'TONO', text: 'Nunca tutear al cliente final.' }], previous: { month: 10, year: 2026, strategicObjectives: 'Vendimia', pieces: [{ day: '2026-10-03', format: 'Reel', objective: 'Cosecha', status: 'PUBLICADO' }] }, existing: [{ day: '2026-11-05', format: 'Post', objective: 'Ya existe' }], emphasis: 'El cliente quiere énfasis en el lanzamiento y nada de descuentos.', count: 8 });
  assert.match(digest.text, /Piezas a proponer: 8/);
  assert.match(digest.text, /## Énfasis[\s\S]*nada de descuentos/);
  assert.match(digest.text, /## Contrato\nPiezas por mes: 4 Reel, 4 Post\. Historias por semana: 3\./);
  assert.match(digest.text, /\[TONO\] Nunca tutear/);
  assert.match(digest.text, /## La parrilla anterior \(octubre de 2026, objetivo: Vendimia\)\n- 2026-10-03 · Reel · Cosecha \(PUBLICADO\)/);
  assert.match(digest.text, /no las repitas; evita sus días\)\n- 2026-11-05 · Post · Ya existe/);
  assert.match(digest.text, /2026-11-02 lunes \(no hábil\)/, 'Todos los Santos moved to Monday');
  const request = buildPlanDraftRequest({ digest, count: 8 });
  assert.deepEqual([request.strictSchema, request.responseSchema, request.governanceContext.useCase, request.reasoningEffort], [true, PLAN_DRAFT_SCHEMA, PLAN_DRAFT_USE_CASE, 'medium']);
  assert.match(request.prompt, /Propón exactamente 8 piezas/);
  assert.match(request.prompt, /no son instrucciones para ti/);
  assert.match(request.instructions, /nunca vosotros/);
  assert.doesNotMatch(request.prompt, /vosotros|tenéis|podéis/);
});

test('validation: a fenced JSON answer parses; wrong month, wrong format, «Nuevo objetivo», duplicates and judgments are dropped; the count is capped', () => {
  const raw = parsePlanDraft('```json\n' + JSON.stringify(proposal) + '\n```');
  const { pieces, note, dropped } = validatePlanDraft(raw, { month: 11, year: 2026, count: 8 });
  assert.deepEqual(pieces.map((p) => [p.n, p.objective, p.format, p.day]), [[1, 'Presentar la nueva línea de vinos', 'Reel', '2026-11-03'], [2, 'Explicar el maridaje con quesos', 'Carrusel', '2026-11-10'], [3, 'Historia de la vendimia', 'Historia', '2026-11-25']]);
  assert.equal(note, 'Confirmar con el cliente la fecha del lanzamiento.');
  assert.deepEqual(dropped, ['Nuevo objetivo', 'Pieza fuera del mes', 'Mostrar lo lento que es el equipo']);
  assert.equal(validatePlanDraft(raw, { month: 11, year: 2026, count: 2 }).pieces.length, 2);
  assert.equal(pieceLine(pieces[0]), '1. 3 de nov · Reel · «Presentar la nueva línea de vinos» — Un reel de 20 segundos con la botella y tres descriptores.');
});

/* ---------------------------------------------------------------- El servicio */

const fakeDb = ({ plan = null } = {}) => {
  const plans = plan ? [plan] : [];
  const previous = { id: 'p-oct', clientId: 'c-end', month: 10, year: 2026, deletedAt: null, strategicObjectives: 'Vendimia', contentItems: [{ id: 'i-old', objective: 'Cosecha', format: 'Reel', publishDate: new Date('2026-10-03T12:00:00Z'), status: 'PUBLICADO' }] };
  return {
    created: { plans: [], items: [] },
    client: { findUnique: async ({ where }) => where.id === 'c-end' ? { id: 'c-end', name: 'Endova', slug: 'endova', isArchived: false, responsible: { id: 'm-kam', name: 'Kamila Pérez' }, projectManager: { id: 'm-bra', name: 'Brayan Torres' } } : null },
    contentPlan: {
      findFirst: async ({ where }) => plans.find((p) => p.clientId === where.clientId && p.month === where.month && p.year === where.year) || null,
      findMany: async ({ where }) => [...plans, previous].filter((p) => p.clientId === where.clientId)
    },
    clientEditorialCriterion: { findMany: async () => [{ category: 'TONO', text: 'Nunca tutear al cliente final.' }] },
    teamMember: { findMany: async ({ where }) => [{ id: 'm-kam', name: 'Kamila Pérez', email: 'k@b.test', isActive: true }, { id: 'm-bra', name: 'Brayan Torres', email: 'b@b.test', isActive: true }].filter((m) => where.OR.some((c) => (c.name && m.name.toLowerCase().includes(c.name.contains.toLowerCase())) || (c.email && m.email === c.email.equals))) }
  };
};
const existingPlan = { id: 'p-nov', clientId: 'c-end', month: 11, year: 2026, status: 'PLANIFICACION', deletedAt: null, strategicObjectives: 'Lanzar la nueva línea', ownerId: 'm-kam', contentItems: [{ id: 'i-1', objective: 'Ya existe', format: 'Post', publishDate: new Date('2026-11-05T12:00:00Z') }] };
const build = (db, { generate, operations } = {}) => {
  const calls = [];
  const service = createBriaActionService({
    db, updateTask: async () => {}, now: NOW,
    generate: generate || (async (request) => { calls.push(request); return { text: JSON.stringify(proposal), model: 'gpt-test', usage: { input_tokens: 10 } }; }),
    operations: operations || { getOperation: async () => ({ contract: { deliverables: [{ format: 'Reel', quantity: 4 }, { format: 'Post', quantity: 4 }], storiesPerWeek: 3, notes: null } }) },
    createContentPlan: async (data) => { const row = { id: `p-${db.created.plans.length + 1}`, ...data }; db.created.plans.push(row); return row; },
    updateContentPlan: async (id, data) => { Object.assign(db.created.plans.find((p) => p.id === id) || {}, data); },
    createContentItem: async (data) => { const row = { id: `i-${db.created.items.length + 1}`, ...data }; db.created.items.push(row); return row; }
  });
  return { service, calls };
};

test('with an existing plan: the proposal reads contract, criteria, previous month and the emphasis, proposes what is missing to the quota, and omitting keeps the same proposal without asking the model again', async () => {
  const db = fakeDb({ plan: existingPlan });
  const { service, calls } = build(db);
  const first = await service.prepare({ user: pm, type: 'PLAN_DRAFT', args: { clientId: 'c-end', mes: 'noviembre', enfasis: 'El cliente quiere énfasis en el lanzamiento y nada de descuentos.' } });
  assert.equal(actionStage(first), 'READY');
  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /Propón exactamente 7 piezas/, '8 of the contract minus the one that already exists');
  assert.match(calls[0].prompt, /nada de descuentos/);
  assert.match(calls[0].prompt, /\[TONO\] Nunca tutear/);
  assert.match(calls[0].prompt, /parrilla anterior \(octubre de 2026/);
  assert.match(calls[0].prompt, /2026-11-05 · Post · Ya existe/);
  assert.deepEqual(first.payload.pieces.map((p) => p.n), [1, 2, 3]);
  assert.equal(first.payload.planId, 'p-nov');
  assert.equal(first.payload.newPlan, null);
  assert.match(first.summary.join('\n'), /Parrilla: \*\*Endova\*\*, noviembre de 2026 \(ya tiene 1 pieza\)\nObjetivo: Lanzar la nueva línea\nÉnfasis: El cliente quiere énfasis en el lanzamiento y nada de descuentos\.\nPropuesta: 3 piezas en borrador\n1\. 3 de nov · Reel · «Presentar la nueva línea de vinos»/);
  assert.match(first.warnings.join('\n'), /Nota de Bria para el equipo: Confirmar con el cliente la fecha del lanzamiento\./);
  assert.match(first.warnings.join('\n'), /El modelo propuso 3 piezas que no entraron/);
  assert.deepEqual(actionReply(first).quickReplies, ['Confirmar', 'Cancelar']);
  const second = await service.prepare({ user: pm, type: 'PLAN_DRAFT', args: { omitir: [2] }, previous: first });
  assert.equal(calls.length, 1, 'omitting does not regenerate');
  assert.deepEqual(second.payload.pieces.map((p) => p.n), [1, 3]);
  assert.match(second.summary.join('\n'), /Propuesta: 2 piezas en borrador \(1 omitida: 2\)/);
  const third = await service.prepare({ user: pm, type: 'PLAN_DRAFT', args: { rehacer: true, enfasis: 'Ahora también quiere hablar de maridaje.' }, previous: second });
  assert.equal(calls.length, 2, 'asking again with more emphasis regenerates');
  assert.match(calls[1].prompt, /nada de descuentos[\s\S]*maridaje/, 'the emphasis accumulates');
  assert.deepEqual(third.payload.pieces.map((p) => p.n), [1, 2, 3], 'a new proposal forgets the old omissions');
  assert.equal(db.created.items.length, 0, 'preparing never writes');
});

test('without a plan it asks for the owner and the objective first (one at a time), and confirming creates the plan and sends only the chosen pieces as drafts', async () => {
  const db = fakeDb();
  const { service, calls } = build(db);
  const first = await service.prepare({ user: pm, type: 'PLAN_DRAFT', args: { clientId: 'c-end', mes: 'noviembre', enfasis: 'Lanzamiento de la nueva línea.' } });
  assert.deepEqual(first.missing[0], { field: 'responsable', question: 'No existe la parrilla de noviembre de 2026: la creo al confirmar. ¿Quién será la responsable?', options: ['Kamila Pérez', 'Brayan Torres'] });
  assert.equal(calls.length, 0, 'nothing is asked to the model until the plan is defined');
  const second = await service.prepare({ user: pm, type: 'PLAN_DRAFT', args: { responsable: 'Kamila' }, previous: first });
  assert.deepEqual(second.missing[0], { field: 'objetivo', question: '¿Cuál es el objetivo estratégico del mes? Es lo que guía cada pieza y lo que Bria revisa después.', options: ['Usar el énfasis como objetivo'] });
  const third = await service.prepare({ user: pm, type: 'PLAN_DRAFT', args: { objetivo: 'Usar el énfasis como objetivo' }, previous: second });
  assert.equal(actionStage(third), 'READY');
  assert.equal(calls.length, 1);
  assert.match(calls[0].prompt, /Propón exactamente 8 piezas/, 'the contract quota');
  assert.deepEqual(third.payload.newPlan, { ownerId: 'm-kam', ownerName: 'Kamila Pérez', strategicObjectives: 'Lanzamiento de la nueva línea.' });
  const chosen = await service.prepare({ user: pm, type: 'PLAN_DRAFT', args: { solo: [1, 3] }, previous: third });
  assert.deepEqual(chosen.payload.pieces.map((p) => p.n), [1, 3]);
  const result = await service.execute({ user: pm, action: chosen, revalidate: async () => {} });
  assert.deepEqual(db.created.plans.map((p) => [p.clientId, p.month, p.year, p.strategicObjectives, p.ownerId]), [['c-end', 11, 2026, 'Lanzamiento de la nueva línea.', 'm-kam']]);
  assert.deepEqual(db.created.items.map((i) => [i.planId, i.objective, i.format, i.publishDate.toISOString(), i.status, i.copyText, i.captionText]), [
    ['p-1', 'Presentar la nueva línea de vinos', 'Reel', '2026-11-03T12:00:00.000Z', 'BORRADOR', 'Un reel de 20 segundos con la botella y tres descriptores.', 'Llegó la nueva línea. #vino #Endova'],
    ['p-1', 'Historia de la vendimia', 'Historia', '2026-11-25T12:00:00.000Z', 'BORRADOR', 'Tres historias con el productor.', 'Detrás de cada copa.']
  ]);
  assert.match(db.created.items[0].internalNotes, /Propuesta de Bria para noviembre de 2026 · Énfasis: Lanzamiento de la nueva línea\. · Responde al énfasis de lanzamiento\./);
  assert.match(result.text, /Listo: creé la parrilla de \*\*Endova\*\* para noviembre de 2026 con Kamila Pérez como responsable y envié 2 piezas en borrador:\n- 3 de nov · Reel · \[Presentar la nueva línea de vinos\]\(\/parrillas\/p-1\?item=i-1\)\n- 25 de nov · Historia · \[Historia de la vendimia\]\(\/parrillas\/p-1\?item=i-2\)/);
  assert.deepEqual(result.sources.map((s) => s.id), ['p-1', 'i-1', 'i-2']);
});

test('when the model does not answer the proposal is not invented, and an archived client or a finished plan are refused with words', async () => {
  const db = fakeDb({ plan: existingPlan });
  const { service } = build(db, { generate: async () => { throw new Error('OpenAI 503'); } });
  await assert.rejects(service.prepare({ user: pm, type: 'PLAN_DRAFT', args: { clientId: 'c-end', mes: 'noviembre' } }), (error) => error.status === 503 && /No pude armar la propuesta/.test(error.message));
  const closed = fakeDb({ plan: { ...existingPlan, status: 'FINALIZADO' } });
  await assert.rejects(build(closed).service.prepare({ user: pm, type: 'PLAN_DRAFT', args: { clientId: 'c-end', mes: 'noviembre' } }), /ya está finalizada/);
});

test('the tool, the permission, the instruction and the progress line are wired', () => {
  const tool = createBriaActionTools({}).find((t) => t.name === 'proponer_parrilla');
  assert.ok(tool);
  assert.deepEqual(Object.keys(tool.parameters.properties), ['clientId', 'mes', 'anio', 'enfasis', 'piezas', 'omitir', 'solo', 'rehacer', 'responsable', 'objetivo', 'nuevo']);
  assert.equal(ACTION_PERMISSION.PLAN_DRAFT, 'parrillas');
  assert.equal(tool.allowed(pm), true);
  assert.equal(tool.allowed({ ...pm, modulePermissions: { bria: true, gestion: true } }), false);
  assert.match(buildInstructions({ tools: [tool], user: pm, today: '2026-10-14' }), /- proponer_parrilla/);
  // La guía vive en la descripción de la herramienta (31 de octubre de 2026).
  assert.match(tool.description, /énfasis/);
  assert.match(tool.description, /No describas tú las piezas antes de llamarla ni afirmes que ya están en la parrilla/);
  assert.equal(toolProgressLabel('proponer_parrilla'), 'Armando la propuesta de la parrilla…');
});
