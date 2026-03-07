import { test, expect } from '@playwright/test';

test('verify minutas ui', async ({ page }) => {
  // Try to bypass auth by faking session storage before the page fully mounts
  await page.addInitScript(() => {
    sessionStorage.setItem('authToken', 'fake-token-for-dev');
    sessionStorage.setItem('currentUser', JSON.stringify({
      id: 'cm7md8gzo0000m9ow9d5f7fnd',
      email: 'admin@brainstudio.com',
      name: 'Admin',
      role: 'ADMIN',
      avatar: null
    }));
  });

  await page.goto('http://localhost:3000/minutas');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000); // Give time for UI and widgets to load

  await page.screenshot({ path: '/home/jules/verification/minutas_main.png' });
});
