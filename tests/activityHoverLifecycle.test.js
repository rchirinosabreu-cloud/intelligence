import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cancelHoverClose, scheduleHoverClose } from '../src/lib/hoverCloseController.js';

const activityMap = readFileSync(new URL('../src/components/modules/Activity/ActivityMap.jsx', import.meta.url), 'utf8');
const operationalCalendar = readFileSync(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');

test('scheduling a close replaces every previous pending close', () => {
  const callbacks = new Map();
  let nextId = 0;
  const timers = {
    setTimeout(callback) {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      callbacks.delete(id);
    }
  };
  const timerRef = { current: null };
  let closeCount = 0;

  scheduleHoverClose(timerRef, () => { closeCount += 1; }, 300, timers);
  scheduleHoverClose(timerRef, () => { closeCount += 1; }, 300, timers);
  cancelHoverClose(timerRef, timers);

  for (const callback of callbacks.values()) callback();
  assert.equal(closeCount, 0);
  assert.equal(callbacks.size, 0);
});

test('activity hover flows use pointer events only and do not duplicate mouse lifecycle events', () => {
  for (const source of [activityMap, operationalCalendar]) {
    assert.doesNotMatch(source, /onMouseEnter=/);
    assert.doesNotMatch(source, /onMouseLeave=/);
    assert.match(source, /onPointerEnter=/);
    assert.match(source, /onPointerLeave=/);
  }
});
