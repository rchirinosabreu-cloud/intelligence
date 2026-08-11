import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('public item actions are scoped by the content plan share token', async () => {
  const routes = await read('src/routes/index.js');
  const controller = await read('src/controllers/publicController.js');

  assert.match(routes, /\/public\/parrilla\/:token\/items\/:id\/approve/);
  assert.match(routes, /\/public\/parrilla\/:token\/items\/:id\/comment/);
  assert.match(routes, /\/public\/parrilla\/:token\/items\/:id\/final-asset/);
  assert.doesNotMatch(routes, /\/public\/items\/:id/);
  assert.match(controller, /getAuthorizedPublicItem/);
  assert.match(controller, /req\.params\.token/);
});

test('share tokens use cryptographically secure randomness', async () => {
  const service = await read('src/services/contentService.js');
  assert.match(service, /randomBytes\(/);
  assert.doesNotMatch(service, /Math\.random\(\).*shareToken|const token = Math\.random/);
});

test('public comments are trimmed and bounded', async () => {
  const controller = await read('src/controllers/publicController.js');
  assert.match(controller, /comment\.trim\(\)/);
  assert.match(controller, /2000/);
  assert.match(controller, /status\(400\)/);
});

test('shared and internal content views use token-scoped or authenticated asset URLs', async () => {
  const shared = await read('src/components/public/SharedContentPlan.jsx');
  const detail = await read('src/components/modules/ContentPlanDetail.jsx');

  assert.match(shared, /\/api\/public\/parrilla\/\$\{token\}\/items\/\$\{itemId\}\/approve/);
  assert.match(shared, /\/api\/public\/parrilla\/\$\{token\}\/items\/\$\{itemId\}\/comment/);
  assert.match(detail, /shareToken/);
  assert.doesNotMatch(detail, /\/api\/public\/items\//);
});
