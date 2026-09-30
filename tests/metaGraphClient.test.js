import test from 'node:test';
import assert from 'node:assert/strict';
import { META_GRAPH_VERSION, MetaGraphError, createMetaGraphClient } from '../src/services/metaGraphService.js';

// The Meta client talks to graph.facebook.com and nothing else. These tests script Meta's answers and
// look at what we asked for: the wrong parameter is a wasted publication and a confused client.

const jsonResponse = (body, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body)
});

const scriptedFetch = (script) => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    const step = script.shift();
    if (!step) throw new Error(`Unexpected call to ${url}`);
    calls.push({ url: String(url), method: options.method || 'GET', body: options.body ? Object.fromEntries(new URLSearchParams(options.body)) : null });
    if (typeof step === 'function') return step({ url: String(url), options });
    return jsonResponse(step.body, step.status);
  };
  return { fetchImpl, calls };
};

const noSleep = async () => {};

test('a single image goes out as one container and one publish, with the caption and the token in the body, never in the URL', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { body: { id: 'container-1' } },
    { body: { id: 'media-9' } },
    { body: { id: 'media-9', permalink: 'https://www.instagram.com/p/abc/' } }
  ]);
  const meta = createMetaGraphClient({ fetchImpl, sleep: noSleep });
  const result = await meta.publishToInstagram({
    igUserId: '1789', token: 'tok-secret', kind: 'IMAGE', caption: 'Hola #brain',
    media: [{ url: 'https://files.example/post.jpg', isVideo: false }]
  });
  assert.deepEqual(result, { mediaId: 'media-9', permalink: 'https://www.instagram.com/p/abc/' });
  assert.equal(calls[0].url, `https://graph.facebook.com/${META_GRAPH_VERSION}/1789/media`);
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { image_url: 'https://files.example/post.jpg', caption: 'Hola #brain', access_token: 'tok-secret' });
  assert.equal(calls[1].url, `https://graph.facebook.com/${META_GRAPH_VERSION}/1789/media_publish`);
  assert.deepEqual(calls[1].body, { creation_id: 'container-1', access_token: 'tok-secret' });
  assert.doesNotMatch(calls[0].url, /tok-secret/, 'the token travels in the body');
  assert.equal(META_GRAPH_VERSION, 'v25.0');
});

test('a reel waits for Meta to finish processing the video before publishing', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { body: { id: 'container-r' } },
    { body: { status_code: 'IN_PROGRESS' } },
    { body: { status_code: 'FINISHED' } },
    { body: { id: 'media-r' } },
    { body: { id: 'media-r', permalink: 'https://www.instagram.com/reel/xyz/' } }
  ]);
  const meta = createMetaGraphClient({ fetchImpl, sleep: noSleep });
  const result = await meta.publishToInstagram({
    igUserId: '1789', token: 't', kind: 'REELS', caption: 'Reel',
    media: [{ url: 'https://files.example/reel.mp4', isVideo: true }]
  });
  assert.equal(result.mediaId, 'media-r');
  assert.deepEqual(calls[0].body, { media_type: 'REELS', video_url: 'https://files.example/reel.mp4', caption: 'Reel', share_to_feed: 'true', access_token: 't' });
  assert.match(calls[1].url, /\/container-r\?fields=status_code%2Cstatus&access_token=t$/);
  assert.equal(calls[3].body.creation_id, 'container-r');
});

test('a container that Meta marks as ERROR or EXPIRED fails with a permanent, explained error', async () => {
  const { fetchImpl } = scriptedFetch([
    { body: { id: 'container-x' } },
    { body: { status_code: 'ERROR', status: 'Error: Media upload failed. Unsupported format' } }
  ]);
  const meta = createMetaGraphClient({ fetchImpl, sleep: noSleep });
  await assert.rejects(
    meta.publishToInstagram({ igUserId: '1', token: 't', kind: 'REELS', caption: '', media: [{ url: 'https://f/x.mp4', isVideo: true }] }),
    (error) => error instanceof MetaGraphError && error.code === 'CONTAINER_ERROR' && /Unsupported format/.test(error.message) && error.status === 400
  );
});

