import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('dismissing a Google error clears only its visible diagnostic', async () => {
  const service = await import('../src/services/operationalEventService.js');
  assert.equal(typeof service.dismissOperationalEventGoogleError, 'function');

  let operation;
  const prismaClient = {
    operationalEvent: {
      updateMany: async input => {
        operation = input;
        return { count: 1 };
      }
    }
  };

  const result = await service.dismissOperationalEventGoogleError('event-1', prismaClient);

  assert.equal(result.count, 1);
  assert.deepEqual(operation.where, { id: 'event-1', googleSyncError: { not: null } });
  assert.deepEqual(operation.data, { googleSyncError: null });
});

test('dismissing reconciliation preserves the local event and excludes it from future previews', async () => {
  const service = await import('../src/services/operationalEventService.js');
  assert.equal(typeof service.dismissOperationalEventReconciliation, 'function');

  let operation;
  const prismaClient = {
    operationalEvent: {
      updateMany: async input => {
        operation = input;
        return { count: 1 };
      }
    }
  };

  await service.dismissOperationalEventReconciliation('event-2', prismaClient);

  assert.equal(operation.where.id, 'event-2');
  assert.equal(operation.where.source, 'BRAIN');
  assert.deepEqual(operation.where.googleLinks, { none: {} });
  assert.deepEqual(operation.data, { googleSyncStatus: 'DISMISSED', googleSyncError: null });
});

test('calendar dismissal is manager-only, persistent and available in both dialogs', async () => {
  const service = await read('src/services/operationalEventService.js');
  const oauth = await read('src/services/googleCalendarOAuthService.js');
  const routes = await read('src/routes/api/activity.js');
  const calendar = await read('src/components/modules/Activity/OperationalCalendar.jsx');

  assert.match(service, /googleSyncStatus:\s*\{\s*not:\s*'DISMISSED'\s*\}/);
  assert.match(oauth, /googleSyncError:\s*\{\s*not:\s*null\s*\}/);
  assert.match(routes, /google-calendar\/errors\/:id\/dismiss['"],\s*requireManagerRole/);
  assert.match(routes, /google-calendar\/reconciliation\/:id\/dismiss['"],\s*requireManagerRole/);
  assert.match(calendar, /dismissGoogleErrorMutation/);
  assert.match(calendar, /dismissReconciliationMutation/);
  assert.match(calendar, /Descartar\s*<\/button>/);
  assert.match(calendar, /Descartar de conciliación/);
  assert.match(
    service,
    /reconcilePendingOperationalEvents[\s\S]*?googleSyncStatus:\s*\{\s*not:\s*'DISMISSED'/,
  );
});
