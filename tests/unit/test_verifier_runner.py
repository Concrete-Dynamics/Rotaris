"""Productive use: after an agent changes a user's code, the workspace's own checks
run and the user gets a structured, honest result per check.

Expected outcome: checks execute sequentially in configured order, each yields a
name/command/exit status/duration plus a bounded excerpt backed by a full log, a
command exiting 0 while printing test failures is reported as failed, and anything
not run — no change, an empty suite, a denied command — is recorded with its reason.
"""

from __future__ import annotations

import asyncio
import threading
import time
from typing import TYPE_CHECKING, Any

import pytest

from rotaris_core.permissions.engine import (
    Decision,
    PermissionDecision,
    PermissionRequest,
)
from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier import runner as runner_module
from rotaris_core.verifier.change_detection import WorkspaceChangeSignal
from rotaris_core.verifier.runner import (
    MAX_EXCERPT_CHARS,
    VerifierRunControl,
    run_check_suite,
)
from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite

if TYPE_CHECKING:
    from pathlib import Path

CHANGED = WorkspaceChangeSignal(changed=True, reason="edited", sources=("tool:write_file",))
UNCHANGED = WorkspaceChangeSignal(changed=False, reason="Nothing was modified.")


class FakeObservation:
    """Minimal duck-typed stand-in for ``HardenedTerminalObservation``."""

    def __init__(
        self,
        command: str,
        *,
        exit_code: int | None = 0,
        text: str = "",
        failure_kind: str | None = None,
    ) -> None:
        self.command = command
        self.exit_code = exit_code
        self.text = text
        self.failure_kind = failure_kind


class FakeExecutor:
    """Records the commands it was asked to run and replays queued observations."""

    def __init__(self, observations: dict[str, FakeObservation] | None = None) -> None:
        self.commands: list[str] = []
        self.timeouts: list[float | None] = []
        self._observations = observations or {}
        self.cleaned_up = False

    def __call__(self, action: Any) -> FakeObservation:
        self.commands.append(action.command)
        self.timeouts.append(action.timeout)
        return self._observations.get(action.command, FakeObservation(action.command))

    def cleanup(self) -> None:
        self.cleaned_up = True


class PerCommandEngine:
    """Permission engine stub with a per-command verdict."""

    def __init__(self, verdicts: dict[str, Decision]) -> None:
        self._verdicts = verdicts
        self.requests: list[PermissionRequest] = []

    def resolve(self, request: PermissionRequest) -> PermissionDecision:
        self.requests.append(request)
        return PermissionDecision(
            decision=self._verdicts[str(request.command)],
            rule_id="test-rule",
            reason="Destructive command.",
        )


