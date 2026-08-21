"""Productive use: a user drops a requirement on Ready in a real checkout and walks away.
Rotaris snapshots it, gives it a worktree of its own, runs an agent there, verifies the
work, records the run and hands back a reviewable result — on a machine with no display, no
desktop app and no model endpoint.
Expected outcome: the whole path runs headlessly without importing the `rotaris` desktop
package; the base checkout is never written to; the execution history names the real branch
and the real commits and survives the worktree being removed; a provider outage blocks the
requirement with its reason and keeps every failed attempt's work; and a technical
requirement the run proposes lands in the project's own store and passes its own check."""

from __future__ import annotations

import datetime as dt
import subprocess
import sys
import textwrap
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.coverage import requirement_coverage
from rotaris_core.reqtocode.verifier import VerificationResult, check_technical_links
from rotaris_core.requirements.delivery.audit import AuditStore
from rotaris_core.requirements.delivery.evidence import EvidenceInputs
from rotaris_core.requirements.delivery.projection import (
    BoardInputs,
    RunOutcome,
    UnitState,
    project_board,
)
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import TransitionRequest
from rotaris_core.requirements.execution.context import (
    CONTEXT_ELEMENTS,
    ContextElement,
    build_agent_context,
)
from rotaris_core.requirements.execution.decomposition import (
    Decomposer,
    RequirementAssessment,
)
from rotaris_core.requirements.execution.derivation import (
    RequirementDerivation,
    TechnicalRequirementProposal,
)
from rotaris_core.requirements.execution.flow import (
    FLOW_STAGES,
    FlowStage,
    FlowStateStore,
    RequirementFlow,
    RetryPolicy,
    StageEvent,
)
from rotaris_core.requirements.execution.history import ExecutionHistory
from rotaris_core.requirements.execution.reader import WorkspaceExecution
from rotaris_core.requirements.execution.run_seam import (
    GitIsolation,
    RequirementRunSeam,
    RunReport,
    UnitLaunch,
)
from rotaris_core.requirements.execution.snapshot import (
    SPECIFICATION_CHANGED_CONDITION,
    ExecutionTransitions,
    SnapshotStore,
)
from rotaris_core.requirements.execution.store import IntegrationLog, UnitStore
from rotaris_core.requirements.execution.units import UnitSpec, plan_units
from rotaris_core.requirements.model import CanonicalRequirement, RelationKind
from rotaris_core.requirements.registry import RequirementIndex
from rotaris_core.requirements.relations import ReverseRelationKind, build_relation_graph
from rotaris_core.requirements.sources.reqtocode import ReqToCodeSource
from rotaris_core.requirements.writeback import RequirementWriteBack
from rotaris_core.verifier.requirement_evidence import CoveringTest, RequirementSite

if TYPE_CHECKING:
    from collections.abc import Callable, Iterator

pytestmark = pytest.mark.integration

REQ = "SWR-3413"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
USER = DeliveryActor.user("dvf")
REPO_ROOT = Path(__file__).resolve().parents[2]


# --------------------------------------------------------------------------
# a real repository, a real worktree, a real commit
# --------------------------------------------------------------------------


def git(cwd: Path, *args: str) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=cwd,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout


def repository(root: Path) -> Path:
    git(root, "init", "-b", "main")
    git(root, "config", "user.name", "Test User")
    git(root, "config", "user.email", "test@example.invalid")
    (root / ".gitignore").write_text(".rotaris/\n", encoding="utf-8")
    (root / "base.txt").write_text("base\n", encoding="utf-8")
    git(root, "add", ".")
    git(root, "commit", "-m", "initial")
    return root


def requirement(req_id: str = REQ) -> CanonicalRequirement:
    return CanonicalRequirement(
        req_id=req_id,
        title="Ready starts the agentic requirement flow",
        description="Releasing a requirement is enough; everything after it is Rotaris' job.",
        source_id="specs",
        source_path=f"docs/requirements/{req_id}.md",
        source_revision="rev-1",
    )


