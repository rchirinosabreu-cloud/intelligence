import { test, expect } from '@playwright/test';

test.describe('Metrics Asset Mapping', () => {
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
        body: JSON.stringify([{ id: 'client-1', name: 'TruPeak' }])
      });
    });

    // Mock specific client
    await page.route('**/api/db/clients/client-1', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            id: 'client-1',
            name: 'TruPeak',
            facebookPageId: 'page-123',
            adAccountId: 'act_456'
        })
      });
    });

    // Mock integration status
    await page.route('**/api/integrations/client-1/status', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{
          provider: 'meta',
          updatedAt: new Date().toISOString(),
          metadata: {
            facebookUserName: 'BrainStudio Official',
            businessName: 'BrainStudio Agencia',
            businessId: '789'
          }
        }])
      });
    });

    // Mock assets
    await page.route('**/api/integrations/meta/assets/client-1', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          adAccounts: [{ id: 'act_456', name: 'TruPeak Ads', account_id: '456' }],
          pages: [{ id: 'page-123', name: 'TruPeak Facebook' }]
        })
      });
    });

    // Mock Instagram
    await page.route('**/api/integrations/meta/instagram/client-1?pageId=page-123', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'ig-999', username: 'trupeak_official', name: 'TruPeak IG' })
      });
    });

    // Mock mapping update
    await page.route('**/api/integrations/meta/mapping/client-1', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });
  });

  test('should show asset mapping section and allow saving', async ({ page }) => {
    await page.goto('http://localhost:3000/metricas');

    // Select client
    await page.selectOption('select', 'client-1');

    // Verify mapping section is visible
    await expect(page.getByText('Configuración de Activos')).toBeVisible();

    // Verify pre-selected values
    const pageSelect = page.locator('select').nth(1);
    await expect(pageSelect).toHaveValue('page-123');

    // Verify Instagram auto-detection
    await expect(page.getByText('@trupeak_official')).toBeVisible();

    const adSelect = page.locator('select').nth(2);
    await expect(adSelect).toHaveValue('act_456');

    // Save
    await page.click('button:has-text("Guardar Configuración")');

    // Verify toast (if possible) or just wait
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'tests-playwright/screenshots/metrics-mapping-verified.png', fullPage: true });
  });
});
