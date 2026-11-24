import test from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeLinkedInText, humanizeLinkedInError, linkedinAuthorizationState, linkedinMedia, linkedinPostUrl, LINKEDIN_RECONNECT_MESSAGE
} from '../src/lib/linkedinPublishing.js';
import {
  SOCIAL_PLATFORMS, pieceTargetAccounts, schedulingNotices, schedulingProblems, socialPagesOf, standaloneAccountsOf
} from '../src/lib/socialPublishing.js';
import { LinkedInError, createLinkedInClient } from '../src/services/linkedinService.js';
import { createLinkedInAccountService } from '../src/services/linkedinAccountService.js';
import { createLinkedInTokenService } from '../src/services/linkedinTokenService.js';
import { createSocialPublishingService } from '../src/services/socialPublishingService.js';

// Rodny, 23 November 2026: «empecemos montando lo de LinkedIn». LinkedIn is not Meta: each client authorises
// its own page, files are uploaded rather than fetched, and the text has its own escaping rules.

const NOW = new Date('2036-10-03T15:31:00.000Z');
const png = { id: 'a1', name: '1.png', mimeType: 'image/png', size: 2048, storageKey: 'k/1.png' };
const jpg = { id: 'a2', name: '2.jpg', mimeType: 'image/jpeg', size: 2048, storageKey: 'k/2.jpg' };
const mp4 = { id: 'a3', name: 'reel.mp4', mimeType: 'video/mp4', size: 9 * 1024 * 1024, storageKey: 'k/reel.mp4' };
const mov = { id: 'a4', name: 'reel.mov', mimeType: 'video/quicktime', size: 9 * 1024 * 1024, storageKey: 'k/reel.mov' };
const ig = { id: 'acc-ig', platform: 'INSTAGRAM', externalId: '1789', displayName: '@titanes', pageId: '5555', isActive: true };
const fb = { id: 'acc-fb', platform: 'FACEBOOK', externalId: '5555', displayName: 'Titanes', pageId: '5555', isActive: true, isPrimary: true };
const li = { id: 'acc-li', platform: 'LINKEDIN', externalId: '2414183', displayName: 'Titanes SAS', pageId: 'linkedin:2414183', isActive: true, encryptedToken: 'enc:li', metadata: {} };

test('the text is escaped the way LinkedIn asks, and a hashtag stays a hashtag', () => {
  assert.equal(escapeLinkedInText('Hola (equipo) *nuevo* 50% #Marca_2026 y C#'), 'Hola \\(equipo\\) \\*nuevo\\* 50% {hashtag|\\#|Marca_2026} y C\\#');
  assert.equal(escapeLinkedInText('a_b ~ [x] <y> {z} | @Endova \\ fin'), 'a\\_b \\~ \\[x\\] \\<y\\> \\{z\\} \\| \\@Endova \\\\ fin');
  assert.equal(escapeLinkedInText('Sin nada raro.\nDos líneas ñ á'), 'Sin nada raro.\nDos líneas ñ á');
  assert.equal(escapeLinkedInText(null), '');
});

test('what LinkedIn receives: one image, several images without their videos, one MP4, never a story', () => {
  assert.equal(linkedinMedia({ kind: 'IMAGE', assets: [png] }).kind, 'IMAGE');
  const mixed = linkedinMedia({ kind: 'CAROUSEL', assets: [png, mp4, jpg] });
  assert.deepEqual([mixed.kind, mixed.assets.map((asset) => asset.name), mixed.droppedVideos.map((asset) => asset.name), mixed.problem], ['MULTI_IMAGE', ['1.png', '2.jpg'], ['reel.mp4'], null]);
  assert.equal(linkedinMedia({ kind: 'CAROUSEL', assets: [png, mp4] }).kind, 'IMAGE', 'one image left is a single-image post');
  assert.match(linkedinMedia({ kind: 'CAROUSEL', assets: [mp4, mp4] }).problem, /solo lleva imágenes/);
  assert.equal(linkedinMedia({ kind: 'REELS', assets: [mp4] }).kind, 'VIDEO');
  assert.match(linkedinMedia({ kind: 'REELS', assets: [mov] }).problem, /debe ser MP4/);
  assert.match(linkedinMedia({ kind: 'REELS', assets: [{ ...mp4, size: 600 * 1024 * 1024 }] }).problem, /hasta 500 MB/);
  assert.match(linkedinMedia({ kind: 'STORIES', assets: [png] }).problem, /no tiene historias/);
});

