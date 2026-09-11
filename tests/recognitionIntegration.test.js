import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('real task transitions couple awards to their transaction, not asynchronous notifications', () => {
  const source = readFileSync('src/services/nativeTaskService.js', 'utf8');
  const update = source.slice(source.indexOf('export const updateTask'), source.indexOf('export const auditAndDeleteTask'));
  assert.match(update, /recognitionTransaction\(prisma/);
  assert.match(update, /prepareTaskRecognition\(tx, id/);
  assert.match(update, /finishTaskRecognition\(tx, recognitionBefore, updatedTask/);
  assert.ok(update.indexOf('finishTaskRecognition(tx, recognitionBefore, updatedTask') < update.indexOf('return { currentTask, updatedTask'));
  assert.match(source.slice(source.indexOf('export const auditAndDeleteTask')), /finishTaskRecognition\(tx, recognitionBefore, null/);
});

test('returns invalidate explicit plan approval and edits use the current transition clock', () => {
  const content = readFileSync('src/services/contentService.js', 'utf8');
  const comments = content.slice(content.indexOf('export const addClientComment'));
  assert.match(comments, /recognitionTransaction\(prisma/);
  assert.match(comments, /recordPlanRecognition\(tx, updated.planId/);
  const tasks = readFileSync('src/services/nativeTaskService.js', 'utf8');
  assert.match(tasks, /recordPlanRecognition\(tx, updatedTask.contentItem.planId/);
  assert.doesNotMatch(tasks, /finishTaskRecognition\(tx, recognitionBefore, updatedTask, updatedTask.completedAt \|\|/);
});
test('actual content approval and both history reads are connected to the shared persistence', () => {
  const content = readFileSync('src/services/contentService.js', 'utf8');
  assert.match(content, /recordPlanRecognition\(tx, item.planId/);
  assert.match(content, /allowAward: safeData.status === 'APROBADO'/);
  assert.match(readFileSync('src/services/personalDashboardService.js', 'utf8'), /attachTaskRecognitions\(prisma/);
  assert.match(readFileSync('src/services/nativeTaskService.js', 'utf8'), /attachTaskRecognitions\(prisma, tasks\)/);
});
