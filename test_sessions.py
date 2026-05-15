"""
End-to-end test: sessions & chat history management.

Starts the Vite dev server, intercepts API calls with mock responses,
and validates the full session lifecycle.
"""

import os, sys, json, time, subprocess, signal
from pathlib import Path

sys.path.insert(0, "/tmp/playwright-venv/lib/python3.12/site-packages")
os.environ["PLAYWRIGHT_BROWSERS_PATH"] = os.path.expanduser("~/.cache/ms-playwright")

from playwright.sync_api import sync_playwright, expect

FRONTEND_DIR = Path(__file__).parent / "frontend"
VITE_PORT = 5179


def start_vite() -> subprocess.Popen:
    proc = subprocess.Popen(
        ["npx", "vite", "--port", str(VITE_PORT), "--host", "127.0.0.1"],
        cwd=str(FRONTEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    deadline = time.time() + 30
    while time.time() < deadline:
        line = proc.stdout.readline().decode(errors="replace")
        if "Local:" in line or "ready in" in line.lower():
            return proc
        time.sleep(0.2)
    raise RuntimeError("Vite did not start in time")


def stop_vite(proc: subprocess.Popen) -> None:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def main():
    vite_proc = start_vite()
    passed = 0
    failed = 0

    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            context = browser.new_context(viewport={"width": 1280, "height": 800})
            page = context.new_page()

            # Collect console logs for debugging
            console_logs = []
            page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
            page.on("pageerror", lambda err: console_logs.append(f"[PAGE_ERROR] {err}"))

            base_url = f"http://localhost:{VITE_PORT}"

            # ────────────────────────────────────────────────────────────
            # Test 1: Page loads correctly
            # ────────────────────────────────────────────────────────────
            print("\n=== Test 1: Page loads with welcome screen ===")
            page.goto(base_url)
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1000)

            # Check welcome heading
            heading = page.get_by_role("heading", name="RadClaw")
            assert heading.is_visible(), "Welcome heading not visible"
            print("  ✓ Welcome screen visible")

            # Check sidebar nav items
            sidebar = page.locator("aside")
            for label in ["Chat", "Sessions", "Admin", "Memory", "Settings"]:
                btn = sidebar.get_by_role("button", name=label)
                assert btn.is_visible(), f"Sidebar nav '{label}' not visible"
            print("  ✓ Sidebar nav items visible")

            # Check chat input exists
            ta = page.locator("textarea")
            assert ta.count() == 1, f"Expected 1 textarea, found {ta.count()}"
            print("  ✓ Chat input visible")

            # Check welcome prompts
            prompts = ["What can you help me with?", "Summarize recent heartbeat tasks"]
            for p in prompts:
                assert page.get_by_text(p).first.is_visible(), f"Prompt '{p}' not visible"
            print("  ✓ Welcome prompts visible")

            passed += 1

            # ────────────────────────────────────────────────────────────
            # Test 2: Send a message (mocked SSE stream)
            # ────────────────────────────────────────────────────────────
            print("\n=== Test 2: Send a message ===")

            stream_called = [False]
            def handle_stream(route):
                stream_called[0] = True
                body = "event: token\ndata: {}\n\n"
                body += "event: done\ndata: {}\n\n"
                route.fulfill(
                    status=200,
                    headers={
                        "Content-Type": "text/event-stream",
                        "Cache-Control": "no-cache",
                    },
                    body=body,
                )

            sessions_called = [False]
            def handle_sessions(route):
                sessions_called[0] = True
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps({"sessions": []}),
                )

            page.route("**/api/chat/stream", handle_stream)
            page.route("**/api/sessions*", handle_sessions)

            # Type and send
            ta = page.locator("textarea")
            ta.fill("Hello RadClaw")
            page.keyboard.press("Enter")
            page.wait_for_timeout(2000)

            # Check stream was called
            assert stream_called[0], "Stream endpoint was not called"
            print("  ✓ Stream endpoint called")

            # Check user message appeared
            main_area = page.get_by_role("main")
            assert main_area.get_by_text("Hello RadClaw").is_visible(), "User message missing"
            print("  ✓ User message rendered")

            # Check for message bubbles
            bubbles = page.locator("[class*='animate-fade-up']")
            assert bubbles.count() >= 1, f"Expected message bubbles, found {bubbles.count()}"
            print(f"  ✓ {bubbles.count()} message bubble(s) found")

            passed += 1

            # ────────────────────────────────────────────────────────────
            # Test 3: Session auto-created after message
            # ────────────────────────────────────────────────────────────
            print("\n=== Test 3: Session auto-created ===")
            page.wait_for_timeout(500)

            sidebar.get_by_role("button", name="Sessions").click()
            page.wait_for_timeout(500)

            session_cards = page.locator("[class*='rounded-xl']").filter(
                has=page.locator("text=messages")
            )
            count = session_cards.count()
            assert count == 1, f"Expected 1 session, found {count}"
            print(f"  ✓ Session created ({count})")

            # Check session title
            first_title = session_cards.first.inner_text()
            assert "Hello RadClaw" in first_title, f"Title mismatch: {first_title}"
            print(f"  ✓ Session title correct")

            passed += 1

            # ────────────────────────────────────────────────────────────
            # Test 4: New session doesn't duplicate
            # ────────────────────────────────────────────────────────────
            print("\n=== Test 4: New session (no duplicate) ===")

            # Click New on sessions page
            page.get_by_role("button", name="New").click()
            page.wait_for_timeout(500)

            # Should still have 1 session (no duplicate)
            session_cards = page.locator("[class*='rounded-xl']").filter(
                has=page.locator("text=messages")
            )
            assert session_cards.count() == 1, (
                f"Expected 1 session after new, found {session_cards.count()} — DUPLICATE BUG"
            )
            print("  ✓ No duplicate session created")

            passed += 1

            # ────────────────────────────────────────────────────────────
            # Test 5: Session persistence (localStorage)
            # ────────────────────────────────────────────────────────────
            print("\n=== Test 5: Session persistence ===")

            page.reload()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1000)

            sidebar.get_by_role("button", name="Sessions").click()
            page.wait_for_timeout(500)

            session_cards = page.locator("[class*='rounded-xl']").filter(
                has=page.locator("text=messages")
            )
            assert session_cards.count() == 1, (
                f"Expected 1 session after reload, found {session_cards.count()}"
            )
            print("  ✓ Session persisted across reload")

            passed += 1

            # ────────────────────────────────────────────────────────────
            # Print results
            # ────────────────────────────────────────────────────────────
            print(f"\n{'='*60}")
            print(f"RESULTS: {passed} passed, {failed} failed")
            if console_logs:
                print(f"\nConsole logs ({len(console_logs)}):")
                for log in console_logs[-10:]:
                    print(f"  {log}")
            print(f"{'='*60}")

            browser.close()
            assert failed == 0, f"{failed} test(s) failed"

    finally:
        stop_vite(vite_proc)


if __name__ == "__main__":
    main()