test('a LinkedIn page is a standalone destination: it never becomes a Meta «account» nor forces a choice', () => {
  assert.ok(SOCIAL_PLATFORMS.includes('LINKEDIN'));
  assert.deepEqual(socialPagesOf([ig, fb, li]).map((page) => page.pageId), ['5555'], 'LinkedIn is not grouped as a page');
  assert.deepEqual(standaloneAccountsOf([ig, fb, li]).map((account) => account.id), ['acc-li']);
  assert.deepEqual(pieceTargetAccounts({ socialPageIds: [] }, [ig, fb, li]).map((account) => account.id), ['acc-fb', 'acc-ig', 'acc-li']);
  assert.deepEqual(pieceTargetAccounts({ socialPageIds: [] }, [li]).map((account) => account.id), ['acc-li'], 'a client with only LinkedIn can still publish');
});

test('scheduling to LinkedIn says what cannot go and what goes differently', () => {
  const item = { status: 'APROBADO', format: 'Historia', captionText: 'Hola', publishDate: '2036-10-03', publishTime: '11:00' };
  assert.ok(schedulingProblems({ item, assets: [png], targets: [li], now: NOW }).some((problem) => /no tiene historias/.test(problem)));
  const long = { ...item, format: 'Post', captionText: 'x'.repeat(2500) };
  assert.deepEqual(schedulingProblems({ item: long, assets: [png], targets: [li], now: NOW }), [], 'LinkedIn alone takes up to 3,000 characters');
  assert.ok(schedulingProblems({ item: long, assets: [png], targets: [li, ig], now: NOW }).some((problem) => /Meta acepta hasta 2\.200/.test(problem)));
  assert.ok(schedulingProblems({ item: { ...long, captionText: 'x'.repeat(3001) }, assets: [png], targets: [li], now: NOW }).some((problem) => /LinkedIn acepta hasta 3\.000/.test(problem)));
  const notices = schedulingNotices({ item: { format: 'Carrusel', captionText: 'Gracias @Endova' }, assets: [png, mp4, jpg], platforms: ['LINKEDIN'] });
  assert.ok(notices.some((notice) => /En LinkedIn sale sin el video «reel\.mp4»/.test(notice)));
  assert.ok(notices.some((notice) => /menciones \(@\) salen como texto/.test(notice)));
});

test('the authorisation of a page: quiet while it can renew itself, loud a week before it stops', () => {
  const at = (days) => new Date(NOW.getTime() + days * 86400000).toISOString();
  assert.deepEqual(linkedinAuthorizationState({ metadata: { expiresAt: at(40) } }, NOW), { daysLeft: 40, expired: false, expiringSoon: false, needsRefresh: false });
  assert.equal(linkedinAuthorizationState({ metadata: { expiresAt: at(3) } }, NOW).expiringSoon, true);
  assert.equal(linkedinAuthorizationState({ metadata: { expiresAt: at(-1) } }, NOW).expired, true);
  const renewable = linkedinAuthorizationState({ metadata: { expiresAt: at(3), canRefresh: true, refreshExpiresAt: at(300) } }, NOW);
  assert.deepEqual([renewable.expiringSoon, renewable.needsRefresh, renewable.daysLeft], [false, true, 300]);
  assert.equal(linkedinPostUrl('urn:li:share:684478'), 'https://www.linkedin.com/feed/update/urn:li:share:684478/');
  assert.equal(humanizeLinkedInError({ status: 401 }), LINKEDIN_RECONNECT_MESSAGE);
  assert.match(humanizeLinkedInError({ status: 422, message: 'Field too long' }), /^LinkedIn respondió: Field too long/);
});

