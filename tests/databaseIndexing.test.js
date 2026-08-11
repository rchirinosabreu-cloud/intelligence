import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('hot dashboard, task, content, and file queries have composite indexes', async () => {
  const schema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

  const expectedIndexes = [
    '@@index([userId, isRead, createdAt])',
    '@@index([assigneeId, status, dueDate])',
    '@@index([creatorId, status, createdAt])',
    '@@index([clientId, status, createdAt])',
    '@@index([status, completedAt])',
    '@@index([taskId, createdAt])',
    '@@index([clientId, deletedAt, createdAt])',
    '@@index([clientId, deletedAt, year, month])',
    '@@index([planId, deletedAt, publishDate])',
    '@@index([clientId, startDate, endDate])',
    '@@index([reportId])'
  ];

  expectedIndexes.forEach((index) => assert.ok(schema.includes(index), `Missing ${index}`));
});
