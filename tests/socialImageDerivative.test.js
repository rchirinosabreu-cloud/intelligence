import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTAGRAM_FEED_MAX_RATIO, INSTAGRAM_FEED_MIN_RATIO, instagramImagePlan } from '../src/lib/socialPublishing.js';
import { createImageDerivativeService, derivedKeyFor, sharpProbe, sharpTransform } from '../src/services/socialImageDerivativeService.js';
import { createSocialPublishingService } from '../src/services/socialPublishingService.js';

// Rodny, 30 September 2026: the team exports PNG and Meta Business Suite converts it silently. The
// Instagram API does not: it takes JPEG only, and rejects feed images outside 4:5–1.91:1. So the
// platform does what Business Suite does — converts and pads a copy right before publishing — and
// the designer changes nothing. The original file in the plan is never touched.

test('a JPEG inside the feed range travels untouched; PNG or an off-range ratio get a converted copy', () => {
  assert.equal(INSTAGRAM_FEED_MIN_RATIO, 0.8);
  assert.equal(INSTAGRAM_FEED_MAX_RATIO, 1.91);
  assert.deepEqual(instagramImagePlan({ mimeType: 'image/jpeg', width: 1080, height: 1350, kind: 'IMAGE' }), { convert: false, canvas: null, reasons: [] });
  assert.deepEqual(instagramImagePlan({ mimeType: 'image/png', width: 1080, height: 1350, kind: 'IMAGE' }), { convert: true, canvas: null, reasons: ['png'] });
  // A 9:16 exported for the feed: pad the width up to 4:5, never crop.
  assert.deepEqual(instagramImagePlan({ mimeType: 'image/jpeg', width: 1080, height: 1920, kind: 'IMAGE' }), { convert: true, canvas: { width: 1536, height: 1920 }, reasons: ['ratio'] });
  // A very wide banner: pad the height down to 1.91:1, rounding **up** (1047 would still be 1.9102:1, outside the range).
  assert.deepEqual(instagramImagePlan({ mimeType: 'image/jpeg', width: 2000, height: 500, kind: 'CAROUSEL' }), { convert: true, canvas: { width: 2000, height: 1048 }, reasons: ['ratio'] });
  assert.deepEqual(instagramImagePlan({ mimeType: 'image/png', width: 1080, height: 1920, kind: 'IMAGE' }).reasons, ['png', 'ratio']);
  // Stories have no ratio rule: only the format changes.
  assert.deepEqual(instagramImagePlan({ mimeType: 'image/png', width: 1080, height: 1920, kind: 'STORIES' }), { convert: true, canvas: null, reasons: ['png'] });
  assert.equal(instagramImagePlan({ mimeType: 'image/jpeg', width: 1080, height: 1920, kind: 'STORIES' }).convert, false);
  assert.equal(instagramImagePlan({ mimeType: 'image/jpeg', width: null, height: null, kind: 'IMAGE' }).convert, false, 'unknown size: leave it to Meta');
});

test('the derived copy lives next to the original, is written once and reused afterwards', async () => {
  const asset = { id: 'a1', name: 'post.png', mimeType: 'image/png', storageKey: 'content-plans/titanes/2036-10/item-1/final-assets/post.png' };
  assert.equal(derivedKeyFor(asset), 'content-plans/titanes/2036-10/item-1/final-assets/derived/a1-instagram.jpg');
  const store = new Map([[asset.storageKey, Buffer.from('png-bytes')]]);
  const calls = [];
  const service = createImageDerivativeService({
    readObject: async (key) => { calls.push(['read', key]); return store.get(key); },
    writeObject: async ({ key, body, contentType }) => { calls.push(['write', key, contentType]); store.set(key, body); },
    headObject: async (key) => (store.has(key) ? { key } : null),
    probe: async () => ({ width: 1080, height: 1920 }),
    transform: async (buffer, plan) => { calls.push(['transform', plan]); return Buffer.from('jpeg-bytes'); }
  });
  const first = await service.prepareForInstagram(asset, { kind: 'IMAGE' });
  assert.deepEqual(first, { key: derivedKeyFor(asset), derived: true, cached: false, plan: { convert: true, canvas: { width: 1536, height: 1920 }, reasons: ['png', 'ratio'] } });
  assert.deepEqual(calls.map((call) => call[0]), ['read', 'transform', 'write']);
  assert.equal(calls[2][2], 'image/jpeg');
  const second = await service.prepareForInstagram(asset, { kind: 'IMAGE' });
  assert.deepEqual(second, { key: derivedKeyFor(asset), derived: true, cached: true });
  assert.equal(calls.length, 3, 'the second publication reuses the copy');

  const jpeg = { id: 'a2', name: 'post.jpg', mimeType: 'image/jpeg', storageKey: 'k/post.jpg' };
  store.set('k/post.jpg', Buffer.from('jpg'));
  const untouched = await createImageDerivativeService({
    readObject: async (key) => store.get(key), writeObject: async () => { throw new Error('must not write'); }, headObject: async () => null,
    probe: async () => ({ width: 1080, height: 1080 }), transform: async () => { throw new Error('must not transform'); }
  }).prepareForInstagram(jpeg, { kind: 'IMAGE' });
  assert.deepEqual(untouched, { key: 'k/post.jpg', derived: false });
  const video = await createImageDerivativeService({}).prepareForInstagram({ id: 'v', mimeType: 'video/mp4', storageKey: 'k/v.mp4' }, { kind: 'REELS' });
  assert.deepEqual(video, { key: 'k/v.mp4', derived: false });
});

