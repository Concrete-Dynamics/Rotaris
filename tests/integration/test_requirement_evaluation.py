"""Productive use: the board is open on a real checkout. The user commits a change to
the module implementing a requirement, then switches to a branch where its covering test
does not exist — and each of those produces exactly one evaluation naming exactly the
cards that moved, computed off the UI thread.
Expected outcome: a commit and a branch switch in a git repository each cause one pass;
the published change set names the requirement whose projection actually changed and
nothing else; a burst of git events inside the debounce window is one pass; a pass that
cannot read the repository leaves the previous answer standing; and an evaluation reading
the repository can never schedule another evaluation.

Fixture sources are assembled from the T/V constants so this file's own text carries no
scannable annotation for the synthetic requirements it writes into a temporary directory.
"""

from __future__ import annotations

import datetime as dt
import subprocess
import threading
from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.coverage import coverage_map
from rotaris_core.reqtocode.layout import RepoLayout
from rotaris_core.requirements.delivery.evaluation import (
    EvaluationEvent,
    EvaluationOutcome,
    EvaluationReentryError,
    EvaluationRequest,
    EvaluationTrigger,
    RequirementEvaluator,
)
from rotaris_core.requirements.delivery.evidence import (
    EvidenceInputs,
    EvidenceProjection,
    EvidenceState,
    project_evidence,
)
from rotaris_core.requirements.delivery.obligations import (
    EvidenceKind,
    ObligationLevel,
    ObligationPolicy,
    ObligationSet,
    resolve_obligations,
)
from rotaris_core.requirements.model import CanonicalRequirement
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

pytestmark = pytest.mark.integration

T = "traces"
V = "verifies"
WIDGET = 9001
GADGET = 9002
DEBOUNCE_MS = 400
AT = dt.datetime(2026, 8, 14, 10, 0, tzinfo=dt.UTC)
AFTER_WINDOW = AT + dt.timedelta(milliseconds=DEBOUNCE_MS)

LAYOUT = RepoLayout(impl_roots=(Path("src"),), test_roots=(Path("tests"),))

#: A synthetic workspace has no verification, execution or integration records,
#: so the projection is asked only about what its files can answer.
POLICY = ObligationPolicy(
    product=ObligationSet(
        verification=ObligationLevel.NOT_APPLICABLE,
        execution=ObligationLevel.NOT_APPLICABLE,
        integration=ObligationLevel.NOT_APPLICABLE,
    ),
)


