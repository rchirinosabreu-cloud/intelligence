from playwright.sync_api import sync_playwright, expect
import json
import os

def verify_public_legal_routes(page):
    # No Auth injected to test public access

    # Mocking APIs for Login screen
    def mock_api(route):
        url = route.request.url
        if "/api/login" in url:
            route.fulfill(status=200, body=json.dumps({"token": "fail", "user": {}}))
        else:
            route.fulfill(status=200, body=json.dumps([]))

    page.route("**/api/**", mock_api)

    # 1. Verify Login Screen Links
    print("Verifying Login Screen...")
    page.goto("http://localhost:3000/")
    page.wait_for_selector("text=Brainstudio OS")
    expect(page.locator("text=Privacidad")).to_be_visible()
    expect(page.locator("text=Términos")).to_be_visible()
    page.screenshot(path="/home/jules/verification/public_login.png")

    # 2. Verify Privacy Policy (Publicly Accessible)
    print("Verifying Privacy Policy Route...")
    page.goto("http://localhost:3000/privacidad")
    page.wait_for_selector("text=Política de Privacidad")
    # Using a string that actually exists in the component
    expect(page.locator("text=BrainStudio Metrics utiliza la API de Meta for Developers")).to_be_visible()
    expect(page.locator("text=labs@brainstudioagencia.com")).to_be_visible()
    page.screenshot(path="/home/jules/verification/public_privacy.png")

    # 3. Verify Terms of Service (Publicly Accessible)
    print("Verifying Terms of Service Route...")
    page.goto("http://localhost:3000/terminos")
    page.wait_for_selector("text=Términos y Condiciones del Servicio")
    expect(page.locator("text=Uso Responsable de la Plataforma")).to_be_visible()
    page.screenshot(path="/home/jules/verification/public_terms.png")

    print("All public routes verified successfully.")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 800})
        try:
            verify_public_legal_routes(page)
        except Exception as e:
            print(f"Error during verification: {e}")
            page.screenshot(path="/home/jules/verification/error_legal_screenshot.png")
        finally:
            browser.close()
