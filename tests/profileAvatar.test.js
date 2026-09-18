import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { clampOffset, coverScale, cropRect, displayedSize, MAX_ZOOM, MIN_ZOOM } from '../src/lib/avatarCrop.js';
import { buildAvatarProxyUrl, extractAvatarGcsPath, replaceProfileAvatar } from '../src/services/avatarService.js';

// Decisión de Rodny, 18 de septiembre de 2026: cada persona cambia su propia foto (subir + encuadrar);
// el admin ya no la sube desde Radar de Mérito.

test('the framing geometry always covers the circle and never shows a gap', () => {
  const natural = { width: 1200, height: 800 };
  assert.equal(coverScale(natural, 256), 256 / 800, 'the short side fills the viewport');
  assert.equal(coverScale({ width: 400, height: 400 }, 256), 0.64);
  assert.equal(coverScale(null, 256), 1);

  const size = displayedSize(natural, 256, 1);
  assert.equal(Math.round(size.width), 384);
  assert.equal(Math.round(size.height), 256);

  const centred = clampOffset({ natural, viewport: 256, zoom: 1, offset: { x: 500, y: 500 } });
  assert.equal(centred.x, 64, 'sideways movement stops at the image edge');
  assert.equal(centred.y, 0, 'no vertical slack when the height equals the viewport');

  const zoomed = clampOffset({ natural, viewport: 256, zoom: 2, offset: { x: -9999, y: 9999 } });
  assert.equal(zoomed.x, -256, 'zoom 2x: (768 - 256) / 2');
  assert.equal(zoomed.y, 128, 'zoom 2x: (512 - 256) / 2');
  assert.deepEqual(clampOffset({ natural, viewport: 256, zoom: 1, offset: { x: NaN, y: undefined } }), { x: 0, y: 0 });
});

test('the crop rectangle maps the visible circle back onto the original pixels', () => {
  const natural = { width: 1200, height: 800 };
  const centre = cropRect({ natural, viewport: 256, zoom: 1, offset: { x: 0, y: 0 } });
  assert.equal(Math.round(centre.sx), 200, 'centred: (1200 - 800) / 2');
  assert.equal(Math.round(centre.sy), 0);
  assert.equal(Math.round(centre.sw), 800);
  assert.equal(Math.round(centre.sh), 800, 'always a square');

  const left = cropRect({ natural, viewport: 256, zoom: 1, offset: { x: 64, y: 0 } });
  assert.equal(Math.round(left.sx), 0, 'dragging the image right reveals its left edge');

  const zoomed = cropRect({ natural, viewport: 256, zoom: 2, offset: { x: 0, y: 0 } });
  assert.equal(Math.round(zoomed.sw), 400, 'zoom 2x keeps half of the pixels');
  assert.equal(Math.round(zoomed.sx), 400);
  assert.equal(Math.round(zoomed.sy), 200);
  assert.ok(MIN_ZOOM === 1 && MAX_ZOOM === 3);
});

test('replacing the own avatar uploads first, syncs both records, then removes the previous file', async () => {
  const calls = [];
  const db = {
    user: { findUnique: async () => ({ id: 'user-1', avatarUrl: '/api/talent-radar/member/member-1/avatar-image?gcsPath=avatars%2Fmember-1_1_old.jpg' }) },
    teamMember: { findFirst: async ({ where }) => { calls.push(['member-lookup', where]); return { id: 'member-1', avatarUrl: null }; } },
    $transaction: async (run) => run({
      user: { update: async (args) => calls.push(['user.update', args]) },
      teamMember: { update: async (args) => calls.push(['member.update', args]) }
    })
  };
  const storage = {
    uploadAvatar: async (file, targetId) => { calls.push(['upload', file.originalname, targetId]); return { gcsPath: 'avatars/member-1_2_new.jpg' }; },
    deleteFileFromGCS: async (path) => calls.push(['delete', path])
  };

  const result = await replaceProfileAvatar({ userId: 'user-1', file: { originalname: 'avatar.jpg' }, db, storage });

  assert.equal(result.avatarUrl, buildAvatarProxyUrl('member-1', 'avatars/member-1_2_new.jpg'));
  assert.deepEqual(calls.map((call) => call[0]), ['member-lookup', 'upload', 'user.update', 'member.update', 'delete'], 'upload, then both updates, then hygiene');
  assert.deepEqual(calls[0][1], { userId: 'user-1' }, 'the member is found through the authenticated user, never through a client-provided id');
  assert.equal(calls[1][2], 'member-1', 'files are stored under the team member id like the historical uploads');
  assert.deepEqual(calls[2][1].data, { avatarUrl: result.avatarUrl });
  assert.deepEqual(calls[3][1].data, { avatarUrl: result.avatarUrl });
  assert.equal(calls[4][1], 'avatars/member-1_1_old.jpg');
});

