import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transformWithEsbuild } from 'vite';
import {
  TIKTOK_RECONNECT_MESSAGE, TIKTOK_SCOPES, humanizeTikTokError, normalizeTikTokOptions, tiktokAuthorizationState, tiktokChunkPlan,
  tiktokCommercialLabel, tiktokConsentText, tiktokMedia, tiktokOptionProblems, tiktokPostInfo, tiktokVideoUrl
} from '../src/lib/tiktokPublishing.js';
import { SOCIAL_PLATFORMS, pieceTargetAccounts, schedulingNotices, schedulingProblems, socialPagesOf, standaloneAccountsOf } from '../src/lib/socialPublishing.js';
import { TikTokError, createTikTokClient } from '../src/services/tiktokService.js';
import { createTikTokAccountService } from '../src/services/tiktokAccountService.js';
import { createTikTokTokenService } from '../src/services/tiktokTokenService.js';
import { createSocialPublishingService, publicSocialAccount } from '../src/services/socialPublishingService.js';

// Rodny, 25 November 2026: «Listo, arranca», with the platform's own TikTok app. TikTok is not Meta nor LinkedIn:
// its review dictates the posting screen (no default audience, interactions off, commercial disclosure, consent),
// the account's settings are asked every time, and the video goes up in chunks.

