import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_PUBLICATION_STATUSES, MAX_PUBLICATION_ATTEMPTS, PUBLICATION_LEASE_MS, PUBLISHABLE_ITEM_STATUSES,
  SOCIAL_PLATFORMS, describeMetaMedia, humanizeMetaError, isRetryableMetaError, nextPublicationRetryAt,
  filterSocialPages, publishAtIso, schedulingProblems, splitPublishTime
} from '../src/lib/socialPublishing.js';

// Rodny, 1 October 2026: with the CEO's key the «Conectar página» list went from 1 page to 69.
test('the list of pages is searched by page name or Instagram handle, ignoring accents and case, and comes sorted', () => {
  const pages = [
    { pageId: '3', pageName: 'Martínez & Nájera Abogados', instagram: { id: 'i3', username: 'martinezynajeraabogados' } },
    { pageId: '1', pageName: 'Endova ', instagram: { id: 'i1', username: 'endova.salud' } },
    { pageId: '2', pageName: 'Barra Lima', instagram: null },
    { pageId: '4', pageName: 'Wine & Wonder by Foobespain', instagram: { id: 'i4', username: 'wineandwonder_byfoobespain' } }
  ];
  assert.deepEqual(filterSocialPages(pages, '').map((page) => page.pageId), ['2', '1', '3', '4'], 'no search: every page, in alphabetical order');
  assert.deepEqual(filterSocialPages(pages, '  ENDOVA ').map((page) => page.pageId), ['1']);
  assert.deepEqual(filterSocialPages(pages, 'najera').map((page) => page.pageId), ['3'], 'accents do not matter');
  assert.deepEqual(filterSocialPages(pages, 'salud').map((page) => page.pageId), ['1'], 'the Instagram handle counts');
  assert.deepEqual(filterSocialPages(pages, '@endova').map((page) => page.pageId), ['1'], 'with or without the @');
  assert.deepEqual(filterSocialPages(pages, 'foobe wine').map((page) => page.pageId), ['4'], 'every word must match, in any order');
  assert.deepEqual(filterSocialPages(pages, 'zzz'), []);
  assert.deepEqual(filterSocialPages(null, 'x'), []);
  assert.equal(pages[0].pageId, '3', 'the original list is not reordered');
});

// Rodny, 29 September 2026: the platform itself publishes the approved pieces of a plan on Instagram and
// Facebook at the day and hour the team set. Meta cannot hold a scheduled post, so the hour lives here.

const image = { id: 'a1', name: 'post.jpg', mimeType: 'image/jpeg', size: 2 * 1024 * 1024, storageKey: 'k/post.jpg' };
const video = { id: 'v1', name: 'reel.mp4', mimeType: 'video/mp4', size: 40 * 1024 * 1024, storageKey: 'k/reel.mp4' };
const drive = { id: 'd1', name: 'reel en drive', externalProvider: 'DRIVE', externalFileId: 'abc', externalUrl: 'https://drive.google.com/file/d/abc/view' };
const igAccount = { id: 'acc-ig', platform: 'INSTAGRAM', isActive: true, externalId: '1789' };
const fbAccount = { id: 'acc-fb', platform: 'FACEBOOK', isActive: true, externalId: '5555' };
const approved = {
  id: 'item-1', format: 'Post', status: 'APROBADO', captionText: 'Hola', publishDate: '2036-10-03T00:00:00.000Z', publishTime: '10:30'
};
const now = new Date('2036-10-01T12:00:00.000Z');

test('the publication instant is the plan day at the Bogotá hour, never a UTC conversion of the day', () => {
  assert.equal(publishAtIso('2036-10-03T00:00:00.000Z', '10:30'), '2036-10-03T15:30:00.000Z');
  assert.equal(publishAtIso(new Date('2036-10-03T00:00:00.000Z'), '22:00'), '2036-10-04T03:00:00.000Z', 'a late evening in Bogotá is the next UTC day');
  assert.equal(publishAtIso('2036-10-03T00:00:00.000Z', ''), null, 'without an hour there is nothing to schedule');
  assert.equal(publishAtIso(null, '10:30'), null);
  assert.equal(publishAtIso('2036-10-03T00:00:00.000Z', '25:00'), null, 'an impossible hour is rejected');
  assert.deepEqual(splitPublishTime('09:15'), { hours: 9, minutes: 15 });
  assert.equal(splitPublishTime('9:15'), null, 'the field travels as HH:mm, like the rest of the platform');
});

