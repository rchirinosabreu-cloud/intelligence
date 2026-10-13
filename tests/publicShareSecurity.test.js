import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CLIENT_COMMENT_MAX_CHARS, clientCommentProblem, normalizeClientComment } from '../src/lib/clientComment.js';

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
  // La regla se mudó a `src/lib/clientComment.js` el 13 de octubre de 2026, para que el portal
  // pueda frenar antes de enviar y decir el motivo; el controlador sigue siendo la cerradura.
  // Esta prueba ya no busca el número en el código: ejercita la regla.
  const controller = await read('src/controllers/publicController.js');
  assert.match(controller, /normalizeClientComment\(req\.body\?\.comment\)/, 'el texto se recorta antes de mirarlo');
  assert.match(controller, /clientCommentProblem\(normalizedComment\)/, 'y se acota con la regla compartida');
  assert.match(controller, /status\(400\)/);

  assert.equal(normalizeClientComment('  hola  '), 'hola');
  assert.equal(normalizeClientComment(42), '', 'lo que no es texto no pasa');
  assert.ok(clientCommentProblem('   '), 'un comentario vacío se rechaza');
  assert.ok(clientCommentProblem('a'.repeat(CLIENT_COMMENT_MAX_CHARS + 1)), 'pasarse del tope se rechaza');
  assert.equal(clientCommentProblem('a'.repeat(CLIENT_COMMENT_MAX_CHARS)), null, 'justo el tope entra');
});

test('shared and internal content views use token-scoped or authenticated asset URLs', async () => {
  const shared = await read('src/components/public/SharedContentPlan.jsx');
  const detail = await read('src/components/modules/ContentPlanDetail.jsx');

  assert.match(shared, /\/api\/public\/parrilla\/\$\{token\}\/items\/\$\{itemId\}\/approve/);
  assert.match(shared, /\/api\/public\/parrilla\/\$\{token\}\/items\/\$\{itemId\}\/comment/);
  assert.match(detail, /shareToken/);
  assert.doesNotMatch(detail, /\/api\/public\/items\//);
});
