"""One evaluation of one workspace, and everything a change costs (SWR-3515).

The composition root of epic 3500, beside
:mod:`~rotaris_core.requirements.verification_host`. Everything below it is pure
— the assessment, the propagation rules, the outcome mapping all take values and
return values — and everything a real evaluation needs that values cannot supply
is assembled here: the workspace's stores, its configured analysts, its
transition writer and a clock.

```text
evaluate_workspace(workspace, ...) -> PropagationReport
  1 specification   assess_specification / NeedsUpdatePass    SWR-3502
  2 evidence        propagate_evidence / EvidencePropagator   SWR-3513
  3 relations       evaluate_conflicts, find_cycles           SWR-3511, SWR-3510
  4 analysis        ImpactAnalyzer, over what step 1 moved    SWR-3503, SWR-3514
  5 offers          plan_outcome, recorded and offered        SWR-3505, SWR-3616
  6 questions       ClarificationDesk.ask                     SWR-3506, SWR-3512
  7 supersessions   plan_migration, planned once              SWR-3507
  8 removals        RemovalAnalyzer, over what vanished       SWR-3509
```

**The order is the requirement, not an implementation detail.** The text
comparison runs first because only a requirement it moved is worth analysing —
running the analyst over an unedited board would be a model call per refresh.
Evidence runs before relations because a requirement knocked out of ``Done`` is
not schedulable anyway. Nothing runs twice, which
:class:`~rotaris_core.requirements.change.outcomes.ReentrancyGuard` refuses
rather than this module remembering.

**One rule decides what a pass may do**, because six requirements here each want
to move a delivery state:

> Taking a claim away is automatic. Granting one is offered.

A pass may move a requirement *out of* ``Done`` and *into* ``Blocked`` — both are
Rotaris admitting it no longer knows something, and both cost a comparison. It
may never move one *into* ``Done`` or *into* ``Ready``: both are claims, and both
cost either a suite run or an agent run. That is what keeps a board read from
spending a user's money because they opened a tab (SWR-3616). The one exception
is the user's own declaration — ``requirements.scheduling.mode: automatic``,
which defaults to ``manual``.

**In the engine, not the desktop.** These four hundred lines lived in
``apps/rotaris/.../requirements_actions.py``, which is why change propagation was
desktop-only. ``rotaris-cli requirements evaluate`` is the second consumer that
proves the seam, the same shape SWR-3416 licensed for runs and SWR-3221 for
verification.
"""

from __future__ import annotations

import datetime as dt
import logging
from dataclasses import dataclass, field
from enum import StrEnum
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable, Collection, Mapping, Sequence
    from pathlib import Path

    from rotaris_core.requirements.change.decisions import PendingDecision
    from rotaris_core.requirements.change.detection import NeedsUpdateOutcome
    from rotaris_core.requirements.change.impact import (
        ImpactAnalysis,
        ImpactAnalyzer,
        ImpactOutcome,
        ImpactRequest,
    )
    from rotaris_core.requirements.change.outcomes import (
        OutcomePlan,
        Reverification,
        ReverificationRequest,
    )
    from rotaris_core.requirements.change.superseding import (
        ApprovedMigration,
        CoverageReference,
        MigrationAnalyst,
        MigrationPlan,
        MigrationSite,
    )
    from rotaris_core.requirements.delivery.audit import AuditStore
    from rotaris_core.requirements.delivery.completion import (
        CompletionEvidence,
        CompletionEvidenceReader,
    )
    from rotaris_core.requirements.delivery.projection import BlockerView, EvidenceReader
    from rotaris_core.requirements.delivery.staleness import StalenessFinding
    from rotaris_core.requirements.delivery.state import DeliveryActor, DeliveryState
    from rotaris_core.requirements.delivery.store import DeliveryRecord, DeliveryStore
    from rotaris_core.requirements.delivery.transitions import TransitionRequest
    from rotaris_core.requirements.delivery.verification_pass import VerificationPassReport
    from rotaris_core.requirements.execution.snapshot import ExecutionTransitions
    from rotaris_core.requirements.model import CanonicalRequirement
    from rotaris_core.requirements.registry import CancelToken
    from rotaris_core.requirements.tombstones import Tombstone

__all__ = [
    "MIGRATION_APPROVED",
    "MIGRATION_DECLINED",
    "NOTHING_TO_OFFER",
    "NOTHING_VERIFIED",
    "NOT_COVERED",
    "NO_OPEN_QUESTION",
    "OFFER_IS_STALE",
    "AnnotatedSite",
    "Analysts",
    "ChangeOffer",
    "ChangePolicy",
    "CoverageSites",
    "OfferOutcome",
    "PropagationReport",
    "RelationBlockers",
    "SweptEvidence",
    "WorkspaceChanges",
    "WorkspaceReverifier",
    "accept_change_work",
    "accept_migration",
    "addresses",
    "analyse_removals",
    "EvaluationDepth",
    "analyse_what_the_changes_cost",
    "answer_decision",
    "board_blockers",
    "ask_what_is_unclear",
    "evaluate_specification_changes",
    "evaluate_workspace",
    "evidence_of",
    "open_decisions",
    "impact_worklist",
    "pending_change_work",
    "plan_superseding_migrations",
    "propagate_lost_evidence",
    "relation_blockers",
    "restore_verified_evidence",
    "restoring_evidence_for",
    "run_specification_pass",
    "workspace_transitions",
]

#: One annotated site, as the coverage sweep addresses it (SWR-3206).
AnnotatedSite = tuple[str, int]

#: ``(traces, tests)`` for one requirement — SWR-3503's second and third input,
#: and the inventory SWR-3507's worklist has to account for.
CoverageSites = tuple[tuple[AnnotatedSite, ...], tuple[AnnotatedSite, ...]]


def _utc_now() -> dt.datetime:
    return dt.datetime.now(dt.UTC)


@traces(SWR.SWR_3515, SWR.SWR_3117)
@dataclass(frozen=True)
class Analysts:
    """The judgements a pass may need, or ``None`` for "ask the workspace".

    One value rather than four keyword arguments threaded through
    :func:`evaluate_workspace`, because they travel together: a scripted impact
    analyst and a real migration analyst in one pass would be a test half of
    which reaches a provider.

    ``None`` everywhere is production: each rule resolves the persona the
    workspace configured (SWR-3117) and records its answers against it
    (SWR-3514).
    """

    impact: ImpactAnalyzer | None = None
    migration: MigrationAnalyst | None = None
    #: Attribution for *migration* when one is supplied; ignored otherwise.
    persona: str = ""
    model: str = ""


@traces(SWR.SWR_3515, SWR.SWR_3117)
@dataclass(frozen=True)
class ChangePolicy:
    """Which propagation rules this workspace runs (``requirements.change``).

    The block has existed in the schema since slice 1 and, until this lane, was
    read by nothing — a user could set every one of these and nothing changed,
    which is the same defect as a persona roster nobody consults.

    Read structurally rather than by importing the config model, for the reason
    :meth:`~rotaris_core.requirements.delivery.staleness.FreshnessPolicy.read`
    does it: this module must stay usable over a workspace whose configuration
    cannot be loaded at all.
    """

    analyze_changes: bool = True
    adopt_hash_after_verification: bool = True
    propagate_evidence_loss: bool = True
    gate_on_dependencies: bool = True
    #: SWR-3509's switch, and the last one of this block to start deciding
    #: something. Off, a removal is still tombstoned — an id that stopped
    #: resolving is a fact, not an opinion — but nothing is analysed and no
    #: dependant is reported as dangling. It is a switch about *saying*, never
    #: about remembering.
    report_dangling_dependents: bool = True
    #: SWR-3507's switch, read from ``requirements.human_in_the_loop`` rather
    #: than from the ``change`` block, because it is a statement about who
    #: decides and not about what is analysed.
    #:
    #: On, a planned worklist parks its requirement with an open question until a
    #: person answers it. Off, the worklist is still planned and still stored —
    #: it simply does not interrupt the board, and somebody has to go and approve
    #: it. What it cannot do either way is let a migration run unapproved:
    #: ``MigrationApproval`` refuses any actor that is not a named human, so
    #: "an agent decides instead" is not a state this switch can reach.
    confirm_migration_worklist: bool = True
    #: Whether the work a change asks for is accepted without a user action.
    #: Read from ``requirements.scheduling.mode``, not from the ``change`` block:
    #: it is the same declaration that decides whether the queue picks work up
    #: itself (SWR-3412), and having two switches for one appetite is how a
    #: project ends up with a board that starts runs it thought it had stopped.
    #: Defaults to ``False``, because ``mode`` defaults to ``manual``.
    accept_automatically: bool = False

    @classmethod
    def of(cls, workspace: Path) -> ChangePolicy:
        """*workspace*'s own answer, or every rule on when it cannot be read.

        A configuration Rotaris cannot parse must not silently disable
        propagation: the defaults are what a project that declared nothing gets,
        and an unreadable file gets the same rather than a quieter product.
        Automatic acceptance is the exception and defaults the other way — a
        workspace whose configuration cannot be read has not asked for it.
        """
        import logging

        from rotaris_core.config.loader import load_config

        try:
            requirements = load_config(workspace).requirements
        except Exception:  # noqa: BLE001 — an evaluation must not fail over configuration
            logging.getLogger(__name__).warning(
                "Could not read requirements.change for %s; every rule stays on",
                workspace,
                exc_info=True,
            )
            return cls()
        return cls.read(
            requirements.change,
            scheduling=requirements.scheduling,
            human=requirements.human_in_the_loop,
        )

    @classmethod
    def read(
        cls,
        block: object,
        *,
        scheduling: object = None,
        human: object = None,
    ) -> ChangePolicy:
        """Read a ``requirements.change`` block, and the two switches beside it."""
        confirm = getattr(human, "confirm_migration_worklist", None)
        return cls(
            accept_automatically=getattr(scheduling, "mode", "manual") == "automatic",
            confirm_migration_worklist=confirm if isinstance(confirm, bool) else True,
            **{
                name: value
                for name in (
                    "analyze_changes",
                    "adopt_hash_after_verification",
                    "propagate_evidence_loss",
                    "gate_on_dependencies",
                    "report_dangling_dependents",
                )
                if isinstance(value := getattr(block, name, None), bool)
            },
        )


@traces(SWR.SWR_3519)
class EvaluationDepth(StrEnum):
    """How deep one evaluation pass goes.

    The axis SWR-3515 left unstated: some of its rules are arithmetic over hashes
    and some wait on a language model, and a caller could not tell the two apart.
    A depth is **per pass** — ``requirements.change``'s switches are the
    workspace's standing declaration (SWR-3117) and the two compose: a rule the
    policy disables is disabled at every depth, and no depth re-enables it.
    """

    #: The deterministic rules alone. No analyst is built and none is called, so
    #: a caller that must not wait on a provider has a call it can make.
    RULES_ONLY = "rules-only"
    #: Every rule, as SWR-3515 describes. The default: a caller that says nothing
    #: gets what it got before this existed.
    FULL = "full"


@traces(SWR.SWR_3515)
@dataclass(frozen=True)
class PropagationReport:
    """What one evaluation did, one line per thing it did.

    Kept apart by step rather than concatenated, because the surfaces differ:
    a moved card and a raised question are notices, a planned worklist is an
    inspectable record, and an offer is a thing to accept. :attr:`lines` is the
    flat reading a text surface wants, in the order the steps ran.
    """

    #: Requirements freed from ``Running`` because the process running them is
    #: gone (SWR-3611). First in :attr:`lines` because it runs first: a card the
    #: board is wrongly calling "in flight" makes every other line about it read
    #: as news about live work.
    recovered: tuple[str, ...] = ()
    #: Requirements the specification pass actually moved (SWR-3502).
    moved: tuple[str, ...] = ()
    #: Requirements whose *evidence* went while their text stood still (SWR-3513).
    decayed: tuple[str, ...] = ()
    #: What an impact analysis concluded about each of them (SWR-3503).
    analysed: tuple[str, ...] = ()
    #: Offers this pass accepted for the user, because the workspace declared
    #: ``scheduling.mode: automatic``. Empty in a ``manual`` workspace, which is
    #: the default (SWR-3616).
    accepted: tuple[str, ...] = ()
    #: Questions raised because a change could not be classified (SWR-3506).
    asked: tuple[str, ...] = ()
    #: Migration worklists planned for supersessions this pass found (SWR-3507).
    migrations: tuple[str, ...] = ()
    #: What the requirements that disappeared left behind (SWR-3509).
    removals: tuple[str, ...] = ()
    #: Whether the pass stopped because it was asked to (SWR-3519). What it had
    #: already applied stays applied; a cancelled pass is short, never undone.
    cancelled: bool = False
    #: Requirements this pass moved or found diverged and did *not* analyse —
    #: because of its depth, a policy switch, or a cancellation (SWR-3519).
    #: Reporting only: the next full pass picks them up from state, so nothing
    #: depends on a caller acting on this.
    unanalysed: tuple[str, ...] = ()
    #: Whether this workspace permits impact analysis at all — its own standing
    #: declaration, ``requirements.change.analyze_changes`` (SWR-3117).
    #:
    #: Reported beside :attr:`unanalysed` because the two only mean something
    #: together: a caller looking at a non-empty worklist is asking "would
    #: running a full pass pay this off?", and the answer is no in a workspace
    #: that switched the analysis off. Read from the policy rather than from
    #: what this pass happened to do, so a rules-only pass gives the same answer
    #: a full one does — and so a *failed* analysis, which leaves the same
    #: non-empty worklist behind (SWR-3503), is never mistaken for a workspace
    #: that never wanted one.
    analysis_enabled: bool = True

    @property
    def lines(self) -> tuple[str, ...]:
        """Every sentence this pass produced, in step order."""
        return (
            self.recovered
            + self.moved
            + self.decayed
            + self.analysed
            + self.accepted
            + self.asked
            + self.migrations
            + self.removals
        )

    @property
    def quiet(self) -> bool:
        """Whether the pass found nothing to say — the overwhelmingly common read."""
        return not self.lines