test('each format maps to the Meta content type that Meta can actually publish', () => {
  assert.deepEqual(describeMetaMedia({ format: 'Post', assets: [image] }), { kind: 'IMAGE', assets: [image], problem: null });
  assert.deepEqual(describeMetaMedia({ format: 'Reel', assets: [video] }), { kind: 'REELS', assets: [video], problem: null });
  assert.equal(describeMetaMedia({ format: 'Post', assets: [video] }).kind, 'REELS', 'a single video in the feed is a reel for Meta');
  assert.equal(describeMetaMedia({ format: 'Historia', assets: [image] }).kind, 'STORIES');
  assert.equal(describeMetaMedia({ format: 'Historia', assets: [video] }).kind, 'STORIES');
  assert.equal(describeMetaMedia({ format: 'Carrusel', assets: [image, { ...image, id: 'a2' }] }).kind, 'CAROUSEL');
  assert.equal(describeMetaMedia({ format: 'Post', assets: [image, { ...image, id: 'a2' }] }).kind, 'CAROUSEL', 'several images in a post are a carousel');
  assert.match(describeMetaMedia({ format: 'Carrusel', assets: [image] }).problem, /al menos dos/i);
  assert.match(describeMetaMedia({ format: 'Carrusel', assets: Array.from({ length: 11 }, (_, i) => ({ ...image, id: `a${i}` })) }).problem, /10/);
  assert.match(describeMetaMedia({ format: 'Reel', assets: [image] }).problem, /video/i, 'a reel needs a video');
  assert.match(describeMetaMedia({ format: 'Historia', assets: [image, video] }).problem, /una sola/i, 'a story is one file');
  assert.match(describeMetaMedia({ format: 'Post', assets: [] }).problem, /pieza final/i);
  assert.match(describeMetaMedia({ format: 'Post', assets: [drive] }).problem, /Drive/, 'a Drive link cannot be handed to Meta yet');
});

test('Meta limits are checked before spending the publication', () => {
  // 1 October 2026: an image's weight no longer blocks scheduling; the copy sent to Meta is compressed to fit.
  assert.equal(describeMetaMedia({ format: 'Post', assets: [{ ...image, size: 9 * 1024 * 1024 }] }).problem, null);
  assert.match(describeMetaMedia({ format: 'Reel', assets: [{ ...video, size: 301 * 1024 * 1024 }] }).problem, /300 MB/);
  assert.match(describeMetaMedia({ format: 'Historia', assets: [{ ...video, size: 101 * 1024 * 1024 }] }).problem, /100 MB/);
  assert.match(describeMetaMedia({ format: 'Post', assets: [{ ...image, mimeType: 'image/gif' }] }).problem, /JPG|PNG/);
  assert.match(describeMetaMedia({ format: 'Reel', assets: [{ ...video, mimeType: 'video/webm' }] }).problem, /MP4|MOV/);
});

