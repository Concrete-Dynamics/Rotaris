"""Productive use: a project's requirements live in a real ReqToCode store, Rotaris has
already delivered one of them, and then a person edits the store — a sentence here, a new
requirement there, a deleted file, an acceptance criterion rewritten, two requirements that
end up contradicting each other, one that may not start before another, and a covering test
that somebody deletes.
Expected outcome: the next evaluation names exactly what moved and in which class, its
classification agrees with ``reqtocode diff`` over the same content, a store nobody
touched is not read at all, the requirement that was Done becomes Needs Update while
still showing which version was built, by which run and at which commit, both sides of a
contradiction block until a person decides, a dependant waits for the requirement it names
and is released the moment that one is delivered, and a requirement whose covering test
disappeared stops claiming to be delivered.
"""

from __future__ import annotations

import datetime as dt
import hashlib
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.diff import classify_changes as reqtocode_classify
from rotaris_core.reqtocode.generator import parse_requirements
from rotaris_core.requirements.change.conflicts import ConflictDecision, evaluate_conflicts
from rotaris_core.requirements.change.dependencies import (
    DependencyBlockKind,
    gate,
    readiness_of,
    release_after,
)
from rotaris_core.requirements.change.detection import (
    ChangeKind,
    NeedsUpdatePass,
    RequirementBaseline,
    SourceChangeDetector,
    assess_specification,
)
from rotaris_core.requirements.change.propagation import EvidenceAction, EvidencePropagator
from rotaris_core.requirements.delivery.audit import AuditEventKind, AuditStore
from rotaris_core.requirements.delivery.projection import BoardProjector
from rotaris_core.requirements.delivery.satisfied import SatisfactionState, SatisfiedDelivery
from rotaris_core.requirements.delivery.staleness import (
    FreshnessInputs,
    StalenessReason,
    VerifiedEvidence,
    evaluate_freshness,
)
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryStore
from rotaris_core.requirements.delivery.transitions import (
    DeliveryTransitions,
    TransitionRequest,
)
from rotaris_core.requirements.execution.store import UnitStore
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
)
from rotaris_core.requirements.registry import RequirementIndex
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementArtifact,
    SourceRead,
)
from rotaris_core.requirements.sources.reqtocode import ReqToCodeSource, reqtocode_source_for
from rotaris_core.requirements.writeback import MarkdownRequirementDocument
from rotaris_core.verifier.requirement_evidence import RequirementSite

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    from rotaris_core.reqtocode.declarations import ReqMeta
    from rotaris_core.requirements.change.dependencies import DependencyReport

pytestmark = pytest.mark.integration

AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
LATER = AT + dt.timedelta(days=2)
RUNNER = DeliveryActor.system("requirement-runner")

BASKET_PROSE = "The user pays for the basket and receives a receipt."
BASKET_EDITED = (
    "The user pays for the basket and receives a receipt.\n\n"
    "A payment that fails three times locks the basket for an hour."
)


def document(
    req_id: str,
    title: str,
    prose: str,
    *,
    status: str = "approved",
    criteria: str = "The receipt names every line item.",
) -> str:
    """One requirement document in the store's documented layout."""
    return (
        f"---\nreq-id: {req_id}\nstatus: {status}\ntitle: {title!r}\nepic: SWR-500\n---\n\n"
        f"# {req_id} — {title}\n\n{prose}\n\n## Acceptance criteria\n\n- {criteria}\n"
    )


def write_store(root: Path) -> Path:
    """A workspace that has adopted ReqToCode, with one epic and four requirements."""
    store = root / "docs" / "requirements"
    (store / "500-checkout").mkdir(parents=True)
    (store / "500-checkout.md").write_text(
        "---\nreq-id: SWR-500\nstatus: approved\ntrace: optional\ntest: optional\n"
        'title: "Checkout"\n---\n\n# 500 — Checkout\n',
        encoding="utf-8",
    )
    (store / "500-checkout" / "SWR-501-basket.md").write_text(
        document("SWR-501", "A basket can be paid for", BASKET_PROSE),
        encoding="utf-8",
    )
    (store / "500-checkout" / "SWR-502-refund.md").write_text(
        document("SWR-502", "A payment can be refunded", "The user asks for their money back."),
        encoding="utf-8",
    )
    (store / "500-checkout" / "SWR-504-vat.md").write_text(
        document("SWR-504", "VAT is shown separately", "The receipt separates net and VAT."),
        encoding="utf-8",
    )
    (store / "500-checkout" / "SWR-505-address.md").write_text(
        document("SWR-505", "A delivery address is required", "The user names where it goes."),
        encoding="utf-8",
    )
    return store


