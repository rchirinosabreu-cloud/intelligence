const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  try {
    // Go to the mission control page (assuming it's rendered by FinalVerification in a test route or similar)
    // For this simulation, we'll try to hit the local dev server if it's running,
    // but since I can't guarantee the port/auth, I'll use the background process approach if needed.
    // However, I can also just verify the code structure.

    console.log("Navigating to Mission Control...");
    await page.goto('http://localhost:8080/mission-control', { waitUntil: 'networkidle' });

    // Wait for the Canvas to render
    await page.waitForSelector('canvas', { timeout: 10000 });

    // Give it a moment to stabilize the 3D scene
    await page.waitForTimeout(3000);

    await page.screenshot({ path: 'screenshots/mission_control_v3_isometric.png', fullPage: true });
    console.log("Screenshot saved: screenshots/mission_control_v3_isometric.png");
  } catch (err) {
    console.error("Error capturing screenshot:", err);
  } finally {
    await browser.close();
  }
})();
