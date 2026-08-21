"""Productive use: a project's requirements live in a real markdown store with real
annotated code beside them, and somebody writes a new requirement that replaces two old
ones.
Expected outcome: Rotaris reads the ``supersedes`` relation, asks the coverage query what
claims the old ids, and shows the user a worklist covering every one of those sites exactly
once — before a single byte of their code changes. Nothing happens until they approve it.
After the migration runs, no annotation points at a replaced id any more, the replaced
requirements are written back as ``deprecated`` in their own store, their files and ids are
still there, and their delivery history is untouched.
"""

from __future__ import annotations

import datetime as dt
import hashlib
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.coverage import RequirementCoverage, coverage_from_sweep
from rotaris_core.reqtocode.layout import RepoLayout
from rotaris_core.reqtocode.verifier import sweep_references
from rotaris_core.requirements.change.superseding import (
    MigrationAction,
    MigrationApprovalError,
    MigrationExecutor,
    MigrationInventory,
    MigrationPlan,
    MigrationRequest,
    SupersedingCompletion,
    TraceEdit,
    TraceOperation,
    approve_migration,
    plan_migration,
    superseded_standing,
)
from rotaris_core.requirements.delivery.satisfied import SatisfiedDelivery, SatisfiedLog
from rotaris_core.requirements.delivery.state import (
    DeliveryActor,
    DeliveryState,
    DeliveryStatus,
    TransitionCause,
)
from rotaris_core.requirements.delivery.store import DeliveryRecord, DeliveryStore
from rotaris_core.requirements.model import (
    FULL_CAPABILITIES,
    READ_ONLY,
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
    SourceCapabilities,
)
from rotaris_core.requirements.relations import build_relation_graph
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementArtifact,
    RequirementEdit,
    SourceRead,
)
from rotaris_core.requirements.writeback import (
    MarkdownArtifactWriter,
    MarkdownRequirementDocument,
    RequirementWriteBack,
)

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

pytestmark = pytest.mark.integration

OLD_BASKET = "SWR-501"
OLD_REFUND = "SWR-502"
NEW = "SWR-601"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
LATER = AT + dt.timedelta(hours=3)
PERSONA = "migration-analyst"
MODEL = "scripted-analyst-1"

#: The person who signs the worklist off. A user actor: an approval is refused
#: for a system one, so the analysis cannot approve its own proposal (SWR-3512).
ADA = DeliveryActor.user("ada")

#: Assembled at runtime so this file never contains the literal annotation text
#: the repository's own ReqToCode sweep looks for — a synthetic ``SWR-501`` in a
#: fixture must not read as a real trace of this repository.
TRACE = "traces"
COVER = "verifies"

LAYOUT = RepoLayout(impl_roots=(Path("src"),), test_roots=(Path("tests"),))


def number_of(req_id: str) -> int:
    """``SWR-501`` → ``501``."""
    return int(req_id.split("-")[1])


def document(req_id: str, title: str, prose: str, *, supersedes: Sequence[str] = ()) -> str:
    """One requirement artefact in the synthetic store's format."""
    relation = f"supersedes: {', '.join(supersedes)}\n" if supersedes else ""
    return (
        f"---\nreq-id: {req_id}\nstatus: approved\ntitle: {title!r}\n{relation}---\n\n"
        f"# {req_id} — {title}\n\n{prose}\n"
    )


def write_store(root: Path) -> Path:
    """Three requirements: two old ones and the new one that replaces them."""
    store = root / "docs" / "requirements"
    store.mkdir(parents=True)
    (store / "SWR-501-basket.md").write_text(
        document("SWR-501", "A basket can be paid for", "The user pays and gets a receipt."),
        encoding="utf-8",
    )
    (store / "SWR-502-refund.md").write_text(
        document("SWR-502", "A payment can be refunded", "The user asks for their money back."),
        encoding="utf-8",
    )
    (store / "SWR-601-checkout.md").write_text(
        document(
            "SWR-601",
            "Checkout handles payment and refund together",
            "The user pays, gets a receipt, and can undo the whole thing in one place.",
            supersedes=(OLD_BASKET, OLD_REFUND),
        ),
        encoding="utf-8",
    )
    return store


