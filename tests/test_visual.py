from playwright.sync_api import sync_playwright
import os

def run():
    print("Starting visual verification...")
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    os.makedirs("/home/jules/verification/videos", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Set large viewport to show the entire sidebar with ChaosMeter at the bottom
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={"width": 1440, "height": 1080}
        )
        page = context.new_page()
        try:
            print("Configuring local storage to mock authenticated session...")
            page.goto("http://localhost:3000")
            page.wait_for_timeout(500)

            page.evaluate("""() => {
                localStorage.setItem('authToken', 'fake-token-123456');
                localStorage.setItem('currentUser', JSON.stringify({
                    id: 'usr-admin',
                    name: 'Admin User',
                    email: 'admin@brainstudio.com',
                    role: 'ADMIN',
                    hasFinancialAccess: true
                }));
            }""")

            print("Reloading to apply session...")
            page.goto("http://localhost:3000")
            page.wait_for_timeout(4000)

            print("Taking screenshot...")
            page.screenshot(path="/home/jules/verification/screenshots/verification.png")
            print("Screenshot saved!")
        except Exception as e:
            print(f"An error occurred: {e}")
        finally:
            context.close()
            browser.close()

if __name__ == "__main__":
    run()
