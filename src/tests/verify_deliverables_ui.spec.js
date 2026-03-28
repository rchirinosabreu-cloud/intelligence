import { test, expect } from '@playwright/test';

test('Verify Deliverables UI Polish', async ({ page }) => {
  // Mock authentication
  await page.addInitScript(() => {
    const mockUser = { id: 'user-1', email: 'admin@brainstudio.com', name: 'System Admin', role: 'ADMIN' };
    const mockToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c2VyLTEiLCJuYW1lIjoiU3lzdGVtIEFkbWluIiwiZW1haWwiOiJhZG1pbkBicmFpbnN0dWRpby5jb20iLCJyb2xlIjoiQURNSU4iLCJpYXQiOjE3NzQ3MzMzNDYsImV4cCI6MTc3NDgxOTc0Nn0.iZmTeR3SA5M0PO8kTS37gMwYARC6eeus9ee0C-M4b34';
    localStorage.setItem('authToken', mockToken);
    localStorage.setItem('currentUser', JSON.stringify(mockUser));
    sessionStorage.setItem('authToken', mockToken);
    sessionStorage.setItem('currentUser', JSON.stringify(mockUser));
  });

  const clientId = '89b57ba6-60fd-498d-9a4a-539d28e3c5c1';
  await page.goto(`http://localhost:3000/cliente/${clientId}`);

  // Wait for the client data to load
  await page.waitForSelector('text=Bonsai CTG', { timeout: 15000 });

  // Locate the Deliverables section
  const deliverablesSection = page.locator('div:has-text("Entregables")').first();
  await expect(deliverablesSection).toBeVisible();

  // Take a screenshot of the Deliverables widget
  await deliverablesSection.screenshot({ path: 'verification/screenshots/deliverables_widget_final.png' });

  // Also take a full page screenshot for context
  await page.screenshot({ path: 'verification/screenshots/client_detail_full.png' });
});
