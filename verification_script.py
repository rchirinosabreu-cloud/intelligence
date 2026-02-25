from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    print("Navigating to http://localhost:3000")
    page.goto("http://localhost:3000")

    # Click on "Clientes" in sidebar
    print("Clicking Clientes tab")
    page.click("text=Clientes")

    # Verify header
    print("Verifying header")
    expect(page.locator("h2")).to_contain_text("Clientes")

    # Verify search input
    expect(page.locator("input[placeholder='Buscar cliente...']")).to_be_visible()

    # Click "Nuevo Cliente"
    print("Opening Modal")
    page.click("text=Nuevo Cliente")

    # Fill form
    print("Filling form")
    page.fill("input[placeholder='Ej. SunPartners']", "Test Client")

    # Click Create
    print("Clicking Create")
    # Button inside modal
    page.click("button:has-text('Crear Espacio')")

    # Wait for creation (mock backend returns fast)
    # Verify new client card appears
    print("Verifying new client card")
    expect(page.locator("text=Test Client")).to_be_visible()

    # Take screenshot
    print("Taking screenshot")
    page.screenshot(path="verification_clients.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
