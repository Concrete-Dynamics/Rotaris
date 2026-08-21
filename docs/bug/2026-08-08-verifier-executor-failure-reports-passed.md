# Bug — A verifier run whose executor fails to construct reports verdict `passed` with zero checks

**Date:** 2026-08-08
**Status:** Open
**Severity:** High (silently passes the SWR-2604 completion gate; also the cause of three flaky integration tests)
**Affected requirements:** SWR-2602 (suite execution), SWR-2603 (evidence projection), SWR-2604 (completion gate)

---

## What happened

Under `pytest -n auto` on Windows, three integration tests fail intermittently:

- `tests/integration/test_verifier_gate_e2e.py::test_a_run_that_breaks_a_blocking_check_completes_only_after_it_is_fixed`
- `tests/integration/test_verifier_post_change_run.py::test_a_run_that_changes_files_executes_the_real_configured_check`
- `tests/integration/test_verifier_repair_e2e.py::test_a_persistently_failing_check_ends_the_run_as_failed_verification`

The visible symptom is an unrelated-looking assertion:

```
>       assert len(attempts) == 2, "the run stopped without giving the fix a chance"
E       AssertionError: the run stopped without giving the fix a chance
E       assert 1 == 2
```

The captured log shows the real cause:

```
ERROR rotaris_core.verifier.runner:runner.py:166 Verifier run failed; reporting the checks completed so far.
Traceback (most recent call last):
  File "src/rotaris_core/verifier/runner.py", line 163, in run_check_suite
    executor = factory()
  File "src/rotaris_core/verifier/runner.py", line 278, in _create
    return HardenedTerminalExecutor(working_dir=str(workspace_root))
  File "src/rotaris_core/tools/terminal.py", line 543, in __init__
    super().__init__(...)
  File ".venv/Lib/site-packages/openhands/tools/terminal/impl.py", line 115, in __init__
    self._session = create_terminal_session(...)
  File ".venv/Lib/site-packages/openhands/tools/terminal/terminal/factory.py", line 157, in create_terminal_session
    return _create_windows_terminal(...)
  File ".venv/Lib/site-packages/openhands/tools/terminal/terminal/factory.py", line 74, in _create_windows_terminal
    raise RuntimeError("PowerShell is not available on this system")
RuntimeError: PowerShell is not available on this system
```

The test flake is the small half of this bug. The large half is what the verifier does
with that exception.

## Root cause 1 — the executor failure is swallowed and the run still reports `passed`

**File:** `src/rotaris_core/verifier/runner.py`, lines 152–175

```python
    started = time.monotonic()
    factory = executor_factory or _default_executor_factory(workspace_root)
    results: list[CheckResult] = []
    executor: Any | None = None
    try:
        for check in suite.checks:
            ...
            if executor is None:
                executor = factory()                       # <-- raises here
            results.append(await _run_one_check(check, executor, evidence_dir))
    except Exception:  # noqa: BLE001 - the verifier must never break an iteration
        _log.exception("Verifier run failed; reporting the checks completed so far.")
    finally:
        _cleanup(executor)

    return VerifierRunResult(
        executed=True,                                     # <-- unconditional
        suite_source=suite.source,
        results=results,                                   # <-- still []
        duration_s=round(time.monotonic() - started, 3),
    )
```

When `factory()` raises on the first check, `results` is still empty but `executed` is
hardcoded `True`. That combination is then projected in
`src/rotaris_core/verifier/evidence.py`:

```python
def _verdict_for(run: VerifierRunResult) -> VerifierVerdict:
    """...
    A suite that never ran is ``skipped``, never ``passed`` — SWR-2604 gates on
    positive evidence, so "nothing was checked" must not read as "checks passed".
    """
    if not run.executed:
        return "skipped"
    return "failed" if run.blocking_failures else "passed"
```

`executed=True`, `checks=[]`, so `blocking_failures` is empty, so the verdict is
**`passed`**. The docstring states the exact invariant the code then breaks: "nothing was
checked" must not read as "checks passed". Any transient failure while *building* the
executor — not just this PowerShell one — turns a completion gate into a rubber stamp.