def git(repo: Path, *args: str) -> str:
    """One git command in *repo*, with the ambient configuration kept out."""
    result = subprocess.run(
        ["git", "-c", "user.email=t@example.com", "-c", "user.name=Test", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout.strip()


def requirement_file(number: int, title: str) -> str:
    """A ReqToCode requirement artefact the real parser accepts."""
    return (
        "---\n"
        f"req-id: SWR-{number}\n"
        "status: draft\n"
        "trace: required\n"
        "test: required\n"
        f'title: "{title}"\n'
        "---\n\n"
        f"# SWR-{number} - {title}\n\nIt works.\n"
    )


@pytest.fixture
def workspace(tmp_path: Path) -> Path:
    """A committed git repository with two requirements, both traced and covered."""
    repo = tmp_path / "workspace"
    (repo / "docs" / "requirements").mkdir(parents=True)
    (repo / "src").mkdir()
    (repo / "tests").mkdir()
    (repo / "docs" / "requirements" / "9000-demo.md").write_text(
        requirement_file(WIDGET, "The widget widgets"),
        encoding="utf-8",
    )
    (repo / "docs" / "requirements" / "9100-demo.md").write_text(
        requirement_file(GADGET, "The gadget gadgets"),
        encoding="utf-8",
    )
    for number, name in ((WIDGET, "widget"), (GADGET, "gadget")):
        (repo / "src" / f"{name}.py").write_text(
            f"@{T}(SWR.SWR_{number})\ndef {name}() -> int:\n    return 1\n",
            encoding="utf-8",
        )
        (repo / "tests" / f"test_{name}.py").write_text(
            f"@{V}(SWR.SWR_{number})\ndef test_{name}() -> None:\n    assert True\n",
            encoding="utf-8",
        )
    git(repo, "init", "-b", "main")
    git(repo, "add", "-A")
    git(repo, "commit", "-m", "both requirements traced and covered")
    return repo


class RepositoryEvaluation:
    """The pass itself: read the repository, project every requirement.

    Deliberately a plain callable that holds the *workspace*, never the
    evaluator: an evaluation has nothing to schedule another one with, which is
    the structural half of SWR-3210's termination guarantee.
    """

    def __init__(self, repo: Path) -> None:
        self._repo = repo
        self.passes = 0
        self.fail_next = False

    def __call__(self, request: EvaluationRequest) -> dict[str, EvidenceProjection]:
        self.passes += 1
        if self.fail_next:
            raise RuntimeError("the requirement index could not be read")
        coverage = coverage_map(self._repo, layout=LAYOUT)
        wanted = {int(req_id.rsplit("-", 1)[-1]) for req_id in request.scope} or set(coverage)
        projections: dict[str, EvidenceProjection] = {}
        for number in sorted(wanted & set(coverage)):
            sites = coverage[number]
            requirement = CanonicalRequirement(req_id=f"SWR-{number}", title="synthetic")
            projections[requirement.req_id] = project_evidence(
                resolve_obligations(requirement, policy=POLICY),
                EvidenceInputs(
                    req_id=requirement.req_id,
                    implementations=tuple(
                        RequirementSite(path=s.path, line=s.line) for s in sites.implementations
                    ),
                    covering_tests=tuple(
                        CoveringTest(
                            path=s.path,
                            line=s.line,
                            executed=True,
                            check_name="pytest",
                            check_status="passed",
                        )
                        for s in sites.tests
                    ),
                ),
            )
        return projections


def event(
    trigger: EvaluationTrigger,
    *,
    at: dt.datetime = AT,
    req_ids: tuple[str, ...] = (),
) -> EvaluationEvent:
    """One repository event."""
    return EvaluationEvent(trigger=trigger, at=at, req_ids=req_ids)


# -- a commit and a branch switch, one pass each (SWR-3210) ----------------


@verifies(SWR.SWR_3210)
def test_a_commit_and_a_branch_switch_each_produce_one_evaluation(workspace: Path) -> None:
    """Two real git events, two passes, and each names exactly what moved."""
    published: list[EvaluationOutcome] = []
    evaluate = RepositoryEvaluation(workspace)
    evaluator = RequirementEvaluator(
        evaluate,
        debounce_ms=DEBOUNCE_MS,
        publish=published.append,
    )

    evaluator.submit(event(EvaluationTrigger.MANUAL))
    first = evaluator.run_due(AFTER_WINDOW)
    assert first is not None
    assert first.changed_ids == (f"SWR-{WIDGET}", f"SWR-{GADGET}")
    assert all(
        projection.state is EvidenceState.SATISFIED for projection in evaluator.projections.values()
    )

    # A commit that removes the widget's covering test.
    (workspace / "tests" / "test_widget.py").unlink()
    git(workspace, "add", "-A")
    git(workspace, "commit", "-m", "drop the widget's covering test")

    evaluator.submit(event(EvaluationTrigger.COMMIT, at=AFTER_WINDOW))
    after_commit = evaluator.run_due(AFTER_WINDOW + dt.timedelta(seconds=1))
    assert after_commit is not None
    assert evaluate.passes == 2
    assert after_commit.changed_ids == (f"SWR-{WIDGET}",)
    assert after_commit.changes[0].previous is EvidenceState.SATISFIED
    assert after_commit.changes[0].current is EvidenceState.MISSING
    assert evaluator.projections[f"SWR-{GADGET}"].state is EvidenceState.SATISFIED

    # A branch switch back to the commit that still had the test.
    git(workspace, "checkout", "-b", "before-the-drop", "HEAD~1")
    switched_at = AFTER_WINDOW + dt.timedelta(seconds=2)
    evaluator.submit(event(EvaluationTrigger.BRANCH_SWITCH, at=switched_at))
    after_switch = evaluator.run_due(switched_at + dt.timedelta(seconds=1))

    assert after_switch is not None
    assert evaluate.passes == 3
    assert after_switch.changed_ids == (f"SWR-{WIDGET}",)
    assert after_switch.changes[0].current is EvidenceState.SATISFIED
    assert [outcome.succeeded for outcome in published] == [True, True, True]
    assert len(published) == 3


@verifies(SWR.SWR_3210)
def test_a_burst_of_git_events_costs_one_pass_over_the_repository(workspace: Path) -> None:
    """A rebase's event storm reads the repository once, not once per commit."""
    evaluate = RepositoryEvaluation(workspace)
    evaluator = RequirementEvaluator(evaluate, debounce_ms=DEBOUNCE_MS)

    for offset_ms, trigger in enumerate(
        (
            EvaluationTrigger.COMMIT,
            EvaluationTrigger.COMMIT,
            EvaluationTrigger.MERGE,
            EvaluationTrigger.BRANCH_SWITCH,
        ),
    ):
        (workspace / "src" / "widget.py").write_text(
            f"@{T}(SWR.SWR_{WIDGET})\ndef widget() -> int:\n    return {offset_ms}\n",
            encoding="utf-8",
        )
        git(workspace, "commit", "-am", f"edit {offset_ms}")
        evaluator.submit(event(trigger, at=AT + dt.timedelta(milliseconds=offset_ms * 50)))

    assert evaluator.run_due(AT + dt.timedelta(milliseconds=200)) is None
    outcome = evaluator.run_due(AT + dt.timedelta(seconds=2))

    assert outcome is not None
    assert evaluate.passes == 1
    assert len(outcome.request.events) == 4
    assert outcome.request.coalesced
    assert set(outcome.request.triggers) == {
        EvaluationTrigger.COMMIT,
        EvaluationTrigger.MERGE,
        EvaluationTrigger.BRANCH_SWITCH,
    }


@verifies(SWR.SWR_3210, SWR.SWR_3116)
def test_an_event_that_names_its_requirements_evaluates_only_those(workspace: Path) -> None:
    """A source edit that touched one artefact does not re-read the whole store."""
    evaluate = RepositoryEvaluation(workspace)
    evaluator = RequirementEvaluator(evaluate, debounce_ms=DEBOUNCE_MS)

    evaluator.submit(event(EvaluationTrigger.SOURCE_EDIT, req_ids=(f"SWR-{WIDGET}",)))
    outcome = evaluator.run_due(AFTER_WINDOW)

    assert outcome is not None
    assert outcome.request.scope == (f"SWR-{WIDGET}",)
    assert outcome.changed_ids == (f"SWR-{WIDGET}",)
    assert set(evaluator.projections) == {f"SWR-{WIDGET}"}


# -- a failing pass keeps the last good answer (SWR-3210) ------------------


@verifies(SWR.SWR_3210)
def test_a_repository_that_cannot_be_read_leaves_the_previous_projection_standing(
    workspace: Path,
) -> None:
    """The board keeps the answer the user was looking at, and says what broke."""
    evaluate = RepositoryEvaluation(workspace)
    evaluator = RequirementEvaluator(evaluate, debounce_ms=DEBOUNCE_MS)

    evaluator.submit(event(EvaluationTrigger.MANUAL))
    evaluator.run_due(AFTER_WINDOW)
    before = evaluator.projections
    assert before

    evaluate.fail_next = True
    evaluator.submit(event(EvaluationTrigger.COMMIT, at=AFTER_WINDOW))
    failed = evaluator.run_due(AFTER_WINDOW + dt.timedelta(seconds=1))

    assert failed is not None
    assert not failed.succeeded
    assert failed.failure is not None
    assert "could not be read" in failed.failure.message
    assert evaluator.projections == before

    evaluate.fail_next = False
    evaluator.submit(event(EvaluationTrigger.MANUAL, at=AFTER_WINDOW + dt.timedelta(seconds=2)))
    recovered = evaluator.run_due(AFTER_WINDOW + dt.timedelta(seconds=3))
    assert recovered is not None
    assert recovered.succeeded


# -- an evaluation over a repository still cannot start one (SWR-3210) -----


@verifies(SWR.SWR_3210)
def test_an_evaluation_over_a_real_repository_cannot_schedule_another_one(
    workspace: Path,
) -> None:
    """Termination holds where it matters: the pass that reads git cannot re-enter."""
    evaluator: RequirementEvaluator
    evaluate = RepositoryEvaluation(workspace)

    def read_and_reschedule(request: EvaluationRequest) -> dict[str, EvidenceProjection]:
        projections = evaluate(request)
        evaluator.submit(event(EvaluationTrigger.COMMIT, at=request.started_at))
        return projections

    evaluator = RequirementEvaluator(read_and_reschedule, debounce_ms=DEBOUNCE_MS)
    evaluator.submit(event(EvaluationTrigger.COMMIT))
    outcome = evaluator.run_due(AFTER_WINDOW)

    assert outcome is not None
    assert not outcome.succeeded
    assert outcome.failure is not None
    assert outcome.failure.error_type == EvaluationReentryError.__name__
    assert evaluate.passes == 1
    # The pass terminated and left nothing queued behind it.
    assert evaluator.pending == ()
    assert evaluator.run_due(AFTER_WINDOW + dt.timedelta(minutes=5)) is None
    assert evaluate.passes == 1


@verifies(SWR.SWR_3210)
def test_reading_the_repository_happens_off_the_thread_that_drew_the_board(
    workspace: Path,
) -> None:
    """The pass costs a repository sweep, so it never blocks the UI thread."""
    evaluate = RepositoryEvaluation(workspace)
    evaluator = RequirementEvaluator.off_thread(evaluate, debounce_ms=DEBOUNCE_MS)
    evaluator.submit(event(EvaluationTrigger.MANUAL))

    ran_on: list[int] = []
    outcomes: list[EvaluationOutcome | None] = []

    def worker() -> None:
        ran_on.append(threading.get_ident())
        outcomes.append(evaluator.run_due(AFTER_WINDOW))

    thread = threading.Thread(target=worker)
    thread.start()
    thread.join(timeout=60)

    assert ran_on and ran_on[0] != threading.get_ident()
    outcome = outcomes[0]
    assert outcome is not None
    assert outcome.succeeded
    assert set(outcome.changed_ids) == {f"SWR-{WIDGET}", f"SWR-{GADGET}"}
    assert evaluator.projections[f"SWR-{WIDGET}"].state_of(EvidenceKind.TEST) is (
        EvidenceState.SATISFIED
    )
