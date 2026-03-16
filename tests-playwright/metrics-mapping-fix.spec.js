import { test, expect } from '@playwright/test';

test.describe('Metrics Asset Mapping Fixes', () => {
  test.beforeEach(async ({ page }) => {
    // Mock login/auth
    await page.addInitScript(() => {
      window.localStorage.setItem('authToken', 'mock-token');
      window.localStorage.setItem('currentUser', JSON.stringify({ id: 'user-1', name: 'Jules Admin', role: 'ADMIN' }));
      window.FB = {
        login: (cb) => cb({ authResponse: { accessToken: 'mock-fb-token' } }),
        init: () => {}
      };
    });

    // Mock clients
    await page.route('**/api/db/clients', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'client-new', name: 'New Client' }])
      });
    });

    // Mock client data (no mapping yet)
    await page.route('**/api/db/clients/client-new', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'client-new', name: 'New Client' })
      });
    });

    // Mock integration status (no businessId in metadata)
    await page.route('**/api/integrations/client-new/status', async route => {
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

    // Mock asset loading (requires business selection)
    await page.route('**/api/integrations/meta/assets/client-new', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          adAccounts: [],
          pages: [],
          businesses: [{ id: 'biz-1', name: 'Agency Business' }],
          requiresBusinessSelection: true
        })
      });
    });
  });

  test('should allow selecting a Business ID when missing', async ({ page }) => {
    await page.goto('http://localhost:3000/metricas');

    // Select client
    const mainSelect = page.locator('select').first();
    await mainSelect.waitFor({ state: 'visible' });
    await mainSelect.selectOption('client-new');

    // Verify warning message
    await expect(page.getByText('Debes seleccionar un Business Account')).toBeVisible({ timeout: 10000 });

    // Select business
    const bizSelect = page.locator('select').nth(1);
    await bizSelect.selectOption('biz-1');

    // Verify 'Cargar Activos' button appears
    await expect(page.getByText('Cargar Activos de este Business')).toBeVisible();

    await page.screenshot({ path: 'tests-playwright/screenshots/metrics-mapping-business-fix.png', fullPage: true });
  });
});
