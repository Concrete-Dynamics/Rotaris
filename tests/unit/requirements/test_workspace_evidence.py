"""The sweep, the stored verdict and the decay, read together (SWR-3207, SWR-3209).

The point of this file is the pair. Recording a verification without letting it
decay would be worse than not recording one — a stored verdict that never expires
paints the ring *green* over code that has since changed, where a permanently-red
ring at least errs toward caution. So every "it can now be healthy" test here has
a sibling that takes the health away again for a stated reason.
"""

from __future__ import annotations

import datetime as dt
import os
import subprocess
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements.delivery.evidence import (
    EvidenceInputs,
    EvidenceState,
    VerificationRecord,
    project_evidence,
)
from rotaris_core.requirements.delivery.freshness import GitFreshness, NoFreshness
from rotaris_core.requirements.delivery.health import (
    HealthInputs,
    RequirementHealth,
    derive_health,
)
from rotaris_core.requirements.delivery.obligations import EvidenceKind, resolve_obligations
from rotaris_core.requirements.delivery.projection import WorkspaceEvidence
from rotaris_core.requirements.delivery.satisfied import SatisfactionState
from rotaris_core.requirements.delivery.staleness import StalenessReason
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    DeliveryView,
    TransitionCause,
)
from rotaris_core.requirements.delivery.verification import RequirementVerification
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

if TYPE_CHECKING:
    from pathlib import Path

pytestmark = pytest.mark.unit

AT = dt.datetime(2026, 8, 16, 9, 0, tzinfo=dt.UTC)
VERIFIED_COMMIT = "abc1234abc1234abc1234abc1234abc1234abc12"
IMPL_PATH = "src/rotaris_core/requirements/delivery/verification.py"
TEST_PATH = "tests/unit/requirements/test_verification_store.py"
REQ = CanonicalRequirement(
    req_id="SWR-3220", title="A verification is recorded", current_hash="h-1"
)


class _Sweep:
    """What the repository declares today — the `CoverageEvidence` answer.

    Covering tests arrive ``executed=False`` because a sweep knows a test exists,
    not that anything ran it (SWR-2606). That is the whole reason the overlay in
    :class:`WorkspaceEvidence` exists.
    """

    def __init__(
        self,
        *,
        implementations: tuple[RequirementSite, ...] = (RequirementSite(path=IMPL_PATH, line=42),),
        covering_tests: tuple[CoveringTest, ...] = (CoveringTest(path=TEST_PATH, line=17),),
    ) -> None:
        self._implementations = implementations
        self._covering_tests = covering_tests

    def evidence_for(self, requirement: CanonicalRequirement) -> EvidenceInputs:
        return EvidenceInputs(
            req_id=requirement.req_id,
            requirement_hash=requirement.current_hash,
            implementations=self._implementations,
            covering_tests=self._covering_tests,
        )


class _Moved:
    """A repository that changed *paths* since the verified commit."""

    def __init__(self, *paths: str, ancestor: bool | None = True) -> None:
        self._paths = frozenset(paths)
        self._ancestor = ancestor

    def changed_since(self, commit: str) -> frozenset[str]:  # noqa: ARG002 - port shape
        return self._paths

    def is_ancestor(self, commit: str) -> bool | None:  # noqa: ARG002 - port shape
        return self._ancestor


def _verification(
    *,
    verdict: str = "passed",
    executed: bool = True,
    status: str = "passed",
    test_path: str = TEST_PATH,
    impl_path: str = IMPL_PATH,
) -> RequirementVerification:
    return RequirementVerification(
        req_id=REQ.req_id,
        record=VerificationRecord(
            verdict=verdict,  # type: ignore[arg-type]
            commit=VERIFIED_COMMIT,
            requirement_hash="h-1",
            run_id="run-7",
            verified_at=AT,
            checks=("pytest",),
        ),
        implementations=(RequirementSite(path=impl_path, line=42),),
        covering_tests=(
            CoveringTest(
                path=test_path,
                line=17,
                executed=executed,
                check_name="pytest" if executed else None,
                check_status=status if executed else None,
                # *status* names this test's own outcome in these fixtures, which
                # is what a stored verification carries once a report supplied it.
                verdict=(("passed" if status == "passed" else "failed") if executed else "not_run"),
            ),
        ),
        target_branch="master",
    )