def edit_the_store(store: Path) -> None:
    """Everything a person does to a requirement store in one afternoon.

    One prose edit, one deletion, one new requirement, one lifecycle change, and
    one edit that touches only the acceptance criteria — the last of which the
    canonical model does not represent, and which must still be detected.
    """
    (store / "500-checkout" / "SWR-501-basket.md").write_text(
        document("SWR-501", "A basket can be paid for", BASKET_EDITED),
        encoding="utf-8",
    )
    (store / "500-checkout" / "SWR-502-refund.md").unlink()
    (store / "500-checkout" / "SWR-503-receipt.md").write_text(
        document("SWR-503", "A receipt can be re-sent", "The user asks for the receipt again."),
        encoding="utf-8",
    )
    (store / "500-checkout" / "SWR-504-vat.md").write_text(
        document(
            "SWR-504",
            "VAT is shown separately",
            "The receipt separates net and VAT.",
            status="deprecated",
        ),
        encoding="utf-8",
    )
    (store / "500-checkout" / "SWR-505-address.md").write_text(
        document(
            "SWR-505",
            "A delivery address is required",
            "The user names where it goes.",
            criteria="A PO box is refused with a stated reason.",
        ),
        encoding="utf-8",
    )


def source_for(root: Path) -> ReqToCodeSource:
    """The built-in source over *root*, asserted to exist."""
    source = reqtocode_source_for(root)
    assert source is not None, "the synthetic workspace has a ReqToCode store"
    return source


def reqtocode_kinds(base: Sequence[ReqMeta], current: Sequence[ReqMeta]) -> set[tuple[str, str]]:
    """``reqtocode diff``'s own classification over the same two parses (SWR-2332)."""
    return {
        (change.req_id, change.kind)
        for change in reqtocode_classify(
            list(current),
            {meta.number: meta for meta in base},
            {},
            set(),
        )
    }


# --------------------------------------------------------------------------
# Detection over the real store (SWR-3501)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3501)
def test_editing_adding_and_deleting_in_a_store_yields_the_expected_classes(
    tmp_path: Path,
) -> None:
    """One afternoon of edits, classified per requirement through the adapter seam."""
    store = write_store(tmp_path)
    source = source_for(tmp_path)
    detector = SourceChangeDetector()
    first = detector.detect(source, RequirementBaseline.unevaluated(source.source_id))
    assert first.changes.first_evaluation
    assert set(first.baseline.req_ids) == {"SWR-500", "SWR-501", "SWR-502", "SWR-504", "SWR-505"}

    edit_the_store(store)
    second = detector.detect(source, first.baseline)

    by_id = second.changes.by_id()
    assert by_id["SWR-501"].kind is ChangeKind.MODIFIED
    assert by_id["SWR-501"].canonical_change
    assert by_id["SWR-502"].kind is ChangeKind.REMOVED
    assert by_id["SWR-503"].kind is ChangeKind.ADDED
    assert by_id["SWR-504"].kind is ChangeKind.MODIFIED
    assert by_id["SWR-504"].lifecycle_moved
    assert "SWR-500" not in by_id, "the untouched epic index is not a change"


@verifies(SWR.SWR_3501)
def test_an_acceptance_criterion_edit_is_detected_although_the_meaning_hash_is_stable(
    tmp_path: Path,
) -> None:
    """The canonical model does not carry acceptance criteria — detection still must.

    This is the edit SWR-3503 exists for ("changing an acceptance criterion must
    cost a run"), and a detector that only compared canonical hashes would report
    nothing at all for it.
    """
    store = write_store(tmp_path)
    source = source_for(tmp_path)
    detector = SourceChangeDetector()
    first = detector.detect(source, RequirementBaseline.unevaluated(source.source_id))

    edit_the_store(store)
    change = detector.detect(source, first.baseline).changes.by_id()["SWR-505"]

    assert change.kind is ChangeKind.MODIFIED
    assert not change.canonical_change, "the requirement's own prose did not move"
    assert change.artifact_change, "but the document it lives in did"


@verifies(SWR.SWR_3501, SWR.SWR_2332)
def test_the_built_in_source_classifies_exactly_as_reqtocode_diff_does(tmp_path: Path) -> None:
    """SWR-3501's fourth acceptance criterion, as a comparison rather than a claim.

    Both classifiers are run over the *same* store before and after the same
    edits: ``reqtocode diff``'s pure classifier over its own parse, and this
    slice's over the canonical read from the built-in adapter. They must agree,
    requirement by requirement and class by class.
    """
    store = write_store(tmp_path)
    source = source_for(tmp_path)
    base_parse = parse_requirements(tmp_path)
    assert not base_parse.errors, base_parse.errors
    baseline = RequirementBaseline.of_read(source.read())

    edit_the_store(store)

    current_parse = parse_requirements(tmp_path)
    assert not current_parse.errors, current_parse.errors
    theirs = reqtocode_kinds(base_parse.requirements, current_parse.requirements)
    ours = {
        (change.req_id, str(change.kind))
        for change in SourceChangeDetector().detect(source, baseline).changes.changes
    }

    assert ours == theirs
    assert {kind for _, kind in ours} == {"added", "removed", "modified"}
    assert ("SWR-505", "modified") in ours, "the acceptance-criteria edit is in both"


@verifies(SWR.SWR_3501)
def test_a_store_nobody_touched_is_not_read_again(tmp_path: Path) -> None:
    """Polling a 1500-file store must cost one hash, not 1500 reads."""
    write_store(tmp_path)
    source = source_for(tmp_path)
    detector = SourceChangeDetector()
    first = detector.detect(source, RequirementBaseline.unevaluated(source.source_id))

    second = detector.detect(source, first.baseline)

    assert second.skipped
    assert second.changes.unchanged_revision
    assert second.changes.empty
    assert second.baseline == first.baseline