def _suite(*checks: ResolvedCheck, source: str = "config") -> ResolvedCheckSuite:
    return ResolvedCheckSuite(checks=list(checks), source=source)  # type: ignore[arg-type]


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_checks_run_sequentially_in_configured_order(tmp_path: Path) -> None:
    executor = FakeExecutor()
    suite = _suite(
        ResolvedCheck(name="pytest", command="pytest -q", timeout=900),
        ResolvedCheck(name="mypy", command="mypy .", timeout=300),
        ResolvedCheck(name="ruff", command="ruff check .", severity="advisory"),
    )

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert executor.commands == ["pytest -q", "mypy .", "ruff check ."]
    assert executor.timeouts == [900.0, 300.0, 600.0]
    assert [item.name for item in result.results] == ["pytest", "mypy", "ruff"]
    assert executor.cleaned_up is True


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_a_check_result_carries_name_command_status_and_duration(tmp_path: Path) -> None:
    executor = FakeExecutor({"pytest -q": FakeObservation("pytest -q", text="3 passed")})
    suite = _suite(ResolvedCheck(name="pytest", command="pytest -q"))

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    check = result.results[0]
    assert result.executed is True
    assert result.suite_source == "config"
    assert (check.name, check.command, check.severity) == ("pytest", "pytest -q", "blocking")
    assert check.status == "passed"
    assert check.exit_code == 0
    assert check.duration_s >= 0.0
    assert check.output_excerpt == "3 passed"
    assert result.blocking_failures == []


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_a_non_zero_exit_is_reported_as_a_blocking_failure(tmp_path: Path) -> None:
    executor = FakeExecutor(
        {"pytest -q": FakeObservation("pytest -q", exit_code=1, text="1 failed")},
    )
    suite = _suite(ResolvedCheck(name="pytest", command="pytest -q"))

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert result.results[0].status == "failed"
    assert result.results[0].exit_code == 1
    assert [item.name for item in result.blocking_failures] == ["pytest"]
    assert result.passed is False


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_a_timed_out_check_is_reported_as_timeout(tmp_path: Path) -> None:
    executor = FakeExecutor(
        {"pytest -q": FakeObservation("pytest -q", exit_code=-1, failure_kind="timeout")},
    )
    suite = _suite(ResolvedCheck(name="pytest", command="pytest -q"))

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert result.results[0].status == "timeout"
    assert result.results[0].outcome_kind == "timeout"


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_a_command_exiting_zero_with_failing_output_is_not_reported_as_passed(
    tmp_path: Path,
) -> None:
    # The false-completion class this epic exists to catch: exit 0, failing output.
    executor = FakeExecutor(
        {
            "pytest -q | tee log": FakeObservation(
                "pytest -q | tee log",
                exit_code=0,
                text="==== 2 failed, 1 passed ====",
            ),
        },
    )
    suite = _suite(ResolvedCheck(name="pytest", command="pytest -q | tee log"))

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert result.results[0].status == "failed"
    assert result.results[0].outcome_kind == "suspicious_success"
    assert result.results[0].warnings


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_an_unchanged_iteration_skips_the_suite_with_a_recorded_reason(
    tmp_path: Path,
) -> None:
    executor = FakeExecutor()
    suite = _suite(ResolvedCheck(name="pytest", command="pytest -q"))

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=UNCHANGED,
        executor_factory=lambda: executor,
    )

    assert result.executed is False
    assert result.skip_reason == "Nothing was modified."
    assert result.results == []
    assert executor.commands == []


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_an_explicit_empty_suite_is_distinguishable_from_a_failed_detection(
    tmp_path: Path,
) -> None:
    explicit = await run_check_suite(
        _suite(source="explicit_empty"),
        workspace_root=tmp_path,
        change=CHANGED,
    )
    undetected = await run_check_suite(
        _suite(source="detection_empty"),
        workspace_root=tmp_path,
        change=CHANGED,
    )

    assert explicit.executed is False
    assert undetected.executed is False
    assert explicit.skip_reason != undetected.skip_reason
    assert "explicitly declares no verification" in str(explicit.skip_reason)
    assert "no workspace marker was recognized" in str(undetected.skip_reason)


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_a_denied_command_is_recorded_as_skipped_and_never_executed(
    tmp_path: Path,
) -> None:
    executor = FakeExecutor()
    engine = PerCommandEngine({"pytest -q": Decision.ALLOW, "rm -rf /": Decision.DENY})
    suite = _suite(
        ResolvedCheck(name="pytest", command="pytest -q"),
        ResolvedCheck(name="danger", command="rm -rf /"),
    )

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        permission_engine=engine,  # type: ignore[arg-type]
        executor_factory=lambda: executor,
    )

    assert executor.commands == ["pytest -q"]
    assert result.results[1].status == "skipped"
    assert "Destructive command." in str(result.results[1].skip_reason)
    # A denied check must never count as a pass, but it is not a failure either.
    assert result.blocking_failures == []
    assert [request.tool_name for request in engine.requests] == ["terminal", "terminal"]


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_the_full_output_is_referenced_by_path_and_the_excerpt_is_bounded(
    tmp_path: Path,
) -> None:
    huge = "x" * (MAX_EXCERPT_CHARS * 3)
    executor = FakeExecutor({"pytest -q": FakeObservation("pytest -q", text=huge)})
    evidence_dir = tmp_path / "evidence" / "verifier"
    suite = _suite(ResolvedCheck(name="pytest", command="pytest -q"))

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        evidence_dir=evidence_dir,
        executor_factory=lambda: executor,
    )

    check = result.results[0]
    assert len(check.output_excerpt) < len(huge)
    assert "characters omitted" in check.output_excerpt
    assert check.output_log_path is not None
    from pathlib import Path as _Path

    assert huge in _Path(check.output_log_path).read_text(encoding="utf-8")


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_an_executor_failure_is_reported_as_a_failed_check(tmp_path: Path) -> None:
    class BrokenExecutor:
        def __call__(self, action: Any) -> Any:
            raise RuntimeError("terminal is gone")

    suite = _suite(ResolvedCheck(name="pytest", command="pytest -q"))

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=BrokenExecutor,
    )

    assert result.executed is True
    assert result.results[0].status == "failed"
    assert "terminal is gone" in result.results[0].output_excerpt