def write_code(root: Path) -> None:
    """Four annotated modules and two annotated tests claiming the old ids."""
    (root / "src" / "pkg").mkdir(parents=True)
    (root / "tests" / "unit").mkdir(parents=True)
    (root / "src" / "pkg" / "basket.py").write_text(
        f'"""Basket."""\n\n\n@{TRACE}(SWR.SWR_{number_of(OLD_BASKET)})\ndef pay() -> None:\n'
        "    return None\n",
        encoding="utf-8",
    )
    (root / "src" / "pkg" / "receipt.py").write_text(
        f'"""Receipt."""\n\n\n@{TRACE}(SWR.SWR_{number_of(OLD_BASKET)})\ndef receipt() -> None:\n'
        "    return None\n",
        encoding="utf-8",
    )
    (root / "src" / "pkg" / "refund.py").write_text(
        f'"""Refund."""\n\n\n@{TRACE}(SWR.SWR_{number_of(OLD_REFUND)})\ndef refund() -> None:\n'
        "    return None\n",
        encoding="utf-8",
    )
    (root / "tests" / "unit" / "test_basket.py").write_text(
        f"@{COVER}(SWR.SWR_{number_of(OLD_BASKET)})\ndef test_pay() -> None:\n    assert True\n",
        encoding="utf-8",
    )
    (root / "tests" / "unit" / "test_refund.py").write_text(
        f"@{COVER}(SWR.SWR_{number_of(OLD_REFUND)})\ndef test_refund() -> None:\n    assert True\n",
        encoding="utf-8",
    )


def write_crowded_code(root: Path) -> None:
    """One implementation and **three** covering tests of ``SWR-502`` in one file.

    The shape a blanking rewriter can never fail on and a real one can: three
    annotations in a single file, each planned against the file as it is now, so
    the second removal only lands on the right line if the first one happened
    *below* it.
    """
    (root / "src" / "pkg").mkdir(parents=True)
    (root / "tests" / "unit").mkdir(parents=True)
    (root / "src" / "pkg" / "refund.py").write_text(
        f'"""Refund."""\n\n\n@{TRACE}(SWR.SWR_{number_of(OLD_REFUND)})\ndef refund() -> None:\n'
        "    return None\n",
        encoding="utf-8",
    )
    covering = "\n\n".join(
        f"@{COVER}(SWR.SWR_{number_of(OLD_REFUND)})\ndef test_refund_{name}() -> None:\n"
        f'    assert "{name}" == "{name}"'
        for name in ("full", "partial", "declined")
    )
    (root / "tests" / "unit" / "test_refund.py").write_text(
        f'"""Refunds."""\n\n{covering}\n',
        encoding="utf-8",
    )


def coverage_of(root: Path, *req_ids: str) -> dict[str, RequirementCoverage]:
    """The real ReqToCode coverage query, run over the synthetic tree."""
    sweep = sweep_references(root, {}, LAYOUT)
    return {req_id: coverage_from_sweep(sweep, number_of(req_id)) for req_id in req_ids}


def coverage_sites(
    root: Path,
    *req_ids: str,
) -> dict[str, tuple[tuple[tuple[str, int], ...], tuple[tuple[str, int], ...]]]:
    """The same sweep, in the ``(traces, tests)`` shape the propagation pass reads.

    ``coverage_of`` answers in ReqToCode's own shape, which the migration planner
    consumes directly; the *pass* is fed the board's evidence, which is a pair per
    requirement. Both are the same sites — this is the one adapter, written here
    rather than in the product, because the product already has the pair in hand.
    """
    return {
        req_id: (
            tuple((site.path, site.line) for site in found.implementations),
            tuple((site.path, site.line) for site in found.tests),
        )
        for req_id, found in coverage_of(root, *req_ids).items()
    }


def tree_fingerprint(root: Path) -> dict[str, str]:
    """Every source file under *root* and the digest of its bytes."""
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*.py"))
    }


