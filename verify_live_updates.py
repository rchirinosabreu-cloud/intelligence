
import asyncio
from playwright.async_api import async_playwright
import json
import time

async def run_verification():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 800}
        )
        page = await context.new_page()

        # Listen for console messages
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
        page.on("request", lambda request: print(f"REQUEST: {request.method} {request.url}"))
        page.on("response", lambda response: print(f"RESPONSE: {response.status} {response.url}"))

        # Mock data
        initial_task = {
            "id": "task-1",
            "title": "Initial Task",
            "description": "Initial Description",
            "status": "PENDIENTE",
            "priority": "BAJA",
            "dueDate": "2025-01-01T00:00:00.000Z",
            "clientId": "client-1",
            "assigneeId": "user-1",
            "isPriority": False,
            "isSpecial": False,
            "createdAt": "2025-01-01T00:00:00.000Z",
            "updatedAt": "2025-01-01T00:00:00.000Z",
            "Client": {"id": "client-1", "name": "Test Client"},
            "Assignee": {"id": "user-1", "name": "Rodny Test"}
        }

        updated_task = {
            **initial_task,
            "title": "Updated Task Name",
        }

        # Setup Mock API
        async def handle_tasks(route):
            print(f"Handling route: {route.request.url}")
            await route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps([initial_task])
            )

        await page.route("**/api/tasks?**", handle_tasks)
        await page.route("**/api/tasks", handle_tasks)

        await page.route("**/api/tasks/metrics**", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"pending": 1, "completedToday": 0})
        ))

        # Mock Auth
        await page.add_init_script("""
            window.localStorage.setItem('authToken', 'mock-token');
            window.localStorage.setItem('currentUser', JSON.stringify({
                id: 'user-1',
                name: 'Rodny Test',
                role: 'ADMIN',
                email: 'test@brainstudio.la'
            }));
        """)

        print("Navigating to /gestion...")
        await page.goto("http://localhost:3000/gestion")

        # Wait for initial load
        print("Waiting for 'Initial Task' to appear...")
        try:
            await page.wait_for_selector("text=Initial Task", timeout=10000)
            print("Initial Task found!")
        except Exception as e:
            print(f"Failed to find Initial Task: {e}")
            await page.screenshot(path="/home/jules/verification/failure_retry.png")
            await browser.close()
            return

        # Now update the mock for the next fetch
        print("Updating mock to 'Updated Task Name'...")
        await page.unroute("**/api/tasks**")
        await page.route("**/api/tasks**", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps([updated_task])
        ))

        print("Waiting for auto-refresh (simulating focus)...")
        # Instead of waiting 30s, we can trigger a window focus event
        await page.evaluate("window.dispatchEvent(new Event('focus'))")

        print("Waiting for 'Updated Task Name' to appear...")
        try:
            await page.wait_for_selector("text=Updated Task Name", timeout=10000)
            print("LIVE UPDATE VERIFIED: Task name updated automatically!")
        except Exception as e:
            print(f"Failed to find Updated Task Name: {e}")
            await page.screenshot(path="/home/jules/verification/failure_live_update.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run_verification())
