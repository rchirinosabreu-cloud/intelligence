import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readService = () => readFile(new URL('../src/services/nativeTaskService.js', import.meta.url), 'utf8');

test('task creation keeps completedAt consistent from the first persisted state', async () => {
  const source = await readService();
  assert.match(source, /completedAt:\s*mappedStatus === 'REALIZADA'\s*\?\s*new Date\(\)\s*:\s*null/);
});

test('task lifecycle, mirror updates, comments, and attachments share one transaction', async () => {
  const source = await readService();
  const updateBody = source.slice(source.indexOf('export const updateTask'), source.indexOf('export const auditAndDeleteTask'));

  assert.match(updateBody, /prisma\.\$transaction\(async \(tx\) =>/);
  assert.match(updateBody, /await tx\.task\.update/);
  assert.match(updateBody, /await tx\.contentItem\.update/);
  assert.match(updateBody, /await tx\.taskComment\.create/);
  assert.match(updateBody, /await tx\.taskAttachment\.(create|deleteMany)/);
});

test('publication handoff is idempotent and runs under serializable isolation', async () => {
  const source = await readService();
  const updateBody = source.slice(source.indexOf('export const updateTask'), source.indexOf('export const auditAndDeleteTask'));

  assert.match(updateBody, /existingPublicationTask/);
  assert.match(updateBody, /isolationLevel:\s*['"]Serializable['"]/);
});

test('linked content tasks still reach post-commit notifications', async () => {
  const source = await readService();
  const updateBody = source.slice(source.indexOf('export const updateTask'), source.indexOf('export const auditAndDeleteTask'));
  const notificationPosition = updateBody.indexOf('// --- Notificaciones de Prioridad o Especial ---');
  const responsePosition = updateBody.lastIndexOf('return responseTask');

  assert.ok(notificationPosition > 0);
  assert.ok(responsePosition > notificationPosition);
});