@traces(SWR.SWR_3515, SWR.SWR_3203, SWR.SWR_3403)
def workspace_transitions(
    workspace: Path,
    *,
    current_for: Callable[[str], CanonicalRequirement | None],
    delivery: DeliveryStore | None = None,
    audit: AuditStore | None = None,
    evidence_for: CompletionEvidenceReader | None = None,
) -> ExecutionTransitions:
    """The one door a delivery state moves through in *workspace* (SWR-3203).

    Every propagation engine in this epic takes a ``TransitionDoor``, and each of
    them would otherwise compose its own — four compositions of the guarded,
    gated writer, three of which somebody would eventually build without the
    completion gate. Built once here means a requirement cannot reach ``Done``
    through a door that forgot to ask (SWR-3215), and cannot reach it at all
    after a mid-run edit (SWR-3403).

    By default the evidence the gate reads is
    :func:`~rotaris_core.requirements.execution.reader.completion_evidence_for`
    over a reader built *inside* the transition, so the conditions are evaluated
    against the records as they stand at the moment of the move rather than as
    they stood when the pass began.

    *evidence_for* replaces that reading, and exactly one caller does:
    :func:`restore_verified_evidence`, whose ``Done`` rests on a verification
    that has just run rather than on a delivering run's records. Replacing the
    *reading* keeps the gate; removing the gate would be the composition
    SWR-3515 exists to prevent.
    """
    from rotaris_core.requirements.delivery.audit import AuditStore as Audit
    from rotaris_core.requirements.delivery.completion import completion_gate
    from rotaris_core.requirements.delivery.store import DeliveryStore as Store
    from rotaris_core.requirements.execution.reader import (
        WorkspaceExecution,
        completion_evidence_for,
    )
    from rotaris_core.requirements.execution.snapshot import ExecutionTransitions as Transitions

    store = delivery if delivery is not None else Store(workspace)
    trail = audit if audit is not None else Audit(workspace)

    def from_execution(_record: object, request: TransitionRequest) -> CompletionEvidence:
        requirement = current_for(request.req_id)
        return completion_evidence_for(
            WorkspaceExecution(workspace, delivery=store, requirement_for=current_for),
            request.req_id,
            current_hash=requirement.current_hash if requirement is not None else "",
        )

    return Transitions(
        store,
        current_for=current_for,
        audit=trail,
        completion=completion_gate(evidence_for if evidence_for is not None else from_execution),
    )


@traces(SWR.SWR_3222, SWR.SWR_3513, SWR.SWR_3215)
def restoring_evidence_for(reverifier: WorkspaceReverifier) -> CompletionEvidenceReader:
    """The completion evidence a *restore* rests on: the verification that just ran.

    SWR-3215's conditions were written for a delivering run — units finished, the
    run's gate passed, the run's changed files carrying the traces and tests. A
    restore has none of that and should not: the delivery already happened, and
    :meth:`EvidencePropagator.restore` re-states it rather than minting a new one.
    What has just happened is a verification, and that verification *is* the
    evidence — it names the requirement's implementation sites, which of its
    covering tests were executed, and whether they passed.

    Reading the delivering run's records instead would make a restore impossible
    for every **adopted** requirement (SWR-3217), which has a delivery record and
    no execution records at all — the largest population on any real board.

    The gate itself is untouched. What changes is which facts it is shown, which
    is the seam :func:`~rotaris_core.requirements.delivery.completion.completion_gate`
    was given a reader for.
    """
    from rotaris_core.requirements.delivery.completion import (
        CompletionEvidence as Evidence,
    )
    from rotaris_core.requirements.delivery.completion import CoveringTestEvidence

    def evidence_for(record: DeliveryRecord, request: TransitionRequest) -> CompletionEvidence:
        report = reverifier.report
        found = (
            next(
                (
                    result.verification
                    for result in report.results
                    if result.req_id == request.req_id and result.verification is not None
                ),
                None,
            )
            if report is not None
            else None
        )
        delivered = record.satisfied.current
        if found is None:
            # No verification for this requirement: the gate then sees no covering
            # test and no passing gate, and refuses — which is the right answer
            # and the same one it would give a delivering run that verified nothing.
            return Evidence(req_id=request.req_id, satisfied_hash=None)
        passed = found.record.passed
        return Evidence(
            req_id=request.req_id,
            current_hash=found.record.requirement_hash,
            satisfied_hash=delivered.satisfied_hash if delivered is not None else None,
            implementation_traces=tuple(site.path for site in found.implementations),
            covering_tests=tuple(
                # Per test, not per record: spreading the record's own verdict over
                # every covering test is what let one killed suite mark all of them
                # failed. ``verdict`` is derived on read for records written before
                # the field existed, so an old store reads honestly too (SWR-2606).
                CoveringTestEvidence(
                    path=test.path,
                    executed=test.executed,
                    passed=passed and test.verdict == "passed",
                    inconclusive=test.verdict == "unknown",
                )
                for test in found.covering_tests
            ),
            gate_passed=passed,
            gate_detail=found.summary,
            # A restore integrates nothing: the work it re-states was integrated
            # when it was delivered, and this transition adds no unit to integrate.
            integration_complete=True,
        )

    return evidence_for


def addresses(sites: Sequence[AnnotatedSite]) -> tuple[str, ...]:
    """``path:line`` for each site — what SWR-3206 records and a card opens."""
    return tuple(f"{path}:{line}" for path, line in sites)


@traces(SWR.SWR_3515, SWR.SWR_3503, SWR.SWR_3513)
@dataclass(frozen=True)
class SweptEvidence:
    """What one evidence sweep tells a propagation pass, per requirement.

    Three derivations from one reader, because the pass needs all three and each
    would otherwise be recomputed at a call site: whether a requirement's
    delivered evidence still exists at all, where its traces and covering tests
    are, and every reason the last verification stopped being current.
    """

    #: Whether the requirement has both an implementation trace and a covering
    #: test right now. SWR-3502's restore condition (SWR-3513).
    health: Mapping[str, bool]
    #: ``(traces, tests)`` per requirement — SWR-3503's inputs, SWR-3507's inventory.
    coverage: Mapping[str, CoverageSites]
    #: SWR-3209's findings, per requirement. Empty for a requirement nobody ever
    #: verified: there is no baseline to have drifted from, which is a different
    #: fact from "nothing drifted".
    staleness: Mapping[str, tuple[StalenessFinding, ...]]


@traces(SWR.SWR_3515, SWR.SWR_3503, SWR.SWR_3513)
def evidence_of(
    requirements: Sequence[CanonicalRequirement],
    evidence: EvidenceReader,
) -> SweptEvidence:
    """Everything a propagation pass needs from *evidence*, read once.

    Derived here rather than at each call site because the *definitions* are the
    part that can drift: "has an implementation and has a covering test" is a
    judgement, and two copies of it would let a board and a headless run disagree
    about whether a requirement may return to ``Done``.
    """
    health: dict[str, bool] = {}
    coverage: dict[str, CoverageSites] = {}
    staleness: dict[str, tuple[StalenessFinding, ...]] = {}
    for requirement in requirements:
        inputs = evidence.evidence_for(requirement)
        health[requirement.req_id] = bool(inputs.implementations) and bool(inputs.covering_tests)
        coverage[requirement.req_id] = (
            tuple((site.path, site.line) for site in inputs.implementations),
            tuple((test.path, test.line) for test in inputs.covering_tests),
        )
        if inputs.staleness:
            staleness[requirement.req_id] = tuple(inputs.staleness)
    return SweptEvidence(health=health, coverage=coverage, staleness=staleness)


# ── the evaluation pass a board read performs (SWR-3502) ───────────────────


@traces(SWR.SWR_3502, SWR.SWR_3213)
def evaluate_specification_changes(
    workspace: Path,
    *,
    current_for: Callable[[str], CanonicalRequirement | None],
    evidence_current: Mapping[str, bool] | None = None,
    at: dt.datetime | None = None,
    version_at: Callable[[str, str], CanonicalRequirement | None] | None = None,
    coverage: Mapping[str, CoverageSites] | None = None,
    analyzer: ImpactAnalyzer | None = None,
) -> tuple[str, ...]:
    """Move every delivered requirement whose text moved, and say what it costs.

    The central promise of the product, on the path it has to be on: SWR-3502
    asks for the transition to happen **on evaluation, without user action**, so
    this runs where the board is read rather than behind a menu item. A
    requirement nobody edited costs nothing here — the pass compares two hashes
    and asks for no transition — which is what makes it safe on every read
    instead of only when somebody remembers.

    It is on the *taking away* side of SWR-3616's rule, which is why it may run
    unasked at all: every move it makes is out of ``Done``, and the audit trail
    records the *system* actor (SWR-3610) because a specification change is not
    somebody's decision.

    *evidence_current* answers "does the delivered evidence still exist" per
    requirement and decides the one direction that gives ``Done`` back: a
    requirement whose edit was reverted returns to ``Done`` only when its traces
    and covering tests are still there (SWR-3513). Answers are read from the
    caller's own coverage sweep, so this stays free of one.

    *version_at* is the source's own history read (``read_requirement_at``,
    SWR-3102) and is what makes SWR-3503 possible here: neither Rotaris'
    snapshots nor its delivery records may hold the delivered *text* (SWR-3114),
    so the version a delivery was made against can only come from the source, at
    the revision the delivery recorded. Without it — a source with no history —
    the pass still moves the card and simply says nothing about what the change
    costs. *coverage* supplies the other two inputs SWR-3503 names, as the caller's
    sweep already has them, and *analyzer* is the analyser to ask — built from the
    workspace's configured persona when it is omitted, which is what production
    does.

    Returns one line per requirement that actually moved and one per impact
    analysis that ran — the material for the notice a surface shows. A workspace
    that has delivered nothing yet returns early and touches no audit trail, so
    opening the board on a fresh project creates nothing. A store that cannot be
    read *does* raise: the caller turns it into the stated evaluation failure of
    SWR-3312, and swallowing it here would leave a board that silently stopped
    noticing edits.
    """
    moment = at if at is not None else _utc_now()
    outcomes = run_specification_pass(
        workspace,
        current_for=current_for,
        evidence_current=evidence_current,
        at=moment,
    )
    moved = tuple(outcome.message for outcome in outcomes if outcome.moved)
    return moved + analyse_what_the_changes_cost(
        workspace,
        outcomes,
        current_for=current_for,
        version_at=version_at,
        coverage=coverage,
        evidence_current=evidence_current,
        analyzer=analyzer,
        at=moment,
    )


@traces(SWR.SWR_3502, SWR.SWR_3213)
def run_specification_pass(
    workspace: Path,
    *,
    current_for: Callable[[str], CanonicalRequirement | None],
    evidence_current: Mapping[str, bool] | None = None,
    at: dt.datetime | None = None,
) -> tuple[NeedsUpdateOutcome, ...]:
    """SWR-3502's rule applied to *workspace*, as outcomes rather than sentences.

    The half :func:`evaluate_specification_changes` wraps, exposed because
    :func:`evaluate_workspace` needs the outcomes themselves: which requirements
    moved decides what is worth analysing, and reconstructing that from the
    sentences would mean parsing them.
    """
    from rotaris_core.requirements.change.detection import NeedsUpdatePass
    from rotaris_core.requirements.delivery.audit import AuditStore
    from rotaris_core.requirements.delivery.store import DeliveryStore

    delivery = DeliveryStore(workspace)
    index = delivery.load_all()
    records = [index.get(req_id) for req_id in index.req_ids]
    if not records:
        return ()
    hashes: dict[str, str] = {}
    for req_id in index.req_ids:
        requirement = current_for(req_id)
        if requirement is not None:
            hashes[req_id] = requirement.current_hash

    audit = AuditStore(workspace)
    return tuple(
        NeedsUpdatePass(
            workspace_transitions(
                workspace,
                current_for=current_for,
                delivery=delivery,
                audit=audit,
            ),
            audit=audit,
        ).run(
            records,
            hashes,
            at=at if at is not None else _utc_now(),
            evidence_current=evidence_current,
        ),
    )


