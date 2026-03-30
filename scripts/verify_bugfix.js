
import { chromium } from 'playwright';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZG1pbiIsIm5hbWUiOiJTeXN0ZW0gQWRtaW4iLCJlbWFpbCI6ImFkbWluQGJyYWluc3R1ZGlvLmNvbSIsInJvbGUiOiJBRE1JTiIsImlhdCI6MTc3Mzc3NjIwMiwiZXhwIjoxNzc2MzY4MjAyfQ.5FSnZEEu-WypwmQmISSZsyE433_3y9VZsF4GoBj-rMA';
const user = { userId: 'admin', name: 'System Admin', email: 'admin@brainstudio.com', role: 'ADMIN' };

async function verify() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Mock Login
  await page.addInitScript((data) => {
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('currentUser', JSON.stringify(data.user));
  }, { token, user });

  try {
    console.log('Navigating to Metrics...');
    await page.goto('http://localhost:3000/metricas');
    await page.waitForTimeout(2000);

    // Select Client
    console.log('Selecting client...');
    await page.waitForSelector('select');
    await page.selectOption('select', { label: 'Bonsai CTG' });
    await page.waitForTimeout(1000);

    // Go to Report
    console.log('Switching to Report view...');
    await page.getByRole('button', { name: 'Reporte' }).click();
    await page.waitForTimeout(2000);

    // Take screenshot of organic overview
    console.log('Capturing report...');
    await page.screenshot({ path: '/home/jules/verification/phase2_bugfix_verified.png', fullPage: true });

  } catch (err) {
    console.error('Verification failed:', err);
    await page.screenshot({ path: '/home/jules/verification/error_bugfix.png' });
  } finally {
    await browser.close();
  }
}

verify();
