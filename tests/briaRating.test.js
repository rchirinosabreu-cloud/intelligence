// Que Bria se mida (Rodny, 14 de octubre de 2026, cuarto punto del plan «llevar a Bria a más niveles»: «pulgar arriba o
// abajo en cada respuesta, y un conjunto de preguntas reales que corra como prueba cada vez que cambiemos sus
// instrucciones»). La valoración vive en el turno de Bria (metadata.rating), la pone solo la dueña del chat, la cuenta
// `uso_de_bria` sin contenido, y el conjunto de casos se corre a mano contra el modelo real con datos ficticios.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBriaConversationService } from '../src/services/briaConversationService.js';
import { createBriaConversationRepository } from '../src/services/briaConversationRepository.js';
import { summarizeBriaUsage } from '../src/services/briaUsageService.js';
import { normalizeRating, RATING_NOTE_MAX, canRateTurn, ratingNoteOpenFor } from '../src/lib/briaRating.js';
import { EVAL_CASES, checkEvalAnswer } from '../tests/evals/briaCases.js';

const actor = { ref: 'owner', role: 'ADMIN', permissions: { bria: true } };

test('a rating is UP or DOWN with an optional short note; anything else is refused with words', () => {
  assert.deepEqual(normalizeRating({ rating: 'UP' }), { value: 'UP', note: null });
  assert.deepEqual(normalizeRating({ rating: 'down', note: '  Se inventó la fecha  ' }), { value: 'DOWN', note: 'Se inventó la fecha' });
  assert.equal(RATING_NOTE_MAX, 300);
  assert.throws(() => normalizeRating({ rating: 'MEH' }), /pulgar arriba o abajo/);
  assert.throws(() => normalizeRating({ rating: 'DOWN', note: 'x'.repeat(301) }), /300/);
});

