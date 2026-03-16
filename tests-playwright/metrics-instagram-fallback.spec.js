import { test, expect } from '@playwright/test';

test.describe('Metrics Instagram Fallback', () => {
  test.beforeEach(async ({ page }) => {
    // Mock login/auth
    await page.addInitScript(() => {
      window.localStorage.setItem('authToken', 'mock-token');
      window.localStorage.setItem('currentUser', JSON.stringify({ id: 'user-1', name: 'Jules Admin', role: 'ADMIN' }));
    });

    // Mock clients
    await page.route('**/api/db/clients', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'client-1', name: 'TruPeak' }])
      });
    });

    // Mock specific client
    await page.route('**/api/db/clients/client-1', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'client-1', name: 'TruPeak' })
      });
    });

    // Mock integration status (connected)
    await page.route('**/api/integrations/client-1/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          provider: 'meta',
          updatedAt: new Date().toISOString(),
          metadata: { facebookUserName: 'BrainStudio Official' }
        }])
      });
    });

    // Mock asset loading
    await page.route('**/api/integrations/meta/assets/client-1', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          adAccounts: [],
          pages: [{ id: 'page_no_ig', name: 'Page Without IG' }]
        })
      });
    });

    // Mock Instagram (not found)
    await page.route('**/api/integrations/meta/instagram/client-1?pageId=page_no_ig', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(null)
      });
    });
  });

  test('should show fallback message when no Instagram account is found', async ({ page }) => {
    await page.goto('http://localhost:3000/metricas');

    // Select client
    const mainSelect = page.locator('select').first();
    await mainSelect.waitFor({ state: 'visible' });
    await mainSelect.selectOption('client-1');

    // Select page
    const pageSelect = page.locator('select').nth(1);
    await pageSelect.selectOption('page_no_ig');

    // Verify fallback message
    await expect(page.getByText('No se detectó cuenta de Instagram vinculada')).toBeVisible();

    await page.screenshot({ path: 'tests-playwright/screenshots/metrics-instagram-fallback-verified.png', fullPage: true });
  });
});