@traces(SWR.SWR_3503, SWR.SWR_3514, SWR.SWR_3117)
def analyse_what_the_changes_cost(
    workspace: Path,
    outcomes: Sequence[NeedsUpdateOutcome],
    *,
    current_for: Callable[[str], CanonicalRequirement | None],
    version_at: Callable[[str, str], CanonicalRequirement | None] | None,
    coverage: Mapping[str, CoverageSites] | None,
    evidence_current: Mapping[str, bool] | None,
    analyzer: ImpactAnalyzer | None,
    at: dt.datetime,
    cancel: CancelToken | None = None,
) -> tuple[str, ...]:
    """Ask the configured analyst what each requirement that owes one costs.

    SWR-3503's production path, and it starts where the change was noticed: the
    pass above has just decided that a *delivered* requirement's text no longer
    matches what was delivered, which is exactly the question "is this a typo or
    a new acceptance criterion" being asked of a user who did not ask it.

    Deliberately narrow. Only requirements :func:`impact_worklist` names are
    analysed — those whose text diverges from what was delivered and whose
    current version has no analysis yet — so an unedited board costs nothing and
    an already-analysed one costs nothing twice; a requirement whose delivery
    recorded no source revision is skipped rather than analysed against a version
    nobody can name; and a workspace with no analyst gets no analysis instead of
    a failure.

    *cancel* is checked **between** requirements, so stopping costs at most one
    analysis (SWR-3519). What was analysed before the stop is recorded and
    reported; the rest stays on the worklist for the next pass to find. Every path that *does* reach a model leaves an
    :class:`~rotaris_core.requirements.change.records.AnalysisRecord` (SWR-3514),
    the failed ones included — "we asked and the model was unreachable" is a fact
    a reviewer needs months later just as much as a verdict is.

    Nothing here can change a delivery state. The analysis is read-only by
    construction (``read_only_report``) and its outcome is *reported*: acting on
    it is SWR-3505's and SWR-3506's business, on a path a human is part of.
    """
    from rotaris_core.requirements.change.impact import ImpactRequest, RequirementVersion
    from rotaris_core.requirements.change.records import AnalysisRecordStore

    owed = frozenset(impact_worklist(workspace, outcomes))
    if version_at is None or not owed:
        return ()
    asked = analyzer if analyzer is not None else _impact_analyzer(workspace, clock=lambda: at)
    if asked is None:
        return ()

    store = AnalysisRecordStore(workspace)
    lines: list[str] = []
    for outcome in outcomes:
        delivered = outcome.assessment.retained
        if outcome.assessment.req_id not in owed or delivered is None:
            continue
        if cancel is not None and cancel.cancelled:
            break
        req_id = outcome.assessment.req_id
        revision = (delivered.source_revision or "").strip()
        current = current_for(req_id)
        before = version_at(req_id, revision) if revision else None
        if current is None or before is None:
            continue
        traced, tested = coverage.get(req_id, ((), ())) if coverage is not None else ((), ())
        analysis = asked.analyse(
            ImpactRequest.between(
                RequirementVersion.of(before),
                RequirementVersion.of(current),
                traces=addresses(traced),
                tests=addresses(tested),
                evidence=_evidence_token(evidence_current, req_id),
                delivering_run=delivered.run_id,
                verified_commit=delivered.verified_commit,
            ),
        )
        store.append(analysis.to_record())
        lines.append(analysis.message)
    return tuple(lines)


def _costs_an_analysis(outcome: NeedsUpdateOutcome) -> bool:
    """Whether this requirement's current version is one SWR-3503 asks about.

    Two admissions, and the second is SWR-3519's catch-up:

    - a *delivered* requirement this pass just moved into ``Needs Update`` — the
      original rule, and the common case;
    - one that is *already* in ``Needs Update`` and whose text still differs from
      what was delivered. The specification pass assesses every delivery record,
      so this one is in *outcomes* too, as ``STEADY`` asking for no transition
      (:func:`~rotaris_core.requirements.change.detection.assess_specification`).

    Without the second, an analysis missed once is missed forever: the pass that
    moved the requirement is the only pass that would ever have analysed it, and
    the next one moves nothing. The requirement then sits in ``Needs Update``
    carrying no offer — :func:`pending_change_work` answers from the analysis log
    — which reads as "nothing to do" rather than as "nobody looked". That is
    reachable with no depth at all: a workspace with ``analyze_changes`` off, or
    one whose persona did not resolve when the pass ran.

    Eligibility is not sufficiency: :func:`analyse_what_the_changes_cost` also
    refuses a version it has already analysed, because records append (SWR-3514)
    and re-analysing would cost a model call per card per refresh.

    A restore to ``Done`` has nothing to judge, and a requirement that never
    reached a delivery has no version to diff against; both stay out.
    """
    from rotaris_core.requirements.change.detection import SpecificationVerdict
    from rotaris_core.requirements.delivery.state import DeliveryState

    assessment = outcome.assessment
    if assessment.retained is None:
        return False
    if outcome.moved and assessment.target is DeliveryState.NEEDS_UPDATE:
        return True
    return (
        assessment.verdict is SpecificationVerdict.STEADY
        and assessment.state is DeliveryState.NEEDS_UPDATE
    )


@traces(SWR.SWR_3519, SWR.SWR_3514)
def _analysed_already(workspace: Path, req_id: str, version: str) -> bool:
    """Whether an impact analysis of *version* is already on record.

    Keyed on the *after* hash alone rather than on the pair: a record's
    ``after_hash`` is the analysed requirement's own ``content_hash``
    (:meth:`~rotaris_core.requirements.change.impact.ImpactRequest.to_record`),
    so it answers exactly "has this version been analysed" — which is the
    question SWR-3503 owes. ``before_hash`` comes from a source-revision read one
    step less direct, and keying on it would re-analyse whenever that read
    resolved differently.

    The same one-file read :func:`pending_change_work` already makes per card.
    """
    from rotaris_core.requirements.change.records import AnalysisKind, AnalysisRecordStore

    if not version:
        return False
    return any(
        record.kind is AnalysisKind.IMPACT
        and record.outcome
        and record.inputs.after_hash == version
        for record in AnalysisRecordStore(workspace).load(req_id).log.records
    )


@traces(SWR.SWR_3519, SWR.SWR_3503)
def impact_worklist(
    workspace: Path,
    outcomes: Sequence[NeedsUpdateOutcome],
) -> tuple[str, ...]:
    """Which requirements this workspace owes an impact analysis, right now.

    Derived from state rather than from what a pass just did, which is what makes
    the guarantee hold at every depth: run it before an analysis to know what to
    analyse, and after one to know what was left (SWR-3519).
    """
    return tuple(
        outcome.assessment.req_id
        for outcome in outcomes
        if _costs_an_analysis(outcome)
        and not _analysed_already(
            workspace,
            outcome.assessment.req_id,
            outcome.assessment.current_hash,
        )
    )


def _evidence_token(evidence_current: Mapping[str, bool] | None, req_id: str) -> str:
    """The evidence health SWR-3503 hands the analysis, as one recordable token."""
    if evidence_current is None or req_id not in evidence_current:
        return "unknown"
    return "present" if evidence_current[req_id] else "missing"


@traces(SWR.SWR_3503, SWR.SWR_3117)
def _impact_analyzer(
    workspace: Path,
    *,
    clock: Callable[[], dt.datetime],
) -> ImpactAnalyzer | None:
    """This workspace's impact analyser, or ``None`` when no persona resolves.

    The analyser is built with the persona and model its outcomes are recorded
    against (SWR-3514) and with nothing else: no store, no source, no path. The
    model handle inside the analyst is deferred, so a board read that analyses
    nothing never touches a provider.
    """
    import logging

    from rotaris_core.config.loader import load_config
    from rotaris_core.requirements.analysis.analysts import ImpactAnalyst, deferred_completion
    from rotaris_core.requirements.analysis.persona import resolve_analyst

    # Imported under its own name, not aliased: SWR-3311's reachability guard
    # reads the shipped source for `ImpactAnalyzer(...)`, and an alias here makes
    # SWR-3503 read as approved with no production path — which is exactly the
    # condition that guard exists to report.
    from rotaris_core.requirements.change.impact import ImpactAnalyzer

    try:
        config = load_config(workspace)
        resolved = resolve_analyst(config, ImpactAnalyst.JOB)
    except Exception:  # noqa: BLE001 — a board read must not fail over configuration
        logging.getLogger(__name__).warning(
            "No impact analyst for %s; changed requirements move without an analysis",
            workspace,
            exc_info=True,
        )
        return None
    return ImpactAnalyzer(
        model=ImpactAnalyst(resolved, completion=deferred_completion(config, resolved)),
        persona=resolved.persona,
        model_name=resolved.model,
        clock=clock,
    )


# ── what two requirements' relations say about each other (SWR-3511, SWR-3510) ──


@traces(SWR.SWR_3511, SWR.SWR_3510, SWR.SWR_3515)
@dataclass(frozen=True)
class RelationBlockers:
    """What the requirement set's own relations block, per requirement.

    A pure function of the index — no store, no history, no model — which is why
    it is *derived* on every evaluation rather than written anywhere. That is
    also what makes SWR-3511's fourth criterion free: a conflict resolved in the
    source is simply absent from the next evaluation, with nothing to clear.

    Held as a value and handed to
    :class:`~rotaris_core.requirements.execution.reader.WorkspaceExecution` the
    way a scheduler decision already is, because both are facts about the whole
    set and a reader asked one requirement at a time cannot compute either.
    """

    blockers: Mapping[str, tuple[BlockerView, ...]] = field(default_factory=dict)
    #: Requirement ids each requirement contradicts, for the scheduler's hold.
    contradictions: Mapping[str, tuple[str, ...]] = field(default_factory=dict)

    def for_requirement(self, req_id: str) -> tuple[BlockerView, ...]:
        """What blocks *req_id*, or nothing."""
        return self.blockers.get(req_id, ())

    def contradicting(self, req_id: str) -> tuple[str, ...]:
        """The requirements *req_id* contradicts right now."""
        return self.contradictions.get(req_id, ())


@traces(SWR.SWR_3512, SWR.SWR_3516, SWR.SWR_3607)
def open_decisions(workspace: Path) -> dict[str, tuple[BlockerView, ...]]:
    """Every question a requirement is waiting on, as the board's blockers.

    ``BlockerKind.DECISION`` has had a presentation *and* an answer path in the
    board's blocker panel since slice 6 and no producer at all — the widget's
    closed table listed a kind the engine could never emit. This is it.

    One directory listing, then one read per requirement that actually has a
    question. A board with no open decisions costs a ``glob`` that finds nothing.
    """
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore
    from rotaris_core.requirements.delivery.projection import (
        BlockerKind,
        BlockerOption,
        BlockerView,
    )

    store = PendingDecisionStore(workspace)
    found: dict[str, tuple[BlockerView, ...]] = {}
    for req_id in store.waiting():
        pending = store.open_for(req_id)
        if pending is None:  # pragma: no cover - `waiting` only lists open ones
            continue
        found[req_id] = (
            BlockerView(
                req_id=req_id,
                kind=BlockerKind.DECISION,
                reason=pending.question,
                raised_at=pending.raised_at,
                options=tuple(
                    BlockerOption(
                        key=option.name,
                        label=option.name,
                        # The engine's own sentence. An option whose effect the
                        # board invented would be a button nobody can take
                        # responsibility for (SWR-3512).
                        consequence=option.consequence,
                    )
                    for option in pending.options
                ),
            ),
        )
    return found


@traces(SWR.SWR_3511, SWR.SWR_3510)
def relation_blockers(
    requirements: Sequence[CanonicalRequirement],
    *,
    policy: ChangePolicy | None = None,
) -> RelationBlockers:
    """Every block the relations alone impose. Pure.

    Two rules, and both were written, tested and never constructed:

    - **A contradiction blocks both sides** (SWR-3511). Symmetric by
      construction: :func:`~rotaris_core.requirements.change.conflicts.evaluate_conflicts`
      normalises the pair, and a block is emitted for each id in it, so there is
      no ordering under which only the newer one stops.
    - **A dependency cycle blocks every member, with the cycle named**
      (SWR-3510's fourth criterion). The scheduler already holds a requirement
      whose dependency is not ``Done``, which is what a cycle looks like from the
      inside — but "waits for SWR-x" and "waits forever" are the same sentence
      there, and only one of them is something a user can act on.

    A workspace that turned ``requirements.change.gate_on_dependencies`` off gets
    the conflicts and not the cycles: a contradiction is not a dependency, and a
    project that chose not to have its dependencies gate execution has said
    nothing about two requirements that cannot both hold.
    """
    from rotaris_core.requirements.change.conflicts import evaluate_conflicts
    from rotaris_core.requirements.change.dependencies import dependency_edges, find_cycles
    from rotaris_core.requirements.delivery.projection import (
        BlockerKind,
        BlockerOption,
        BlockerView,
    )
    from rotaris_core.requirements.relations import build_relation_graph

    found: dict[str, list[BlockerView]] = {}
    contradictions: dict[str, list[str]] = {}
    for conflict in evaluate_conflicts(requirements).conflicts:
        for req_id in (conflict.left, conflict.right):
            found.setdefault(req_id, []).append(
                BlockerView(
                    req_id=req_id,
                    kind=BlockerKind.CONFLICT,
                    reason=conflict.contradiction,
                    blocking_ids=(conflict.other(req_id),),
                    options=tuple(
                        BlockerOption(
                            key=str(decision),
                            label=decision.label,
                            # The engine's own sentence for this pair. A board that
                            # phrased the consequence itself would be a button
                            # nobody can take responsibility for (SWR-3512).
                            consequence=decision.prompt(conflict.left, conflict.right),
                        )
                        for decision in conflict.decisions
                    ),
                ),
            )
            contradictions.setdefault(req_id, []).append(conflict.other(req_id))
    gating = policy.gate_on_dependencies if policy is not None else True
    for cycle in (
        find_cycles(dependency_edges(build_relation_graph(requirements))) if gating else ()
    ):
        named = " → ".join((*cycle.members, cycle.members[0]))
        for req_id in cycle.members:
            found.setdefault(req_id, []).append(
                BlockerView(
                    req_id=req_id,
                    kind=BlockerKind.DEPENDENCY,
                    reason=(
                        f"{req_id} is in a dependency cycle ({named}); none of its"
                        " members can be delivered before the others (SWR-3510)"
                    ),
                    blocking_ids=tuple(member for member in cycle.members if member != req_id),
                ),
            )
    return RelationBlockers(
        blockers={req_id: tuple(views) for req_id, views in found.items()},
        contradictions={req_id: tuple(ids) for req_id, ids in contradictions.items()},
    )