def ticking(start: dt.datetime = AT) -> Callable[[], dt.datetime]:
    counter = iter(range(100_000))
    return lambda: start + dt.timedelta(seconds=next(counter))


class CommittingHost:
    """A host that does what an agent does: change a file in its own worktree."""

    def __init__(self, filename: str = "unit.txt") -> None:
        self.filename = filename
        self.launches: list[UnitLaunch] = []

    def start(self, launch: UnitLaunch) -> RunReport:
        self.launches.append(launch)
        tree = Path(launch.workspace.path)
        (tree / self.filename).write_text(f"{launch.req_id}/{launch.unit_id}\n", encoding="utf-8")
        git(tree, "add", self.filename)
        git(
            tree,
            "-c",
            "user.name=rotaris",
            "-c",
            "user.email=rotaris@local",
            "commit",
            "-m",
            f"work for {launch.unit_id}",
        )
        return RunReport(
            outcome=RunOutcome.SUCCEEDED,
            session_id=launch.run_id,
            produced_commits=(git(tree, "rev-parse", "HEAD").strip(),),
            changed_files=(self.filename,),
            verified=True,
            verification_detail="1 check(s) passed",
            agent_summary="committed the unit's work",
            agent_claimed_complete=True,
        )


class OutageHost:
    """The provider is down. Every attempt fails the same way."""

    def __init__(self, reason: str = "the model provider returned 503") -> None:
        self.reason = reason
        self.launches: list[UnitLaunch] = []

    def start(self, launch: UnitLaunch) -> RunReport:
        self.launches.append(launch)
        return RunReport(outcome=RunOutcome.FAILED, failure_reason=self.reason)


def released(
    base: Path,
    req_id: str = REQ,
    *,
    current_for: Callable[[str], CanonicalRequirement] | None = None,
) -> ExecutionTransitions:
    """A requirement a user has dropped on Ready — the flow's starting point.

    Built through the guarded write path rather than a bare
    :class:`DeliveryTransitions`, because that is the only writer a run may use:
    it is what keeps ``Done`` unreachable after a mid-run edit (SWR-3403) and
    what appends the audit trail (SWR-3213).
    """
    transitions = ExecutionTransitions.for_workspace(
        base,
        current_for=current_for if current_for is not None else (lambda rid: requirement(rid)),
    )
    outcome = transitions.apply(
        TransitionRequest(
            req_id=req_id,
            target=DeliveryState.READY,
            actor=USER,
            cause=TransitionCause.USER_ACTION,
            at=AT,
        ),
    )
    assert outcome.accepted, outcome.message
    return transitions


def flow_over(
    base: Path,
    *,
    host: object,
    retry: RetryPolicy | None = None,
    observer: Callable[[StageEvent], None] | None = None,
    decomposer: Decomposer | None = None,
    assess: Callable[[CanonicalRequirement], RequirementAssessment] | None = None,
    transitions: ExecutionTransitions | None = None,
    current_for: Callable[[str], CanonicalRequirement] | None = None,
) -> tuple[RequirementFlow, ExecutionHistory, DeliveryStore]:
    store = DeliveryStore(base)
    history = ExecutionHistory(base)
    read_current = current_for if current_for is not None else (lambda rid: requirement(rid))
    flow = RequirementFlow(
        transitions=(
            transitions if transitions is not None else released(base, current_for=read_current)
        ),
        seam=RequirementRunSeam(
            isolation=GitIsolation(base),
            host=host,  # type: ignore[arg-type]
            clock=ticking(),
            snapshots=SnapshotStore(base),
        ),
        # The requirement as its source holds it *now* — the flow re-reads it at
        # the review and compares it with the snapshot (SWR-3403).
        current_for=read_current,
        history=history,
        decomposer=decomposer,
        assess=assess,
        retry=retry,
        clock=ticking(),
        observer=observer,
        progress=FlowStateStore(base),
        units=UnitStore(base),
        integrations=IntegrationLog(base),
    )
    return flow, history, store


