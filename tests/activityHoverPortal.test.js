import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const activityMap = readFileSync(new URL('../src/components/modules/Activity/ActivityMap.jsx', import.meta.url), 'utf8');
const operationalCalendar = readFileSync(new URL('../src/components/modules/Activity/OperationalCalendar.jsx', import.meta.url), 'utf8');
const calendarPresentation = readFileSync(new URL('../src/components/modules/Activity/calendarPresentation.js', import.meta.url), 'utf8');

test('activity map hover cards use the member detail portal without legacy ownership', () => {
  assert.match(activityMap, /activeCardData && createPortal/);
  assert.match(activityMap, /<MemberActivityCard/);
  assert.doesNotMatch(activityMap, /<AnimatePresence>\s*\{hoveredMember === member\.id && createPortal/);
});

test('operational calendar hover cards show a direct read-only event preview', () => {
  assert.match(operationalCalendar, /data-operational-event-popover="preview"/);
  assert.match(operationalCalendar, /hoveredEvent/);
  assert.doesNotMatch(operationalCalendar, /<AnimatePresence>\s*\{hoveredEventData && createPortal/);
});

test('hover triggers retain direct pointer or mouse handlers', () => {
  assert.match(activityMap, /onPointerEnter=\{handlePointerEnter\}/);
  assert.match(operationalCalendar, /onMouseEnter=\{\(e\) => handleEventMouseEnter\(e, event\)\}/);
});

test('floating cards compute viewport-aware positions', () => {
  assert.match(activityMap, /getFloatingCardPosition/);
  assert.match(activityMap, /getBoundingClientRect\(\)/);
  assert.match(operationalCalendar, /getBoundingClientRect\(\)/);
  assert.match(operationalCalendar, /getCalendarPopoverPosition\(rect,/);
  assert.match(calendarPresentation, /viewport\.width - dimensions\.width - margin/);
});
