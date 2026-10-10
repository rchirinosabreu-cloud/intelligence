// Un correo partido en dos líneas por una celda estrecha del Drive (10 de octubre de 2026). Datos inventados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { joinWrappedEmail, sameAccountUser, repairWrappedUsername } from '../scripts/lib/vaultWrappedUsername.js';

test('a short tail that completes a known ending joins the email; anything else does not', () => {
  assert.equal(joinWrappedEmail('equipo@ficticio.co', 'm'), 'equipo@ficticio.com');
  assert.equal(joinWrappedEmail('equipo@ficticio.c', 'om'), 'equipo@ficticio.com');
  assert.equal(joinWrappedEmail('equipo@ficticio', '.com'), 'equipo@ficticio.com');
  assert.equal(joinWrappedEmail('equipo@ficticio.com', '.co'), 'equipo@ficticio.com.co');
  assert.equal(joinWrappedEmail('equipo@ficticio.com', 'viejo'), null, 'a word after a complete email is a note');
  assert.equal(joinWrappedEmail('equipo@ficticio.com', 'm'), null, '«comm» is not an ending');
  assert.equal(joinWrappedEmail('cuenta.ficticia', 'personal'), null, 'no @, no email');
  assert.equal(joinWrappedEmail('equipo@ficticio.co', 'doble factor'), null, 'a tail with spaces is a note');
  assert.equal(joinWrappedEmail('equipo@ficticio.co', ''), null);
});

test('the same account is recognised when one username is the other with the email cut', () => {
  assert.equal(sameAccountUser('Equipo@Ficticio.com', 'equipo@ficticio.com'), true);
  assert.equal(sameAccountUser('equipo@ficticio.co', 'equipo@ficticio.com'), true);
  assert.equal(sameAccountUser('equipo@ficticio.com', 'equipo@ficticio.co'), true);
  assert.equal(sameAccountUser('equipo@ficticio.com', 'equipo2@ficticio.com'), false);
  assert.equal(sameAccountUser('equipo', 'equipo@ficticio.com'), false, 'a bare prefix without @ is not the same user');
  assert.equal(sameAccountUser('', 'equipo@ficticio.com'), false);
});

test('a stored access with the tail in its notes gets the whole email and loses the redundant note', () => {
  const fixed = repairWrappedUsername({ username: 'equipo@ficticio.co', notes: 'm\nOtro usuario anotado en «Accesos Brain»: equipo@ficticio.com' });
  assert.deepEqual(fixed, { username: 'equipo@ficticio.com', notes: null });
  const withRealNote = repairWrappedUsername({ username: 'equipo@ficticio.co', notes: 'm\nEl código llega al celular de la PM' });
  assert.deepEqual(withRealNote, { username: 'equipo@ficticio.com', notes: 'El código llega al celular de la PM' });
});

test('an email cut into three lines is joined line after line', () => {
  assert.deepEqual(repairWrappedUsername({ username: 'nombre.apellido@', notes: 'gmail.co\nm\nClave del correo personal' }), { username: 'nombre.apellido@gmail.com', notes: 'Clave del correo personal' });
});

test('when the whole email only lives in the «other user» note, it becomes the username', () => {
  const fixed = repairWrappedUsername({ username: 'equipo@ficticio.co', notes: 'Otro usuario anotado en «Formato»: equipo@ficticio.com' });
  assert.deepEqual(fixed, { username: 'equipo@ficticio.com', notes: null });
  const twin = repairWrappedUsername({ username: 'equipo@ficticio.com', notes: 'Otro usuario anotado en «Accesos Brain»: equipo@ficticio.co' });
  assert.deepEqual(twin, { username: 'equipo@ficticio.com', notes: null }, 'the cut copy noted on the whole one is just noise');
});

test('an access with nothing wrong returns null, so nothing is written', () => {
  assert.equal(repairWrappedUsername({ username: 'equipo@ficticio.com', notes: 'Doble factor al celular' }), null);
  assert.equal(repairWrappedUsername({ username: 'equipo@ficticio.com', notes: 'Otro usuario anotado en «Formato»: otro@ficticio.com' }), null, 'a genuinely different user stays noted');
  assert.equal(repairWrappedUsername({ username: '3001234567', notes: 'm' }), null);
  assert.equal(repairWrappedUsername({ username: null, notes: null }), null);
});