# --------------------------------------------------------------------------
# A delivered requirement whose specification moved (SWR-3502)
# --------------------------------------------------------------------------


def deliver(
    transitions: DeliveryTransitions,
    req_id: str,
    requirement_hash: str,
    *,
    run_id: str = "run-1",
    commit: str = "c0ffee00",
) -> SatisfiedDelivery:
    """Walk a requirement to ``Done`` the way a real run does (SWR-3203)."""
    user = DeliveryActor.user("dvf")
    for target, actor, cause in (
        (DeliveryState.READY, user, TransitionCause.USER_ACTION),
        (DeliveryState.RUNNING, RUNNER, TransitionCause.RUN_STARTED),
        (DeliveryState.REVIEW, RUNNER, TransitionCause.RUN_COMPLETED),
    ):
        outcome = transitions.apply(
            TransitionRequest(
                req_id=req_id,
                target=target,
                actor=actor,
                cause=cause,
                at=AT,
                requirement_hash=requirement_hash,
                run_id=run_id,
            ),
        )
        assert outcome.accepted, outcome.message

    delivery = SatisfiedDelivery(
        req_id=req_id,
        satisfied_hash=requirement_hash,
        run_id=run_id,
        satisfied_at=AT,
        verified_commit=commit,
    )
    done = transitions.apply(
        TransitionRequest(
            req_id=req_id,
            target=DeliveryState.DONE,
            actor=RUNNER,
            cause=TransitionCause.COMPLETION_ACCEPTED,
            at=AT,
            requirement_hash=requirement_hash,
            delivery=delivery,
            run_id=run_id,
        ),
    )
    assert done.accepted, done.message
    return delivery


@verifies(SWR.SWR_3502, SWR.SWR_3501)
def test_editing_a_delivered_requirement_moves_it_to_needs_update_on_the_next_evaluation(
    tmp_path: Path,
) -> None:
    """Detection and the delivery store, wired together over a real store."""
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    store = write_store(tmp_path)
    source = source_for(tmp_path)

    delivery_store = DeliveryStore(workspace)
    transitions = DeliveryTransitions(
        delivery_store,
        completion=lambda _record, _request: (),
    )
    audit = AuditStore(workspace)

    read = source.read()
    delivered_hash = read.by_id()["SWR-501"].current_hash
    deliver(transitions, "SWR-501", delivered_hash)
    baseline = RequirementBaseline.of_read(read)

    edit_the_store(store)
    detected = SourceChangeDetector().detect(source, baseline)
    hashes = {
        requirement.req_id: requirement.current_hash for requirement in source.read().requirements
    }
    outcomes = NeedsUpdatePass(transitions, audit=audit).run(
        [delivery_store.read("SWR-501")],
        hashes,
        at=LATER,
    )

    assert detected.changes.by_id()["SWR-501"].kind is ChangeKind.MODIFIED
    assert [outcome.moved for outcome in outcomes] == [True]

    record = delivery_store.read("SWR-501")
    assert record.state is DeliveryState.NEEDS_UPDATE
    assert record.satisfied_hash == delivered_hash
    assert record.satisfied.current is not None
    assert record.satisfied.current.run_id == "run-1"
    assert record.satisfied.current.verified_commit == "c0ffee00"

    trail = audit.read("SWR-501")
    change = trail.last_specification_change()
    assert change is not None
    assert change.kind is AuditEventKind.SPECIFICATION_CHANGED
    assert change.to_state is DeliveryState.NEEDS_UPDATE
    assert change.satisfied_hash == delivered_hash
    assert change.requirement_hash == hashes["SWR-501"]
    assert change.commit == "c0ffee00"


@verifies(SWR.SWR_3502)
def test_a_requirement_nobody_delivered_is_untouched_by_the_same_pass(tmp_path: Path) -> None:
    """The pass runs over the whole store and moves only what it may."""
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    store = write_store(tmp_path)
    source = source_for(tmp_path)
    delivery_store = DeliveryStore(workspace)
    transitions = DeliveryTransitions(delivery_store, completion=lambda _r, _q: ())

    read = source.read()
    deliver(transitions, "SWR-501", read.by_id()["SWR-501"].current_hash)
    edit_the_store(store)
    hashes = {req.req_id: req.current_hash for req in source.read().requirements}

    NeedsUpdatePass(transitions).run(
        [delivery_store.read(req_id) for req_id in ("SWR-501", "SWR-504", "SWR-505")],
        hashes,
        at=LATER,
    )

    assert delivery_store.read("SWR-501").state is DeliveryState.NEEDS_UPDATE
    assert delivery_store.read("SWR-504").state is DeliveryState.BACKLOG
    assert delivery_store.read("SWR-505").state is DeliveryState.BACKLOG
    assert delivery_store.read("SWR-504").pristine, "an untouched requirement is never written"


