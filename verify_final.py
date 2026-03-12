import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()

        # Admin login bypass
        await page.goto("http://localhost:5173/login")
        await page.evaluate('''() => {
            localStorage.setItem('authToken', 'mock-admin-token');
            localStorage.setItem('currentUser', JSON.stringify({
                id: 'admin-id',
                email: 'admin@test.com',
                name: 'Admin User',
                role: 'ADMIN'
            }));
        }''')

        # Go to a user profile
        await page.goto("http://localhost:5173/perfil/test-user-id")

        # Click "Mi Desempeño"
        await page.click("button:has-text('Mi Desempeño')")
        await page.wait_for_selector("text=Historial de Feedback")

        # Take screenshot
        os.makedirs("verification", exist_ok=True)
        await page.screenshot(path="verification/final_performance_admin.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