@traces(SWR.SWR_3511, SWR.SWR_3510, SWR.SWR_3512)
def board_blockers(
    workspace: Path,
    requirements: Sequence[CanonicalRequirement],
    *,
    policy: ChangePolicy | None = None,
) -> RelationBlockers:
    """Everything blocking a requirement that is *derived* rather than stored.

    Three kinds, one value, one pass: contradictions and dependency cycles from
    the relations (pure), and open questions from the decision store (one glob).
    Handed to :class:`~rotaris_core.requirements.execution.reader.WorkspaceExecution`
    together, because the alternative is three parameters that a caller can wire
    two of.
    """
    relations = relation_blockers(requirements, policy=policy)
    decisions = open_decisions(workspace)
    if not decisions:
        return relations
    merged = dict(relations.blockers)
    for req_id, views in decisions.items():
        merged[req_id] = (*views, *merged.get(req_id, ()))
    return RelationBlockers(blockers=merged, contradictions=relations.contradictions)


# ── the evidence that decayed while the text stood still (SWR-3513) ────────


@traces(SWR.SWR_3513, SWR.SWR_3515)
def propagate_lost_evidence(
    workspace: Path,
    *,
    staleness: Mapping[str, Sequence[StalenessFinding]],
    at: dt.datetime | None = None,
    current_for: Callable[[str], CanonicalRequirement | None],
    transitions: ExecutionTransitions | None = None,
    audit: AuditStore | None = None,
) -> tuple[str, ...]:
    """Move every requirement whose *evidence* went, and name the evidence.

    SWR-3513's production path. The findings are SWR-3209's own, computed by the
    caller's evidence reader — this asks git nothing and reads no requirement
    text, which :func:`~rotaris_core.requirements.change.propagation.analyser_free_report`
    turns from a claim into a check.

    **This is on the taking-away side of the rule, and only that side.** A
    requirement whose covering test disappeared leaves ``Done`` here; one whose
    evidence came back does *not* return here, because coming back costs a
    verification a user asked for (SWR-3222,
    :meth:`~rotaris_core.requirements.change.propagation.EvidencePropagator.restore`).
    So the propagator is built **without** a verifier: the restore path is not
    merely unused on this call, it is absent from the object, which is why a
    board read cannot take it.

    An ordinary edit under a trace moves nothing: ``propagate_evidence`` answers
    ``reverify`` with no target for it, and only a *disappeared* site or a
    *failed* verification asks for a transition. That distinction is the whole
    difference between a board that notices a deleted test and one that empties
    its ``Done`` column on every commit.
    """
    from rotaris_core.requirements.change.propagation import EvidencePropagator
    from rotaris_core.requirements.delivery.audit import AuditStore as Audit
    from rotaris_core.requirements.delivery.store import DeliveryStore

    if not any(findings for findings in staleness.values()):
        return ()
    delivery = DeliveryStore(workspace)
    index = delivery.load_all()
    records = [index.get(req_id) for req_id in index.req_ids if staleness.get(req_id)]
    if not records:
        return ()
    trail = audit if audit is not None else Audit(workspace)
    outcomes = EvidencePropagator(
        transitions
        if transitions is not None
        else workspace_transitions(
            workspace,
            current_for=current_for,
            delivery=delivery,
            audit=trail,
        ),
        audit=trail,
    ).run(records, staleness, at=at if at is not None else _utc_now())
    # The *plan's* sentence, not the transition's. Both are true and only one is
    # useful: the transition says "Done → Needs Update", which a user can see on
    # the card, while the plan names the covering test that disappeared, which is
    # the thing to go and fix (SWR-3513's second criterion).
    return tuple(outcome.plan.message for outcome in outcomes if outcome.moved)


@traces(SWR.SWR_3513, SWR.SWR_3222, SWR.SWR_3615)
def restore_verified_evidence(
    workspace: Path,
    *,
    current_for: Callable[[str], CanonicalRequirement | None],
    reverifier: WorkspaceReverifier,
    at: dt.datetime | None = None,
    transitions: ExecutionTransitions | None = None,
    audit: AuditStore | None = None,
) -> tuple[str, ...]:
    """Give ``Done`` back to what a verification just earned it (SWR-3513).

    The way back, and it runs where the user asked for one: this is composed into
    the Verify action and into ``requirements verify``, never into a board read.
    Restoring a deleted test file proves a file exists; ``Done`` claims the
    requirement is delivered, and only an executed, passing suite says that.

    Narrow on purpose. Only a requirement that (a) stands in ``Needs Update``
    and (b) has a delivery to restore is offered to the propagator at all — a
    requirement that never reached ``Done`` has none to give back, and
    :meth:`EvidencePropagator.restore` says so by raising rather than inventing
    one.
    """
    from rotaris_core.requirements.change.propagation import EvidencePropagator
    from rotaris_core.requirements.delivery.audit import AuditStore as Audit
    from rotaris_core.requirements.delivery.state import DeliveryState
    from rotaris_core.requirements.delivery.store import DeliveryStore

    delivery = DeliveryStore(workspace)
    index = delivery.load_all()
    candidates = [
        record
        for req_id in index.req_ids
        if (record := index.get(req_id)).state is DeliveryState.NEEDS_UPDATE
        and record.satisfied.current is not None
    ]
    if not candidates:
        return ()
    trail = audit if audit is not None else Audit(workspace)
    propagator = EvidencePropagator(
        transitions
        if transitions is not None
        else workspace_transitions(
            workspace,
            current_for=current_for,
            delivery=delivery,
            audit=trail,
            # The gate reads *this* verification, not the delivering run's
            # records. See `restoring_evidence_for` — a restore that had to
            # re-satisfy SWR-3215 from execution records would be impossible for
            # every adopted requirement, which has none.
            evidence_for=restoring_evidence_for(reverifier),
        ),
        audit=trail,
        verifier=reverifier,
    )
    moment = at if at is not None else _utc_now()
    return tuple(
        outcome.message
        for record in candidates
        if (outcome := propagator.restore(record, at=moment)).moved
    )


# ── one measurement, two readings (SWR-3222) ───────────────────────────────


#: What a reverification says when the workspace declares no checks. Not a
#: failure of the requirement and not a pass: nobody looked.
NOTHING_VERIFIED = "this workspace declares no check suite, so nothing verified the requirement"

#: What it says when the suite ran and never reached this requirement's tests.
NOT_COVERED = "the suite did not execute any covering test of this requirement"


@traces(SWR.SWR_3222, SWR.SWR_3504, SWR.SWR_3513)
class WorkspaceReverifier:
    """The one implementation of :class:`Reverifier`, over SWR-3221's pass.

    Two engines ask "does the existing implementation still hold" —
    :class:`~rotaris_core.requirements.change.outcomes.NoImpactResolver` after a
    reword (SWR-3504) and
    :meth:`~rotaris_core.requirements.change.propagation.EvidencePropagator.restore`
    after evidence came back (SWR-3513). Both are answered by the *same*
    measurement, and that is the whole of SWR-3222:

    ```text
                       ┌─▶ RequirementVerification ─▶ VerificationStore   the ring
    one suite run ─────┤
                       └─▶ Reverification          ─▶ the change package  the decision
    ```

    A requirement therefore cannot return to ``Done`` on a verification the
    traceability ring never saw. Building a second, cheaper "just run the tests"
    path would produce exactly that: a card claiming delivery over an evidence
    axis that still reports the last thing anybody recorded.

    **One suite run, however many requirements ask.** The pass is run on first
    use and remembered for the life of this object, which is one evaluation or
    one board action. A resolver that restored fifty requirements would otherwise
    run the workspace's suite fifty times over the same tree and learn nothing
    after the first.

    **The reachability refusal is inherited, not re-implemented.** A requirement
    the pass refused — its commit is not reachable from the target branch — reads
    here as *not passed*, with the pass's own sentence. There is no path through
    this class that grants a ``Done`` SWR-3221 would have refused.
    """

    def __init__(
        self,
        workspace: Path,
        *,
        run_id: str = "",
        at: dt.datetime | None = None,
        pass_for: Callable[[], VerificationPassReport] | None = None,
    ) -> None:
        self._workspace = workspace
        self._run_id = run_id
        self._at = at
        self._pass_for = pass_for
        self._report: VerificationPassReport | None = None

    @property
    def ran(self) -> bool:
        """Whether the suite has actually been run — what a guard test counts."""
        return self._report is not None

    @property
    def report(self) -> VerificationPassReport | None:
        """The pass this reverifier ran, or ``None`` while nobody has asked."""
        return self._report

    @traces(SWR.SWR_3222, SWR.SWR_3504)
    def verify(self, request: ReverificationRequest) -> Reverification:
        """Answer for one requirement out of one suite run."""
        from rotaris_core.requirements.change.outcomes import Reverification
        from rotaris_core.requirements.delivery.verification_pass import VerificationOutcome

        moment = self._at if self._at is not None else _utc_now()
        report = self._run()
        found = next(
            (result for result in report.results if result.req_id == request.req_id),
            None,
        )
        if found is None or found.verification is None:
            return Reverification(
                req_id=request.req_id,
                passed=False,
                # Named after the pass, so an audit line can be traced back to
                # the run that produced it even when that run recorded nothing.
                run_id=self._run_id or f"reverify-{moment:%Y%m%d-%H%M%S}",
                at=moment,
                detail=(
                    NOTHING_VERIFIED
                    if not report.results
                    else found.detail
                    if found is not None and found.outcome is VerificationOutcome.REFUSED
                    else NOT_COVERED
                ),
            )
        verification = found.verification
        record = verification.record
        return Reverification(
            req_id=request.req_id,
            passed=record.passed,
            run_id=record.run_id,
            at=record.verified_at if record.verified_at is not None else moment,
            commit=record.commit,
            tests=tuple(test.path for test in verification.covering_tests if test.executed),
            failed_checks=() if record.passed else record.checks,
            detail="" if record.passed else verification.summary,
        )

    def _run(self) -> VerificationPassReport:
        """The suite, once. Every later question is answered from this report."""
        if self._report is None:
            self._report = (
                self._pass_for() if self._pass_for is not None else self._verify_workspace()
            )
        return self._report

    def _verify_workspace(self) -> VerificationPassReport:
        from rotaris_core.requirements.verification_host import verify_workspace

        return verify_workspace(self._workspace, run_id=self._run_id, at=self._at)


# ── what a change asks for, offered rather than started (SWR-3616) ─────────


#: What an offer says when the requirement moved again since it was analysed.
#: The offer is refused rather than executed: units scoped to a version nobody
#: has are worse than no units.
OFFER_IS_STALE = (
    "the requirement changed again since this was analysed; re-evaluate and decide on the"
    " analysis of the version that is actually there"
)

#: What an offer says when the analysis reached no outcome at all.
NOTHING_TO_OFFER = "no analysis of this requirement reached an outcome, so there is nothing to do"


@traces(SWR.SWR_3616, SWR.SWR_3505)
@dataclass(frozen=True)
class ChangeOffer:
    """The work a change asks for, as something a user may accept.

    Derived rather than stored. The analysis it rests on is already an
    :class:`~rotaris_core.requirements.change.records.AnalysisRecord` (SWR-3514),
    and :func:`~rotaris_core.requirements.change.outcomes.plan_outcome` is pure,
    so a second store holding the plan would be a second source of truth that can
    disagree with the first. What a board needs to *show* — the verdict, the
    reasoning, what it would cost — is in the record; the plan itself is only
    needed at the moment somebody accepts, and that is when the analysis' input
    digest is re-checked.
    """

    req_id: str
    #: The analysis this offer rests on (SWR-3514's identity).
    record_id: str
    #: The analyst's verdict, as its own token (``tests-affected``).
    outcome: str
    #: Why, in the analyst's words.
    reasoning: str = ""
    #: What accepting would create, one line per unit. Empty for an outcome that
    #: creates none — a re-verification or a decomposition.
    units: tuple[str, ...] = ()
    #: Whether accepting runs a verification rather than an agent (SWR-3504).
    verifies_instead: bool = False
    #: Whether accepting hands the requirement to the decomposer (SWR-3404).
    decomposes: bool = False

    @property
    def message(self) -> str:
        """One line: what this change costs, and what accepting would do."""
        does = (
            "verify the existing implementation and adopt the new version"
            if self.verifies_instead
            else "plan the split before any unit runs"
            if self.decomposes
            else f"create {len(self.units)} unit(s): {', '.join(self.units)}"
            if self.units
            else "nothing"
        )
        return f"{self.req_id}: {self.outcome} — accepting would {does}"