# --------------------------------------------------------------------------
# What the user sees (SWR-3502, user flow)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3502)
def test_a_user_who_edits_a_delivered_requirement_sees_a_card_that_needs_updating(
    tmp_path: Path,
) -> None:
    """The product promise, read off the board projection every surface reads.

    Not "this requirement is unbuilt" — the card still names the version that was
    delivered, the run that delivered it and the commit it was verified at, which
    is the information a person needs to decide what the edit costs.
    """
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    store = write_store(tmp_path)
    source = source_for(tmp_path)
    delivery_store = DeliveryStore(workspace)
    transitions = DeliveryTransitions(delivery_store, completion=lambda _r, _q: ())

    read = source.read()
    delivered_hash = read.by_id()["SWR-501"].current_hash
    deliver(transitions, "SWR-501", delivered_hash)

    before = BoardProjector(
        RequirementIndex(requirements=read.requirements),
        delivery_store,
    ).project()
    green = before.entry("SWR-501")
    assert green is not None
    assert green.delivery.state is DeliveryState.DONE
    assert green.satisfaction is SatisfactionState.SATISFIED

    edit_the_store(store)
    edited = source.read()
    NeedsUpdatePass(transitions).run(
        [delivery_store.read("SWR-501")],
        {req.req_id: req.current_hash for req in edited.requirements},
        at=LATER,
    )

    after = BoardProjector(
        RequirementIndex(requirements=edited.requirements),
        delivery_store,
    ).project()
    card = after.entry("SWR-501")

    assert card is not None
    assert card.delivery.state is DeliveryState.NEEDS_UPDATE
    assert card.delivery.state.label == "Needs Update"
    assert card.satisfaction is SatisfactionState.STALE
    assert card.satisfied_hash == delivered_hash
    assert card.current_hash != delivered_hash
    assert [entry.run_id for entry in card.deliveries] == ["run-1"]
    assert card.deliveries[0].verified_commit == "c0ffee00"
    assert "locks the basket" in card.description, "the card shows the new text"


@verifies(SWR.SWR_3502)
def test_restoring_the_text_makes_the_requirement_match_its_delivery_again(
    tmp_path: Path,
) -> None:
    """Undoing the edit puts the delivered version back in front of the rule.

    The assessment says so: the requirement is no longer diverged, its delivery
    still stands, and the restore asks for ``Done`` without a new run — the
    satisfied record it carries is the one the original run left behind.
    """
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    store = write_store(tmp_path)
    source = source_for(tmp_path)
    delivery_store = DeliveryStore(workspace)
    transitions = DeliveryTransitions(delivery_store, completion=lambda _r, _q: ())

    delivered_hash = source.read().by_id()["SWR-501"].current_hash
    delivered = deliver(transitions, "SWR-501", delivered_hash)

    edit_the_store(store)
    NeedsUpdatePass(transitions).run(
        [delivery_store.read("SWR-501")],
        {req.req_id: req.current_hash for req in source.read().requirements},
        at=LATER,
    )
    assert delivery_store.read("SWR-501").state is DeliveryState.NEEDS_UPDATE

    (store / "500-checkout" / "SWR-501-basket.md").write_text(
        document("SWR-501", "A basket can be paid for", BASKET_PROSE),
        encoding="utf-8",
    )
    restored_hash = source.read().by_id()["SWR-501"].current_hash
    assert restored_hash == delivered_hash

    assessment = assess_specification(
        delivery_store.read("SWR-501"),
        current_hash=restored_hash,
    )
    request = NeedsUpdatePass(transitions).request_for(assessment, at=LATER)

    assert assessment.target is DeliveryState.DONE
    assert request is not None
    assert request.delivery == delivered, "the delivery that stands, not a new one"
    assert request.run_id == "run-1"


# --------------------------------------------------------------------------
# A store that carries relations (SWR-3510, SWR-3511)
# --------------------------------------------------------------------------

LOCKS = "SWR-511"
NEVER_LOCKS = "SWR-512"
LOCK_TEXT = "A basket locks for an hour after three failed payments."
NEVER_TEXT = "A basket is always payable; nothing ever locks it."

FOUNDATION = "SWR-520"
DEPENDANT = "SWR-521"
FOUNDATION_TEXT = "Every price the checkout shows comes from the pricing service."
DEPENDANT_TEXT = "The receipt repeats the prices the checkout showed."

RELATION_KEYS: dict[str, RelationKind] = {
    "conflicts-with": RelationKind.CONFLICTS_WITH,
    "depends-on": RelationKind.DEPENDS_ON,
}


def relation_document(
    req_id: str,
    title: str,
    prose: str,
    *,
    status: str = "approved",
    conflicts_with: Sequence[str] = (),
    depends_on: Sequence[str] = (),
) -> str:
    """One requirement in a store whose format carries relations."""
    lines = "".join(
        f"{key}: {', '.join(targets)}\n"
        for key, targets in (("conflicts-with", conflicts_with), ("depends-on", depends_on))
        if targets
    )
    return (
        f"---\nreq-id: {req_id}\nstatus: {status}\ntitle: {title!r}\n{lines}---\n\n"
        f"# {req_id} — {title}\n\n{prose}\n"
    )


