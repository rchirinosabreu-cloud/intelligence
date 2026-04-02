import { test, expect } from '@playwright/test';

test.describe('Talent Radar Senior UI Refinement', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication
    await page.addInitScript(() => {
      const mockUser = {
        userId: 'clv_admin_123',
        name: 'System Admin',
        email: 'admin@brainstudio.com',
        role: 'ADMIN'
      };
      window.localStorage.setItem('authToken', 'mock-token-admin');
      window.localStorage.setItem('currentUser', JSON.stringify(mockUser));
    });

    // Mock Talent Radar Summary API
    await page.route('**/api/talent-radar/summary*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          liveStatus: [
            {
              id: 'member1',
              name: 'Rodny Perez',
              role: 'Ops Director',
              avatarUrl: null,
              nativeTasks: []
            }
          ],
          heatmap: {},
          nineBox: [
            {
              id: 'member1',
              name: 'Rodny Perez',
              avatarUrl: 'https://ui-avatars.com/api/?name=Rodny+Perez',
              x: 2.8,
              y: 0.2,
              count: 15
            },
            {
              id: 'member2',
              name: 'Creative Soul',
              avatarUrl: null,
              x: 1.2,
              y: 1.8,
              count: 8
            }
          ]
        })
      });
    });

    // Mock Member Details API for Client Logos
    await page.route('**/api/talent-radar/member/member1*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'member1',
          name: 'Rodny Perez',
          role: 'Ops Director',
          nativeTasks: [
            {
              id: 'task1',
              title: 'Estrategia Q2',
              aiComplexity: 'ALTA',
              aiCategory: 'ESTRATÉGICO',
              returnCount: 0,
              client: { id: 'clientA', name: 'Supernice', logoUrl: 'https://ui-avatars.com/api/?name=Supernice' }
            }
          ]
        })
      });
    });

    await page.goto('http://localhost:5173/radar');
  });

  test('Scatter chart should not show text labels but show tooltips on hover', async ({ page }) => {
    // We expect the "Rodny Perez" in the member list to be visible, but NOT in the chart
    // Let's check that there is no "Rodny Perez" text inside the chart container
    const chart = page.locator('.recharts-responsive-container');
    await expect(chart.locator('text:has-text("Rodny Perez")')).not.toBeVisible();

    // Hover over the first scatter point (Rodny)
    // We look for the <g> that contains the image or the circle
    const scatterPoint = page.locator('.recharts-scatter-symbol').first();
    await scatterPoint.hover();
    await page.waitForTimeout(500);

    // Verify Tooltip Narrative
    await expect(page.locator('text="Nivel de Desafío"')).toBeVisible();
    await expect(page.locator('text="Índice de Precisión"')).toBeVisible();
    // Tooltip should contain the name. Since there are multiple "Rodny Perez",
    // we check that at least one is visible (the one in the tooltip is usually the latest added to DOM)
    await expect(page.locator('text="Rodny Perez"').first()).toBeVisible();
  });

  test('Member Detail should show client logos in impact tasks', async ({ page }) => {
    // Click on a member card in the "Equipo en Tiempo Real" section
    await page.locator('section:has-text("Equipo en Tiempo Real") >> text="Rodny Perez"').click();

    // Wait for SlideOver to be visible
    const slideOver = page.getByRole('dialog');
    await expect(slideOver).toBeVisible();
    await expect(slideOver.locator('text="Rodny Perez"').first()).toBeVisible();

    // Switch to Performance tab
    const perfTab = slideOver.locator('button:has-text("Desempeño")');
    await perfTab.click();

    // Check for Client Logo in the impact tasks
    // ClientLogo renders as an <img> inside a <div>
    const clientLogo = page.locator('img[title="Supernice"]');
    await expect(clientLogo).toBeVisible();
    await expect(page.locator('text="Supernice"')).toBeVisible();
  });
});
