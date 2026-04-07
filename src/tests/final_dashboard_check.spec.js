import { test, expect } from '@playwright/test';

test('verify Recent Achievements and Dashboard Layout', async ({ page }) => {
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

  // Set viewport to a typical desktop size
  await page.setViewportSize({ width: 1280, height: 1200 });

  // Navigate to Dashboard
  await page.goto('http://localhost:8080/');

  // Wait for the dashboard to load and tasks to render
  await page.waitForSelector('text=Logros recientes', { timeout: 10000 });

  // Ensure the history button is visible (our fix)
  const historyButton = page.locator('button:has-text("Ver historial completo")');
  await expect(historyButton).toBeVisible();

  // Take screenshot of the right column (Achievements + Chat)
  await page.screenshot({ path: '/home/jules/verification/screenshots/dashboard_symmetry_check.png' });
});
