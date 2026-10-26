import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLearningDigest, buildLearningRequest, parseLearnings, validateLearnings, learningId, quotedInText, LEARNING_SCHEMA } from '../src/lib/conversationLearning.js';

const DAY = '2026-10-20';
const conversation = {
  id: 'chat-1', personName: 'Francisco Villa',
  turns: [
    { role: 'user', text: 'Créame un pendiente para Mimas: el reel del menú, para Kamila, mañana, prioridad alta. Con Mimas siempre va alta, el cliente pide todo para ayer.' },
    { role: 'assistant', text: 'Así quedaría el pendiente…' },
    { role: 'user', text: 'Ah, y ojo: Gema dijo que ya no quiere videos con voz en off, solo con música. La contraseña del canva es Brain2026* por si acaso.' },
    { role: 'assistant', text: 'Anotado. ¿Lo creo así?', note: null },
    { role: 'assistant', text: 'Buenos días, Rodny. Así amaneció la agencia…', note: 'LECTURA_MANANA' }
  ]
};
const clients = [{ id: 'c-mimas', name: 'Mimas Kitchen' }, { id: 'c-ww', name: 'Wine & Wonder' }];
const members = [{ id: 'm-kamila', name: 'Kamila del Toro' }, { id: 'm-fran', name: 'Francisco Villa' }];

