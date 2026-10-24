import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommentPilotFixture, assertCommentDraft, assertCommentPublished, COMMENT_PILOT_REQUEST, COMMENT_PILOT_CORRECTION, COMMENT_PILOT_TEXT } from './evals/briaCommentPilotFixture.js';

const scripted = contents => {
  let round = 0;
  return { generate: async () => {
    const index = Math.floor(round / 2), invoke = round++ % 2 === 0;
    if (!invoke) return { text: 'El resumen está listo para revisar.', functionCalls: [] };
    assert.ok(index < contents.length, 'no debe volver al modelo para confirmar dos veces');
    return { functionCalls: [{ id: `call-${index}`, name: 'operar_en_plataforma', args: { metodo: 'POST', ruta: '/tasks/comment-pilot-task/comments', cuerpo: { content: contents[index] }, que_hace: 'Añadiré el comentario y las dos capturas al pendiente.', archivos: null } }], output: [] };
  } };
};

test('the fictional comment pilot exercises real attachment parsing, draft correction and one confirmed multipart write', async () => {
  const fixture = await createCommentPilotFixture({ ai: scripted(['Capturas iniciales.', COMMENT_PILOT_TEXT]), historical: true });
  const initial = await fixture.send(COMMENT_PILOT_REQUEST, fixture.photos);
  assertCommentDraft(initial, fixture);
  assert.equal(fixture.uploadedIds.length, 2);
  assert.equal(new Set(fixture.uploadedIds).size, 2);
  assert.ok(fixture.uploadedIds.every(id => !fixture.previousFiles.some(file => file.id === id)));
  const corrected = await fixture.send(COMMENT_PILOT_CORRECTION);
  assert.equal(corrected.pendingAction.id, initial.pendingAction.id);
  assertCommentDraft(corrected, fixture, { content: COMMENT_PILOT_TEXT });
  const published = await fixture.send('Confirmar');
  assertCommentPublished(published, fixture);
  assertCommentPublished(await fixture.send('Confirmar'), fixture);
  const second = fixture.writes[0].files[1].buffer;
  fixture.writes[0].files[1].buffer = fixture.writes[0].files[0].buffer;
  assert.throws(() => assertCommentPublished(published, fixture), /bytes publicados/, 'dos nombres y dos filas no bastan si se repitió la primera foto');
  fixture.writes[0].files[1].buffer = second;
  fixture.writes[0].body.content = 'Un texto diferente al que se revisó';
  assert.throws(() => assertCommentPublished(published, fixture));
});

test('the pilot checker rejects a lost image and a summary hiding the text that would be published', () => {
  const fixture = { task: { id: 'task' }, uploadedIds: ['one', 'two'], writes: [] };
  const answer = { text: 'Texto exacto.', pendingAction: { type: 'PLATFORM', status: 'DRAFT', payload: { method: 'POST', path: '/tasks/task/comments', body: { content: 'Texto exacto.' }, files: [{ id: 'one' }, { id: 'two' }] } } };
  assertCommentDraft(answer, fixture);
  assert.throws(() => assertCommentDraft({ ...answer, pendingAction: { ...answer.pendingAction, payload: { ...answer.pendingAction.payload, files: [{ id: 'one' }] } } }, fixture));
  assert.throws(() => assertCommentDraft({ ...answer, text: 'Añadiré un comentario.' }, fixture), /exactamente/);
});

test('cancelling the fictional comment draft never reaches the API', async () => {
  const fixture = await createCommentPilotFixture({ ai: scripted(['Capturas para revisión.']) });
  const initial = await fixture.send(COMMENT_PILOT_REQUEST, fixture.photos);
  assertCommentDraft(initial, fixture);
  const cancelled = await fixture.send('Cancelar');
  assert.equal(cancelled.pendingAction.status, 'CANCELLED');
  assert.equal(fixture.writes.length, 0);
});
