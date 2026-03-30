import { test, expect } from '@playwright/test';

test('verify talent radar dashboard', async ({ page }) => {
  // Mock auth
  await page.addInitScript(() => {
    const mockUser = {
      id: 'c7d4c163-d945-465c-8e73-be56cd728542',
      email: 'admin@brainstudio.com',
      role: 'ADMIN',
      name: 'Admin User'
    };
    localStorage.setItem('authToken', 'mock-token');
    localStorage.setItem('currentUser', JSON.stringify(mockUser));
    sessionStorage.setItem('authToken', 'mock-token');
    sessionStorage.setItem('currentUser', JSON.stringify(mockUser));
  });

  await page.goto('http://localhost:3000/radar');

  // Wait for content
  await page.waitForSelector('text=Radar de Talento & Operaciones');

  // Check for the Nine-Box matrix
  await expect(page.locator('text=Matriz de Desempeño (Nine-Box)')).toBeVisible();

  // Take screenshot
  await page.screenshot({ path: 'verification/radar_v2.png', fullPage: true });
  console.log('Screenshot saved to verification/radar_v2.png');
});
