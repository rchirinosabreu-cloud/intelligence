import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AVATAR_RING_CLASSES, avatarRingClass, avatarRingIndex } from '../src/lib/avatarRing.js';

test('the ring palette only uses official brand tones and is stable for the same person', () => {
  for (const className of AVATAR_RING_CLASSES) assert.match(className, /^ring-brand-(cyan|green|magenta|coral|yellow)(-deep)?$/);
  assert.equal(avatarRingClass({ id: 'member-1', name: 'Franci Villa' }), avatarRingClass({ id: 'member-1', name: 'Franci Villa' }));
  assert.equal(avatarRingClass({ userId: 'user-9', id: 'member-x' }), avatarRingClass({ userId: 'user-9', id: 'member-y' }), 'the user id wins over the member id so the same person matches everywhere');
  assert.equal(avatarRingClass('Rodny Chirinos'), avatarRingClass({ name: 'Rodny Chirinos' }), 'a bare name works like a member without ids');
  assert.equal(avatarRingIndex(null), 0);
});

test('a roster of fourteen people spreads across the palette instead of piling on one tone', () => {
  const roster = ['Rodny Chirinos', 'Helen Hernández', 'Melissa Castaño', 'Franci Villa', 'Sara Herrera', 'Jesús Arnedo', 'Elisa Torres',
    'Juan Pérez', 'Camila Ruiz', 'Andrés Gómez', 'Laura Díaz', 'Mateo Silva', 'Valentina Ortiz', 'Daniel Rojas'];
  const used = new Set(roster.map((name) => avatarRingClass({ name })));
  assert.ok(used.size >= 6, `expected at least 6 distinct tones for 14 people, got ${used.size}`);
});

test('TeamAvatar can draw the per-person ring and the sidebar photo uses it', () => {
  const avatar = readFileSync('src/components/ui/TeamAvatar.jsx', 'utf8');
  const sidebar = readFileSync('src/components/layout/SidebarProfile.jsx', 'utf8');
  assert.match(avatar, /avatarRingClass/, 'TeamAvatar resolves the ring from the shared helper');
  assert.match(avatar, /ring\s*=\s*false/, 'the ring is opt-in so small avatars stay quiet');
  assert.match(sidebar, /ring(=\{true\}|\s)/, 'the sidebar photo shows the person ring');
  assert.doesNotMatch(sidebar, /brain-gradient-(primary|spectrum)/, 'the gradient ring gave way to the person colour');
});
