import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox"])
        context = await browser.new_context(viewport={'width': 1280, 'height': 800})
        page = await context.new_page()

        print("Navigating to Public Mission Control...")
        await page.goto("http://localhost:3000/public-mission-control")

        # Wait for the scene and textures to load
        await page.wait_for_timeout(15000)

        # Take a screenshot of the whole page
        await page.screenshot(path="mission_control_final_view.png")
        print("Screenshot saved to mission_control_final_view.png")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
