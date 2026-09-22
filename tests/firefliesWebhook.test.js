import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  handleFirefliesWebhook,
  isTranscriptionReadyEvent,
  parseFirefliesWebhookPayload,
  verifyFirefliesSignature
} from '../src/services/firefliesWebhookService.js';

const SECRET = 'un-secreto-de-al-menos-16';
const body = { meetingId: 'ASxwZxCstx', eventType: 'Transcription completed', clientReferenceId: null };
const rawBody = Buffer.from(JSON.stringify(body));
const sign = (buffer, secret = SECRET) => crypto.createHmac('sha256', secret).update(buffer).digest('hex');

test('only a body signed with our secret is accepted', () => {
  const signature = sign(rawBody);
  assert.equal(verifyFirefliesSignature({ rawBody, signature, secret: SECRET }), true);
  assert.equal(verifyFirefliesSignature({ rawBody, signature: `sha256=${signature}`, secret: SECRET }), true, 'the sha256= prefix is accepted');
  assert.equal(verifyFirefliesSignature({ rawBody, signature: signature.toUpperCase(), secret: SECRET }), true);

  // Anything else is rejected, including a valid signature of a different body.
  assert.equal(verifyFirefliesSignature({ rawBody, signature: sign(rawBody, 'otro-secreto'), secret: SECRET }), false);
  assert.equal(verifyFirefliesSignature({ rawBody: Buffer.from('{"meetingId":"otra"}'), signature, secret: SECRET }), false);
  assert.equal(verifyFirefliesSignature({ rawBody, signature: 'no-es-una-firma', secret: SECRET }), false);
  assert.equal(verifyFirefliesSignature({ rawBody, signature: '', secret: SECRET }), false);
  assert.equal(verifyFirefliesSignature({ rawBody, signature, secret: '' }), false);
  assert.equal(verifyFirefliesSignature({ rawBody: null, signature, secret: SECRET }), false);
});

test('the payload is read as data: only a usable meeting id gets through, in either version', () => {
  // Version 2 of the Fireflies webhook renamed the fields.
  assert.deepEqual(parseFirefliesWebhookPayload({ event: 'meeting.transcribed', meeting_id: 'ASxwZxCstx', timestamp: 1758500000000 }),
    { meetingId: 'ASxwZxCstx', event: 'meeting.transcribed' });
  assert.deepEqual(parseFirefliesWebhookPayload(body), { meetingId: 'ASxwZxCstx', event: 'Transcription completed' });
  for (const invalid of [null, undefined, {}, { meeting_id: '' }, { meetingId: '   ' }, { meeting_id: 'x'.repeat(300) }, { meetingId: 42 }]) {
    assert.equal(parseFirefliesWebhookPayload(invalid), null, JSON.stringify(invalid));
  }
});

test('only the event that means "the transcript is ready" starts an analysis', () => {
  assert.equal(isTranscriptionReadyEvent('meeting.transcribed'), true);
  assert.equal(isTranscriptionReadyEvent('Transcription completed'), true);
  assert.equal(isTranscriptionReadyEvent(''), true, 'version 1 only ever sent that event');
  // Subscribing to every event must not make Bria analyse a meeting that has no transcript yet.
  assert.equal(isTranscriptionReadyEvent('meeting.bot_joined'), false);
  assert.equal(isTranscriptionReadyEvent('meeting.summarized'), false);
});

const run = async (overrides = {}) => {
  const processed = [];
  const pending = [];
  const result = await handleFirefliesWebhook({
    rawBody, body, signature: sign(rawBody), secret: SECRET,
    processMeeting: async (id) => { processed.push(id); },
    scheduleWork: (work) => pending.push(work),
    logger: { error() {}, info() {} },
    ...overrides
  });
  return { result, processed, pending };
};

test('a signed notification is acknowledged at once and the analysis runs afterwards', async () => {
  const { result, processed, pending } = await run();
  assert.equal(result.status, 202);
  assert.deepEqual(result.body, { accepted: true });
  assert.deepEqual(processed, [], 'the answer must not wait for the analysis');
  assert.equal(pending.length, 1);
  await pending[0]();
  assert.deepEqual(processed, ['ASxwZxCstx']);
});

