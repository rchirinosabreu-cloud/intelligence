import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activityMap = readFileSync(new URL('../src/components/modules/Activity/ActivityMap.jsx', import.meta.url), 'utf8');
const operationalCalendar = readFileSync(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');
const memberCard = readFileSync(new URL('../src/components/modules/Activity/cards/MemberActivityCard.jsx', import.meta.url), 'utf8');
const eventCard = readFileSync(new URL('../src/components/modules/Activity/cards/EventActivityCard.jsx', import.meta.url), 'utf8');

test('activity hover cards use direct inspectable portals without AnimatePresence ownership', () => {
  assert.match(activityMap, /createPortal\(\s*<MemberActivityCard\b[\s\S]*document\.body\s*\)/);
  assert.match(operationalCalendar, /createPortal\(\s*<EventActivityCard\b[\s\S]*document\.body\s*\)/);
  assert.doesNotMatch(activityMap, /AnimatePresence/);
  assert.doesNotMatch(operationalCalendar, /AnimatePresence/);
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

test('floating-card implementations live in dedicated modules with semantic aside roots', () => {
  assert.match(memberCard, /const MemberActivityCard = \([\s\S]*<aside[\s\S]*data-activity-floating-card="member"[\s\S]*<\/aside>/);
  assert.match(eventCard, /const EventActivityCard = \([\s\S]*<aside[\s\S]*data-activity-floating-card="event"[\s\S]*<\/aside>/);
  assert.match(activityMap, /import MemberActivityCard from '.\/cards\/MemberActivityCard'/);
  assert.match(operationalCalendar, /import EventActivityCard from '.\/cards\/EventActivityCard'/);
});
