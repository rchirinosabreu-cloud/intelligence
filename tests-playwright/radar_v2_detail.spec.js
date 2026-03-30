import { test, expect } from '@playwright/test';

test('verify talent radar detail view', async ({ page }) => {
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

  // Click on the member card - use a more robust selector targeting the grid item
  // The member name is inside a span inside the clickable div
  await page.locator('div.cursor-pointer:has-text("Admin User")').first().click();

  // Wait for Slide-over
  await page.waitForSelector('text=Perfil de Desempeño', { timeout: 10000 });

  // Check for some sections in the slide-over
  await expect(page.locator('text=Top 5 Impacto')).toBeVisible();

  // Wait for AI Analysis button
  const aiButton = page.locator('button:has-text("Generar con IA")');
  await expect(aiButton).toBeVisible();

  // Take screenshot of the slide-over
  await page.screenshot({ path: 'verification/radar_detail_v2.png' });
  console.log('Screenshot saved to verification/radar_detail_v2.png');
});