const response = (body, { status = 200, headers = {} } = {}) => ({
  ok: status < 400, status, json: async () => body, arrayBuffer: async () => (body instanceof Uint8Array ? body.buffer : new ArrayBuffer(0)),
  headers: { get: (name) => headers[String(name).toLowerCase()] ?? null }
});
const scripted = (script) => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const step = script.shift();
    if (!step) throw new Error(`Unexpected call to ${url}`);
    calls.push({ url: String(url), method: options.method || 'GET', headers: options.headers || {}, body: typeof options.body === 'string' ? options.body : options.body ? '<bytes>' : null, bytes: options.body?.length });
    return step;
  };
  return { fetchImpl, calls };
};
const env = { LINKEDIN_CLIENT_ID: 'cid', LINKEDIN_CLIENT_SECRET: 'secret', APP_URL: 'https://labs.example', LINKEDIN_API_VERSION: '202605' };

test('the authorisation address asks only for the page scopes and returns to the platform', () => {
  const client = createLinkedInClient({ env });
  const url = new URL(client.authorizationUrl({ state: 'st' }));
  assert.equal(`${url.origin}${url.pathname}`, 'https://www.linkedin.com/oauth/v2/authorization');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    response_type: 'code', client_id: 'cid', redirect_uri: 'https://labs.example/linkedin/callback', state: 'st',
    scope: 'w_organization_social r_organization_social rw_organization_admin'
  });
  assert.equal(createLinkedInClient({ env: {} }).isConfigured(), false);
  // Producción no define APP_URL: la dirección de regreso sale de donde se está usando la plataforma.
  const bare = createLinkedInClient({ env: { LINKEDIN_CLIENT_ID: 'cid', LINKEDIN_CLIENT_SECRET: 's' } });
  assert.equal(bare.redirectUri('https://labs.brainstudioagencia.com'), 'https://labs.brainstudioagencia.com/linkedin/callback');
  assert.equal(new URL(bare.authorizationUrl({ state: 'st', redirectUri: bare.redirectUri('https://otra-agencia.example/') })).searchParams.get('redirect_uri'), 'https://otra-agencia.example/linkedin/callback');
  assert.equal(createLinkedInClient({ env: { ...env, LINKEDIN_OAUTH_REDIRECT_URI: 'https://fija.example/cb' } }).redirectUri('https://labs.example'), 'https://fija.example/cb', 'an explicit address still wins');
});

test('pages where the person can publish: roles that cannot post are left out, names come from LinkedIn', async () => {
  const { fetchImpl, calls } = scripted([
    response({ elements: [
      { role: 'ADMINISTRATOR', organization: 'urn:li:organization:22', state: 'APPROVED' },
      { role: 'ANALYST', organization: 'urn:li:organization:33', state: 'APPROVED' },
      { role: 'CONTENT_ADMINISTRATOR', organizationTarget: 'urn:li:organization:11', state: 'APPROVED' }
    ] }),
    response({ results: { 22: { localizedName: 'Zeta', vanityName: 'zeta' }, 11: { localizedName: 'Alfa', vanityName: 'alfa' } } })
  ]);
  const pages = await createLinkedInClient({ env, fetchImpl }).listOrganizations('tok');
  assert.deepEqual(pages, [{ organizationId: '11', name: 'Alfa', vanityName: 'alfa' }, { organizationId: '22', name: 'Zeta', vanityName: 'zeta' }]);
  assert.equal(calls[0].url, 'https://api.linkedin.com/rest/organizationAcls?q=roleAssignee&state=APPROVED&count=100');
  assert.deepEqual([calls[0].headers.Authorization, calls[0].headers['LinkedIn-Version'], calls[0].headers['X-Restli-Protocol-Version']], ['Bearer tok', '202605', '2.0.0']);
  assert.equal(calls[1].url, 'https://api.linkedin.com/rest/organizations?ids=List(22,11)');
  assert.ok(calls.every((call) => !call.url.includes('tok')), 'the token never travels in a URL');
});

