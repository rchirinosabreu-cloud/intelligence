import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FACEBOOK_PHOTO_MAX_BYTES, META_IMAGE_MAX_BYTES, describeMetaMedia, facebookImagePlan, facebookMedia,
  instagramImagePlan, schedulingNotices, schedulingProblems
} from '../src/lib/socialPublishing.js';
import { createImageDerivativeService, derivedKeyFor, sharpTransform } from '../src/services/socialImageDerivativeService.js';
import { createSocialPublishingService } from '../src/services/socialPublishingService.js';

// Rodny, 1 October 2026, first real piece: a carousel of seven PNG and one MP4. Audited against Meta's
// reference that day: Facebook photos accept PNG but no file over 4 MB (PNG recommended up to 1 MB), and
// a multi-photo Page post cannot carry a video. «Publiquemos también en FB sin el video.»

const MB = 1024 * 1024;
const png = (id, size = 2 * MB) => ({ id, name: `${id}.png`, mimeType: 'image/png', size, storageKey: `k/${id}.png` });
const jpg = (id, size = 1 * MB) => ({ id, name: `${id}.jpg`, mimeType: 'image/jpeg', size, storageKey: `k/${id}.jpg` });
const mp4 = (id) => ({ id, name: `${id}.mp4`, mimeType: 'video/mp4', size: 13 * MB, storageKey: `k/${id}.mp4` });

test('Facebook gets a JPEG copy when a PNG is heavy or any image passes 4 MB; light files travel as they are', () => {
  assert.equal(FACEBOOK_PHOTO_MAX_BYTES, 4 * MB);
  assert.deepEqual(facebookImagePlan({ mimeType: 'image/png', size: 6.2 * MB }), { convert: true, canvas: null, reasons: ['png', 'size'] });
  assert.deepEqual(facebookImagePlan({ mimeType: 'image/png', size: 2 * MB }), { convert: true, canvas: null, reasons: ['png'] }, 'Meta recommends PNG up to 1 MB');
  assert.deepEqual(facebookImagePlan({ mimeType: 'image/png', size: 0.5 * MB }), { convert: false, canvas: null, reasons: [] });
  assert.deepEqual(facebookImagePlan({ mimeType: 'image/jpeg', size: 3 * MB }), { convert: false, canvas: null, reasons: [] });
  assert.deepEqual(facebookImagePlan({ mimeType: 'image/jpeg', size: 5 * MB }), { convert: true, canvas: null, reasons: ['size'] });
  // Instagram: a JPEG over 8 MB is recompressed too instead of blocking the piece.
  assert.deepEqual(instagramImagePlan({ mimeType: 'image/jpeg', width: 1080, height: 1350, kind: 'IMAGE', size: 9 * MB }).reasons, ['size']);
  assert.equal(META_IMAGE_MAX_BYTES, 8 * MB);
});

test('a mixed carousel goes to Facebook with its photos only; Instagram keeps everything', () => {
  const assets = [png('01'), png('02', 6.2 * MB), mp4('07'), png('08')];
  const described = describeMetaMedia({ format: 'Post', assets });
  assert.equal(described.kind, 'CAROUSEL');
  assert.equal(described.problem, null, 'a 6.2 MB PNG no longer blocks: the copy is compressed');
  const facebook = facebookMedia({ kind: described.kind, assets });
  assert.deepEqual(facebook.assets.map((asset) => asset.id), ['01', '02', '08']);
  assert.deepEqual(facebook.droppedVideos.map((asset) => asset.id), ['07']);
  assert.equal(facebook.kind, 'CAROUSEL');
  assert.equal(facebook.problem, null);
  assert.equal(facebookMedia({ kind: 'CAROUSEL', assets: [png('01'), mp4('07')] }).kind, 'IMAGE', 'one photo left is a photo post');
  assert.match(facebookMedia({ kind: 'CAROUSEL', assets: [mp4('a'), mp4('b')] }).problem, /solo tiene videos/);
  assert.deepEqual(facebookMedia({ kind: 'REELS', assets: [mp4('a')] }).assets.length, 1, 'a single video is untouched');
});

