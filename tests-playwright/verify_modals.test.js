import { test, expect } from '@playwright/test';

test('Verify conditional fields in Create Modal', async ({ page }) => {
  await page.goto('http://localhost:3001/gestion');

  // Mock login
  await page.evaluate(() => {
    localStorage.setItem('authToken', 'mock-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 1, name: 'Admin User', role: 'ADMIN' }));
  });
  await page.goto('http://localhost:3001/gestion');

  await page.waitForTimeout(5000);
  await page.screenshot({ path: '/home/jules/verification/debug_gestion_page.png' });

  const createButton = page.getByRole('button', { name: '+ Nueva tarea' });
  await createButton.waitFor({ state: 'visible' });
  await createButton.click();

  // Check Special toggle
  const specialCheckbox = page.locator('span:has-text("Especial")').locator('xpath=..').locator('input[type="checkbox"]');
  await specialCheckbox.check();
  await expect(page.locator('label:has-text("Tipo de pendiente especial *")')).toBeVisible();

  // Check Reference toggle
  const refCheckbox = page.locator('span:has-text("¿Tiene referencia?")').locator('xpath=..').locator('input[type="checkbox"]');
  await refCheckbox.check();
  await expect(page.locator('input[placeholder="Coloca el link aquí (https://...)"]')).toBeVisible();

  await page.screenshot({ path: '/home/jules/verification/create_modal_final_v4.png' });
});
