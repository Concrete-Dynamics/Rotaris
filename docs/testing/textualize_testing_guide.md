# TUI Testing Standards

This guide adds Textual-specific rules to the canonical
[Product-Centred Test Strategy](test_strategy.md). Apply both documents; when
this guide describes mechanics, the canonical strategy still defines the
productive intent, test portfolio, E2E boundary, and ReqToCode obligations.

## Mandatory Test Categories

All TUI tests must cover **three categories**. No category may be omitted.

### 1. Full User Workflow Tests

Cover complete user workflow paths from start to finish (A to Z) using the `Pilot` API via `app.run_test()`. These tests:

- Drive key presses (`pilot.press()`), widget clicks (`pilot.click("#id")`)
- Call `await pilot.pause()` after each action to flush pending messages before asserting state
- May be long-running and must validate the entire flow without shortcutting intermediate steps

```python
async def test_full_submit_workflow():
    app = RotarisTuiApp(session_manager=make_session_manager())
    async with app.run_test() as pilot:
        await pilot.press("H", "e", "l", "l", "o")
        await pilot.pause()
        await pilot.press("enter")
        await pilot.pause()
        assert app.query_one(ChatPanel).message_count > 0
```

### 2. Alternative Workflow Path Tests

Cover scenarios where the user takes a different action than the primary path assumes. Examples:
- Pressing `Ctrl+Q` mid-flow
- Opening the command palette via `Ctrl+P` instead of the default entry
- Submitting via `Ctrl+J` instead of `Enter`

At minimum, every non-default entry point to a screen or action must have one alternative path test. Coverage is determined per workflow by the number of distinct key bindings, command palette entries, and screen transitions available at each step.

```python
async def test_submit_via_ctrl_j():
    app = RotarisTuiApp(session_manager=make_session_manager())
    async with app.run_test() as pilot:
        await pilot.press("H", "i")
        await pilot.pause()
        await pilot.press("ctrl+e")   # toggle multiline
        await pilot.pause()
        await pilot.press("ctrl+j")   # submit via Ctrl+J instead of Enter
        await pilot.pause()
        assert app.query_one(ChatPanel).message_count > 0
```

### 3. Random Interaction Tests

Cover scenarios where a user navigates within a workflow and then triggers an unrelated or unexpected action. Examples:
- Pressing an unmapped key
- Resizing the terminal
- Switching screens mid-task

These tests must assert that the app does **not crash**, does **not raise `NoMatches`**, and does **not enter an undefined widget state**. Call `await pilot.pause()` after the unexpected action to confirm the message queue drains cleanly.

```python
async def test_unmapped_key_does_not_crash():
    app = RotarisTuiApp(session_manager=make_session_manager())
    async with app.run_test() as pilot:
        await pilot.press("H", "i")
        await pilot.pause()
        await pilot.press("f5")   # unmapped key
        await pilot.pause()
        # App must still be running with no undefined widget state
        assert app.query_one(InputComposer) is not None
```

## Test-First Approach

TUI tests must be **written before verifying whether they pass**. Implementation or fixes are only applied after the tests are in place.

Snapshot baselines (`pytest --snapshot-update`) are committed only after **visually confirming** the initial output is correct.

## Coverage Update on New Workflow Paths

When a new user workflow path is introduced (new screen, new command palette entry, new key binding), tests for that path must be added to **all three categories** before the path is considered complete.

## Async Timing Safety

Every TUI test must call `await pilot.pause()` after each simulated interaction (key press, click, reactive assignment) before making assertions. This ensures all pending Textual messages have been processed and reactive watchers have fired.

---

## Setup & Test Framework

Textual is async-powered via Python's `asyncio`, so your test framework must support async testing. The official recommendation is **pytest** with the **`pytest-asyncio`** plugin. To avoid decorating every async test with `@pytest.mark.asyncio`, set this in your `pytest.ini` or `pyproject.toml`: [textual.textualize](https://textual.textualize.io/guide/testing/)

```ini
[pytest]
asyncio_mode = auto
```

## The `Pilot` Object — Core of UI Testing

