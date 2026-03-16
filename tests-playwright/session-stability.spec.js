import { test, expect } from '@playwright/test';

test.describe('Session Stability and Auth Handling', () => {
  test('should clear storage on 401 response', async ({ page }) => {
    // 1. Setup authenticated state
    await page.addInitScript(() => {
      window.localStorage.setItem('authToken', 'expired-token');
      window.localStorage.setItem('currentUser', JSON.stringify({ id: '1', name: 'Jules' }));
    });

    // 2. Mock a 401 response for any API call
    await page.route('**/api/**', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized', message: 'JWT Expired' })
      });
    });

    // 3. Navigate to base page (lighter than /metricas)
    await page.goto('http://localhost:3000/');

    // 4. Verify placeholder is visible (login screen)
    await expect(page.getByPlaceholder('Correo electrónico')).toBeVisible();

    // Check localStorage was cleared
    const token = await page.evaluate(() => localStorage.getItem('authToken'));
    expect(token).toBeNull();
  });

  test('should handle Meta asset loading errors gracefully (400 instead of 500)', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('authToken', 'valid-token');
      window.localStorage.setItem('currentUser', JSON.stringify({ id: '1', name: 'Jules' }));
    });

    // Mock clients
    await page.route('**/api/db/clients', async route => {
      await route.fulfill({
        status: 200,
        body: JSON.stringify([{ id: 'client-fail', name: 'Faulty Client' }])
      });
    });

    // Mock 400 error for assets (as implemented)
    await page.route('**/api/integrations/meta/assets/client-fail', async route => {
      await route.fulfill({
        status: 400,
        body: JSON.stringify({ error: 'No se encontró un ID de Negocio' })
      });
    });

    // Mock status to show 'meta' is connected but problematic
    await page.route('**/api/integrations/client-fail/status', async route => {
        await route.fulfill({
          status: 200,
          body: JSON.stringify([{ provider: 'meta', updatedAt: new Date() }])
        });
      });

    await page.goto('http://localhost:3000/metricas');
    await page.selectOption('select', 'client-fail');

    // Check for error toast message
    await expect(page.getByText('No se pudieron cargar los activos de Meta')).toBeVisible();
  });
});