test('the band says before scheduling that Facebook goes out without the video, and blocks a videos-only carousel', () => {
  const item = { id: 'i', format: 'Post', status: 'APROBADO', captionText: 'Hola', publishDate: '2036-10-03T00:00:00.000Z', publishTime: '10:30' };
  const assets = [png('01'), mp4('07'), png('08')];
  const notices = schedulingNotices({ item, assets, platforms: ['INSTAGRAM', 'FACEBOOK'] });
  assert.equal(notices.length, 1);
  assert.match(notices[0], /En Facebook sale sin el video «07\.mp4»/);
  assert.match(notices[0], /En Instagram sale completo/);
  assert.deepEqual(schedulingNotices({ item, assets, platforms: ['INSTAGRAM'] }), [], 'Instagram alone needs no notice');
  assert.deepEqual(schedulingNotices({ item, assets: [png('01'), png('02')], platforms: ['FACEBOOK'] }), []);
  const accounts = [{ platform: 'FACEBOOK', isActive: true }, { platform: 'INSTAGRAM', isActive: true }];
  const now = new Date('2036-10-01T12:00:00.000Z');
  assert.deepEqual(schedulingProblems({ item, assets, accounts, platforms: ['INSTAGRAM', 'FACEBOOK'], now }), [], 'a notice is not a problem');
  assert.match(schedulingProblems({ item, assets: [mp4('a'), mp4('b')], accounts, platforms: ['FACEBOOK'], now })[0], /solo tiene videos/);
  const panel = readFileSync('src/components/modules/ContentPlan/SocialPublishingPanel.jsx', 'utf8');
  assert.match(panel, /schedulingNotices\(/);
  assert.match(panel, /data-social-notices/);
});

test('the Facebook copy is decided without reading the file, lives in its own key and is compressed to fit', async () => {
  const asset = png('02', 6.2 * MB);
  assert.equal(derivedKeyFor(asset, 'FACEBOOK'), 'k/derived/02-facebook.jpg');
  assert.equal(derivedKeyFor(asset), 'k/derived/02-instagram.jpg', 'each network has its own copy');
  const calls = [];
  const service = createImageDerivativeService({
    readObject: async (key) => { calls.push(['read', key]); return Buffer.from('png'); },
    writeObject: async ({ key }) => { calls.push(['write', key]); },
    headObject: async () => null,
    probe: async () => { throw new Error('Facebook has no ratio rule: no probe'); },
    transform: async (_buffer, plan, options) => { calls.push(['transform', plan.reasons, options.maxBytes]); return Buffer.from('jpeg'); },
    logger: {}
  });
  const prepared = await service.prepareForFacebook(asset);
  assert.equal(prepared.key, 'k/derived/02-facebook.jpg');
  assert.deepEqual(calls, [['read', 'k/02.png'], ['transform', ['png', 'size'], 4 * MB], ['write', 'k/derived/02-facebook.jpg']]);
  const light = await createImageDerivativeService({ headObject: async () => null, readObject: async () => { throw new Error('no read'); }, logger: {} }).prepareForFacebook(jpg('ok'));
  assert.deepEqual(light, { key: 'k/ok.jpg', derived: false });

  // Real sharp: a noisy image that does not fit at top quality is stepped down until it does.
  const sharp = (await import('sharp')).default;
  const noise = Buffer.alloc(1200 * 1200 * 3);
  for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) % 256;
  const noisyPng = await sharp(noise, { raw: { width: 1200, height: 1200, channels: 3 } }).png().toBuffer();
  const top = await sharpTransform(noisyPng, { canvas: null });
  const capped = await sharpTransform(noisyPng, { canvas: null }, { maxBytes: Math.floor(top.length * 0.8) });
  assert.ok(capped.length < top.length, 'quality steps down when the top-quality copy does not fit');
  assert.deepEqual([capped[0], capped[1]], [0xff, 0xd8]);
});

test('the queue hands Facebook the photos only, as Facebook copies, and Instagram the whole carousel', async () => {
  const NOW = new Date('2036-10-03T15:31:00.000Z');
  const assets = [png('01'), mp4('07'), png('08')].map((asset) => ({ ...asset, externalProvider: null, externalFileId: null }));
  const ig = { id: 'acc-ig', platform: 'INSTAGRAM', externalId: '1789', encryptedToken: 't', isActive: true };
  const fb = { id: 'acc-fb', platform: 'FACEBOOK', externalId: '5', encryptedToken: 't', isActive: true };
  const item = { id: 'item-1', planId: 'p', format: 'Post', status: 'APROBADO', captionText: 'Hola', publishDate: new Date('2036-10-03T00:00:00.000Z'), publishTime: '10:00', deletedAt: null, finalAssets: assets, plan: { id: 'p', clientId: 'c', deletedAt: null, client: { id: 'c', socialAccounts: [ig, fb] } } };
  const rows = [
    { id: 'pub-ig', contentItemId: 'item-1', socialAccountId: 'acc-ig', platform: 'INSTAGRAM', status: 'SCHEDULED', scheduledAt: NOW, attempts: 0 },
    { id: 'pub-fb', contentItemId: 'item-1', socialAccountId: 'acc-fb', platform: 'FACEBOOK', status: 'SCHEDULED', scheduledAt: NOW, attempts: 0 }
  ];
  const db = {
    contentItem: { findUnique: async () => ({ ...item, publications: rows }), update: async () => item },
    socialPublication: {
      findMany: async () => rows,
      findUnique: async ({ where }) => { const row = rows.find((r) => r.id === where.id); return { ...row, socialAccount: [ig, fb].find((a) => a.id === row.socialAccountId) }; },
      updateMany: async ({ where, data }) => { Object.assign(rows.find((r) => r.id === where.id), data); return { count: 1 }; },
      count: async () => 0
    },
    clientSocialAccount: { update: async () => ({}) }
  };
  const sent = [];
  const meta = {
    publishToInstagram: async ({ kind, media }) => { sent.push(['instagram', kind, media.map((file) => file.url)]); return { mediaId: 'ig', permalink: null }; },
    publishToFacebookPage: async ({ kind, media }) => { sent.push(['facebook', kind, media.map((file) => file.url)]); return { mediaId: 'fb', permalink: null }; }
  };
  await createSocialPublishingService({
    db, meta, now: () => NOW, decrypt: (v) => v, notify: async () => null, randomId: () => 'lease', logger: { error() {} },
    mediaUrlFor: async (asset, { platform }) => `${platform}:${asset.id}`
  }).processDuePublications();
  assert.deepEqual(sent, [
    ['instagram', 'CAROUSEL', ['INSTAGRAM:01', 'INSTAGRAM:07', 'INSTAGRAM:08']],
    ['facebook', 'CAROUSEL', ['FACEBOOK:01', 'FACEBOOK:08']]
  ]);
});
