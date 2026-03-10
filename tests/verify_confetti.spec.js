import { test, expect } from '@playwright/test';

test('verify confetti on task move to realizado', async ({ page }) => {
  // Mock authentication
  await page.addInitScript(() => {
    window.localStorage.setItem('authToken', 'mock-token');
    window.localStorage.setItem('currentUser', JSON.stringify({ id: '1', name: 'Jules Developer', role: 'ADMIN' }));
  });

  // Mock tasks API
  await page.route('**/api/tasks', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'task-1',
          title: 'Test Confetti Task',
          status: 'Pendiente',
          dueDate: '2025-01-01T12:00:00.000Z',
          client: { name: 'SunPartners' },
          assignee: { name: 'Jules Developer' },
          creator: { name: 'Admin' }
        }
      ]),
    });
  });

  // Mock clients API
  await page.route('**/api/db/clients', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: '1', name: 'SunPartners' }]),
    });
  });

  // Mock task update API
  await page.route('**/api/tasks/task-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true }),
    });
  });

  // Go to Native Tasks
  await page.goto('http://localhost:3002/gestion');

  // Find the task card and click it to open the edit modal
  const taskCard = page.locator('#task-task-1');
  await expect(taskCard).toBeVisible();
  await taskCard.click();

  // Wait for modal
  await expect(page.getByText('Editar tarea')).toBeVisible();

  // Change status to 'Realizado'
  const statusSelect = page.locator('select').filter({ hasText: 'Pendiente' }).last();
  await statusSelect.selectOption('Realizado');

  // Click Save
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  // Wait for confetti
  await page.waitForTimeout(100);

  // Take a screenshot focusing on the confetti/feedback
  // We take a few screenshots in sequence to try and catch the particles
  await page.screenshot({ path: 'verification/confetti_trigger_1.png', fullPage: true });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'verification/confetti_trigger_2.png', fullPage: true });
});