const NOW = new Date('2036-10-03T15:31:00.000Z');
const MB = 1024 * 1024;
const png = { id: 'a1', name: '1.png', mimeType: 'image/png', size: 2048, storageKey: 'k/1.png' };
const mp4 = { id: 'a3', name: 'reel.mp4', mimeType: 'video/mp4', size: 25 * MB, storageKey: 'k/reel.mp4' };
const avi = { id: 'a5', name: 'reel.avi', mimeType: 'video/x-msvideo', size: 9 * MB, storageKey: 'k/reel.avi' };
const ig = { id: 'acc-ig', platform: 'INSTAGRAM', externalId: '1789', displayName: '@titanes', pageId: '5555', isActive: true };
const fb = { id: 'acc-fb', platform: 'FACEBOOK', externalId: '5555', displayName: 'Titanes', pageId: '5555', isActive: true, isPrimary: true };
const tt = { id: 'acc-tt', platform: 'TIKTOK', externalId: 'open-1', displayName: '@titanes', pageId: 'tiktok:open-1', isActive: true, encryptedToken: 'enc:tt', metadata: {} };
const answered = { privacyLevel: 'PUBLIC_TO_EVERYONE', allowComment: true, allowDuet: false, allowStitch: false, commercial: false, consent: true };
const creator = { username: 'titanes', nickname: 'Titanes Cartagena', avatarUrl: null, privacyLevelOptions: ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'], commentDisabled: false, duetDisabled: true, stitchDisabled: false, maxVideoDurationSeconds: 600 };
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

const json = (payload, { status = 200, headers = {} } = {}) => ({ ok: status >= 200 && status < 300, status, headers: new Headers(headers), json: async () => payload, arrayBuffer: async () => new ArrayBuffer(0) });

test('TikTok is a standalone destination, like LinkedIn, and only takes one video for now', () => {
  assert.ok(SOCIAL_PLATFORMS.includes('TIKTOK'));
  assert.deepEqual(socialPagesOf([ig, fb, tt]).map((page) => page.pageId), ['5555']);
  assert.deepEqual(standaloneAccountsOf([ig, fb, tt]).map((account) => account.id), ['acc-tt']);
  assert.deepEqual(pieceTargetAccounts({ socialPageIds: [] }, [tt]).map((account) => account.id), ['acc-tt']);
  assert.equal(tiktokMedia({ kind: 'REELS', assets: [mp4] }).problem, null);
  assert.match(tiktokMedia({ kind: 'REELS', assets: [avi] }).problem, /MP4, MOV o WebM/);
  assert.match(tiktokMedia({ kind: 'REELS', assets: [{ ...mp4, size: 5 * 1024 * MB }] }).problem, /hasta 4 GB/);
  assert.match(tiktokMedia({ kind: 'IMAGE', assets: [png] }).problem, /solo se envían videos/);
  assert.match(tiktokMedia({ kind: 'CAROUSEL', assets: [png, png] }).problem, /solo se envían videos/);
  assert.match(tiktokMedia({ kind: 'STORIES', assets: [mp4] }).problem, /historia/);
});

test('nothing is chosen for the person: no audience, interactions off, no commercial flag, no consent', () => {
  assert.deepEqual(normalizeTikTokOptions(null), { privacyLevel: null, allowComment: false, allowDuet: false, allowStitch: false, commercial: false, yourBrand: false, brandedContent: false, consent: false });
  assert.equal(normalizeTikTokOptions({ privacyLevel: 'EVERYONE' }).privacyLevel, null, 'an audience TikTok does not name is not an answer');
  assert.equal(normalizeTikTokOptions({ allowComment: 'yes' }).allowComment, false, 'only an explicit true switches something on');
  assert.deepEqual([normalizeTikTokOptions({ yourBrand: true }).yourBrand, normalizeTikTokOptions({ commercial: true, yourBrand: true }).yourBrand], [false, true]);
  const problems = tiktokOptionProblems(null);
  assert.match(problems[0], /quién puede ver/);
  assert.ok(problems.some((problem) => /Confirmación de uso de música/.test(problem)));
  assert.deepEqual(tiktokOptionProblems(answered), []);
});

test('commercial content: one of the two must be marked, a paid partnership is never «only me», and the label is told', () => {
  assert.ok(tiktokOptionProblems({ ...answered, commercial: true }).some((problem) => /tu marca, la de un tercero o las dos/.test(problem)));
  assert.deepEqual(tiktokOptionProblems({ ...answered, commercial: true, yourBrand: true }), []);
  assert.ok(tiktokOptionProblems({ ...answered, privacyLevel: 'SELF_ONLY', commercial: true, brandedContent: true }).some((problem) => /colaboración pagada no puede/.test(problem)));
  assert.equal(tiktokCommercialLabel(answered), null);
  assert.match(tiktokCommercialLabel({ commercial: true, yourBrand: true }), /Contenido promocional/);
  assert.match(tiktokCommercialLabel({ commercial: true, yourBrand: true, brandedContent: true }), /Colaboración pagada/);
  assert.deepEqual(tiktokConsentText(answered).links, ['music']);
  const branded = tiktokConsentText({ commercial: true, brandedContent: true });
  assert.deepEqual(branded.links, ['branded', 'music']);
  assert.match(branded.text, /Política de contenido de marca y la Confirmación de uso de música/);
});

test('what the account allows right now wins over what was answered when scheduling', () => {
  assert.ok(tiktokOptionProblems({ ...answered, privacyLevel: 'FOLLOWER_OF_CREATOR' }, { creatorInfo: creator }).some((problem) => /ya no admite publicar para «Seguidores»/.test(problem)));
  assert.deepEqual(tiktokOptionProblems(answered, { creatorInfo: creator }), []);
  assert.ok(tiktokOptionProblems(answered, { creatorInfo: creator, durationSeconds: 700 }).some((problem) => /10 min 0 s/.test(problem)));
  const info = tiktokPostInfo({ text: 'Hola #Brain', options: { ...answered, allowDuet: true, allowStitch: true }, creatorInfo: creator });
  assert.deepEqual(info, { title: 'Hola #Brain', privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false, disable_duet: true, disable_stitch: false, brand_organic_toggle: false, brand_content_toggle: false });
  assert.equal(tiktokPostInfo({ text: 'x'.repeat(3000), options: answered }).title.length, 2200);
});

test('scheduling to TikTok asks for the answers and says what goes differently', () => {
  const item = { status: 'APROBADO', format: 'Reel', captionText: 'Hola', publishDate: '2036-10-03', publishTime: '11:00', coverKey: 'k/cover.jpg' };
  assert.deepEqual(schedulingProblems({ item, assets: [mp4], targets: [tt], now: NOW }), [], 'the band before the questions are open does not complain');
  assert.ok(schedulingProblems({ item, assets: [mp4], targets: [tt], tiktokOptions: null, now: NOW }).some((problem) => /quién puede ver/.test(problem)), 'the server always asks');
  assert.deepEqual(schedulingProblems({ item, assets: [mp4], targets: [tt], tiktokOptions: answered, now: NOW }), []);
  assert.ok(schedulingProblems({ item: { ...item, format: 'Post' }, assets: [png], targets: [tt], tiktokOptions: answered, now: NOW }).some((problem) => /solo se envían videos/.test(problem)));
  assert.ok(schedulingProblems({ item: { ...item, captionText: 'x'.repeat(2300) }, assets: [mp4], targets: [tt], tiktokOptions: answered, now: NOW }).some((problem) => /TikTok acepta hasta 2\.200/.test(problem)));
  const notices = schedulingNotices({ item, assets: [mp4], platforms: ['TIKTOK'] });
  assert.ok(notices.some((notice) => /sin la portada/.test(notice)));
  assert.ok(notices.some((notice) => /sin música añadida/.test(notice)));
});

test('the file is cut the way TikTok counts: whole under 5 MB, and the last part carries the remainder', () => {
  assert.equal(tiktokChunkPlan(0), null);
  assert.deepEqual(tiktokChunkPlan(3 * MB), { videoSize: 3 * MB, chunkSize: 3 * MB, totalChunkCount: 1, parts: [{ first: 0, last: 3 * MB - 1 }] });
  const plan = tiktokChunkPlan(25 * MB);
  assert.deepEqual([plan.chunkSize, plan.totalChunkCount], [10 * MB, 2]);
  assert.deepEqual(plan.parts, [{ first: 0, last: 10 * MB - 1 }, { first: 10 * MB, last: 25 * MB - 1 }]);
  assert.equal(tiktokChunkPlan(10 * MB).totalChunkCount, 1);
});

test('the authorisation: the daily key renews itself and the yearly permission is what warns', () => {
  const inHours = (hours) => new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
  const fresh = tiktokAuthorizationState({ metadata: { expiresAt: inHours(20), refreshExpiresAt: inHours(24 * 300) } }, NOW);
  assert.deepEqual([fresh.expired, fresh.expiringSoon, fresh.needsRefresh], [false, false, false]);
  assert.equal(tiktokAuthorizationState({ metadata: { expiresAt: inHours(0.5), refreshExpiresAt: inHours(24 * 300) } }, NOW).needsRefresh, true);
  const late = tiktokAuthorizationState({ metadata: { expiresAt: inHours(-3), refreshExpiresAt: inHours(24 * 5) } }, NOW);
  assert.deepEqual([late.expired, late.expiringSoon, late.daysLeft, late.needsRefresh], [false, true, 5, true]);
  assert.equal(tiktokAuthorizationState({ metadata: { expiresAt: inHours(-3), refreshExpiresAt: inHours(-1) } }, NOW).expired, true);
  const account = publicSocialAccount({ ...tt, metadata: { expiresAt: inHours(2), refreshExpiresAt: inHours(48), encryptedRefreshToken: 'enc:r' } });
  assert.equal(account.authorization.refreshExpiresAt, inHours(48));
  assert.equal(JSON.stringify(account).includes('enc:'), false, 'no token ever reaches the screen');
});

test('TikTok errors are told in Spanish and say what to do', () => {
  assert.equal(humanizeTikTokError({ status: 401, code: 'access_token_invalid' }), TIKTOK_RECONNECT_MESSAGE);
  assert.match(humanizeTikTokError({ status: 400, code: 'spam_risk_too_many_posts' }), /tope diario/);
  assert.match(humanizeTikTokError({ status: 400, code: 'unaudited_client_can_only_post_to_private_accounts' }), /todavía no ha aprobado la aplicación/);
  assert.match(humanizeTikTokError({ status: 429, code: 'rate_limit_exceeded' }), /límite temporal/);
  assert.match(humanizeTikTokError({ status: 400, code: 'frame_rate_check_failed' }), /cuadros por segundo/);
  assert.match(humanizeTikTokError({ status: 503 }), /se vuelve a intentar/);
  assert.equal(tiktokVideoUrl({ username: '@titanes', postId: '77' }), 'https://www.tiktok.com/@titanes/video/77');
  assert.equal(tiktokVideoUrl({ username: 'titanes', postId: null }), null, 'a private video has no public link');
  assert.equal(new TikTokError('x', { status: 400, code: 'spam_risk' }).permanent, true);
  assert.equal(new TikTokError('x', { status: 429, code: 'rate_limit_exceeded' }).permanent, undefined);
});

test('the authorisation address asks only to see the name and to publish, and returns to the platform', () => {
  const client = createTikTokClient({ env: { TIKTOK_CLIENT_KEY: 'key-1', TIKTOK_CLIENT_SECRET: 's' } });
  const url = new URL(client.authorizationUrl({ state: 'st', redirectUri: client.redirectUri('https://labs.example.com') }));
  assert.equal(`${url.origin}${url.pathname}`, 'https://www.tiktok.com/v2/auth/authorize/');
  assert.deepEqual([url.searchParams.get('client_key'), url.searchParams.get('scope'), url.searchParams.get('response_type'), url.searchParams.get('redirect_uri'), url.searchParams.get('state')],
    ['key-1', TIKTOK_SCOPES.join(','), 'code', 'https://labs.example.com/tiktok/callback', 'st']);
  assert.deepEqual(TIKTOK_SCOPES, ['user.info.basic', 'video.publish']);
  assert.equal(createTikTokClient({ env: {} }).isConfigured(), false);
});

test('the code is exchanged with the same return address, and the token never travels in a URL', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/v2/oauth/token/')) return json({ access_token: 'act.1', expires_in: 86400, refresh_token: 'rft.1', refresh_expires_in: 31536000, open_id: 'open-1', scope: 'user.info.basic,video.publish' });
    return json({ data: { creator_username: 'titanes', creator_nickname: 'Titanes', privacy_level_options: ['SELF_ONLY'], comment_disabled: true, duet_disabled: false, stitch_disabled: false, max_video_post_duration_sec: 300 }, error: { code: 'ok', message: '' } });
  };
  const client = createTikTokClient({ fetchImpl, env: { TIKTOK_CLIENT_KEY: 'key-1', TIKTOK_CLIENT_SECRET: 'secret-1' } });
  const tokens = await client.exchangeCode('code-1', { redirectUri: 'https://labs.example.com/tiktok/callback' });
  assert.deepEqual(tokens, { accessToken: 'act.1', expiresInSeconds: 86400, refreshToken: 'rft.1', refreshExpiresInSeconds: 31536000, openId: 'open-1', scope: 'user.info.basic,video.publish' });
  const body = new URLSearchParams(calls[0].init.body);
  assert.deepEqual([body.get('grant_type'), body.get('code'), body.get('redirect_uri'), body.get('client_key'), body.get('client_secret')], ['authorization_code', 'code-1', 'https://labs.example.com/tiktok/callback', 'key-1', 'secret-1']);
  const info = await client.creatorInfo('act.1');
  assert.deepEqual([info.username, info.privacyLevelOptions, info.commentDisabled, info.maxVideoDurationSeconds], ['titanes', ['SELF_ONLY'], true, 300]);
  assert.equal(calls[1].init.headers.Authorization, 'Bearer act.1');
  assert.equal(calls.some((call) => call.url.includes('act.1')), false);
});

