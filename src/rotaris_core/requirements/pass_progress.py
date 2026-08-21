"""What a running requirement pass tells the host that started it (SWR-3620).

A verification pass (SWR-3221) and an adoption pass (SWR-3217) return one report
at the end and say nothing on the way, which is why a surface can report that a
pass is running and nothing else. This is the seam that lets it report more.

The shape is the one the suite runner already established one layer down
(:class:`~rotaris_core.verifier.runner.VerifierProgress`, SWR-2609): a protocol
of plain values, dispatched defensively, absent by default. What is new is the
level — a pass's *phases*, of which running the check suite is one — and
:func:`check_suite_progress` is the adapter between the two, written once here
because both the engine's verification host and the desktop's adoption host run
a suite and need it.

```text
PassPhase.READING    → the requirement source is being read
PassPhase.CHECKS     → the workspace's own suite is running     SWR-2602
PassPhase.COVERAGE   → the repository is being swept for traces
PassPhase.RECORDING  → one verification written per requirement SWR-3220
PassPhase.ADOPTING   → candidates moved by the completion gate  SWR-3217
```

Nothing here may change what a pass concludes. A host that raises is logged and
stepped over, and a pass given no host does no reporting work at all.
"""

from __future__ import annotations

import logging
from enum import StrEnum
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.verifier.runner import CheckResult, VerifierProgress
    from rotaris_core.verifier.suite import ResolvedCheck

_log = logging.getLogger(__name__)

__all__ = [
    "PassPhase",
    "PassProgress",
    "check_suite_progress",
    "notify",
]


@traces(SWR.SWR_3620)
class PassPhase(StrEnum):
    """The phases a requirement pass walks, in the order it walks them.

    Declared by the pass rather than inferred by the host: a surface that had to
    guess "this must be the coverage sweep, no callback has arrived for a while"
    would be guessing about the one thing this seam exists to state.
    """

    READING = "reading"
    CHECKS = "checks"
    COVERAGE = "coverage"
    RECORDING = "recording"
    ADOPTING = "adopting"


@traces(SWR.SWR_3620)
@runtime_checkable
class PassProgress(Protocol):
    """What a host is told while an adoption or verification pass runs.

    Both calls happen on the thread running the pass, and both are invoked
    through :func:`notify`, so an implementation that raises is logged and
    stepped over rather than failing the pass. A host that has to touch a UI
    marshals for itself — the same contract the suite runner holds its own
    progress hosts to.
    """

    def on_phase(self, phase: PassPhase, total: int = 0) -> None:
        """A phase has begun, with the number of items it will report.

        *total* is ``0`` for a phase whose work is one indivisible step. It
        arrives *before* the first item on purpose: a count with no denominator
        cannot be rendered as a position, and a denominator that turns up late
        is what makes a progress display change shape while a user reads it.
        """

    def on_item(
        self,
        phase: PassPhase,
        label: str,
        index: int,
        total: int,
        detail: str = "",
        deadline_s: float = 0.0,
    ) -> None:
        """One item of *phase* is being worked on.

        *index* is 1-based. *label* names the item — a check's name, a
        requirement's id — and *deadline_s* is the running check's effective
        timeout, which is what a countdown should be drawn from.
        """


@traces(SWR.SWR_3620)
def notify(progress: PassProgress | None, hook: str, *args: Any) -> None:
    """Call *hook* on *progress*, and never let it break the pass.

    The dispatch contract of :func:`rotaris_core.verifier.runner._notify`, kept
    identical on purpose: progress reporting is an observation of a pass, and an
    observation that can change the outcome is not one.
    """
    if progress is None:
        return
    callback = getattr(progress, hook, None)
    if callback is None:
        return
    try:
        callback(*args)
    except Exception:  # noqa: BLE001 - progress reporting must never fail a pass
        _log.exception("Pass progress hook %s failed", hook)


@traces(SWR.SWR_3620, SWR.SWR_2609)
def check_suite_progress(progress: PassProgress | None) -> VerifierProgress | None:
    """*progress* seen as the suite runner's own progress host, or ``None``.

    The suite is one phase of a pass, and its runner already reports per check
    (SWR-2609). This turns those reports into ``CHECKS`` items rather than
    inventing a second mechanism beside them — and returning ``None`` for a pass
    with no host keeps ``run_check_suite`` on exactly the path it takes today.
    """
    if progress is None:
        return None
    return _CheckSuiteProgress(progress)


@traces(SWR.SWR_3620)
class _CheckSuiteProgress:
    """Adapts the suite runner's per-check callbacks onto :class:`PassProgress`.

    Reports on *start* rather than on finish: what a user wants to read is the
    check that is running, and a check that has finished is by definition no
    longer the answer to that. The finish callback carries the position forward
    so the last check of a suite does not sit at ``n-1`` while the pass moves on.
    """

    def __init__(self, progress: PassProgress) -> None:
        self._progress = progress

    def on_check_start(
        self,
        check: ResolvedCheck,
        index: int,
        total: int,
        deadline_s: float,
    ) -> None:
        notify(
            self._progress,
            "on_item",
            PassPhase.CHECKS,
            check.name,
            index,
            total,
            check.command,
            deadline_s,
        )

    def on_check_finish(self, result: CheckResult, index: int, total: int) -> None:
        notify(
            self._progress,
            "on_item",
            PassPhase.CHECKS,
            result.name,
            index,
            total,
            str(result.status),
            0.0,
        )
