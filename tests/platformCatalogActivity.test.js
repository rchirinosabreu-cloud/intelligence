import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM_OPERATIONS } from '../src/lib/platformCatalog.js';
import { createBriaPlatformClient } from '../src/lib/briaPlatformClient.js';

test('un rechazo de la plataforma llega a Bria con su detalle, no solo con el titular', async () => {
  const reply = (status, body) => ({ status, headers: { get: () => 'application/json' }, json: async () => body, text: async () => JSON.stringify(body) });
  const client = createBriaPlatformClient({ baseUrl: 'http://x', fetchFn: async () => reply(422, { error: 'Revisa los datos del evento', code: 'INVALID_EVENT_TYPE', details: 'El tipo de evento no es válido.' }) });
  const result = await client.call({ token: 't', method: 'POST', path: '/activity/events', body: {} });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'Revisa los datos del evento: El tipo de evento no es válido.');
  const same = createBriaPlatformClient({ baseUrl: 'http://x', fetchFn: async () => reply(409, { error: 'Ya existe', details: 'Ya existe' }) });
  assert.equal((await same.call({ token: 't', method: 'POST', path: '/x', body: {} })).error, 'Ya existe', 'sin repetir lo mismo dos veces');
});

// Crear un evento de Actividad con las manos de Bria (Rodny, 22 de octubre de 2026: «Crea un evento de todo el día de
// hoy que ponga a Helen como ausente por enfermedad»). La plataforma lo rechazó dos veces porque el mapa no decía que
// el tipo es obligatorio ni de dónde sale la cuenta de Google: Bria armó el cuerpo sin `type` y con la cuenta en null.

test('el mapa dice todo lo que exige crear un evento: tipo, todo el día y la cuenta de Google de donde sale', () => {
  const create = PLATFORM_OPERATIONS['POST /activity/events'];
  for (const word of ['type', 'PRODUCTION', 'PROJECT', 'MEETING', 'ABSENCE', 'BREAK', 'isAllDay', 'googleConnectionId', 'GET /activity/google-calendar/connections', 'attendeeEmails', 'recurrence']) {
    assert.ok(create.campos.includes(word), `falta «${word}» en los campos de crear un evento`);
  }
  assert.match(create.que, /obligatori/i);
  const edit = PLATFORM_OPERATIONS['PATCH /activity/events/:id'];
  assert.ok(edit.campos.includes('type') && edit.campos.includes('isAllDay'));
});
