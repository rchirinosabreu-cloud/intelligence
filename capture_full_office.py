import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox"])
        context = await browser.new_context(viewport={'width': 1600, 'height': 1200})
        page = await context.new_page()

        print("Navigating to Public Mission Control...")
        await page.goto("http://localhost:3000/public-mission-control")

        # Wait for the scene to be fully rendered
        await page.wait_for_timeout(10000)

        await page.screenshot(path="mission_control_full_office.png")
        print("Screenshot saved to mission_control_full_office.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