test('TikTok answers errors inside a 200: they still fail, with TikTok\'s code', async () => {
  const client = createTikTokClient({ fetchImpl: async (url) => (url.endsWith('/v2/oauth/token/')
    ? json({ error: 'invalid_grant', error_description: 'Authorization code is expired.', log_id: 'L1' })
    : json({ data: {}, error: { code: 'spam_risk_too_many_posts', message: 'too many', log_id: 'L2' } })), env: { TIKTOK_CLIENT_KEY: 'k', TIKTOK_CLIENT_SECRET: 's' } });
  await assert.rejects(client.exchangeCode('c'), (error) => error.name === 'TikTokError' && error.code === 'invalid_grant' && error.status === 400);
  await assert.rejects(client.creatorInfo('t'), (error) => error.code === 'spam_risk_too_many_posts' && error.permanent === true && error.logId === 'L2');
});

test('a video: upload opened with what the person answered, sent in ranges, and TikTok asked until it says published', async () => {
  const calls = [];
  const order = [];
  let polls = 0;
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url === 'https://signed.example/reel.mp4') {
      order.push(`read ${init.headers.Range}`);
      const [first, last] = init.headers.Range.replace('bytes=', '').split('-').map(Number);
      return { ok: true, status: 206, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(last - first + 1) };
    }
    if (url.endsWith('/video/init/')) return json({ data: { publish_id: 'v_pub_1', upload_url: 'https://upload.tiktok.example/v1' }, error: { code: 'ok' } });
    if (url === 'https://upload.tiktok.example/v1') { order.push(`put ${init.headers['Content-Range']}`); return json({}, { status: 201 }); }
    polls += 1;
    return json({ data: polls < 3 ? { status: 'PROCESSING_UPLOAD' } : { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: [7001] }, error: { code: 'ok' } });
  };
  const client = createTikTokClient({ fetchImpl, sleep: async () => {}, env: { TIKTOK_CLIENT_KEY: 'k', TIKTOK_CLIENT_SECRET: 's' } });
  const result = await client.publishVideo({
    token: 'act.1', creator, options: answered, text: 'Hola #Brain', beforePublish: async () => { order.push('before'); },
    file: { url: 'https://signed.example/reel.mp4', size: 25 * MB, name: 'reel.mp4', mimeType: 'video/mp4' }
  });
  assert.deepEqual(result, { mediaId: '7001', permalink: 'https://www.tiktok.com/@titanes/video/7001' });
  const init = JSON.parse(calls.find((call) => call.url.endsWith('/video/init/')).init.body);
  assert.deepEqual(init.source_info, { source: 'FILE_UPLOAD', video_size: 25 * MB, chunk_size: 10 * MB, total_chunk_count: 2 });
  assert.deepEqual([init.post_info.privacy_level, init.post_info.disable_comment, init.post_info.disable_duet, init.post_info.title], ['PUBLIC_TO_EVERYONE', false, true, 'Hola #Brain']);
  assert.deepEqual(order, [
    `read bytes=0-${10 * MB - 1}`, `put bytes 0-${10 * MB - 1}/${25 * MB}`,
    `read bytes=${10 * MB}-${25 * MB - 1}`, 'before', `put bytes ${10 * MB}-${25 * MB - 1}/${25 * MB}`
  ], 'the order to publish is recorded just before the last part, the one that makes TikTok publish');
  assert.equal(polls, 3);
});

