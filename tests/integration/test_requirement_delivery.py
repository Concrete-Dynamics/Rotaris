"""Productive use: this repository's own requirements are driven through delivery — an epic
card summarising its sixteen children, one requirement taken from Backlog to Done by a
run, and a history panel opened on a requirement whose file has two commits behind it.
Expected outcome: the aggregate answers match what the store actually declares, the audit
trail written along the way answers all nine of SWR-3213's questions, a run that passed
its gate but left the requirement uncovered cannot reach Done, and the revision history
names the real commits that touched the requirement's document."""

from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.requirements import build_hierarchy
from rotaris_core.requirements.delivery import (
    DeliveryActor,
    DeliveryState,
    DeliveryStore,
    DeliveryTransitions,
    RefusalKind,
    SatisfiedDelivery,
    TransitionCause,
    TransitionRequest,
)
from rotaris_core.requirements.delivery.audit import AuditEvent, AuditEventKind, AuditStore
from rotaris_core.requirements.delivery.completion import (
    CompletionCondition,
    CompletionEvidence,
    CompletionObligations,
    CoveringTestEvidence,
    UnitEvidence,
    UnitExecution,
    completion_gate,
)
from rotaris_core.requirements.delivery.epics import (
    ChildProgress,
    aggregate_epic,
    aggregate_epics,
    apply_epic_transition,
    counted_leaves,
)
from rotaris_core.requirements.delivery.evidence import EvidenceState
from rotaris_core.requirements.delivery.history import (
    GitArtifactRevisions,
    build_revision_history,
    recorded_hashes,
    resolve_hashes,
)
from rotaris_core.requirements.delivery.obligations import EvidenceKind
from rotaris_core.requirements.delivery.projection import (
    BoardProjection,
    BoardProjector,
    CoverageEvidence,
    StoredDetails,
)
from rotaris_core.requirements.registry import RequirementIndex
from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

if TYPE_CHECKING:
    from collections.abc import Iterator

    from rotaris_core.requirements.delivery.store import DeliveryRecord
    from rotaris_core.requirements.model import CanonicalRequirement

pytestmark = pytest.mark.integration

REPO_ROOT = Path(__file__).resolve().parents[2]
EPIC = "SWR-3200"
EPIC_DIR = REPO_ROOT / "docs" / "requirements" / "3200-requirement-delivery-state"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
LATER = dt.datetime(2026, 8, 14, 11, 0, tzinfo=dt.UTC)
USER = DeliveryActor.user("dvf")
RUNNER = DeliveryActor.system("requirement-runner")


@dataclass(frozen=True)
class Snapshot:
    """What a run captured at its start (SWR-3402), in the shape SWR-3204 needs."""

    req_id: str
    requirement_hash: str
    source_revision: str | None = None
    base_commit: str | None = None
    unit_id: str | None = None
    session_id: str | None = None


def declared_ids(folder: Path) -> tuple[str, ...]:
    """The requirement ids a store folder declares, read from its file names."""
    return tuple(
        sorted("-".join(path.name.split("-")[:2]) for path in folder.glob("SWR-*.md")),
    )


def repository_requirements() -> dict[str, CanonicalRequirement]:
    """This repository's own requirements, through the adapter seam (SWR-3103)."""
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None, "this repository has a ReqToCode store"
    return source.read().by_id()


def evidence_for(
    requirement: CanonicalRequirement,
    *,
    tests: tuple[CoveringTestEvidence, ...] = (),
    gate_passed: bool = True,
    satisfied_hash: str | None = None,
) -> CompletionEvidence:
    """The evidence a delivering run would present for *requirement*."""
    return CompletionEvidence(
        req_id=requirement.req_id,
        current_hash=requirement.current_hash,
        satisfied_hash=satisfied_hash,
        units=(UnitEvidence(unit_id="unit-1", execution=UnitExecution.FINISHED),),
        implementation_traces=("src/rotaris_core/requirements/delivery/completion.py:120",),
        covering_tests=tests,
        gate_passed=gate_passed,
        gate_detail="the project's check suite passed" if gate_passed else "",
    )