def desktop_modules() -> set[str]:
    return {
        name
        for name in sys.modules
        if name == "rotaris" or name.startswith(("rotaris.", "PySide6", "PyQt"))
    }


@pytest.fixture
def no_desktop_import() -> Iterator[None]:
    """Fails if the test body pulls the desktop package into the interpreter."""
    before = desktop_modules()
    yield
    assert desktop_modules() - before == set()


# -- the product promise: Ready to Review, headlessly ----------------------


@verifies(SWR.SWR_3413, SWR.SWR_3416)
def test_ready_reaches_review_headlessly_over_a_real_checkout(
    tmp_path: Path,
    no_desktop_import: None,
) -> None:
    """The user flow of the slice: release it, walk away, come back to a result."""
    base = repository(tmp_path)
    head = git(base, "rev-parse", "HEAD").strip()
    host = CommittingHost()
    seen: list[StageEvent] = []
    flow, history, store = flow_over(base, host=host, observer=seen.append)

    result = flow.start(requirement(), base_commit=head)

    assert result.succeeded, result.message
    assert result.final_state is DeliveryState.REVIEW
    assert set(result.stage_names) == set(FLOW_STAGES)
    assert [event.stage for event in seen][0] is FlowStage.SNAPSHOT

    # The requirement's own state, as the store holds it after the flow.
    assert store.read(REQ).state is DeliveryState.REVIEW

    # A real worktree, on a requirement branch, holding the unit's work.
    launch = host.launches[0]
    tree = Path(launch.workspace.path)
    assert tree.is_dir()
    assert (tree / "unit.txt").read_text(encoding="utf-8").startswith(REQ)
    assert launch.workspace.branch.startswith("rotaris/req/swr-3413/")
    assert launch.workspace.branch in git(base, "branch", "--list", "rotaris/req/*")

    # Nothing was written into the base checkout (SWR-3405).
    assert git(base, "rev-parse", "HEAD").strip() == head
    assert git(base, "status", "--porcelain").strip() == ""

    # The run is in the history with its real commits (SWR-3414).
    stored = history.load(REQ)
    assert stored.run_ids == result.run_ids
    assert stored.branches == (launch.workspace.branch,)
    assert len(stored.implementation_commits) == 1
    assert stored.implementation_commits[0] != head


@verifies(SWR.SWR_3416, SWR.SWR_3413)
def test_the_whole_flow_pulls_in_neither_qt_nor_the_desktop_package() -> None:
    """Checked in a fresh interpreter, so nothing another test imported can hide it."""
    program = textwrap.dedent(
        """
        import datetime as dt
        import sys

        from rotaris_core.requirements.delivery.state import (
            DeliveryActor, DeliveryState, DeliveryStatus, TransitionCause,
        )
        from rotaris_core.requirements.delivery.store import DeliveryRecord
        from rotaris_core.requirements.delivery.projection import RunOutcome
        from rotaris_core.requirements.delivery.transitions import apply_transition
        from rotaris_core.requirements.execution.flow import RequirementFlow
        from rotaris_core.requirements.execution.run_seam import (
            RequirementRunSeam, RunReport, RunWorkspace,
        )
        from rotaris_core.requirements.model import CanonicalRequirement

        AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)


        class Transitions:
            enforces_specification_guard = True

            def __init__(self):
                self.events = []
                self.record = DeliveryRecord(
                    req_id="SWR-3413",
                    delivery=DeliveryStatus(
                        state=DeliveryState.READY,
                        changed_at=AT,
                        changed_by=DeliveryActor.user("dvf"),
                        cause=TransitionCause.USER_ACTION,
                    ),
                )

            def apply(self, request):
                outcome = apply_transition(self.record, request)
                if outcome.accepted:
                    self.record = outcome.record
                return outcome

            def record_event(self, event):
                self.events.append(event)
                return event


        class Isolation:
            def provide(self, request):
                return RunWorkspace(path="/tmp/tree", branch=request.branch or "b")


        class Host:
            def start(self, launch):
                return RunReport(
                    outcome=RunOutcome.SUCCEEDED,
                    produced_commits=("c1",),
                    changed_files=("f.py",),
                    verified=True,
                )


        spec = CanonicalRequirement(req_id="SWR-3413", title="t", description="d")
        flow = RequirementFlow(
            transitions=Transitions(),
            seam=RequirementRunSeam(isolation=Isolation(), host=Host()),
            current_for=lambda req_id: spec,
        )
        result = flow.start(spec, base_commit="base0001")
        assert result.final_state is DeliveryState.REVIEW, result.message

        offenders = sorted(
            name
            for name in sys.modules
            if name == "rotaris"
            or name.startswith(("rotaris.", "PySide6", "PyQt", "shiboken"))
        )
        print(",".join(offenders))
        """,
    )

    completed = subprocess.run(
        [sys.executable, "-c", program],
        capture_output=True,
        text=True,
        check=False,
        timeout=180,
    )

    assert completed.returncode == 0, completed.stderr
    assert completed.stdout.strip() == ""