test('one image: upload opened, bytes sent, LinkedIn asked until it is ready, and only then the post', async () => {
  const order = [];
  const { fetchImpl, calls } = scripted([
    response({ value: { uploadUrl: 'https://www.linkedin.com/dms-uploads/img1', image: 'urn:li:image:IMG1' } }),
    response(new Uint8Array([1, 2, 3])),
    response(null, { status: 201 }),
    response({ status: 'PROCESSING' }),
    response({ status: 'AVAILABLE' }),
    response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:999' } })
  ]);
  const client = createLinkedInClient({ env, fetchImpl, sleep: async () => {} });
  const result = await client.publishToLinkedIn({
    organizationId: '2414183', token: 'tok', kind: 'IMAGE', text: 'Hola (mundo) #Brain',
    media: [{ url: 'https://files.example/1.png' }], beforePublish: async () => { order.push(calls.length); }
  });
  assert.deepEqual(result, { mediaId: 'urn:li:share:999', permalink: 'https://www.linkedin.com/feed/update/urn:li:share:999/' });
  assert.deepEqual(calls.map((call) => `${call.method} ${call.url}`), [
    'POST https://api.linkedin.com/rest/images?action=initializeUpload',
    'GET https://files.example/1.png',
    'PUT https://www.linkedin.com/dms-uploads/img1',
    'GET https://api.linkedin.com/rest/images/urn%3Ali%3Aimage%3AIMG1',
    'GET https://api.linkedin.com/rest/images/urn%3Ali%3Aimage%3AIMG1',
    'POST https://api.linkedin.com/rest/posts'
  ]);
  assert.deepEqual(JSON.parse(calls[0].body), { initializeUploadRequest: { owner: 'urn:li:organization:2414183' } });
  assert.deepEqual(order, [5], 'the «about to publish» mark is written after every upload and right before the post');
  assert.deepEqual(JSON.parse(calls[5].body), {
    author: 'urn:li:organization:2414183', commentary: 'Hola \\(mundo\\) {hashtag|\\#|Brain}', visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media: { id: 'urn:li:image:IMG1' } }, lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false
  });
});

test('a video goes up in the parts LinkedIn names, each read from the file by range, and is finalised with their ETags', async () => {
  const { fetchImpl, calls } = scripted([
    response({ value: { video: 'urn:li:video:V1', uploadToken: 'ut', uploadInstructions: [
      { uploadUrl: 'https://www.linkedin.com/dms-uploads/v1?part=1', firstByte: 0, lastByte: 4194303 },
      { uploadUrl: 'https://www.linkedin.com/dms-uploads/v1?part=2', firstByte: 4194304, lastByte: 5999999 }
    ] } }),
    response(new Uint8Array(4)), response(null, { headers: { etag: 'etag-1' } }),
    response(new Uint8Array(2)), response(null, { headers: { etag: 'etag-2' } }),
    response({}),
    response({ status: 'AVAILABLE' }),
    response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:ugcPost:77' } })
  ]);
  const client = createLinkedInClient({ env, fetchImpl, sleep: async () => {} });
  const result = await client.publishToLinkedIn({ organizationId: '9', token: 'tok', kind: 'VIDEO', text: 'Video', title: 'Lanzamiento', media: [{ url: 'https://files.example/reel.mp4', size: 6000000 }] });
  assert.equal(result.mediaId, 'urn:li:ugcPost:77');
  assert.deepEqual(JSON.parse(calls[0].body), { initializeUploadRequest: { owner: 'urn:li:organization:9', fileSizeBytes: 6000000, uploadCaptions: false, uploadThumbnail: false } });
  assert.deepEqual([calls[1].headers.Range, calls[3].headers.Range], ['bytes=0-4194303', 'bytes=4194304-5999999']);
  assert.equal(calls[2].headers.Authorization, undefined, 'the signed part URL carries its own permission');
  assert.deepEqual(JSON.parse(calls[5].body), { finalizeUploadRequest: { video: 'urn:li:video:V1', uploadToken: 'ut', uploadedPartIds: ['etag-1', 'etag-2'] } });
  assert.deepEqual(JSON.parse(calls[7].body).content, { media: { id: 'urn:li:video:V1', title: 'Lanzamiento' } });
});

test('LinkedIn errors keep the status and code LinkedIn gave', async () => {
  const { fetchImpl } = scripted([response({ status: 401, code: 'REVOKED_ACCESS_TOKEN', message: 'The token used in the request has been revoked by the user' }, { status: 401 })]);
  await assert.rejects(
    createLinkedInClient({ env, fetchImpl }).listOrganizations('tok'),
    (error) => error instanceof LinkedInError && error.status === 401 && error.code === 'REVOKED_ACCESS_TOKEN'
  );
});