def move(
    transitions: DeliveryTransitions,
    req_id: str,
    target: DeliveryState,
    *,
    actor: DeliveryActor,
    cause: TransitionCause,
    at: dt.datetime = AT,
    requirement_hash: str = "",
    run_id: str | None = None,
    delivery: SatisfiedDelivery | None = None,
) -> DeliveryRecord:
    """Apply one transition through the real store and insist that it landed."""
    outcome = transitions.apply(
        TransitionRequest(
            req_id=req_id,
            target=target,
            actor=actor,
            cause=cause,
            at=at,
            requirement_hash=requirement_hash,
            run_id=run_id,
            delivery=delivery,
        ),
    )
    assert outcome.accepted, outcome.message
    return outcome.record


@verifies(SWR.SWR_3212)
def test_the_epic_aggregate_matches_what_this_repositorys_store_declares(tmp_path: Path) -> None:
    """The epic card's numbers, computed over the real hierarchy and a real store."""
    requirements = repository_requirements()
    hierarchy = build_hierarchy(requirements.values())
    leaves = counted_leaves(EPIC, hierarchy)

    assert leaves == declared_ids(EPIC_DIR), "the epic's children are the folder's requirements"
    assert len(leaves) >= 16

    store = DeliveryStore(tmp_path)
    transitions = DeliveryTransitions(store)
    first, second = leaves[0], leaves[1]
    move(
        transitions,
        first,
        DeliveryState.READY,
        actor=USER,
        cause=TransitionCause.USER_ACTION,
        requirement_hash=requirements[first].current_hash,
    )
    move(
        transitions,
        second,
        DeliveryState.READY,
        actor=USER,
        cause=TransitionCause.USER_ACTION,
    )
    move(
        transitions,
        second,
        DeliveryState.RUNNING,
        actor=RUNNER,
        cause=TransitionCause.RUN_STARTED,
        run_id="run-1",
    )

    progress = {
        req_id: ChildProgress.of_record(
            store.read(req_id),
            lifecycle=requirements[req_id].lifecycle,
            traced=requirements[req_id].trace_required,
            active_run_id="run-1" if req_id == second else None,
        )
        for req_id in leaves
    }
    epic = aggregate_epic(EPIC, hierarchy, progress)

    assert epic.total == len(leaves)
    assert epic.counts[DeliveryState.READY] == 1
    assert epic.counts[DeliveryState.RUNNING] == 1
    assert epic.counts[DeliveryState.BACKLOG] == len(leaves) - 2
    assert epic.state is DeliveryState.RUNNING
    assert [run.req_id for run in epic.active_runs] == [second]
    assert epic.deprecated == ()
    assert epic.completion == 0.0

    # And the epic itself cannot be dragged: its state follows from the rows above.
    refused = apply_epic_transition(
        store.read(EPIC),
        TransitionRequest(
            req_id=EPIC,
            target=DeliveryState.DONE,
            actor=USER,
            cause=TransitionCause.USER_ACTION,
            at=AT,
        ),
        hierarchy,
    )
    assert refused.refusal is not None
    assert refused.refusal.kind is RefusalKind.DERIVED_STATE
    assert not store.path_for(EPIC).exists(), "a refused transition writes nothing"


@verifies(SWR.SWR_3212)
def test_every_epic_in_this_repository_aggregates_without_a_special_case(tmp_path: Path) -> None:
    """Nested and flat epics alike, over the whole real store, with an empty store."""
    requirements = repository_requirements()
    hierarchy = build_hierarchy(requirements.values())
    store = DeliveryStore(tmp_path)

    progress = {
        req_id: ChildProgress.of_record(store.read(req_id), lifecycle=requirement.lifecycle)
        for req_id, requirement in requirements.items()
    }
    epics = aggregate_epics(hierarchy, progress)

    assert EPIC in epics
    assert all(epic.state is DeliveryState.BACKLOG for epic in epics.values()), (
        "a workspace Rotaris has never written to is Backlog everywhere"
    )
    assert not any(tmp_path.rglob("*.json")), "reading an epic writes nothing"
    counted = sum(epic.total for epic_id, epic in epics.items() if not hierarchy.depth(epic_id))
    assert counted <= len(requirements)
    deprecated = {
        req_id
        for req_id, requirement in requirements.items()
        if requirement.is_deprecated and hierarchy.parent_of(req_id)
    }
    if deprecated:
        excluded = {req_id for epic in epics.values() for req_id in epic.deprecated}
        assert deprecated & excluded, "a retired requirement is excluded from its epic's progress"


