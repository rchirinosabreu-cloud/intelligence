import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('CORS rejects unexpected origins while preserving Brainstudio and local origins', async () => {
  const { isAllowedOrigin } = await import('../src/config/security.js');

  assert.equal(isAllowedOrigin(undefined), true);
  assert.equal(isAllowedOrigin('https://intelligence.brainstudioagencia.com'), true);
  assert.equal(isAllowedOrigin('https://preview.brainstudioagencia.com'), true);
  assert.equal(isAllowedOrigin('http://localhost:3000'), true);
  assert.equal(isAllowedOrigin('https://evil.example'), false);
});

test('production authentication refuses to start without a strong JWT secret', async () => {
  const { validateSecurityEnvironment } = await import('../src/config/security.js');

  assert.throws(
    () => validateSecurityEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'postgres://db' }),
    /JWT_SECRET/
  );
  assert.throws(
    () => validateSecurityEnvironment({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://db',
      JWT_SECRET: 'short'
    }),
    /JWT_SECRET/
  );
  assert.doesNotThrow(() => validateSecurityEnvironment({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://db',
    JWT_SECRET: 'a-secure-production-secret-with-at-least-32-characters'
  }));
});

test('authentication code contains no fallback JWT or login-time admin bootstrap', async () => {
  const middleware = await read('src/middlewares/authMiddleware.js');
  const controller = await read('src/controllers/authController.js');

  assert.doesNotMatch(middleware, /brainstudio-secret-key/);
  assert.doesNotMatch(controller, /brainstudio-secret-key/);
  assert.doesNotMatch(controller, /userCount\s*===\s*0/);
  assert.doesNotMatch(controller, /password123/);
});

test('synchronization remains manager-only and the retired AI proxy is absent', async () => {
  const routes = await read('src/routes/index.js');
  const server = await read('server.js');

  assert.match(routes, /router\.post\('\/sync-users',\s*requireManagerRole,\s*authController\.syncUsers\)/);
  assert.doesNotMatch(routes, /router\.get\('\/sync-users'/);
  assert.doesNotMatch(server, /\/api\/gemini|geminiProxy/);
});

test('the current-user endpoint has a real Prisma dependency', async () => {
  const routes = await read('src/routes/index.js');
  assert.match(routes, /import prisma from '\.\.\/lib\/prisma\.js'/);
});
