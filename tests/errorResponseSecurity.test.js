import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizeErrorPayload } from '../src/config/security.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('server error payloads retain stable codes but remove implementation details', () => {
  assert.deepEqual(
    sanitizeErrorPayload({
      error: 'Prisma failed at table User',
      message: 'connect ECONNREFUSED 10.0.0.2',
      details: 'password=secret',
      stack: 'stack trace',
      requestId: 'req-1'
    }, 500),
    {
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Ocurrió un error inesperado',
      requestId: 'req-1'
    }
  );

  assert.deepEqual(
    sanitizeErrorPayload({ error: 'NARRATIVE_GENERATION_FAILED', details: 'provider secret' }, 502),
    { error: 'NARRATIVE_GENERATION_FAILED', message: 'Ocurrió un error inesperado' }
  );
});

test('validation responses preserve useful messages while stripping debug fields', () => {
  assert.deepEqual(
    sanitizeErrorPayload({ error: 'Campo requerido', details: 'internal validator path' }, 400),
    { error: 'Campo requerido' }
  );
});

test('Express installs the response sanitizer before API routes', async () => {
  const server = await read('server.js');
  const sanitizerPosition = server.indexOf('app.use(errorResponseSanitizer)');
  const apiPosition = server.indexOf("app.use('/api', apiRouter)");

  assert.ok(sanitizerPosition > 0);
  assert.ok(apiPosition > sanitizerPosition);
});
