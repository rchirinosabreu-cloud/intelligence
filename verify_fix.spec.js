import { test, expect } from '@playwright/test';

test('verify dashboard loads with data and take screenshot', async ({ page }) => {
  // Use unique values for metrics to avoid strict mode violations
  const mockMetrics = { total: 1234, completed: 567, pending: 667, percentage: 46 };

  await page.route('**/api/metrics/tasks', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockMetrics),
    });
  });

  await page.route('**/api/tasks/completed', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: 't1', title: 'Task Unique Alpha', completedAt: new Date().toISOString(), assignee: { name: 'Jules' }, client: { name: 'Client A' } },
        { id: 't2', title: 'Task Unique Beta', completedAt: new Date().toISOString(), assignee: { name: 'Jules' }, client: { name: 'Client B' } }
      ]),
    });
  });

  await page.route('**/api/notifications/unread-count', async route => {
    await route.fulfill({ status: 200, body: JSON.stringify({ count: 2 }) });
  });

  await page.route('**/api/notifications', async route => {
    await route.fulfill({ status: 200, body: JSON.stringify([]) });
  });

  await page.route('**/api/metrics/quality-streak', async route => {
    await route.fulfill({ status: 200, body: JSON.stringify({ streak: 99, lastReturnDate: null }) });
  });

  await page.route('**/api/global-announcements', async route => {
    await route.fulfill({ status: 200, body: JSON.stringify([]) });
  });

  await page.route('**/api/calendar/upcoming', async route => {
    await route.fulfill({ status: 200, body: JSON.stringify([]) });
  });

  await page.route('**/api/clients', async route => {
    await route.fulfill({ status: 200, body: JSON.stringify([]) });
  });

  // Set fake auth in localStorage
  await page.addInitScript(() => {
    window.localStorage.setItem('authToken', 'fake-token');
    window.localStorage.setItem('currentUser', JSON.stringify({ id: '1', name: 'Jules Developer', email: 'jules@brainstudio.com', role: 'ADMIN' }));
  });

  // Navigate to Dashboard
  await page.goto('http://localhost:3000/');

  // Wait for unique metrics to be visible
  await expect(page.locator('text=1234')).toBeVisible();
  await expect(page.locator('text=567')).toBeVisible();
  await expect(page.locator('text=667')).toBeVisible();

  // Wait for "Logros recientes"
  await expect(page.locator('text=Task Unique Alpha')).toBeVisible();

  // Take screenshot
  await page.screenshot({ path: 'verification/dashboard_fix_verification.png', fullPage: true });
});
