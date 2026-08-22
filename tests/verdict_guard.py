"""Refuse to call a run green when part of it never reported.

A worker that dies hard — pytest-timeout's Windows path is `os._exit(1)`, and a
Qt abort is the same thing without the courtesy — takes the tests queued behind
it with it. xdist usually notices and synthesises a failure naming the test that
was running, and then the run is red and everything is fine. Usually is not
always: the observed failure mode is a run that stops printing, or one that ends
with a summary counting fewer tests than were collected and an exit status of
zero. A green partial run is the single worst thing this suite can hand an
agent, because every downstream decision treats it as evidence.

So the count is checked. Collected against reported, on the controller only, and
only when the run would otherwise be reported as passing — a red run is already
telling the truth and does not need this, and neither does a deliberate stop
(`-x`, `--maxfail`, Ctrl-C, an internal error), all of which end a session with
tests legitimately unreported.

Wired from both suites' `conftest.py` rather than living in either of them: the
engine and the desktop suites are separate pytest sessions with separate roots,
and this has to hold for both.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import pytest

#: Node ids that produced a terminal report this session. A test contributes one
#: `teardown` report when it completes, and a crashed worker contributes a
#: `failed` report that xdist synthesises in its place, so either is enough.
_REPORTED: set[str] = set()


def record_report(report: pytest.TestReport) -> None:
    if report.when == "teardown" or report.failed:
        _REPORTED.add(report.nodeid)


def missing_verdicts(session: pytest.Session, exitstatus: int) -> str | None:
    """The message to fail the session with, or `None` when it is trustworthy.

    `exitstatus` 0 is the only status this speaks up for. Anything else already
    carries a verdict of its own — including `2` (interrupted) and `3` (internal
    error), where unreported tests are the expected consequence rather than a
    lost one.
    """
    if getattr(session.config, "workerinput", None) is not None:
        return None  # an xdist worker sees only its own slice; the controller counts
    if exitstatus != 0:
        return None
    if session.shouldstop or session.shouldfail:
        return None

    collected = session.testscollected
    reported = len(_REPORTED)
    if reported >= collected:
        return None

    return (
        f"{collected - reported} of {collected} collected tests never reported a result, "
        f"yet the run is about to exit 0. A worker died without being noticed; "
        f"treat this run as having no verdict rather than as a pass."
    )