@verifies(SWR.SWR_2602)
@pytest.mark.asyncio
async def test_an_advisory_failure_never_blocks(tmp_path: Path) -> None:
    executor = FakeExecutor(
        {"ruff check .": FakeObservation("ruff check .", exit_code=1, text="1 error")},
    )
    suite = _suite(ResolvedCheck(name="ruff", command="ruff check .", severity="advisory"))

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert result.results[0].status == "failed"
    assert result.blocking_failures == []
    assert result.passed is True


class RecordingProgress:
    """Captures the runner's progress calls in the order they arrive."""

    def __init__(self) -> None:
        self.events: list[tuple[str, str, int, int]] = []
        self.deadlines: list[float] = []

    def on_check_start(self, check: Any, index: int, total: int, deadline_s: float) -> None:
        self.events.append(("start", check.name, index, total))
        self.deadlines.append(deadline_s)

    def on_check_finish(self, result: Any, index: int, total: int) -> None:
        self.events.append(("finish", result.name, index, total))


@verifies(SWR.SWR_2609, SWR.SWR_2611)
@pytest.mark.asyncio
async def test_each_check_is_reported_as_it_starts_and_as_it_settles(tmp_path: Path) -> None:
    """A user watching a long suite sees the check that is running, not silence."""
    progress = RecordingProgress()
    suite = _suite(
        ResolvedCheck(name="ruff", command="ruff check .", severity="advisory"),
        ResolvedCheck(name="pytest", command="pytest -q"),
    )

    await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=FakeExecutor,
        progress=progress,
    )

    assert progress.events == [
        ("start", "ruff", 1, 2),
        ("finish", "ruff", 1, 2),
        ("start", "pytest", 2, 2),
        ("finish", "pytest", 2, 2),
    ]


@verifies(SWR.SWR_2611)
@pytest.mark.asyncio
async def test_a_progress_hook_that_raises_cannot_fail_the_suite(tmp_path: Path) -> None:
    """Progress reporting is a view of the run; it may never change its verdict."""

    class BrokenProgress:
        def on_check_start(self, check: Any, index: int, total: int, deadline_s: float) -> None:
            raise RuntimeError("host observer is broken")

        def on_check_finish(self, result: Any, index: int, total: int) -> None:
            raise RuntimeError("host observer is broken")

    suite = _suite(ResolvedCheck(name="pytest", command="pytest -q"))

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=FakeExecutor,
        progress=BrokenProgress(),
    )

    assert [item.status for item in result.results] == ["passed"]
    assert result.passed is True


@verifies(SWR.SWR_2608)
@pytest.mark.asyncio
async def test_a_check_may_not_be_given_more_time_than_the_suite_budget_has_left(
    tmp_path: Path,
) -> None:
    """A 600s check with a 120s suite budget runs for 120s, not for 600s."""
    executor = FakeExecutor()
    suite = ResolvedCheckSuite(
        checks=[ResolvedCheck(name="pytest", command="pytest -q", timeout=600)],
        source="config",
        suite_timeout=120,
    )

    await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert executor.timeouts[0] is not None
    assert executor.timeouts[0] <= 120.0


@verifies(SWR.SWR_2608)
@pytest.mark.asyncio
async def test_checks_beyond_an_exhausted_budget_are_skipped_and_never_launched(
    tmp_path: Path,
) -> None:
    """The budget bounds the suite: what it leaves no room for is recorded, not run."""
    executor = FakeExecutor()
    suite = ResolvedCheckSuite(
        checks=[
            ResolvedCheck(name="pytest", command="pytest -q"),
            ResolvedCheck(name="mypy", command="mypy ."),
        ],
        source="config",
        # Already spent by the time the first check returns, so the second one
        # must never reach the executor.
        suite_timeout=1,
    )

    def _spend_the_budget(action: Any) -> FakeObservation:
        executor.commands.append(action.command)
        executor.timeouts.append(action.timeout)
        time.sleep(1.05)
        return FakeObservation(action.command)

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: _spend_the_budget,
    )

    assert executor.commands == ["pytest -q"]
    mypy_result = result.results[1]
    assert mypy_result.status == "skipped"
    assert mypy_result.outcome_kind == "budget_exhausted"
    assert "suite budget" in (mypy_result.skip_reason or "").lower()
    # A budget that ran out is not a verification failure — it must not re-queue.
    assert result.blocking_failures == []


