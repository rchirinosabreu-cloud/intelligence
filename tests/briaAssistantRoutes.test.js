import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { createBriaAssistantRouter } from '../src/routes/api/briaAssistant.js';
import { createRateLimiter } from '../src/config/security.js';

// La puerta de la asistente: quien pregunta es quien está en la sesión, la pregunta es obligatoria, un
// fallo del servidor nunca cuenta detalles técnicos, y un bloqueo de Gobierno de IA se explica tal cual.

const buildApp = ({ role = 'EDITOR', service, max = 20 } = {}) => {
  const calls = [];
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { userId: 'u-actual', role, modulePermissions: {} }; next(); });
  app.use('/bria', createBriaAssistantRouter({
    service: service || { ask: async (args) => { calls.push(args); return { answer: 'Hola', sources: [], toolsUsed: [], failures: [], rounds: 0 }; } },
    rateLimiter: createRateLimiter({ windowMs: 60_000, max, keyGenerator: (req) => req.user?.userId || req.ip }),
    logger: { error() {} }
  }));
  return { app, calls };
};

const withServer = async (app, run) => {
  const server = await new Promise((resolve) => { const running = app.listen(0, '127.0.0.1', () => resolve(running)); });
  try { await run(`http://127.0.0.1:${server.address().port}/bria`); } finally { server.close(); }
};
const post = (body) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('the question travels with the identity of the session, never with a user from the body', async () => {
  const { app, calls } = buildApp();
  await withServer(app, async (base) => {
    const response = await fetch(`${base}/ask`, post({ question: '¿Qué tengo hoy?', history: [{ role: 'user', text: 'hola' }], user: { userId: 'spoofed', role: 'ADMIN' } }));
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { answer: 'Hola', sources: [], toolsUsed: [], failures: [], rounds: 0 });
    assert.equal(calls[0].user.userId, 'u-actual');
    assert.equal(calls[0].user.role, 'EDITOR');
    assert.equal(calls[0].question, '¿Qué tengo hoy?');
    assert.deepEqual(calls[0].history, [{ role: 'user', text: 'hola' }]);
  });
});

test('errors with a status keep their message; server errors hide their cause', async () => {
  const thrower = (error) => ({ ask: async () => { throw error; } });
  const cases = [
    [Object.assign(new Error('Escribe una pregunta.'), { status: 400, code: 'BRIA_QUESTION_REQUIRED' }), 400, /Escribe una pregunta/],
    [Object.assign(new Error('Bria no está disponible en este momento.'), { status: 503, code: 'OPENAI_NOT_AVAILABLE' }), 503, /no está disponible/],
    [Object.assign(new Error('Uso de IA bloqueado: hay una empresa protegida.'), { status: 403, code: 'AI_SCOPE_REQUIRED' }), 403, /empresa protegida/],
    [new Error('connect ECONNREFUSED postgres://secret'), 500, /no pudo responder/]
  ];
  for (const [error, status, pattern] of cases) {
    const { app } = buildApp({ service: thrower(error) });
    await withServer(app, async (base) => {
      const response = await fetch(`${base}/ask`, post({ question: 'x' }));
      assert.equal(response.status, status);
      const body = await response.json();
      assert.match(body.message, pattern);
      assert.doesNotMatch(JSON.stringify(body), /postgres|ECONNREFUSED/);
      if (error.code) assert.equal(body.error, error.code);
    });
  }
});

test('a person cannot flood Bria: the limit is per person and per minute', async () => {
  const { app } = buildApp({ max: 2 });
  await withServer(app, async (base) => {
    assert.equal((await fetch(`${base}/ask`, post({ question: '1' }))).status, 200);
    assert.equal((await fetch(`${base}/ask`, post({ question: '2' }))).status, 200);
    assert.equal((await fetch(`${base}/ask`, post({ question: '3' }))).status, 429);
  });
});

test('the route is mounted behind authentication and the AI request context', () => {
  const source = readFileSync(new URL('../src/routes/index.js', import.meta.url), 'utf8');
  const auth = source.indexOf('router.use(authenticateToken)');
  const context = source.indexOf('router.use(aiRequestContextMiddleware)');
  const mount = source.indexOf("router.use('/bria', createBriaAssistantRouter())");
  assert.ok(auth > 0 && context > auth && mount > context, 'la ruta de Bria va después de la autenticación y del contexto de IA');
});
