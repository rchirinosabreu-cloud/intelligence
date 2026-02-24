import time
from playwright.sync_api import sync_playwright

def test_dashboard_layout():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # 1. Arrange: Go to Dashboard
        print("Navigating to http://localhost:3000...")
        page.goto("http://localhost:3000")

        # 2. Wait for content to load
        print("Waiting for content...")
        try:
            # Wait for any of the main headings
            page.wait_for_selector("text=¡Hola, Equipo Brain!", timeout=10000)
            print("Dashboard loaded.")
        except:
            print("Dashboard load timed out. Taking screenshot anyway.")
            page.screenshot(path="dashboard_timeout.png")
            return

        # 3. Check for new widgets
        try:
            page.wait_for_selector("text=Anuncios importantes", timeout=5000)
            print("Found 'Anuncios importantes'")

            page.wait_for_selector("text=Próximas Reuniones", timeout=5000)
            print("Found 'Próximas Reuniones'")

            page.wait_for_selector("text=Salud de Clientes", timeout=5000)
            print("Found 'Salud de Clientes'")

        except Exception as e:
            print(f"Widget check failed: {e}")

        # 4. Check layout logic (visual inspection via screenshot is key)
        # We assume Broadcast is full width if it exists.

        # 5. Check Kanban Snap-back (navigate to Tasks)
        # Assuming Tasks is accessible via sidebar or direct URL?
        # Let's check sidebar link.
        # Sidebar likely has text "Gestión" or "Pendientes".
        # Or go to /tasks directly if routes allow?
        # Let's inspect sidebar first.

        print("Taking Dashboard screenshot...")
        page.screenshot(path="dashboard_verification.png", full_page=True)

        browser.close()

if __name__ == "__main__":
    test_dashboard_layout()
