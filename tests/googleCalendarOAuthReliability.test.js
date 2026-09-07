import test from 'node:test';
import assert from 'node:assert/strict';
import * as oauth from '../src/services/googleCalendarOAuthService.js';

test('refreshed OAuth tokens are persisted before the authorized client is returned', async () => {
  const writes = [];
  const connection = { id: 'account', encryptedTokens: 'old' };
  await oauth.authorizeGoogleCalendarConnections([connection], {
    decryptTokens: () => JSON.stringify({ refresh_token: 'refresh', access_token: 'old' }),
    createOAuthClient: () => ({
      setCredentials(tokens) { this.credentials = tokens; },
      async getAccessToken() { this.credentials = { ...this.credentials, access_token: 'new', expiry_date: 12345 }; return { token: 'new' }; }
    }),
    persistTokens: async (savedConnection, tokens) => writes.push({ id: savedConnection.id, tokens })
  });
  assert.deepEqual(writes, [{ id: 'account', tokens: { refresh_token: 'refresh', access_token: 'new', expiry_date: 12345 } }]);
});

test('a late invalid_grant cannot deactivate credentials from a newer reconnection', async () => {
  let query;
  await oauth.markGoogleCalendarReauthRequired({ id: 'account', encryptedTokens: 'old-tokens' }, {
    googleCalendarConnection: { updateMany: async candidate => { query = candidate; return { count: 0 }; } }
  });
  assert.equal(query.where.encryptedTokens, 'old-tokens');
});

test('401 invalid credentials is surfaced as requiring OAuth reconnection', () => {
  assert.equal(oauth.isGoogleOAuthReauthError({ response: { status: 401, data: { error: { message: 'Invalid Credentials' } } } }), true);
  assert.equal(oauth.isGoogleOAuthReauthError({ response: { status: 503 } }), false);
});

test('calendar-list pagination includes calendars past the first page', async () => {
  assert.equal(typeof oauth.listGoogleCalendarPages, 'function');
  const requests = [];
  const items = await oauth.listGoogleCalendarPages({ calendarList: { list: async request => {
    requests.push(request); return request.pageToken ? { data: { items: [{ id: 'second' }] } } : { data: { items: [{ id: 'first' }], nextPageToken: 'page-2' } };
  } } });
  assert.deepEqual(items.map(item => item.id), ['first', 'second']);
  assert.equal(requests[1].pageToken, 'page-2');
});

test('reconciliation pending filters include pre-existing null statuses', async () => {
  assert.equal(typeof oauth.getPendingGoogleCalendarWhere, 'function');
  const where = oauth.getPendingGoogleCalendarWhere();
  assert.equal(where.requestId, null, 'durable writes with uncertain Google outcomes must only use their original retry path');
  assert.equal(where.googleEventId, null, 'an already published event cannot be reconciled into a different calendar');
  assert.deepEqual(where.OR, [{ googleSyncStatus: null }, { googleSyncStatus: { notIn: ['DISMISSED', 'DELETED', 'PENDING_DELETE', 'MERGED', 'PENDING', 'RETRY'] } }]);
  assert.equal(where.NOT, undefined, 'a separate NOT on a nullable status would exclude SQL NULL again');
  assert.equal(where.source, 'BRAIN');
});

test('sync health exposes durable pending writes as well as terminal errors', () => {
  assert.equal(typeof oauth.getGoogleCalendarIssueWhere, 'function');
  const where = oauth.getGoogleCalendarIssueWhere('account');
  assert.equal(where.googleConnectionId, 'account');
  assert.ok(where.OR.some(item => item.googleSyncStatus?.in?.includes('PENDING_DELETE')));
});

test('switching calendars invalidates old watch channels atomically with the cursor', async () => {
  assert.equal(typeof oauth.persistGoogleCalendarSelection, 'function');
  const operations = [];
  const db = { $transaction: async callback => callback({
    googleCalendarConnection: { update: async query => { operations.push(['connection', query]); return { id: 'account' }; } },
    googleCalendarSyncChannel: { updateMany: async query => operations.push(['channels', query]) }
  }) };
  await oauth.persistGoogleCalendarSelection('account', 'new-calendar', db);
  assert.equal(operations[0][1].data.syncToken, null);
  assert.equal(operations[1][1].where.connectionId, 'account');
  assert.ok(operations[1][1].data.expiresAt instanceof Date);
});

test('the default organizer stays on the central account regardless of sync freshness', () => {
  assert.equal(typeof oauth.orderGoogleCalendarConnections, 'function');
  const connections = [{ id: 'social', email: 'social@example.com', lastSyncedAt: new Date() }, { id: 'central', email: oauth.CENTRAL_GOOGLE_CALENDAR_EMAIL, lastSyncedAt: null }];
  assert.equal(oauth.orderGoogleCalendarConnections(connections)[0].id, 'central');
  assert.equal(connections[0].id, 'social');
});

test('a rejected update remains visible even after its old SYNCED payload was restored', () => {
  const where = oauth.getGoogleCalendarIssueWhere('account');
  const diagnostics = where.OR.find(item => item.googleSyncError?.not === null);
  assert.ok(diagnostics);
  assert.equal(diagnostics.googleSyncStatus, undefined);
  assert.ok(diagnostics.OR.some(item => item.googleSyncStatus?.notIn?.includes('MERGED')));
});
