import { test, expect } from '@playwright/test';

test('verify mission control 3d rendering', async ({ page }) => {
  // Go to login page
  await page.goto('http://localhost:8080/login');

  // Fill credentials
  await page.fill('input[name="email"]', 'admin@brainstudio.com');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');

  // Wait for dashboard and navigate to Mission Control
  await page.waitForURL('**/dashboard');
  await page.click('a[href="/mission-control"]');

  // Wait for the canvas to load
  await page.waitForSelector('canvas');

  // Give it time to render shadows and 3D objects
  await page.waitForTimeout(3000);

  // Take screenshot
  await page.screenshot({ path: 'verification/screenshots/mission_control_3d_v1.png', fullPage: true });

  // Check for the canvas presence
  const canvas = await page.locator('canvas');
  await expect(canvas).toBeVisible();
});
