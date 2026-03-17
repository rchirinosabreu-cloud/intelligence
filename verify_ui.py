from playwright.sync_api import sync_playwright, expect
import json
import os

def verify_responsive_and_live(page):
    # Mock Auth
    user = {
        'id': 'user-1',
        'name': 'Rodny Test',
        'role': 'ADMIN',
        'email': 'test@brainstudio.la'
    }

    page.add_init_script(f"""
        window.localStorage.setItem('authToken', 'mock-token');
        window.localStorage.setItem('currentUser', JSON.stringify({json.dumps(user)}));
        window.sessionStorage.setItem('currentUser', JSON.stringify({json.dumps(user)}));
    """)

    # Mock APIs
    page.route("**/api/notifications**", lambda route: route.fulfill(status=200, body=json.dumps([])))
    page.route("**/api/notifications/unread-count**", lambda route: route.fulfill(status=200, body=json.dumps({"count": 0})))
    page.route("**/api/metrics/tasks**", lambda route: route.fulfill(status=200, body=json.dumps({"total": 10, "completed": 5, "pending": 5, "percentage": 50})))
    page.route("**/api/tasks/completed**", lambda route: route.fulfill(status=200, body=json.dumps([])))
    page.route("**/api/clients**", lambda route: route.fulfill(status=200, body=json.dumps([{"name": "Client Long Name Test For Truncation", "status": "ok"}])))
    page.route("**/api/db/clients**", lambda route: route.fulfill(status=200, body=json.dumps([])))

    # 1. Check Desktop Dashboard
    print("Checking Desktop Dashboard...")
    page.set_viewport_size({"width": 1280, "height": 800})
    page.goto("http://localhost:3000/")
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/desktop_dashboard.png")

    # 2. Check Mobile Dashboard (Grid should be 1 col)
    print("Checking Mobile Dashboard...")
    page.set_viewport_size({"width": 375, "height": 667})
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/mobile_dashboard.png")

    # 3. Check Gestión (Kanban)
    print("Checking Gestión...")
    page.goto("http://localhost:3000/gestion")
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/mobile_gestion.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(record_video_dir="/home/jules/verification/video")
        page = context.new_page()
        try:
            verify_responsive_and_live(page)
        finally:
            context.close()
            browser.close()
