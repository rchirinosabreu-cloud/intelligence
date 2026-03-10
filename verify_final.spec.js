import { test, expect } from '@playwright/test';

test('verify authentication and dashboard data load', async ({ page }) => {
  // Use unique values for metrics to avoid strict mode violations and ensure data load
  const mockMetrics = { total: 8888, completed: 4444, pending: 4444, percentage: 50 };

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
        { id: 't1', title: 'Verified Achievement', completedAt: new Date().toISOString(), assignee: { name: 'Jules' }, client: { name: 'Verified Client' } }
      ]),
    });
  });

  await page.route('**/api/notifications/unread-count', async route => {
    await route.fulfill({ status: 200, body: JSON.stringify({ count: 5 }) });
  });

  await page.route('**/api/notifications', async route => {
    await route.fulfill({ status: 200, body: JSON.stringify([]) });
  });

  await page.route('**/api/metrics/quality-streak', async route => {
    await route.fulfill({ status: 200, body: JSON.stringify({ streak: 77, lastReturnDate: null }) });
  });

  // Set fake auth in localStorage
  await page.addInitScript(() => {
    window.localStorage.setItem('authToken', 'valid-test-token');
    window.localStorage.setItem('currentUser', JSON.stringify({ id: '1', name: 'Jules Developer', email: 'jules@brainstudio.com', role: 'ADMIN' }));
  });

  // Navigate to Dashboard
  await page.goto('http://localhost:3000/');

  // Wait for unique metrics to be visible - confirms API calls are successful and parsed
  await expect(page.locator('text=8888')).toBeVisible();
  await expect(page.locator('text=4444').first()).toBeVisible();

  // Wait for "Verified Achievement"
  await expect(page.locator('text=Verified Achievement')).toBeVisible();

  // Take screenshot
  await page.screenshot({ path: 'verification/final_fix_dashboard.png', fullPage: true });
});
