import test from 'node:test';
import assert from 'node:assert/strict';
import { insertGoogleEventReliably, patchGoogleEventReliably } from '../src/services/googleCalendarWriteReliability.js';

const blocked = { assertEgress: async () => { throw Object.assign(new Error('Unscoped capture'), { status: 403, code: 'AI_SCOPE_REQUIRED' }); } };
test('el bot de Fireflies no recibe invitaciones ni actualizaciones sin permiso', async () => {
  let writes = 0;
  const request = { calendarId: 'test', eventId: 'test', requestBody: { summary: 'Synthetic', id: 'test', attendees: [{ email: 'FRED@fireflies.ai' }] } };
  const calendar = { events: { get: async () => { throw { code: 404 }; }, insert: async () => { writes++; } } };
  await assert.rejects(insertGoogleEventReliably(calendar, request, { governance: blocked }), e => e.code === 'AI_SCOPE_REQUIRED');
  calendar.events.get = async () => ({ data: { summary: 'Previous' } });
  calendar.events.patch = async () => { writes++; };
  await assert.rejects(patchGoogleEventReliably(calendar, request, undefined, { governance: blocked }), e => e.code === 'AI_SCOPE_REQUIRED');
  assert.equal(writes, 0);
});
test('quitar el bot y las reuniones sin bot siguen permitidos', async () => {
  let writes = 0;
  const request = { calendarId: 'test', eventId: 'test', requestBody: { summary: 'Synthetic', attendees: [] } };
  const calendar = { events: { get: async () => ({ data: { summary: 'Previous', attendees: [{ email: 'fred@fireflies.ai' }] } }), patch: async () => { writes++; return { data: {} }; } } };
  await patchGoogleEventReliably(calendar, request, undefined, { governance: blocked });
  assert.equal(writes, 1);
});