@traces(SWR.SWR_3616, SWR.SWR_3505)
@dataclass(frozen=True)
class OfferOutcome:
    """What accepting an offer produced, or the stated reason it produced nothing."""

    req_id: str
    accepted: bool
    message: str
    #: Ids of the units written, when accepting created work.
    unit_ids: tuple[str, ...] = ()


@traces(SWR.SWR_3616, SWR.SWR_3412)
def _accept_what_is_offered(
    workspace: Path,
    outcomes: Sequence[NeedsUpdateOutcome],
    *,
    current_for: Callable[[str], CanonicalRequirement | None],
    version_at: Callable[[str, str], CanonicalRequirement | None] | None,
    coverage: Mapping[str, CoverageSites],
    at: dt.datetime,
    policy: ChangePolicy,
) -> tuple[str, ...]:
    """Accept every pending offer, because the workspace asked to be run for.

    The one exception to "granting a claim is offered", and it is the user's own
    declaration: ``requirements.scheduling.mode: automatic`` is the same switch
    that lets the queue pick work up by itself (SWR-3412), it defaults to
    ``manual``, and a project that never set it is untouched.

    The actor is the *system*, and that is not a way round SWR-3610: nobody made
    this decision today. The person who made it set the mode, and the audit line
    naming the system with this detail is the truthful record of a standing
    instruction being carried out.
    """
    from rotaris_core.requirements.delivery.state import DeliveryActor as Actor

    actor = Actor.system("change-propagation")
    accepted: list[str] = []
    for outcome in outcomes:
        if not _costs_an_analysis(outcome):
            continue
        req_id = outcome.assessment.req_id
        if pending_change_work(workspace, req_id) is None:
            continue
        answer = accept_change_work(
            workspace,
            req_id,
            current_for=current_for,
            version_at=version_at,
            coverage=coverage,
            actor=actor,
            at=at,
            policy=policy,
        )
        # A refusal is reported, not swallowed: an automatic workspace whose
        # offers are being declined has to be able to see why.
        accepted.append(answer.message)
    return tuple(accepted)


@traces(SWR.SWR_3506, SWR.SWR_3512, SWR.SWR_3516)
def ask_what_is_unclear(
    workspace: Path,
    outcomes: Sequence[NeedsUpdateOutcome],
    *,
    current_for: Callable[[str], CanonicalRequirement | None],
    version_at: Callable[[str, str], CanonicalRequirement | None] | None,
    coverage: Mapping[str, CoverageSites],
    at: dt.datetime,
    transitions: ExecutionTransitions | None = None,
    audit: AuditStore | None = None,
) -> tuple[str, ...]:
    """Block every requirement whose analysis asked a question, and store the question.

    On the **automatic** side of SWR-3616's rule, and it belongs there: a
    clarification is Rotaris saying it cannot proceed, which is a claim being
    given up rather than made. Answering it is the user's act by definition.

    Nothing here creates a unit or a run — :class:`ClarificationDesk` holds a
    transition door and an audit sink and nothing else, so "no execution unit and
    no run while the question is open" is a property of what it *has* (SWR-3506).

    The question is stored as well as raised (SWR-3516). Raising it alone moves
    the card to ``Blocked`` and writes an audit line; a board reopened tomorrow
    would find a blocked requirement and nothing to choose from.
    """
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore
    from rotaris_core.requirements.change.impact import ImpactOutcome
    from rotaris_core.requirements.change.outcomes import ClarificationDesk, plan_outcome
    from rotaris_core.requirements.delivery.audit import AuditStore as Audit

    asked: list[str] = []
    store: PendingDecisionStore | None = None
    desk: ClarificationDesk | None = None
    for outcome in outcomes:
        if not _costs_an_analysis(outcome):
            continue
        req_id = outcome.assessment.req_id
        offer = pending_change_work(workspace, req_id)
        # `pending_change_work` answers ``None`` for a clarification, so a
        # requirement with an offer is one with something else to do. Only the
        # ones it declined for *that* reason are asked about here.
        if offer is not None:
            continue
        rebuilt = _rebuilt_clarification(
            workspace,
            req_id,
            current_for=current_for,
            version_at=version_at,
            coverage=coverage,
        )
        if rebuilt is None:
            continue
        analysis, request = rebuilt
        if analysis.outcome is not ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED:
            continue
        plan = plan_outcome(analysis, request, at=at)
        if plan is None or plan.clarification is None:
            continue
        if store is None:
            trail = audit if audit is not None else Audit(workspace)
            store = PendingDecisionStore(workspace)
            desk = ClarificationDesk(
                transitions
                if transitions is not None
                else workspace_transitions(workspace, current_for=current_for, audit=trail),
                audit=trail,
            )
        if store.open_for(req_id) is not None:
            # Already asked and still waiting. Raising it again would move a
            # blocked requirement to blocked and append a second identical entry.
            continue
        raised = desk.ask(plan) if desk is not None else None
        if raised is None or not raised.moved:
            continue
        store.raise_question(plan.clarification)
        asked.append(f"{req_id}: {plan.clarification.question}")
    return tuple(asked)


def _rebuilt_clarification(
    workspace: Path,
    req_id: str,
    *,
    current_for: Callable[[str], CanonicalRequirement | None],
    version_at: Callable[[str, str], CanonicalRequirement | None] | None,
    coverage: Mapping[str, CoverageSites],
) -> tuple[ImpactAnalysis, ImpactRequest] | None:
    """The newest impact analysis of *req_id*, rebuilt from its record."""
    from rotaris_core.requirements.change.records import AnalysisKind, AnalysisRecordStore

    impacts = [
        record
        for record in AnalysisRecordStore(workspace).load(req_id).log.records
        if record.kind is AnalysisKind.IMPACT and record.outcome
    ]
    if not impacts:
        return None
    return _rebuild_request(
        workspace,
        req_id,
        record_id=impacts[-1].record_id,
        current_for=current_for,
        version_at=version_at,
        coverage=coverage,
    )


@traces(SWR.SWR_3616, SWR.SWR_3505, SWR.SWR_3514)
def pending_change_work(
    workspace: Path,
    req_id: str,
    *,
    state: DeliveryState | None = None,
) -> ChangeOffer | None:
    """The offer *req_id* is carrying, or ``None`` when it carries none.

    Cheap on purpose: one analysis file, no source history read and no model. A
    board asks this per card in ``Needs Update``, and rebuilding the whole
    :class:`~rotaris_core.requirements.change.outcomes.OutcomePlan` here would
    put a ``git show`` per card on the read path.

    The offer exists only while the requirement is in ``Needs Update``: that is
    the state SWR-3502 puts it in and the only one from which the work this
    offers makes sense. A requirement somebody has already released carries no
    offer, whatever its last analysis said.
    """
    from rotaris_core.requirements.change.impact import ImpactOutcome
    from rotaris_core.requirements.change.records import AnalysisKind, AnalysisRecordStore
    from rotaris_core.requirements.delivery.state import DeliveryState as State
    from rotaris_core.requirements.delivery.store import DeliveryStore

    where = state if state is not None else DeliveryStore(workspace).read(req_id).state
    if where is not State.NEEDS_UPDATE:
        return None
    impacts = [
        record
        for record in AnalysisRecordStore(workspace).load(req_id).log.records
        if record.kind is AnalysisKind.IMPACT and record.outcome
    ]
    if not impacts:
        return None
    latest = impacts[-1]
    try:
        outcome = ImpactOutcome(latest.outcome)
    except ValueError:
        # A record written by a build with more outcomes than this one. Reported
        # as no offer rather than guessed at: acting on an outcome this build
        # does not model is exactly how a wrong unit gets created.
        return None
    if outcome is ImpactOutcome.HUMAN_CLARIFICATION_REQUIRED:
        # Not an offer — a question, and it is already blocking the requirement
        # through the decision store (SWR-3506, SWR-3516).
        return None
    return ChangeOffer(
        req_id=req_id,
        record_id=latest.record_id,
        outcome=str(outcome),
        reasoning=latest.reasoning,
        units=_units_named(outcome),
        verifies_instead=outcome is ImpactOutcome.NO_BEHAVIOURAL_IMPACT,
        decomposes=outcome is ImpactOutcome.DECOMPOSITION_REQUIRED,
    )


def _units_named(outcome: ImpactOutcome) -> tuple[str, ...]:
    """The unit keys *outcome* would create, without building the plan.

    The same mapping :func:`~rotaris_core.requirements.change.outcomes.plan_outcome`
    applies, read for its shape rather than its content — an offer states what it
    would create, and the *scope* of each unit needs the sites the plan carries.
    """
    from rotaris_core.requirements.change.impact import ImpactOutcome as Outcome
    from rotaris_core.requirements.change.outcomes import (
        UNIT_KEY_IMPLEMENTATION,
        UNIT_KEY_TESTS,
    )

    if outcome is Outcome.TESTS_AFFECTED:
        return (UNIT_KEY_TESTS,)
    if outcome is Outcome.IMPLEMENTATION_AFFECTED:
        return (UNIT_KEY_IMPLEMENTATION,)
    if outcome is Outcome.IMPLEMENTATION_AND_TESTS_AFFECTED:
        return (UNIT_KEY_TESTS, UNIT_KEY_IMPLEMENTATION)
    return ()


@traces(SWR.SWR_3616, SWR.SWR_3505, SWR.SWR_3504, SWR.SWR_3514)
def accept_change_work(
    workspace: Path,
    req_id: str,
    *,
    current_for: Callable[[str], CanonicalRequirement | None],
    version_at: Callable[[str, str], CanonicalRequirement | None] | None,
    coverage: Mapping[str, CoverageSites],
    actor: DeliveryActor,
    at: dt.datetime | None = None,
    reverifier: WorkspaceReverifier | None = None,
    policy: ChangePolicy | None = None,
) -> OfferOutcome:
    """Carry out the work *req_id*'s change asks for. The only path that does.

    Everything before this is a report. This is where an outcome becomes units,
    a release, or a verification — and it happens because somebody asked, which
    is the whole of SWR-3616.

    **The offer is re-derived, and refused if the ground moved.** The plan is
    rebuilt from the stored analysis and the source's own history, and
    :meth:`~rotaris_core.requirements.change.records.AnalysisInputs.matches` says
    whether what was rebuilt is what was analysed (SWR-3514). A requirement
    edited between the read and the click gets a stated refusal rather than units
    scoped to a version nobody has.

    Three shapes, and the mapping is
    :func:`~rotaris_core.requirements.change.outcomes.plan_outcome`'s, not this
    function's:

    - **units** — written through ``UnitStore`` and the requirement asked for
      ``Ready`` through the transition function. Nothing else may (SWR-3609).
    - **no behavioural impact** — verified, and the new hash adopted only if that
      passes (SWR-3504). No agent runs, and nothing here *can* start one: the
      resolver holds a transition door, an audit sink and a verifier, none of
      which can edit an implementation.
    - **decomposition required** — handed to SWR-3404 by releasing the
      requirement without units; the flow's decomposer plans the split.
    """
    from rotaris_core.requirements.change.impact import ImpactOutcome
    from rotaris_core.requirements.change.outcomes import plan_outcome
    from rotaris_core.requirements.delivery.audit import AuditStore
    from rotaris_core.requirements.delivery.store import DeliveryStore

    moment = at if at is not None else _utc_now()
    rules = policy if policy is not None else ChangePolicy.of(workspace)
    offer = pending_change_work(workspace, req_id)
    if offer is None:
        return OfferOutcome(req_id=req_id, accepted=False, message=NOTHING_TO_OFFER)

    rebuilt = _rebuild_request(
        workspace,
        req_id,
        record_id=offer.record_id,
        current_for=current_for,
        version_at=version_at,
        coverage=coverage,
    )
    if rebuilt is None:
        return OfferOutcome(req_id=req_id, accepted=False, message=f"{req_id}: {OFFER_IS_STALE}")
    analysis, request = rebuilt
    plan = plan_outcome(analysis, request, at=moment)
    if plan is None:
        return OfferOutcome(req_id=req_id, accepted=False, message=NOTHING_TO_OFFER)

    delivery = DeliveryStore(workspace)
    audit = AuditStore(workspace)
    transitions = workspace_transitions(
        workspace,
        current_for=current_for,
        delivery=delivery,
        audit=audit,
    )
    if plan.verification_required:
        if not rules.adopt_hash_after_verification:
            return OfferOutcome(
                req_id=req_id,
                accepted=False,
                message=(
                    f"{req_id}: this workspace has turned off adopting a hash after a"
                    " verification (requirements.change.adopt_hash_after_verification)"
                ),
            )
        checking = (
            reverifier if reverifier is not None else WorkspaceReverifier(workspace, at=moment)
        )
        return _resolve_no_impact(
            plan,
            request,
            # The gate reads the verification that just ran, not the delivering
            # run's records — the same reading `restore_verified_evidence` uses,
            # and for the same reason: this ``Done`` rests on a suite that ran
            # now, and a requirement delivered by adoption has no execution
            # records to satisfy SWR-3215 from (SWR-3222).
            transitions=workspace_transitions(
                workspace,
                current_for=current_for,
                delivery=delivery,
                audit=audit,
                evidence_for=restoring_evidence_for(checking),
            ),
            audit=audit,
            reverifier=checking,
            at=moment,
        )
    if plan.outcome is ImpactOutcome.DECOMPOSITION_REQUIRED:
        return _release_for(
            plan.req_id,
            transitions=transitions,
            actor=actor,
            at=moment,
            detail=(
                f"{plan.req_id}: the change needs decomposing before it runs (SWR-3404);"
                " released so the flow can plan the split"
            ),
        )
    return _create_units(
        plan,
        workspace,
        transitions=transitions,
        actor=actor,
        at=moment,
    )