test('a video TikTok rejects, or never finishes, fails with its reason', async () => {
  const make = (statusPayload, extra = {}) => createTikTokClient({
    fetchImpl: async (url, init = {}) => {
      if (url.startsWith('https://signed.example')) return { ok: true, status: 206, headers: new Headers(), arrayBuffer: async () => new ArrayBuffer(8) };
      if (url.endsWith('/video/init/')) return json({ data: { publish_id: 'p', upload_url: 'https://upload.tiktok.example/v1' }, error: { code: 'ok' } });
      if (init.method === 'PUT') return json({}, { status: 201 });
      return json({ data: statusPayload, error: { code: 'ok' } });
    }, sleep: async () => {}, env: { TIKTOK_CLIENT_KEY: 'k', TIKTOK_CLIENT_SECRET: 's' }, ...extra
  });
  const file = { url: 'https://signed.example/reel.mp4', size: 2 * MB, name: 'reel.mp4' };
  await assert.rejects(make({ status: 'FAILED', fail_reason: 'frame_rate_check_failed' }).publishVideo({ token: 't', file, options: answered }), (error) => error.code === 'frame_rate_check_failed' && error.permanent === true);
  let clock = 0;
  await assert.rejects(make({ status: 'PROCESSING_UPLOAD' }, { now: () => { clock += 5 * 60 * 1000; return clock; } }).publishVideo({ token: 't', file, options: answered }), (error) => error.code === 'PROCESSING_TIMEOUT' && error.status === 504 && !error.permanent);
});

