from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = context.new_page()

    try:
        # 1. Dashboard
        print("Navigating to Dashboard...")
        page.goto("http://localhost:3000")
        page.wait_for_selector("text=Bienvenido, Director", timeout=10000)
        page.screenshot(path="/home/jules/verification/1_dashboard.png")
        print("Dashboard screenshot taken.")

        # 2. Tasks (Pendientes)
        print("Navigating to Tasks...")
        page.click("text=Pendientes")
        page.wait_for_selector("text=Gestión de tareas", timeout=5000)
        # Wait for animation
        page.wait_for_timeout(1000)
        page.screenshot(path="/home/jules/verification/2_tasks.png")
        print("Tasks screenshot taken.")

        # 3. Chat (Bria)
        print("Navigating to Chat...")
        page.click("text=Bria Intelligence")
        page.wait_for_selector("text=Bria puede cometer errores", timeout=5000)
        # Wait for animation
        page.wait_for_timeout(1000)
        page.screenshot(path="/home/jules/verification/3_chat.png")
        print("Chat screenshot taken.")

        # 4. Files (Archivos)
        print("Navigating to Files...")
        page.click("text=Archivos")
        page.wait_for_selector("text=Base de conocimiento", timeout=5000)
        # Wait for animation
        page.wait_for_timeout(1000)
        page.screenshot(path="/home/jules/verification/4_files.png")
        print("Files screenshot taken.")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="/home/jules/verification/error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
