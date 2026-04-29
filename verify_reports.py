from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    # Go to login page
    page.goto("http://localhost:8080")
    page.wait_for_timeout(2000)

    # Check if we are at login
    if "login" in page.url.lower():
        page.get_by_placeholder("Email").fill("admin@brainstudio.com")
        page.wait_for_timeout(500)
        page.get_by_placeholder("Contraseña").fill("password123")
        page.wait_for_timeout(500)
        page.get_by_role("button", name="Entrar").click()
        page.wait_for_timeout(3000)

    # Navigate to Reports
    page.get_by_role("link", name="Reportes").click()
    page.wait_for_timeout(2000)

    # Take screenshot of the empty state
    page.screenshot(path="/home/jules/verification/screenshots/reports_empty.png")

    # Try to select a client (if any exist)
    # Since we are in a sandbox, there might be no clients.
    # But let's try to see if the dropdown is there.
    page.get_by_role("combobox").click()
    page.wait_for_timeout(1000)

    # Take final screenshot
    page.screenshot(path="/home/jules/verification/screenshots/reports_page.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
