import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('application routes are code split behind React lazy and Suspense', async () => {
  const app = await read('src/App.jsx');
  assert.match(app, /import React, \{[^}]*lazy[^}]*Suspense[^}]*\} from 'react'/);
  assert.match(app, /const Reports = lazy\(/);
  assert.match(app, /const FinancialDashboard = lazy\(/);
  assert.match(app, /<Suspense fallback=/);
});

test('kanban query keeps active work and bounds completed history without loading every comment', async () => {
  const service = await read('src/services/nativeTaskService.js');
  const query = service.slice(service.indexOf('export const getTasks'), service.indexOf('export const createTask'));

  assert.match(query, /status:\s*\{\s*not:\s*'REALIZADA'/);
  assert.match(query, /status:\s*'REALIZADA'/);
  assert.match(query, /take:\s*200/);
  assert.doesNotMatch(query, /taskComments/);
});

test('notification header derives unread count from one query', async () => {
  const layout = await read('src/components/layout/AppLayout.jsx');
  assert.doesNotMatch(layout, /api\/notifications\/unread-count/);
  assert.match(layout, /notifications\.filter\(\(notification\) => !notification\.isRead\)\.length/);
});

test('high frequency polling is slowed and pauses while the document is hidden', async () => {
  const chat = await read('src/components/modules/ChatWidget.jsx');
  const announcements = await read('src/components/modules/AnnouncementWidget.jsx');
  const taskPanel = await read('src/components/modules/TaskSidePanel.jsx');
  const activity = await read('src/components/modules/Activity/ActivityMap.jsx');

  for (const source of [chat, announcements, taskPanel, activity]) {
    assert.match(source, /document\.hidden/);
  }
  assert.doesNotMatch(chat, /},\s*3000\)/);
  assert.doesNotMatch(taskPanel, /},\s*4000\)/);
  assert.doesNotMatch(activity, /\?\s*5000\s*:\s*false/);
});

test('personal dashboard bounds task history and comment payloads', async () => {
  const source = await read('src/services/personalDashboardService.js');

  assert.match(source, /nativeTasks:\s*{\s*where:\s*{\s*OR:/s);
  assert.match(source, /completedAt:\s*{\s*gte:\s*dashboardDayWindow\.start/s);
  assert.match(source, /taskComments:\s*{\s*where:\s*{\s*authorId:\s*{\s*not:\s*userId/s);
  assert.match(source, /taskComments:[\s\S]*?take:\s*1/);
});