class SyntheticStore(BaseRequirementSource):
    """A markdown requirement store that can be read and written.

    Deliberately not this repository's ReqToCode adapter: the relation under test
    is ``supersedes``, which the ReqToCode document format does not carry, and a
    fixture that cannot express the relation could not exercise the feature.
    Everything that writes is the production write path
    (:class:`~rotaris_core.requirements.writeback.MarkdownArtifactWriter`).
    """

    def __init__(self, root: Path, *, capabilities: SourceCapabilities = FULL_CAPABILITIES) -> None:
        self._root = root
        self.capabilities = capabilities

    @property
    def source_id(self) -> str:
        return "synthetic"

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
        req_id = parsed.get("req-id") or path.stem
        supersedes = tuple(
            target.strip()
            for target in (parsed.get("supersedes") or "").split(",")
            if target.strip()
        )
        body = [line for line in parsed.body if line.strip() and not line.startswith("#")]
        return CanonicalRequirement(
            req_id=req_id,
            title=(parsed.get("title") or "").strip(),
            description="\n".join(body),
            lifecycle=RequirementLifecycle(parsed.get("status") or "draft"),
            source_path=path.name,
            relations=tuple(
                Relation(kind=RelationKind.SUPERSEDES, target=target) for target in supersedes
            ),
            capabilities=self.capabilities,
        )

    def _path_for(self, req_id: str) -> Path:
        for path in self._paths():
            parsed = MarkdownRequirementDocument.parse(path.read_text(encoding="utf-8"))
            if parsed.get("req-id") == req_id:
                return path
        raise FileNotFoundError(req_id)

    def update(self, req_id: str, edit: RequirementEdit) -> CanonicalRequirement:
        path = self._path_for(req_id)
        MarkdownArtifactWriter().apply(path, edit)
        return self._requirement(path)


class TreeEditor:
    """A trace editor that actually rewrites the annotations in the tree.

    A removed annotation is **deleted**, not blanked — which is what any real
    rewriter does, and which means every line below it moves up by one. Nothing
    here compensates for that, deliberately: the executor guarantees that the
    operations arrive bottom-up within a file
    (:attr:`~rotaris_core.requirements.change.superseding.ApprovedMigration.operations`),
    and a fake that quietly worked around a wrong order would be the reason
    nobody noticed there was one.
    """

    def __init__(self, root: Path) -> None:
        self._root = root
        self.applied: list[TraceOperation] = []

    def apply(self, operation: TraceOperation) -> TraceEdit:
        path = self._root / operation.site.path
        lines = path.read_text(encoding="utf-8").splitlines()
        index = operation.site.line - 1
        if index >= len(lines):
            raise IndexError(f"{operation.site.location} is past the end of the file")
        if operation.action is MigrationAction.REMOVE:
            del lines[index]
        else:
            lines[index] = lines[index].replace(
                f"SWR_{number_of(operation.site.req_id)}",
                f"SWR_{number_of(operation.target)}",
            )
        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        self.applied.append(operation)
        return TraceEdit(site=operation.site, action=operation.action, applied=True)


class RemovingAnalyst:
    """A migration analyst that says every site of the replaced ids is obsolete."""

    def classify(self, request: MigrationRequest) -> Mapping[str, Mapping[str, object]]:
        return {
            site.key: {
                "action": "remove",
                "reasoning": "the behaviour is gone with the requirement that asked for it",
            }
            for site in request.inventory.sites
        }


class RePointingAnalyst:
    """A migration analyst that moves every site onto the replacement.

    Optionally silent about some sites, which is how the "not classifiable"
    path is exercised end to end.
    """

    def __init__(self, *, skip: frozenset[str] = frozenset()) -> None:
        self._skip = skip

    def classify(self, request: MigrationRequest) -> Mapping[str, Mapping[str, object]]:
        return {
            site.key: {
                "action": "re-point",
                "reasoning": "the behaviour survives, under the replacing requirement",
                "target": NEW,
            }
            for site in request.inventory.sites
            if site.key not in self._skip
        }


def workspace(tmp_path: Path) -> Path:
    """A synthetic project: a requirement store and the code that claims it."""
    write_store(tmp_path)
    write_code(tmp_path)
    return tmp_path


def migration_request(root: Path) -> MigrationRequest:
    """What ``SWR-601 supersedes …`` asks of the migration, read from the store."""
    read = SyntheticStore(root / "docs" / "requirements").read()
    graph = build_relation_graph(read.requirements)
    return MigrationRequest.from_relations(
        NEW,
        graph,
        coverage=coverage_of(root, OLD_BASKET, OLD_REFUND),
    )


