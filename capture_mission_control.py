import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox"])
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        # We'll try to set a dummy token and user in localStorage to see if the app accepts it
        # This depends on how AuthContext works, but often it checks localStorage on init
        await page.goto("http://localhost:3000")
        await page.evaluate("""
            localStorage.setItem('token', 'dummy-token');
            localStorage.setItem('user', JSON.stringify({id: '1', name: 'Jules', role: 'ADMIN'}));
        """)

        # Navigate to mission control
        print("Navigating to Mission Control...")
        await page.goto("http://localhost:3000/mission-control")
        await page.wait_for_timeout(5000)

        await page.screenshot(path="mission_control_view.png", full_page=True)
        print("Screenshot saved to mission_control_view.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
