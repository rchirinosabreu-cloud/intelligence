import { test, expect } from '@playwright/test';

test('verify authentication flow and 403 fix', async ({ page }) => {
  // 1. Mock the login response
  await page.route('**/api/login', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'mock-valid-jwt-token',
        user: { id: 'u1', name: 'Test User', email: 'test@brainstudio.com', role: 'ADMIN' }
      }),
    });
  });

  // 2. Mock a protected endpoint to verify it receives the token
  let capturedHeaders = {};
  await page.route('**/api/metrics/tasks', async route => {
    capturedHeaders = route.request().headers();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ total: 10, completed: 5, pending: 5, percentage: 50 }),
    });
  });

  // 3. Mock others to prevent 404/noise
  await page.route('**/api/tasks/completed', async route => route.fulfill({ status: 200, body: '[]' }));
  await page.route('**/api/notifications/unread-count', async route => route.fulfill({ status: 200, body: '{"count":0}' }));
  await page.route('**/api/metrics/quality-streak', async route => route.fulfill({ status: 200, body: '{"streak":0}' }));

  // 4. Go to login page (assuming root redirects or shows login if unauthenticated)
  await page.goto('http://localhost:3000/');

  // 5. Perform Login
  await page.fill('input[type="email"]', 'test@brainstudio.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button:has-text("Acceder")');

  // 6. Wait for dashboard to load and check if metrics call happened with Authorization header
  await expect(page.locator('text=Pendientes del mes')).toBeVisible();

  // Verify Interceptor worked
  expect(capturedHeaders['authorization']).toBe('Bearer mock-valid-jwt-token');

  // 7. Take final verification screenshot
  await page.screenshot({ path: 'verification/auth_fix_verification.png', fullPage: true });
});