def planned(request: MigrationRequest, *, skip: frozenset[str] = frozenset()) -> MigrationPlan:
    """The worklist a re-pointing analyst produces for *request*."""
    return plan_migration(
        request,
        analyst=RePointingAnalyst(skip=skip),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )


@verifies(SWR.SWR_3507)
def test_the_worklist_covers_every_trace_and_test_of_the_replaced_ids(tmp_path: Path) -> None:
    """Relations decide *what* is replaced; the coverage query decides what claims it."""
    root = workspace(tmp_path)
    request = migration_request(root)

    assert request.superseded_ids == (OLD_BASKET, OLD_REFUND)

    sweep = sweep_references(root, {}, LAYOUT)
    expected = {
        f"{'test' if occurrence.kind != 'traces' else 'trace'}|SWR-{number}|"
        f"{occurrence.file}:{occurrence.line}"
        for number in (number_of(OLD_BASKET), number_of(OLD_REFUND))
        for occurrence in (
            *sweep.impl_traces.get(number, []),
            *sweep.test_coverage.get(number, []),
        )
    }
    assert len(expected) == 5

    keys = list(request.inventory.keys)
    assert set(keys) == expected
    assert len(keys) == len(set(keys))


@verifies(SWR.SWR_3507)
def test_the_user_sees_the_whole_list_before_a_single_file_changes(tmp_path: Path) -> None:
    """Plan, inspect, decide, approve — and only then is anything allowed to happen."""
    root = workspace(tmp_path)
    request = migration_request(root)
    before = tree_fingerprint(root)

    undecided_key = request.inventory.sites[0].key
    plan = planned(request, skip=frozenset({undecided_key}))

    assert tree_fingerprint(root) == before
    assert len(plan.entries) == 5
    assert {entry.key for entry in plan.entries} == set(request.inventory.keys)
    assert [entry.key for entry in plan.undecided] == [undecided_key]
    assert plan.ready_for_approval is False

    decided = plan.with_decision(
        undecided_key,
        MigrationAction.KEEP,
        reasoning="this one documents the historical behaviour and stays as it is",
        decided_by="ada",
    )
    approved = approve_migration(decided, approver=ADA, at=LATER)

    assert tree_fingerprint(root) == before
    assert approved.approval.approver == ADA
    assert len(approved.operations) == 4


@verifies(SWR.SWR_3507)
def test_after_the_migration_no_annotation_points_at_a_replaced_id(tmp_path: Path) -> None:
    """The acceptance criterion, checked by re-running the real coverage query."""
    root = workspace(tmp_path)
    request = migration_request(root)
    approved = approve_migration(planned(request), approver=ADA, at=LATER)
    editor = TreeEditor(root)

    execution = MigrationExecutor(editor=editor).execute(approved, at=LATER)

    assert execution.completed
    assert len(editor.applied) == 5
    assert execution.retired_ids == (OLD_BASKET, OLD_REFUND)

    after_sweep = sweep_references(root, {}, LAYOUT)
    assert after_sweep.impl_traces.get(number_of(OLD_BASKET)) is None
    assert after_sweep.impl_traces.get(number_of(OLD_REFUND)) is None
    assert after_sweep.test_coverage.get(number_of(OLD_BASKET)) is None
    assert len(after_sweep.impl_traces[number_of(NEW)]) == 3
    assert len(after_sweep.test_coverage[number_of(NEW)]) == 2

    after = MigrationInventory.from_coverage(coverage_of(root, OLD_BASKET, OLD_REFUND, NEW))
    assert execution.residual_traces(after) == ()