const accountDb = (rows = []) => {
  const state = { rows: rows.map((row) => ({ ...row })) };
  return {
    state,
    db: {
      client: { findUnique: async ({ where }) => (where.id === 'client-1' ? { id: 'client-1', name: 'Titanes', slug: 'titanes' } : null) },
      clientSocialAccount: {
        findFirst: async ({ where }) => state.rows.find((row) => row.clientId === where.clientId && row.platform === where.platform && row.externalId === where.externalId) || null,
        create: async ({ data }) => { const row = { id: 'acc-li', ...data }; state.rows.push(row); return row; },
        update: async ({ where, data }) => { const row = state.rows.find((candidate) => candidate.id === where.id); Object.assign(row, data); return row; }
      }
    }
  };
};
const fakeLinkedIn = (overrides = {}) => ({
  isConfigured: () => true,
  redirectUri: (origin) => `${origin || 'http://localhost:3000'}/linkedin/callback`,
  authorizationUrl: ({ state, redirectUri }) => `https://www.linkedin.com/oauth/v2/authorization?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
  exchangeCode: async (_code, { redirectUri } = {}) => ({ redirectUriUsed: redirectUri, accessToken: 'access-1', expiresInSeconds: 5184000, refreshToken: 'refresh-1', refreshExpiresInSeconds: 31536000, scope: 'w_organization_social' }),
  listOrganizations: async () => [{ organizationId: '2414183', name: 'Titanes SAS', vanityName: 'titanes' }, { organizationId: '777', name: 'Otra', vanityName: null }],
  ...overrides
});
const accountService = ({ db, linkedin = fakeLinkedIn() }) => createLinkedInAccountService({
  db, linkedin, now: () => NOW, stateSecret: () => 'test-secret', encryptToken: (value) => `enc:${value}`, decryptToken: (value) => value.replace(/^enc:/, '')
});

test('connecting a page: who leaves for LinkedIn is who comes back, and the tokens are stored encrypted only once a page is chosen', async () => {
  const { db, state } = accountDb();
  const exchanged = [];
  const service = accountService({ db, linkedin: fakeLinkedIn({ exchangeCode: async (_code, { redirectUri } = {}) => { exchanged.push(redirectUri); return { accessToken: 'access-1', expiresInSeconds: 5184000, refreshToken: 'refresh-1', refreshExpiresInSeconds: 31536000, scope: 'w_organization_social' }; } }) });
  const { url } = await service.start({ clientId: 'client-1', actorUserId: 'user-1', origin: 'https://labs.brainstudioagencia.com' });
  assert.equal(new URL(url).searchParams.get('redirect_uri'), 'https://labs.brainstudioagencia.com/linkedin/callback', 'LinkedIn returns to where the platform is being used, never to localhost');
  const oauthState = new URL(url).searchParams.get('state');

  await assert.rejects(service.exchange({ code: 'c', state: oauthState, actorUserId: 'user-2' }), /la inició otra persona/);
  await assert.rejects(service.exchange({ code: 'c', state: 'garbage', actorUserId: 'user-1' }), /venció o no es válida/);

  const pending = await service.exchange({ code: 'c', state: oauthState, actorUserId: 'user-1' });
  assert.deepEqual([pending.clientId, pending.clientName, pending.organizations.length], ['client-1', 'Titanes', 2]);
  assert.deepEqual(exchanged, ['https://labs.brainstudioagencia.com/linkedin/callback'], 'the code is exchanged with the very same return address');
  assert.equal(state.rows.length, 0, 'nothing is saved until the page is chosen');
  assert.ok(!JSON.stringify(pending.organizations).includes('access-1'));

  await assert.rejects(service.link({ pending: pending.pending, organizationId: '2414183', actorUserId: 'user-2' }), /la inició otra persona/);
  await assert.rejects(service.link({ pending: pending.pending, organizationId: '555', actorUserId: 'user-1' }), /no está entre las que puedes administrar/);

  const account = await service.link({ pending: pending.pending, organizationId: '2414183', actorUserId: 'user-1' });
  assert.deepEqual([account.platform, account.externalId, account.displayName, account.pageId, account.isActive], ['LINKEDIN', '2414183', 'Titanes SAS', 'linkedin:2414183', true]);
  assert.equal(account.authorization.canRefresh, true);
  assert.ok(!JSON.stringify(account).includes('access-1') && !JSON.stringify(account).includes('refresh-1'), 'no token reaches the screen');
  const [row] = state.rows;
  assert.equal(row.encryptedToken, 'enc:access-1');
  assert.equal(row.metadata.encryptedRefreshToken, 'enc:refresh-1');
  assert.equal(row.metadata.expiresAt, new Date(NOW.getTime() + 5184000 * 1000).toISOString());

  // Reconnecting the same page updates its row instead of adding a second one.
  await service.link({ pending: pending.pending, organizationId: '2414183', actorUserId: 'user-1' });
  assert.equal(state.rows.length, 1);
});

test('without the app keys the platform says what is missing instead of failing', async () => {
  const service = accountService({ db: accountDb().db, linkedin: fakeLinkedIn({ isConfigured: () => false }) });
  await assert.rejects(service.start({ clientId: 'client-1', actorUserId: 'user-1' }), (error) => error.status === 503 && error.code === 'LINKEDIN_NOT_CONFIGURED' && /LINKEDIN_CLIENT_ID/.test(error.message));
});

test('the key of a page: used as is while fresh, renewed a week before, and the account is switched off when it cannot be', async () => {
  const at = (days) => new Date(NOW.getTime() + days * 86400000).toISOString();
  const updates = [];
  const tokens = (linkedin) => createLinkedInTokenService({
    db: { clientSocialAccount: { update: async ({ data }) => { updates.push(data); return data; } } }, linkedin, now: () => NOW,
    decryptToken: (value) => value.replace(/^enc:/, ''), encryptToken: (value) => `enc:${value}`, logger: { error() {} }
  });
  const refreshed = { accessToken: 'access-2', expiresInSeconds: 5184000, refreshToken: 'refresh-2', refreshExpiresInSeconds: 31536000 };

  assert.equal(await tokens({}).freshToken({ id: 'a', encryptedToken: 'enc:access-1', metadata: { expiresAt: at(40) } }), 'access-1');

  const renewable = { id: 'a', encryptedToken: 'enc:access-1', metadata: { expiresAt: at(3), canRefresh: true, encryptedRefreshToken: 'enc:refresh-1', refreshExpiresAt: at(300) } };
  assert.equal(await tokens({ refreshAccessToken: async (value) => { assert.equal(value, 'refresh-1'); return refreshed; } }).freshToken(renewable), 'access-2');
  assert.equal(updates.at(-1).encryptedToken, 'enc:access-2');
  assert.equal(updates.at(-1).metadata.refreshExpiresAt, at(300), 'the renewal token keeps its original deadline');

  // LinkedIn is down while renewing but the current key still works: publish with it.
  assert.equal(await tokens({ refreshAccessToken: async () => { throw Object.assign(new Error('down'), { status: 503 }); } }).freshToken(renewable), 'access-1');

  await assert.rejects(tokens({}).freshToken({ id: 'a', encryptedToken: 'enc:x', metadata: { expiresAt: at(-1) } }), (error) => error.permanent && error.message === LINKEDIN_RECONNECT_MESSAGE);
  assert.deepEqual([updates.at(-1).isActive, updates.at(-1).lastError], [false, LINKEDIN_RECONNECT_MESSAGE]);
});

const queueDb = ({ assets = [png], format = 'Post' } = {}) => {
  const state = {
    item: {
      id: 'item-1', planId: 'plan-1', format, status: 'PROGRAMADO', objective: 'Lanzamiento', captionText: 'Hola #Brain', publishDate: new Date('2036-10-03T00:00:00.000Z'), publishTime: '10:30',
      deletedAt: null, finalAssets: assets, plan: { id: 'plan-1', clientId: 'client-1', deletedAt: null, client: { id: 'client-1', socialAccounts: [li] } }
    },
    row: { id: 'pub-li', contentItemId: 'item-1', socialAccountId: 'acc-li', platform: 'LINKEDIN', status: 'SCHEDULED', scheduledAt: new Date('2036-10-03T15:30:00.000Z'), attempts: 0, leaseToken: null, requestedById: 'user-1' },
    accountUpdates: []
  };
  const db = {
    contentItem: {
      findUnique: async () => ({ ...state.item, publications: [state.row] }),
      update: async ({ data }) => { Object.assign(state.item, data); return state.item; }
    },
    socialPublication: {
      findUnique: async () => ({ ...state.row, socialAccount: li }),
      updateMany: async ({ where, data }) => {
        if (where.leaseToken !== undefined && (where.leaseToken ?? null) !== (state.row.leaseToken ?? null)) return { count: 0 };
        if (where.status && where.status !== state.row.status) return { count: 0 };
        Object.assign(state.row, data);
        return { count: 1 };
      }
    },
    clientSocialAccount: { update: async ({ data }) => { state.accountUpdates.push(data); return data; } },
    task: { findMany: async () => [] }
  };
  return { db, state };
};
const queue = ({ db, linkedin, notifications = [] }) => createSocialPublishingService({
  db, linkedin, linkedinToken: async () => 'fresh-token', meta: {}, now: () => NOW, decrypt: (value) => value,
  mediaUrlFor: async (asset, { platform }) => `https://signed.example/${platform}/${asset.storageKey}`,
  notify: async (data) => { notifications.push(data); return data; }, completeTask: async () => ({}), randomId: () => 'lease-1', logger: { error() {} }
});

