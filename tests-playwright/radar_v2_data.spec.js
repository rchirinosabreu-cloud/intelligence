import { test, expect } from '@playwright/test';

test('verify talent radar dashboard with data', async ({ page }) => {
  const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjN2Q0YzE2My1kOTQ1LTQ2NWMtOGU3My1iZTU2Y2Q3Mjg1NDIiLCJuYW1lIjoiQWRtaW4gVXNlciIsImVtYWlsIjoiYWRtaW5AYnJhaW5zdHVkaW8uY29tIiwicm9sZSI6IkFETUlOIiwiaWF0IjoxNzc0ODMyMjMyfQ.2QGl2MEZypxCfg5o44Oc3xQ5oVI0C9STH-3sFetpWBA';

  // Mock auth
  await page.addInitScript(({ token }) => {
    const mockUser = {
      id: 'c7d4c163-d945-465c-8e73-be56cd728542',
      email: 'admin@brainstudio.com',
      role: 'ADMIN',
      name: 'Admin User'
    };
    localStorage.setItem('authToken', token);
    localStorage.setItem('currentUser', JSON.stringify(mockUser));
    sessionStorage.setItem('authToken', token);
    sessionStorage.setItem('currentUser', JSON.stringify(mockUser));
  }, { token: mockToken });

  await page.goto('http://localhost:3000/radar');

  // Wait for content
  await page.waitForSelector('text=Radar de Talento & Operaciones');

  // Wait for the chart to render (at least one dot or avatar)
  // Recharts uses <path> or <circle> or <image> for custom content
  await page.waitForTimeout(2000);

  // Check for heatmap category
  await expect(page.locator('text=DISEÑO')).toBeVisible();
  await expect(page.locator('text=ESTRATEGIA')).toBeVisible();

  // Take screenshot
  await page.screenshot({ path: 'verification/radar_data_v2.png', fullPage: true });
  console.log('Screenshot saved to verification/radar_data_v2.png');
});