test('scheduling a piece names every reason it cannot go out, in plain Spanish', () => {
  const ok = schedulingProblems({ item: approved, assets: [image], accounts: [igAccount, fbAccount], platforms: ['INSTAGRAM', 'FACEBOOK'], now });
  assert.deepEqual(ok, []);
  assert.deepEqual(PUBLISHABLE_ITEM_STATUSES, ['APROBADO', 'EN_PRODUCCION', 'REALIZADO']);
  assert.match(schedulingProblems({ item: { ...approved, status: 'BORRADOR' }, assets: [image], accounts: [igAccount], platforms: ['INSTAGRAM'], now })[0], /aprobada/i);
  assert.match(schedulingProblems({ item: { ...approved, status: 'PUBLICADO' }, assets: [image], accounts: [igAccount], platforms: ['INSTAGRAM'], now })[0], /ya está publicada/i);
  assert.match(schedulingProblems({ item: { ...approved, publishTime: '' }, assets: [image], accounts: [igAccount], platforms: ['INSTAGRAM'], now })[0], /hora/i);
  assert.match(schedulingProblems({ item: { ...approved, publishDate: '2036-09-30T00:00:00.000Z', publishTime: '10:00' }, assets: [image], accounts: [igAccount], platforms: ['INSTAGRAM'], now })[0], /ya pasó/i);
  assert.match(schedulingProblems({ item: approved, assets: [image], accounts: [fbAccount], platforms: ['INSTAGRAM'], now })[0], /Instagram.*conectad/i);
  assert.match(schedulingProblems({ item: approved, assets: [image], accounts: [{ ...igAccount, isActive: false }], platforms: ['INSTAGRAM'], now })[0], /conectad/i, 'a disconnected account counts as missing');
  assert.match(schedulingProblems({ item: approved, assets: [image], accounts: [igAccount], platforms: [], now })[0], /red/i, 'at least one network');
  assert.match(schedulingProblems({ item: approved, assets: [image], accounts: [igAccount], platforms: ['TIKTOK'], now })[0], /red/i);
  assert.match(schedulingProblems({ item: { ...approved, captionText: 'x'.repeat(2201) }, assets: [image], accounts: [igAccount], platforms: ['INSTAGRAM'], now })[0], /2\.?200/);
  assert.match(schedulingProblems({ item: approved, assets: [], accounts: [igAccount], platforms: ['INSTAGRAM'], now })[0], /pieza final/i);
  assert.match(schedulingProblems({ item: { ...approved, format: 'Historia' }, assets: [image], accounts: [fbAccount], platforms: ['FACEBOOK'], now })[0], /historia.*Facebook/i, 'stories go to Instagram only');
  assert.deepEqual(SOCIAL_PLATFORMS, ['INSTAGRAM', 'FACEBOOK']);
});

test('a failed publication retries a few times with a growing wait, then stops', () => {
  assert.equal(MAX_PUBLICATION_ATTEMPTS, 3);
  assert.equal(nextPublicationRetryAt(1, now).toISOString(), '2036-10-01T12:02:00.000Z');
  assert.equal(nextPublicationRetryAt(2, now).toISOString(), '2036-10-01T12:04:00.000Z');
  assert.equal(nextPublicationRetryAt(3, now), null, 'the third failure is final');
  assert.equal(PUBLICATION_LEASE_MS, 30 * 60 * 1000, 'a carousel with videos waits for Meta up to eight minutes per file');
  assert.deepEqual(ACTIVE_PUBLICATION_STATUSES, ['SCHEDULED', 'PUBLISHING']);
});

test('Meta errors are told apart: transient ones retry, permanent ones explain themselves', () => {
  assert.equal(isRetryableMetaError({ status: 500 }), true);
  assert.equal(isRetryableMetaError({ status: 429 }), true);
  assert.equal(isRetryableMetaError({ code: 4 }), true, 'application rate limit');
  assert.equal(isRetryableMetaError({ code: 2 }), true, 'Meta says try later');
  assert.equal(isRetryableMetaError({ code: 'ECONNRESET' }), true);
  assert.equal(isRetryableMetaError({ status: 400, code: 190 }), false, 'an expired token will not fix itself');
  assert.equal(isRetryableMetaError({ status: 400, code: 100 }), false);
  assert.match(humanizeMetaError({ code: 190 }), /conexión con Meta venció|volver a conectar/i);
  assert.match(humanizeMetaError({ code: 10 }), /permiso/i);
  assert.match(humanizeMetaError({ code: 4 }), /límite/i);
  assert.match(humanizeMetaError({ code: 9007 }), /archivo|formato/i);
  assert.match(humanizeMetaError({ code: 2207026 }), /video/i);
  assert.match(humanizeMetaError({ code: 'CONTAINER_ERROR', message: 'Meta could not process the media' }), /Meta/);
  assert.equal(humanizeMetaError({ name: 'MetaGraphError', status: 400, message: 'Something odd' }), 'Meta respondió: Something odd');
  // A failure of ours before asking Meta anything is not reported as said by Meta (1 October 2026).
  assert.equal(humanizeMetaError({ message: 'Something odd' }), 'No se pudo preparar la publicación: Something odd');
  assert.equal(humanizeMetaError(null), 'Meta no respondió.');
  assert.doesNotMatch(humanizeMetaError({ code: 190 }), /\b190\b/, 'no bare codes for people');
});