def _states(inputs: EvidenceInputs) -> dict[EvidenceKind, EvidenceState]:
    projection = project_evidence(resolve_obligations(REQ), inputs)
    return {obligation.kind: obligation.state for obligation in projection.obligations}


#: A delivered status. Built in full rather than with `state=` alone, because the
#: model refuses a `Done` that names nobody — SWR-3203's rule, and a good one.
DELIVERED = DeliveryStatus(
    state=DeliveryState.DONE,
    changed_at=AT,
    changed_by=DeliveryActor.system("verification-pass"),
    cause=TransitionCause.RUN_COMPLETED,
    requirement_hash="h-1",
)


def _health(inputs: EvidenceInputs) -> RequirementHealth:
    """The badge this evidence produces for a requirement Rotaris considers delivered."""
    projection = project_evidence(resolve_obligations(REQ), inputs)
    return derive_health(
        HealthInputs.of(
            DeliveryView.of(REQ, DELIVERED),
            projection,
            satisfaction=SatisfactionState.SATISFIED,
        ),
    ).health


# -- the obligation was unreachable before this ----------------------------


@verifies(SWR.SWR_3207, SWR.SWR_3220)
def test_a_recorded_verification_is_what_makes_a_requirement_healthy() -> None:
    """Productive use: a suite ran, it passed, and the board is asked about the card.
    Expected outcome: `Healthy` — a value the shipped product could not reach at all
    before a verification was kept anywhere."""
    reader = WorkspaceEvidence(_Sweep(), {REQ.req_id: _verification()}, freshness=_Moved())

    inputs = reader.evidence_for(REQ)

    assert _states(inputs)[EvidenceKind.VERIFICATION] is EvidenceState.SATISFIED
    assert _states(inputs)[EvidenceKind.TEST] is EvidenceState.SATISFIED
    assert _health(inputs) is RequirementHealth.HEALTHY


@verifies(SWR.SWR_3207, SWR.SWR_2606)
def test_without_a_verification_the_sweep_alone_can_never_say_a_test_passed() -> None:
    """Productive use: the board of a workspace nobody has verified.
    Expected outcome: the test obligation is stale and the verification missing —
    the state every requirement in every workspace was permanently stuck in."""
    reader = WorkspaceEvidence(_Sweep(), {})

    states = _states(reader.evidence_for(REQ))

    assert states[EvidenceKind.TEST] is EvidenceState.STALE
    assert states[EvidenceKind.VERIFICATION] is EvidenceState.MISSING


@verifies(SWR.SWR_3209)
def test_a_requirement_nobody_verified_is_missing_evidence_not_stale_evidence() -> None:
    """Productive use: a brand-new requirement is projected.
    Expected outcome: no staleness findings at all. There is no baseline to have
    drifted from, and "never measured" is a different answer from "measured and
    since moved"."""
    reader = WorkspaceEvidence(_Sweep(), {}, freshness=_Moved(IMPL_PATH))

    inputs = reader.evidence_for(REQ)

    assert inputs.staleness == ()
    assert inputs.verification is None


# -- and every way of taking it away again ---------------------------------


@verifies(SWR.SWR_3209)
def test_editing_an_implementing_file_moves_the_requirement_off_healthy() -> None:
    """Productive use: someone refactors the module a requirement is traced to.
    Expected outcome: the implementation evidence is stale and the card leaves
    `Healthy` — with no requirement edited by anyone. SWR-3209's second criterion."""
    reader = WorkspaceEvidence(
        _Sweep(),
        {REQ.req_id: _verification()},
        freshness=_Moved(IMPL_PATH),
    )

    inputs = reader.evidence_for(REQ)

    assert _states(inputs)[EvidenceKind.IMPLEMENTATION] is EvidenceState.STALE
    assert _health(inputs) is not RequirementHealth.HEALTHY
    assert [finding.reason for finding in inputs.staleness] == [
        StalenessReason.IMPLEMENTATION_CHANGED,
    ]