const accountDb = () => {
  const state = { rows: [] };
  return {
    state,
    db: {
      client: { findUnique: async ({ where }) => (where.id === 'client-1' ? { id: 'client-1', name: 'Titanes', slug: 'titanes' } : null) },
      clientSocialAccount: {
        findFirst: async ({ where }) => state.rows.find((row) => row.clientId === where.clientId && row.platform === where.platform && row.externalId === where.externalId) || null,
        findUnique: async ({ where }) => state.rows.find((row) => row.id === where.id) || null,
        create: async ({ data }) => { const row = { id: `acc-${state.rows.length + 1}`, ...data }; state.rows.push(row); return row; },
        update: async ({ where, data }) => { const row = state.rows.find((candidate) => candidate.id === where.id); Object.assign(row, data); return row; }
      }
    }
  };
};

test('connecting an account: who leaves for TikTok is who comes back, and nothing is stored until the account is confirmed', async () => {
  const { db, state } = accountDb();
  const tiktok = {
    isConfigured: () => true,
    redirectUri: (origin) => `${origin}/tiktok/callback`,
    authorizationUrl: ({ state: signed, redirectUri }) => `https://www.tiktok.com/v2/auth/authorize/?state=${signed}&redirect_uri=${redirectUri}`,
    exchangeCode: async (code, { redirectUri }) => ({ accessToken: `act.${code}`, expiresInSeconds: 86400, refreshToken: 'rft.1', refreshExpiresInSeconds: 31536000, openId: 'open-1', scope: 'video.publish', redirectUri }),
    creatorInfo: async () => creator
  };
  const service = createTikTokAccountService({ db, tiktok, encryptToken: (value) => `enc(${value})`, decryptToken: (value) => value.slice(4, -1), stateSecret: () => 'secret', now: () => NOW });
  const { url } = await service.start({ clientId: 'client-1', actorUserId: 'user-1', origin: 'https://labs.example.com' });
  const signed = new URL(url).searchParams.get('state');
  await assert.rejects(service.exchange({ code: 'c1', state: signed, actorUserId: 'someone-else' }), /otra persona/);
  const exchanged = await service.exchange({ code: 'c1', state: signed, actorUserId: 'user-1' });
  assert.deepEqual([exchanged.clientName, exchanged.account.username, exchanged.account.nickname], ['Titanes', 'titanes', 'Titanes Cartagena']);
  assert.equal(state.rows.length, 0, 'nothing saved before the person confirms the account');
  assert.equal(JSON.stringify(exchanged.account).includes('act.'), false);
  await assert.rejects(service.link({ pending: exchanged.pending, actorUserId: 'someone-else' }), /otra persona/);
  const linked = await service.link({ pending: exchanged.pending, actorUserId: 'user-1' });
  assert.deepEqual([linked.platform, linked.displayName, linked.pageId, linked.externalId], ['TIKTOK', '@titanes', 'tiktok:open-1', 'open-1']);
  assert.equal(state.rows[0].encryptedToken, 'enc(act.c1)');
  assert.equal(state.rows[0].metadata.encryptedRefreshToken, 'enc(rft.1)');
  assert.equal(state.rows[0].metadata.refreshExpiresAt, new Date(NOW.getTime() + 31536000 * 1000).toISOString());
  await service.link({ pending: exchanged.pending, actorUserId: 'user-1' });
  assert.equal(state.rows.length, 1, 'connecting the same account again updates it');
});

