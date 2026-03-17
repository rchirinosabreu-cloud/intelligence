
import asyncio
from playwright.async_api import async_playwright
import json

async def run_verification():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 800}
        )
        page = await context.new_page()

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

        current_tasks = [initial_task]

        # Setup Mock API
        async def handle_tasks(route):
            print(f"DEBUG: Handling tasks request. Returning title: {current_tasks[0]['title']}")
            await route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(current_tasks)
            )

        await page.route("**/api/tasks**", handle_tasks)

        # Mock other necessary APIs to avoid console noise/errors
        await page.route("**/api/tasks/metrics**", lambda route: route.fulfill(
            status=200, content_type="application/json", body=json.dumps({"pending": 1, "completedToday": 0})
        ))
        await page.route("**/api/notifications**", lambda route: route.fulfill(
            status=200, content_type="application/json", body=json.dumps([])
        ))
        await page.route("**/api/notifications/unread-count**", lambda route: route.fulfill(
            status=200, content_type="application/json", body=json.dumps({"count": 0})
        ))
        await page.route("**/api/db/clients**", lambda route: route.fulfill(
            status=200, content_type="application/json", body=json.dumps([])
        ))
        await page.route("**/api/metrics/quality-streak**", lambda route: route.fulfill(
            status=200, content_type="application/json", body=json.dumps({"streak": 0})
        ))

        # Mock Auth
        await page.add_init_script("""
            const user = {
                id: 'user-1',
                name: 'Rodny Test',
                role: 'ADMIN',
                email: 'test@brainstudio.la'
            };
            window.localStorage.setItem('authToken', 'mock-token');
            window.localStorage.setItem('currentUser', JSON.stringify(user));
            window.sessionStorage.setItem('currentUser', JSON.stringify(user));
        """)

        print("Navigating to /gestion...")
        await page.goto("http://localhost:3000/gestion", wait_until="networkidle")

        # Wait for initial load
        print("Waiting for 'Initial Task' to appear...")
        await page.wait_for_selector("text=Initial Task", timeout=10000)
        print("Initial Task found!")

        # Update the data for the next fetch
        print("Updating data to 'Updated Task Name'...")
        current_tasks[0] = updated_task

        print("Simulating focus to trigger refetch...")
        # We expect a request to happen
        try:
            async with page.expect_request("**/api/tasks**", timeout=5000) as request_info:
                await page.evaluate("window.dispatchEvent(new Event('focus'))")
                # Also try visibilitychange as TanStack Query listens to both
                await page.evaluate("Object.defineProperty(document, 'visibilityState', {value: 'visible', writable: true});")
                await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")

            print("Refetch request detected!")
        except Exception as e:
            print(f"Warning: No explicit refetch request detected via focus event, trying a direct wait anyway: {e}")

        print("Waiting for 'Updated Task Name' to appear in UI...")
        try:
            await page.wait_for_selector("text=Updated Task Name", timeout=10000)
            print("LIVE UPDATE VERIFIED: Task name updated automatically!")
        except Exception as e:
            print(f"Failed to find Updated Task Name: {e}")
            await page.screenshot(path="/home/jules/verification/failure_live_update_v2.png")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run_verification())
