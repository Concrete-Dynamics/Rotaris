"""Post-change execution of the resolved check suite (SWR-2602).

SWR-2601 resolves *what* a workspace verifies with; this module runs it. The
suite executes after an iteration that modified workspace files
(:mod:`rotaris_core.verifier.change_detection`), sequentially and in configured
order, through the same :class:`~rotaris_core.tools.terminal.HardenedTerminalExecutor`
the agent-facing terminal tool uses — so timeout kill semantics, outcome
classification (``tools/terminal_outcome.py``) and, below it, sandboxing
(SWR-2507) all apply unchanged. The permission policy (SWR-2501) is consulted
per check, so a workspace whose policy forbids a command does not get that
command run behind the agent's back.

An iteration without file modifications skips the suite, and the skip plus its
reason are recorded rather than silently dropped.

A suite reports itself while it runs (SWR-2609/SWR-2611): callers pass a
``progress`` object to learn when each check starts and settles, and a
:class:`VerifierRunControl` to skip the check that is running (SWR-2610). The
whole run is bounded by the suite's budget (SWR-2608), so verification costs at
most one configured number per iteration however many checks the suite holds.

Nothing here decides completion: SWR-2603 carries these results into the child
report and SWR-2604 gates on them.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
import re
import threading
import time
from contextlib import suppress
from typing import TYPE_CHECKING, Any, Literal, Protocol, runtime_checkable

from pydantic import BaseModel, Field

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.tools.terminal_outcome import classify_terminal_observation
from rotaris_core.verifier.execution import (
    MAX_EXCERPT_CHARS,
    permission_denial,
)
from rotaris_core.verifier.execution import (
    cleanup_executor as _cleanup,
)
from rotaris_core.verifier.execution import (
    excerpt as _excerpt,
)
from rotaris_core.verifier.execution import (
    observation_text as _observation_text,
)
from rotaris_core.verifier.gate_state import (
    GateRecord,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.verifier.suite import (
    SuiteSource,  # noqa: TC001 - Pydantic resolves this at runtime.
)
from rotaris_core.verifier.test_results import (
    TestRunReport,  # noqa: TC001 - Pydantic resolves this at runtime.
    collect_test_report,
    rebased,
)

if TYPE_CHECKING:
    from collections.abc import Callable
    from pathlib import Path

    from rotaris_core.permissions.engine import PermissionEngine
    from rotaris_core.verifier.change_detection import WorkspaceChangeSignal
    from rotaris_core.verifier.gate_repair import GateRepairBudget
    from rotaris_core.verifier.suite import ResolvedCheck, ResolvedCheckSuite


_log = logging.getLogger(__name__)

#: What became of one check. ``invalid`` is a fact about the *gate*, not about
#: the code (SWR-2616): the command or its tool does not resolve, the script or
#: make target is gone, or the directory it names is not there. A renamed script
#: used to produce a non-zero exit indistinguishable from a real failure, which
#: gated the iteration and spent the SWR-2605 repair budget asking an agent to
#: fix code that was never broken.
CheckStatus = Literal["passed", "failed", "timeout", "skipped", "invalid"]

#: Persona name the verifier presents to the permission engine. Distinct from
#: any agent persona so a policy can address verifier commands specifically.
VERIFIER_PERSONA = "verifier"

#: How long a skipped check may keep running after it was interrupted before the
#: runner stops waiting for it (SWR-2610). A command that honours SIGINT returns
#: within a poll interval; one that traps it — or whose terminal has gone deaf —
#: must not hold the user hostage for the rest of the check's timeout.
_SKIP_GRACE_S = 5.0

#: ``MAX_EXCERPT_CHARS`` is re-exported: the bound moved to
#: :mod:`~rotaris_core.verifier.execution` when the probe pass started sharing it,
#: and callers that always reached it here still can.
__all__ = [
    "MAX_EXCERPT_CHARS",
    "VERIFIER_PERSONA",
    "CheckResult",
    "VerifierProgress",
    "VerifierRunControl",
    "VerifierRunResult",
    "budget_warning",
    "could_not_start",
    "run_check_suite",
]

_UNSAFE_NAME_RE = re.compile(r"[^A-Za-z0-9._-]+")

#: Exit codes a shell uses for "I could not run that at all": 127 is
#: command-not-found and 126 is found-but-not-executable. Both mean the check
#: never started, which is the only condition SWR-2620 falls back on.
_COULD_NOT_START_CODES = frozenset({126, 127})

#: What a runner says when the program exists but the *target* does not. Matched
#: on the output because the exit code for these is an ordinary failure code and
#: indistinguishable from a red suite without reading what it said.
_COULD_NOT_START_RE = re.compile(
    r"(?:"
    r"command not found"
    r"|No such file or directory"
    r"|no rule to make target"
    r"|missing separator"  # a Makefile too broken to run
    r"|is not recognized as an internal or external command"
    r"|Unknown task"  # just / task
    r"|npm error Missing script"
    r"|error: no such command"  # cargo
    r")",
    re.IGNORECASE,
)


@traces(SWR.SWR_2622)
def _runs_tests(result: CheckResult) -> bool:
    """Whether this check is one a per-test report could belong to.

    The same allow-list the evidence layer uses to decide what counts as having
    run a test, so a lint pass is not searched for a report it never writes —
    and, more importantly, so a report another check left behind is never
    attributed to one that runs no tests.
    """
    from rotaris_core.verifier.requirement_evidence import executed_test_runners  # noqa: PLC0415

    return bool(executed_test_runners([result]))


def _wall_clock() -> float:
    """``time.time`` behind a seam, so a test can pin it beside file mtimes.

    Deliberately not the monotonic clock this module times durations with: this
    number is compared against ``st_mtime``, and the two are different clocks.
    """
    return time.time()


@traces(SWR.SWR_2620)
def could_not_start(result: CheckResult) -> bool:
    """Whether *result* means the command never ran, as opposed to ran and failed.

    The whole safety of SWR-2620's fallback rests on this distinction. A check
    that starts and fails is a real answer about the project and must be reported;
    retrying it with a different command would turn a red gate into a search for a
    green one. A check that could not start says nothing about the project at all,
    and is the only case where trying the next candidate is honest.

    Kept deliberately narrow: a pattern that is not clearly "this did not run"
    belongs outside it, because the cost of a false positive here is a suite that
    silently verifies with the wrong command.
    """
    if result.status != "failed":
        return False
    if result.exit_code in _COULD_NOT_START_CODES:
        return True
    return bool(_COULD_NOT_START_RE.search(result.output_excerpt))


_SKIP_REASONS: dict[str, str] = {
    "explicit_empty": (
        "This workspace explicitly declares no verification (verifier.checks: []); nothing was run."
    ),
    "detection_empty": (
        "No check suite is configured and no workspace marker was recognized, so "
        "there was nothing to run. Configure verifier.checks to verify this workspace."
    ),
}


@traces(SWR.SWR_2602)
class CheckResult(BaseModel):
    """The outcome of one executed (or deliberately skipped) check."""

    name: str
    command: str
    severity: Literal["blocking", "advisory"] = "blocking"
    status: CheckStatus
    exit_code: int | None = None
    duration_s: float = 0.0
    #: Classification from ``tools/terminal_outcome.py``, kept so a downstream
    #: gate can distinguish e.g. a hard non-zero exit from a suspicious success.
    outcome_kind: str | None = None
    warnings: list[str] = Field(default_factory=list)
    #: Bounded head+tail of the command output.
    output_excerpt: str = ""
    #: Path to the full output, when an evidence directory was available.
    output_log_path: str | None = None
    #: Why this check did not run. Only set for ``skipped``.
    skip_reason: str | None = None
    #: Workspace-relative directory this check ran in; ``None`` is the root
    #: (SWR-2618). Recorded so a report can say which tree was verified, which a
    #: multi-project workspace cannot answer from the command alone.
    cwd: str | None = None
    #: The per-test results this check produced, when it produced any (SWR-2622).
    #: ``None`` is the ordinary case for a runner that emits no machine-readable
    #: report, and it degrades to the SWR-2606 floor rather than to a guess.
    report: TestRunReport | None = None


@traces(SWR.SWR_2602)
class VerifierRunResult(BaseModel):
    """One post-change verifier pass over the resolved suite."""

    #: False when the suite was not run at all; ``skip_reason`` then says why.
    executed: bool
    suite_source: SuiteSource
    skip_reason: str | None = None
    results: list[CheckResult] = Field(default_factory=list)
    duration_s: float = 0.0
    #: Facts about the *run* rather than about the code — a check stopped by its
    #: budget, most of all. A host surfaces these beside the results, because a
    #: killed check leaves its requirements reading ``result-unknown`` (SWR-2606)
    #: and nothing else in the pass says why (SWR-2621).
    notices: list[str] = Field(default_factory=list)
    #: The gate's state as this run left it (SWR-2612), including any probe
    #: verdicts it took. ``None`` when calibration did not run.
    gate: GateRecord | None = None
    #: Whether this run probed anything, as opposed to reusing verdicts it
    #: already had. What separates a timeline entry worth writing from a
    #: heartbeat (SWR-2613).
    probed: bool = False
    #: Why this workspace ran with no quality gate, or "" (SWR-2615). Rendered
    #: here rather than by each host: a sentence three hosts compose for
    #: themselves is a sentence three hosts eventually disagree about, and the
    #: desktop is explicitly not allowed to reach into the verifier to ask.
    gate_warning: str = ""

    @property
    def blocking_failures(self) -> list[CheckResult]:
        """Executed blocking checks that did not pass.

        ``invalid`` is deliberately absent: a check that could not be executed as
        a test of the code is a fact about the gate, and treating it as a failure
        is precisely what SWR-2616 exists to stop.
        """
        return [
            result
            for result in self.results
            if result.severity == "blocking" and result.status in {"failed", "timeout"}
        ]

    @property
    def invalid_checks(self) -> list[CheckResult]:
        """Checks that could not be executed as a test of the code (SWR-2616)."""
        return [result for result in self.results if result.status == "invalid"]

    @property
    def passed(self) -> bool:
        """Whether nothing blocking failed. A skipped run passes vacuously."""
        return not self.blocking_failures


@runtime_checkable
class VerifierProgress(Protocol):
    """What a host is told while a suite runs (SWR-2609).

    Both calls happen on the caller's event loop — the blocking work sits behind
    ``asyncio.to_thread`` — and both are invoked defensively by the runner, so an
    implementation that raises is logged and stepped over rather than failing
    the suite.
    """

    def on_check_start(
        self,
        check: ResolvedCheck,
        index: int,
        total: int,
        deadline_s: float,
    ) -> None:
        """A check is about to run.

        *index* is 1-based; *deadline_s* is the check's effective timeout after
        the suite budget has been applied, which is what a host should count
        down against rather than the configured per-check timeout.
        """

    def on_check_finish(self, result: CheckResult, index: int, total: int) -> None:
        """A check settled — passed, failed, timed out, or was skipped."""


@traces(SWR.SWR_2610, SWR.SWR_2611)
class VerifierRunControl:
    """A handle on the suite that is running, for a host that wants to steer it.

    Inert unless a suite has armed it: :meth:`skip_current` before the first
    check or after the last one changes nothing, so a host may hold the handle
    for as long as it likes without having to track whether a run is live.

    Thread-safety is deliberately minimal — the flag is a single boolean written
    by one host thread and read by the runner's loop, and Python's GIL makes that
    handoff atomic. The wake-up seam is the exception: the runner waits on an
    :class:`asyncio.Event` that only its own loop may touch, so the request is
    marshalled with ``call_soon_threadsafe``.

    Skipping interrupts the running command rather than tearing its terminal
    down. Killing the terminal is what the timeout path does, but it leaves the
    blocking poll loop reading a dead screen: it sees no new prompt, so it waits
    out the whole check timeout. An interrupt returns the shell to a prompt,
    which is exactly the signal that loop is waiting for. Forced teardown remains
    the escalation for a command that ignores the interrupt, and it is
    :func:`_run_one_check` that applies it, once it has stopped waiting.
    """

    def __init__(self) -> None:
        self._skip_requested = False
        self._abandoned = False
        self._executor: Any | None = None
        self._skipped: asyncio.Event | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    @property
    def skip_requested(self) -> bool:
        """Whether a skip is pending for the check currently running."""
        return self._skip_requested

    @property
    def skip_signal(self) -> asyncio.Event | None:
        """The event the runner waits on, or ``None`` when nothing armed one."""
        return self._skipped

    @property
    def abandoned(self) -> bool:
        """Whether the running check outlived its skip and was walked away from.

        The terminal of an abandoned check is unusable — its command is still
        attached to it — so the suite must build a fresh one for the next check.
        """
        return self._abandoned

    def arm(
        self,
        executor: Any | None,
        *,
        skipped: asyncio.Event | None = None,
        loop: asyncio.AbstractEventLoop | None = None,
    ) -> None:
        """Point the control at the executor running the current check."""
        self._executor = executor
        self._skipped = skipped
        self._loop = loop

    def disarm(self) -> None:
        """Detach from the finished check and forget any unconsumed request."""
        self._executor = None
        self._skipped = None
        self._loop = None
        self._skip_requested = False
        self._abandoned = False

    def abandon(self) -> None:
        """Record that the skipped check was left running and its terminal burnt."""
        self._abandoned = True

    @traces(SWR.SWR_2610)
    def skip_current(self) -> bool:
        """Stop the running check. Returns whether anything was skipped.

        Sends the interrupt the terminal backend offers — Ctrl+C for tmux,
        ``SIGINT`` to the process group for a subprocess PTY — and wakes the
        runner, which stops waiting for the check either way once
        :data:`_SKIP_GRACE_S` has passed. The observation that comes back (if one
        does) is reclassified as ``skipped`` because this flag is set.

        Safe to call from any thread: the boolean is a single write and the event
        is set on the runner's own loop.
        """
        executor = self._executor
        if executor is None:
            return False
        self._skip_requested = True
        _interrupt(executor)
        self._wake()
        return True

    def _wake(self) -> None:
        """Tell the runner a skip is pending, from whichever thread asked."""
        event = self._skipped
        loop = self._loop
        if event is None:
            return
        if loop is None:
            event.set()
            return
        with suppress(RuntimeError):
            loop.call_soon_threadsafe(event.set)


@traces(SWR.SWR_2602, SWR.SWR_2608, SWR.SWR_2609, SWR.SWR_2611)
async def run_check_suite(
    suite: ResolvedCheckSuite,
    *,
    workspace_root: Path,
    change: WorkspaceChangeSignal,
    permission_engine: PermissionEngine | None = None,
    persona: str = VERIFIER_PERSONA,
    evidence_dir: Path | None = None,
    executor_factory: Callable[[], Any] | None = None,
    progress: VerifierProgress | None = None,
    control: VerifierRunControl | None = None,
    calibrate: bool = False,
    gate_repair: GateRepairBudget | None = None,
) -> VerifierRunResult:
    """Run *suite* against *workspace_root* when *change* says files moved.

    Checks run sequentially in configured order; each yields a
    :class:`CheckResult`. Never raises — a broken executor degrades to a failed
    check result, because the verifier must not be able to abort an iteration.

    *progress* is told about each check as it starts and settles (SWR-2609), and
    *control* can skip the one that is running (SWR-2610). The suite's
    ``suite_timeout`` bounds the whole run (SWR-2608): a check may not be given
    more time than the budget has left, and once the budget is spent the
    remaining checks are recorded as skipped instead of being launched.

    Probe verdicts already recorded for this workspace are **always** applied
    (SWR-2613): a check the workspace has been shown not to resolve does not run,
    and one shown to collect nothing runs advisory. That costs nothing — it is a
    file read and a severity rewrite.

    Taking *new* verdicts is opt-in through *calibrate*, because it executes
    commands and only one caller owns the gate's lifecycle. The loop passes
    ``True``; a requirement-verification pass handed an already-bound suite passes
    nothing and reuses what the loop learned.
    """
    if not change.changed:
        return VerifierRunResult(
            executed=False,
            suite_source=suite.source,
            skip_reason=change.reason,
        )
    if not suite.checks:
        return VerifierRunResult(
            executed=False,
            suite_source=suite.source,
            skip_reason=_SKIP_REASONS.get(
                suite.source,
                "The resolved check suite is empty; nothing was run.",
            ),
        )

    from rotaris_core.verifier.timings import (
        CheckTimings,
        effective_check_timeout,
        effective_suite_timeout,
    )

    started = time.monotonic()
    results: list[CheckResult] = []
    # SWR-2618: one terminal per directory the suite verifies in, built on first
    # use and reused by every check that shares it. A workspace holding several
    # projects therefore costs one terminal per project, not one per check.
    executors: dict[str, Any] = {}

    def executor_for(where: str) -> Any:
        existing = executors.get(where)
        if existing is not None:
            return existing
        if executor_factory is not None:
            # An injected factory takes no directory: it is a test double or a
            # caller that has already decided where commands run. Asking it once
            # per directory is the honest translation.
            created = executor_factory()
        else:
            created = _new_executor(workspace_root / where if where else workspace_root)
        executors[where] = created
        return created

    # SWR-2613: nothing binds unprobed. Probing lives here because this is the
    # only place holding a terminal seam, and it shares the very terminals the
    # suite is about to use — so a caller that injected an executor gets its
    # double for the probes too, and a workspace whose verdicts are still current
    # opens nothing at all. Probing must not block a run, so a pass that cannot
    # finish leaves the suite exactly as it was.
    gate, probed = (
        _calibrate(suite, workspace_root, executor_for, permission_engine, persona)
        if calibrate
        else (_recorded_gate(workspace_root), False)
    )
    if gate is not None:
        suite = _bound(suite, gate)
        if not suite.checks:
            for spent in executors.values():
                _cleanup(spent)
            return VerifierRunResult(
                executed=False,
                suite_source=suite.source,
                skip_reason=(
                    "No check in the resolved suite resolves in this workspace, so "
                    "there was nothing to run: calibration found every command "
                    "unavailable here (SWR-2613). This is reported rather than "
                    "passed — an empty suite passes vacuously, and that is exactly "
                    "how an unverifiable workspace used to read as a clean one."
                ),
                gate=gate,
                probed=probed,
                gate_warning=_gate_warning(gate),
            )

    total = len(suite.checks)
    # SWR-2621: what these checks have cost here before decides how long they are
    # allowed to take now. An absent memory yields the configured constants
    # unchanged, so a first run in a fresh workspace behaves exactly as before.
    timings = CheckTimings.load(workspace_root)
    budget = effective_suite_timeout(list(suite.checks), suite.suite_timeout, timings)
    try:
        for index, check in enumerate(suite.checks, start=1):
            denial = _permission_skip(check, permission_engine, persona)
            if denial is not None:
                results.append(denial)
                _notify(progress, "on_check_finish", denial, index, total)
                continue

            allowed = check.model_copy(
                update={"timeout": effective_check_timeout(check, timings)},
            )
            deadline = _effective_timeout(allowed, budget, started)
            if deadline is None:
                exhausted = _budget_skip(check, budget)
                results.append(exhausted)
                _notify(progress, "on_check_finish", exhausted, index, total)
                continue

            where = check.cwd or ""
            if where and not (workspace_root / where).is_dir():
                # A sub-project that moved is gate drift, not a code failure
                # (SWR-2616/SWR-2618): running the command at the root would
                # verify the wrong tree, and reporting a failure would blame the
                # code for a directory nobody's change removed.
                missing = _missing_directory(check, where)
                results.append(missing)
                _notify(progress, "on_check_finish", missing, index, total)
                continue
            executor = executor_for(where)
            _notify(progress, "on_check_start", check, index, total, deadline)
            if control is not None:
                control.arm(
                    executor,
                    skipped=asyncio.Event(),
                    loop=asyncio.get_running_loop(),
                )
            burnt = False
            # Wall-clock, not the monotonic clock: it is compared against file
            # mtimes when looking for the report this check wrote.
            check_started = _wall_clock()
            try:
                result = await _run_one_check(check, executor, evidence_dir, deadline, control)
                burnt = control is not None and control.abandoned
                # SWR-2620: the project's own command is preferred, and this is
                # what makes preferring it safe. Only a command that never *ran*
                # is retried; one that ran and failed is the answer.
                for alternative in check.alternatives:
                    if burnt or not could_not_start(result):
                        break
                    _log.info(
                        "Verifier check %r could not start; falling back to %r",
                        check.command,
                        alternative.command,
                    )
                    result = await _run_one_check(
                        alternative,
                        executor,
                        evidence_dir,
                        deadline,
                        control,
                    )
                    result = result.model_copy(
                        update={
                            "warnings": [
                                *result.warnings,
                                f"{check.command!r} could not start; ran {alternative.command!r}",
                            ],
                        },
                    )
                    burnt = control is not None and control.abandoned
                if could_not_start(result):
                    # Every candidate for this role failed to start. That says
                    # nothing about the code and must not be reported as if it
                    # did (SWR-2616).
                    result = _invalid(result)
                    repair = await _repair_gate(
                        check,
                        workspace_root,
                        executor,
                        gate_repair,
                        engine=permission_engine,
                        persona=persona,
                    )
                    if repair.replacement is not None:
                        result = await _run_one_check(
                            repair.replacement,
                            executor,
                            evidence_dir,
                            deadline,
                            control,
                        )
                        burnt = control is not None and control.abandoned
                    result = result.model_copy(
                        update={"warnings": [*result.warnings, repair.note]},
                    )
            finally:
                if control is not None:
                    control.disarm()
            # SWR-2622: whatever per-test report this check already wrote. Read
            # after the check settles and bounded to artefacts written during its
            # own run, so a stale one cannot be mistaken for this run's evidence.
            # Only checks that plausibly ran tests are looked at — a lint pass
            # writes no report, and scanning for one is pure cost.
            if _runs_tests(result):
                report = collect_test_report(
                    workspace_root / where if where else workspace_root,
                    result.command,
                    check_name=result.name,
                    written_after=check_started,
                )
                if report is not None:
                    # SWR-2618: the report's paths are relative to the directory
                    # the check ran in; every covering-test site it will be
                    # matched against is relative to the workspace.
                    result = result.model_copy(update={"report": rebased(report, where)})

            result = result.model_copy(update={"cwd": check.cwd})
            warning = budget_warning(result, budget)
            if warning:
                result = result.model_copy(
                    update={"warnings": [*result.warnings, warning]},
                )
            results.append(result)
            timings.record(allowed, result)
            _notify(progress, "on_check_finish", result, index, total)
            if burnt:
                # The skipped command outlived its grace period, so its terminal
                # was torn down with the command still attached to it; the next
                # check in that directory needs a live one. A check that stopped
                # on the interrupt left its terminal at a healthy prompt, so that
                # one is reused.
                _cleanup(executors.pop(where, None))
    except Exception:  # noqa: BLE001 - the verifier must never break an iteration
        _log.exception("Verifier run failed; reporting the checks completed so far.")
    finally:
        for spent in executors.values():
            _cleanup(spent)
        timings.save(workspace_root)

    return VerifierRunResult(
        executed=True,
        suite_source=suite.source,
        results=results,
        duration_s=round(time.monotonic() - started, 3),
        gate=gate,
        probed=probed,
        gate_warning=_gate_warning(gate),
        notices=[
            warning for warning in (budget_warning(result, budget) for result in results) if warning
        ],
    )


@traces(SWR.SWR_2613, SWR.SWR_2612)
def _calibrate(
    suite: ResolvedCheckSuite,
    workspace_root: Path,
    executor_for: Callable[[str], Any],
    permission_engine: PermissionEngine | None,
    persona: str,
) -> tuple[GateRecord | None, bool]:
    """Probe whatever has no current verdict, persist the result, and report it.

    Returns the record and whether anything was actually probed. Never raises:
    calibration must not be able to change — or stop — a run by failing.
    """
    from rotaris_core.verifier.calibration import calibrate  # noqa: PLC0415
    from rotaris_core.verifier.execution import CommandRunner  # noqa: PLC0415
    from rotaris_core.verifier.gate_state import (  # noqa: PLC0415
        load_gate_record,
        save_gate_record,
        workspace_fingerprint,
    )

    try:
        fingerprint = workspace_fingerprint(workspace_root)

        def runner_for(directory: Path) -> Callable[[str], tuple[int, str]]:
            where = ""
            with suppress(ValueError):
                relative = directory.relative_to(workspace_root).as_posix()
                where = "" if relative == "." else relative
            return CommandRunner(
                directory,
                timeout=float(suite.probe_timeout),
                executor=executor_for(where),
            )

        outcome = calibrate(
            suite,
            workspace_root,
            load_gate_record(workspace_root),
            fingerprint=fingerprint,
            engine=permission_engine,
            persona=persona,
            timeout=suite.probe_timeout,
            runner_factory=runner_for,
        )
    except Exception:  # noqa: BLE001 - a failed calibration leaves the gate alone
        _log.warning("Calibration pass failed for %s", workspace_root, exc_info=True)
        return None, False

    if outcome.taken:
        save_gate_record(workspace_root, outcome.record)
    if not outcome.complete:
        # The pass did not finish, so verdicts are kept but nothing is rebound on
        # a partial reading of the workspace.
        return outcome.record, False
    return outcome.record, bool(outcome.taken)


@traces(SWR.SWR_2616)
def _invalid(result: CheckResult) -> CheckResult:
    """Re-report a check that never started as a fact about the gate."""
    return result.model_copy(
        update={
            "status": "invalid",
            "outcome_kind": result.outcome_kind or "could_not_start",
            "skip_reason": (
                f"{result.command!r} could not be executed in this workspace, so it "
                "tested nothing. This is gate drift, not a code failure: it does not "
                "gate completion and it does not charge a repair attempt (SWR-2616)."
            ),
        },
    )


@traces(SWR.SWR_2616, SWR.SWR_2618)
def _missing_directory(check: ResolvedCheck, where: str) -> CheckResult:
    """The result for a check whose sub-project is no longer there."""
    return CheckResult(
        name=check.name,
        command=check.command,
        severity=check.severity,
        status="invalid",
        outcome_kind="missing_working_directory",
        cwd=check.cwd,
        skip_reason=(
            f"The directory {where!r} this check runs in does not exist, so it tested "
            "nothing. A moved sub-project is gate drift, not a code failure (SWR-2616)."
        ),
    )


@traces(SWR.SWR_2616)
async def _repair_gate(
    broken: ResolvedCheck,
    workspace_root: Path,
    executor: Any,
    budget: GateRepairBudget | None,
    *,
    engine: PermissionEngine | None,
    persona: str,
) -> Any:
    """Try to repair the gate deterministically, once per role per session.

    Deliberately not a model call and deliberately bounded: re-detect, probe, and
    take the first same-role, same-severity equivalent that resolves. If nothing
    does, the check stays ``invalid`` and the role is unverified for this run —
    a repair that had to weaken the gate would not be a repair.
    """
    from rotaris_core.verifier.execution import CommandRunner  # noqa: PLC0415
    from rotaris_core.verifier.gate_repair import (  # noqa: PLC0415
        GateRepair,
        find_replacement,
        persist_replacement,
    )

    if budget is None:
        return GateRepair(note="gate repair is not enabled for this run")
    if not budget.charge(broken.role):
        return GateRepair(
            note=(
                f"the {broken.role!r} role already used its one gate repair this "
                "session; this is reported rather than repaired again"
            ),
        )

    directory = workspace_root / (broken.cwd or "") if broken.cwd else workspace_root
    runner = CommandRunner(directory, executor=executor)
    try:
        repair = await asyncio.to_thread(
            find_replacement,
            broken,
            workspace_root,
            runner,
            engine=engine,
            persona=persona,
        )
    except Exception as error:  # noqa: BLE001 - a failed repair leaves the gate alone
        _log.warning("Gate repair for %r failed: %s", broken.name, error, exc_info=True)
        return GateRepair(note=f"the gate could not be repaired ({error})")

    if repair.replacement is None:
        return repair
    persisted = await asyncio.to_thread(
        persist_replacement,
        workspace_root,
        broken,
        repair.replacement,
    )
    _log.info("Verifier gate repaired: %s (%s)", repair.note, persisted)
    return repair._replace(note=f"{repair.note}; {persisted}")


@traces(SWR.SWR_2615)
def _gate_warning(gate: GateRecord | None) -> str:
    """The "no quality gate" sentence this run earns, or ""."""
    from rotaris_core.verifier.authoring import gate_warning  # noqa: PLC0415

    return gate_warning(gate)


@traces(SWR.SWR_2613)
def _recorded_gate(workspace_root: Path) -> GateRecord | None:
    """Verdicts this workspace already has. A file read; nothing executes."""
    from rotaris_core.verifier.gate_state import load_gate_record  # noqa: PLC0415

    try:
        return load_gate_record(workspace_root)
    except Exception:  # noqa: BLE001 - an unreadable record is simply no record
        return None


@traces(SWR.SWR_2613)
def _bound(suite: ResolvedCheckSuite, gate: GateRecord) -> ResolvedCheckSuite:
    """*suite* as its probe verdicts say it binds."""
    from rotaris_core.verifier.calibration import calibrated_suite  # noqa: PLC0415

    return calibrated_suite(suite, gate)


@traces(SWR.SWR_2621, SWR.SWR_2606)
def budget_warning(result: CheckResult, budget: int | None) -> str:
    """The sentence a killed check contributes, or ``""`` when it was not killed.

    Under SWR-2606 a killed check leaves every requirement it reached reading
    ``result-unknown``, which is honest and, on its own, mute: a whole board goes
    quiet and nothing says why. This is the why.

    It is written onto the check's own ``warnings`` as well as collected into the
    run's ``notices``, so a host that has only the results — which is what both
    requirement passes are handed — can still say it without a wider signature.
    """
    if str(result.status) != "timeout":
        return ""
    spent = f" after {result.duration_s:.0f}s" if result.duration_s else ""
    cap = f" (budget {budget}s)" if budget is not None else ""
    return (
        f"{result.name} was stopped{spent}{cap} before it reported. Nothing it"
        " covers could be verified by this run — raise the budget, or narrow the"
        " check, and run it again."
    )


@traces(SWR.SWR_2609, SWR.SWR_2611)
def _notify(progress: VerifierProgress | None, hook: str, *args: Any) -> None:
    """Call one progress hook, defensively.

    A host observer is not allowed to change what the suite concludes, so a hook
    that raises is logged and the run continues — the same contract every other
    observer notification in the loop honours.
    """
    if progress is None:
        return
    callback = getattr(progress, hook, None)
    if callback is None:
        return
    try:
        callback(*args)
    except Exception:  # noqa: BLE001 - progress reporting must never fail a run
        _log.exception("Verifier progress hook %s failed", hook)


@traces(SWR.SWR_2608)
def _effective_timeout(
    check: ResolvedCheck,
    suite_timeout: int | None,
    suite_started: float,
) -> float | None:
    """The time *check* may take, or ``None`` when the budget is spent.

    A check never outlives the suite budget, so a 600s check with 40s of budget
    left runs for 40s and is reported as a timeout rather than quietly stealing
    the next check's time.
    """
    if suite_timeout is None:
        return float(check.timeout)
    remaining = suite_timeout - (time.monotonic() - suite_started)
    if remaining <= 0:
        return None
    return min(float(check.timeout), remaining)


@traces(SWR.SWR_2608)
def _budget_skip(check: ResolvedCheck, suite_timeout: int | None) -> CheckResult:
    """The result recorded for a check the suite budget left no room for."""
    reason = (
        f"The suite budget of {suite_timeout}s was exhausted before this check started. "
        "Raise verifier.suite_timeout, or shorten the checks ahead of it."
    )
    _log.warning("Verifier check %r was not run: %s", check.name, reason)
    return CheckResult(
        name=check.name,
        command=check.command,
        severity=check.severity,
        status="skipped",
        outcome_kind="budget_exhausted",
        skip_reason=reason,
    )


async def _run_one_check(
    check: ResolvedCheck,
    executor: Any,
    evidence_dir: Path | None,
    deadline_s: float | None = None,
    control: VerifierRunControl | None = None,
) -> CheckResult:
    """Execute one check and classify its observation."""
    from rotaris_core.tools.terminal import HardenedTerminalAction

    timeout = float(check.timeout) if deadline_s is None else deadline_s
    action = HardenedTerminalAction(command=check.command, timeout=timeout)
    started = time.monotonic()
    try:
        observation = await _await_check(executor, action, control)
    except _CheckAbandonedError:
        duration = round(time.monotonic() - started, 3)
        # The command ignored its interrupt. Burn the terminal down — that kills
        # the process tree — and report the skip now rather than holding the run
        # for the rest of the check's timeout. The worker thread is a daemon and
        # its eventual return value is dropped.
        if control is not None:
            control.abandon()
        _cleanup(executor)
        return _user_skip_result(check, duration)
    except Exception as exc:  # noqa: BLE001 - surface as a failed check, not a crash
        duration = round(time.monotonic() - started, 3)
        if control is not None and control.skip_requested:
            # The exception is the interrupt we asked for, not a defect in the check.
            return _user_skip_result(check, duration)
        _log.warning("Verifier check %r could not be executed: %s", check.name, exc, exc_info=True)
        return CheckResult(
            name=check.name,
            command=check.command,
            severity=check.severity,
            status="failed",
            duration_s=duration,
            outcome_kind="execution_error",
            output_excerpt=f"Check could not be executed: {exc}",
        )

    duration = round(time.monotonic() - started, 3)
    if control is not None and control.skip_requested:
        # A killed terminal usually reports a non-zero exit; classifying that as
        # a failure would let a user's skip re-queue the iteration (SWR-2610).
        return _user_skip_result(check, duration)
    outcome = classify_terminal_observation(observation)
    text = _observation_text(observation)
    log_path = _write_full_output(evidence_dir, check.name, check.command, text)

    return CheckResult(
        name=check.name,
        command=check.command,
        severity=check.severity,
        status=_status_for(outcome.kind),
        exit_code=outcome.exit_code,
        duration_s=duration,
        outcome_kind=outcome.kind,
        warnings=list(outcome.warnings),
        output_excerpt=_excerpt(text),
        output_log_path=str(log_path) if log_path is not None else None,
    )


class _CheckAbandonedError(Exception):
    """A skipped check kept running past its grace period and was let go of."""


@traces(SWR.SWR_2610, SWR.SWR_2611)
def _execute_off_loop(executor: Any, action: Any) -> asyncio.Future[Any]:
    """Run the blocking check on a daemon thread, resolving a future with it.

    Deliberately not :func:`asyncio.to_thread`: its shared pool runs non-daemon
    threads, and a check that outlives its skip is abandoned rather than joined —
    a worker still polling a dead terminal must not hold up interpreter exit.
    """
    loop = asyncio.get_running_loop()
    future: asyncio.Future[Any] = loop.create_future()

    def _settle(setter: str, value: Any) -> None:
        if not future.done():
            getattr(future, setter)(value)

    def _worker() -> None:
        try:
            observation = executor(action)
        except BaseException as exc:  # noqa: BLE001 - carried to the awaiting side
            with suppress(RuntimeError):
                loop.call_soon_threadsafe(_settle, "set_exception", exc)
        else:
            with suppress(RuntimeError):
                loop.call_soon_threadsafe(_settle, "set_result", observation)

    threading.Thread(target=_worker, name="verifier-check", daemon=True).start()
    return future


@traces(SWR.SWR_2610)
async def _await_check(
    executor: Any,
    action: Any,
    control: VerifierRunControl | None,
) -> Any:
    """Wait for the check, giving up on it shortly after a skip is requested.

    Raises :class:`_CheckAbandonedError` when the grace period expires with the check
    still running, so the caller can burn the terminal down and settle the row.
    """
    future = _execute_off_loop(executor, action)
    skipped = control.skip_signal if control is not None else None
    if skipped is None:
        return await future

    waiter = asyncio.ensure_future(skipped.wait())
    try:
        await asyncio.wait({future, waiter}, return_when=asyncio.FIRST_COMPLETED)
    finally:
        waiter.cancel()
    if future.done():
        return future.result()

    # A skip is pending and the interrupt has already been sent; a command that
    # honours it returns within a poll interval of the terminal backend.
    try:
        return await asyncio.wait_for(asyncio.shield(future), _SKIP_GRACE_S)
    except TimeoutError as exc:
        raise _CheckAbandonedError from exc


@traces(SWR.SWR_2610)
def _user_skip_result(check: ResolvedCheck, duration: float) -> CheckResult:
    """The result recorded for a check the user stopped mid-flight."""
    return CheckResult(
        name=check.name,
        command=check.command,
        severity=check.severity,
        status="skipped",
        duration_s=duration,
        outcome_kind="user_skipped",
        skip_reason=f"Skipped by the user after {duration:.0f}s. This check did not verify anything.",
    )


def _status_for(outcome_kind: str) -> CheckStatus:
    """Map a terminal outcome onto a check status.

    ``suspicious_success`` counts as a failure on purpose: a command that exits
    0 while its output carries a pytest failure summary is precisely the false
    completion signal this epic exists to catch. The raw ``outcome_kind`` is
    preserved on the result for callers that want to treat it differently.
    """
    if outcome_kind == "timeout":
        return "timeout"
    if outcome_kind in {"success", "background_terminal"}:
        return "passed"
    return "failed"


def _permission_skip(
    check: ResolvedCheck,
    engine: PermissionEngine | None,
    persona: str,
) -> CheckResult | None:
    """Return a skipped result when the policy denies this check, else ``None``.

    ``PermissionEngine.resolve`` never raises and never returns ``ask`` — an
    ``ask`` is routed through the session's approval resolver first — so only
    allow and deny reach here.
    """
    reason = permission_denial(check.command, engine, persona)
    if not reason:
        return None
    _log.warning("Verifier check %r was not run: %s", check.name, reason)
    return CheckResult(
        name=check.name,
        command=check.command,
        severity=check.severity,
        status="skipped",
        skip_reason=reason,
    )


@traces(SWR.SWR_2618)
def _new_executor(working_dir: Path) -> Any:
    """A hardened terminal rooted at *working_dir*.

    Taking the directory rather than closing over the workspace root is what lets
    one suite verify several projects: a sub-project's command runs where it
    resolves instead of running at the root and silently checking the wrong tree.
    """
    from rotaris_core.tools.terminal import HardenedTerminalExecutor

    return HardenedTerminalExecutor(working_dir=str(working_dir))


@traces(SWR.SWR_2610)
def _interrupt(executor: Any | None) -> None:
    """Send the terminal's interrupt to the command an executor is running.

    Duck-typed like :func:`_cleanup`: the hardened executor inherits
    ``interrupt()`` from the SDK, and a test double or a bare callable that has
    no such method simply gets nothing — the grace period in
    :func:`_await_check` bounds the wait either way.
    """
    if executor is None:
        return
    interrupt = getattr(executor, "interrupt", None)
    if interrupt is None:
        return
    try:
        interrupt()
    except Exception as exc:  # noqa: BLE001 - escalation still follows
        _log.debug("Verifier check interrupt failed: %s", exc)


def _write_full_output(
    evidence_dir: Path | None,
    check_name: str,
    command: str,
    text: str,
) -> Path | None:
    """Persist the full output next to the session's other evidence."""
    if evidence_dir is None:
        return None
    stamp = dt.datetime.now(dt.UTC).strftime("%Y%m%dT%H%M%S%f")
    safe_name = _UNSAFE_NAME_RE.sub("-", check_name).strip("-") or "check"
    path = evidence_dir / f"{stamp}-{safe_name}.log"
    try:
        evidence_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(f"$ {command}\n\n{text}", encoding="utf-8", errors="replace")
    except OSError as exc:
        _log.warning("Could not write verifier output log %s: %s", path, exc)
        return None
    return path