# -- SWR-3414: the history outlives the worktree ---------------------------


@verifies(SWR.SWR_3414)
def test_the_history_names_the_real_branch_and_commits_after_the_worktree_is_gone(
    tmp_path: Path,
) -> None:
    base = repository(tmp_path)
    head = git(base, "rev-parse", "HEAD").strip()
    host = CommittingHost()
    flow, history, _ = flow_over(base, host=host)

    result = flow.start(requirement(), base_commit=head)
    assert result.succeeded, result.message

    tree = Path(host.launches[0].workspace.path)
    branch = host.launches[0].workspace.branch
    commit = history.load(REQ).implementation_commits[0]

    git(base, "worktree", "remove", "--force", str(tree))
    git(base, "branch", "-D", branch)

    assert not tree.exists()
    assert branch not in git(base, "branch", "--list", "rotaris/req/*")
    stored = ExecutionHistory(base).load(REQ)
    assert stored.branches == (branch,)
    assert stored.worktrees == (str(tree),)
    assert stored.implementation_commits == (commit,)
    assert stored.runs[0].base_commit == head


# -- SWR-3415: a provider outage, three attempts, the work kept ------------


@verifies(SWR.SWR_3415)
def test_a_provider_outage_blocks_the_requirement_and_keeps_every_attempt(
    tmp_path: Path,
) -> None:
    """The user flow: the provider went down; the requirement says so and the work is there."""
    base = repository(tmp_path)
    head = git(base, "rev-parse", "HEAD").strip()
    host = OutageHost()
    flow, history, store = flow_over(base, host=host, retry=RetryPolicy(limit=2))

    result = flow.start(requirement(), base_commit=head)

    assert not result.succeeded
    assert result.failed_stage is FlowStage.RUN
    assert result.final_state is DeliveryState.BLOCKED
    record = store.read(REQ)
    assert record.state is DeliveryState.BLOCKED
    assert "the model provider returned 503" in record.delivery.blocked_reason
    assert record.delivery.blocked_from is DeliveryState.RUNNING

    # Three attempts, three branches, three trees — all still on disk.
    assert len(host.launches) == 3
    branches = [launch.workspace.branch for launch in host.launches]
    assert len(set(branches)) == 3
    for launch in host.launches:
        assert Path(launch.workspace.path).is_dir()
    listed = git(base, "branch", "--list", "rotaris/req/*")
    for branch in branches:
        assert branch in listed

    # And all three records are retained, each naming what failed.
    stored = history.load(REQ)
    assert len(stored.runs) == 3
    assert len(stored.failed) == 3
    assert all("503" in run.failure_reason for run in stored.failed)
    assert stored.implementation_commits == ()
    # The base is exactly where it was.
    assert git(base, "rev-parse", "HEAD").strip() == head
    assert git(base, "status", "--porcelain").strip() == ""


