import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as security from '../src/config/security.js';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('request logging removes credentials and sensitive query values', () => {
  assert.equal(typeof security.sanitizeUrlForLogs, 'function');
  const sanitized = security.sanitizeUrlForLogs('/api/files?token=secret-jwt&code=123456&filename=brief.pdf');
  assert.doesNotMatch(sanitized, /secret-jwt|123456/);
  assert.match(sanitized, /token=%5BREDACTED%5D/);
  assert.match(sanitized, /filename=brief.pdf/);
});

test('password reset codes use cryptographic integer generation', async () => {
  const service = await read('src/services/passwordResetService.js');
  assert.match(service, /randomInt\(/);
  assert.doesNotMatch(service, /Math\.random/);
});

test('authentication responses do not expose internal exception details', async () => {
  const auth = await read('src/controllers/authController.js');
  const middleware = await read('src/middlewares/authMiddleware.js');

  assert.doesNotMatch(auth, /details:\s*error\.message/);
  assert.doesNotMatch(middleware, /details:\s*err\.message/);
});

test('unexpected process failures terminate so the platform can restart cleanly', async () => {
  const server = await read('server.js');
  assert.match(server, /process\.on\('unhandledRejection',[\s\S]*process\.exit\(1\)/);
  assert.match(server, /process\.on\('uncaughtException',[\s\S]*process\.exit\(1\)/);
  assert.doesNotMatch(server, /if\s*\(error\.message\.includes\('EADDRINUSE'\)\)/);
});

test('login and account provisioning reject inactive or invalid accounts before issuing credentials', async () => {
  const auth = await read('src/controllers/authController.js');

  assert.match(auth, /!user\s*\|\|\s*user\.isActive\s*===\s*false/);
  assert.match(auth, /normalizeEmail\(email\)/);
  assert.match(auth, /ALLOWED_SYSTEM_ROLES\.has/);
  assert.match(auth, /ALLOWED_FINANCIAL_ROLES\.has/);
  assert.match(auth, /password\.length\s*<\s*MIN_PASSWORD_LENGTH/);
});