test('a container still processing after the wait budget gives up as a retryable timeout', async () => {
  const { fetchImpl } = scriptedFetch([
    { body: { id: 'container-slow' } },
    { body: { status_code: 'IN_PROGRESS' } },
    { body: { status_code: 'IN_PROGRESS' } }
  ]);
  // A clock that ticks one second per look: the deadline is measured, never left to the wall clock.
  let clock = 0;
  const meta = createMetaGraphClient({ fetchImpl, sleep: noSleep, containerWaitMs: 1500, containerPollMs: 1, now: () => (clock += 1000) });
  await assert.rejects(
    meta.publishToInstagram({ igUserId: '1', token: 't', kind: 'REELS', caption: '', media: [{ url: 'https://f/x.mp4', isVideo: true }] }),
    (error) => error.code === 'CONTAINER_TIMEOUT' && error.status === 504
  );
});

test('a carousel creates one child container per file and a parent that lists them', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { body: { id: 'c1' } },
    { body: { id: 'c2' } },
    { body: { status_code: 'FINISHED' } },
    { body: { id: 'parent' } },
    { body: { status_code: 'FINISHED' } },
    { body: { id: 'media-c' } },
    { body: { id: 'media-c', permalink: 'https://www.instagram.com/p/car/' } }
  ]);
  const meta = createMetaGraphClient({ fetchImpl, sleep: noSleep });
  await meta.publishToInstagram({
    igUserId: '1789', token: 't', kind: 'CAROUSEL', caption: 'Carrusel',
    media: [{ url: 'https://f/1.jpg', isVideo: false }, { url: 'https://f/2.mp4', isVideo: true }]
  });
  assert.deepEqual(calls[0].body, { image_url: 'https://f/1.jpg', is_carousel_item: 'true', access_token: 't' });
  assert.deepEqual(calls[1].body, { media_type: 'VIDEO', video_url: 'https://f/2.mp4', is_carousel_item: 'true', access_token: 't' });
  assert.match(calls[2].url, /\/c2\?fields=/, 'only the video child needs to be waited for');
  assert.deepEqual(calls[3].body, { media_type: 'CAROUSEL', children: 'c1,c2', caption: 'Carrusel', access_token: 't' });
  assert.equal(calls[5].body.creation_id, 'parent');
});

test('a story is one container without caption, image or video', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { body: { id: 's1' } },
    { body: { id: 'media-s' } },
    { body: { id: 'media-s', permalink: 'https://www.instagram.com/stories/x/' } }
  ]);
  const meta = createMetaGraphClient({ fetchImpl, sleep: noSleep });
  await meta.publishToInstagram({ igUserId: '1', token: 't', kind: 'STORIES', caption: 'ignored', media: [{ url: 'https://f/s.jpg', isVideo: false }] });
  assert.deepEqual(calls[0].body, { media_type: 'STORIES', image_url: 'https://f/s.jpg', access_token: 't' });
});

