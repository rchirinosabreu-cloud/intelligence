import { test, expect } from '@playwright/test';

test('verify dashboard greeting and message', async ({ page }) => {
  // Try to bypass auth by faking session storage before the page fully mounts
  await page.addInitScript(() => {
    sessionStorage.setItem('authToken', 'fake-token-for-dev');
    sessionStorage.setItem('currentUser', JSON.stringify({
      id: 'cm7md8gzo0000m9ow9d5f7fnd',
      email: 'admin@brainstudio.com',
      name: 'Rodny Perez',
      role: 'ADMIN',
      avatar: null
    }));
  });

  await page.goto('http://localhost:3000/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000); // Wait for UI load

  // Take screenshot of Dashboard Greeting
  await page.screenshot({ path: '/home/jules/verification/dashboard_greeting.png' });
});
