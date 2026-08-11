import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('external website analysis and moodboard unfurl use the SSRF-safe fetcher', async () => {
  const boards = await read('src/routes/api/boards.js');
  const audit = await read('src/services/auditService.js');

  assert.match(boards, /safeFetchText/);
  assert.doesNotMatch(boards, /axios\.get\(url/);
  assert.match(audit, /safeFetchText/);
  assert.doesNotMatch(audit, /fetch\(url/);
});

test('server wires security headers, rate limits, public health, and production-safe errors', async () => {
  const server = await read('server.js');

  assert.match(server, /configureSecurityHeaders\(app\)/);
  assert.match(server, /app\.use\(securityHeaders\)/);
  assert.match(server, /app\.get\('\/api\/health'/);
  assert.match(server, /app\.use\('\/api\/login',\s*authRateLimiter\)/);
  assert.match(server, /app\.use\('\/api\/password-reset',\s*authRateLimiter\)/);
  assert.match(server, /app\.use\('\/api\/public',\s*publicRateLimiter\)/);
  assert.match(server, /process\.env\.NODE_ENV\s*===\s*'production'/);
  assert.doesNotMatch(server, /message:\s*err\.message,\s*\n\s*code:\s*err\.code/);
});

test('memory uploads have explicit file and count limits', async () => {
  const mainRoutes = await read('src/routes/index.js');
  const reports = await read('src/routes/api/reports.js');
  const radar = await read('src/routes/api/talentRadar.js');
  const brainCore = await read('src/routes/api/brainCore.js');
  const content = await read('src/routes/api/content.js');

  for (const source of [mainRoutes, reports, radar, brainCore, content]) {
    assert.match(source, /limits:\s*\{/);
    assert.match(source, /fileSize:/);
  }
  assert.match(reports, /files:/);
  assert.doesNotMatch(content, /250\s*\*\s*1024\s*\*\s*1024/);
});

test('authentication no longer accepts full JWTs in query strings', async () => {
  const middleware = await read('src/middlewares/authMiddleware.js');
  const chatUtils = await read('src/utils/chatUtils.jsx');
  const taskPanel = await read('src/components/modules/TaskSidePanel.jsx');

  assert.doesNotMatch(middleware, /req\.query\.token/);
  assert.doesNotMatch(chatUtils, /\?token=/);
  assert.doesNotMatch(taskPanel, /token=\$\{encodeURIComponent\(accessToken\)\}/);
});
