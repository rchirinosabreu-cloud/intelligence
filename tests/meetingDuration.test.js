import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  firefliesMinutesToSeconds,
  formatMeetingDuration,
  getReportedMeetingDuration
} from '../src/utils/meetingDuration.js';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Fireflies duration is normalized from minutes to persisted seconds', () => {
  assert.equal(firefliesMinutesToSeconds(30), 1800);
  assert.equal(firefliesMinutesToSeconds('28.5'), 1710);
  assert.equal(firefliesMinutesToSeconds(0), null);
  assert.equal(firefliesMinutesToSeconds('unknown'), null);
});

test('reported meeting duration is deterministic and human readable', () => {
  assert.equal(formatMeetingDuration(1800), '30 min');
  assert.equal(formatMeetingDuration(5415), '1 h 30 min');
  assert.equal(getReportedMeetingDuration([{ type: 'meeting', duration: 30 }]), '30 min');
  assert.equal(getReportedMeetingDuration([{ type: 'document' }]), '');
});

test('manual and automatic minute flows preserve the Fireflies duration', async () => {
  const [firefliesPanel, sourcePanel, api, summary, automation] = await Promise.all([
    read('src/components/modules/Minutes/FirefliesPanel.jsx'),
    read('src/components/modules/Minutes/SourcePanel.jsx'),
    read('src/services/frontendApiService.js'),
    read('src/components/modules/Minutes/GeneralSummary.jsx'),
    read('src/services/minuteAutomationService.js')
  ]);

  assert.match(firefliesPanel, /duration:\s*meeting\.duration/);
  assert.match(firefliesPanel, /formatMeetingDuration\(firefliesMinutesToSeconds\(meeting\.duration\)\)/);
  assert.match(sourcePanel, /duration:\s*meeting\.duration/);
  assert.match(api, /Duración reportada:/);
  assert.match(summary, /getReportedMeetingDuration/);
  assert.match(summary, /meeting_duration:\s*reportedDuration/);
  assert.match(automation, /firefliesMinutesToSeconds\(summary\.duration\)/);
  assert.match(automation, /firefliesMinutesToSeconds\(transcript\.duration\s*\?\?/);
  assert.match(automation, /durationSeconds/);
});