@verifies(SWR.SWR_3213, SWR.SWR_3215)
def test_a_full_delivery_cycle_leaves_a_trail_that_answers_every_audit_question(
    tmp_path: Path,
) -> None:
    """Backlog to Done over the real store, recorded as it happens (SWR-3213)."""
    requirements = repository_requirements()
    requirement = requirements["SWR-3213"]
    assert isinstance(requirement, CompletionObligations), (
        "a canonical requirement already carries the obligations the check needs"
    )

    store = DeliveryStore(tmp_path)
    audit = AuditStore(tmp_path)
    covering = CoveringTestEvidence(
        path="tests/unit/requirements/test_requirement_audit.py",
        line=142,
        executed=True,
        passed=True,
    )
    gate = completion_gate(
        lambda _record, _request: evidence_for(requirement, tests=(covering,)),
        obligations_for=requirements.get,
    )
    transitions = DeliveryTransitions(store, completion=gate)

    def record_move(
        target: DeliveryState,
        *,
        actor: DeliveryActor,
        cause: TransitionCause,
        at: dt.datetime,
        run_id: str | None = None,
        delivery: SatisfiedDelivery | None = None,
    ) -> None:
        """One move through the real store, and the audit record it produces."""
        outcome = transitions.apply(
            TransitionRequest(
                req_id=requirement.req_id,
                target=target,
                actor=actor,
                cause=cause,
                at=at,
                requirement_hash=requirement.current_hash,
                run_id=run_id,
                delivery=delivery,
            ),
        )
        assert outcome.accepted, outcome.message
        assert outcome.transition is not None
        audit.append(AuditEvent.of_transition(outcome.transition))

    record_move(DeliveryState.READY, actor=USER, cause=TransitionCause.USER_ACTION, at=AT)
    record_move(
        DeliveryState.RUNNING,
        actor=RUNNER,
        cause=TransitionCause.RUN_STARTED,
        at=AT,
        run_id="run-42",
    )
    audit.append(
        AuditEvent(
            req_id=requirement.req_id,
            kind=AuditEventKind.RUN_FINISHED,
            at=LATER,
            actor=RUNNER,
            run_id="run-42",
            changed_files=(
                "src/rotaris_core/requirements/delivery/audit.py",
                "tests/unit/requirements/test_requirement_audit.py",
            ),
        ),
    )
    audit.append(
        AuditEvent(
            req_id=requirement.req_id,
            kind=AuditEventKind.VERIFICATION,
            at=LATER,
            actor=RUNNER,
            run_id="run-42",
            tests=(covering.label,),
            verified=True,
        ),
    )
    record_move(
        DeliveryState.REVIEW,
        actor=RUNNER,
        cause=TransitionCause.RUN_COMPLETED,
        at=LATER,
        run_id="run-42",
    )
    record_move(
        DeliveryState.DONE,
        actor=USER,
        cause=TransitionCause.COMPLETION_ACCEPTED,
        at=LATER,
        delivery=SatisfiedDelivery.from_snapshot(
            Snapshot(
                req_id=requirement.req_id,
                requirement_hash=requirement.current_hash,
                source_revision=requirement.source_revision,
                unit_id="unit-1",
            ),
            run_id="run-42",
            at=LATER,
            verified_commit="c0ffee42",
        ),
    )

    stored = store.read(requirement.req_id)
    assert stored.state is DeliveryState.DONE
    assert stored.satisfied_hash == requirement.current_hash

    trail = audit.read(requirement.req_id)
    assert len(trail.events) == 6
    assert trail.implemented_versions() == (requirement.current_hash,)
    assert trail.implementing_run(requirement.current_hash) == "run-42"
    assert trail.files_changed_by("run-42") == (
        "src/rotaris_core/requirements/delivery/audit.py",
        "tests/unit/requirements/test_requirement_audit.py",
    )
    assert trail.verifying_tests() == (covering.label,)
    assert trail.last_verified_at() == LATER
    assert trail.runs() == ("run-42",)
    assert [event.to_state for event in trail.transitions()] == [
        DeliveryState.READY,
        DeliveryState.RUNNING,
        DeliveryState.REVIEW,
        DeliveryState.DONE,
    ]
    assert trail.overrides() == ()

    # The trail read back from disk in a fresh process answers the same way.
    assert AuditStore(tmp_path).read(requirement.req_id).events == trail.events


