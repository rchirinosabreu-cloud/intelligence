// El lector que parte los documentos de claves del Drive en una cuenta por fila (9 de octubre de 2026). Todos
// los datos de esta prueba son inventados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAccessText, accessFingerprint } from '../scripts/lib/vaultImportParser.js';

const pick = (entries) => entries.map(({ platform, username, secret, url, notes }) => ({ platform, username, secret, url: url || null, notes: notes || null }));

test('a flattened four-column table becomes one access per row, with wrapped cells and dashes handled', () => {
  const text = [
    'NOMBRE DEL CLIENTE', '3 acceso(s) registrado(s)', 'PLATAFORMA / ACCESO',
    '|USUARIO / CORREO', '|CONTRASEÑA', '|OBSERVACIONES',
    '|Instagram', '|cuenta.ficticia', '|Clave-Falsa-1', '|—',
    '|Facebook', '|3000000000', '|Clave-Falsa-2', '|Doble factor al celular',
    'de la PM',
    '|Biosite', '|—', '|—', '|—',
    '|Capcut', '|correo@ficticio.com', '-', '|Clave-Falsa-3', '|—',
    '|', '', 'Texto suelto después'
  ].join('\n');
  const { entries, leftover } = parseAccessText(text);
  assert.deepEqual(pick(entries), [
    { platform: 'Instagram', username: 'cuenta.ficticia', secret: 'Clave-Falsa-1', url: null, notes: null },
    { platform: 'Facebook', username: '3000000000', secret: 'Clave-Falsa-2', url: null, notes: 'Doble factor al celular\nde la PM' },
    { platform: 'CapCut', username: 'correo@ficticio.com', secret: 'Clave-Falsa-3', url: null, notes: null }
  ]);
  assert.match(leftover, /Texto suelto después/);
  assert.doesNotMatch(leftover, /Clave-Falsa/);
});

test('the exported Access Book writes « | value» with a space before the pipe', () => {
  const text = ['PABLO FICTICIO', '2 acceso(s) registrado(s)', 'PLATAFORMA / ACCESO', ' | USUARIO / CORREO', ' | CONTRASEÑA', ' | OBSERVACIONES', ' | Instagram', 'personal', ' | cuenta.ficticia', ' | Clave-Falsa-12', ' | —', ' | Tik Tok', ' | 3001234567', ' | Clave-Falsa-13', ' | —', ' |'].join('\n');
  const { entries } = parseAccessText(text);
  assert.deepEqual(entries.map((e) => [e.platform, e.username, e.secret, e.notes]), [['Instagram', 'cuenta.ficticia', 'Clave-Falsa-12', 'personal'], ['TikTok', '3001234567', 'Clave-Falsa-13', null]]);
});

test('a header with only three pipe lines and empty cells as «|» works the same', () => {
  const text = ['Plataforma', '|Usuario / correo', '|Contraseña', '|Observaciones', '|Canva', '|uno@ficticio.com', '|Clave-Falsa-4', '|', '|ChatGPT', '|dos@ficticio.com', '|', '|', '|Gmail', '|tres@ficticio.com', '|Clave-Falsa-5', '|'].join('\n');
  const { entries } = parseAccessText(text);
  assert.deepEqual(entries.map((e) => [e.platform, e.username, e.secret]), [['Canva', 'uno@ficticio.com', 'Clave-Falsa-4'], ['ChatGPT', 'dos@ficticio.com', null], ['Gmail', 'tres@ficticio.com', 'Clave-Falsa-5']]);
});

test('a spreadsheet export maps columns by their header, extra cells go to notes', () => {
  const text = ['=== Hoja: Fundación (3 filas) ===', 'Plataforma | | | Usuario | | | | Contraseña', 'Youtube Oficial | | | canal@ficticio.org | | | | Clave-Falsa-6', 'Facebook | | | https://facebook.com/ficticia | | | | Clave-Falsa-7 | recuperación por SMS'].join('\n');
  const { entries } = parseAccessText(text);
  assert.deepEqual(pick(entries), [
    { platform: 'YouTube Oficial', username: 'canal@ficticio.org', secret: 'Clave-Falsa-6', url: null, notes: null },
    { platform: 'Facebook', username: null, secret: 'Clave-Falsa-7', url: 'https://facebook.com/ficticia', notes: 'recuperación por SMS' }
  ]);
});