test('an unsigned or wrongly signed notification changes nothing', async () => {
  for (const signature of ['', 'sha256=deadbeef', sign(rawBody, 'otro-secreto')]) {
    const { result, pending } = await run({ signature });
    assert.equal(result.status, 401);
    assert.equal(pending.length, 0, 'nothing is scheduled for an unverified sender');
  }
});

test('without a configured secret the door stays closed instead of trusting anyone', async () => {
  const { result, pending } = await run({ secret: '', signature: sign(rawBody) });
  assert.equal(result.status, 503);
  assert.equal(pending.length, 0);
});

test('a secret too short to protect anything keeps the door closed and says why', async () => {
  const weak = 'corto';
  const { result, pending } = await run({ secret: weak, signature: sign(rawBody, weak) });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'FIREFLIES_WEBHOOK_SECRET_TOO_SHORT');
  assert.equal(pending.length, 0, 'a correctly signed body is still refused under a weak secret');
});

test('a signed notification without a usable meeting id is refused', async () => {
  const invalidBody = { eventType: 'Transcription completed' };
  const invalidRaw = Buffer.from(JSON.stringify(invalidBody));
  const { result, pending } = await run({ body: invalidBody, rawBody: invalidRaw, signature: sign(invalidRaw) });
  assert.equal(result.status, 400);
  assert.equal(pending.length, 0);
});

test('a version 2 notification is understood and analysed', async () => {
  const v2 = { event: 'meeting.transcribed', timestamp: 1758500000000, meeting_id: 'V2meeting', client_reference_id: null };
  const v2Raw = Buffer.from(JSON.stringify(v2));
  const { result, processed, pending } = await run({ body: v2, rawBody: v2Raw, signature: sign(v2Raw) });
  assert.equal(result.status, 202);
  await pending[0]();
  assert.deepEqual(processed, ['V2meeting']);
});

test('an event that is not the transcript being ready is acknowledged and ignored', async () => {
  for (const event of ['meeting.bot_joined', 'meeting.summarized']) {
    const other = { event, timestamp: 1758500000000, meeting_id: 'V2meeting' };
    const otherRaw = Buffer.from(JSON.stringify(other));
    const { result, pending } = await run({ body: other, rawBody: otherRaw, signature: sign(otherRaw) });
    // 2xx so Fireflies does not mark the delivery as failed, but no work at all.
    assert.equal(result.status, 202);
    assert.equal(result.body.ignored, true);
    assert.equal(pending.length, 0, `${event} must not start an analysis`);
  }
});

test('every refusal leaves a trace, so a failed test can be diagnosed without guessing', async () => {
  const warnings = [];
  const logger = { warn: (...args) => warnings.push(args.join(' ')), error() {}, info() {} };

  await run({ signature: sign(rawBody, 'otro-secreto'), logger });
  assert.match(warnings.at(-1), /firma/i, 'a signature mismatch says so');

  await run({ secret: '', logger });
  assert.match(warnings.at(-1), /secreto/i);

  const bad = { event: 'meeting.transcribed' };
  const badRaw = Buffer.from(JSON.stringify(bad));
  await run({ body: bad, rawBody: badRaw, signature: sign(badRaw), logger });
  assert.match(warnings.at(-1), /reuni[óo]n/i);

  const ignored = { event: 'meeting.bot_joined', meeting_id: 'abc123' };
  const ignoredRaw = Buffer.from(JSON.stringify(ignored));
  await run({ body: ignored, rawBody: ignoredRaw, signature: sign(ignoredRaw), logger });
  assert.match(warnings.at(-1), /meeting\.bot_joined/);

  // The secret itself never reaches the log.
  assert.equal(warnings.some(line => line.includes(SECRET)), false);
});

test('a failing analysis never turns into a 500 that makes Fireflies retry forever', async () => {
  const errors = [];
  const { result, pending } = await run({
    processMeeting: async () => { throw new Error('fixture failure'); },
    logger: { error: (...args) => errors.push(args), info() {} }
  });
  assert.equal(result.status, 202);
  await pending[0]();
  assert.equal(errors.length, 1);
});

test('the webhook is wired as a public route with its raw body preserved', async () => {
  const { readFile } = await import('node:fs/promises');
  const routes = await readFile(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(routes, /minutes\/fireflies\/webhook/);
  assert.match(routes, /handleFirefliesWebhook/);
  // The signature covers the bytes Fireflies sent, not a re-serialized object.
  assert.match(server, /rawBody/);
  assert.match(server, /verify:/);
});