@verifies(SWR.SWR_3507)
def test_removals_in_one_file_leave_the_surrounding_code_intact(tmp_path: Path) -> None:
    """A real rewriter deletes lines, and the executor has to survive that.

    Three covering tests of ``SWR-502`` live in one file. Their line numbers were
    all read from the file *before* the migration, so applying them top-down
    would delete the first annotation, shift everything below it up by one, and
    then delete a ``def`` line instead of the second annotation — leaving a file
    that no longer parses in a repository Rotaris does not own.

    So the assertion is not "the annotations are gone" but "**only** the
    annotations are gone": every remaining line of that file is checked, and the
    repository's own ReqToCode sweep is re-run over the edited tree to confirm
    the three tests are still there and claim nothing.
    """
    root = tmp_path
    write_store(root)
    write_crowded_code(root)
    test_file = root / "tests" / "unit" / "test_refund.py"
    before_lines = test_file.read_text(encoding="utf-8").splitlines()

    request = migration_request(root)
    plan = plan_migration(
        request,
        analyst=RemovingAnalyst(),
        at=AT,
        persona=PERSONA,
        model=MODEL,
    )
    approved = approve_migration(plan, approver=ADA, at=LATER)

    # Four sites, three of them in one file — and the operations for that file
    # descend, so each one is still applied to the line it was planned against.
    assert len(approved.entries) == 4
    in_test_file = [
        op.site.line for op in approved.operations if op.site.path == "tests/unit/test_refund.py"
    ]
    assert in_test_file == sorted(in_test_file, reverse=True)
    assert len(in_test_file) == 3

    execution = MigrationExecutor(editor=TreeEditor(root)).execute(approved, at=LATER)

    assert execution.completed, execution.failure
    after_lines = test_file.read_text(encoding="utf-8").splitlines()
    annotation = f"@{COVER}(SWR.SWR_{number_of(OLD_REFUND)})"
    assert annotation not in after_lines
    assert after_lines == [line for line in before_lines if line != annotation]
    # The three test functions themselves are untouched — the failure mode is
    # eating the line *below* an annotation, which is exactly a ``def``.
    assert sum(line.startswith("def test_refund_") for line in after_lines) == 3

    sweep = sweep_references(root, {}, LAYOUT)
    assert sweep.test_coverage.get(number_of(OLD_REFUND)) is None
    assert sweep.impl_traces.get(number_of(OLD_REFUND)) is None
    assert OLD_REFUND in execution.retired_ids


@verifies(SWR.SWR_3508)
def test_a_completed_migration_deprecates_the_replaced_requirements_in_their_store(
    tmp_path: Path,
) -> None:
    """The lifecycle is written back once, the files stay, the history is untouched."""
    root = workspace(tmp_path)
    store_dir = root / "docs" / "requirements"
    source = SyntheticStore(store_dir)

    delivery = DeliveryStore(root)
    delivered = SatisfiedDelivery(
        req_id=OLD_BASKET,
        satisfied_hash="hash-of-the-old-basket",
        run_id="run-17",
        satisfied_at=AT,
        verified_commit="c0ffee",
    )
    delivery.seed(
        DeliveryRecord(
            req_id=OLD_BASKET,
            delivery=DeliveryStatus().moved_to(
                DeliveryState.DONE,
                actor=DeliveryActor.system("requirement-runner"),
                at=AT,
                cause=TransitionCause.COMPLETION_ACCEPTED,
                requirement_hash=delivered.satisfied_hash,
            ),
            satisfied=SatisfiedLog(entries=(delivered,)),
        ),
        at=AT,
    )

    approved = approve_migration(planned(migration_request(root)), approver=ADA, at=LATER)
    execution = MigrationExecutor(editor=TreeEditor(root)).execute(approved, at=LATER)

    result = SupersedingCompletion(RequirementWriteBack([source])).complete(
        execution,
        requirements=source.read().by_id(),
    )

    assert result.completed
    assert result.deprecated_ids == (OLD_BASKET, OLD_REFUND)
    assert (store_dir / "SWR-501-basket.md").is_file()
    assert (store_dir / "SWR-502-refund.md").is_file()
    assert "status: deprecated" in (store_dir / "SWR-501-basket.md").read_text(encoding="utf-8")
    assert "status: deprecated" in (store_dir / "SWR-502-refund.md").read_text(encoding="utf-8")

    record = delivery.read(OLD_BASKET)
    assert record.satisfied.current == delivered
    assert record.state is DeliveryState.DONE