@verifies(SWR.SWR_3215)
def test_a_run_that_passed_its_gate_but_left_the_requirement_uncovered_cannot_reach_done(
    tmp_path: Path,
) -> None:
    """The case §22 of the target picture is built on: a green suite is not coverage."""
    requirements = repository_requirements()
    requirement = requirements["SWR-3215"]
    store = DeliveryStore(tmp_path)
    tests: list[CoveringTestEvidence] = []
    gate = completion_gate(
        lambda _record, _request: evidence_for(requirement, tests=tuple(tests)),
        obligations_for=requirements.get,
    )
    transitions = DeliveryTransitions(store, completion=gate)

    move(
        transitions,
        requirement.req_id,
        DeliveryState.READY,
        actor=USER,
        cause=TransitionCause.USER_ACTION,
    )
    move(
        transitions,
        requirement.req_id,
        DeliveryState.RUNNING,
        actor=RUNNER,
        cause=TransitionCause.RUN_STARTED,
        run_id="run-7",
    )
    move(
        transitions,
        requirement.req_id,
        DeliveryState.REVIEW,
        actor=RUNNER,
        cause=TransitionCause.RUN_COMPLETED,
    )

    accept = TransitionRequest(
        req_id=requirement.req_id,
        target=DeliveryState.DONE,
        actor=USER,
        cause=TransitionCause.COMPLETION_ACCEPTED,
        at=LATER,
        requirement_hash=requirement.current_hash,
        delivery=SatisfiedDelivery(
            req_id=requirement.req_id,
            satisfied_hash=requirement.current_hash,
            run_id="run-7",
            satisfied_at=LATER,
        ),
    )

    refused = transitions.apply(accept)

    assert not refused.accepted
    assert refused.refusal is not None
    assert refused.refusal.kind is RefusalKind.COMPLETION_CONDITIONS_UNMET
    assert {condition.name for condition in refused.refusal.unmet} == {
        str(CompletionCondition.COVERING_TESTS),
    }
    assert requirement.req_id in refused.refusal.message
    assert store.read(requirement.req_id).state is DeliveryState.REVIEW, (
        "a refusal leaves the stored record where it was"
    )

    # Write the covering test, run it, and the same click is accepted.
    tests.append(
        CoveringTestEvidence(
            path="tests/unit/requirements/test_done_conditions.py",
            line=1,
            executed=True,
            passed=True,
        ),
    )
    accepted = transitions.apply(accept)

    assert accepted.accepted
    assert store.read(requirement.req_id).state is DeliveryState.DONE


def _git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-c", "user.email=t@example.com", "-c", "user.name=Test", *args],
        cwd=repo,
        check=True,
        capture_output=True,
    )


def _write_store(root: Path) -> Path:
    """A workspace that keeps its requirements the way ReqToCode expects."""
    store = root / "docs" / "requirements"
    (store / "500-checkout").mkdir(parents=True)
    (store / "500-checkout.md").write_text(
        "---\nreq-id: SWR-500\nstatus: approved\ntrace: optional\ntest: optional\n"
        'title: "Checkout"\n---\n\n# 500 — Checkout\n',
        encoding="utf-8",
    )
    (store / "500-checkout" / "SWR-501-basket.md").write_text(
        '---\nreq-id: SWR-501\nstatus: approved\ntitle: "A basket can be paid for"\n'
        "epic: SWR-500\n---\n\n# SWR-501 — A basket can be paid for\n\n"
        "The user pays for the basket and receives a receipt.\n",
        encoding="utf-8",
    )
    return root


