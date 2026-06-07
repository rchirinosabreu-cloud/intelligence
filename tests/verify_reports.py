from playwright.sync_api import sync_playwright
import os

def run_verification(page):
    # 1. Go to Login
    page.goto("http://localhost:3000/login")
    page.wait_for_timeout(2000)

    # 2. Fill login form
    # Note: I'm assuming these credentials based on typical seed data in this project
    page.fill('input[type="email"]', "admin@brainstudio.com")
    page.fill('input[type="password"]', "password123")
    page.click('button:has-text("Acceder"), button:has-text("Login"), button[type="submit"]')

    # Wait for navigation to dashboard
    page.wait_for_timeout(3000)

    # 3. Navigate to Reports
    page.goto("http://localhost:3000/reportes")
    page.wait_for_timeout(3000)

    # 4. Take screenshot of the Reports UI
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    page.screenshot(path="/home/jules/verification/screenshots/reports_page.png")

    # Check for the new dropzones
    try:
        dropzones = page.query_selector_all('text=AÑADIR RRSS, text=AÑADIR ADS')
        print(f"Found {len(dropzones)} dropzones")
    except:
        print("Dropzones not found via text")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_verification(page)
        except Exception as e:
            print(f"Error during verification: {e}")
            page.screenshot(path="/home/jules/verification/screenshots/error.png")
        finally:
            context.close()
            browser.close()
