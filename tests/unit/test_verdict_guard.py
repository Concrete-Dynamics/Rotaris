"""The guard that refuses to call a partial run green.

Pure test-harness self-checks: they cover `tests/verdict_guard.py`, which is not
product code and traces to no requirement, so each is marked exempt rather than
annotated with a `@verifies` it would have to invent.
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from tests import verdict_guard

pytestmark = pytest.mark.unit


def _session(*, collected: int, exitstatus: int = 0, worker: bool = False):
    return SimpleNamespace(
        testscollected=collected,
        shouldstop=False,
        shouldfail=False,
        config=SimpleNamespace(workerinput={} if worker else None),
    )


@pytest.fixture(autouse=True)
def _empty_ledger(monkeypatch):
    monkeypatch.setattr(verdict_guard, "_REPORTED", set())


def _report(nodeid: str, *, when: str = "teardown", failed: bool = False):
    return SimpleNamespace(nodeid=nodeid, when=when, failed=failed)


# reqtocode: exempt
def test_a_run_where_every_test_reported_is_left_alone() -> None:
    """Productive use: the ordinary green run must stay green and stay quiet."""
    for i in range(3):
        verdict_guard.record_report(_report(f"t{i}"))

    assert verdict_guard.missing_verdicts(_session(collected=3), 0) is None


# reqtocode: exempt
def test_a_run_that_lost_tests_but_would_exit_zero_is_refused() -> None:
    """Productive use: a worker dies unnoticed, and the agent reading the summary
    must not be told the suite passed."""
    verdict_guard.record_report(_report("t0"))

    message = verdict_guard.missing_verdicts(_session(collected=3), 0)

    assert message is not None
    assert "2 of 3" in message


# reqtocode: exempt
def test_a_crashed_test_counts_as_reported_when_xdist_synthesises_its_failure() -> None:
    """Productive use: xdist already names the test that killed a worker; that run
    is red on its own and the guard must not double-report it."""
    verdict_guard.record_report(_report("t0", when="call", failed=True))
    verdict_guard.record_report(_report("t1"))

    assert verdict_guard.missing_verdicts(_session(collected=2), 1) is None


# reqtocode: exempt
@pytest.mark.parametrize("exitstatus", [1, 2, 3, 5])
def test_a_run_that_already_carries_a_verdict_is_never_second_guessed(exitstatus: int) -> None:
    """Productive use: `-x`, Ctrl-C and an internal error all end with tests
    unreported on purpose, and none of them needs a second opinion."""
    assert verdict_guard.missing_verdicts(_session(collected=9), exitstatus) is None


# reqtocode: exempt
def test_an_xdist_worker_never_decides_for_the_whole_session() -> None:
    """Productive use: a worker sees only its own slice, so only the controller can
    compare what was collected against what came back."""
    assert verdict_guard.missing_verdicts(_session(collected=9, worker=True), 0) is None
