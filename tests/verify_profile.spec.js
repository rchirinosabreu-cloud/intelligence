
import { test, expect } from '@playwright/test';

test('Verify Profile Page and Tabs', async ({ page }) => {
  // Inject authentication into localStorage to bypass login screen
  await page.goto('http://localhost:3000/');
  await page.evaluate(() => {
    localStorage.setItem('authToken', 'mock-token');
    localStorage.setItem('currentUser', JSON.stringify({
      id: 'admin-id',
      name: 'Admin User',
      email: 'admin@brainstudio.com',
      role: 'ADMIN'
    }));
    sessionStorage.setItem('authToken', 'mock-token');
    sessionStorage.setItem('currentUser', JSON.stringify({
      id: 'admin-id',
      name: 'Admin User',
      email: 'admin@brainstudio.com',
      role: 'ADMIN'
    }));
  });

  // Wait a bit and reload
  await page.waitForTimeout(1000);
  await page.goto('http://localhost:3000/perfil');

  // Take screenshot for debugging if fails
  await page.screenshot({ path: 'verification/debug_profile.png' });

  // Verify Header
  await expect(page.locator('h1')).toHaveText('Mi Espacio', { timeout: 30000 });

  // General Tab
  await expect(page.locator('text=Información de Perfil')).toBeVisible();
  await page.screenshot({ path: 'verification/profile_general.png' });

  // Switch to Mis Notas
  await page.click('button[role="tab"]:has-text("Mis Notas")');
  await expect(page.locator('h2:has-text("Mis Notas")')).toBeVisible();

  // Create a note
  await page.click('button:has-text("Nueva Nota")');
  await page.fill('input[placeholder="Título de la nota..."]', 'Test Note');
  await page.fill('textarea[placeholder="Escribe algo increíble..."]', 'This is a test note content');
  await page.click('button:has(svg.lucide-check)'); // The save checkmark icon

  // Wait for note to appear
  await expect(page.locator('text=Test Note')).toBeVisible();
  await page.screenshot({ path: 'verification/profile_notes.png' });

  // Verify placeholders
  await page.click('button:has-text("Solicitudes")');
  await expect(page.locator('text=Próximamente: Gestión de Permisos')).toBeVisible();

  await page.click('button:has-text("Mi Desempeño")');
  await expect(page.locator('text=Próximamente: Mi Desempeño')).toBeVisible();
});
