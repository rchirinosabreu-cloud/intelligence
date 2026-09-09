import test from 'node:test';
import assert from 'node:assert/strict';
import * as oauth from '../src/services/googleCalendarOAuthService.js';
import * as events from '../src/services/operationalEventService.js';

const connection = { id: 'social', email: 'social.brainstudio@gmail.com', calendarId: 'primary', isActive: true };
const payload = { requestId: 'routing-test-123', title: 'Routing test', type: 'PRODUCTION',
  startAt: '2026-10-01T14:00:00Z', endAt: '2026-10-01T15:00:00Z', memberIds: [], attendeeEmails: [], recurrence: 'NONE', googleConnectionId: 'social' };
const profile = { email: connection.email, verified_email: true };
const calendar = { id: connection.email, primary: true, accessRole: 'owner' };
const fail = message => async () => assert.fail(message);
const creationDeps = () => ({
  lock: task => task(), now: () => new Date('2026-09-01T00:00:00Z'),
  db: { operationalEvent: { findUnique: async () => null, create: fail('invalid selection must not persist') } },
  authorize: fail('missing selection must not fall back to another account'),
  resolveCreationTarget: fail('missing selection must not resolve a destination')
});

for (const id of [undefined, null, '', '   ', [], {}]) {
  test(`new events reject missing or malformed account ${JSON.stringify(id)} before authorization`, async () => {
    await assert.rejects(events.createOperationalEvent({ ...payload, googleConnectionId: id }, 'actor', creationDeps()),
      error => error.code === 'INVALID_GOOGLE_CALENDAR_ACCOUNT');
  });
}

test('new events cannot use an authorization belonging to a different connection', async () => {
  await assert.rejects(events.createOperationalEvent(payload, 'actor', {
    ...creationDeps(), authorize: async () => ({ connection: { ...connection, id: 'coordinator' } })
  }), error => error.code === 'GOOGLE_CALENDAR_ACCOUNT_MISMATCH');
});

test('authorization verifies the real Google identity, not the connection label', async () => {
  assert.equal(typeof oauth.verifyGoogleCalendarAccountIdentity, 'function');
  await assert.rejects(oauth.verifyGoogleCalendarAccountIdentity({ connection, oauth2Client: {} }, {
    readProfile: async () => ({ data: { ...profile, email: 'coordinadorbrainstudio@gmail.com' } })
  }), error => error.code === 'GOOGLE_CALENDAR_ACCOUNT_MISMATCH');
});

test('identity verification fails closed for missing or unverified profiles', async () => {
  assert.equal(typeof oauth.verifyGoogleCalendarAccountIdentity, 'function');
  for (const data of [{}, { ...profile, verified_email: false }]) {
    await assert.rejects(oauth.verifyGoogleCalendarAccountIdentity({ connection }, { readProfile: async () => ({ data }) }),
      error => error.code === 'GOOGLE_CALENDAR_ACCOUNT_MISMATCH');
  }
});

test('identity verification accepts a verified matching account case-insensitively', async () => {
  assert.equal(typeof oauth.verifyGoogleCalendarAccountIdentity, 'function');
  assert.equal(await oauth.verifyGoogleCalendarAccountIdentity({ connection }, {
    readProfile: async () => ({ data: { ...profile, email: profile.email.toUpperCase() } })
  }), connection.email);
});

test('explicit authorization queries only that active connection and verifies its identity', async () => {
  const reads = [], verified = [];
  const result = await oauth.getAuthorizedGoogleOAuthClient('social', {
    db: { googleCalendarConnection: { findMany: async query => { reads.push(query.where); return [connection]; } } },
    authorize: async rows => ({ connection: rows[0] }),
    verifyIdentity: async auth => { verified.push(auth.connection.id); }
  });
  assert.deepEqual(reads, [{ id: 'social', isActive: true }]);
  assert.deepEqual(verified, ['social']);
  assert.equal(result.connection.id, 'social');
});

test('a verified identity mismatch disables only the affected credentials so reconnection becomes available', async () => {
  const marked = [];
  const selected = { ...connection, encryptedTokens: 'specific-credentials' };
  await assert.rejects(oauth.getAuthorizedGoogleOAuthClient('social', {
    db: { googleCalendarConnection: { findMany: async () => [selected] } },
    authorize: async rows => ({ connection: rows[0] }),
    verifyIdentity: async () => { throw Object.assign(new Error('Different identity'), { code: 'GOOGLE_CALENDAR_ACCOUNT_MISMATCH' }); },
    markReauthRequired: async account => { marked.push(account); }
  }), error => error.code === 'GOOGLE_CALENDAR_ACCOUNT_MISMATCH');
  assert.deepEqual(marked, [selected]);
});

