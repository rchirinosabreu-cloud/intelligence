import asyncio
from playwright.async_api import async_playwright

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox"])
        page = await browser.new_page(viewport={'width': 1280, 'height': 800})

        # Go to the public route
        await page.goto("http://localhost:3000/public-mission-control")

        # Wait for the canvas to be present
        print("Waiting for canvas...")
        try:
            await page.wait_for_selector("canvas", timeout=30000)
            print("Canvas found. Waiting for rendering...")
            await page.wait_for_timeout(10000)
            await page.screenshot(path="mission_control_v6.png")
            print("Screenshot saved.")
        except Exception as e:
            print(f"Error: {e}")
            # Take a screenshot anyway to see what's there
            await page.screenshot(path="mission_control_error.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