# -- SWR-3403: the requirement moved while its run was in flight ------------


class EditingHost(CommittingHost):
    """An agent that works while the user edits the requirement under it.

    The dangerous case of SWR-3403, reproduced honestly: the edit happens
    *during* the run, after the snapshot was taken and before the review, and
    nothing in the run itself notices.
    """

    def __init__(self, source: dict[str, CanonicalRequirement]) -> None:
        super().__init__()
        self._source = source

    def start(self, launch: UnitLaunch) -> RunReport:
        current = self._source[REQ]
        self._source[REQ] = current.evolve(
            description="The user rewrote this requirement while the agent was working.",
        )
        return super().start(launch)


@verifies(SWR.SWR_3403)
def test_a_requirement_edited_mid_run_lands_in_review_with_both_hashes(
    tmp_path: Path,
) -> None:
    """The user flow: edit a running requirement, get the conflict — not a green Done."""
    base = repository(tmp_path)
    head = git(base, "rev-parse", "HEAD").strip()
    original = requirement()
    source = {REQ: original}
    host = EditingHost(source)
    flow, _, store = flow_over(base, host=host, current_for=lambda req_id: source[req_id])

    result = flow.start(original, base_commit=head)

    edited = source[REQ]
    assert edited.current_hash != original.current_hash, "the specification really moved"

    # Review, never Done — and both versions are on the result.
    assert result.final_state is DeliveryState.REVIEW
    assert result.review is not None
    assert result.review.specification_changed
    assert result.review.snapshot_hash == original.current_hash
    assert result.review.current_hash == edited.current_hash

    # The delivery record says the same thing, and says why.
    record = store.read(REQ)
    assert record.state is DeliveryState.REVIEW
    assert record.satisfied_hash is None, "nothing was recorded as delivered"
    assert record.delivery.cause is TransitionCause.SPECIFICATION_CHANGED

    # And the trail carries the event itself, with both hashes in their own
    # fields — SWR-3403's fourth condition, on disk (SWR-3213).
    trail = AuditStore(base).read(REQ)
    into_review = trail.transitions()[-1]
    assert into_review.to_state is DeliveryState.REVIEW
    assert original.current_hash in into_review.detail
    assert edited.current_hash in into_review.detail
    changes = trail.specification_changes()
    assert len(changes) == 1, trail.summary
    assert changes[0].satisfied_hash == original.current_hash
    assert changes[0].requirement_hash == edited.current_hash
    assert changes[0].reason == "specification changed during execution"
    assert AuditStore(base).path_for(REQ).is_file()
    assert trail.last_specification_change() == changes[0]


