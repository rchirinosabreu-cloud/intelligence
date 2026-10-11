// Qué correo merece un aviso de Bria (11 de octubre de 2026): reglas puras, sin cuerpo del correo en el resultado.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assessMail, matchClient, describeMail, gmailLink, isNoise, addressOf, domainOf } from '../src/lib/mailImportance.js';

const clients = [{ name: 'Aristea', slug: 'aristea', emails: ['maria@aristea.co'], domains: ['aristea.co'] }, { name: 'Foobespain', slug: 'foobespain', emails: ['pedro.wine@gmail.com'], domains: [] }];
const ours = ['social.brainstudio@gmail.com', 'contacto@brainstudioagencia.com'];

test('a client is matched by exact address or by its own domain, never by a free-mail domain', () => {
  assert.equal(addressOf('María Pérez <Maria@Aristea.co>'), 'maria@aristea.co');
  assert.equal(domainOf('maria@aristea.co'), 'aristea.co');
  assert.equal(matchClient('María <maria@aristea.co>', clients).name, 'Aristea');
  assert.equal(matchClient('otro@aristea.co', clients).name, 'Aristea', 'same company domain');
  assert.equal(matchClient('pedro.wine@gmail.com', clients).name, 'Foobespain', 'exact free-mail address');
  assert.equal(matchClient('cualquiera@gmail.com', clients), null, 'gmail.com is not a company');
});

test('mail from a client asking for changes or money is high; a stranger saying only «urgente» is not a fact', () => {
  const changes = assessMail({ from: 'maria@aristea.co', fromName: 'María', subject: 'Cambios al reel de octubre', snippet: 'No nos gustó el cierre, por favor ajustar.' }, { clients, ourAddresses: ours });
  assert.deepEqual([changes.severity, changes.reasons, changes.client.name], [3, ['CLIENTE', 'CAMBIOS'], 'Aristea']);
  const money = assessMail({ from: 'desconocido@empresa.com', subject: 'Factura pendiente de septiembre', snippet: '' }, { clients, ourAddresses: ours });
  assert.deepEqual([money.severity, money.reasons, money.client], [2, ['DINERO'], null]);
  assert.equal(assessMail({ from: 'alguien@otro.com', subject: 'Urgente', snippet: 'Léeme ya' }, { clients, ourAddresses: ours }), null);
  const reply = assessMail({ from: 'nuevo@prospecto.com', subject: 'Re: Propuesta Brain Studio', snippet: 'Gracias, lo revisamos.', inReplyTo: '<x@brain>' }, { clients, ourAddresses: ours });
  assert.deepEqual(reply.reasons, ['DINERO', 'RESPUESTA']);
});

test('noise, our own addresses and empty senders never become facts', () => {
  assert.equal(isNoise({ from: 'no-reply@meta.com', subject: 'Hola' }), true);
  assert.equal(isNoise({ from: 'maria@aristea.co', subject: 'Tu factura de Claro' }), true);
  assert.equal(assessMail({ from: 'noreply@google.com', subject: 'Alerta de seguridad' }, { clients, ourAddresses: ours }), null);
  assert.equal(assessMail({ from: 'contacto@brainstudioagencia.com', subject: 'Factura', snippet: '' }, { clients, ourAddresses: ours }), null, 'what we sent ourselves');
  assert.equal(assessMail({ from: '', subject: 'Factura' }, { clients, ourAddresses: ours }), null);
});

test('the fact says who, what and why, without the body, and links to the message in Gmail', () => {
  const message = { from: 'maria@aristea.co', fromName: 'María Pérez', subject: 'Aprobación de la parrilla de noviembre y pago de octubre', snippet: 'Cuerpo largo que no debe aparecer', messageId: '<abc.123@mail.aristea.co>' };
  const assessment = assessMail(message, { clients, ourAddresses: ours });
  const text = describeMail(message, assessment, { mailboxLabel: 'contacto@' });
  assert.equal(text, 'Correo en contacto@ de Aristea de María Pérez (maria@aristea.co): «Aprobación de la parrilla de noviembre y pago de octubre» — de un cliente, habla de dinero o contrato, habla de una aprobación.');
  assert.doesNotMatch(text, /Cuerpo largo/);
  assert.equal(gmailLink('<abc.123@mail.aristea.co>'), 'https://mail.google.com/mail/u/0/#search/rfc822msgid%3Aabc.123%40mail.aristea.co');
  assert.equal(gmailLink(''), null);
});