test('a temporary failure reading Google identity does not deactivate a healthy account', async () => {
  await assert.rejects(oauth.getAuthorizedGoogleOAuthClient('social', {
    db: { googleCalendarConnection: { findMany: async () => [connection] } },
    authorize: async rows => ({ connection: rows[0] }),
    verifyIdentity: async () => { throw Object.assign(new Error('Temporary Google failure'), { code: 503 }); },
    markReauthRequired: fail('a transient Google outage must not revoke the connection')
  }), error => error.code === 503);
});

test('creation resolves the selected accounts own primary calendar before storing intent', async () => {
  assert.equal(typeof oauth.resolveGoogleCalendarCreationTarget, 'function');
  const reads = [];
  const result = await oauth.resolveGoogleCalendarCreationTarget({ connection, oauth2Client: {} }, {
    createCalendar: () => ({ calendarList: { get: async request => { reads.push(request); return { data: calendar }; } } })
  });
  assert.equal(result.calendarId, 'primary');
  assert.equal(result.resolvedCalendarId, connection.email);
  assert.deepEqual(reads, [{ calendarId: 'primary' }]);
});

test('creation refuses a hidden destination pointing to a different calendar', async () => {
  assert.equal(typeof oauth.resolveGoogleCalendarCreationTarget, 'function');
  await assert.rejects(oauth.resolveGoogleCalendarCreationTarget({ connection: { ...connection, calendarId: 'coordinadorbrainstudio@gmail.com' } }, {
    createCalendar: () => ({ calendarList: { get: async () => ({ data: calendar }) } })
  }), error => error.code === 'GOOGLE_CALENDAR_DESTINATION_MISMATCH');
});

test('creation requires a real primary calendar with write permission', async () => {
  assert.equal(typeof oauth.resolveGoogleCalendarCreationTarget, 'function');
  for (const data of [{ ...calendar, accessRole: 'reader' }, { ...calendar, primary: false }, {}]) {
    await assert.rejects(oauth.resolveGoogleCalendarCreationTarget({ connection }, {
      createCalendar: () => ({ calendarList: { get: async () => ({ data }) } })
    }), error => error.code === 'GOOGLE_CALENDAR_DESTINATION_MISMATCH');
  }
});

for (const type of ['PRODUCTION', 'PROJECT', 'MEETING', 'ABSENCE', 'BREAK']) {
  for (const id of ['social', 'coordinator']) {
    test(`${type} persists and syncs the explicitly verified ${id} destination`, async () => {
      const calls = [], selected = { ...connection, id, email: `${id}@example.com` };
      const result = await events.createOperationalEvent({ ...payload, type, googleConnectionId: id }, 'actor', {
        ...creationDeps(),
        authorize: async requested => { calls.push(['authorize', requested]); return { connection: selected }; },
        resolveCreationTarget: async auth => { calls.push(['resolve', auth.connection.id]); return { calendarId: 'primary', resolvedCalendarId: selected.email }; },
        db: { operationalEvent: { findUnique: async () => null, create: async ({ data }) => { calls.push(['persist', data.googleConnectionId, data.googleCalendarId]); return { id: 'local', ...data }; } } },
        syncToGoogle: async event => { calls.push(['sync', event.googleConnectionId, event.googleCalendarId]); return event; }
      });
      assert.equal(result.googleConnectionId, id);
      assert.deepEqual(calls, [['authorize', id], ['resolve', id], ['persist', id, 'primary'], ['sync', id, 'primary']]);
    });
  }
}

test('editing rejects changing the organizer account before local or remote writes', async () => {
  await assert.rejects(events.updateOperationalEvent('local', { googleConnectionId: 'social' }, {
    lock: task => task(), db: { operationalEvent: { findUnique: async () => ({ ...payload, id: 'local', googleConnectionId: 'coordinator', googleSyncStatus: 'SYNCED' }), update: fail('must not update') } },
    syncToGoogle: fail('must not move or overwrite a remote event')
  }), error => error.code === 'GOOGLE_CALENDAR_MOVE_REQUIRED');
});

test('editing rejects changing the calendar ID without an explicit move operation', async () => {
  await assert.rejects(events.updateOperationalEvent('local', { googleCalendarId: 'different-calendar' }, {
    lock: task => task(), db: { operationalEvent: { findUnique: async () => ({ ...payload, id: 'local', googleCalendarId: 'primary', googleSyncStatus: 'SYNCED' }), update: fail('must not update') } },
    syncToGoogle: fail('must not move or overwrite a remote event')
  }), error => error.code === 'GOOGLE_CALENDAR_MOVE_REQUIRED');
});