class RelationStore(BaseRequirementSource):
    """A read-only markdown store carrying ``conflicts-with`` and ``depends-on``.

    Deliberately not this repository's ReqToCode adapter: its document format
    carries neither relation — it derives only epic membership — and a fixture
    that cannot express the relation could not exercise the gate that reads it.
    Everything downstream of :meth:`read` is production code: the conflict
    evaluation, the dependency gate, the delivery store and its transitions.
    """

    def __init__(self, root: Path) -> None:
        self._root = root

    @property
    def source_id(self) -> str:
        return "relations"

    def _paths(self) -> tuple[Path, ...]:
        return tuple(sorted(self._root.glob("*.md")))

    def discover(self) -> tuple[RequirementArtifact, ...]:
        return tuple(
            RequirementArtifact(artifact_id=path.name, location=path.name) for path in self._paths()
        )

    def revision(self) -> str:
        payload = "\x1e".join(
            f"{path.name}:{path.read_text(encoding='utf-8')}" for path in self._paths()
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]

    def read(self) -> SourceRead:
        return SourceRead(
            source_id=self.source_id,
            revision=self.revision(),
            requirements=tuple(self._requirement(path) for path in self._paths()),
        )

    def _requirement(self, path: Path) -> CanonicalRequirement:
        parsed = MarkdownRequirementDocument.parse(path.read_text(encoding="utf-8"))
        body = [line for line in parsed.body if line.strip() and not line.startswith("#")]
        relations = tuple(
            Relation(kind=kind, target=target.strip())
            for key, kind in RELATION_KEYS.items()
            for target in (parsed.get(key) or "").split(",")
            if target.strip()
        )
        return CanonicalRequirement(
            req_id=parsed.get("req-id") or path.stem,
            title=(parsed.get("title") or "").strip(),
            description="\n".join(body),
            lifecycle=RequirementLifecycle(parsed.get("status") or "draft"),
            source_id=self.source_id,
            source_path=path.name,
            relations=relations,
        )


def write_conflicting_store(root: Path) -> Path:
    """Two requirements that cannot both hold, with the relation declared once."""
    store = root / "relations"
    store.mkdir(parents=True)
    (store / "SWR-511-lock.md").write_text(
        relation_document(
            LOCKS,
            "A basket locks after repeated failure",
            LOCK_TEXT,
            conflicts_with=(NEVER_LOCKS,),
        ),
        encoding="utf-8",
    )
    (store / "SWR-512-never.md").write_text(
        relation_document(NEVER_LOCKS, "A basket never locks", NEVER_TEXT),
        encoding="utf-8",
    )
    return store


def write_dependency_store(root: Path) -> Path:
    """A two-requirement chain: the receipt cannot be built before the prices are."""
    store = root / "chain"
    store.mkdir(parents=True)
    (store / "SWR-520-pricing.md").write_text(
        relation_document(FOUNDATION, "Prices come from the pricing service", FOUNDATION_TEXT),
        encoding="utf-8",
    )
    (store / "SWR-521-receipt.md").write_text(
        relation_document(
            DEPENDANT,
            "The receipt repeats the prices",
            DEPENDANT_TEXT,
            depends_on=(FOUNDATION,),
        ),
        encoding="utf-8",
    )
    return store


def block_all(
    transitions: DeliveryTransitions,
    reasons: dict[str, str],
    *,
    actor: DeliveryActor,
) -> None:
    """Raise a blocker on each requirement through the real transition matrix."""
    for req_id, reason in reasons.items():
        outcome = transitions.apply(
            TransitionRequest(
                req_id=req_id,
                target=DeliveryState.BLOCKED,
                actor=actor,
                cause=TransitionCause.BLOCKER_RAISED,
                at=AT,
                reason=reason,
            ),
        )
        assert outcome.accepted, outcome.message


def dependency_report(
    source: RelationStore,
    delivery_store: DeliveryStore,
) -> DependencyReport:
    """The gate over what the store says and what Rotaris delivered."""
    read = source.read()
    return gate(
        read.requirements,
        {
            item.req_id: readiness_of(
                item,
                state=delivery_store.read(item.req_id).state,
                satisfied=delivery_store.read(item.req_id).satisfied,
            )
            for item in read.requirements
        },
    )