@traces(SWR.SWR_3507, SWR.SWR_3512, SWR.SWR_3409)
def accept_migration(
    workspace: Path,
    req_id: str,
    *,
    coverage: Mapping[str, CoverageSites],
    current_for: Callable[[str], CanonicalRequirement | None],
    actor: DeliveryActor,
    at: dt.datetime | None = None,
) -> OfferOutcome:
    """Approve *req_id*'s pending migration and plan the unit that carries it out.

    The only path from a planned worklist to changed code, and everything about
    it is deliberate.

    **A named human, or nothing.** ``approve_migration`` runs *actor* through
    ``require_human``, so a system actor cannot reach this outcome however it was
    invoked. That is a property of the type, not a check this function performs.

    **Refused if the ground moved.** The worklist addresses sites by file and
    line. Between the read that planned it and the click that accepts it, someone
    may have edited those files — so the inventory is swept again here and the
    plan is refused when its digest no longer matches, exactly as SWR-3514's
    ``matches`` refuses a stale impact analysis. Migrating against a worklist
    aimed at lines that have moved is the one failure this whole lane exists to
    avoid.

    **Nothing is applied here.** What this writes is an approval and an execution
    unit. The rewriting happens later, in the unit's own worktree, and reaches
    the user's branch only if the suite passes there — which is why this function
    holds no editor and no source.
    """
    from rotaris_core.requirements.change.migration_store import MigrationPlanStore
    from rotaris_core.requirements.change.superseding import (
        MigrationApprovalError,
        MigrationInventory,
        approve_migration,
    )
    from rotaris_core.requirements.delivery.audit import AuditStore

    moment = at if at is not None else _utc_now()
    store = MigrationPlanStore(workspace)
    plan = store.load(req_id)
    if plan is None:
        return OfferOutcome(
            req_id=req_id,
            accepted=False,
            message=f"{req_id}: no migration worklist is waiting for a decision",
        )
    swept = MigrationInventory(
        sites=tuple(
            site
            for replaced in plan.request.superseded_ids
            for site in _migration_sites(replaced, coverage.get(replaced, ((), ())))
        ),
    )
    if swept.digest != plan.request.inventory.digest:
        return OfferOutcome(
            req_id=req_id,
            accepted=False,
            message=(
                f"{req_id}: the traces and tests this worklist addresses have moved"
                " since it was planned; re-evaluate and decide on the worklist that"
                " matches what is there now"
            ),
        )
    try:
        approved = approve_migration(plan, approver=actor, at=moment)
    except MigrationApprovalError as refusal:
        return OfferOutcome(req_id=req_id, accepted=False, message=f"{req_id}: {refusal}")
    store.approve(approved)
    _close_migration_question(workspace, req_id, actor=actor, at=moment)

    audit = AuditStore(workspace)
    return _create_migration_unit(
        workspace,
        approved,
        transitions=workspace_transitions(
            workspace,
            current_for=current_for,
            audit=audit,
        ),
        actor=actor,
        at=moment,
    )


@traces(SWR.SWR_3512, SWR.SWR_3507, SWR.SWR_3516)
def answer_decision(
    workspace: Path,
    req_id: str,
    option: str,
    *,
    coverage: Mapping[str, CoverageSites],
    current_for: Callable[[str], CanonicalRequirement | None],
    actor: DeliveryActor,
    at: dt.datetime | None = None,
) -> OfferOutcome:
    """Answer *req_id*'s open question with *option*, and do what it means.

    The step that was missing between a board and its own blocker panel. The
    panel has offered the engine's options since slice 6 and the answer travelled
    as far as a state transition: the card left ``Blocked``, an audit line was
    written, and the question stayed open in the decision store with the chosen
    option discarded into free text. So "carry out the migration" and "leave the
    code as it is" did the same thing, and the question came back on the next
    read — where :func:`_ask_about_migration`'s already-open guard then
    suppressed it for good.

    **Closing and acting are one call, deliberately.** A surface that recorded
    the answer and then decided what to do with it would be free to record "yes"
    and do nothing, which is exactly the state this repairs. Answering the
    migration question with :data:`MIGRATION_APPROVED` *is* approving the
    worklist, and the approval is what closes the question — on its far side, so
    a refused approval leaves the question open rather than leaving a board with
    nothing to click and nothing done.

    **The dispatch lives here, not on a surface.** The options are the engine's
    own sentences (SWR-3512); a board that matched them against strings it held
    itself would be one rewording away from silently doing nothing.
    """
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore
    from rotaris_core.requirements.change.decisions import DecisionError, DecisionTrigger

    moment = at if at is not None else _utc_now()
    pending = PendingDecisionStore(workspace).open_for(req_id)
    if pending is None:
        return OfferOutcome(
            req_id=req_id,
            accepted=False,
            message=f"{req_id}: {NO_OPEN_QUESTION}",
        )
    try:
        if pending.trigger is DecisionTrigger.RISKY_MIGRATION and option == MIGRATION_APPROVED:
            return accept_migration(
                workspace,
                req_id,
                coverage=coverage,
                current_for=current_for,
                actor=actor,
                at=moment,
            )
        record = pending.answered(option, by=actor, at=moment)
    except DecisionError as refusal:
        return OfferOutcome(req_id=req_id, accepted=False, message=f"{req_id}: {refusal}")
    PendingDecisionStore(workspace).record_answer(record)
    return OfferOutcome(
        req_id=req_id,
        accepted=True,
        message=f"{req_id}: {option} — recorded, and the question is closed",
    )


@traces(SWR.SWR_3507, SWR.SWR_3405)
def _create_migration_unit(
    workspace: Path,
    approved: ApprovedMigration,
    *,
    transitions: ExecutionTransitions,
    actor: DeliveryActor,
    at: dt.datetime,
) -> OfferOutcome:
    """One unit carrying the approved worklist, then the requirement asked for Ready.

    One unit, not one per site: the operations are ordered bottom-up *within a
    file* and applying two files' worth from two worktrees would merge two trees
    that both rewrote the same annotations. The scope names what it will do, and
    the ``agent`` names the worklist rather than a prompt — which is how the run
    host knows this unit's work is mechanical (SWR-3507).
    """
    from rotaris_core.requirements.change.superseding import MIGRATION_AGENT
    from rotaris_core.requirements.execution.store import UnitStore
    from rotaris_core.requirements.execution.units import UnitSpec, plan_units

    req_id = approved.plan.request.superseding_id or approved.plan.request.superseded_ids[0]
    edits = len(approved.operations)
    handed = [entry for entry in approved.entries if not entry.action.edits_annotation]
    store = UnitStore(workspace)
    live = store.load(req_id)
    units = plan_units(
        req_id,
        (
            UnitSpec(
                key="migration",
                title=f"Migrate the code of {', '.join(approved.plan.request.superseded_ids)}",
                scope=approved.plan.summary,
                agent=MIGRATION_AGENT,
            ),
        ),
        cycle=live.cycle + 1 if live.units else 0,
    )
    store.save(units)
    released = _release_for(
        req_id,
        transitions=transitions,
        actor=actor,
        at=at,
        detail=(
            f"{req_id}: migration approved by {actor.name} — {edits} annotation edit(s)"
            + (f", {len(handed)} row(s) left for an agent" if handed else "")
        ),
    )
    return OfferOutcome(
        req_id=req_id,
        accepted=released.accepted,
        message=released.message,
        unit_ids=units.ids if released.accepted else (),
    )


#: The option on the migration question that means "carry it out". A constant
#: because :func:`_ask_about_migration` offers it and :func:`answer_decision`
#: dispatches on it: a decision whose two halves spelled the option differently
#: would close the question, move the card and change nothing, with an audit
#: trail claiming the migration had been approved.
MIGRATION_APPROVED = "carry out the migration"

#: The option that means "not now". Answering it closes the question and leaves
#: the worklist where it is, which is why it is a real answer rather than a
#: dismissal — the plan survives to be offered again on the next read.
MIGRATION_DECLINED = "leave the code as it is"

#: What answering a requirement with no open question says.
NO_OPEN_QUESTION = "no question is waiting for an answer"


@traces(SWR.SWR_3512, SWR.SWR_3516)
def _close_migration_question(
    workspace: Path,
    req_id: str,
    *,
    actor: DeliveryActor,
    at: dt.datetime,
) -> None:
    """Answer the open migration question, when one was asked.

    Silent when none was — a workspace with the confirmation switched off never
    raised one, and approving there is still a human act with a record; it just
    has no question to close.
    """
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore

    store = PendingDecisionStore(workspace)
    pending = store.open_for(req_id)
    if pending is None:
        return
    chosen = next(
        (option for option in pending.options if option.name == MIGRATION_APPROVED),
        pending.options[0],
    )
    store.record_answer(pending.answered(chosen.name, by=actor, at=at))


def _rebuild_request(
    workspace: Path,
    req_id: str,
    *,
    record_id: str,
    current_for: Callable[[str], CanonicalRequirement | None],
    version_at: Callable[[str, str], CanonicalRequirement | None] | None,
    coverage: Mapping[str, CoverageSites],
) -> tuple[ImpactAnalysis, ImpactRequest] | None:
    """The analysis and the request it was made from, rebuilt and re-checked.

    ``None`` when the ground moved. SWR-3514 designed the record for exactly this
    question — *"read both versions from the source at the recorded revisions,
    recompute the diff and the sites, and this answers whether what you rebuilt
    is what was analysed"* — and this is the caller that asks it.
    """
    from rotaris_core.requirements.change.impact import (
        ImpactAnalysis,
        ImpactOutcome,
        ImpactRequest,
        RequirementVersion,
    )
    from rotaris_core.requirements.change.records import AnalysisRecordStore

    if version_at is None:
        return None
    record = next(
        (
            found
            for found in AnalysisRecordStore(workspace).load(req_id).log.records
            if found.record_id == record_id
        ),
        None,
    )
    if record is None:
        return None
    before = version_at(req_id, record.inputs.before_revision or "")
    current = current_for(req_id)
    if before is None or current is None:
        return None
    traced, tested = coverage.get(req_id, ((), ()))
    request = ImpactRequest.between(
        RequirementVersion.of(before),
        RequirementVersion.of(current),
        traces=addresses(traced),
        tests=addresses(tested),
        evidence=record.inputs.evidence,
    )
    if not record.inputs.matches(request.inputs):
        return None
    # The analysis as the record preserved it. Only the fields
    # `plan_outcome` reads are needed — the verdict, the reasoning and the
    # question — and every one of them is on the record, which is what SWR-3514
    # means by "complete enough to reconstruct the decision months later".
    try:
        outcome = ImpactOutcome(record.outcome)
    except ValueError:
        return None
    return (
        ImpactAnalysis(
            req_id=record.req_id,
            at=record.at,
            inputs=record.inputs,
            outcome=outcome,
            reasoning=record.reasoning,
            considered=record.considered,
            question=record.question,
            persona=record.persona,
            model=record.model,
        ),
        request,
    )


@traces(SWR.SWR_3616)
class WorkspaceChanges:
    """One workspace's pending change work, as a surface reads and accepts it.

    The two calls a board needs, over the stores and the source of one workspace.
    Held here rather than in the desktop for the reason the whole lane is here: a
    headless caller wants the same two answers, and a second composition would be
    a second definition of what "the offer" is.

    The coverage sweep is made **once, on first use**, and only when something is
    actually accepted — a board asking :meth:`pending` for every card in ``Needs
    Update`` reads one analysis file per card and sweeps nothing.
    """

    def __init__(
        self,
        workspace: Path,
        *,
        current_for: Callable[[str], CanonicalRequirement | None],
        version_at: Callable[[str, str], CanonicalRequirement | None] | None = None,
        coverage: Mapping[str, CoverageSites] | None = None,
    ) -> None:
        self._workspace = workspace
        self._current_for = current_for
        self._version_at = version_at
        self._coverage = coverage

    def pending(self, req_id: str) -> ChangeOffer | None:
        """The offer *req_id* carries, or ``None``. Cheap: one file."""
        return pending_change_work(self._workspace, req_id)

    @traces(SWR.SWR_3616)
    def accept(self, req_id: str, *, actor: DeliveryActor) -> OfferOutcome:
        """Carry the offer out, attributed to *actor*."""
        return accept_change_work(
            self._workspace,
            req_id,
            current_for=self._current_for,
            version_at=self._version_at,
            coverage=self._sweep(),
            actor=actor,
        )

    @traces(SWR.SWR_3512)
    def question(self, req_id: str) -> PendingDecision | None:
        """The question *req_id* is waiting on, or ``None``. Cheap: one file."""
        from rotaris_core.requirements.change.decision_store import PendingDecisionStore

        return PendingDecisionStore(self._workspace).open_for(req_id)

    @traces(SWR.SWR_3512, SWR.SWR_3507)
    def answer(self, req_id: str, option: str, *, actor: DeliveryActor) -> OfferOutcome:
        """Answer that question with *option*, and do what the option means.

        The sweep is paid for here and not in :meth:`question`, so a board
        drawing a column of blocked cards reads one file per card and sweeps
        nothing — and the one answer a user actually gives pays for the
        inventory the approval is re-checked against.
        """
        return answer_decision(
            self._workspace,
            req_id,
            option,
            coverage=self._sweep(),
            current_for=self._current_for,
            actor=actor,
        )

    def _sweep(self) -> Mapping[str, CoverageSites]:
        """Where this workspace's traces and tests are, swept once."""
        if self._coverage is None:
            from rotaris_core.requirements.delivery.projection import CoverageEvidence
            from rotaris_core.requirements.registry import RequirementRegistry
            from rotaris_core.requirements.sources.reqtocode import reqtocode_source_for

            source = reqtocode_source_for(self._workspace)
            requirements = (
                RequirementRegistry([source]).refresh().requirements if source is not None else ()
            )
            self._coverage = evidence_of(
                requirements,
                CoverageEvidence.for_repository(self._workspace),
            ).coverage
        return self._coverage


