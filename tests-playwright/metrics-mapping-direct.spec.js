import { test, expect } from '@playwright/test';

test.describe('Metrics Direct Asset Mapping', () => {
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

    // Mock asset loading (direct user endpoints)
    await page.route('**/api/integrations/meta/assets/client-1', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          adAccounts: [{ id: 'act_1', name: 'Ads from Biz A' }, { id: 'act_2', name: 'Ads from Biz B' }],
          pages: [{ id: 'page_1', name: 'Page from Biz A' }, { id: 'page_2', name: 'Page from Biz B' }]
        })
      });
    });
  });

  test('should show all accessible assets directly', async ({ page }) => {
    await page.goto('http://localhost:3000/metricas');

    // Select client
    const mainSelect = page.locator('select').first();
    await mainSelect.waitFor({ state: 'visible' });
    await mainSelect.selectOption('client-1');

    // Verify mapping section is visible
    await expect(page.getByText('Configuración de Activos')).toBeVisible();

    // Verify Business selector is NOT visible
    await expect(page.getByText('Meta Business Account')).not.toBeVisible();

    // Verify pages are listed
    const pageSelect = page.locator('select').nth(1);
    await expect(pageSelect).toContainText('Page from Biz B');

    // Verify ad accounts are listed
    const adSelect = page.locator('select').nth(2);
    await expect(adSelect).toContainText('Ads from Biz A');

    await page.screenshot({ path: 'tests-playwright/screenshots/metrics-mapping-direct-verified.png', fullPage: true });
  });
});
