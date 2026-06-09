from playwright.sync_api import sync_playwright
import os

def run_verification(page):
    # 1. Login
    page.goto("http://localhost:3000/login")
    page.wait_for_timeout(1000)
    page.fill('input[type="email"]', "admin@brainstudio.com")
    page.fill('input[type="password"]', "password123")
    page.click('button[type="submit"]')
    page.wait_for_timeout(2000)

    # 2. Go to Activity
    page.goto("http://localhost:3000/actividad")
    page.wait_for_timeout(2000)

    # 3. Take screenshot of Activity Map hover (should be clean)
    avatar = page.locator('button.relative.outline-none').first
    if avatar.count() > 0:
        avatar.hover()
        page.wait_for_timeout(500)
        os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
        page.screenshot(path="/home/jules/verification/screenshots/activity_map_polish.png")

    # 4. Switch to Operational Calendar
    page.click('text="Calendario Operativo"')
    page.wait_for_timeout(1000)

    # 5. Take screenshot of Calendar hover (should have description and gap between avatars)
    cal_event = page.locator('button.absolute.w-10.h-10').first
    if cal_event.count() > 0:
        cal_event.hover()
        page.wait_for_timeout(500)
        page.screenshot(path="/home/jules/verification/screenshots/calendar_polish.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            run_verification(page)
        finally:
            browser.close()
