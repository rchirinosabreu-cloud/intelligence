import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox"])
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        print("Navigating to Public Mission Control...")
        await page.goto("http://localhost:3000/public-mission-control")

        # Give it plenty of time to render the 3D scene
        await page.wait_for_timeout(10000)

        await page.screenshot(path="public_office_view.png", full_page=True)
        print("Screenshot saved to public_office_view.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
