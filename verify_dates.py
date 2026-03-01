from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        # Launch browser forcing a timezone far west to easily catch midnight shifts
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(timezone_id="America/Bogota") # UTC-5
        page = context.new_page()

        # Navigate to home
        page.goto("http://localhost:3000/gestion-nuevo", wait_until="networkidle")

        # Take a screenshot to verify tasks render without snapping back a day
        page.screenshot(path="tasks_timezone_fix.png")

        browser.close()

if __name__ == "__main__":
    run()