@verifies(SWR.SWR_2610)
@pytest.mark.asyncio
async def test_a_user_skip_records_the_check_as_skipped_and_runs_the_next_one(
    tmp_path: Path,
) -> None:
    """A skipped check never reads as passed or failed, and the suite continues."""
    control = VerifierRunControl()
    executors: list[FakeExecutor] = []

    def _factory() -> Any:
        executor = FakeExecutor()
        executors.append(executor)

        def _run(action: Any) -> FakeObservation:
            executor.commands.append(action.command)
            executor.timeouts.append(action.timeout)
            if action.command == "pytest -q":
                # Stands in for the user pressing Skip while pytest is blocked.
                control.skip_current()
                return FakeObservation(action.command, exit_code=1, text="terminated")
            return FakeObservation(action.command)

        return _run

    suite = _suite(
        ResolvedCheck(name="pytest", command="pytest -q"),
        ResolvedCheck(name="ruff", command="ruff check .", severity="advisory"),
    )

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=_factory,
        control=control,
    )

    skipped, ruff = result.results
    assert skipped.status == "skipped"
    assert skipped.outcome_kind == "user_skipped"
    assert "skipped by the user" in (skipped.skip_reason or "").lower()
    assert ruff.status == "passed"
    assert result.blocking_failures == []
    # The check stopped on its own, so its terminal is healthy and gets reused.
    assert len(executors) == 1


class BlockingExecutor:
    """Stands in for a terminal whose command is still running.

    ``__call__`` blocks exactly like ``TerminalSession.execute``'s poll loop
    does, and only an ``interrupt()`` the command honours releases it.
    """

    def __init__(self, *, honours_interrupt: bool) -> None:
        self.commands: list[str] = []
        self.interrupts = 0
        self.cleaned_up = False
        self._honours_interrupt = honours_interrupt
        self._released = threading.Event()

    def __call__(self, action: Any) -> FakeObservation:
        self.commands.append(action.command)
        if action.command == "pytest -q":
            # Bounded so a regression fails the test instead of hanging it.
            self._released.wait(timeout=10.0)
            return FakeObservation(action.command, exit_code=130, text="^C")
        return FakeObservation(action.command)

    def interrupt(self) -> None:
        self.interrupts += 1
        if self._honours_interrupt:
            self._released.set()

    def cleanup(self) -> None:
        # Deliberately does *not* release the blocked call: tearing the terminal
        # down kills the command's process tree but leaves the poll loop reading
        # a dead screen until its own timeout. That is the bug this guards.
        self.cleaned_up = True


async def _skip_once_running(control: VerifierRunControl, executor: BlockingExecutor) -> None:
    """Press Skip as soon as the blocking check has actually started."""
    while not executor.commands:
        await asyncio.sleep(0.01)
    control.skip_current()


@verifies(SWR.SWR_2610)
@pytest.mark.asyncio
async def test_a_skip_interrupts_the_running_command_instead_of_waiting_it_out(
    tmp_path: Path,
) -> None:
    """Skip stops a check that is still blocked, well inside its timeout."""
    control = VerifierRunControl()
    executors: list[BlockingExecutor] = []

    def _factory() -> Any:
        executor = BlockingExecutor(honours_interrupt=True)
        executors.append(executor)
        return executor

    suite = _suite(
        ResolvedCheck(name="pytest", command="pytest -q", timeout=600),
        ResolvedCheck(name="ruff", command="ruff check .", severity="advisory"),
    )

    started = time.monotonic()
    run = asyncio.ensure_future(
        run_check_suite(
            suite,
            workspace_root=tmp_path,
            change=CHANGED,
            executor_factory=_factory,
            control=control,
        )
    )
    while not executors:
        await asyncio.sleep(0.01)
    await _skip_once_running(control, executors[0])
    result = await asyncio.wait_for(run, timeout=10.0)
    elapsed = time.monotonic() - started

    skipped, ruff = result.results
    assert skipped.status == "skipped"
    assert skipped.outcome_kind == "user_skipped"
    # The interrupt, not the 600s timeout, is what ended the check.
    assert executors[0].interrupts == 1
    assert elapsed < 5.0
    assert ruff.status == "passed"
    # A command that stopped on its interrupt leaves a usable terminal behind.
    assert len(executors) == 1
    assert executors[0].commands == ["pytest -q", "ruff check ."]