test('replacing the avatar tolerates a missing team member and a failed cleanup, but not an unknown user', async () => {
  const updates = [];
  const db = {
    user: { findUnique: async ({ where }) => (where.id === 'ghost' ? null : { id: 'user-2', avatarUrl: 'https://cdn.example/old.png' }) },
    teamMember: { findFirst: async () => null },
    $transaction: async (run) => run({ user: { update: async (args) => updates.push(args) }, teamMember: { update: async () => { throw new Error('must not run'); } } })
  };
  const storage = { uploadAvatar: async () => ({ gcsPath: 'avatars/user-2_3_new.jpg' }), deleteFileFromGCS: async () => { throw new Error('boom'); } };

  const result = await replaceProfileAvatar({ userId: 'user-2', file: {}, db, storage });
  assert.equal(result.targetId, 'user-2');
  assert.equal(updates.length, 1);
  await assert.rejects(replaceProfileAvatar({ userId: 'ghost', file: {}, db, storage }), { statusCode: 404 });
  await assert.rejects(replaceProfileAvatar({ userId: '', file: {}, db, storage }), { statusCode: 401 });

  assert.equal(extractAvatarGcsPath('/x?gcsPath=avatars%2Fa_1.jpg'), 'avatars/a_1.jpg');
  assert.equal(extractAvatarGcsPath('/x?gcsPath=clients%2Fa.jpg'), null, 'only the avatars folder is ever deleted');
  assert.equal(extractAvatarGcsPath('https://cdn.example/old.png'), null);
});

test('the own-avatar route is authenticated-only, self-scoped and validates the file like the historical route', () => {
  const route = readFileSync('src/routes/api/user.js', 'utf8');
  assert.match(route, /router\.put\('\/avatar', avatarUpload\.single\('avatar'\)/);
  assert.match(route, /fileSize: 5 \* 1024 \* 1024/);
  assert.match(route, /file\.mimetype\.startsWith\('image\/'\)/);
  assert.match(route, /status\(415\)/);
  assert.match(route, /replaceProfileAvatar\(\{ userId: req\.user\.userId, file \}\)/, 'the target is always the authenticated person');
  assert.doesNotMatch(route, /req\.params\.memberId|req\.body\.userId/, 'no way to point the upload at somebody else');
});

test('the profile owns the photo editor with framing, and Radar de Mérito no longer uploads photos', () => {
  const profile = readFileSync('src/components/modules/Profile.jsx', 'utf8');
  const radar = readFileSync('src/components/modules/TalentRadar.jsx', 'utf8');
  const editor = readFileSync('src/components/profile/AvatarEditor.jsx', 'utf8');

  assert.match(profile, /<Dialog open=\{isAvatarModalOpen\}/, 'the shared dialog is kept');
  assert.match(profile, /<AvatarEditor/);
  assert.doesNotMatch(profile, /AvatarUploader|talent-radar\/member\/[^`]*\/avatar/, 'the profile no longer uses the admin uploader');
  assert.match(profile, /isOwnProfile && \(/, 'only the owner can change the photo');
  assert.doesNotMatch(radar, /AvatarUploader|Info P[uú]blica|activeTab/, 'Radar de Mérito shows performance only');
  assert.equal(existsSync('src/components/modules/Radar/AvatarUploader.jsx'), false, 'the admin uploader is gone');

  assert.match(editor, /api\/user\/avatar/);
  assert.match(editor, /type="range"/, 'zoom slider');
  assert.match(editor, /onPointerDown|onPointerMove/, 'drag to frame');
  assert.match(editor, /ArrowLeft|ArrowRight/, 'keyboard framing');
  assert.match(editor, /canvas\.toBlob/, 'the crop happens client-side before upload');
  assert.match(editor, /cropRect\(/, 'the crop uses the tested geometry');
  assert.match(editor, /maxSize: MAX_BYTES/);
  assert.doesNotMatch(editor, /Como administrador/, 'no admin-only wording');
  assert.match(editor, /invalidateQueries\(\{ queryKey \}\)/, 'sidebar, header and lists refresh after saving');
});