# --------------------------------------------------------------------------
# Two requirements that contradict each other (SWR-3511)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3511)
def test_two_conflicting_requirements_block_symmetrically_and_clear_when_one_is_deprecated(
    tmp_path: Path,
) -> None:
    """SWR-3511 end to end, over a real store and a real delivery store.

    Both sides block, nothing is scheduled for either, and the resolution the
    user performs in the *source* — deprecating one of them — is what clears the
    two blocks on the next evaluation. No agent ever picks a side.
    """
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    store = write_conflicting_store(tmp_path)
    source = RelationStore(store)
    delivery_store = DeliveryStore(workspace)
    transitions = DeliveryTransitions(delivery_store, completion=lambda _r, _q: ())
    units = UnitStore(workspace)
    evaluator = DeliveryActor.system("conflict-evaluation")

    standing = evaluate_conflicts(source.read().requirements)

    assert standing.open
    assert standing.blocked_ids == (LOCKS, NEVER_LOCKS), "both, not only the declaring side"
    conflict = standing.get(LOCKS, NEVER_LOCKS)
    assert conflict is not None
    assert conflict.left_statement and conflict.right_statement
    assert conflict.decisions == (
        ConflictDecision.CHANGE_ONE,
        ConflictDecision.DEPRECATE_ONE,
        ConflictDecision.SUPERSEDE_ONE,
    )

    block_all(
        transitions,
        {req_id: standing.blocks(req_id)[0].blocked_reason for req_id in standing.blocked_ids},
        actor=evaluator,
    )

    for req_id, other in ((LOCKS, NEVER_LOCKS), (NEVER_LOCKS, LOCKS)):
        record = delivery_store.read(req_id)
        assert record.state is DeliveryState.BLOCKED
        assert other in record.delivery.blocked_reason
        assert not standing.schedulable(req_id)
    assert units.req_ids() == (), "nothing is scheduled while the contradiction stands"

    # The user decides, in the source: the never-locks requirement loses.
    (store / "SWR-512-never.md").write_text(
        relation_document(NEVER_LOCKS, "A basket never locks", NEVER_TEXT, status="deprecated"),
        encoding="utf-8",
    )
    cleared = evaluate_conflicts(source.read().requirements)

    assert not cleared.open
    assert cleared.blocked_ids == ()
    resolutions = cleared.cleared_against(standing)
    assert len(resolutions) == 1
    assert NEVER_LOCKS in resolutions[0].reason
    assert "deprecated" in resolutions[0].reason

    for req_id in standing.blocked_ids:
        outcome = transitions.apply(
            TransitionRequest(
                req_id=req_id,
                target=DeliveryState.BACKLOG,
                actor=evaluator,
                cause=TransitionCause.BLOCKER_CLEARED,
                at=LATER,
                detail=resolutions[0].reason,
            ),
        )
        assert outcome.accepted, outcome.message
        record = delivery_store.read(req_id)
        assert record.state is DeliveryState.BACKLOG
        assert record.delivery.blocked_reason == ""


@verifies(SWR.SWR_3511)
def test_a_user_with_two_contradicting_requirements_is_asked_to_decide(tmp_path: Path) -> None:
    """The product promise, read off the board the way a person sees it.

    Neither card claims to be in progress, both name the *other* requirement and
    what it says, and the three things the user may do are on the card — which is
    the whole difference to an agent quietly building one of the two.
    """
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    store = write_conflicting_store(tmp_path)
    source = RelationStore(store)
    delivery_store = DeliveryStore(workspace)
    transitions = DeliveryTransitions(delivery_store, completion=lambda _r, _q: ())

    read = source.read()
    standing = evaluate_conflicts(read.requirements)
    block_all(
        transitions,
        {req_id: standing.blocks(req_id)[0].blocked_reason for req_id in standing.blocked_ids},
        actor=DeliveryActor.system("conflict-evaluation"),
    )

    board = BoardProjector(
        RequirementIndex(requirements=read.requirements),
        delivery_store,
    ).project()

    assert {entry.req_id for entry in board.in_state(DeliveryState.BLOCKED)} == {
        LOCKS,
        NEVER_LOCKS,
    }
    locks = board.entry(LOCKS)
    never = board.entry(NEVER_LOCKS)
    assert locks is not None
    assert never is not None
    assert locks.delivery.state is DeliveryState.BLOCKED
    assert never.delivery.state is DeliveryState.BLOCKED
    assert f"Blocked by conflict with {NEVER_LOCKS}" in locks.delivery.blocked_reason
    assert f"Blocked by conflict with {LOCKS}" in never.delivery.blocked_reason

    # All three ways out are spelled out on the card — and "let the agent pick"
    # is not one of them.
    conflict = standing.get(LOCKS, NEVER_LOCKS)
    assert conflict is not None
    for decision in ConflictDecision:
        assert decision.prompt(LOCKS, NEVER_LOCKS) in locks.delivery.blocked_reason
    assert conflict.question in never.delivery.blocked_reason

    # What each requirement *says* is on the card too — read from the source at
    # render time, never from the store (SWR-3114). The store holds ids; the
    # source holds prose; the card is the two of them joined here.
    card = standing.blocks(LOCKS)[0].rendered(conflict)
    assert "A basket locks after repeated failure" in card
    assert "A basket never locks" in card
    # Everything the store kept is still on the card; only the prose is added.
    assert f"Blocked by conflict with {NEVER_LOCKS}" in card
    assert conflict.contradiction in card
    assert conflict.question in card

    # And the prose really is absent from disk: not from the record's fields,
    # and not from the bytes of the file either — a title inside a value under
    # the key ``blocked_reason`` is exactly what a key-name deny-list misses.
    state_dir = workspace / ".rotaris" / "requirements"
    written = "\n".join(
        path.read_text(encoding="utf-8") for path in sorted(state_dir.rglob("*.json"))
    )
    assert written, "the delivery records were written"
    for prose in (
        "A basket locks after repeated failure",
        "A basket never locks",
        LOCK_TEXT,
        NEVER_TEXT,
    ):
        assert prose not in written, f"{prose!r} is requirement content and may not be stored"
    assert LOCKS in written and NEVER_LOCKS in written, "the ids are what is stored"


