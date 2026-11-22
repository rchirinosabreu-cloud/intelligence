import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { nextLeaguePose, LEAGUE_POSES, LEAGUE_SPRITE_FRAMES, leagueGesture, leagueStillFrame, spriteLayout } from '../src/lib/leaguePose.js';

test('every reopening changes pose, including repeated random values', () => {
  assert.deepEqual(LEAGUE_POSES, ['rest', 'wave', 'celebrate']);
  for (const random of [0, 0.49, 0.9999]) {
    let previous = 0;
    for (let i = 0; i < 15; i++) {
      const next = nextLeaguePose(previous, () => random);
      assert.ok(next >= 0 && next < 3);
      assert.notEqual(next, previous);
      previous = next;
    }
  }
});

// Avatares animados (Rodny, 21 de noviembre de 2026: «trabajemos con las opciones 2D animadas, me gustan»).
test('the animated sheet shows one frame at the requested visible height', () => {
  const sheet = { frameWidth: 88, frameHeight: 110, frames: 8 };
  const layout = spriteLayout({ sheet, person: { top: 20, height: 88 }, size: 44 });
  assert.equal(layout.scale, 0.5);
  assert.equal(layout.height, 44);
  assert.equal(layout.frameWidth, 44);
  assert.equal(layout.frameHeight, 55);
  assert.equal(layout.sheetWidth, 44 * 8);
  assert.equal(layout.top, -10);
  assert.ok(layout.width < layout.frameWidth, 'the layout box is the body, raised hands overflow it');
  assert.equal(spriteLayout({ sheet, person: null, size: 44 }), null);
  assert.equal(spriteLayout({ sheet, person: { top: 0, height: 0 }, size: 44 }), null);
});

test('each pose has a gesture and a still frame for reduced motion', () => {
  assert.equal(LEAGUE_SPRITE_FRAMES, 8);
  assert.deepEqual(LEAGUE_POSES.map(pose => leagueGesture(pose, false)), [null, 'wave', 'celebrate']);
  // Al pasar el cursor o tocar, quien está en reposo saluda.
  assert.deepEqual(LEAGUE_POSES.map(pose => leagueGesture(pose, true)), ['wave', 'wave', 'celebrate']);
  assert.deepEqual(LEAGUE_POSES.map(pose => leagueStillFrame(pose)), [0, 3, 7]);
  for (const pose of LEAGUE_POSES) assert.ok(leagueStillFrame(pose) < LEAGUE_SPRITE_FRAMES);
});

test('the thirteen animated sheets are light and described in frames.json', () => {
  const dir = 'src/assets/team-pixel/anim';
  const meta = JSON.parse(readFileSync(`${dir}/frames.json`, 'utf8'));
  const sheets = readdirSync(dir).filter(name => name.endsWith('.png'));
  assert.equal(sheets.length, 13);
  assert.deepEqual(Object.keys(meta.people).sort(), sheets.map(name => name.replace('.png', '')).sort());
  for (const name of sheets) {
    assert.ok(statSync(`${dir}/${name}`).size < 40 * 1024, `${name} pesa menos de 40 KB`);
    // IHDR: ancho y alto en los bytes 16 a 24.
    const header = readFileSync(`${dir}/${name}`);
    assert.equal(header.readUInt32BE(16), meta.frameWidth * meta.frames);
    assert.equal(header.readUInt32BE(20), meta.frameHeight);
  }
  // Las hojas viejas de más de 1 MB ya no viajan en la aplicación.
  assert.equal(existsSync('src/assets/team-pixel/poses/rodny.png'), false);
});