@verifies(SWR.SWR_3214)
def test_the_revision_history_names_the_real_commits_that_touched_the_document(
    tmp_path: Path,
) -> None:
    """Assembled from a genuine checkout: two commits, two versions, one delivered."""
    workspace = _write_store(tmp_path / "project")
    _git(workspace, "init", "-q")
    _git(workspace, "add", "-A")
    _git(workspace, "commit", "-q", "-m", "SWR-501: the basket as first written")

    document = workspace / "docs" / "requirements" / "500-checkout" / "SWR-501-basket.md"
    document.write_text(
        document.read_text(encoding="utf-8").replace(
            "receives a receipt.",
            "receives a receipt by email.",
        ),
        encoding="utf-8",
    )
    _git(workspace, "commit", "-q", "-a", "-m", "SWR-501: the receipt goes by email")

    source = reqtocode_source_for(workspace)
    assert source is not None
    location = source.locate("SWR-501")
    assert location is not None
    current = source.read().by_id()["SWR-501"]

    revisions = GitArtifactRevisions.for_repo(workspace)
    assert revisions is not None

    def hash_at(revision: str) -> str | None:
        past = source.read_requirement_at("SWR-501", revision)
        return past.current_hash if past is not None else None

    resolved = resolve_hashes(revisions.revisions_for(location), hash_at)
    first_delivery = SatisfiedDelivery(
        req_id="SWR-501",
        satisfied_hash=resolved[0].requirement_hash,
        run_id="run-1",
        satisfied_at=AT,
        verified_commit=resolved[0].revision,
    )

    history = build_revision_history(
        "SWR-501",
        current_hash=current.current_hash,
        revisions=resolved,
        recorded=recorded_hashes(deliveries=(first_delivery,)),
        deliveries=(first_delivery,),
    )

    assert len(history.entries) == 2, "two commits, two versions of the sentence"
    older, newer = history.entries
    assert older.at is not None and newer.at is not None
    assert older.at <= newer.at, "oldest to newest"
    assert older.artefact_commit and newer.artefact_commit
    assert older.artefact_commit != newer.artefact_commit
    assert "as first written" in older.subject
    assert older.requirement_hash != newer.requirement_hash
    assert older.run_id == "run-1"
    assert older.implementing_commit == older.artefact_commit

    assert newer.current
    assert newer.requirement_hash == current.current_hash
    assert newer.run_id is None, "the newest wording was never delivered"
    assert newer.implementing_commit is None
    assert history.source_history_available
    assert [entry.requirement_hash for entry in history.undelivered] == [newer.requirement_hash]


@verifies(SWR.SWR_3214)
def test_a_project_without_a_repository_still_gets_the_versions_rotaris_recorded(
    tmp_path: Path,
) -> None:
    """No git, and the history says so instead of showing one entry that looks whole."""
    workspace = _write_store(tmp_path / "project")

    assert GitArtifactRevisions.for_repo(workspace) is None

    source = reqtocode_source_for(workspace)
    assert source is not None
    current = source.read().by_id()["SWR-501"]
    delivered = SatisfiedDelivery(
        req_id="SWR-501",
        satisfied_hash="an-older-version",
        run_id="run-1",
        satisfied_at=AT,
    )

    history = build_revision_history(
        "SWR-501",
        current_hash=current.current_hash,
        recorded=recorded_hashes(deliveries=(delivered,)),
        deliveries=(delivered,),
        source_history_available=False,
        unavailable_reason=f"{workspace} is not under version control",
    )

    assert not history.source_history_available
    assert "not under version control" in history.unavailable_reason
    assert [entry.requirement_hash for entry in history.entries] == [
        "an-older-version",
        current.current_hash,
    ]
    assert history.entries[0].run_id == "run-1"
    assert history.current is not None
    assert history.current.run_id is None