# --------------------------------------------------------------------------
# A requirement that may not start before another (SWR-3510)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3510)
def test_a_dependant_waits_for_its_dependency_and_is_released_when_it_completes(
    tmp_path: Path,
) -> None:
    """The gate over a real store and a real delivery store, three evaluations deep.

    Nothing delivered (blocked, and the blocker names the id), the dependency
    delivered (released, without anybody asking for it), and the dependency's
    specification moved afterwards (blocked again, with the *other* reason —
    ``Done`` is not the same as current).
    """
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    store = write_dependency_store(tmp_path)
    source = RelationStore(store)
    delivery_store = DeliveryStore(workspace)
    transitions = DeliveryTransitions(delivery_store, completion=lambda _r, _q: ())

    before = dependency_report(source, delivery_store)

    assert before.schedulable_ids == (FOUNDATION,)
    assert before.blocked_ids == (DEPENDANT,)
    held = before.verdict_for(DEPENDANT)
    assert held.board_text == f"Blocked by {FOUNDATION}"
    assert held.blockers[0].kind is DependencyBlockKind.UNSATISFIED
    assert "not Done" in held.blockers[0].detail

    # The foundation is built. Nobody touches the dependant.
    foundation = source.read().by_id()[FOUNDATION]
    deliver(transitions, FOUNDATION, foundation.current_hash, run_id="run-pricing")
    after = dependency_report(source, delivery_store)
    released = release_after(before, after, automatic=True)

    assert after.verdict_for(DEPENDANT).schedulable
    assert released.released == (DEPENDANT,)
    assert released.completed == (FOUNDATION,)
    assert released.starts_now == (DEPENDANT,)
    assert delivery_store.read(DEPENDANT).state is DeliveryState.BACKLOG, "no state was forced"

    # Someone then edits the foundation. Done, but no longer what the spec says.
    (store / "SWR-520-pricing.md").write_text(
        relation_document(
            FOUNDATION,
            "Prices come from the pricing service",
            FOUNDATION_TEXT + " Every price is shown with its currency.",
        ),
        encoding="utf-8",
    )
    stale = dependency_report(source, delivery_store)
    verdict = stale.verdict_for(DEPENDANT)

    assert verdict.blocked
    assert verdict.blockers[0].kind is DependencyBlockKind.STALE
    assert verdict.board_text == f"Blocked by {FOUNDATION}"
    assert release_after(after, stale).released == ()


# --------------------------------------------------------------------------
# Evidence that disappeared, seen from the board (SWR-3513)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3513)
def test_a_user_whose_covering_test_was_deleted_sees_the_card_stop_claiming_delivery(
    tmp_path: Path,
) -> None:
    """The requirement text never moved; the card must still stop saying "done".

    What the user sees is the whole point: a green card whose covering test was
    deleted is exactly the drift the product exists to prevent, and the reason on
    the card has to name the *test*, not an imaginary specification change.
    """
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    write_store(tmp_path)
    source = source_for(tmp_path)
    delivery_store = DeliveryStore(workspace)
    transitions = DeliveryTransitions(delivery_store, completion=lambda _r, _q: ())
    audit = AuditStore(workspace)

    read = source.read()
    delivered = read.by_id()["SWR-501"]
    deliver(transitions, "SWR-501", delivered.current_hash)

    card = (
        BoardProjector(
            RequirementIndex(requirements=read.requirements),
            delivery_store,
        )
        .project()
        .entry("SWR-501")
    )
    assert card is not None
    assert card.delivery.state is DeliveryState.DONE
    assert card.satisfaction is SatisfactionState.SATISFIED

    implementation = RequirementSite(path="src/pkg/basket.py", line=12)
    findings = evaluate_freshness(
        FreshnessInputs(
            req_id="SWR-501",
            requirement_hash=delivered.current_hash,
            implementations=(implementation,),
            covering_tests=(),
            verified=VerifiedEvidence(
                commit="c0ffee00",
                requirement_hash=delivered.current_hash,
                implementations=(implementation,),
                covering_tests=(RequirementSite(path="tests/unit/test_basket.py", line=8),),
            ),
        ),
    )
    assert [finding.reason for finding in findings] == [StalenessReason.COVERING_TEST_DISAPPEARED]

    outcome = EvidencePropagator(transitions, audit=audit).run(
        [delivery_store.read("SWR-501")],
        {"SWR-501": findings},
        at=LATER,
    )[0]

    assert outcome.moved
    assert outcome.plan.action is EvidenceAction.RESTORE

    after = BoardProjector(
        RequirementIndex(requirements=source.read().requirements),
        delivery_store,
    ).project()
    stale_card = after.entry("SWR-501")

    assert stale_card is not None
    assert stale_card.delivery.state is DeliveryState.NEEDS_UPDATE
    assert stale_card.satisfied_hash == delivered.current_hash, "what was built is still shown"
    assert stale_card.current_hash == delivered.current_hash, "the text itself never moved"

    reason = audit.read("SWR-501").events[-1].reason
    assert "tests/unit/test_basket.py" in reason
    assert "the requirement text did not change" in reason


