# Bug — TUI snapshot and wall-clock tests fail non-deterministically under `pytest -n auto`

**Date:** 2026-08-08
**Status:** Fixed 2026-08-09 — see [Root cause](#root-cause-measured-2026-08-09)
**Severity:** Medium (no product defect known; it makes the documented parallel test command unusable as a gate)
**Affected requirements:** SWR-1169, SWR-1414, SWR-1418, SWR-1246, SWR-1247, SWR-1252

---

## What happened

The parallel test command documented in `AGENTS.md`

```bash
uv run pytest tests/unit/ tests/integration/ -n auto -q --timeout=30
```

fails a **different set of tests on every run**, while the sequential command is reliably
green. Three consecutive parallel runs on 2026-08-08, same working tree:

| run | result |
|---|---|
| 1 | 8 failed, 3488 passed, 5 skipped (270 s) |
| 2 | 2 failed, 3494 passed, 5 skipped (189 s) |
| 3 | 0 failed (snapshot subset clean; different pair failed) |

Sequential on the same tree: **3504 passed, 11 skipped, 0 failed** (594 s).
`apps/rotaris/tests`: **494 passed**.

Tests observed failing across those runs:

- `tests/unit/test_tui_snapshot_modals.py::test_snapshot_command_palette`
- `tests/unit/test_tui_snapshot_agent_tree.py::test_snapshot_agent_tree_with_children`
- `tests/unit/test_tui_snapshot_chat.py::test_snapshot_chat_agent_messages`
- `tests/unit/test_tui_workflows.py::test_snapshot_after_user_message_submitted`
- `tests/unit/test_tui_navigation.py::test_navigation_updates_chat_and_top_bar_badge_in_lockstep`

The three `tests/integration/test_verifier_*` failures seen in the same runs are a
**separate, unrelated bug** — see
[2026-08-08-verifier-executor-failure-reports-passed.md](2026-08-08-verifier-executor-failure-reports-passed.md).

## Two distinct failure modes

### 1. Snapshot mismatch (four tests)

`snap_compare(...)` returns `False`; the assertion carries no diff, only:

```
E       AssertionError: assert False
E        +  where False = <function snap_compare.<locals>.compare at 0x...>(RotarisTuiApp(...), run_before=...)
```

The `run_before` hooks all follow the same shape — mutate state, then a single
`await pilot.pause()`:

```python
async def run_before(pilot: Pilot[Any]) -> None:
    await pilot.pause()
    pilot.app.current_session = make_agent_session()
    pilot.app._refresh_widgets()
    await pilot.pause()

assert snap_compare(RotarisTuiApp(), run_before=run_before)
```

The original guess was that one `pilot.pause()` yields a single message-pump cycle and that
under CPU contention deferred refreshes/`@work` workers had not landed, capturing the SVG
mid-render. **That guess was wrong** — see [Root cause](#root-cause-measured-2026-08-09). The
`run_before` shape above is fine; the mismatch is a blinking cursor.

Reproduction is load-dependent, not order-dependent:

- `test_snapshot_agent_tree_with_children` alone, 3 runs: pass, **fail**, pass.
- Same test alone, 8 further runs: 8 passes.
- Snapshot subset under `-n auto`, 2 runs: 2 failed, then 0 failed.

### 2. Wall-clock assertion with a 2-second tolerance window (one test)

**File:** `tests/unit/test_tui_navigation.py`

```python
started_at = time.monotonic() - 65
...
assert "1:05" in top_bar.focus_badge_text or "1:06" in top_bar.focus_badge_text
```

Observed failure:

```
E  AssertionError: assert ('1:05' in 'orchestrator.impl - 1:09' or '1:06' in 'orchestrator.impl - 1:09')
```

The test seeds `started_at` 65 real seconds in the past and allows the rendered badge to
read `1:05` or `1:06` — a 2-second budget for everything between seeding and asserting.
Under load the run took ~4 s longer and rendered `1:09`. This one is a plain test defect
and is fixable on its own, independent of the snapshot work.

## Steps to reproduce

1. `uv run pytest tests/unit/ tests/integration/ -n auto -q --timeout=30` on Windows.
2. Repeat 3+ times. The failing set changes each run.
3. Re-run any failure serially (`--lf`, no `-n auto`) — it passes.

Note: running the snapshot tests in isolation, even under `-n auto`, often will **not**
reproduce it. The contention needs to come from the full ~3500-test suite.

## What was expected

Both suites green under the parallel command, as they are under the sequential one, so
`-n auto` can be used as a gate rather than only as a fast smoke run.

## Root cause (measured 2026-08-09)

The failure report from a reproduced `-n auto` run holds both SVGs. **The rendered text is
byte-identical; one cell's styling differs.** The first character of the composer placeholder
is drawn `#121212` on an `#e0e0e0` background in the baseline and unstyled in the actual —
that cell is Textual's **text cursor**.

`textual.widgets.Input._on_mount` starts a **0.5 s blink timer**:

```python
self._blink_timer = self.set_interval(
    0.5, self._toggle_cursor, pause=not (self.cursor_blink and self.has_focus),
)
```

`TextArea` does the same. Every main-screen baseline contains the focused composer, so the SVG
captures whichever half of the blink cycle the app was in at screenshot time. A sequential run
reaches the capture in well under 0.5 s and always sees the cursor; under `-n auto` contention
the run crosses a blink boundary and the cursor is gone. Verified by rendering each baseline
headless with an artificial delay:

| baseline | blink on, +0.0 s | blink on, +0.7 s | blink off, +0.0 s | blink off, +0.7 s |
|---|---|---|---|---|
| `agent_tree_with_children` | ok | **fail** | ok | ok |
| `chat_agent_messages` | ok | **fail** | ok | ok |
| `command_palette` | ok | **fail** | ok | ok |
| `after_user_message_submitted` | ok | **fail** | ok | ok |
| `multiline_mode_active` (TextArea) | ok | **fail** | ok | ok |
| `initial_app_layout`, `status_bar` | ok | ok | ok | ok |

A +1.2 s delay matches again — the 0.5 s square wave. Disabling the blink leaves
`_cursor_visible` at `True`, i.e. the cursor is always drawn, which is what every committed
baseline already contains, so **no baseline needed regenerating**.

### The worker-settling theory in this report was wrong

Adding `await pilot.app.workers.wait_for_complete()` would not have fixed anything.
`pytest-textual-snapshot` already runs three `pilot.pause()` calls plus
`wait_for_scheduled_animations()` after `run_before`
(`textual/_doc.py::take_svg_screenshot`), so the render was settled; the cursor is a wall-clock
artefact, not an unsettled refresh. That machinery should not be added.

## Fix

- `tests/conftest.py` — autouse `_disable_textual_cursor_blink` fixture pins the
  `cursor_blink` reactive default to `False` on `Input` and `TextArea` (the only two classes in
  Textual 8.2.5 that declare it). Neither takes a constructor argument for it, so pinning the
  class default also covers widgets mounted mid-test, such as the command palette's own `Input`.
- `tests/unit/test_tui_navigation.py` — `test_navigation_updates_chat_and_top_bar_badge_in_lockstep`
  now freezes the one clock the badge formats from by patching
  `rotaris_core.tui.view_model.time` (not `time.monotonic` itself — a globally frozen monotonic
  clock stalls Textual's own timers and hangs the pilot) and asserts the exact `1:05`.
- `tests/unit/test_tui_snapshot_determinism.py` — new guard: renders the same settled state
  immediately and after 0.7 s and asserts the SVGs are identical. It fails if any widget starts
  rendering from the wall clock again.
- `docs/testing/textualize_testing_guide.md` — "Snapshots must be time-invariant" section.

**Hazard while working on this:** `snapshot_report.html` at the repo root is a **tracked
file** that every snapshot run rewrites. Pass `--snapshot-report=<tmp>/report.html` while
investigating, check `git status` before committing, do not delete it, and do not commit an
incidental rewrite of it alongside unrelated work.

## Still open in the same command

Three `-n auto` runs after the fix: **0 snapshot failures, 0 TUI failures** (3722–3724 passed).
The command is still not a green gate, because other parallel-only failures remain — none of
them TUI:

- `tests/integration/test_checkpoint_user_flow.py::test_a_user_rolls_a_session_back_to_the_state_an_earlier_run_left`
  — failed in all three runs.
- `tests/integration/test_checkpoint_user_flow.py::test_a_rollback_refuses_to_overwrite_work_the_user_did_by_hand`
  — one run.
- `tests/unit/test_run_host.py::test_a_successful_run_returns_a_completed_result_without_printing`
  — one run, `assert 'running' == 'completed'` on the reloaded session.
- `tests/integration/test_verifier_gate_e2e.py::test_a_run_that_breaks_a_blocking_check_completes_only_after_it_is_fixed`
  — one run; already tracked in
  [2026-08-08-verifier-executor-failure-reports-passed.md](2026-08-08-verifier-executor-failure-reports-passed.md).

## Related code

| File | Concern |
|------|---------|
| `tests/conftest.py` | `_disable_textual_cursor_blink` — the fix |
| `tests/unit/test_tui_snapshot_determinism.py` | guards against the next wall-clock-driven widget |
| `tests/unit/test_tui_navigation.py` | was a 2-second wall-clock tolerance window; now a frozen clock |
| `.venv/.../textual/widgets/_input.py` | `_on_mount` starts the 0.5 s blink timer |
| `.venv/.../textual/_doc.py` | `take_svg_screenshot` — the pauses the plugin already performs |
| `docs/testing/textualize_testing_guide.md` | "Snapshots must be time-invariant" |
| `snapshot_report.html` | tracked, rewritten by every snapshot run |

## Recurrence after the fix (2026-08-09, wave 2 integration)

`tests/unit/test_tui_snapshot_determinism.py::test_snapshot_render_is_time_invariant` failed
once during the wave-2 integration run and passed in isolation immediately afterwards.

Two things make this worth recording rather than dismissing:

- The run was **not** `-n auto`. It was a plain sequential `pytest tests/unit`, chained with
  two other suites on a loaded machine. The fix addressed cursor-blink timers under
  parallel execution; this says the underlying sensitivity is to *load*, not to the `-n`
  flag, and sequential runs are not immune.
- The test that failed is the guard installed **by** this fix — the one whose job is to
  catch the next wall-clock-driven widget. A guard that itself flakes cannot distinguish
  "a new widget started animating" from "the machine was busy", which is the property the
  guard was added to have.

Not reopened as a product defect: still no evidence of user-visible misbehaviour. But the
"fixed" claim above should be read as *fixed for `-n auto`*, not *deterministic under load*.