@verifies(SWR.SWR_3508)
def test_the_replaced_requirement_stays_visible_as_superseded(tmp_path: Path) -> None:
    """A user's replaced requirement is stated, not hidden, and keeps its id."""
    root = workspace(tmp_path)
    source = SyntheticStore(root / "docs" / "requirements")

    execution = MigrationExecutor(editor=TreeEditor(root)).execute(
        approve_migration(planned(migration_request(root)), approver=ADA, at=LATER),
        at=LATER,
    )
    SupersedingCompletion(RequirementWriteBack([source])).complete(
        execution,
        requirements=source.read().by_id(),
    )

    read = source.read()
    by_id = read.by_id()
    assert set(by_id) == {OLD_BASKET, OLD_REFUND, NEW}
    assert by_id[OLD_BASKET].lifecycle is RequirementLifecycle.DEPRECATED

    graph = build_relation_graph(read.requirements)
    standing = superseded_standing(by_id[OLD_BASKET], graph)
    assert standing.superseded_by == (NEW,)
    assert standing.schedulable is False
    assert standing.counts_towards_progress is False
    assert standing.visible is True
    assert standing.statement == f"{OLD_BASKET} is superseded by {NEW}"


@verifies(SWR.SWR_3508)
def test_a_read_only_store_yields_a_stated_manual_step(tmp_path: Path) -> None:
    """The migration is done; the lifecycle change is named for a human to make."""
    root = workspace(tmp_path)
    store_dir = root / "docs" / "requirements"
    read_only = SyntheticStore(store_dir, capabilities=READ_ONLY)

    execution = MigrationExecutor(editor=TreeEditor(root)).execute(
        approve_migration(planned(migration_request(root)), approver=ADA, at=LATER),
        at=LATER,
    )

    result = SupersedingCompletion(RequirementWriteBack([read_only])).complete(
        execution,
        requirements=read_only.read().by_id(),
    )

    assert result.completed is False
    assert [step.req_id for step in result.manual_steps] == [OLD_BASKET, OLD_REFUND]
    assert "set the lifecycle to 'deprecated' by hand" in result.manual_steps[0].message
    assert "status: approved" in (store_dir / "SWR-501-basket.md").read_text(encoding="utf-8")


@verifies(SWR.SWR_3507)
def test_a_site_the_analysis_never_mentioned_holds_the_whole_migration(tmp_path: Path) -> None:
    """One unclassifiable site is enough to stop the migration; nothing is guessed."""
    root = workspace(tmp_path)
    request = migration_request(root)
    before = tree_fingerprint(root)

    plan = plan_migration(request, at=AT)

    assert len(plan.undecided) == 5
    assert all(entry.action is MigrationAction.DECISION_REQUIRED for entry in plan.entries)
    with pytest.raises(MigrationApprovalError, match="still need a decision"):
        approve_migration(plan, approver=ADA, at=LATER)
    assert tree_fingerprint(root) == before


# -- the composition, rather than the steps -------------------------------
#
# Every test above wires plan → decide → approve → execute → complete by hand,
# and that hand-wiring was the defect: no shipped function chained those steps,
# so the execution half was fully tested and entirely unreachable. These drive
# the product's own path instead.


@verifies(SWR.SWR_3507, SWR.SWR_3512, SWR.SWR_3518)
def test_a_planned_worklist_waits_for_a_person_and_survives_the_process(
    tmp_path: Path,
) -> None:
    """Productive use: a user adds a requirement that supersedes two others, then closes Rotaris.
    Expected outcome: the worklist is stored and a question is waiting — so tomorrow's session
    can approve exactly what today's read produced, rather than re-asking a model."""
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore
    from rotaris_core.requirements.change.decisions import DecisionTrigger
    from rotaris_core.requirements.change.migration_store import MigrationPlanStore
    from rotaris_core.requirements.change_host import plan_superseding_migrations

    root = workspace(tmp_path)
    read = SyntheticStore(root / "docs" / "requirements").read()

    lines = plan_superseding_migrations(
        root,
        read.requirements,
        coverage=coverage_sites(root, OLD_BASKET, OLD_REFUND),
        at=AT,
        analyst=RePointingAnalyst(),
        persona=PERSONA,
        model=MODEL,
    )

    assert any("waiting for a decision" in line for line in lines)

    # A different store object, standing in for the next process.
    stored = MigrationPlanStore(root).load(NEW)
    assert stored is not None
    assert stored.ready_for_approval is True
    assert stored.digest == planned(migration_request(root)).digest

    pending = PendingDecisionStore(root).open_for(NEW)
    assert pending is not None
    assert pending.trigger is DecisionTrigger.RISKY_MIGRATION
    assert pending.waits_in is DeliveryState.REVIEW
    assert [option.name for option in pending.options] == [
        "carry out the migration",
        "leave the code as it is",
    ]
    assert tree_fingerprint(root) == tree_fingerprint(root), "planning changed nothing"