test('the queue publishes a LinkedIn row through LinkedIn, with the original file and the fresh key, and leaves the link', async () => {
  const { db, state } = queueDb({ assets: [png, mp4, jpg], format: 'Carrusel' });
  const asked = [];
  const notifications = [];
  const linkedin = { publishToLinkedIn: async ({ beforePublish, ...args }) => { asked.push(args); await beforePublish(); return { mediaId: 'urn:li:share:1', permalink: 'https://www.linkedin.com/feed/update/urn:li:share:1/' }; } };
  const outcome = await queue({ db, linkedin, notifications }).publishOne(state.row);
  assert.deepEqual(outcome, { id: 'pub-li', status: 'PUBLISHED', permalink: 'https://www.linkedin.com/feed/update/urn:li:share:1/' });
  assert.deepEqual([asked[0].organizationId, asked[0].token, asked[0].kind, asked[0].text, asked[0].title], ['2414183', 'fresh-token', 'MULTI_IMAGE', 'Hola #Brain', 'Lanzamiento']);
  assert.deepEqual(asked[0].media.map((file) => file.url), ['https://signed.example/LINKEDIN/k/1.png', 'https://signed.example/LINKEDIN/k/2.jpg'], 'the video of a mixed carousel stays out');
  assert.deepEqual([state.row.status, state.row.externalMediaId, state.item.status], ['PUBLISHED', 'urn:li:share:1', 'PUBLICADO']);
  assert.ok(state.row.publishRequestedAt, 'the order to publish is recorded before it is sent');
  assert.match(notifications[0].message, /ya está publicado en LinkedIn \(Titanes SAS\)/);
});