@verifies(SWR.SWR_3403)
def test_the_drifted_review_cannot_be_accepted_as_done_whatever_the_gate_says(
    tmp_path: Path,
) -> None:
    """The second half of the rule, over the real store: Done stays unreachable."""
    base = repository(tmp_path)
    head = git(base, "rev-parse", "HEAD").strip()
    original = requirement()
    source = {REQ: original}
    permissive_calls: list[str] = []

    def permissive(
        _record: object,
        request: TransitionRequest,
    ) -> tuple[()]:
        """A workspace gate that is happy with everything."""
        permissive_calls.append(request.req_id)
        return ()

    transitions = ExecutionTransitions.for_workspace(
        base,
        current_for=lambda req_id: source[req_id],
        completion=permissive,  # type: ignore[arg-type]
    )
    ready = transitions.apply(
        TransitionRequest(
            req_id=REQ,
            target=DeliveryState.READY,
            actor=USER,
            cause=TransitionCause.USER_ACTION,
            at=AT,
        ),
    )
    assert ready.accepted, ready.message
    flow, history, store = flow_over(
        base,
        host=EditingHost(source),
        transitions=transitions,
        current_for=lambda req_id: source[req_id],
    )

    assert flow.start(original, base_commit=head).final_state is DeliveryState.REVIEW

    run = history.load(REQ).runs[-1]
    accepted = transitions.apply(
        TransitionRequest(
            req_id=REQ,
            target=DeliveryState.DONE,
            actor=USER,
            cause=TransitionCause.COMPLETION_ACCEPTED,
            at=AT + dt.timedelta(hours=1),
            requirement_hash=source[REQ].current_hash,
            delivery=SatisfiedDelivery(
                satisfied_hash=original.current_hash,
                satisfied_at=AT + dt.timedelta(hours=1),
                run_id=run.run_id,
                verified_commit=run.produced_commits[0],
            ),
        ),
    )

    assert not accepted.accepted, "a permissive gate cannot vote the mismatch away"
    assert permissive_calls == [REQ], "the workspace's own gate was asked, and wrapped"
    refusal = accepted.refusal
    assert refusal is not None
    assert [condition.name for condition in refusal.unmet] == [SPECIFICATION_CHANGED_CONDITION]
    assert original.current_hash in refusal.unmet[0].detail
    assert source[REQ].current_hash in refusal.unmet[0].detail
    assert store.read(REQ).state is DeliveryState.REVIEW


# -- SWR-3407: a context over this repository's real store ------------------


@verifies(SWR.SWR_3407)
def test_a_context_over_the_real_store_carries_the_real_traces_and_tests() -> None:
    """Built from the repository's own requirements and its own annotation sweep."""
    source = ReqToCodeSource(REPO_ROOT)
    read = source.read()
    subject = read.by_id().get("SWR-3407")
    assert subject is not None, "this repository declares SWR-3407"

    coverage = requirement_coverage(REPO_ROOT, 3407)
    assert coverage.is_traced, "SWR-3407 is implemented in this repository"
    assert coverage.is_test_covered, "and covered by a test"

    projection = project_board(
        BoardInputs(
            index=RequirementIndex(requirements=(subject,), generation=1),
            evidence={
                "SWR-3407": EvidenceInputs(
                    req_id="SWR-3407",
                    requirement_hash=subject.current_hash,
                    implementations=tuple(
                        RequirementSite(path=site.path, line=site.line)
                        for site in coverage.implementations
                    ),
                    covering_tests=tuple(
                        CoveringTest(path=site.path, line=site.line, executed=False)
                        for site in coverage.tests
                    ),
                ),
            },
        ),
    )
    entry = projection.entry("SWR-3407")
    assert entry is not None

    from rotaris_core.requirements.execution.snapshot import capture_snapshot

    unit = plan_units("SWR-3407", [UnitSpec(key="impl", scope="the context builder")]).units[0]
    context = build_agent_context(
        entry=entry,
        snapshot=capture_snapshot(subject, run_id="run-1", base_commit="head", at=AT),
        unit=unit,
        architecture=("docs/architecture/02-code-topology.md",),
    )

    assert any(
        address.endswith("requirements/execution/context.py") or "context.py" in address
        for address in context.trace_addresses
    ), context.trace_addresses
    assert any("test_agent_context.py" in address for address in context.test_addresses)
    assert context.snapshot.requirement_hash == subject.current_hash
    accounted = {element for element in CONTEXT_ELEMENTS if context.present(element)} | {
        entry_.element for entry_ in context.absent
    }
    assert accounted == set(CONTEXT_ELEMENTS)
    assert not context.present(ContextElement.WORKTREE)


# -- SWR-3411: a derived technical requirement in a real Markdown store ----


EPIC_INDEX = """---
req-id: SWR-3400
status: approved
trace: optional
test: optional
title: "Requirement Execution"
date: 2026-08-14
---

# SWR-3400 — Requirement Execution

The epic.

## Requirements

| ID | Title | Status |
| --- | --- | --- |
| [SWR-3411](3400-requirement-execution/SWR-3411-derived.md) | Execution can derive technical requirements | approved |
"""