@verifies(SWR.SWR_3216, SWR.SWR_3214, SWR.SWR_3213)
def test_the_history_panels_answer_arrives_through_the_projection(tmp_path: Path) -> None:
    """The same join, reached the way a user interface has to reach it.

    SWR-3216 makes the projection the only surface the board consumes, so the
    revision panel (SWR-3313) and the audit view cannot assemble a history of
    their own from git and the audit store — they read
    :attr:`BoardEntry.history`. This drives the whole path over a real checkout:
    two commits, one delivery, recorded through the audit store, read back
    through the one read API, writing nothing.
    """
    workspace = _write_store(tmp_path / "project")
    _git(workspace, "init", "-q")
    _git(workspace, "add", "-A")
    _git(workspace, "commit", "-q", "-m", "SWR-501: the basket as first written")

    source = reqtocode_source_for(workspace)
    assert source is not None
    location = source.locate("SWR-501")
    assert location is not None
    first = source.read().by_id()["SWR-501"]

    store = DeliveryStore(tmp_path / "state")
    audit = AuditStore(tmp_path / "state")
    transitions = DeliveryTransitions(store, completion=lambda _record, _request: ())
    delivery = SatisfiedDelivery(
        req_id="SWR-501",
        satisfied_hash=first.current_hash,
        run_id="run-1",
        satisfied_at=AT,
        verified_commit="c0ffee",
    )
    for target, actor, cause, entry in (
        (DeliveryState.READY, USER, TransitionCause.USER_ACTION, None),
        (DeliveryState.RUNNING, RUNNER, TransitionCause.RUN_STARTED, None),
        (DeliveryState.REVIEW, RUNNER, TransitionCause.RUN_COMPLETED, None),
        (DeliveryState.DONE, USER, TransitionCause.COMPLETION_ACCEPTED, delivery),
    ):
        outcome = transitions.apply(
            TransitionRequest(
                req_id="SWR-501",
                target=target,
                actor=actor,
                cause=cause,
                at=AT,
                requirement_hash=first.current_hash,
                run_id="run-1",
                delivery=entry,
            ),
        )
        assert outcome.accepted, outcome.message
        assert outcome.transition is not None
        audit.append(AuditEvent.of_transition(outcome.transition, commit="c0ffee"))

    # The author sharpens the wording after the delivery, and commits it.
    document = workspace / "docs" / "requirements" / "500-checkout" / "SWR-501-basket.md"
    document.write_text(
        document.read_text(encoding="utf-8").replace(
            "receives a receipt.",
            "receives a receipt by email.",
        ),
        encoding="utf-8",
    )
    _git(workspace, "commit", "-q", "-a", "-m", "SWR-501: the receipt goes by email")

    revisions = GitArtifactRevisions.for_repo(workspace)
    assert revisions is not None
    projector = BoardProjector(
        RequirementIndex(requirements=source.read().requirements),
        store,
        details=StoredDetails(audit, revisions=revisions),
    )
    entry = projector.project(req_ids=["SWR-501"]).entry("SWR-501")

    assert entry is not None
    assert entry.state is DeliveryState.DONE
    history = entry.history
    assert history is not None
    assert history.source_history_available
    assert len(history.entries) >= 2, "the delivered version and the one that replaced it"
    delivered_entries = history.delivered
    assert [one.requirement_hash for one in delivered_entries] == [first.current_hash]
    assert delivered_entries[0].run_id == "run-1"
    assert delivered_entries[0].implementing_commit == "c0ffee"
    assert history.current is not None
    assert history.current.requirement_hash == entry.current_hash
    assert not history.current.delivered, "the newest wording was never delivered"

    trail = entry.audit
    assert trail is not None
    assert trail.implementing_run(first.current_hash) == "run-1"
    assert trail.commit_for(first.current_hash) == "c0ffee"


# --------------------------------------------------------------------------
# The board projection over this repository's own store (SWR-3216)
# --------------------------------------------------------------------------


@contextmanager
def writes_forbidden() -> Iterator[None]:
    """Every filesystem write raises while this is held.

    The projection is a *read* API, and "it does not write" is checkable rather
    than promisable: the seams a Python write goes through are patched, so a lock
    file that is created and removed again — the write that would leave no trace
    to inspect afterwards — still fails the test.
    """
    real_open = Path.open

    def refuse(name: str) -> object:
        def guard(*args: object, **kwargs: object) -> object:
            raise AssertionError(f"the board projection called {name}")

        return guard

    def guarded_open(self: Path, mode: str = "r", *args: object, **kwargs: object) -> object:
        if any(flag in mode for flag in "wxa+"):
            raise AssertionError(f"the board projection opened {self} for writing")
        return real_open(self, mode, *args, **kwargs)  # type: ignore[arg-type]

    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(Path, "open", guarded_open)
        patch.setattr(Path, "write_text", refuse("Path.write_text"))
        patch.setattr(Path, "write_bytes", refuse("Path.write_bytes"))
        patch.setattr(Path, "mkdir", refuse("Path.mkdir"))
        patch.setattr(Path, "touch", refuse("Path.touch"))
        patch.setattr(Path, "unlink", refuse("Path.unlink"))
        patch.setattr(os, "replace", refuse("os.replace"))
        patch.setattr(os, "remove", refuse("os.remove"))
        patch.setattr(os, "mkdir", refuse("os.mkdir"))
        patch.setattr(os, "makedirs", refuse("os.makedirs"))
        yield