test('without the app keys the platform says what is missing; and what the account allows is asked with a fresh key', async () => {
  const off = createTikTokAccountService({ db: accountDb().db, tiktok: { isConfigured: () => false }, stateSecret: () => 'secret' });
  await assert.rejects(off.start({ clientId: 'client-1', actorUserId: 'u' }), (error) => error.status === 503 && error.code === 'TIKTOK_NOT_CONFIGURED' && /TIKTOK_CLIENT_KEY/.test(error.message));
  const { db, state } = accountDb();
  state.rows.push({ ...tt, clientId: 'client-1' }, { ...tt, id: 'acc-off', isActive: false, lastError: 'venció' }, { id: 'acc-li', platform: 'LINKEDIN' });
  const asked = [];
  const service = createTikTokAccountService({ db, tiktok: { isConfigured: () => true, creatorInfo: async (token) => { asked.push(token); if (token === 'capped') throw new TikTokError('cap', { status: 400, code: 'spam_risk_too_many_posts' }); return creator; } }, freshToken: async (account) => (account.id === 'acc-tt' ? 'fresh' : 'capped'), stateSecret: () => 'secret' });
  const info = await service.creatorInfoFor({ accountId: 'acc-tt' });
  assert.deepEqual([info.accountId, info.nickname, asked[0]], ['acc-tt', 'Titanes Cartagena', 'fresh']);
  await assert.rejects(service.creatorInfoFor({ accountId: 'acc-off' }), (error) => error.status === 409 && error.code === 'TIKTOK_DISCONNECTED');
  await assert.rejects(service.creatorInfoFor({ accountId: 'acc-li' }), (error) => error.status === 404);
});

test('the key of an account: used while fresh, renewed in its last hour, kept when TikTok is down, and switched off when TikTok refuses', async () => {
  const inHours = (hours) => new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
  const updates = [];
  const build = (refresh) => createTikTokTokenService({
    db: { clientSocialAccount: { update: async ({ data }) => { updates.push(data); return data; } } },
    tiktok: { refreshAccessToken: refresh }, decryptToken: (value) => value.replace('enc:', ''), encryptToken: (value) => `enc:${value}`, now: () => NOW, logger: { error() {} }
  });
  const account = (meta) => ({ id: 'acc-tt', encryptedToken: 'enc:old', metadata: { encryptedRefreshToken: 'enc:rft', refreshExpiresAt: inHours(24 * 200), ...meta } });
  assert.equal(await build(async () => { throw new Error('not called'); }).freshToken(account({ expiresAt: inHours(10) })), 'old');
  assert.equal(await build(async (token) => ({ accessToken: `new-from-${token}`, expiresInSeconds: 86400, refreshToken: 'rft2', refreshExpiresInSeconds: 31536000 })).freshToken(account({ expiresAt: inHours(0.5) })), 'new-from-rft');
  assert.deepEqual([updates[0].encryptedToken, updates[0].metadata.encryptedRefreshToken, updates[0].metadata.expiresAt], ['enc:new-from-rft', 'enc:rft2', inHours(24)]);
  assert.equal(await build(async () => { throw new TikTokError('down', { status: 503 }); }).freshToken(account({ expiresAt: inHours(0.5) })), 'old', 'TikTok down and the key still valid: publish with it');
  await assert.rejects(build(async () => { throw new TikTokError('down', { status: 503 }); }).freshToken(account({ expiresAt: inHours(-1) })), (error) => error.status === 503 && !error.permanent, 'TikTok down and the key expired: a passing failure, the account stays on');
  updates.length = 0;
  await assert.rejects(build(async () => { throw new TikTokError('revoked', { status: 400, code: 'invalid_grant' }); }).freshToken(account({ expiresAt: inHours(-1) })), (error) => error.code === 'TIKTOK_REAUTH_REQUIRED' && error.permanent);
  assert.deepEqual([updates[0].isActive, updates[0].lastError], [false, TIKTOK_RECONNECT_MESSAGE]);
  await assert.rejects(build(async () => ({})).freshToken(account({ expiresAt: inHours(-1), refreshExpiresAt: inHours(-1) })), (error) => error.code === 'TIKTOK_REAUTH_REQUIRED');
});