@traces(SWR.SWR_3504, SWR.SWR_3222)
def _resolve_no_impact(
    plan: OutcomePlan,
    request: ImpactRequest,
    *,
    transitions: ExecutionTransitions,
    audit: AuditStore,
    reverifier: WorkspaceReverifier,
    at: dt.datetime,
) -> OfferOutcome:
    """Verify the existing implementation, and adopt the new hash only if it passes.

    :class:`~rotaris_core.requirements.change.outcomes.NoImpactResolver`'s first
    production construction. It holds a transition door, an audit sink and a
    verifier and nothing else — none of which can edit an implementation, which
    is SWR-3504's fourth acceptance criterion made structural.

    **The resolver keeps its own actor, and the accepting user is not it.**
    ``ADOPTION_ACTOR`` is the system, and SWR-3222's edge is system-only for the
    reason that reads as an omission here and is not one: a person cannot assert
    that a suite passed. What the person did was *accept the offer*, which the
    board records as the board action it was (SWR-3610) — the same split
    ``ACCEPT_PROPOSAL`` already makes between "a user asked for this" and "here is
    what the engine then did".
    """
    from rotaris_core.requirements.change.outcomes import NoImpactResolver

    resolution = NoImpactResolver(
        transitions,
        verifier=reverifier,
        audit=audit,
    ).resolve_plan(plan, request, at=at)
    return OfferOutcome(
        req_id=plan.req_id,
        accepted=resolution.adopted,
        message=resolution.message,
    )


@traces(SWR.SWR_3505, SWR.SWR_3401)
def _create_units(
    plan: OutcomePlan,
    workspace: Path,
    *,
    transitions: ExecutionTransitions,
    actor: DeliveryActor,
    at: dt.datetime,
) -> OfferOutcome:
    """Write the units *plan* names, then ask for ``Ready``.

    In that order, and it matters: a requirement released with no units on disk
    is one the scheduler gives a placeholder candidate to, and the placeholder
    would run as a single unit the analysis said was two.
    """
    from rotaris_core.requirements.execution.store import UnitStore
    from rotaris_core.requirements.execution.units import plan_units

    if not plan.units:
        return OfferOutcome(
            req_id=plan.req_id,
            accepted=False,
            message=f"{plan.req_id}: {plan.outcome} creates no unit to run",
        )
    store = UnitStore(workspace)
    live = store.load(plan.req_id)
    # A new delivery cycle (SWR-3417): the requirement was delivered once, its
    # text moved, and this is the work the move asks for. Re-using the previous
    # cycle's ids would make one run's history read as two.
    units = plan_units(plan.req_id, plan.units, cycle=live.cycle + 1 if live.units else 0)
    store.save(units)
    released = _release_for(
        plan.req_id,
        transitions=transitions,
        actor=actor,
        at=at,
        detail=(
            f"{plan.req_id}: {plan.outcome} — {len(units.units)} unit(s) planned"
            f" ({', '.join(units.ids)})"
        ),
    )
    return OfferOutcome(
        req_id=plan.req_id,
        accepted=released.accepted,
        message=released.message,
        unit_ids=units.ids if released.accepted else (),
    )


@traces(SWR.SWR_3616, SWR.SWR_3203)
def _release_for(
    req_id: str,
    *,
    transitions: ExecutionTransitions,
    actor: DeliveryActor,
    at: dt.datetime,
    detail: str,
) -> OfferOutcome:
    """Ask for ``Ready`` through the transition function, and report the answer.

    The one move accepting an offer makes, and it goes through the same door as
    every other (SWR-3203). A refusal is carried verbatim: the state machine's
    sentence is the one a user can act on (SWR-3602).
    """
    from rotaris_core.requirements.delivery.state import DeliveryState, TransitionCause
    from rotaris_core.requirements.delivery.transitions import TransitionRequest

    outcome = transitions.apply(
        TransitionRequest(
            req_id=req_id,
            target=DeliveryState.READY,
            actor=actor,
            cause=TransitionCause.SPECIFICATION_CHANGED,
            at=at,
            detail=detail,
        ),
    )
    return OfferOutcome(
        req_id=req_id,
        accepted=outcome.accepted,
        message=detail if outcome.accepted else outcome.message,
    )


# ── the migration worklist a supersession produces (SWR-3507) ──────────────


@traces(SWR.SWR_3507, SWR.SWR_3514, SWR.SWR_3117)
def plan_superseding_migrations(
    workspace: Path,
    requirements: Sequence[CanonicalRequirement],
    *,
    coverage: Mapping[str, CoverageSites],
    at: dt.datetime | None = None,
    analyst: MigrationAnalyst | None = None,
    persona: str = "",
    model: str = "",
    policy: ChangePolicy | None = None,
) -> tuple[str, ...]:
    """Plan what happens to the code of every requirement being replaced (SWR-3507).

    Runs where the board is read, for the same reason the specification pass
    does: a requirement declaring ``supersedes`` is a fact about the store, not a
    gesture somebody makes, and leaving the consequences implicit is how a
    replaced requirement's implementation becomes dead code the verifier still
    counts as traced.

    **It is planned once.** Every plan is filed as an
    :class:`~rotaris_core.requirements.change.records.AnalysisRecord` whose input
    digest is the inventory it was made from, so a second board read over the
    same sites finds the record and asks nothing. A worklist is re-planned only
    when the traces or tests of the replaced requirements actually moved — which
    is also the only time the old worklist stopped being true.

    **Nothing it produces can change code.** ``plan_migration`` yields a
    :class:`~rotaris_core.requirements.change.superseding.MigrationPlan`, and the
    executor takes an :class:`ApprovedMigration` — which cannot be built without
    a named human (SWR-3512). This returns the summary lines a surface shows.

    **The plan is kept, and the question is asked.** Filing a record and printing
    a line was all this did, and a summary line is not something a person can act
    on tomorrow: the worklist itself was discarded, so the digest an approval
    signs could not be re-derived once the read ended (SWR-3518). The plan is now
    stored, and a plan every site of which is decided raises the question the
    vocabulary already has for it —
    :attr:`~rotaris_core.requirements.change.decisions.DecisionTrigger.RISKY_MIGRATION`,
    which parks the requirement in ``Review`` and reaches the surface a user
    already answers blockers on (SWR-3512, SWR-3516).

    A plan with an undecided site asks nothing here. It cannot be approved at all
    — ``ApprovedMigration`` refuses one — so offering it as a yes-or-no question
    would be offering a choice that has no yes.

    *analyst* is the analyst to ask, with the *persona* and *model* its actions
    are recorded against (SWR-3514); omitted, all three come from the workspace's
    configured roster, which is what production does.
    """
    from rotaris_core.requirements.change.migration_store import MigrationPlanStore
    from rotaris_core.requirements.change.records import (
        AnalysisInputs,
        AnalysisKind,
        AnalysisRecordStore,
    )
    from rotaris_core.requirements.change.superseding import (
        MigrationInventory,
        MigrationRequest,
        SiteKind,
        plan_migration,
    )
    from rotaris_core.requirements.model import RelationKind

    rules = policy if policy is not None else ChangePolicy.of(workspace)

    replacing = [
        (requirement, replaced)
        for requirement in requirements
        if (replaced := requirement.related_ids(RelationKind.SUPERSEDES))
    ]
    if not replacing:
        return ()
    asked, who, what = (
        (analyst, persona, model) if analyst is not None else _migration_analyst(workspace)
    )
    if asked is None:
        return ()

    store = AnalysisRecordStore(workspace)
    moment = at if at is not None else _utc_now()
    lines: list[str] = []
    for requirement, replaced in replacing:
        inventory = MigrationInventory(
            sites=tuple(
                site
                for req_id in replaced
                for site in _migration_sites(req_id, coverage.get(req_id, ((), ())))
            ),
        )
        if inventory.empty:
            continue
        planned = AnalysisInputs(
            traces=tuple(site.location for site in inventory.of_kind(SiteKind.TRACE)),
            tests=tuple(site.location for site in inventory.of_kind(SiteKind.TEST)),
        )
        already = {
            record.inputs.digest
            for record in store.load(requirement.req_id).log.records
            if record.kind is AnalysisKind.MIGRATION
        }
        if planned.digest in already:
            continue
        plan = plan_migration(
            MigrationRequest(
                superseding_id=requirement.req_id,
                superseded_ids=replaced,
                inventory=inventory,
            ),
            analyst=asked,
            at=moment,
            persona=who,
            model=what,
        )
        store.append(plan.to_record())
        MigrationPlanStore(workspace).save(plan)
        lines.append(plan.message)
        asked_for = _ask_about_migration(workspace, plan, at=moment, policy=rules)
        if asked_for:
            lines.append(asked_for)
    return tuple(lines)


@traces(SWR.SWR_3507, SWR.SWR_3512, SWR.SWR_3516)
def _ask_about_migration(
    workspace: Path,
    plan: MigrationPlan,
    *,
    at: dt.datetime,
    policy: ChangePolicy,
) -> str:
    """Park the requirement on the migration question, or say nothing.

    Nothing is asked when the workspace turned the confirmation off, when the
    plan still has an undecided site (there is no yes to offer), or when the same
    question is already open — a board read that re-raised it would move a
    reviewing requirement to reviewing and append a second identical entry.
    """
    if not policy.confirm_migration_worklist or not plan.ready_for_approval:
        return ""
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore
    from rotaris_core.requirements.change.decisions import (
        DecisionOption,
        DecisionTrigger,
        PendingDecision,
    )

    req_id = plan.request.superseding_id or plan.request.superseded_ids[0]
    store = PendingDecisionStore(workspace)
    if store.open_for(req_id) is not None:
        return ""
    replaced = ", ".join(plan.request.superseded_ids)
    counts = plan.summary
    store.raise_question(
        PendingDecision.raised(
            req_id,
            DecisionTrigger.RISKY_MIGRATION,
            question=(
                f"{req_id} replaces {replaced}. Should Rotaris carry out the"
                f" migration of their existing code and tests now ({counts})?"
            ),
            options=(
                DecisionOption(
                    name=MIGRATION_APPROVED,
                    consequence=(
                        "the annotations are rewritten in a worktree of their own,"
                        " the suite runs there, and the result reaches your branch"
                        " only if it passes"
                    ),
                    detail=counts,
                ),
                DecisionOption(
                    name=MIGRATION_DECLINED,
                    consequence=(
                        f"{replaced} stay claimed by the code that claims them"
                        " today, and the worklist waits until you say otherwise"
                    ),
                ),
            ),
            at=at,
        ),
    )
    return f"{req_id}: {counts} — waiting for a decision before any code is changed"


def _migration_sites(req_id: str, sites: CoverageSites) -> tuple[MigrationSite, ...]:
    """One requirement's traces and tests as worklist sites.

    A site the sweep could not address — no line — is left out rather than
    guessed at: the worklist ends in edits applied bottom-up by line number, and
    a site at line zero would rewrite the wrong one.
    """
    from rotaris_core.requirements.change.superseding import MigrationSite, SiteKind

    traced, tested = sites
    return tuple(
        MigrationSite(kind=kind, req_id=req_id, path=path, line=line)
        for kind, group in ((SiteKind.TRACE, traced), (SiteKind.TEST, tested))
        for path, line in group
        if line >= 1
    )


#: What a removal impact is filed as, so a board read can tell one from the
#: superseding worklists that share its kind (SWR-3514).
REMOVAL_OUTCOME = "removal-impact"


