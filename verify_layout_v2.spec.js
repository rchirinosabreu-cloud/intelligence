import { test, expect } from '@playwright/test';

test('Verify Activity Map Balanced Layout V2', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('authToken', 'fake-token-for-dev');
    sessionStorage.setItem('currentUser', JSON.stringify({
      id: 'cm7md8gzo0000m9ow9d5f7fnd',
      email: 'admin@brainstudio.com',
      name: 'Rodny Perez',
      role: 'ADMIN'
    }));
  });

  await page.goto('http://localhost:3000/activity');
  await page.waitForTimeout(3000);

  // Take screenshot of the new 3-column layout V2
  await page.screenshot({ path: 'verification/screenshots/map_balanced_layout_v2.png', fullPage: true });
});