@verifies(SWR.SWR_3209)
def test_deleting_a_covering_test_does_the_same_and_names_the_reason() -> None:
    """Productive use: a colleague deletes the test that covered this requirement.
    Expected outcome: the test evidence stops being satisfied, and the reason is
    machine-readable rather than a colour."""
    reader = WorkspaceEvidence(
        _Sweep(covering_tests=()),
        {REQ.req_id: _verification()},
        freshness=_Moved(),
    )

    inputs = reader.evidence_for(REQ)

    assert _states(inputs)[EvidenceKind.TEST] is EvidenceState.MISSING
    assert [finding.reason for finding in inputs.staleness] == [
        StalenessReason.COVERING_TEST_DISAPPEARED,
    ]


@verifies(SWR.SWR_3209)
def test_a_verified_commit_that_was_rebased_away_reports_stale_not_failed() -> None:
    """Productive use: the branch the verification ran on was rebased.
    Expected outcome: stale verification. The suite did not fail — nobody can find
    what it ran against any more, and those are different answers."""
    reader = WorkspaceEvidence(
        _Sweep(),
        {REQ.req_id: _verification()},
        freshness=_Moved(ancestor=False),
    )

    inputs = reader.evidence_for(REQ)

    assert _states(inputs)[EvidenceKind.VERIFICATION] is EvidenceState.STALE
    assert [finding.reason for finding in inputs.staleness] == [
        StalenessReason.VERIFIED_COMMIT_UNREACHABLE,
    ]


@verifies(SWR.SWR_3209)
def test_an_unknown_ancestry_is_not_read_as_a_lost_commit() -> None:
    """Productive use: the workspace is not a git checkout, so nobody can be asked.
    Expected outcome: no staleness. `None` is unknown, and unknown must never mark
    every requirement in a workspace stale for something that did not happen."""
    reader = WorkspaceEvidence(_Sweep(), {REQ.req_id: _verification()}, freshness=NoFreshness())

    inputs = reader.evidence_for(REQ)

    assert inputs.staleness == ()
    assert _states(inputs)[EvidenceKind.VERIFICATION] is EvidenceState.SATISFIED


@verifies(SWR.SWR_3207, SWR.SWR_2606)
def test_a_verification_whose_covering_test_never_ran_leaves_the_test_stale() -> None:
    """Productive use: the configured suite does not run the file the test lives in.
    Expected outcome: the verification is recorded as skipped and the test stays
    stale. "Nobody checked" and "everything holds" remain two answers."""
    reader = WorkspaceEvidence(
        _Sweep(),
        {REQ.req_id: _verification(verdict="skipped", executed=False)},
        freshness=_Moved(),
    )

    states = _states(reader.evidence_for(REQ))

    assert states[EvidenceKind.TEST] is EvidenceState.STALE
    assert states[EvidenceKind.VERIFICATION] is EvidenceState.STALE


@verifies(SWR.SWR_3207)
def test_a_failing_covering_test_beats_complete_traceability() -> None:
    """Productive use: every trace is in place and the test is red.
    Expected outcome: `failed`, not `satisfied` — §22 of the target picture, now
    reachable because a real run's status is what fills the field."""
    reader = WorkspaceEvidence(
        _Sweep(),
        {REQ.req_id: _verification(status="failed")},
        freshness=_Moved(),
    )

    inputs = reader.evidence_for(REQ)

    assert _states(inputs)[EvidenceKind.TEST] is EvidenceState.FAILED
    assert _health(inputs) is RequirementHealth.VERIFICATION_FAILED


# -- how the overlay matches, and why -------------------------------------