test('a LinkedIn failure is told in LinkedIn words, and a revoked authorisation switches the page off', async () => {
  const { db, state } = queueDb();
  const notifications = [];
  const linkedin = { publishToLinkedIn: async () => { throw new LinkedInError('revoked', { status: 401, code: 'REVOKED_ACCESS_TOKEN' }); } };
  const outcome = await queue({ db, linkedin, notifications }).publishOne(state.row);
  assert.equal(outcome.status, 'FAILED');
  assert.equal(state.row.error, LINKEDIN_RECONNECT_MESSAGE);
  assert.deepEqual([state.accountUpdates[0].isActive, state.accountUpdates[0].lastError], [false, LINKEDIN_RECONNECT_MESSAGE]);
  assert.match(notifications[0].message, /No se pudo publicar «Lanzamiento» en LinkedIn \(Titanes SAS\)/);
  assert.equal(state.item.status, 'REALIZADO', 'with nothing alive in the queue the piece goes back to the team');
});

test('a temporary LinkedIn limit goes back to the queue instead of failing', async () => {
  const { db, state } = queueDb();
  const linkedin = { publishToLinkedIn: async () => { throw new LinkedInError('throttled', { status: 429 }); } };
  const outcome = await queue({ db, linkedin }).publishOne(state.row);
  assert.deepEqual([outcome.status, state.row.attempts, Boolean(state.row.nextAttemptAt)], ['SCHEDULED', 1, true]);
  assert.match(state.row.error, /límite temporal/);
});