test('the digest keeps what people and Bria said, never the platform notes, and names the person', () => {
  const digest = buildLearningDigest({ day: DAY, conversation });
  assert.match(digest.text, /^## Chat de Francisco Villa · 2026-10-20\n\[Francisco Villa\] Créame un pendiente/);
  assert.match(digest.text, /\[Bria\] Así quedaría/);
  assert.doesNotMatch(digest.text, /amaneció la agencia/);
  assert.equal(digest.userTurns, 2);
  const request = buildLearningRequest({ digest, day: DAY, known: ['Mimas Kitchen: publica martes y jueves.'] });
  assert.equal(request.strictSchema, true); assert.equal(request.responseSchema, LEARNING_SCHEMA);
  assert.equal(request.governanceContext.useCase, 'bria.conversation-learning');
  assert.match(request.prompt, /Solo cuenta lo que escribió la persona/);
  assert.match(request.prompt, /Ya sé esto[\s\S]*Mimas Kitchen: publica martes y jueves/);
  assert.match(request.prompt, /Nunca anotes contraseñas/);
});

test('the code keeps only what a person literally said, about a real entity, without credentials, personal data or judgments', () => {
  const digest = buildLearningDigest({ day: DAY, conversation });
  const raw = parseLearnings('```json\n' + JSON.stringify({ aprendizajes: [
    { entidad: 'Mimas', tipoEntidad: 'cliente', tema: 'prioridad', afirmacion: 'Los pendientes de Mimas van con prioridad alta: el cliente pide todo para ayer.', certeza: 'PRACTICA', proposito: 'operacion', quienLoDijo: 'Francisco', evidencia: 'Con Mimas siempre va alta, el cliente pide todo para ayer.' },
    { entidad: 'Wine & Wonder', tipoEntidad: 'cliente', tema: 'contenido', afirmacion: 'Gema ya no quiere videos con voz en off, solo con música.', certeza: 'PRACTICA', proposito: 'editorial', quienLoDijo: 'Francisco', evidencia: 'Gema dijo que ya no quiere videos con voz en off, solo con música' },
    { entidad: 'Wine & Wonder', tipoEntidad: 'cliente', tema: 'accesos', afirmacion: 'La contraseña de Canva es Brain2026*.', certeza: 'PRACTICA', proposito: 'operacion', quienLoDijo: 'Francisco', evidencia: 'La contraseña del canva es Brain2026*' },
    { entidad: 'Kamila', tipoEntidad: 'persona', tema: 'ritmo', afirmacion: 'Kamila es lenta con los reels.', certeza: 'PRACTICA', proposito: 'personas', quienLoDijo: 'Francisco', evidencia: 'para Kamila, mañana' },
    { entidad: 'Kamila', tipoEntidad: 'persona', tema: 'costumbre', afirmacion: 'Francisco le pide a Kamila los reels de Mimas con prioridad alta.', certeza: 'PRACTICA', proposito: 'operacion', quienLoDijo: 'Francisco', evidencia: 'el reel del menú, para Kamila, mañana, prioridad alta' },
    { entidad: 'Nattal', tipoEntidad: 'cliente', tema: 'x', afirmacion: 'Nattal pide todo para ayer.', certeza: 'PRACTICA', proposito: 'editorial', quienLoDijo: 'Francisco', evidencia: 'el cliente pide todo para ayer' },
    { entidad: 'Mimas', tipoEntidad: 'cliente', tema: 'inventado', afirmacion: 'Mimas aprobó la parrilla de noviembre.', certeza: 'PRACTICA', proposito: 'operacion', quienLoDijo: 'Bria', evidencia: 'Anotado. ¿Lo creo así?' },
    { entidad: 'Mimas', tipoEntidad: 'cliente', tema: 'prioridad', afirmacion: 'Los pendientes de Mimas van con prioridad alta: el cliente pide todo para ayer.', certeza: 'PRACTICA', proposito: 'operacion', quienLoDijo: 'Francisco', evidencia: 'Con Mimas siempre va alta' }
  ] }) + '\n```');
  const { facts, dropped } = validateLearnings(raw, { day: DAY, conversation, personText: digest.personText, clients, members, known: [{ entity: 'Mimas Kitchen', statement: 'Publica martes y jueves.' }] });
  assert.deepEqual(facts.map((f) => [f.entidad, f.tipoEntidad, f.proposito, f.certeza]), [
    ['Mimas Kitchen', 'cliente', 'operacion', 'PRACTICA'],
    ['Wine & Wonder', 'cliente', 'editorial', 'PRACTICA'],
    ['Kamila del Toro', 'persona', 'personas', 'PRACTICA']
  ]);
  assert.equal(facts[0].clientId, 'c-mimas'); assert.equal(facts[2].clientId, null);
  assert.match(facts[0].fuentes[0].ref, /^Chat con Bria de Francisco Villa \(Francisco\): «Con Mimas siempre va alta/);
  assert.equal(facts[0].id, learningId({ day: DAY, conversationId: 'chat-1', entity: 'Mimas Kitchen', statement: facts[0].afirmacion }));
  assert.deepEqual(dropped.map((d) => d.why).sort(), ['cliente desconocido', 'credencial', 'juicio sobre una persona', 'repetido en el mismo chat', 'sin cita literal de la persona'], 'cada descarte dice por qué');
  const alreadyKnown = validateLearnings(raw, { day: DAY, conversation, personText: digest.personText, clients, members, known: [{ entity: 'Mimas Kitchen', statement: 'Los pendientes de Mimas van con prioridad alta: el cliente pide todo para ayer.' }] });
  assert.equal(alreadyKnown.facts.some((f) => f.entidad === 'Mimas Kitchen'), false, 'una repetición exacta de lo conocido no se guarda otra vez');
});

test('a changed agreement is not discarded for sharing words with a confirmed memory', () => {
  const affirmative = 'Mimas renovó el contrato para octubre y la parrilla está aprobada.';
  const correction = 'Mimas no renovó el contrato para octubre y la parrilla no está aprobada.';
  const known = [{ id: 'confirmed-october', entity: 'Mimas Kitchen', statement: affirmative, certainty: 'CONFIRMADO', origin: 'EQUIPO' }];
  const item = statement => ({ entidad: 'Mimas', tipoEntidad: 'cliente', tema: 'acuerdo', afirmacion: statement, certeza: 'CONFIRMADO', proposito: 'operacion', quienLoDijo: 'Francisco', evidencia: statement });
  const result = validateLearnings({ aprendizajes: [item(correction)] }, { day: DAY, conversation, personText: correction, clients, members, known });
  assert.equal(result.facts.length, 1, 'the contradiction must remain available for reconciliation');
  assert.equal(result.facts[0].afirmacion, correction);
  assert.equal(result.facts[0].certeza, 'PROPUESTA', 'a nightly extraction cannot confirm or supersede a human agreement');
  assert.equal(known[0].statement, affirmative);
  assert.equal(result.facts[0].reemplaza, undefined);
  const sameChat = validateLearnings({ aprendizajes: [item(affirmative), item(correction)] }, { day: DAY, conversation, personText: `${affirmative}\n${correction}`, clients, members });
  assert.equal(sameChat.facts.length, 2, 'opposite statements in one chat are not a lexical duplicate');
});

test('quotes are compared without accents, case or punctuation, and short ones never count', () => {
  assert.equal(quotedInText('Gema dijo que ya no quiere audios', 'Ah, y ojo: Gema dijo que ya no quiere VÍDEOS…'), false, 'una palabra distinta no es la misma cita');
  assert.equal(quotedInText('gema dijo que ya no quiere videos', 'Ah, y ojo: Gema dijo que ya no quiere VÍDEOS…'), true, 'tildes y mayúsculas no cuentan');
  assert.equal(quotedInText('gema dijo que ya no quiere videos con voz en off', 'Ojo: Gema dijo que ya no quiere videos con voz en off, solo con música.'), true);
  assert.equal(quotedInText('Mimas', 'Mimas pide todo'), false);
});

