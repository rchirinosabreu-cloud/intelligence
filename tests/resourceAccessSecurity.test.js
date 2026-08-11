import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('task APIs never serialize complete user records for comment authors', async () => {
  const controller = await read('src/controllers/taskController.js');
  const service = await read('src/services/nativeTaskService.js');

  assert.doesNotMatch(controller, /author:\s*true/);
  assert.doesNotMatch(service, /author:\s*true/);
  assert.match(controller, /taskCommentAuthorSelect/);
  assert.match(service, /taskCommentAuthorSelect/);
});

test('clients cannot access a file record through another client URL', async () => {
  const files = await read('src/routes/api/clientFiles.js');

  assert.match(files, /where:\s*\{\s*id:\s*fileId,\s*clientId\s*\}/);
  assert.match(files, /getClientStoragePrefix/);
  assert.match(files, /isSafeStoragePath\(gcsPath/);
});

test('new object uploads are private and do not grant public-read ACL', async () => {
  const s3 = await read('src/services/s3Service.js');
  const routes = await read('src/routes/index.js');
  const controller = await read('src/controllers/taskController.js');
  const panel = await read('src/components/modules/TaskSidePanel.jsx');

  assert.doesNotMatch(s3, /ACL:\s*['"]public-read['"]/);
  assert.match(routes, /tasks\/:taskId\/attachments\/:attachmentId\/download/);
  assert.match(controller, /where:\s*\{\s*id:\s*attachmentId,\s*taskId\s*\}/);
  assert.match(panel, /handleTaskAttachmentOpen/);
  assert.match(panel, /tasks\/\$\{formData\.id\}\/attachments\/\$\{item\.id\}\/download/);
});

test('users cannot forge system comments and comments have bounded input', async () => {
  const controller = await read('src/controllers/taskController.js');

  assert.doesNotMatch(controller, /const \{ content, type \} = req\.body/);
  assert.match(controller, /type:\s*['"]human['"]/);
  assert.match(controller, /COMMENT_MAX_LENGTH/);
});

test('project managers can moderate comments alongside admins', async () => {
  const controller = await read('src/controllers/taskController.js');
  assert.match(controller, /isManagerRole\(role\)/);
});
