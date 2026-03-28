from playwright.sync_api import sync_playwright
import os

def run_cuj(page):
    # Mock Auth
    page.add_init_script("""
        const mockUser = {
            id: 'user-1',
            name: 'System Admin',
            email: 'admin@brainstudio.com',
            role: 'ADMIN',
            avatar: 'https://ui-avatars.com/api/?name=System+Admin'
        };
        localStorage.setItem('authToken', 'mock-token');
        localStorage.setItem('currentUser', JSON.stringify(mockUser));
        sessionStorage.setItem('authToken', 'mock-token');
        sessionStorage.setItem('currentUser', JSON.stringify(mockUser));
    """)

    # Go to a client space (Bonsai CTG is seeded with a UUID)
    # Corrected path to /cliente/ instead of /clientes/
    # Navigating via slug to avoid redirection issues during verification
    page.goto("http://localhost:3000/cliente/bonsai-ctg")
    page.wait_for_timeout(2000)

    # 1. Standard View
    # Wait for any content to appear first
    page.screenshot(path="verification/screenshots/debug_initial_load.png")

    # Try to find the Deliverables widget more robustly
    try:
        deliverables_header = page.locator('h3:has-text("Entregables")').first
        deliverables_header.wait_for(state="visible", timeout=15000)
        deliverables_header.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/screenshots/deliverables_standard.png")
    except Exception as e:
        print(f"FAILED to find Deliverables: {e}")
        page.screenshot(path="verification/screenshots/debug_failure_state.png")
        raise e

    # 2. Preview Modal (Premium Look)
    # We need a file to be present. If there are no files, we can't show the preview.
    # The seed usually adds some files if we ran it.
    # Let's try to find a "Vista rápida" button (Eye icon)
    preview_button = page.locator('button[title="Vista rápida"]').first
    if preview_button.is_visible():
        preview_button.click()
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/screenshots/deliverables_preview_premium.png")
        # Close preview
        page.get_by_role("button", name="Cerrar").click()
        page.wait_for_timeout(500)

    # 3. Maximized View
    maximize_button = page.locator('button[title="Maximizar"]').first
    if maximize_button.is_visible():
        maximize_button.click()
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/screenshots/deliverables_maximized.png")

        # In maximized view, try a search
        search_input = page.get_by_placeholder("Buscar archivo...")
        search_input.fill("test")
        page.wait_for_timeout(1000)
        page.screenshot(path="verification/screenshots/deliverables_maximized_search.png")

    page.wait_for_timeout(1000)

if __name__ == "__main__":
    os.makedirs("verification/screenshots", exist_ok=True)
    os.makedirs("verification/videos", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800},
            record_video_dir="verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
