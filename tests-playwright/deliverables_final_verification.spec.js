import { test, expect } from '@playwright/test';

test.describe('Deliverables Widget Final Verification', () => {
    test.beforeEach(async ({ page }) => {
        // Mock Auth
        await page.addInitScript(() => {
            const mockUser = { id: 'user-123', name: 'Test Admin', role: 'ADMIN' };
            const mockToken = 'mock-token';
            localStorage.setItem('authToken', mockToken);
            localStorage.setItem('currentUser', JSON.stringify(mockUser));
            sessionStorage.setItem('authToken', mockToken);
            sessionStorage.setItem('currentUser', JSON.stringify(mockUser));
        });

        // Mock API responses
        await page.route('**/api/clients/client-1/files?category=Entregable', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    {
                        id: 'file-1',
                        name: 'Design_System.pdf',
                        mimeType: 'application/pdf',
                        size: 1024 * 1024 * 2.5,
                        createdAt: new Date().toISOString(),
                        url: 'https://storage.googleapis.com/mock/Design_System.pdf'
                    },
                    {
                        id: 'file-2',
                        name: 'Campaign_Image.png',
                        mimeType: 'image/png',
                        size: 1024 * 500,
                        createdAt: new Date().toISOString(),
                        url: 'https://storage.googleapis.com/mock/Campaign_Image.png'
                    }
                ])
            });
        });

        await page.goto('http://localhost:3000/cliente/client-1');
    });

    test('should show deliverables widget and open slide-over', async ({ page }) => {
        // Check if widget title exists
        await expect(page.locator('h3:has-text("Entregables")')).toBeVisible();

        // Click maximize button (the one in the header)
        await page.click('button[title="Gestionar historial"]');

        // Check if SlideOver is open
        await expect(page.locator('text=Gestión de Entregables')).toBeVisible();
        await expect(page.locator('text=Historial de archivos y zona de carga')).toBeVisible();

        // Check if search bar exists in slide-over
        await expect(page.locator('input[placeholder="Buscar entregable por nombre..."]')).toBeVisible();
    });

    test('should open Quick Look for a file', async ({ page }) => {
        // Wait for files to load
        await expect(page.locator('text=Design_System.pdf')).toBeVisible();

        // Expand month if needed (it should be expanded by default for recent)
        // Click Quick Look (Eye icon)
        await page.click('button[title="Vista rápida"]:first-child');

        // Check if Quick Look modal is visible
        await expect(page.locator('role=dialog')).toBeVisible();
        await expect(page.locator('text=DESCARGAR')).toBeVisible();

        // Take screenshot of Quick Look
        await page.screenshot({ path: 'quick_look_verification.png' });
    });
});
