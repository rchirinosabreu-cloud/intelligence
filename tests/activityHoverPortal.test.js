import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activityMap = readFileSync(new URL('../src/components/modules/Activity/ActivityMap.jsx', import.meta.url), 'utf8');
const operationalCalendar = readFileSync(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');

test('activity hover cards use a direct, inspectable portal without AnimatePresence ownership', () => {
  assert.match(activityMap, /data-activity-floating-card="member"/);
  assert.doesNotMatch(activityMap, /<AnimatePresence>\s*\{hoveredMember === member\.id && createPortal/);
});

test('operational calendar hover cards use a direct, inspectable portal without AnimatePresence ownership', () => {
  assert.match(operationalCalendar, /data-activity-floating-card="event"/);
  assert.doesNotMatch(operationalCalendar, /<AnimatePresence>\s*\{hoveredEventData && createPortal/);
});

test('both avatar triggers retain native mouse hover handlers', () => {
  assert.match(activityMap, /onMouseEnter=\{handleMouseEnter\}/);
  assert.match(operationalCalendar, /onMouseEnter=\{\(e\) =>/);
});
