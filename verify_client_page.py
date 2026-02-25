from playwright.sync_api import sync_playwright

def verify_client_page_layout():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to a client page (e.g., sunpartners)
        print("Navigating to Client Page...")
        page.goto("http://localhost:3000/clients/sunpartners")

        try:
            # Wait for main elements to load (even if mock or empty)
            page.wait_for_selector('h1', timeout=10000) # Client Name

            # Check for new widgets
            # Campfire Preview
            if page.locator("text=Campfire").count() > 0:
                print("Verified: Campfire widget present.")
            else:
                print("Warning: Campfire widget not found.")

            # Digital Identity
            if page.locator("text=Identidad Digital").count() > 0:
                print("Verified: Digital Identity widget present.")
            else:
                print("Warning: Digital Identity widget not found.")

            # Deliverables
            if page.locator("text=Entregables").count() > 0:
                print("Verified: Deliverables widget present.")
            else:
                print("Warning: Deliverables widget not found.")

            # Take Layout Screenshot
            page.screenshot(path="/home/jules/verification/client_page_bento_v2.png", full_page=True)
            print("Layout screenshot taken: client_page_bento_v2.png")

            # Test Campfire Drawer
            # Find the Campfire card (assuming it's clickable) and click it
            # The preview card has text "Campfire" inside.
            campfire_card = page.locator(".group").filter(has_text="Campfire").first()
            if campfire_card.is_visible():
                campfire_card.click()
                # Wait for drawer animation
                page.wait_for_timeout(1000)

                # Check if chat interface is visible (look for input placeholder or header)
                if page.locator("placeholder='Escribe como'").count() > 0 or page.locator("text=Historial de equipo").is_visible():
                     print("Verified: Campfire Drawer opened successfully.")
                     page.screenshot(path="/home/jules/verification/campfire_drawer_open.png")
                else:
                     print("Warning: Campfire Drawer did not appear to open.")

        except Exception as e:
            print(f"Error during verification: {e}")
            page.screenshot(path="/home/jules/verification/error_state.png")

        browser.close()

if __name__ == "__main__":
    verify_client_page_layout()