Every Textual test runs the app in **headless mode** via `app.run_test()`, which returns a `Pilot` object. The Pilot acts as a virtual user that can interact with your app programmatically. [textual.textualize](https://textual.textualize.io/api/pilot/)

```python
from my_app import MyApp

async def test_my_app():
    app = MyApp()
    async with app.run_test() as pilot:
        # interact with the app via pilot
        ...
```

## Simulating Interactions

The `Pilot` API covers all common user interactions: [textual.textualize](https://textual.textualize.io/guide/testing/)

- **Key presses** — `await pilot.press("r")` or multiple keys: `await pilot.press("h", "e", "l", "l", "o")`
- **Button/widget clicks** — via CSS selector: `await pilot.click("#submit-button")`
- **Click with offset** — `await pilot.click(Button, offset=(0, -1))` (relative to the widget)
- **Double/triple clicks** — `await pilot.click(Button, times=2)`
- **Modifier keys** — `await pilot.click("#slider", control=True)`
- **Terminal resize** — `app.run_test(size=(100, 50))`

A typical test asserting state after a click:

```python
async def test_buttons():
    app = RGBApp()
    async with app.run_test() as pilot:
        await pilot.click("#red")
        assert app.screen.styles.background == Color.parse("red")

        await pilot.click("#green")
        assert app.screen.styles.background == Color.parse("green")
```

## Handling Async Timing

Some actions take a moment to propagate (e.g., messages bubbling through the widget tree). Call `await pilot.pause()` to wait for all pending messages to be processed before asserting: [textual.textualize](https://textual.textualize.io/guide/testing/)

```python
await pilot.click("#submit-button")
await pilot.pause()  # wait for message processing
assert "Success" in str(app.query_one("#status").renderable)
```

> **Note:** Testing apps that simulate many individual `Input` keypresses can be slow. Use `pilot.press(*list("full string"))` for bulk typing but be aware of the performance tradeoff. [github](https://github.com/Textualize/textual/discussions/5068)

## Snapshot Testing (Visual Regression)

For catching **visual regressions**, Textualize provides the official `pytest-textual-snapshot` plugin. It captures an SVG screenshot of your app and compares it to a saved baseline on every subsequent run. [github](https://github.com/Textualize/pytest-textual-snapshot)

```bash
pip install pytest-textual-snapshot
```

```python
def test_my_app(snap_compare):
    # Pass an App *instance* — snap_compare checks isinstance(app, App)
    assert snap_compare(MyApp())
```

- **First run** always fails (no baseline yet) — visually confirm the output looks right, then save it with `pytest --snapshot-update` [textual.textualize](https://textual.textualize.io/guide/testing/)
- **Subsequent runs** auto-compare against the saved SVG and fail if anything changed visually [github](https://github.com/Textualize/pytest-textual-snapshot)
- You can simulate interactions before the screenshot via `run_before`:

```python
def test_hover_state(snap_compare):
    async def run_before(pilot):
        await pilot.hover("#my-widget")
    assert snap_compare(MyApp(), run_before=run_before)
```

### Snapshots must be time-invariant

A baseline is only meaningful if the app renders the same bytes however long the run took to
reach the screenshot. Nothing whose render reads the wall clock may appear in a snapshot.

Textual itself violates this by default: `Input` and `TextArea` start a **0.5 s cursor blink
timer** on mount, so the SVG captures whichever half of the blink cycle the app happened to be
in. Every main-screen baseline here contains the composer, so under `pytest -n auto` the runs
that crossed a blink boundary failed with a mismatch that carried no text difference at all —
only one cell's fill colour. `tests/conftest.py` pins `cursor_blink`'s reactive default to
`False` for the whole suite, which leaves the cursor permanently drawn.

Two things follow:

- **Adding `pilot.pause()` calls does not help.** `pytest-textual-snapshot` already runs three
  pauses plus `wait_for_scheduled_animations()` after your `run_before`
  (`textual/_doc.py::take_svg_screenshot`), so the render is settled long before the capture.
  A snapshot that fails only under load is a wall-clock dependency, not an unsettled refresh —
  look for a timer, an elapsed-time label, or an animation frame, not for a missing await.
- **`tests/unit/test_tui_snapshot_determinism.py` guards this.** It renders the same settled
  state twice, once immediately and once after a delay longer than the blink period, and
  asserts the SVGs are identical. If you add a widget that animates or prints elapsed time on
  the main screen, that test fails first and tells you why.

When investigating a snapshot failure, pass `--snapshot-report=<tmp>/report.html`: the report
holds both the expected and the actual SVG, and the default path is the **tracked**
`snapshot_report.html` at the repo root, which every run rewrites.

## `unittest` — Prohibited Without Justification

`unittest.IsolatedAsyncioTestCase` is **not permitted** for TUI tests in this project (REQ-010). All TUI tests must use `pytest` with `pytest-asyncio`. The only exception is if a specific, documented reason exists — in which case the justification must appear as a comment directly above the test class.

The primary source for everything above is the [official Textual testing guide](https://textual.textualize.io/guide/testing/). [textual.textualize](https://textual.textualize.io/guide/testing/)