@traces(SWR.SWR_3509, SWR.SWR_3113, SWR.SWR_3514)
def analyse_removals(
    workspace: Path,
    *,
    tombstones: Sequence[Tombstone],
    requirements: Sequence[CanonicalRequirement],
    coverage: Mapping[str, CoverageSites],
    at: dt.datetime | None = None,
    analyst: MigrationAnalyst | None = None,
    persona: str = "",
    model: str = "",
) -> tuple[str, ...]:
    """Say what every requirement that disappeared left behind (SWR-3509).

    A requirement that vanishes takes nothing with it: its code still runs, its
    tests still pass, its technical requirements still point at it, and the
    requirements that depended on it are suddenly depending on nothing. This is
    the step that says so out loud, on the same board read the rest of the pass
    runs on.

    **It reports and never removes**, and that is a property of what it holds
    rather than a promise about what it does.
    :class:`~rotaris_core.requirements.change.removal.RemovalAnalyzer` is
    constructed with an analyst and a clock — no source, no store, no path, no
    trace editor — so there is nothing in it that could delete anything. Without
    an analyst every site comes back ``decision-required``, which means a removal
    cannot even *express* "delete this" until a person or a model says so.

    **Analysed once per removal.** The record is filed under the removed id with
    the tombstone's own moment in its identity, so a board read that finds one
    already there asks nothing. A requirement removed, restored and removed again
    is a second removal with a second moment, and is analysed again — which is
    right: what it leaves behind the second time is not what it left the first.

    No second store. The result is an
    :class:`~rotaris_core.requirements.change.records.AnalysisRecord` in the log
    SWR-3514 already owns, filed under the removed id — the same key the
    tombstone has, which is what "retained under the tombstone" means when there
    is one store rather than two that can disagree.
    """
    from rotaris_core.requirements.change.records import AnalysisKind, AnalysisRecordStore
    from rotaris_core.requirements.change.removal import RemovalAnalyzer
    from rotaris_core.requirements.relations import build_relation_graph

    active = [stone for stone in tombstones if stone.active]
    if not active:
        return ()
    moment = at if at is not None else _utc_now()
    known = {requirement.req_id: requirement for requirement in requirements}
    graph = build_relation_graph(requirements)
    analyzer = RemovalAnalyzer(analyst=analyst, persona=persona, model=model, clock=lambda: moment)
    store = AnalysisRecordStore(workspace)
    pending = [
        tombstone
        for tombstone in active
        if not any(
            record.kind is AnalysisKind.MIGRATION and record.outcome == REMOVAL_OUTCOME
            for record in store.load(tombstone.req_id).log.records
        )
    ]
    if not pending:
        return ()
    sites = _sites_of_the_gone(workspace, [tombstone.req_id for tombstone in pending], coverage)
    lines: list[str] = []
    for tombstone in pending:
        impact = analyzer.analyse(
            tombstone,
            graph=graph,
            coverage=sites.get(tombstone.req_id),
            requirements=known,
            at=moment,
        )
        store.append(impact.to_record())
        lines.extend(impact.report)
    return tuple(lines)


def _sites_of_the_gone(
    workspace: Path,
    req_ids: Sequence[str],
    coverage: Mapping[str, CoverageSites],
) -> dict[str, dict[str, CoverageReference]]:
    """Where the code still claims each removed id — asked of the sweep, not the board.

    This is the one query the pass cannot take from ``swept.coverage``, and the
    reason is the requirement itself. That mapping is keyed by the requirements
    the store *currently declares*, and a removed id is by definition not among
    them — so reading it there answers "no sites" for every removal, and
    SWR-3509's first criterion ("every trace and test of the removed id is
    named") would be met by naming nothing.

    ``coverage_map`` answers because it is built the other way round: it keys by
    requirement *number* and deliberately includes numbers that code references
    and no requirement declares any more. Those numbers are exactly the traces a
    removal strands, which is the same set SWR-2333's orphan rule surfaces from
    the other side.

    One sweep, and only when there is an unanalysed removal to sweep for — a
    board read of a workspace where nothing vanished never pays for this.
    """
    from rotaris_core.reqtocode.coverage import coverage_map
    from rotaris_core.reqtocode.layout import load_layout
    from rotaris_core.requirements.delivery.projection import requirement_number

    # The project's own layout, not Rotaris'. ``DEFAULT_LAYOUT`` names
    # ``src/rotaris_core`` — right for this repository and wrong for every other
    # one, and a removal that swept the wrong tree would report "no code" for a
    # requirement whose implementation is sitting right there.
    try:
        swept = coverage_map(workspace, load_layout(workspace))
    except Exception:  # noqa: BLE001 - an unreadable layout is not a failed board read
        logging.getLogger(__name__).warning(
            "Could not sweep %s for the code a removal leaves behind",
            workspace,
            exc_info=True,
        )
        swept = {}
    answers: dict[str, dict[str, CoverageReference]] = {}
    for req_id in req_ids:
        number = requirement_number(req_id)
        found = swept.get(number) if number is not None else None
        if found is not None and (found.implementations or found.tests):
            answers[req_id] = {req_id: found}
            continue
        # Nothing the sweep can address. A requirement whose code was already
        # gone still leaves dependants and derived requirements behind, and the
        # analysis names those from the relation graph rather than from here.
        held = coverage.get(req_id)
        if held is not None:
            answers[req_id] = {req_id: _RemovedCoverage(held)}
    return answers


class _RemovedCoverage:
    """One requirement's swept sites as the migration inventory reads them.

    A shape adapter and nothing else, kept for the caller that already holds the
    pair: ``CoverageSites`` is what the evidence sweep produces and
    ``CoverageReference`` is what the worklist consumes.
    """

    def __init__(self, sites: CoverageSites) -> None:
        traced, tested = sites
        self._implementations = tuple(_RemovedSite("traces", path, line) for path, line in traced)
        self._tests = tuple(_RemovedSite("verifies", path, line) for path, line in tested)

    @property
    def implementations(self) -> tuple[_RemovedSite, ...]:
        """Where the removed requirement was implemented."""
        return self._implementations

    @property
    def tests(self) -> tuple[_RemovedSite, ...]:
        """The tests that covered it."""
        return self._tests


class _RemovedSite:
    """One swept site, as a site reference."""

    def __init__(self, kind: str, path: str, line: int) -> None:
        self._kind = kind
        self._path = path
        self._line = line

    @property
    def kind(self) -> str:
        """``traces`` or ``verifies``."""
        return self._kind

    @property
    def path(self) -> str:
        """The file the reference is in."""
        return self._path

    @property
    def line(self) -> int:
        """The line it sits on."""
        return self._line


@traces(SWR.SWR_3507, SWR.SWR_3117)
def _migration_analyst(workspace: Path) -> tuple[MigrationAnalyst | None, str, str]:
    """This workspace's migration analyst, with the attribution its plan records.

    ``None`` when no persona resolves — and then no worklist is planned at all
    rather than one in which every site says "a human has to decide", which
    would file a record per board read that nobody asked for.
    """
    import logging

    from rotaris_core.config.loader import load_config
    from rotaris_core.requirements.analysis.analysts import SupersedingAnalyst, deferred_completion
    from rotaris_core.requirements.analysis.persona import resolve_analyst

    try:
        config = load_config(workspace)
        resolved = resolve_analyst(config, SupersedingAnalyst.JOB)
    except Exception:  # noqa: BLE001 — a board read must not fail over configuration
        logging.getLogger(__name__).warning(
            "No migration analyst for %s; supersessions are not planned",
            workspace,
            exc_info=True,
        )
        return None, "", ""
    analyst = SupersedingAnalyst(resolved, completion=deferred_completion(config, resolved))
    return analyst, resolved.persona, resolved.model


# ── the whole pass, in one call (SWR-3515) ─────────────────────────────────


@traces(SWR.SWR_3515)
def evaluate_workspace(
    workspace: Path,
    *,
    requirements: Sequence[CanonicalRequirement],
    current_for: Callable[[str], CanonicalRequirement | None],
    swept: SweptEvidence,
    version_at: Callable[[str, str], CanonicalRequirement | None] | None = None,
    tombstones: Sequence[Tombstone] = (),
    at: dt.datetime | None = None,
    analysts: Analysts | None = None,
    policy: ChangePolicy | None = None,
    depth: EvaluationDepth = EvaluationDepth.FULL,
    cancel: CancelToken | None = None,
    running_here: Collection[str] = (),
) -> PropagationReport:
    """Run every propagation rule over *workspace*, once, in the stated order.

    The one entry point both consumers take — the board's evaluation and
    ``rotaris-cli requirements evaluate`` — so "what a board read does" and "what
    a headless evaluation does" are one answer rather than two that agree today.

    Never raises for a rule that found nothing: a quiet pass is the common case
    and returns an empty :class:`PropagationReport`. A store that cannot be read
    *does* raise, because a board that silently stopped noticing edits is the one
    failure this pass exists to prevent.

    *depth* says how far the pass goes (SWR-3519). ``FULL`` is the default and
    runs everything below, which is what a caller that says nothing gets and what
    ``rotaris-cli requirements evaluate`` takes. ``RULES_ONLY`` runs the
    deterministic rules and reaches no analyst — steps 4 to 8 are skipped, so a
    caller that must not wait on a provider has a call it can make. A policy
    switch dominates at either depth: depth can only subtract.

    *cancel* is checked between per-requirement analyses, so stopping costs at
    most one analysis. The deterministic rules are not cancellation points — they
    are fast, and a half-applied rule pass is worse than a finished one. What a
    cancelled pass already applied stays applied; what it did not analyse stays on
    :attr:`~PropagationReport.unanalysed`, and the next full pass finds it from
    state rather than from being told (:func:`impact_worklist`).

    *analysts* is the seam a test replaces, and it exists because the alternative
    is worse than a parameter: without it, a pass over a scratch directory
    resolves the *developer's own* configured persona and reaches a provider, so
    a unit test of the step order would depend on whose machine ran it. Omitted,
    every analyst comes from the workspace's roster, which is what production
    does.

    *running_here* names the requirements the calling process is running right
    now, and step 0 needs it: a flow this process owns must not be mistaken for
    one whose process is gone. A caller that starts no runs — the CLI, a board
    read in a process that has never released anything — passes nothing, which
    is the truth about it.
    """
    from rotaris_core.requirements.execution.recovery import reconcile_abandoned_runs

    moment = at if at is not None else _utc_now()
    asked = analysts if analysts is not None else Analysts()
    rules = policy if policy is not None else ChangePolicy.of(workspace)

    # 0 — the runs nobody owns. Before every rule below, because the rules read
    #     delivery states and a state left behind by a killed process is not one:
    #     a requirement stuck in Running is unschedulable, cannot be accepted,
    #     and is the one thing on the board a user cannot correct (SWR-3611).
    recovered = reconcile_abandoned_runs(
        workspace,
        current_for=current_for,
        at=moment,
        running_here=running_here,
    )
    # 1 — the specification. First, because only a requirement it moved is worth
    #     analysing, and an unedited board must cost no model call.
    outcomes = run_specification_pass(
        workspace,
        current_for=current_for,
        evidence_current=swept.health,
        at=moment,
    )
    # 2 — the evidence. Before the relation rules: a requirement knocked out of
    #     Done is not schedulable whatever else holds it.
    decayed = (
        propagate_lost_evidence(
            workspace,
            staleness=swept.staleness,
            at=moment,
            current_for=current_for,
        )
        if rules.propagate_evidence_loss
        else ()
    )
    # 4 — the analysis, over what step 1 found diverged and nobody has judged
    #     yet (SWR-3519) — not merely over what step 1 moved, or an analysis
    #     skipped once would be skipped forever.
    analysed = (
        analyse_what_the_changes_cost(
            workspace,
            outcomes,
            current_for=current_for,
            version_at=version_at,
            coverage=swept.coverage,
            evidence_current=swept.health,
            analyzer=asked.impact,
            at=moment,
            cancel=cancel,
        )
        if rules.analyze_changes and depth is EvaluationDepth.FULL
        else ()
    )
    # 5 — the offers. Derived when a surface asks (`pending_change_work`), so
    #     the pass records nothing for them — *unless* the workspace declared it
    #     wants work picked up by itself, which is the one exception to
    #     SWR-3616's rule and is the user's own declaration.
    accepted = (
        _accept_what_is_offered(
            workspace,
            outcomes,
            current_for=current_for,
            version_at=version_at,
            coverage=swept.coverage,
            at=moment,
            policy=rules,
        )
        if analysed and rules.accept_automatically
        else ()
    )
    # 6 — the questions. A clarification is not an offer: it is Rotaris giving
    #     up, so it blocks here and now whatever the mode says.
    return PropagationReport(
        recovered=recovered,
        moved=tuple(outcome.message for outcome in outcomes if outcome.moved),
        decayed=decayed,
        analysed=analysed,
        accepted=accepted,
        asked=(
            ask_what_is_unclear(
                workspace,
                outcomes,
                current_for=current_for,
                version_at=version_at,
                coverage=swept.coverage,
                at=moment,
            )
            if analysed
            else ()
        ),
        migrations=(
            plan_superseding_migrations(
                workspace,
                requirements,
                coverage=swept.coverage,
                at=moment,
                analyst=asked.migration,
                persona=asked.persona,
                model=asked.model,
            )
            if depth is EvaluationDepth.FULL
            else ()
        ),
        removals=(
            analyse_removals(
                workspace,
                tombstones=tombstones,
                requirements=requirements,
                coverage=swept.coverage,
                at=moment,
                analyst=asked.migration,
                persona=asked.persona,
                model=asked.model,
            )
            if rules.report_dangling_dependents and depth is EvaluationDepth.FULL
            else ()
        ),
        cancelled=cancel is not None and cancel.cancelled,
        # Recomputed *after* the analysis, so whatever it recorded drops out on
        # its own and this needs no bookkeeping from the loop: what is left is
        # exactly what this pass owed and did not pay — by depth, by policy, by
        # cancellation, or because an analysis failed and left no outcome.
        unanalysed=impact_worklist(workspace, outcomes),
        analysis_enabled=rules.analyze_changes,
    )
