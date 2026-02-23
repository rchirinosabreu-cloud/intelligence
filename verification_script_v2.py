from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        url = "http://localhost:3000"
        print(f"Navigating to {url}...")
        try:
            page.goto(url, timeout=60000)
        except Exception as e:
            print(f"Error navigating: {e}")
            browser.close()
            return

        # Check for new title "Anuncios importantes"
        try:
            page.wait_for_selector("text=Anuncios importantes", timeout=10000)
            print("Found widget title 'Anuncios importantes'.")
        except:
            print("Could not find widget title 'Anuncios importantes'.")

        # Allow animations to settle
        time.sleep(2)

        # Take screenshot
        page.screenshot(path="dashboard_verification_updated.png", full_page=True)
        print("Screenshot saved to dashboard_verification_updated.png")

        browser.close()

if __name__ == "__main__":
    run()
