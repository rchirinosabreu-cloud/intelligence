import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        # Launch browser
        browser = await p.chromium.launch(args=["--no-sandbox"])
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        # Go to login
        print("Navigating to login...")
        await page.goto("http://localhost:3000")

        # Fill login
        print("Logging in...")
        await page.fill('input[type="email"]', 'admin@brainstudio.com')
        await page.fill('input[type="password"]', 'password123')
        await page.click('button[type="submit"]')

        # Wait for navigation/dashboard
        print("Waiting for dashboard...")
        await page.wait_for_url("**/")

        # Go to mission control
        print("Navigating to Mission Control...")
        await page.goto("http://localhost:3000/mission-control")

        # Wait for 3D scene to load (it might take a second)
        print("Waiting for 3D scene...")
        await page.wait_for_timeout(5000)

        # Take screenshot
        screenshot_path = "mission_control_real_office.png"
        await page.screenshot(path=screenshot_path, full_page=True)
        print(f"Screenshot saved to {screenshot_path}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