@verifies(SWR.SWR_3507, SWR.SWR_3512)
def test_accepting_records_the_person_and_plans_the_unit_that_carries_it(
    tmp_path: Path,
) -> None:
    """Productive use: the user answers the question Rotaris raised.
    Expected outcome: their name is on the approval, the open question is closed, and one
    execution unit exists — carrying the worklist, not a prompt. No file is rewritten yet:
    that happens in the unit's own worktree."""
    from rotaris_core.requirements.change.decision_store import PendingDecisionStore
    from rotaris_core.requirements.change.migration_store import MigrationPlanStore
    from rotaris_core.requirements.change.superseding import MIGRATION_AGENT
    from rotaris_core.requirements.change_host import (
        accept_migration,
        plan_superseding_migrations,
    )
    from rotaris_core.requirements.execution.store import UnitStore

    root = workspace(tmp_path)
    source = SyntheticStore(root / "docs" / "requirements")
    by_id = source.read().by_id()
    plan_superseding_migrations(
        root,
        source.read().requirements,
        coverage=coverage_sites(root, OLD_BASKET, OLD_REFUND),
        at=AT,
        analyst=RePointingAnalyst(),
        persona=PERSONA,
        model=MODEL,
    )
    before = tree_fingerprint(root)

    outcome = accept_migration(
        root,
        NEW,
        coverage=coverage_sites(root, OLD_BASKET, OLD_REFUND),
        current_for=by_id.get,
        actor=ADA,
        at=LATER,
    )

    assert outcome.accepted, outcome.message
    assert "ada" in outcome.message or "ada" in str(outcome.unit_ids)

    approved = MigrationPlanStore(root).load_approved(NEW)
    assert approved is not None
    assert approved.approval.approver.name == "ada"

    assert PendingDecisionStore(root).open_for(NEW) is None, "the question was answered"
    log = PendingDecisionStore(root).read(NEW)
    assert log is not None and log.log is not None
    assert log.log.records[-1].answered_by.name == "ada"

    units = UnitStore(root).load(NEW)
    assert len(units.units) == 1
    assert units.units[0].agent == MIGRATION_AGENT
    assert tree_fingerprint(root) == before, "accepting plans work; it does not do it"


@verifies(SWR.SWR_3507, SWR.SWR_3518)
def test_a_worklist_whose_sites_moved_is_refused(tmp_path: Path) -> None:
    """Productive use: somebody edits the code between reading the worklist and approving it.
    Expected outcome: refused, naming the drift. Migrating against line numbers that have
    moved is the one failure this whole path exists to avoid."""
    from rotaris_core.requirements.change_host import (
        accept_migration,
        plan_superseding_migrations,
    )

    root = workspace(tmp_path)
    source = SyntheticStore(root / "docs" / "requirements")
    plan_superseding_migrations(
        root,
        source.read().requirements,
        coverage=coverage_sites(root, OLD_BASKET, OLD_REFUND),
        at=AT,
        analyst=RePointingAnalyst(),
        persona=PERSONA,
        model=MODEL,
    )

    # Somebody adds a line above the annotations; every site's line moves.
    basket = root / "src" / "pkg" / "basket.py"
    basket.write_text(
        "# a comment somebody added\n" + basket.read_text(encoding="utf-8"), encoding="utf-8"
    )
    before = tree_fingerprint(root)

    outcome = accept_migration(
        root,
        NEW,
        coverage=coverage_sites(root, OLD_BASKET, OLD_REFUND),
        current_for=source.read().by_id().get,
        actor=ADA,
        at=LATER,
    )

    assert outcome.accepted is False
    assert "have moved" in outcome.message
    assert tree_fingerprint(root) == before
