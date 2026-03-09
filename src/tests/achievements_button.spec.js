import { test, expect } from '@playwright/test';

test('verify Recent Achievements history button visibility', async ({ page }) => {
  // Set up authentication state in localStorage/sessionStorage
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

  // Navigate to Dashboard
  await page.goto('http://localhost:3000/');

  // Wait for the dashboard to load (wait for the greeting or any card)
  await page.waitForSelector('text=Logros recientes', { timeout: 10000 });

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
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
  }

  // Take a screenshot for visual verification
  await page.screenshot({ path: 'tests/screenshots/recent_achievements_button_final.png' });
});
