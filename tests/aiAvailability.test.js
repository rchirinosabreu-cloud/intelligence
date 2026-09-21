import test from 'node:test';
import assert from 'node:assert/strict';
import { isProviderUnavailable } from '../src/lib/aiAvailability.js';

test('an outage of the provider is told apart from work that genuinely failed', () => {
  // The provider could not serve us: the work never got a real chance.
  for (const error of [
    { status: 429, code: 'credit_balance_exhausted' },
    { code: 'insufficient_quota' },
    { code: 'rate_limit_exceeded' },
    { status: 503 },
    { status: 502 },
    { status: 504 },
    { code: 'OPENAI_TIMEOUT' },
    { code: 'OPENAI_NOT_CONFIGURED' },
    { code: 'ECONNRESET' },
    { code: 'ETIMEDOUT' },
    { response: { status: 429 } }
  ]) {
    assert.equal(isProviderUnavailable(error), true, JSON.stringify(error));
  }
});

test('a real failure of the work is never excused as an outage', () => {
  for (const error of [
    { status: 400, code: 'invalid_request_error' },
    { status: 401 },
    { status: 403 },
    { code: 'BRIA_REVIEW_INCOMPLETE_BATCH' },
    { code: 'BRIA_REVIEW_CONTEXT_TOO_LARGE' },
    { code: 'BRIA_REVIEW_TIMEOUT' },
    { code: 'FIREFLIES_TRANSCRIPT_EMPTY' },
    new Error('anything else'),
    undefined,
    null
  ]) {
    assert.equal(isProviderUnavailable(error), false, JSON.stringify(error));
  }
});
