import test from 'node:test';
import assert from 'node:assert/strict';
import router, { sendOperationalEventSaveError } from '../src/routes/api/activity.js';
import prisma from '../src/lib/prisma.js';

const response = () => ({
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

for (const [code, status] of [
  ['INVALID_GOOGLE_CALENDAR_ACCOUNT', 422],
  ['GOOGLE_CALENDAR_MOVE_REQUIRED', 409],
  ['GOOGLE_CALENDAR_ACCOUNT_MISMATCH', 409],
  ['GOOGLE_CALENDAR_DESTINATION_MISMATCH', 409]
]) {
  test(`calendar API reports ${code} as ${status} with the actionable explanation`, () => {
    const res = response();
    sendOperationalEventSaveError(res, { code, message: 'Revisa la cuenta seleccionada.' }, 'Unexpected error');
    assert.equal(res.statusCode, status);
    assert.equal(res.body.code, code);
    assert.equal(res.body.details, 'Revisa la cuenta seleccionada.');
  });
}

test('a routing failure after durable persistence still tells the client to recover the existing event', () => {
  const res = response();
  sendOperationalEventSaveError(res, { code: 'GOOGLE_CALENDAR_ACCOUNT_MISMATCH', eventId: 'persisted', preserveLocal: true }, 'Unexpected error');
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.eventId, 'persisted');
  assert.equal(res.body.preserveLocal, true);
});

test('the Meet endpoint rejects a missing account before any default-account lookup', async () => {
  let reads = 0;
  const original = prisma.googleCalendarConnection.findMany;
  prisma.googleCalendarConnection.findMany = async () => { reads++; return []; };
  const handler = router.stack.find(layer => layer.route?.path === '/events/generate-meet').route.stack.at(-1).handle;
  try {
    for (const googleConnectionId of [undefined, '', '   ', [], {}]) {
      const res = response();
      await handler({ body: { title: 'Meet test', googleConnectionId } }, res);
      assert.equal(res.statusCode, 422);
      assert.equal(res.body.code, 'INVALID_GOOGLE_CALENDAR_ACCOUNT');
    }
    assert.equal(reads, 0, 'An absent selection must never authorize a different account');
  } finally { prisma.googleCalendarConnection.findMany = original; }
});
