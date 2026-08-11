import test from 'node:test';
import assert from 'node:assert/strict';
import * as security from '../src/config/security.js';

const publicResolver = async () => [{ address: '93.184.216.34' }];

test('private, loopback, link-local, and metadata IPs are rejected', () => {
  assert.equal(security.isPrivateIpAddress('127.0.0.1'), true);
  assert.equal(security.isPrivateIpAddress('10.0.0.8'), true);
  assert.equal(security.isPrivateIpAddress('169.254.169.254'), true);
  assert.equal(security.isPrivateIpAddress('192.168.1.8'), true);
  assert.equal(security.isPrivateIpAddress('::1'), true);
  assert.equal(security.isPrivateIpAddress('93.184.216.34'), false);
});

test('safe external fetch rejects direct and redirected private destinations', async () => {
  assert.equal(typeof security.safeFetchText, 'function');
  await assert.rejects(
    () => security.safeFetchText('http://127.0.0.1/admin', {}, { resolveHost: publicResolver }),
    /private|blocked/i
  );

  const fetchImpl = async () => new Response('', {
    status: 302,
    headers: { location: 'http://169.254.169.254/latest/meta-data' }
  });
  await assert.rejects(
    () => security.safeFetchText('https://example.com', {}, { fetchImpl, resolveHost: publicResolver }),
    /private|blocked/i
  );
});

test('safe external fetch enforces response size limits', async () => {
  const fetchImpl = async () => new Response('x'.repeat(1024), {
    status: 200,
    headers: { 'content-type': 'text/html' }
  });

  await assert.rejects(
    () => security.safeFetchText('https://example.com', { maxBytes: 100 }, { fetchImpl, resolveHost: publicResolver }),
    /large|size/i
  );
});

test('storage paths reject traversal and can be restricted by prefix', () => {
  assert.equal(security.isSafeStoragePath('../secret.txt'), false);
  assert.equal(security.isSafeStoragePath('/absolute/file.png'), false);
  assert.equal(security.isSafeStoragePath('avatars/member_file.png', ['avatars/']), true);
  assert.equal(security.isSafeStoragePath('clients/private.pdf', ['avatars/']), false);
});

test('rate limiter returns 429 after the configured request budget', () => {
  assert.equal(typeof security.createRateLimiter, 'function');
  const limiter = security.createRateLimiter({ windowMs: 60_000, max: 2, now: () => 1_000 });
  const req = { ip: '203.0.113.1', method: 'POST', path: '/api/login' };
  const responses = [];
  const createResponse = () => ({
    setHeader: () => {},
    status(code) { this.statusCode = code; return this; },
    json(body) { responses.push({ status: this.statusCode, body }); return this; }
  });
  let nextCount = 0;

  limiter(req, createResponse(), () => { nextCount += 1; });
  limiter(req, createResponse(), () => { nextCount += 1; });
  limiter(req, createResponse(), () => { nextCount += 1; });

  assert.equal(nextCount, 2);
  assert.equal(responses[0].status, 429);
});

test('rate limiter cannot be bypassed with changing paths and keeps bounded state', () => {
  let currentTime = 1_000;
  const limiter = security.createRateLimiter({
    windowMs: 60_000,
    max: 2,
    maxBuckets: 2,
    now: () => currentTime
  });
  const createResponse = () => ({
    setHeader: () => {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  });
  let nextCount = 0;

  limiter({ ip: '203.0.113.7', method: 'GET', path: '/api/public/a' }, createResponse(), () => { nextCount += 1; });
  limiter({ ip: '203.0.113.7', method: 'GET', path: '/api/public/b' }, createResponse(), () => { nextCount += 1; });
  const blocked = createResponse();
  limiter({ ip: '203.0.113.7', method: 'GET', path: '/api/public/c' }, blocked, () => { nextCount += 1; });

  assert.equal(nextCount, 2);
  assert.equal(blocked.statusCode, 429);

  currentTime += 60_001;
  limiter({ ip: '203.0.113.8', method: 'GET', path: '/api/public/a' }, createResponse(), () => { nextCount += 1; });
  limiter({ ip: '203.0.113.9', method: 'GET', path: '/api/public/a' }, createResponse(), () => { nextCount += 1; });
  limiter({ ip: '203.0.113.10', method: 'GET', path: '/api/public/a' }, createResponse(), () => { nextCount += 1; });

  assert.ok(limiter.bucketCount() <= 2);
});

test('security headers remove framework disclosure and set browser protections', () => {
  assert.equal(typeof security.securityHeaders, 'function');
  const headers = new Map();
  const app = { disableCalls: [], disable(value) { this.disableCalls.push(value); } };
  const res = { setHeader(name, value) { headers.set(name, value); } };
  let nextCalled = false;

  security.configureSecurityHeaders(app);
  security.securityHeaders({}, res, () => { nextCalled = true; });

  assert.deepEqual(app.disableCalls, ['x-powered-by']);
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(headers.get('X-Frame-Options'), 'DENY');
  const contentSecurityPolicy = headers.get('Content-Security-Policy');
  assert.match(contentSecurityPolicy, /default-src 'self'/);
  assert.match(contentSecurityPolicy, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
  assert.match(contentSecurityPolicy, /font-src 'self' data: https:\/\/fonts\.gstatic\.com/);
  assert.equal(nextCalled, true);
});
