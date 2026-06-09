import test from 'node:test';
import assert from 'node:assert/strict';
import { getFloatingCardPosition } from '../src/lib/floatingCardPosition.js';

test('places the card below the trigger when there is not enough room above', () => {
  const position = getFloatingCardPosition(
    { left: 100, top: 20, width: 40, height: 40, bottom: 60 },
    { width: 340, height: 240 },
    { width: 1280, height: 720 }
  );

  assert.equal(position.placement, 'bottom');
  assert.ok(position.top >= 16);
});

test('keeps the card horizontally inside the viewport', () => {
  const position = getFloatingCardPosition(
    { left: 2, top: 500, width: 40, height: 40, bottom: 540 },
    { width: 340, height: 240 },
    { width: 1280, height: 720 }
  );

  assert.equal(position.left, 16);
});

test('places the card above the trigger when enough room is available', () => {
  const position = getFloatingCardPosition(
    { left: 600, top: 500, width: 40, height: 40, bottom: 540 },
    { width: 340, height: 240 },
    { width: 1280, height: 720 }
  );

  assert.equal(position.placement, 'top');
  assert.equal(position.top, 248);
});