# --------------------------------------------------------------------------
# The whole loop, composed: lose the evidence, get it back (SWR-3515, SWR-3222)
# --------------------------------------------------------------------------


@verifies(SWR.SWR_3515, SWR.SWR_3513, SWR.SWR_3222)
def test_the_pass_lets_go_of_done_and_a_verification_gives_it_back(tmp_path: Path) -> None:
    """Productive use: somebody deletes a covering test; later it comes back and the
    person presses Verify.
    Expected outcome: the board read alone takes the claim away, and only the
    verification restores it — with the traceability ring recording the run that did.

    The composed path, not the hand-assembled one above: what runs here is
    ``evaluate_workspace``, the same call the board and the CLI make."""
    from rotaris_core.requirements.change_host import (
        SweptEvidence,
        WorkspaceReverifier,
        evaluate_workspace,
        restore_verified_evidence,
    )
    from rotaris_core.requirements.delivery.evidence import VerificationRecord
    from rotaris_core.requirements.delivery.verification import (
        RequirementVerification,
        VerificationStore,
    )
    from rotaris_core.requirements.delivery.verification_pass import (
        VerificationOutcome,
        VerificationPassReport,
        VerificationResult,
        VerificationTarget,
    )
    from rotaris_core.requirements.execution.reader import WorkspaceExecution
    from rotaris_core.verifier.requirement_evidence import CoveringTest

    workspace = tmp_path / "workspace"
    workspace.mkdir()
    write_store(tmp_path)
    source = source_for(tmp_path)
    read = source.read()
    delivered = read.by_id()["SWR-501"]
    delivery_store = DeliveryStore(workspace)
    audit = AuditStore(workspace)
    deliver(
        DeliveryTransitions(
            delivery_store,
            completion=lambda _record, _request: (),
        ),
        "SWR-501",
        delivered.current_hash,
    )

    implementation = RequirementSite(path="src/pkg/basket.py", line=12)
    covering = RequirementSite(path="tests/unit/test_basket.py", line=8)
    baseline = VerifiedEvidence(
        commit="c0ffee00",
        requirement_hash=delivered.current_hash,
        implementations=(implementation,),
        covering_tests=(covering,),
    )
    gone = evaluate_freshness(
        FreshnessInputs(
            req_id="SWR-501",
            requirement_hash=delivered.current_hash,
            implementations=(implementation,),
            covering_tests=(),
            verified=baseline,
        ),
    )

    # ── the board read: the claim goes, and nobody asked ──────────────────
    report = evaluate_workspace(
        workspace,
        requirements=read.requirements,
        current_for=read.by_id().get,
        swept=SweptEvidence(
            health={"SWR-501": False},
            coverage={"SWR-501": (((implementation.path, implementation.line),), ())},
            staleness={"SWR-501": gone},
        ),
        at=LATER,
    )

    assert delivery_store.read("SWR-501").state is DeliveryState.NEEDS_UPDATE
    assert len(report.decayed) == 1, report.decayed
    assert "tests/unit/test_basket.py" in report.decayed[0]

    # ── the verification: the claim comes back, and it was asked for ──────
    verified = RequirementVerification(
        req_id="SWR-501",
        record=VerificationRecord(
            verdict="passed",
            commit="deadbeef",
            requirement_hash=delivered.current_hash,
            run_id="verify-2",
            verified_at=LATER,
            checks=("pytest",),
        ),
        implementations=(implementation,),
        covering_tests=(
            CoveringTest(
                path=covering.path,
                line=covering.line,
                executed=True,
                check_name="pytest",
                check_status="passed",
            ),
        ),
        target_branch="main",
    )
    VerificationStore(workspace).save(verified)
    restored = restore_verified_evidence(
        workspace,
        current_for=read.by_id().get,
        reverifier=WorkspaceReverifier(
            workspace,
            at=LATER,
            pass_for=lambda: VerificationPassReport(
                results=(
                    VerificationResult(
                        req_id="SWR-501",
                        outcome=VerificationOutcome.RECORDED,
                        verification=verified,
                    ),
                ),
                target=VerificationTarget(branch="main", commit="deadbeef"),
            ),
        ),
        at=LATER,
    )

    assert len(restored) == 1, restored
    record = delivery_store.read("SWR-501")
    assert record.state is DeliveryState.DONE
    # SWR-3222: the state and the ring name the same run.
    ring = VerificationStore(workspace).load("SWR-501").verification
    assert ring is not None
    assert ring.record.run_id == "verify-2"
    assert audit.read("SWR-501").events[-1].run_id == "verify-2"
    # SWR-3204: the delivery that already stood is re-stated, not replaced by a
    # run that never delivered anything.
    standing = record.satisfied.current
    assert standing is not None
    assert standing.run_id == "run-1"
    # And the completion gate really ran — the restore did not sidestep it. It
    # read the verification rather than the execution records, which is the whole
    # of SWR-3222: this workspace has no execution records at all.
    assert WorkspaceExecution(workspace).execution_for("SWR-501").empty
