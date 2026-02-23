import { test, expect } from '@playwright/test';

test('Chat Interface Basics', async ({ page }) => {
  await page.goto('http://localhost:3000');

  await page.getByText('Bria Intelligence', { exact: true }).click();
  await expect(page.getByText('Online • v6.0')).toBeVisible();

  const input = page.getByPlaceholder('Escribe un mensaje a Bria...');
  await input.fill('Hola Bria');

  await page.locator('button:has(svg.lucide-send)').click();

  // Wait for the response to load.
  // The response we saw in the failure log was: "¡Hola! Soy Bria..."
  // It also contained suggestions.
  // Let's verify we see the word "Sugerencias" or something similar.

  await expect(page.locator('body')).toContainText('Sugerencias', { timeout: 15000 });
  await expect(page.getByText('Bria puede cometer errores')).toBeVisible();
});
