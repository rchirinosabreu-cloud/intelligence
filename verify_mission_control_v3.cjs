const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  try {
    console.log("Navigating to Mission Control...");
    // Attempting to bypass login for the screenshot if possible,
    // or just checking if the server is up.
    await page.goto('http://localhost:8080/mission-control', { waitUntil: 'networkidle', timeout: 30000 });

    await page.waitForTimeout(5000);

    await page.screenshot({ path: 'screenshots/mission_control_v3_isometric.png' });
    console.log("Screenshot saved: screenshots/mission_control_v3_isometric.png");
  } catch (err) {
    console.log("Captured current state anyway...");
    await page.screenshot({ path: 'screenshots/mission_control_error_state.png' });
  } finally {
    await browser.close();
  }
})();
