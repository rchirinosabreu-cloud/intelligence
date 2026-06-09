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

test('both avatar triggers retain pointer hover handlers', () => {
  assert.match(activityMap, /onPointerEnter=\{handlePointerEnter\}/);
  assert.match(operationalCalendar, /onPointerEnter=\{\(e\) =>/);
});

test('floating cards measure their rendered size before final positioning', () => {
  assert.match(activityMap, /cardRef\s*=\s*React\.useRef\(null\)/);
  assert.match(activityMap, /getBoundingClientRect\(\)\s*;\s*\n\s*setCardPosition\(getFloatingCardPosition/);
  assert.match(operationalCalendar, /eventCardRef\s*=\s*React\.useRef\(null\)/);
  assert.match(operationalCalendar, /triggerRect/);
});

test('named floating-card components use stable semantic aside roots', () => {
  assert.match(activityMap, /const MemberActivityCard = \([\s\S]*<aside[\s\S]*data-activity-floating-card="member"[\s\S]*<\/aside>/);
  assert.match(operationalCalendar, /const EventActivityCard = \([\s\S]*<aside[\s\S]*data-activity-floating-card="event"[\s\S]*<\/aside>/);
});

test('portal rendering delegates card markup to named components to avoid inline JSX tag drift', () => {
  assert.match(activityMap, /const MemberActivityCard = \(/);
  assert.match(activityMap, /createPortal\(\s*<MemberActivityCard\b[\s\S]*document\.body\s*\)/);
  assert.match(operationalCalendar, /const EventActivityCard = \(/);
  assert.match(operationalCalendar, /createPortal\(\s*<EventActivityCard\b[\s\S]*document\.body\s*\)/);
});
