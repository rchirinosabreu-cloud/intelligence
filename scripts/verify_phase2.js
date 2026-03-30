
import { chromium } from 'playwright';
import jwt from 'jsonwebtoken';

const JWT_SECRET = 'brainstudio-secret-key-2025';
const user = {
  userId: 'mock-user-id',
  name: 'System Admin',
  email: 'admin@brainstudio.com',
  role: 'ADMIN'
};

const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });

async function verify() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ recordVideoDir: '/home/jules/verification/video' });
  const page = await context.newPage();

  // Mock Login
  await page.addInitScript((data) => {
    localStorage.setItem('authToken', data.token);
    localStorage.setItem('currentUser', JSON.stringify(data.user));
    sessionStorage.setItem('authToken', data.token);
    sessionStorage.setItem('currentUser', JSON.stringify(data.user));
  }, { token, user });

  try {
    console.log('Navigating to Metrics module...');
    // The port might be 3000 (Vite) or 8080 (Server)
    // We want to test the full frontend.
    await page.goto('http://localhost:3000/metricas');
    await page.waitForTimeout(3000);

    // Select Client: Bonsai CTG
    console.log('Selecting client: Bonsai CTG...');
    // We'll use the placeholder and then wait for the option
    await page.waitForSelector('select');
    await page.selectOption('select', { label: 'Bonsai CTG' });
    await page.waitForTimeout(2000);

    // Click on "Reporte" tab
    console.log('Switching to Report view...');
    // Find the Report button
    const reportBtn = page.getByRole('button', { name: 'Reporte' });
    await reportBtn.click();
    await page.waitForTimeout(3000);

    // Take screenshot of the Metrics Dashboard
    console.log('Capturing Metrics Dashboard...');
    await page.screenshot({ path: '/home/jules/verification/metrics_dashboard.png', fullPage: true });

    // Scroll to Top Content
    console.log('Capturing Top Content...');
    await page.evaluate(() => window.scrollTo(0, 800));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/home/jules/verification/top_content.png' });

    // Scroll to Ads Control
    console.log('Capturing Ads Control...');
    await page.evaluate(() => window.scrollTo(0, 1500));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: '/home/jules/verification/ads_control.png' });

    // Click "Generar con IA"
    console.log('Generating AI Insights...');
    // Use getByRole if possible
    const aiBtn = page.getByRole('button', { name: /Generar con IA|Refrescar Análisis/ });
    if (await aiBtn.isVisible()) {
        await aiBtn.click();
        console.log('IA Button clicked, waiting for generation...');
        await page.waitForTimeout(12000); // Wait for IA generation (mocked or real)

        await page.evaluate(() => window.scrollTo(0, 2500));
        await page.waitForTimeout(1000);
        await page.screenshot({ path: '/home/jules/verification/ai_insights.png' });
    } else {
        console.log('AI Button not visible');
    }

  } catch (err) {
    console.error('Verification failed:', err);
    await page.screenshot({ path: '/home/jules/verification/error.png' });
  } finally {
    await context.close();
    await browser.close();
  }
}

verify();
