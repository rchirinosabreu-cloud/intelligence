import { test, expect } from '@playwright/test';

test('verify Recent Achievements history button visibility with many achievements', async ({ page }) => {
  // Set up authentication state
  await page.addInitScript(() => {
    localStorage.setItem('authToken', 'fake-token-for-dev');
    localStorage.setItem('currentUser', JSON.stringify({
      id: 'cm7md8gzo0000m9ow9d5f7fnd',
      email: 'admin@brainstudio.com',
      name: 'Rodny Perez',
      role: 'ADMIN',
      avatar: null
    }));
  });

  // Intercept the API call to return many completed tasks to simulate overflow
  await page.route('**/api/tasks/completed', async route => {
    const today = new Date().toISOString();
    const tasks = Array.from({ length: 15 }, (_, i) => ({
      id: `task-${i}`,
      title: `Logro de prueba número ${i + 1} para verificar el scroll del widget`,
      completedAt: today,
      assignee: { name: 'Rodny Perez' },
      client: { name: 'Cliente de Prueba' }
    }));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(tasks),
    });
  });

  // Navigate to Dashboard
  await page.goto('http://localhost:3000/');

  // Wait for the dashboard to load and tasks to render
  await page.waitForSelector('text=Logros recientes', { timeout: 10000 });
  await page.waitForSelector('text=Logro de prueba número 15', { timeout: 10000 });

  // Locate the button "Ver historial completo"
  const historyButton = page.locator('button:has-text("Ver historial completo")');

  // Assert that the button is visible and in the viewport (not hidden by overflow)
  await expect(historyButton).toBeVisible();

  // Ensure it's clickable
  await expect(historyButton).toBeEnabled();

  // Additional check: Ensure it's within the viewport bounds
  const box = await historyButton.boundingBox();
  const viewport = page.viewportSize();

  if (box && viewport) {
    // Check if the bottom of the button is within the viewport
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }

  // Take a screenshot for visual verification with a full list
  await page.screenshot({ path: 'tests/screenshots/recent_achievements_button_full_list.png', fullPage: false });
});