@verifies(SWR.SWR_3207, SWR.SWR_2606)
def test_a_test_that_moved_within_its_file_still_counts_as_executed() -> None:
    """Productive use: an edit above the test pushes it down twelve lines.
    Expected outcome: still executed — a check runs a *file*, and that is what
    `execution_for` measures. The line move is reported as its own finding, with
    its own repair, rather than as "nothing ran this"."""
    reader = WorkspaceEvidence(
        _Sweep(covering_tests=(CoveringTest(path=TEST_PATH, line=29),)),
        {REQ.req_id: _verification()},
        freshness=_Moved(),
    )

    inputs = reader.evidence_for(REQ)

    assert inputs.covering_tests[0].executed is True
    assert [finding.reason for finding in inputs.staleness] == [StalenessReason.TRACE_MOVED]


@verifies(SWR.SWR_3207)
def test_a_test_the_verification_never_saw_is_not_credited_with_its_run() -> None:
    """Productive use: a second covering test is added after the verification.
    Expected outcome: the new one is not marked executed. The stored run cannot
    vouch for a file it never saw."""
    reader = WorkspaceEvidence(
        _Sweep(
            covering_tests=(
                CoveringTest(path=TEST_PATH, line=17),
                CoveringTest(path="tests/unit/requirements/test_new.py", line=3),
            ),
        ),
        {REQ.req_id: _verification()},
        freshness=_Moved(),
    )

    inputs = reader.evidence_for(REQ)

    assert [(test.path, test.executed) for test in inputs.covering_tests] == [
        (TEST_PATH, True),
        ("tests/unit/requirements/test_new.py", False),
    ]


# -- the cost of asking ----------------------------------------------------


class _CountingGit(GitFreshness):
    """`GitFreshness` with a tally of how often it actually reached for git."""

    def __init__(self, repo_root: Path) -> None:
        super().__init__(repo_root)
        self.invocations: list[tuple[str, ...]] = []

    def _invoke(self, *args: str) -> subprocess.CompletedProcess[bytes] | None:
        self.invocations.append(args)
        return super()._invoke(*args)


@pytest.mark.integration
@verifies(SWR.SWR_3209, SWR.SWR_3317)
def test_freshness_asks_git_once_per_distinct_commit_not_once_per_requirement(
    tmp_path: Path,
) -> None:
    """Productive use: fifteen hundred requirements adopted at one commit.
    Expected outcome: two git invocations for the whole board, not three thousand.
    A call per requirement is not a tuning problem — it is the difference between a
    board that opens and one that does not (SWR-3317)."""
    env = {
        **os.environ,
        "GIT_AUTHOR_NAME": "t",
        "GIT_AUTHOR_EMAIL": "t@example.invalid",
        "GIT_COMMITTER_NAME": "t",
        "GIT_COMMITTER_EMAIL": "t@example.invalid",
    }
    subprocess.run(["git", "init", "-q", str(tmp_path)], check=True, env=env)  # noqa: S603, S607
    subprocess.run(  # noqa: S603, S607
        ["git", "-C", str(tmp_path), "commit", "-q", "--allow-empty", "-m", "root"],
        check=True,
        env=env,
    )
    head = (
        subprocess.run(  # noqa: S603, S607
            ["git", "-C", str(tmp_path), "rev-parse", "HEAD"],
            capture_output=True,
            check=True,
            env=env,
        )
        .stdout.decode()
        .strip()
    )

    freshness = _CountingGit(tmp_path)
    for _ in range(200):
        freshness.changed_since(head)
        freshness.is_ancestor(head)

    assert len(freshness.invocations) == 2
    assert freshness.calls == 2
    assert freshness.is_ancestor(head) is True


@verifies(SWR.SWR_3209)
def test_a_workspace_that_is_not_a_checkout_has_no_git_freshness(tmp_path: Path) -> None:
    """Productive use: Rotaris opens a directory that was never a repository.
    Expected outcome: no source, and the caller falls back to "nothing changed,
    ancestry unknown" rather than failing to project."""
    assert GitFreshness.for_repo(tmp_path) is None