@verifies(SWR.SWR_2610)
@pytest.mark.asyncio
async def test_a_skipped_check_that_ignores_the_interrupt_is_abandoned(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A command that traps the interrupt still cannot hold the run hostage."""
    monkeypatch.setattr(runner_module, "_SKIP_GRACE_S", 0.2)
    control = VerifierRunControl()
    executors: list[BlockingExecutor] = []

    def _factory() -> Any:
        executor = BlockingExecutor(honours_interrupt=False)
        executors.append(executor)
        return executor

    suite = _suite(
        ResolvedCheck(name="pytest", command="pytest -q", timeout=600),
        ResolvedCheck(name="ruff", command="ruff check .", severity="advisory"),
    )

    started = time.monotonic()
    run = asyncio.ensure_future(
        run_check_suite(
            suite,
            workspace_root=tmp_path,
            change=CHANGED,
            executor_factory=_factory,
            control=control,
        )
    )
    while not executors:
        await asyncio.sleep(0.01)
    await _skip_once_running(control, executors[0])
    result = await asyncio.wait_for(run, timeout=10.0)
    elapsed = time.monotonic() - started

    skipped, ruff = result.results
    assert skipped.status == "skipped"
    assert skipped.outcome_kind == "user_skipped"
    assert "skipped by the user" in (skipped.skip_reason or "").lower()
    # Settled on the grace period, not on the check's 600s timeout.
    assert elapsed < 5.0
    # The terminal was burnt down with the command still attached to it, so the
    # next check must run on a fresh one — and it still runs.
    assert executors[0].cleaned_up is True
    assert len(executors) == 2
    assert executors[1].commands == ["ruff check ."]
    assert ruff.status == "passed"
    assert result.blocking_failures == []


@verifies(SWR.SWR_2610)
def test_a_skip_with_no_suite_in_flight_does_nothing() -> None:
    """The control is safe to hold and press between runs."""
    control = VerifierRunControl()

    assert control.skip_current() is False
    assert control.skip_requested is False


# -- falling back when the chosen command cannot start (SWR-2620) -----------


@verifies(SWR.SWR_2620)
@pytest.mark.asyncio
async def test_a_command_that_cannot_start_falls_back_to_its_alternative(
    tmp_path: Path,
) -> None:
    """Productive use: the project's Makefile target on a host without `make`.

    This is what makes preferring the project's own command safe. The declared
    command is tried first because only the project knows its real scope; a host
    that cannot run it is not left unverified.
    """
    executor = FakeExecutor(
        {
            "make test": FakeObservation(
                "make test", exit_code=127, text="make: command not found"
            ),
            "pytest -q": FakeObservation("pytest -q", text="12 passed"),
        },
    )
    suite = _suite(
        ResolvedCheck(
            name="make:test",
            command="make test",
            origin="declared",
            alternatives=(ResolvedCheck(name="pytest", command="pytest -q"),),
        ),
    )

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert executor.commands == ["make test", "pytest -q"]
    check = result.results[0]
    assert check.status == "passed"
    assert check.command == "pytest -q"
    # The user is told they were verified by their second choice.
    assert any("could not start" in warning for warning in check.warnings)


@verifies(SWR.SWR_2620)
@pytest.mark.asyncio
async def test_a_command_that_runs_and_fails_is_never_retried_with_another(
    tmp_path: Path,
) -> None:
    """The safety property. A red suite is an answer, not a reason to shop around.

    Falling back here would let any project with two ways of running its tests
    pass its gate by finding the greener one.
    """
    executor = FakeExecutor(
        {
            "make test": FakeObservation("make test", exit_code=1, text="2 failed, 10 passed"),
            "pytest -q": FakeObservation("pytest -q", text="12 passed"),
        },
    )
    suite = _suite(
        ResolvedCheck(
            name="make:test",
            command="make test",
            origin="declared",
            alternatives=(ResolvedCheck(name="pytest", command="pytest -q"),),
        ),
    )

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert executor.commands == ["make test"]
    assert result.results[0].status == "failed"
    assert result.results[0].command == "make test"


@verifies(SWR.SWR_2620)
@pytest.mark.asyncio
async def test_a_missing_make_target_counts_as_could_not_start(tmp_path: Path) -> None:
    """`make` exists, the target does not — the exit code alone cannot tell."""
    executor = FakeExecutor(
        {
            "make test": FakeObservation(
                "make test",
                exit_code=2,
                text="make: *** No rule to make target 'test'.  Stop.",
            ),
            "pytest -q": FakeObservation("pytest -q", text="ok"),
        },
    )
    suite = _suite(
        ResolvedCheck(
            name="make:test",
            command="make test",
            origin="declared",
            alternatives=(ResolvedCheck(name="pytest", command="pytest -q"),),
        ),
    )

    result = await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert executor.commands == ["make test", "pytest -q"]
    assert result.results[0].status == "passed"


# -- a budget learned from what the check costs (SWR-2621) -----------------


@verifies(SWR.SWR_2621)
@pytest.mark.asyncio
async def test_a_first_run_uses_the_configured_timeouts_unchanged(tmp_path: Path) -> None:
    """A fresh workspace is not the place to invent a budget."""
    executor = FakeExecutor()
    suite = _suite(ResolvedCheck(name="pytest", command="pytest -q", timeout=600))

    await run_check_suite(
        suite,
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert executor.timeouts == [600.0]


@verifies(SWR.SWR_2621)
@pytest.mark.asyncio
async def test_a_check_that_outgrew_its_budget_is_given_room_next_time(
    tmp_path: Path,
) -> None:
    """Productive use: this repository's own suite, which takes ~430s serially.

    It was killed at 600s on every single pass — permanently, with no
    configuration change that would ever fix itself. Once a run of it has
    succeeded, the next one has room for what it actually costs.
    """
    from rotaris_core.verifier.timings import CheckTimings

    check = ResolvedCheck(name="pytest", command="pytest -q", timeout=600)
    remembered = CheckTimings()
    remembered.record(
        check,
        runner_module.CheckResult(
            name="pytest",
            command="pytest -q",
            status="passed",
            duration_s=430.0,
        ),
    )
    remembered.save(tmp_path)

    executor = FakeExecutor()
    await run_check_suite(
        _suite(check),
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert executor.timeouts[0] > 600.0
    # …and the suite budget moved with it, or the per-check raise would be
    # clamped straight back by SWR-2608's "lesser of the two" rule.
    assert executor.timeouts[0] == 861.0


@verifies(SWR.SWR_2621)
def test_a_learned_duration_raises_the_suite_budget_by_exactly_its_excess() -> None:
    """The budget must not become the sum of the per-check ceilings.

    That would make `suite_timeout` incapable of bounding anything — every check
    would always be free to run to its own limit, which is the unbounded suite
    SWR-2608 exists to prevent.
    """
    from rotaris_core.verifier.timings import CheckTimings, effective_suite_timeout

    checks = [
        ResolvedCheck(name="pytest", command="pytest -q", timeout=600),
        ResolvedCheck(name="mypy", command="mypy .", timeout=300),
    ]

    # Nothing learned: the configured budget stands, untouched.
    assert effective_suite_timeout(checks, 900, CheckTimings()) == 900

    learned = CheckTimings({})
    learned.record(
        checks[0],
        runner_module.CheckResult(
            name="pytest",
            command="pytest -q",
            status="passed",
            duration_s=430.0,
        ),
    )
    # 861 - 600 = 261 of excess, and not a jot more.
    assert effective_suite_timeout(checks, 900, learned) == 1161
    assert effective_suite_timeout(checks, None, learned) is None


@verifies(SWR.SWR_2621)
@pytest.mark.asyncio
async def test_only_a_success_is_remembered_as_what_a_check_costs(tmp_path: Path) -> None:
    """A failure says how long we waited, not what the check costs."""
    from rotaris_core.verifier.timings import CheckTimings

    check = ResolvedCheck(name="pytest", command="pytest -q")
    executor = FakeExecutor(
        {"pytest -q": FakeObservation("pytest -q", exit_code=1, text="1 failed")},
    )

    await run_check_suite(
        _suite(check),
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert CheckTimings.load(tmp_path).duration_of(check) is None


@verifies(SWR.SWR_2621, SWR.SWR_2606)
@pytest.mark.asyncio
async def test_a_killed_check_states_the_budget_as_the_finding(tmp_path: Path) -> None:
    """Productive use: the run that emptied a board.

    Under SWR-2606 the requirements a killed check reached read `result-unknown`,
    which is honest and silent. This is the sentence that says why.
    """
    executor = FakeExecutor(
        {
            "pytest -q": FakeObservation(
                "pytest -q",
                exit_code=None,
                text="timed out",
                failure_kind="timeout",
            ),
        },
    )

    result = await run_check_suite(
        _suite(ResolvedCheck(name="pytest", command="pytest -q")),
        workspace_root=tmp_path,
        change=CHANGED,
        executor_factory=lambda: executor,
    )

    assert result.results[0].status == "timeout"
    assert len(result.notices) == 1
    assert "pytest was stopped" in result.notices[0]
    assert "budget" in result.notices[0]
