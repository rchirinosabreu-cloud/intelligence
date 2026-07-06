
import { test, expect } from '@playwright/test';

test('verify unified high density side panel', async ({ page }) => {
  // Login
  await page.goto('http://localhost:3000/login');
  await page.fill('input[name="email"]', 'admin@brainstudio.com');
  await page.fill('input[name="password"]', 'admin123');
  await page.click('button[type="submit"]');

  // Go to Manager
  await page.goto('http://localhost:3000/manager');

  // Wait for tasks to load and open one
  await page.waitForSelector('text=Gestión de Tareas');

  // Create a dummy task if none exists to ensure we can open it
  // Or just click an existing one. We assume the dev env has data or we mock it.
  // For verification, we'll try to find any card.
  const taskCard = page.locator('div[draggable="true"]').first();
  await taskCard.click();

  // Wait for the drawer
  await page.waitForSelector('text=Editar Tarea');

  // Take screenshot of the wide unified panel
  await page.screenshot({ path: 'verification/screenshots/unified_wide_panel.png' });

  // Verify links dropdown propagation
  const insumosBtn = page.locator('button:has-text("Insumo")');
  if (await insumosBtn.isVisible()) {
    await insumosBtn.click();
    // Panel should still be open
    await expect(page.locator('text=Editar Tarea')).toBeVisible();
    await page.screenshot({ path: 'verification/screenshots/dropdown_open_no_close.png' });
  }

  // Check reintegration if task is DEVUELTA
  // We might need to force a status to test the button
});
