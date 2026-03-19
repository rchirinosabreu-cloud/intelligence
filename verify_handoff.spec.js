import { test, expect } from '@playwright/test';

test('verify content automation flow', async ({ page }) => {
  // 1. Setup mock auth
  await page.addInitScript(() => {
    const mockUser = {
      id: 'ab52e6e3-2c49-4e3b-ac76-6d9a6254b2e2',
      name: 'System Admin',
      email: 'admin@brainstudio.com',
      role: 'ADMIN'
    };
    const mockToken = 'mock-jwt-token';

    window.localStorage.setItem('currentUser', JSON.stringify(mockUser));
    window.localStorage.setItem('authToken', mockToken);
    window.sessionStorage.setItem('currentUser', JSON.stringify(mockUser));
    window.sessionStorage.setItem('authToken', mockToken);
  });

  // 2. Set an owner for the plan first
  await page.goto('http://localhost:3000/parrillas');
  await page.waitForSelector('text=Marzo 2026', { timeout: 15000 });
  await page.click('text=Marzo 2026');
  await page.waitForURL('**/parrillas/**');

  // Find owner select and set a value
  const ownerSelect = page.locator('select').first();
  await ownerSelect.selectOption({ label: 'Test Member' });
  console.log('Owner assigned.');

  // 3. Dispatch an item if not dispatched
  const dispatchBtn = page.locator('button:has-text("Enviar a pendientes")').first();
  if (await dispatchBtn.isVisible()) {
      await dispatchBtn.click();
      // In the modal, select assignee
      const modal = page.locator('div[role="dialog"]');
      const assigneeSelect = modal.locator('select').first();
      await assigneeSelect.selectOption({ label: 'Test Member' });
      await page.click('button:has-text("Confirmar Despacho")');
      await page.waitForSelector('text=En Producción');
  }

  // 4. Go to Kanban and mark as done
  await page.goto('http://localhost:3000/gestion');
  await page.waitForSelector('text=Aumentar awareness');

  await page.click('text=Aumentar awareness');
  const taskModal = page.locator('div[role="dialog"]');
  // In TaskEditModal, status is the first select if we count from top,
  // but let's be more specific. It's the one with PENDIENTE.
  await taskModal.locator('select').nth(1).selectOption('REALIZADA');
  await page.click('button:has-text("Guardar")');

  console.log('Task marked as REALIZADA.');

  // 5. Verify Content Item is REALIZADO and a NEW task exists
  await page.goto('http://localhost:3000/parrillas');
  await page.click('text=Marzo 2026');
  // Look for the "Realizado" text in the item cards
  await page.waitForSelector('text=Realizado');

  await page.goto('http://localhost:3000/gestion');
  await page.waitForSelector('text=[Publicar] Aumentar awareness');
  console.log('Handoff task created successfully.');

  await page.screenshot({ path: 'screenshots/handoff_automation.png', fullPage: true });
});