test('an absent Google organizer is never replaced with the central account', async () => {
  const result = await events.syncOperationalEventToGoogle({ ...payload, id: 'local', googleCalendarId: 'primary' }, {
    lock: task => task(), authorize: async () => ({ connection }),
    db: { googleCalendarEventLink: { upsert: async () => ({}) }, operationalEvent: { update: async ({ data }) => data } },
    createCalendar: () => ({ events: { get: async () => { throw { code: 404 }; }, insert: async request => ({ data: { ...request.requestBody, id: 'remote' } }) } })
  });
  assert.equal(result.organizerEmail, null);
});

// Exercise creation and the real sync adapter together. Only persistence,
// credentials and the external Google transport are simulated (not live proof).
for (const type of ['PRODUCTION', 'PROJECT', 'MEETING', 'ABSENCE', 'BREAK']) {
  for (const id of ['social', 'coordinator']) {
    test(`create-to-insert pipeline routes ${type} through ${id} without a default account`, async () => {
      let saved;
      const requests = [], authorizations = [];
      const selected = { ...connection, id, email: `${id}@example.com` };
      const oauth2Client = { account: id };
      const db = {
        operationalEvent: {
          findUnique: async () => saved || null,
          create: async ({ data }) => (saved = { id: `local-${id}-${type}`, ...data }),
          update: async ({ data }) => (saved = { ...saved, ...data })
        },
        googleCalendarEventLink: { upsert: async ({ create }) => create }
      };
      const authorize = async requested => {
        authorizations.push(requested);
        assert.equal(requested, id);
        return { connection: selected, oauth2Client };
      };
      const createCalendar = client => {
        assert.equal(client, oauth2Client);
        return { events: {
          get: async () => { throw { code: 404 }; },
          insert: async request => {
            requests.push(request);
            return { data: { ...request.requestBody, id: `remote-${id}`, organizer: { email: selected.email }, etag: 'v1' } };
          }
        } };
      };
      const result = await events.createOperationalEvent({ ...payload, type, googleConnectionId: id }, 'actor', {
        ...creationDeps(), db, authorize,
        resolveCreationTarget: auth => oauth.resolveGoogleCalendarCreationTarget(auth, {
          createCalendar: () => ({ calendarList: { get: async () => ({ data: { ...calendar, id: selected.email } }) } })
        }),
        syncToGoogle: event => events.syncOperationalEventToGoogle(event, { db, authorize, createCalendar, lock: task => task() })
      });
      assert.deepEqual(authorizations, [id, id]);
      assert.equal(requests.length, 1);
      assert.equal(requests[0].calendarId, 'primary');
      assert.equal(result.googleConnectionId, id);
      assert.equal(result.organizerEmail, selected.email);
      assert.equal(result.googleSyncStatus, 'SYNCED');
    });
  }
}

test('destination verification failure prevents local intent and all remote writes', async () => {
  await assert.rejects(events.createOperationalEvent(payload, 'actor', {
    ...creationDeps(), authorize: async () => ({ connection }),
    resolveCreationTarget: async () => { throw Object.assign(new Error('No write permission'), { code: 'GOOGLE_CALENDAR_DESTINATION_MISMATCH' }); },
    syncToGoogle: fail('must not write to Google')
  }), error => error.code === 'GOOGLE_CALENDAR_DESTINATION_MISMATCH');
});

test('an unavailable explicit account does not authorize a different connection', async () => {
  const result = await oauth.getAuthorizedGoogleOAuthClient('social', {
    db: { googleCalendarConnection: { findMany: async query => { assert.equal(query.where.id, 'social'); return []; } } },
    authorize: async rows => { assert.equal(rows.length, 0); return null; },
    verifyIdentity: fail('no identity exists to verify')
  });
  assert.equal(result, null);
});

test('editing content with the original account preserves the destination sent to sync', async () => {
  let saved = { ...payload, id: 'local', googleConnectionId: 'social', googleCalendarId: 'primary', googleSyncStatus: 'SYNCED' };
  const result = await events.updateOperationalEvent(saved.id, { title: 'Changed title', googleConnectionId: 'social' }, {
    lock: task => task(),
    db: { operationalEvent: {
      findUnique: async () => saved,
      update: async ({ data }) => (saved = { ...saved, ...Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)) })
    } },
    syncToGoogle: async event => {
      assert.equal(event.googleConnectionId, 'social');
      assert.equal(event.googleCalendarId, 'primary');
      return { ...event, googleSyncStatus: 'SYNCED' };
    }
  });
  assert.equal(result.title, 'Changed title');
});
