
from playwright.sync_api import Page, expect, sync_playwright

def test_slideover_open(page: Page):
  # 1. Arrange: Go to the homepage (or wherever widgets are)
  # Assuming localhost:3000 shows the dashboard with widgets
  page.goto("http://localhost:3000")

  # 2. Act: Open the Campfire widget
  # Find the button "Abrir Chat" inside Campfire card
  page.get_by_role("button", name="Abrir Chat").click()

  # 3. Assert: Verify SlideOver is visible
  # The SlideOver has a title "Campfire" inside a Dialog Title
  expect(page.get_by_role("heading", name="Campfire", level=2)).to_be_visible()

  # 4. Screenshot
  page.screenshot(path="/home/jules/verification/slideover_verification.png")

if __name__ == "__main__":
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
      test_slideover_open(page)
    finally:
      browser.close()
