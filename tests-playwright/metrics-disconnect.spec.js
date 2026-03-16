import { test, expect } from '@playwright/test';

test.describe('Metrics Disconnection Flow', () => {
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

    // Mock delete integration
    await page.route('**/api/integrations/client-1/meta', async route => {
        if (route.request().method() === 'DELETE') {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ success: true })
            });
        } else {
            await route.continue();
        }
    });
  });

  test('should allow disconnecting a Meta account', async ({ page }) => {
    await page.goto('http://localhost:3000/metricas');

    // Select client
    const mainSelect = page.locator('select').first();
    await mainSelect.waitFor({ state: 'visible' });
    await mainSelect.selectOption('client-1');

    // Verify "Meta Connected" is visible
    await expect(page.getByText('Meta Connected')).toBeVisible();

    // Setup window.confirm mock
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('¿Estás seguro');
      await dialog.accept();
    });

    // Click disconnect
    await page.click('button:has-text("Desconectar Cuenta")');

    // Verify "Conectar cuenta de Meta Business" button is back
    await expect(page.getByText('Conectar cuenta de Meta Business')).toBeVisible({ timeout: 10000 });

    await page.screenshot({ path: 'tests-playwright/screenshots/metrics-disconnect-verified.png', fullPage: true });
  });
});