test('Facebook: a photo, a video and a multi-photo post each use the endpoint Meta expects', async () => {
  const photo = scriptedFetch([
    { body: { id: 'ph', post_id: '5555_77' } },
    { body: { permalink_url: 'https://www.facebook.com/5555/posts/77' } }
  ]);
  const meta = createMetaGraphClient({ fetchImpl: photo.fetchImpl, sleep: noSleep });
  const result = await meta.publishToFacebookPage({ pageId: '5555', token: 'pt', kind: 'IMAGE', caption: 'Hola', media: [{ url: 'https://f/1.jpg', isVideo: false }] });
  assert.deepEqual(result, { mediaId: '5555_77', permalink: 'https://www.facebook.com/5555/posts/77' });
  assert.equal(photo.calls[0].url, `https://graph.facebook.com/${META_GRAPH_VERSION}/5555/photos`);
  assert.deepEqual(photo.calls[0].body, { url: 'https://f/1.jpg', message: 'Hola', access_token: 'pt' });

  const video = scriptedFetch([{ body: { id: 'vid-1' } }]);
  const metaVideo = createMetaGraphClient({ fetchImpl: video.fetchImpl, sleep: noSleep });
  const videoResult = await metaVideo.publishToFacebookPage({ pageId: '5555', token: 'pt', kind: 'REELS', caption: 'Video', media: [{ url: 'https://f/v.mp4', isVideo: true }] });
  assert.equal(video.calls[0].url, `https://graph.facebook.com/${META_GRAPH_VERSION}/5555/videos`);
  assert.deepEqual(video.calls[0].body, { file_url: 'https://f/v.mp4', description: 'Video', access_token: 'pt' });
  assert.deepEqual(videoResult, { mediaId: 'vid-1', permalink: 'https://www.facebook.com/5555/videos/vid-1' });

  const carousel = scriptedFetch([
    { body: { id: 'p1' } },
    { body: { id: 'p2' } },
    { body: { id: '5555_88' } },
    { body: { permalink_url: 'https://www.facebook.com/5555/posts/88' } }
  ]);
  const metaCarousel = createMetaGraphClient({ fetchImpl: carousel.fetchImpl, sleep: noSleep });
  await metaCarousel.publishToFacebookPage({ pageId: '5555', token: 'pt', kind: 'CAROUSEL', caption: 'Dos', media: [{ url: 'https://f/1.jpg' }, { url: 'https://f/2.jpg' }] });
  assert.deepEqual(carousel.calls[0].body, { url: 'https://f/1.jpg', published: 'false', access_token: 'pt' });
  assert.equal(carousel.calls[2].url, `https://graph.facebook.com/${META_GRAPH_VERSION}/5555/feed`);
  assert.deepEqual(carousel.calls[2].body, { message: 'Dos', 'attached_media[0]': '{"media_fbid":"p1"}', 'attached_media[1]': '{"media_fbid":"p2"}', access_token: 'pt' });

  await assert.rejects(
    metaCarousel.publishToFacebookPage({ pageId: '5555', token: 'pt', kind: 'STORIES', caption: '', media: [{ url: 'https://f/1.jpg' }] }),
    (error) => error.code === 'UNSUPPORTED_KIND'
  );
});

test('Meta error bodies become a MetaGraphError with the code, subcode and trace Meta gave', async () => {
  const { fetchImpl } = scriptedFetch([
    { status: 400, body: { error: { message: 'Error validating access token: Session has expired', type: 'OAuthException', code: 190, error_subcode: 463, fbtrace_id: 'Axyz' } } }
  ]);
  const meta = createMetaGraphClient({ fetchImpl, sleep: noSleep });
  await assert.rejects(meta.listManagedPages('dead-token'), (error) => (
    error instanceof MetaGraphError && error.status === 400 && error.code === 190 && error.subcode === 463 && error.fbtraceId === 'Axyz'
    && /Session has expired/.test(error.message)
  ));
});

test('listing the pages a token can manage returns each page with its Instagram account, without leaking the page token outside the client', async () => {
  const { fetchImpl, calls } = scriptedFetch([
    { body: { data: [
      { id: '5555', name: 'Titanes', access_token: 'page-token', instagram_business_account: { id: '1789', username: 'titanes' } },
      { id: '6666', name: 'Sin IG', access_token: 'page-token-2' }
    ] } }
  ]);
  const meta = createMetaGraphClient({ fetchImpl, sleep: noSleep });
  const pages = await meta.listManagedPages('sys-token');
  assert.match(calls[0].url, /\/me\/accounts\?/);
  assert.match(calls[0].url, /fields=id%2Cname%2Caccess_token%2Cinstagram_business_account%7Bid%2Cusername%7D/);
  assert.deepEqual(pages, [
    { pageId: '5555', pageName: 'Titanes', pageToken: 'page-token', instagram: { id: '1789', username: 'titanes' } },
    { pageId: '6666', pageName: 'Sin IG', pageToken: 'page-token-2', instagram: null }
  ]);
});
