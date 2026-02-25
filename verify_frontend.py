from playwright.sync_api import sync_playwright

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to Dashboard
        print("Navigating to Dashboard...")
        page.goto("http://localhost:3000/")
        page.wait_for_selector('h2', timeout=10000) # Wait for "Hola, Team Lead" or similar

        page.screenshot(path="/home/jules/verification/dashboard.png")
        print("Dashboard screenshot taken.")

        # Navigate to Clients
        print("Navigating to Clients...")
        page.goto("http://localhost:3000/clients")
        # Expect error message since backend DB is down
        try:
            page.wait_for_selector('text=Error al cargar clientes', timeout=5000)
            print("Verified: Clients page shows error state (expected due to no DB).")
        except:
            print("Warning: Did not see error message on Clients page.")

        page.screenshot(path="/home/jules/verification/clients_error.png")

        # Navigate to a specific client (should show error or 404 UI)
        print("Navigating to Client Page (/clients/sunpartners)...")
        page.goto("http://localhost:3000/clients/sunpartners")
        try:
            page.wait_for_selector('text=Cliente no encontrado', timeout=5000) # Or "Error cargando cliente"
            print("Verified: Client Page shows error/404 state.")
        except:
             print("Warning: Did not see error message on Client Page.")

        page.screenshot(path="/home/jules/verification/client_page_error.png")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
