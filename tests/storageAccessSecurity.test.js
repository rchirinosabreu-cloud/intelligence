import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('authentication bypass is limited to database-resolved public media', async () => {
  const middleware = await read('src/middlewares/authMiddleware.js');
  assert.doesNotMatch(middleware, /includes\('\/image-proxy'\)/);
  assert.match(middleware, /avatar-image/);
  assert.match(middleware, /logo-image/);
});

test('avatar proxy resolves the object path from the member record, not the query string', async () => {
  const radar = await read('src/routes/api/talentRadar.js');
  assert.doesNotMatch(radar, /const \{ gcsPath \} = req\.query/);
  assert.match(radar, /select:\s*\{\s*avatarUrl:\s*true\s*\}/);
  assert.match(radar, /isSafeStoragePath/);
  assert.match(radar, /\['avatars\/'\]/);
});

test('report image proxy requires authentication and only streams registered sources', async () => {
  const reports = await read('src/routes/api/reports.js');
  const reportView = await read('src/components/modules/Reports.jsx');
  const routes = await read('src/routes/index.js');

  assert.match(reports, /metricReportSource\.findFirst/);
  assert.match(reports, /storagePath:\s*decodedPath/);
  assert.match(reportView, /AuthenticatedImage/);
  assert.match(routes, /router\.use\('\/reports',\s*requireModulePermission\('reportes'\),\s*reportsRouter\)/);
});

test('assistant document search is protected by the Manager module permission', async () => {
  const routes = await read('src/routes/index.js');
  assert.match(routes, /router\.post\('\/chat',\s*requireModulePermission\('manager'\),/);
});
