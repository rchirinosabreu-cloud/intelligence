import { test, expect } from '@playwright/test';

test('Verify Deliverables UI and Layout', async ({ page }) => {
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

  // Intercept the API call to return a mock client
  await page.route('**/api/clients/89b57ba6-60fd-498d-9a4a-539d28e3c5c1', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: '89b57ba6-60fd-498d-9a4a-539d28e3c5c1', name: 'Bonsai CTG' }),
    });
  });

  // Intercept the files API
  await page.route('**/api/clients/89b57ba6-60fd-498d-9a4a-539d28e3c5c1/files*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { id: '1', name: 'Plan_Estrategico.pdf', size: 1024 * 1024 * 2, createdAt: new Date().toISOString(), mimeType: 'application/pdf', url: 'http://localhost:8080/fake-pdf' }
      ]),
    });
  });

  // Set viewport to a typical desktop size
  await page.setViewportSize({ width: 1280, height: 1000 });

  // Navigate to Client Detail
  await page.goto('http://localhost:8080/cliente/89b57ba6-60fd-498d-9a4a-539d28e3c5c1');

  // Wait for the deliverables widget to render
  await page.waitForSelector('text=Entregables', { timeout: 10000 });
  await page.waitForTimeout(2000);

  // Take a screenshot of the Deliverables widget area
  const deliverablesSection = page.locator('div:has-text("Entregables")').first();
  await deliverablesSection.screenshot({ path: '/home/jules/verification/screenshots/deliverables_final_check.png' });

  // Verify the Dashboard symmetry too
  await page.goto('http://localhost:8080/');
  await page.waitForSelector('text=Logros recientes', { timeout: 10000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/home/jules/verification/screenshots/dashboard_symmetry_final_check.png' });
});
