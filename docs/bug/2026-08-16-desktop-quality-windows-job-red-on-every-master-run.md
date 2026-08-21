# Bug — `desktop-quality (windows-latest)` has failed every `master` run since 2026-08-08

**Date:** 2026-08-16
**Status:** Open, narrowed — the interrupting mechanism was fixed on 2026-08-21
(see [the `os.kill` report](2026-08-18-os-kill-pid-0-generates-a-real-ctrl-c-on-windows.md));
this stays open until a `master` run confirms the job is green, and for the two
ordinary failures named under "Superseded 2026-08-18", which were invisible while
the process was interrupting itself. Not reproduced locally at the time of writing (no
Windows runner available to the reporting session); still red as of 2026-08-18
(`7e2afef`, the merge of #82)
**Severity:** High (no product defect known; the desktop app's only CI gate has been red for
10 days, so it can no longer signal a real regression)
**Affected requirements:** none identified — CI/test-infrastructure defect. The one named test
seen failing carries SWR-3601, SWR-3314.

---

## What happened

The `Rotaris desktop` workflow (`.github/workflows/rotaris.yml`) runs `desktop-quality` on a
two-OS matrix. The `ubuntu-latest` leg passes. The `windows-latest` leg fails, and has done so
on **30 of the last 30 `master` runs**, from `c4a0b81` (2026-08-08T22:18:55Z) through `198719b`
(2026-08-16T13:05:52Z).

**Still red as of 2026-08-18.** The streak has not broken. Every `master` run since has failed
the same job, including `01defdf` (#81) and `7e2afef` (#82); the 30 most recent `master` runs
of this workflow — now spanning 2026-08-11 to 2026-08-18 — are all failures.

The failure is always in step 7:

```bash
uv run pytest apps/rotaris/tests -q --timeout=30 -p no:textual-snapshot
```

The remaining steps (`ruff`, `mypy`) are skipped as a consequence, so on Windows they have not
run in 8 days either.

## The failure is different every run

This is the property that makes it read as instability rather than a defect in one test. Across
five inspected runs, no two failed the same way:

| run | head | Windows outcome |
|---|---|---|
| [31947299922](https://github.com/theUpsider/Rotaris/actions/runs/31947299922) | `c1bbfdd` (master) | `2 failed, 929 passed` — `KeyboardInterrupt` inside `QLabel(description)` at `widgets/feedback.py:59`, via `views/dashboard.py:329` |
| [31948861311](https://github.com/theUpsider/Rotaris/actions/runs/31948861311) | `198719b` (master) | `718 passed`, then `KeyboardInterrupt` at `widgets/splitter.py:72` |
| [31951003684](https://github.com/theUpsider/Rotaris/actions/runs/31951003684) | `86db502` (PR #74) | `1 failed, 717 passed` — `test_requirements_board_actions.py::test_every_drop_has_a_keyboard_equivalent`, plus `KeyboardInterrupt` at `apps/rotaris/tests/ui_query.py:88` |
| [31953122175](https://github.com/theUpsider/Rotaris/actions/runs/31953122175) | `d091b36` (PR #74) | process died at ~38 % of the run, exit code 1, no summary line and no named test |
| [32157549120](https://github.com/theUpsider/Rotaris/actions/runs/32157549120) | `7e2afef` (master) | explicit `+++ Timeout +++` in `test_stale_session_ui.py::test_a_session_with_a_live_process_is_still_refused_and_told_why`, inside a `qtbot.waitUntil`; exit code 1, no summary line |

The one named assertion failure was a tooltip comparison:

```
AssertionError: assert 'Rotaris itself' in 'Backlog → Running is not a move this board makes.
                                            From Backlog a requirement can reach Ready, Blocked.'
```

That same test passes on `ubuntu-latest` in CI and locally on Linux (`29 passed`).

The `KeyboardInterrupt` lands at a different, arbitrary point each time — always inside Qt
widget construction or a test helper, never at a consistent call site. That is the shape of an
interrupt delivered from outside the running code, not of a test asserting something false.

## Superseded 2026-08-18 — the cause was found, and it is not the timeout

**The mechanism is `os.kill(pid, 0)`.** On Windows that is not a liveness probe:
CPython routes signal 0 to `GenerateConsoleCtrlEvent(CTRL_C_EVENT, pid)`, so the
suite presses **Ctrl+C on itself** every time it checks whether a session's process
is alive. That is where the wandering `KeyboardInterrupt`s come from, and why runs
end with no summary line. Full write-up, with the CPython source and the CI stack
that names both threads:
[`os.kill(pid, 0)` is not a liveness probe on Windows](2026-08-18-os-kill-pid-0-generates-a-real-ctrl-c-on-windows.md).

The timeout hypothesis below is left in place because the discrepancy it found is
real and still worth closing — CI and the `Makefile` should not disagree about the
per-test cap. But it is not the cause, and raising the cap will not turn this job
green: it cannot explain a `KeyboardInterrupt` (`pytest-timeout` does not raise
one), and it cannot explain the runs that end with no timeout banner at all.

## Former leading hypothesis — the CI per-test timeout is too tight for Windows

**Mechanism identified 2026-08-18; the fix is still untested.** Filed as "not verified —
the numbers line up". Run `32157549120` supplied the missing mechanism, below.

The Windows leg runs the same suite substantially slower than Ubuntu:

| run | Ubuntu step 7 | Windows step 7 | ratio |
|---|---|---|---|
| 31947299922 | 137 s | 216 s | 1.58× |
| 31948861311 | 130 s | 183 s | 1.41× |

CI caps each test at **30 s**, while the documented local command in `Makefile` caps at
**120 s**:

```make
test-rotaris:
	uv run pytest apps/rotaris/tests -q --timeout=120 -p no:textual-snapshot -n auto -m "not serial"
	uv run pytest apps/rotaris/tests -q --timeout=120 -p no:textual-snapshot -m serial
```

The deadline is not the only thing the two disagree about. CI runs **one undifferentiated
pass**: no `-n auto`, and no `-m serial` split, so tests marked `serial` — the ones documented
as needing real CPU headroom — run alongside everything else. The `Makefile` runs two passes
precisely to keep them apart.

So CI holds Windows — the slowest platform — to the strictest deadline, under the one
scheduling arrangement nobody runs locally. A Qt test that settles in a few seconds on Linux
has far less headroom there, and `pytest-timeout` interrupting a test mid-widget-construction
would explain both the
wandering `KeyboardInterrupt` sites and the runs that end abruptly with no summary (on Windows
`pytest-timeout` has no `SIGALRM` and falls back to its thread method, which terminates the
process rather than failing one test).

### The suite's own waits are longer than the deadline enforcing them

Run `32157549120` (`7e2afef`) is the first to name the mechanism outright. `pytest-timeout`
fired explicitly — `+++ Timeout +++` — inside a `qtbot.waitUntil`, and the site it named
explains why:

```python
# apps/rotaris/tests/test_stale_session_ui.py:146-155
def _settled_listing(qtbot, window, session_id) -> None:
    ...
    qtbot.waitUntil(lambda: ..., timeout=30_000)
```

**A 30-second wait, under a 30-second per-test cap.** The test cannot outlive its own wait:
if that `waitUntil` ever runs to its limit, the per-test deadline has already expired. And
this is not one stray value — counting every `qtbot.wait*` call site in the desktop suite:

| Wait length | Call sites | Against CI's `--timeout=30` |
|---|---|---|
| 180 s | 1 | six times the cap |
| 60 s | 12 | double the cap |
| 30 s | 23 | equal to the cap |

**36 waits are at or beyond the deadline CI enforces.** Any one of them reaching its limit
does not fail its own test — on Windows `pytest-timeout` kills the process, which is exactly
the "no summary line, arbitrary call site" shape this report has been describing. Locally the
120 s cap leaves the 30 s waits room to resolve, so the combination never shows up.

Reproduce the count with:

```bash
grep -rn "qtbot.wait" apps/rotaris/tests --include="*.py" -A6 \
  | grep -c "timeout=\(30000\|30_000\|60000\|60_000\|180000\)"
```

It does **not** obviously explain the tooltip assertion, which looks like a genuine
Windows-specific rendering or ordering difference. There may well be two problems here.

## Steps to reproduce

1. Push any commit to `master`, or open a PR touching `apps/rotaris/**`, `src/rotaris_core/**`,
   `pyproject.toml`, or `uv.lock`.
2. Watch `desktop-quality (windows-latest)` in the `Rotaris desktop` workflow.
3. It fails. Re-running produces a different failure, not the same one.

Not reproducible on Linux: the same suite is green locally across repeated runs
(`929 passed` + `2 passed` in the serial pass, 3 consecutive runs) and green on
`ubuntu-latest` in CI.

## What was expected

`desktop-quality (windows-latest)` green, so the desktop workflow can act as a merge gate on
both platforms rather than on one.

## Why this matters beyond the noise

While this job is unconditionally red, it carries no signal. A real Windows regression landing
today would look exactly like the last 30 runs, and nothing in the workflow distinguishes them.
PR #74 was merged over this job for that reason, having first confirmed the failure predates
the branch.

`ruff` and `mypy` for `apps/rotaris` are also skipped on Windows on every run, since step 7
fails first.

## Suggested first moves

1. **Raise the CI timeout to match the Makefile** (`--timeout=30` → `--timeout=120`) — **still
   untried as of 2026-08-18, ten days in**. One-line
   change, tests the leading hypothesis directly, and removes the discrepancy between the
   documented local command and CI regardless of the outcome. Note that **120 s is a floor,
   not headroom**: twelve waits are already 60 s and one is 180 s, so a test reaching that
   last one still dies under a 120 s cap. Either the cap clears the longest wait or the
   longest waits come down — the two numbers have to be chosen together.
2. If failures survive that, split the two problems: the timeout-shaped interrupts and the
   tooltip assertion in `test_every_drop_has_a_keyboard_equivalent` are unlikely to share a
   cause.
3. Consider `continue-on-error: true` on the Windows leg **only** as a deliberate, time-boxed
   step while it is being fixed — it keeps the Ubuntu gate meaningful without a red check that
   everyone learns to ignore. It should not be left in place.

## Related code

| File | Concern |
|------|---------|
| `.github/workflows/rotaris.yml` | the failing job; `--timeout=30` on line 39 |
| `Makefile` | `test-rotaris` uses `--timeout=120` and splits serial from parallel; CI does neither |
| `apps/rotaris/tests/test_requirements_board_actions.py` | `test_every_drop_has_a_keyboard_equivalent`, the one named assertion failure |
| `apps/rotaris/tests/test_stale_session_ui.py` | `_settled_listing` at line 149 waits 30 s under a 30 s cap |
| `apps/rotaris/src/rotaris/widgets/feedback.py` | `QLabel(description)` at line 59, one interrupt site |
| `apps/rotaris/src/rotaris/widgets/splitter.py` | line 72, another interrupt site |
| `apps/rotaris/tests/ui_query.py` | line 88, a third |

## Note on a neighbouring flake — the cause recorded here was wrong

**Corrected 2026-08-18.** This section previously recorded
`test_parallel_runs_e2e.py::test_background_completion_notifies_without_disturbing_the_focused_run`
as "a **separate, CPU-headroom** issue on Linux" that "was fixed in #74 by giving it the `serial`
marker its neighbour already carried". Neither half held.

- **It was not headroom.** It reproduces with the file run on its own on an otherwise idle
  machine — **4 / 6** in isolation on `master` at `01defdf`, eight days *after* #74 merged. Load
  moved the *rate*, which is why headroom looked like an answer; it was never the cause.
- **The `serial` marker did not fix it.** It changed how often the race was lost, not what was
  racing — so the test went on being re-run rather than read.
- **The cause was a product defect.** `MainWindow._run_started` cleared the standing notice
  unconditionally, so a background run's completion notice was wiped by the next run starting:
  **SWR-2415 AC-010** ("when a run that is not currently focused completes, a non-blocking
  notification appears"), silently unmet whenever the timing landed that way. Fixed in
  `3b5acaa fix: a background run's completion notice survives the next run starting (SWR-2415)`,
  measured **3 / 12** failures before and **0 / 30** after. Full write-up:
  [A background run's completion notice is wiped by the next run
  starting](2026-08-18-parallel-runs-e2e-flakes-on-the-background-completion-wait.md).

What this report claimed *about the Windows job* still stands — and now stands on the real fix
rather than on the marker. `3b5acaa` did not change it: `desktop-quality (windows-latest)` failed
again on `7e2afef` (the merge of #82), in `test_stale_session_ui.py` and by the mechanism above,
which has nothing to do with notices. The two defects are unrelated.

The wrong attribution is left on the page rather than deleted, because how it happened is the
transferable part: a cause was written down without being measured, and for two days it read
exactly like one that had been. The measurement that settled it was one command run twelve times.