@pytest.fixture(scope="module")
def repository_board() -> BoardProjection:
    """The board this repository's own requirement store projects to.

    Built once per module: the ReqToCode sweep behind the evidence reader walks
    every source file, and paying for that per test would make the honest
    integration test the expensive one nobody runs.
    """
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None, "this repository has a ReqToCode store"
    index = RequirementIndex(requirements=source.read().requirements, generation=1)
    projector = BoardProjector(
        index,
        DeliveryStore(REPO_ROOT / ".rotaris-projection-probe"),
        evidence=CoverageEvidence.for_repository(REPO_ROOT),
    )
    with writes_forbidden():
        return projector.project()


@verifies(SWR.SWR_3216)
def test_the_projection_over_this_repository_has_one_entry_per_requirement(
    repository_board: BoardProjection,
) -> None:
    """The real store, not a fixture: every declared id lands exactly once."""
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None
    declared = tuple(sorted(source.read().by_id()))

    assert tuple(sorted(repository_board.ids)) == declared
    assert len(repository_board.ids) == len(set(repository_board.ids))
    placed = [req_id for ids in repository_board.columns().values() for req_id in ids]
    assert sorted(placed) == list(declared), "every requirement sits in exactly one column"
    assert repository_board.counts()[DeliveryState.BACKLOG] == len(declared), (
        "a store Rotaris has never written about is Backlog everywhere, without a write"
    )


@verifies(SWR.SWR_3216)
def test_the_projection_reports_this_repositorys_real_traceability(
    repository_board: BoardProjection,
) -> None:
    """The evidence on the card is this checkout's actual annotations."""
    entry = repository_board.entry("SWR-3216")

    assert entry is not None
    assert entry.title
    assert entry.source_path is not None
    assert (REPO_ROOT / entry.source_path).is_file(), "the detail view can open the source"
    traced = {site.path for site in entry.implementations}
    assert "src/rotaris_core/requirements/delivery/projection.py" in traced
    covering = {test.path for test in entry.covering_tests}
    assert "tests/unit/requirements/test_board_projection.py" in covering
    assert entry.evidence.state_of(EvidenceKind.IMPLEMENTATION) is EvidenceState.SATISFIED
    assert entry.evidence.state_of(EvidenceKind.TEST) is EvidenceState.STALE, (
        "a coverage sweep knows the test exists, never that this run executed it"
    )


@verifies(SWR.SWR_3216, SWR.SWR_3212)
def test_the_projection_aggregates_this_repositorys_epics(
    repository_board: BoardProjection,
) -> None:
    """The epic card's numbers come from the folders this store actually declares."""
    entry = repository_board.entry(EPIC)
    children = declared_ids(EPIC_DIR)

    assert entry is not None
    assert entry.is_epic and entry.epic is not None
    assert tuple(sorted(entry.epic.children)) == children
    assert entry.epic.state is DeliveryState.BACKLOG
    assert entry.epic.traced == len(children), "every requirement of this epic is traced"
    assert not entry.schedulable, "an epic carries no delivery action"
    assert repository_board.epics[EPIC] == entry.epic


@verifies(SWR.SWR_3216)
def test_the_projection_of_the_real_store_serialises_and_writes_nothing(
    repository_board: BoardProjection,
    tmp_path: Path,
) -> None:
    """Two guarantees SWR-3216 makes, checked against the real thing."""
    probe = REPO_ROOT / ".rotaris-projection-probe"
    assert not probe.exists(), "projecting created no state directory in the checkout"

    text = json.dumps(repository_board.model_dump(mode="json"))
    restored = BoardProjection.model_validate(json.loads(text))
    assert restored == repository_board

    store = DeliveryStore(tmp_path / "workspace")
    source = reqtocode_source_for(REPO_ROOT)
    assert source is not None
    projector = BoardProjector(
        RequirementIndex(requirements=source.read().requirements),
        store,
    )
    with writes_forbidden():
        again = projector.project()
    assert again.ids == repository_board.ids
    assert not store.directory.exists()