const queueDb = ({ assets = [mp4], format = 'Reel', options = answered } = {}) => {
  const state = {
    item: {
      id: 'item-1', planId: 'plan-1', format, status: 'PROGRAMADO', objective: 'Lanzamiento', captionText: 'Hola #Brain', publishDate: new Date('2036-10-03T00:00:00.000Z'), publishTime: '10:30',
      deletedAt: null, finalAssets: assets, plan: { id: 'plan-1', clientId: 'client-1', deletedAt: null, client: { id: 'client-1', socialAccounts: [tt] } }
    },
    row: { id: 'pub-tt', contentItemId: 'item-1', socialAccountId: 'acc-tt', platform: 'TIKTOK', status: 'SCHEDULED', scheduledAt: new Date('2036-10-03T15:30:00.000Z'), attempts: 0, leaseToken: null, requestedById: 'user-1', options },
    accountUpdates: []
  };
  const db = {
    contentItem: { findUnique: async () => ({ ...state.item, publications: [state.row] }), update: async ({ data }) => { Object.assign(state.item, data); return state.item; } },
    socialPublication: {
      findUnique: async () => ({ ...state.row, socialAccount: tt }),
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
const queue = ({ db, tiktok, notifications = [] }) => createSocialPublishingService({
  db, tiktok, tiktokToken: async () => 'fresh-token', meta: {}, linkedin: {}, now: () => NOW, decrypt: (value) => value,
  mediaUrlFor: async (asset, { platform }) => `https://signed.example/${platform}/${asset.storageKey}`,
  notify: async (data) => { notifications.push(data); return data; }, completeTask: async () => ({}), randomId: () => 'lease-1', logger: { error() {} }
});

test('the queue publishes a TikTok row with what the person answered, after asking the account again', async () => {
  const { db, state } = queueDb();
  const asked = [];
  const notifications = [];
  const tiktok = {
    creatorInfo: async (token) => { asked.push(['creator', token]); return creator; },
    publishVideo: async ({ beforePublish, ...args }) => { asked.push(['publish', args]); await beforePublish(); return { mediaId: '7001', permalink: 'https://www.tiktok.com/@titanes/video/7001' }; }
  };
  const outcome = await queue({ db, tiktok, notifications }).publishOne(state.row);
  assert.deepEqual(outcome, { id: 'pub-tt', status: 'PUBLISHED', permalink: 'https://www.tiktok.com/@titanes/video/7001' });
  assert.deepEqual(asked[0], ['creator', 'fresh-token']);
  const sent = asked[1][1];
  assert.deepEqual([sent.token, sent.text, sent.options, sent.creator.username, sent.file.url, sent.file.size], ['fresh-token', 'Hola #Brain', answered, 'titanes', 'https://signed.example/TIKTOK/k/reel.mp4', 25 * MB]);
  assert.deepEqual([state.row.status, state.row.externalMediaId, state.item.status], ['PUBLISHED', '7001', 'PUBLICADO']);
  assert.ok(state.row.publishRequestedAt);
  assert.match(notifications[0].message, /ya está publicado en TikTok/);
});

test('if the account no longer allows what was chosen, nothing is sent and the reason says what to do', async () => {
  const { db, state } = queueDb({ options: { ...answered, privacyLevel: 'FOLLOWER_OF_CREATOR' } });
  let published = false;
  const tiktok = { creatorInfo: async () => creator, publishVideo: async () => { published = true; return {}; } };
  const outcome = await queue({ db, tiktok }).publishOne(state.row);
  assert.deepEqual([outcome.status, published], ['FAILED', false]);
  assert.match(state.row.error, /No se envió a TikTok: la cuenta de TikTok ya no admite publicar para «Seguidores»/);
});

test('a row without the answers never goes out, a TikTok refusal is told in Spanish, and a lost answer after the last part is left to a person', async () => {
  const missing = queueDb({ options: null });
  const tiktokNever = { creatorInfo: async () => { throw new Error('must not be asked'); }, publishVideo: async () => { throw new Error('must not publish'); } };
  assert.equal((await queue({ db: missing.db, tiktok: tiktokNever }).publishOne(missing.state.row)).status, 'FAILED');
  assert.match(missing.state.row.error, /No se envió a TikTok: elige quién puede ver/);

  const refused = queueDb();
  await queue({ db: refused.db, tiktok: { creatorInfo: async () => creator, publishVideo: async () => { throw new TikTokError('unaudited', { status: 403, code: 'unaudited_client_can_only_post_to_private_accounts' }); } } }).publishOne(refused.state.row);
  assert.deepEqual([refused.state.row.status, /todavía no ha aprobado la aplicación/.test(refused.state.row.error)], ['FAILED', true]);

  const revoked = queueDb();
  await queue({ db: revoked.db, tiktok: { creatorInfo: async () => { throw new TikTokError('bad token', { status: 401, code: 'access_token_invalid' }); }, publishVideo: async () => ({}) } }).publishOne(revoked.state.row);
  assert.deepEqual([revoked.state.row.error, revoked.state.accountUpdates[0].isActive], [TIKTOK_RECONNECT_MESSAGE, false]);

  const limited = queueDb();
  const again = await queue({ db: limited.db, tiktok: { creatorInfo: async () => { throw new TikTokError('slow down', { status: 429, code: 'rate_limit_exceeded' }); }, publishVideo: async () => ({}) } }).publishOne(limited.state.row);
  assert.deepEqual([again.status, Boolean(limited.state.row.nextAttemptAt)], ['SCHEDULED', true]);

  const lost = queueDb();
  await queue({ db: lost.db, tiktok: { creatorInfo: async () => creator, publishVideo: async ({ beforePublish }) => { await beforePublish(); throw new TikTokError('timeout', { status: 504, code: 'PROCESSING_TIMEOUT' }); } } }).publishOne(lost.state.row);
  assert.deepEqual([lost.state.row.status, lost.state.row.nextAttemptAt], ['FAILED', null]);
  assert.match(lost.state.row.error, /TikTok recibió el video pero no confirmó/);
});

test('the posting screen carries what TikTok reviews: no default audience, interactions off, disclosure, consent and the account name', async () => {
  const [options, panel, callback, widget, app, routes] = await Promise.all([
    read('src/components/modules/ContentPlan/TikTokPostOptions.jsx'), read('src/components/modules/ContentPlan/SocialPublishingPanel.jsx'),
    read('src/components/modules/TikTokCallback.jsx'), read('src/components/modules/SocialAccountsWidget.jsx'), read('src/App.jsx'), read('src/routes/api/socialPublishing.js')
  ]);
  assert.match(options, /<option value="" disabled>Elige una opción<\/option>/, 'the audience has no default');
  assert.match(options, /creator\.privacyLevelOptions/);
  for (const marker of ['data-tiktok-comment', 'data-tiktok-duet', 'data-tiktok-stitch', 'data-tiktok-commercial', 'data-tiktok-your-brand', 'data-tiktok-branded', 'data-tiktok-consent']) assert.ok(options.includes(marker), marker);
  assert.match(options, /creator\.commentDisabled/);
  assert.match(options, /Se publica en la cuenta/);
  assert.match(options, /TIKTOK_MUSIC_CONFIRMATION_URL/);
  assert.match(options, /staleTime: 0/, 'what the account allows is asked every time, never kept');
  assert.match(panel, /account\.platform === 'LINKEDIN' \|\| account\.platform === 'TIKTOK'/, 'TikTok comes unchecked');
  assert.match(panel, /problems\.length > 0 \|\| tiktokPending/);
  assert.match(panel, /goesToTikTok \? \{ tiktokOptions \} : undefined/);
  assert.match(callback, /Confirma que esta es la cuenta de este cliente/);
  assert.match(widget, /api\/social\/tiktok\/start/);
  assert.match(app, /path="\/tiktok\/callback"/);
  assert.match(routes, /router\.get\('\/tiktok\/creator-info'/);
  for (const [name, source] of [['TikTokPostOptions.jsx', options], ['TikTokCallback.jsx', callback]]) await transformWithEsbuild(source, name, { loader: 'jsx', jsx: 'automatic' });
});
