const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 2000 } });
  const page = await context.newPage();

  // Bypass login using localStorage
  await page.goto('http://localhost:8080');
  await page.evaluate(() => {
    localStorage.setItem('authToken', 'fake-token-for-ui-verification');
    localStorage.setItem('currentUser', JSON.stringify({
      id: 'dev-user',
      name: 'Developer',
      role: 'ADMIN'
    }));
  });

  const screenshotsDir = '/home/jules/verification/mission_control';
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  // 1. Sidebar with Featured Button
  await page.goto('http://localhost:8080/');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(screenshotsDir, 'sidebar_featured.png') });
  console.log('Sidebar featured screenshot taken');

  // 2. Mission Control Main View
  await page.goto('http://localhost:8080/mission-control');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(screenshotsDir, 'mission_control_view.png') });
  console.log('Mission Control view screenshot taken');

  await browser.close();
})();