test('the service rates only an assistant turn of the person’s own chat and returns the chat with the rating on that turn', async () => {
  const stored = { id: 'chat', revision: 1, turns: [{ id: 'chat:2', role: 'user', text: '¿Qué tengo hoy?' }, { id: 'chat:3', role: 'assistant', text: 'Tienes tres tareas.', sources: [], failures: [] }] };
  const rated = [];
  const service = createBriaConversationService({
    resolveActor: async () => actor,
    repository: { get: async () => stored, rateTurn: async (who, id, position, rating) => { rated.push([who.ref, id, position, rating]); stored.turns[1] = { ...stored.turns[1], rating }; return stored; } },
    assistant: { ask: async () => ({ answer: 'x', sources: [] }) }
  });
  const out = await service.rate({ user: { id: 'owner' }, id: 'chat', turnId: 'chat:3', rating: 'DOWN', note: 'Faltó la fecha' });
  assert.equal(rated.length, 1);
  assert.equal(rated[0][2], 3);
  assert.deepEqual(rated[0][3].value, 'DOWN');
  assert.equal(rated[0][3].note, 'Faltó la fecha');
  assert.match(rated[0][3].at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(out.turns[1].rating.value, 'DOWN');
  await assert.rejects(service.rate({ user: { id: 'owner' }, id: 'chat', turnId: 'chat:2', rating: 'UP' }), /respuesta de Bria/, 'a question of the person cannot be rated');
  await assert.rejects(service.rate({ user: { id: 'owner' }, id: 'chat', turnId: 'chat:9', rating: 'UP' }), /No encontramos esa respuesta/);
});

test('the repository writes the rating into the turn’s metadata of the owner’s chat only, and the route is mounted', async () => {
  const queries = [];
  const pool = { query: async (sql, params) => { queries.push([sql, params]); return /UPDATE/.test(sql) ? { rowCount: 1 } : /FROM bria_memory\.conversations /.test(sql) ? { rows: [{ id: 'chat', title: 't', revision: 1, updated_at: new Date() }] } : { rows: [] }; } };
  const repository = createBriaConversationRepository({ pool, workspace: 'application' });
  await repository.rateTurn(actor, 'chat', 3, { value: 'UP', note: null, at: '2026-10-14T15:00:00.000Z' });
  const update = queries.find(([sql]) => /UPDATE bria_memory\.conversation_turns/.test(sql));
  assert.ok(update, 'the rating is an update of the turn');
  assert.match(update[0], /SET metadata = metadata \|\| jsonb_build_object\('rating', \$4::jsonb\)/);
  assert.match(update[0], /role='assistant'/);
  assert.match(update[0], /EXISTS \(SELECT 1 FROM bria_memory\.conversations c WHERE c\.id=\$1 AND c\.workspace=\$2 AND c\.actor_ref=\$3\)/, 'only the owner’s chat');
  const route = readFileSync('src/routes/api/briaConversations.js', 'utf8');
  assert.match(route, /router\.post\('\/:id\/rating', handle\(\(req, instance\) => instance\.rate\(\{ user: req\.user, id: req\.params\.id, turnId: req\.body\?\.turnId, rating: req\.body\?\.rating, note: req\.body\?\.note \}\)\)\);/);
});

// 20 de octubre de 2026: con un turno sin id, «¿no hay nota abierta?» y «¿este turno no tiene id?» se leían como la
// misma cosa (undefined === undefined), la caja «¿Qué falló?» se dibujaba sin nota y el panel entero se caía leyendo
// `null.text`. La regla es una sola y nunca abre la nota sin un turno con id.
test('the note «¿Qué falló?» opens only for the rated turn, never for a turn without id, and only an id-bearing answer can be rated', () => {
  assert.equal(ratingNoteOpenFor(null, { id: undefined, role: 'assistant' }), false, 'no open note and no id is not a match');
  assert.equal(ratingNoteOpenFor(null, { id: 'c:3', role: 'assistant' }), false);
  assert.equal(ratingNoteOpenFor({ turnId: undefined, text: '' }, { id: undefined, role: 'assistant' }), false);
  assert.equal(ratingNoteOpenFor({ turnId: 'c:3', text: '' }, { id: 'c:3', role: 'assistant' }), true);
  assert.equal(ratingNoteOpenFor({ turnId: 'c:3', text: '' }, { id: 'c:5', role: 'assistant' }), false);
  assert.equal(canRateTurn({ id: 'c:3', role: 'assistant' }), true);
  assert.equal(canRateTurn({ id: 'pending', role: 'user' }), false);
  assert.equal(canRateTurn({ id: undefined, role: 'assistant' }), false, 'the server could not find a turn without id');
  assert.equal(canRateTurn({ id: 'c:2', role: 'user' }), false);
});

test('the chat shows a thumb up and a thumb down under each answer of Bria, the thumb down asks what failed, and the state comes from the server', () => {
  const chat = readFileSync('src/components/bria/BriaConversation.jsx', 'utf8');
  assert.match(chat, /ratingNoteOpenFor\(ratingNote, turn\)/, 'the note opens by the shared rule');
  assert.match(chat, /canRateTurn\(turn\)/, 'the thumbs show by the shared rule');
  assert.doesNotMatch(chat, /ratingNote\?\.turnId === turn\.id/, 'never compare two possibly-undefined ids');
  assert.match(chat, /aria-label="Me sirvió"/);
  assert.match(chat, /aria-label="No me sirvió"/);
  assert.match(chat, /<ThumbsUp className=/);
  assert.match(chat, /<ThumbsDown className=/);
  assert.match(chat, /aria-pressed=\{turn\.rating\?\.value === 'UP'\}/);
  assert.match(chat, /aria-pressed=\{turn\.rating\?\.value === 'DOWN'\}/);
  assert.match(chat, /request\(`\/\$\{chat\.id\}\/rating`, \{ method: 'POST', body: \{ turnId/, 'the rating goes to the chat endpoint');
  assert.match(chat, /¿Qué falló\?/);
  assert.match(chat, /data-bria-rating-note/);
  const icons = readFileSync('src/components/ui/icons.jsx', 'utf8');
  assert.match(icons, /export const ThumbsUp = /);
  assert.match(icons, /export const ThumbsDown = /);
});

test('usage counts the thumbs without any content, and the admin tool explains them', () => {
  const rows = [
    { actor_ref: 'u1', name: 'Rodny', role: 'user', content: 'la clave de capcut', metadata: {}, created_at: '2026-10-13T15:00:00Z' },
    { actor_ref: 'u1', name: 'Rodny', role: 'assistant', content: 'respuesta', metadata: { toolsUsed: [], failures: [], rating: { value: 'UP', note: null, at: '2026-10-13T15:01:00Z' } }, created_at: '2026-10-13T15:00:05Z' },
    { actor_ref: 'u1', name: 'Rodny', role: 'assistant', content: 'respuesta', metadata: { toolsUsed: ['mis_tareas'], failures: [], rating: { value: 'DOWN', note: 'se inventó la fecha', at: '2026-10-13T16:01:00Z' } }, created_at: '2026-10-13T16:00:05Z' },
    { actor_ref: 'u2', name: 'Kamila', role: 'assistant', content: 'respuesta', metadata: { toolsUsed: ['buscar_cliente'], failures: [] }, created_at: '2026-10-13T17:00:05Z' }
  ];
  const out = summarizeBriaUsage(rows, { days: 7 });
  assert.deepEqual(out.valoracion, { arriba: 1, abajo: 1, sinValorar: 1, tasaPositiva: 50, motivosAbajo: ['se inventó la fecha'] });
  assert.equal(JSON.stringify(out).includes('capcut'), false, 'no question text leaks');
  const tools = readFileSync('src/services/briaUsageTools.js', 'utf8');
  assert.match(tools, /pulgar/i);
});

test('the real-question set: every case is fictitious, has at least one check, and the checker judges tools, must-say and must-not-say', () => {
  assert.ok(EVAL_CASES.length >= 10);
  for (const item of EVAL_CASES) {
    assert.match(item.id, /^[a-z0-9-]+$/);
    assert.ok(item.question.length > 10);
    assert.ok((item.requiredTools?.length || 0) + (item.mustSay?.length || 0) + (item.mustNotSay?.length || 0) > 0, `${item.id} checks something`);
    assert.doesNotMatch(item.question, /brainstudio\.com|@gmail|contraseña real/i, 'fictitious data only');
  }
  const verdict = checkEvalAnswer(EVAL_CASES.find((c) => c.id === 'cuantos-sin-asignar'), { answer: 'Hay 4 pendientes sin asignar.', toolsUsed: ['buscar_pendientes'] });
  assert.deepEqual(verdict, { pass: true, failures: [] });
  const bad = checkEvalAnswer(EVAL_CASES.find((c) => c.id === 'accion-no-afirma'), { answer: 'Listo, ya cambié la tarea a realizada.', toolsUsed: ['cambiar_pendiente'] });
  assert.equal(bad.pass, false);
  assert.ok(bad.failures.some((f) => /no debía decir/.test(f)));
  // Preparar sin ejecutar se juzga por la acción que queda, no por una frase de plantilla (1 de noviembre de 2026).
  const prepared = checkEvalAnswer(EVAL_CASES.find((c) => c.id === 'accion-no-afirma'), { answer: 'Queda preparada; revisa el resumen y confírmalo.', toolsUsed: ['cambiar_pendiente'], pendingAction: { type: 'TASK_UPDATE', status: 'PENDING' } });
  assert.deepEqual(prepared, { pass: true, failures: [] });
  const unprepared = checkEvalAnswer(EVAL_CASES.find((c) => c.id === 'accion-no-afirma'), { answer: '¿Lo hago así?', toolsUsed: ['cambiar_pendiente'] });
  assert.ok(unprepared.failures.some((f) => /acción preparada/.test(f)), 'the template phrase alone no longer passes');
  const executed = checkEvalAnswer(EVAL_CASES.find((c) => c.id === 'varios-pendientes'), { answer: 'Preparado.', toolsUsed: ['preparar_pendiente'], pendingAction: { type: 'TASK_CREATE', status: 'DONE', items: [{ title: 'Historias de la semana' }] } });
  assert.ok(executed.failures.some((f) => /sin confirmación/.test(f)) && executed.failures.some((f) => /Carrusel de datos/.test(f)));
  const script = readFileSync('scripts/eval-bria-casos.mjs', 'utf8');
  assert.match(script, /BRIA_EVAL_OUTPUT/, 'the run writes a report');
  assert.match(script, /fictional: true/);
  assert.doesNotMatch(script, /DATABASE_URL/, 'the eval never touches a database');
  assert.match(readFileSync('package.json', 'utf8'), /"eval:bria-casos": "node scripts\/eval-bria-casos\.mjs"/);
});