ORIGIN_DOC = """---
req-id: SWR-3411
status: approved
trace: required
test: required
title: "Execution can derive technical requirements"
epic: SWR-3400
date: 2026-08-14
---

# SWR-3411 — Execution can derive technical requirements

A run may propose a technical requirement with type technical and derived-from naming
its origin.

Epic: [SWR-3400](../3400-requirement-execution.md)
"""


def synthetic_store(root: Path) -> Path:
    requirements = root / "docs" / "requirements"
    (requirements / "3400-requirement-execution").mkdir(parents=True)
    (requirements / "3400-requirement-execution.md").write_text(EPIC_INDEX, encoding="utf-8")
    (requirements / "3400-requirement-execution" / "SWR-3411-derived.md").write_text(
        ORIGIN_DOC,
        encoding="utf-8",
    )
    return root


@verifies(SWR.SWR_3411)
def test_a_run_writes_a_derived_technical_requirement_the_store_accepts(
    tmp_path: Path,
) -> None:
    """The user flow: a run proposes it, accepting it updates the project's own store."""
    root = synthetic_store(tmp_path)
    source = ReqToCodeSource(root)
    derivation = RequirementDerivation(RequirementWriteBack([source]), source_id=source.source_id)

    outcome = derivation.derive(
        TechnicalRequirementProposal(
            origin="SWR-3411",
            title="Deterministic merge journal",
            description="Every integration writes a replayable journal entry.",
            epic="SWR-3400",
            run_id="run-1",
            proposed_at=AT,
        ),
    )

    assert outcome.accepted, outcome.message
    created = outcome.created
    assert created is not None
    assert created.permanent
    assert created.source_path is not None
    document = (root / created.source_path).read_text(encoding="utf-8")
    assert "type: technical" in document
    assert "derived-from: SWR-3411" in document

    # The project's own store now lists it, and the origin gained the reciprocal link.
    after = ReqToCodeSource(root).read().by_id()
    assert created.req_id in after
    graph = build_relation_graph(after.values())
    assert graph.sources("SWR-3411", ReverseRelationKind.DERIVED_REQUIREMENTS) == (created.req_id,)
    assert graph.targets(created.req_id, RelationKind.DERIVED_FROM) == ("SWR-3411",)
    index_text = (root / "docs" / "requirements" / "3400-requirement-execution.md").read_text(
        encoding="utf-8",
    )
    assert created.req_id in index_text

    # And ReqToCode's own technical-link check accepts the result.
    from rotaris_core.reqtocode.generator import parse_requirements

    parsed = parse_requirements(root)
    result = VerificationResult()
    check_technical_links(parsed.requirements, result)
    assert result.errors == [], result.errors


@verifies(SWR.SWR_3411)
def test_a_read_only_store_refuses_the_proposal_without_failing_the_run(
    tmp_path: Path,
) -> None:
    root = synthetic_store(tmp_path)

    class ReadOnly(ReqToCodeSource):
        capabilities = ReqToCodeSource.capabilities.model_copy(
            update={"supported": frozenset({"read"})},  # type: ignore[arg-type]
        )

    source = ReadOnly(root)
    derivation = RequirementDerivation(RequirementWriteBack([source]), source_id=source.source_id)

    outcome = derivation.derive(
        TechnicalRequirementProposal(origin="SWR-3411", title="Deterministic merge journal"),
    )

    assert outcome.refused
    assert not outcome.run_failed
    assert "does not support" in outcome.reason
    files = sorted(path.name for path in (root / "docs" / "requirements").rglob("*.md"))
    assert files == ["3400-requirement-execution.md", "SWR-3411-derived.md"]


# -- the multi-unit flow, with real worktrees ------------------------------


