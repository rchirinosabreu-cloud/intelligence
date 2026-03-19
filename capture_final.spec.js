import { test, expect } from '@playwright/test';

test('capture final screenshots', async ({ page }) => {
  // Setup mock auth
  await page.addInitScript(() => {
    const mockUser = {
      id: 'ab52e6e3-2c49-4e3b-ac76-6d9a6254b2e2',
      name: 'System Admin',
      email: 'admin@brainstudio.com',
      role: 'ADMIN'
    };
    const mockToken = 'mock-jwt-token';
    window.localStorage.setItem('currentUser', JSON.stringify(mockUser));
    window.localStorage.setItem('authToken', mockToken);
  });

  // Re-apply mock auth to backend temporarily
  // (I already know how to do this safely)

  await page.goto('http://localhost:3000/parrillas');
  await page.waitForSelector('text=Marzo 2026', { timeout: 15000 });
  await page.click('text=Marzo 2026');
  await page.waitForURL('**/parrillas/**');

  // Screenshot 1: Detail View
  await page.screenshot({ path: 'screenshots/content_plan_detail_final.png', fullPage: true });

  // Screenshot 2: Dispatch Modal (Enviar a pendientes)
  const dispatchBtn = page.locator('button:has-text("Enviar a pendientes")').first();
  if (await dispatchBtn.isVisible()) {
    await dispatchBtn.click();
    await page.waitForSelector('text=Enviar a Kanban', { timeout: 5000 });
    await page.screenshot({ path: 'screenshots/dispatch_modal_final.png' });
  }
});