The `except Exception` itself is deliberate and correct ("the verifier must never break an
iteration"). What is missing is that a caught exception must be recorded in the result so
the verdict can reflect it.

## Root cause 2 — the PowerShell probe is a 5-second uncached subprocess launch

**File:** `.venv/Lib/site-packages/openhands/tools/terminal/terminal/factory.py`, lines 31–56

```python
def _get_powershell_command(explicit_shell_path: str | None = None) -> str | None:
    candidates = [explicit_shell_path] if explicit_shell_path else []
    if platform.system() == "Windows":
        candidates.extend(["pwsh.exe", "pwsh", "powershell.exe", "powershell"])
    ...
    for candidate in candidates:
        try:
            result = subprocess.run(
                [candidate, "-Command", "Write-Host 'PowerShell Available'"],
                capture_output=True, text=True, timeout=5.0, env=sanitized_env(),
            )
        except (subprocess.TimeoutExpired, FileNotFoundError, PermissionError, OSError):
            continue
        if result.returncode == 0:
            return candidate
    return None
```

Every candidate is validated by actually starting PowerShell, with a hard 5 s timeout, and
**nothing is cached** — the probe reruns on every executor construction. Under `-n auto`
with ~16 pytest workers competing for CPU, a cold `pwsh.exe`/`powershell.exe` start
routinely exceeds 5 s. Each candidate then raises `TimeoutExpired`, the loop falls through
to `return None`, and `_create_windows_terminal` reports "PowerShell is not available on
this system" on a machine where PowerShell is plainly available.

Note this is not avoidable by passing an explicit `shell_path` from
`HardenedTerminalExecutor` — an explicit path is simply prepended to `candidates` and gets
validated by the same 5 s launch.

## Steps to reproduce

Root cause 1 is reproducible deterministically without any Windows/PowerShell involvement:

1. Call `run_check_suite(...)` with an `executor_factory` that raises on first call.
2. Observe the returned `VerifierRunResult` has `executed=True` and `results=[]`.
3. Project it with `VerifierEvidence.from_run(...)` — `verdict == "passed"`.

Root cause 2 needs load:

1. `uv run pytest tests/unit/ tests/integration/ -n auto -q --timeout=30` on Windows.
2. Repeat. The three tests above fail on roughly one run in three; a serial run
   (`uv run pytest -q --timeout=30`) has never reproduced it — measured green at
   **3504 passed, 11 skipped** on 2026-08-08.

## What was expected

- A verifier run that caught an exception before completing its suite must **not** project
  as `passed`. Either the run is `skipped`/`failed`, or the error is carried as a check
  result that `blocking_failures` can see.
- A transient PowerShell probe timeout should not be reported as "PowerShell is not
  available on this system".

## Proposed fix direction

**Root cause 1 (ours, fix first — it is a product bug, not a test bug):**

1. Record the caught exception. Either set a flag consumed by `_verdict_for`, or append a
   synthetic `CheckResult(status="failed", severity="blocking", ...)` naming the error so
   the existing `blocking_failures` path handles it unchanged.
2. Decide `executed` from actual progress rather than hardcoding `True` — a suite that
   never ran a single check is `skipped` by the module's own stated contract.
3. Add a unit test for exactly this: an `executor_factory` that raises must not yield
   verdict `passed`. That test also pins the invariant the docstring already claims.

**Root cause 2 (vendor):**

The probe lives in the `openhands` package, so we cannot fix it in place. Options, roughly
in order of preference:

1. Once root cause 1 is fixed, the three tests fail *loudly and correctly* instead of
   flakily asserting the wrong thing — which may be enough, since the underlying condition
   is genuine CPU starvation in a parallel test run.
2. Resolve and cache the PowerShell path once per process in
   `rotaris_core/tools/terminal.py` and pass it as `shell_path`. This does **not** skip the
   vendor probe, so it only reduces N probes to 1 per process — partial mitigation.
3. Retry executor construction once in `_default_executor_factory` on `RuntimeError`. Cheap
   but papers over the diagnosis; only worth it with a logged warning.
4. Report upstream to the OpenHands SDK: the probe should cache its result and distinguish
   `TimeoutExpired` (transient) from `FileNotFoundError` (genuinely absent).

## Related code

| File | Lines | Concern |
|------|-------|---------|
| `src/rotaris_core/verifier/runner.py` | 152–175 | `except Exception` swallows; `executed=True` unconditional |
| `src/rotaris_core/verifier/runner.py` | 274–280 | `_default_executor_factory` — no retry, no diagnosis |
| `src/rotaris_core/verifier/evidence.py` | 85–94 | `_verdict_for` — docstring states the invariant the runner breaks |
| `src/rotaris_core/verifier/evidence.py` | 75–82 | `blocking_failures` — empty `checks` reads as clean |
| `src/rotaris_core/tools/terminal.py` | 529–550 | `HardenedTerminalExecutor.__init__` passes `shell_path` through |
| `.venv/.../openhands/tools/terminal/terminal/factory.py` | 31–81 | uncached 5 s probe (vendor, not editable) |
| `tests/integration/test_verifier_gate_e2e.py` | 127 | assertion that misreports the cause |
| `tests/integration/test_verifier_post_change_run.py` | 280 | same class |
| `tests/integration/test_verifier_repair_e2e.py` | 71 | same class |