test('with sharp, a transparent 9:16 PNG becomes a white-padded 4:5 JPEG for the feed and a plain JPEG for a story', async () => {
  const sharp = (await import('sharp')).default;
  const png = await sharp({ create: { width: 540, height: 960, channels: 4, background: { r: 0, g: 155, b: 191, alpha: 0.5 } } }).png().toBuffer();
  const probed = await sharpProbe(png);
  assert.deepEqual([probed.width, probed.height], [540, 960]);

  const feed = await sharpTransform(png, instagramImagePlan({ mimeType: 'image/png', width: 540, height: 960, kind: 'IMAGE' }));
  assert.deepEqual([feed[0], feed[1]], [0xff, 0xd8], 'JPEG magic bytes');
  const feedMeta = await sharp(feed).metadata();
  assert.deepEqual([feedMeta.format, feedMeta.width, feedMeta.height, feedMeta.hasAlpha], ['jpeg', 768, 960, false]);
  const corner = await sharp(feed).extract({ left: 2, top: 2, width: 1, height: 1 }).raw().toBuffer();
  assert.deepEqual([...corner], [255, 255, 255], 'the padding is white, not black');

  const story = await sharpTransform(png, instagramImagePlan({ mimeType: 'image/png', width: 540, height: 960, kind: 'STORIES' }));
  const storyMeta = await sharp(story).metadata();
  assert.deepEqual([storyMeta.format, storyMeta.width, storyMeta.height], ['jpeg', 540, 960]);
});

test('the queue asks for an Instagram-ready copy only for Instagram images, and hands Facebook the original', async () => {
  const NOW = new Date('2036-10-03T15:31:00.000Z');
  const png = { id: 'a1', name: 'post.png', mimeType: 'image/png', size: 1024, storageKey: 'k/post.png', externalProvider: null, externalFileId: null };
  const igAccount = { id: 'acc-ig', clientId: 'c', platform: 'INSTAGRAM', externalId: '1789', displayName: '@t', pageId: '5', encryptedToken: 'enc:ig', isActive: true };
  const fbAccount = { id: 'acc-fb', clientId: 'c', platform: 'FACEBOOK', externalId: '5', displayName: 'T', pageId: '5', encryptedToken: 'enc:fb', isActive: true };
  const item = { id: 'item-1', planId: 'p', format: 'Post', status: 'APROBADO', captionText: 'Hola', publishDate: new Date('2036-10-03T00:00:00.000Z'), publishTime: '10:00', deletedAt: null, finalAssets: [png], plan: { id: 'p', clientId: 'c', deletedAt: null, client: { id: 'c', socialAccounts: [igAccount, fbAccount] } } };
  const rows = [
    { id: 'pub-ig', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: NOW, attempts: 0 },
    { id: 'pub-fb', contentItemId: 'item-1', socialAccountId: 'acc-fb', platform: 'FACEBOOK', status: 'SCHEDULED', scheduledAt: NOW, attempts: 0 }
  ];
  const db = {
    contentItem: { findUnique: async () => ({ ...item, publications: rows }), update: async () => item },
    socialPublication: {
      findMany: async () => rows,
      findUnique: async ({ where }) => { const row = rows.find((r) => r.id === where.id); return { ...row, socialAccount: [igAccount, fbAccount].find((a) => a.id === row.socialAccountId) }; },
      updateMany: async ({ where, data }) => { const row = rows.find((r) => r.id === where.id); Object.assign(row, data); return { count: 1 }; },
      count: async () => 0
    },
    clientSocialAccount: { update: async () => ({}) }
  };
  const asked = [];
  const meta = { publishToInstagram: async (args) => { asked.push(['instagram', args.media[0].url]); return { mediaId: 'ig', permalink: null }; }, publishToFacebookPage: async (args) => { asked.push(['facebook', args.media[0].url]); return { mediaId: 'fb', permalink: null }; } };
  const service = createSocialPublishingService({
    db, meta, now: () => NOW, decrypt: (v) => v, notify: async () => null, randomId: () => 'lease', logger: { error() {} },
    mediaUrlFor: async (asset, { platform, kind }) => `https://signed.example/${platform}/${kind}/${asset.storageKey}`
  });
  await service.processDuePublications();
  assert.deepEqual(asked, [['instagram', 'https://signed.example/INSTAGRAM/IMAGE/k/post.png'], ['facebook', 'https://signed.example/FACEBOOK/IMAGE/k/post.png']]);
});