test('free notes: a title, a user line and a labelled password make one access; an unlabelled pair counts too', () => {
  const text = ['Instagram', '', '', 'cuenta@ficticia.com', 'Contraseña: Clave-Falsa-8', '', '', 'Facebook:', 'Usuario: 3001112233', 'Clave: Clave-Falsa-9', '', 'Página web', 'Link: https://ficticia.com/wp-admin', 'Usuario: admin', 'Password: Clave-Falsa-10', '', 'Nota general sin clave'].join('\n');
  const { entries, leftover } = parseAccessText(text);
  assert.deepEqual(pick(entries), [
    { platform: 'Instagram', username: 'cuenta@ficticia.com', secret: 'Clave-Falsa-8', url: null, notes: null },
    { platform: 'Facebook', username: '3001112233', secret: 'Clave-Falsa-9', url: null, notes: null },
    { platform: 'Página web', username: 'admin', secret: 'Clave-Falsa-10', url: 'https://ficticia.com/wp-admin', notes: null }
  ]);
  assert.match(leftover, /Nota general sin clave/);
});

test('an email with a platform prefix splits into platform and user; a user without a password is not an access', () => {
  const { entries, leftover } = parseAccessText(['Gmail: equipo@ficticio.com', 'Contraseña: Clave-Falsa-11', '', 'Correo de soporte', 'soporte@ficticio.com'].join('\n'));
  assert.deepEqual(entries.map((e) => [e.platform, e.username, e.secret]), [['Gmail', 'equipo@ficticio.com', 'Clave-Falsa-11']]);
  assert.match(leftover, /soporte@ficticio\.com/, 'what is not clearly an access stays as a note, never lost');
});

test('«Aplicación» is a platform column; a one-character password is not an access; stray punctuation leaves the name', () => {
  const text = ['Aplicación', ' | Usuario/Correo', ' | Contraseña', ' | Observaciones', ' | Twitter;', ' | uno@ficticio.com', ' | Clave-Falsa-14', ' |', ' | Índice', ' | x@ficticio.com', ' | 1', ' |'].join('\n');
  const { entries, leftover } = parseAccessText(text);
  assert.deepEqual(entries.map((e) => [e.platform, e.username, e.secret]), [['Twitter', 'uno@ficticio.com', 'Clave-Falsa-14'], ['Índice', 'x@ficticio.com', null]]);
  assert.equal(entries[1].notes, 'Contraseña: 1', 'kept as a note, never dropped');
  assert.equal(leftover, '');
});

// 10 de octubre de 2026: en el Drive una celda estrecha partía el correo («…@gmail.co» y «m» en la línea
// siguiente); el usuario quedaba cortado y la «m» como nota.
test('an email cut across two lines is joined back, in a flattened table and in free notes', () => {
  const table = ['Plataforma', '|Usuario / correo', '|Contraseña', '|Observaciones', '|CapCut', '|coordinador@ficticio.co', 'm', '|Clave-Falsa-20', '|', '|Instagram', '|equipo@ficticio.com', 'viejo', '|Clave-Falsa-21', '|'].join('\n');
  const { entries } = parseAccessText(table);
  assert.deepEqual(entries.map((e) => [e.platform, e.username, e.secret, e.notes]), [
    ['CapCut', 'coordinador@ficticio.com', 'Clave-Falsa-20', null],
    ['Instagram', 'equipo@ficticio.com', 'Clave-Falsa-21', 'viejo']
  ], 'a tail that completes the ending joins; a word after a whole email is still a note');
  const free = parseAccessText(['CapCut', 'coordinador@ficticio.co', 'm', 'Contraseña: Clave-Falsa-22'].join('\n'));
  assert.deepEqual(free.entries.map((e) => [e.platform, e.username, e.secret]), [['CapCut', 'coordinador@ficticio.com', 'Clave-Falsa-22']]);
});

test('the fingerprint finds the same account across documents, regardless of case and spacing', () => {
  assert.equal(accessFingerprint({ platform: 'Capcut', username: 'Uno@Ficticio.com ', secret: 'X1' }), accessFingerprint({ platform: 'CapCut', username: 'uno@ficticio.com', secret: 'X1' }));
  assert.notEqual(accessFingerprint({ platform: 'CapCut', username: 'uno@ficticio.com', secret: 'X1' }), accessFingerprint({ platform: 'CapCut', username: 'uno@ficticio.com', secret: 'X2' }));
});