@verifies(SWR.SWR_3413, SWR.SWR_3404)
def test_two_units_get_two_branches_and_two_trees_and_reach_review(tmp_path: Path) -> None:
    base = repository(tmp_path)
    head = git(base, "rev-parse", "HEAD").strip()
    host = CommittingHost()

    class Planner:
        def propose(self, request: object) -> dict[str, object]:
            del request
            return {
                "rationale": "engine and board move independently",
                "units": [
                    {"key": "engine", "scope": "src/", "rationale": "the engine half"},
                    {
                        "key": "board",
                        "scope": "apps/",
                        "rationale": "reads the engine's shape",
                        "depends_on": ["engine"],
                    },
                ],
            }

    flow, history, store = flow_over(
        base,
        host=host,
        decomposer=Decomposer(model=Planner(), clock=ticking()),  # type: ignore[arg-type]
        assess=lambda _: RequirementAssessment(req_id=REQ, affected_components=9),
    )

    result = flow.start(requirement(), base_commit=head)

    assert result.succeeded, result.message
    assert result.units is not None
    assert result.units.count == 2
    assert all(unit.state is UnitState.FINISHED for unit in result.units.units)
    branches = {launch.workspace.branch for launch in host.launches}
    trees = {launch.workspace.path for launch in host.launches}
    assert len(branches) == 2
    assert len(trees) == 2
    assert len(history.load(REQ).runs) == 2
    assert store.read(REQ).state is DeliveryState.REVIEW
    assert git(base, "status", "--porcelain").strip() == ""


@verifies(SWR.SWR_3401, SWR.SWR_3216)
def test_units_survive_the_run_that_created_them_and_are_readable_beside_the_delivery_record(
    tmp_path: Path,
) -> None:
    """Productive use: the run is over, the process is gone, and a board opens the workspace.

    Expected outcome: the units the flow planned are still there — with their dependency
    edges, their finished states and the runs that executed them — read back through a
    store nobody kept a handle on, and joined with the delivery record the same flow wrote.
    """
    base = repository(tmp_path)
    head = git(base, "rev-parse", "HEAD").strip()
    host = CommittingHost()

    class Planner:
        def propose(self, request: object) -> dict[str, object]:
            del request
            return {
                "rationale": "the store and its reader are separable",
                "units": [
                    {"key": "engine", "scope": "src/", "rationale": "the engine half"},
                    {
                        "key": "board",
                        "scope": "apps/",
                        "rationale": "reads the engine's shape",
                        "depends_on": ["engine"],
                    },
                ],
            }

    flow, _history, store = flow_over(
        base,
        host=host,
        decomposer=Decomposer(model=Planner(), clock=ticking()),  # type: ignore[arg-type]
        assess=lambda _: RequirementAssessment(req_id=REQ, affected_components=9),
    )
    result = flow.start(requirement(), base_commit=head)
    assert result.succeeded, result.message
    assert result.units is not None

    # Fresh objects over the same workspace — everything the flow held is gone.
    reloaded = UnitStore(base).load(REQ)
    summary = WorkspaceExecution(base).execution_for(REQ)

    assert reloaded.ids == result.units.ids
    engine, board = reloaded.units
    assert board.depends_on == (engine.unit_id,), "the dependency edge outlived the process"
    assert all(unit.state is UnitState.FINISHED for unit in reloaded.units)
    assert [unit.unit_id for unit in summary.units] == list(reloaded.ids)
    # The join with the run history: each unit carries the run that executed it.
    assert all(unit.runs for unit in summary.units)
    assert summary.branches == tuple(launch.workspace.branch for launch in host.launches), (
        "the branches on the board are the branches git actually created"
    )
    # And it sits beside the delivery record the same flow wrote (SWR-3205).
    assert store.read(REQ).state is DeliveryState.REVIEW
    assert UnitStore(base).path_for(REQ).parent != DeliveryStore(base).directory
