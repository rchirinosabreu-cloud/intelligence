import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlainAgreement, isPlainRefusal, ACTION_VERBS } from '../src/lib/briaAgreement.js';
import { confirmsAction, cancelsAction } from '../src/lib/briaActions.js';
import { isPlaceholderTaskTitle, taskDraftStage } from '../src/lib/briaTaskDraft.js';

// Rodny, 22 de octubre de 2026, por WhatsApp: Bria le mostró el pendiente, él respondió «dale, así está bien» y
// Bria volvió a mostrar el mismo resumen hasta que escribió «crear pendiente». Un sí dicho como lo dice la gente
// confirma la acción que Bria acaba de proponer; un sí con un cambio adentro no confirma nada.

test('un sí dicho con naturalidad confirma', () => {
  for (const text of ['dale', 'Dale, así está bien', 'sí', 'si', 'Sí, perfecto', 'ok', 'Okey', 'listo', 'Listo!', 'va', 'de una', 'hazlo', 'Hágale', 'adelante', 'correcto', 'exacto', 'perfecto, gracias', 'así está bien', 'está bien', 'sí por favor', 'claro que sí', 'bueno', 'confirmo', 'dale 👍', '👍', 'sip', 'de una, gracias Bria', 'súper', 'listo, procede', 'sale', 'obvio']) {
    assert.equal(isPlainAgreement(text), true, text);
  }
});

test('un sí con un cambio, una duda o una negación no confirma', () => {
  for (const text of ['dale pero ponle fecha mañana', 'sí, cambia el responsable a Melissa', 'ok, que sea urgente', 'no', 'mejor no', 'listo para el viernes', 'sí, para el 25', '¿está bien así?', 'dale, y crea otro para Kamila', 'bien pero falta el cliente', 'perfecto excepto la fecha', '', '   ', 'sí sí sí sí sí sí sí sí sí sí', 'no está bien']) {
    assert.equal(isPlainAgreement(text), false, text);
  }
});

test('el verbo de la acción también confirma, pero solo el de esa acción («sí, bórralo» no crea, «sí, créalo» no borra)', () => {
  const del = { verbs: ACTION_VERBS.TASK_DELETE }, create = { verbs: ACTION_VERBS.TASK_CREATE }, dispatch = { verbs: ACTION_VERBS.DISPATCH };
  for (const text of ['sí bórralo', 'dale bórralo', 'Dale, bórralo', 'bórralo', 'sí, elimínalo', 'dale, bórralo ya', 'sí, borra ese pendiente', 'elimínalo de una']) {
    assert.equal(isPlainAgreement(text, del), true, text);
    assert.equal(isPlainAgreement(text, create), false, `${text} no crea`);
  }
  for (const text of ['sí, créalo', 'dale créalo', 'créamelo', 'créalo así']) {
    assert.equal(isPlainAgreement(text, create), true, text);
    assert.equal(isPlainAgreement(text, del), false, `${text} no borra`);
  }
  assert.equal(isPlainAgreement('sí, despáchalos', dispatch), true);
  assert.equal(isPlainAgreement('bórralo y crea otro', del), false, 'otra orden adentro no confirma');
  assert.equal(isPlainAgreement('bórralo', {}), false, 'sin verbos de la acción, un verbo solo no basta');
  assert.equal(confirmsAction({ type: 'TASK_DELETE' }, 'sí bórralo', { natural: true }), true);
  assert.equal(confirmsAction({ type: 'TASK_CREATE' }, 'sí bórralo', { natural: true }), false);
});

test('un no dicho con naturalidad cancela; un no con un cambio no', () => {
  for (const text of ['no', 'No, gracias', 'mejor no', 'cancela', 'déjalo así no', 'olvídalo', 'no lo crees', 'no, déjalo', 'nada, cancela', 'no lo borres', 'mejor no lo elimines', 'no, no lo despaches']) assert.equal(isPlainRefusal(text), true, text);
  for (const text of ['no, ponle fecha mañana', 'no es para Melissa, es para Kamila', 'dale', 'no sé', '']) assert.equal(isPlainRefusal(text), false, text);
});

test('vale para cualquier acción de Bria cuando acaba de mostrar su resumen, además de las frases de siempre', () => {
  for (const type of ['TASK_CREATE', 'DISPATCH', 'TASK_DELETE', 'CREATE_PLAN', 'TASK_UPDATE']) {
    assert.equal(confirmsAction({ type }, 'dale, así está bien', { natural: true }), true, type);
    assert.equal(cancelsAction({ type }, 'mejor no', { natural: true }), true, type);
    assert.equal(confirmsAction({ type }, 'dale pero cambia la fecha', { natural: true }), false, type);
    // Fuera del resumen (a mitad de preparar, o después de hecha) un sí o un no suelto es charla, no una orden.
    assert.equal(confirmsAction({ type }, 'ok, gracias'), false, type);
    assert.equal(cancelsAction({ type }, 'no'), false, type);
  }
  assert.equal(confirmsAction({ type: 'TASK_CREATE' }, 'Crear pendiente'), true, 'la frase de siempre sigue valiendo');
  assert.equal(confirmsAction({ type: 'DISPATCH' }, 'Despachar a producción'), true);
});

test('«Crear pendiente» no es un título: sin decir qué hay que hacer, Bria lo pregunta', () => {
  for (const title of ['Crear pendiente', 'crear pendiente', 'Nuevo pendiente', 'Pendiente', 'Tarea', 'nueva tarea', 'Crear tarea urgente', 'Pendiente para hoy', 'un pendiente']) assert.equal(isPlaceholderTaskTitle(title), true, title);
  for (const title of ['Reel de Aristea', 'Revisar pendientes de Kamila', 'Crear parrilla de noviembre', 'Tarea de inglés de Juan']) assert.equal(isPlaceholderTaskTitle(title), false, title);
  const draft = { client: { id: 'c', name: 'Prueba tdd' }, assignee: { id: 'm', name: 'Rodny' }, dueDate: '2026-10-22', priority: 'URGENTE' };
  assert.equal(taskDraftStage({ ...draft, title: 'Crear pendiente' }), 'CONTEXT');
  assert.equal(taskDraftStage({ ...draft, title: 'Reel de Aristea' }), 'READY');
});
