import test from 'node:test';
import assert from 'node:assert/strict';
import { movementType, movementCategory, movementAmount, movementDate, pickReceipt, movementParagraph, MOVEMENT_CATEGORY_LABELS } from '../src/lib/briaMovementDraft.js';

// Registrar un movimiento conversando (Rodny, 22 de octubre de 2026: «que incluso la contadora pueda enviar una imagen
// por WhatsApp y decir: registra este movimiento, este es el comprobante … que se sienta natural, rápido, fluido»).

test('el tipo, como se dice', () => {
  for (const word of ['ingreso', 'entrada', 'nos pagaron', 'cobro', 'INCOME', 'abono recibido']) assert.equal(movementType(word), 'INCOME', word);
  for (const word of ['egreso', 'gasto', 'pago', 'salida', 'compra', 'EXPENSE', 'pagamos']) assert.equal(movementType(word), 'EXPENSE', word);
  assert.equal(movementType(''), null);
  assert.equal(movementType('no sé'), null);
});

test('la categoría, por su nombre o por lo que es', () => {
  assert.equal(movementCategory('Nómina'), 'NOMINA');
  assert.equal(movementCategory('impuestos'), 'TAX');
  assert.equal(movementCategory('4x1000 del banco'), 'FINANCIAL');
  assert.equal(movementCategory('pauta en Meta'), 'PAUTA');
  assert.equal(movementCategory('PRESTAMO'), 'PRESTAMO');
  assert.equal(movementCategory('algo raro'), null);
  assert.equal(MOVEMENT_CATEGORY_LABELS.length >= 10, true);
});

test('el valor, como lo escribe la gente o lo lee Bria en el comprobante', () => {
  assert.equal(movementAmount('1.200.000'), 1200000);
  assert.equal(movementAmount('$ 350.500,50'), 350500.5);
  assert.equal(movementAmount(89900), 89900);
  assert.equal(movementAmount('cero'), null);
  assert.equal(movementAmount('-5000'), null, 'nunca negativo: el tipo dice si entra o sale');
});

test('la fecha mira hacia atrás: un movimiento ya pasó', () => {
  const today = '2026-10-22'; // jueves
  assert.equal(movementDate('hoy', today), '2026-10-22');
  assert.equal(movementDate('ayer', today), '2026-10-21');
  assert.equal(movementDate('antier', today), '2026-10-20');
  assert.equal(movementDate('el lunes', today), '2026-10-19');
  assert.equal(movementDate('jueves', today), '2026-10-22');
  assert.equal(movementDate('15 de octubre', today), '2026-10-15');
  assert.equal(movementDate('2026-10-03', today), '2026-10-03');
  assert.equal(movementDate('20 de diciembre', today), '2025-12-20', 'una fecha sin año que caería en el futuro es del año pasado');
  assert.equal(movementDate('mañana', today), null);
  assert.equal(movementDate('', today), null);
});

test('el comprobante: el que se nombra, el último de esta respuesta o el último del chat; nunca un archivo que no es imagen ni PDF', () => {
  const files = [
    { id: 'f3', name: 'factura.pdf', status: 'PDF', current: true },
    { id: 'f2', name: 'recibo.jpg', status: 'IMAGE', current: false },
    { id: 'f1', name: 'notas.docx', status: 'READ', current: false }
  ];
  assert.equal(pickReceipt(files, 'recibo').id, 'f2');
  assert.equal(pickReceipt(files, null).id, 'f3', 'sin decir cuál, el que llegó con este mensaje');
  assert.equal(pickReceipt(files.slice(1), 'el último').id, 'f2');
  assert.equal(pickReceipt(files.slice(1), null), null, 'sin pedirlo y sin archivo en este mensaje, no se adjunta nada');
  assert.equal(pickReceipt([files[2]], 'notas'), null);
  assert.equal(pickReceipt([], 'el último'), null);
});

test('lo que se lee antes de confirmar es un párrafo, sin nombres técnicos', () => {
  const text = movementParagraph({ type: 'EXPENSE', amount: 1200000, date: '2026-10-21', accountName: 'Bancolombia', category: 'ADMINISTRATIVO', concept: 'Licencia de Canva', counterparty: 'Canva', clientName: null, receiptName: 'recibo.jpg' });
  assert.equal(text, 'Registro un egreso de $1.200.000 del 21 de octubre de 2026 en Bancolombia, categoría Administrativo: Licencia de Canva, a Canva. Le pego el comprobante recibo.jpg.');
  assert.doesNotMatch(text, /amount|accountId|EXPENSE|category:/);
  const income = movementParagraph({ type: 'INCOME', amount: 3500000.5, date: '2026-10-22', accountName: 'Davivienda', category: 'SERVICIO', concept: 'Pago de octubre', counterparty: null, clientName: 'Aristea', receiptName: null });
  assert.equal(income, 'Registro un ingreso de $3.500.000,50 del 22 de octubre de 2026 en Davivienda, categoría Servicio: Pago de octubre, de Aristea.');
});
