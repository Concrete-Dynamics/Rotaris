"""Productive use: someone deletes a requirement file from the project's store — the
requirement is gone, but the module that implements it, the test that covers it and the two
requirements that were built on top of it are all still there.
Expected outcome: the next read detects the removal, tombstones the id, and shows the user
exactly what is now unaccounted for: every trace, every test, the derived requirement and
the dependant, each named with its file. The dependants are reported as dangling rather
than quietly satisfied. Not one byte of the project is deleted, and the report is kept
under the tombstone and in the analysis log so the question can still be answered later.
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
from rotaris_core.requirements.change.detection import (
    ChangeKind,
    RequirementBaseline,
    classify_changes,
)
from rotaris_core.requirements.change.records import AnalysisKind, AnalysisRecordStore
from rotaris_core.requirements.change.removal import RemovalAnalyzer, RemovalLedger
from rotaris_core.requirements.change.superseding import MigrationAction
from rotaris_core.requirements.memory import RegistryMemory
from rotaris_core.requirements.model import (
    CanonicalRequirement,
    Relation,
    RelationKind,
    RequirementLifecycle,
)
from rotaris_core.requirements.registry import RequirementRegistry
from rotaris_core.requirements.relations import build_relation_graph
from rotaris_core.requirements.sources.base import (
    BaseRequirementSource,
    RequirementArtifact,
    SourceRead,
)
from rotaris_core.requirements.tombstones import TombstoneLog
from rotaris_core.requirements.writeback import MarkdownRequirementDocument

if TYPE_CHECKING:
    from collections.abc import Sequence

pytestmark = pytest.mark.integration

GONE = "SWR-501"
DEPENDANT = "SWR-502"
DERIVED = "SWR-503"
AT = dt.datetime(2026, 8, 14, 9, 0, tzinfo=dt.UTC)
LATER = AT + dt.timedelta(days=1)

#: Assembled at runtime so this file never carries the literal annotation text
#: this repository's own ReqToCode sweep looks for.
TRACE = "traces"
COVER = "verifies"

LAYOUT = RepoLayout(impl_roots=(Path("src"),), test_roots=(Path("tests"),))


def number_of(req_id: str) -> int:
    """``SWR-501`` → ``501``."""
    return int(req_id.split("-")[1])


def document(
    req_id: str,
    title: str,
    prose: str,
    *,
    depends_on: Sequence[str] = (),
    derived_from: Sequence[str] = (),
) -> str:
    """One requirement artefact in the synthetic store's format."""
    relations = ""
    if depends_on:
        relations += f"depends-on: {', '.join(depends_on)}\n"
    if derived_from:
        relations += f"derived-from: {', '.join(derived_from)}\n"
    return (
        f"---\nreq-id: {req_id}\nstatus: approved\ntitle: {title!r}\n{relations}---\n\n"
        f"# {req_id} — {title}\n\n{prose}\n"
    )


def write_store(root: Path) -> Path:
    """Three requirements: one that will vanish, and two built on it."""
    store = root / "docs" / "requirements"
    store.mkdir(parents=True)
    (store / "SWR-501-basket.md").write_text(
        document(GONE, "A basket can be paid for", "The user pays and gets a receipt."),
        encoding="utf-8",
    )
    (store / "SWR-502-refund.md").write_text(
        document(
            DEPENDANT,
            "A payment can be refunded",
            "The user asks for their money back.",
            depends_on=(GONE,),
        ),
        encoding="utf-8",
    )
    (store / "SWR-503-receipt.md").write_text(
        document(
            DERIVED,
            "The receipt is rendered as PDF",
            "A technical requirement of the basket payment.",
            derived_from=(GONE,),
        ),
        encoding="utf-8",
    )
    return store


def write_code(root: Path) -> None:
    """Two annotated modules and one annotated test claiming the doomed id."""
    (root / "src" / "pkg").mkdir(parents=True)
    (root / "tests" / "unit").mkdir(parents=True)
    (root / "src" / "pkg" / "basket.py").write_text(
        f'"""Basket."""\n\n\n@{TRACE}(SWR.SWR_{number_of(GONE)})\ndef pay() -> None:\n'
        "    return None\n",
        encoding="utf-8",
    )
    (root / "src" / "pkg" / "receipt.py").write_text(
        f'"""Receipt."""\n\n\n@{TRACE}(SWR.SWR_{number_of(GONE)})\ndef receipt() -> None:\n'
        "    return None\n",
        encoding="utf-8",
    )
    (root / "tests" / "unit" / "test_basket.py").write_text(
        f"@{COVER}(SWR.SWR_{number_of(GONE)})\ndef test_pay() -> None:\n    assert True\n",
        encoding="utf-8",
    )


def coverage_of(root: Path, *req_ids: str) -> dict[str, RequirementCoverage]:
    """The real ReqToCode coverage query, run over the synthetic tree."""
    sweep = sweep_references(root, {}, LAYOUT)
    return {req_id: coverage_from_sweep(sweep, number_of(req_id)) for req_id in req_ids}


def fingerprint(root: Path) -> dict[str, str]:
    """Every file under *root* and the digest of its bytes."""
    return {
        path.relative_to(root).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


class SyntheticStore(BaseRequirementSource):
    """A read-only markdown requirement store over one directory.

    Read-only on purpose: SWR-3509 is about what a *disappearance* leaves behind,
    and a fixture that could write would be a fixture that could delete.
    """

    def __init__(self, root: Path) -> None:
        self._root = root

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
        relations = [
            Relation(kind=kind, target=target.strip())
            for kind, key in (
                (RelationKind.DEPENDS_ON, "depends-on"),
                (RelationKind.DERIVED_FROM, "derived-from"),
            )
            for target in (parsed.get(key) or "").split(",")
            if target.strip()
        ]
        body = [line for line in parsed.body if line.strip() and not line.startswith("#")]
        return CanonicalRequirement(
            req_id=parsed.get("req-id") or path.stem,
            title=(parsed.get("title") or "").strip(),
            description="\n".join(body),
            lifecycle=RequirementLifecycle(parsed.get("status") or "draft"),
            source_path=path.name,
            relations=tuple(relations),
        )


def project(tmp_path: Path) -> tuple[Path, SyntheticStore]:
    """A synthetic project: three requirements and the code claiming one of them."""
    store = write_store(tmp_path)
    write_code(tmp_path)
    return tmp_path, SyntheticStore(store)


def delete_the_requirement(root: Path) -> None:
    """What a user does: they remove the file and nothing else."""
    (root / "docs" / "requirements" / "SWR-501-basket.md").unlink()


@verifies(SWR.SWR_3509, SWR.SWR_3113)
def test_deleting_a_requirement_file_names_its_traces_tests_and_dependants(
    tmp_path: Path,
) -> None:
    """Detection tombstones the id; the analysis says what it left behind."""
    root, source = project(tmp_path)
    before = source.read()
    baseline = RequirementBaseline.of_read(before)

    delete_the_requirement(root)
    after = source.read()

    changes = classify_changes(baseline, after.requirements, revision=after.revision)
    assert [change.req_id for change in changes.of_kind(ChangeKind.REMOVED)] == [GONE]

    log = TombstoneLog().observe(
        source_id=source.source_id,
        previous=RequirementBaseline.of_read(before).by_id(),
        current=RequirementBaseline.of_read(after).by_id(),
        at=LATER,
    )
    tombstone = log.get(GONE)
    assert tombstone is not None
    assert tombstone.active

    impact = RemovalAnalyzer().analyse(
        tombstone,
        graph=build_relation_graph(after.requirements),
        coverage=coverage_of(root, GONE),
        requirements=after.by_id(),
        at=LATER,
    )

    assert [site.location for site in impact.traces] == [
        "src/pkg/basket.py:4",
        "src/pkg/receipt.py:4",
    ]
    assert [site.location for site in impact.tests] == ["tests/unit/test_basket.py:1"]
    assert impact.depending == (DEPENDANT,)
    assert impact.derived == (DERIVED,)


@verifies(SWR.SWR_3509)
def test_the_dependants_are_reported_as_dangling_not_as_satisfied(tmp_path: Path) -> None:
    """A vanished dependency must never read as met to whatever schedules work."""
    root, source = project(tmp_path)
    before = source.read()
    delete_the_requirement(root)
    after = source.read()

    tombstone = (
        TombstoneLog()
        .observe(
            source_id=source.source_id,
            previous=RequirementBaseline.of_read(before).by_id(),
            current=RequirementBaseline.of_read(after).by_id(),
            at=LATER,
        )
        .get(GONE)
    )
    assert tombstone is not None

    impact = RemovalAnalyzer().analyse(
        tombstone,
        graph=build_relation_graph(after.requirements),
        coverage=coverage_of(root, GONE),
        requirements=after.by_id(),
        at=LATER,
    )

    assert [entry.req_id for entry in impact.dependents] == [DEPENDANT, DERIVED]
    assert all(entry.satisfied is False for entry in impact.dependents)
    assert all(entry.blocks for entry in impact.dependents)
    assert all("dangling, not satisfied" in entry.message for entry in impact.dependents)
    assert "SWR-502-refund.md" in impact.dependents[0].message


@verifies(SWR.SWR_3509)
def test_the_user_is_shown_the_unaccounted_code_and_nothing_is_deleted(tmp_path: Path) -> None:
    """The whole point: a report, not a clean-up."""
    root, source = project(tmp_path)
    before = source.read()
    delete_the_requirement(root)
    after = source.read()
    untouched = fingerprint(root)

    tombstone = (
        TombstoneLog()
        .observe(
            source_id=source.source_id,
            previous=RequirementBaseline.of_read(before).by_id(),
            current=RequirementBaseline.of_read(after).by_id(),
            at=LATER,
        )
        .get(GONE)
    )
    assert tombstone is not None

    impact = RemovalAnalyzer().analyse(
        tombstone,
        graph=build_relation_graph(after.requirements),
        coverage=coverage_of(root, GONE),
        requirements=after.by_id(),
        last_known=before.by_id()[GONE],
        at=LATER,
    )

    report = impact.report
    assert any("src/pkg/basket.py:4" in line for line in report)
    assert any("src/pkg/receipt.py:4" in line for line in report)
    assert any("tests/unit/test_basket.py:1" in line for line in report)
    assert any(DEPENDANT in line and "dangling" in line for line in report)

    assert fingerprint(root) == untouched
    assert (root / "src" / "pkg" / "basket.py").is_file()
    assert (root / "tests" / "unit" / "test_basket.py").is_file()
    assert (root / "docs" / "requirements" / "SWR-502-refund.md").is_file()
    assert impact.plan.worklist.of_action(MigrationAction.REMOVE) == ()
    assert len(impact.awaiting_decision) == 3
    assert impact.plan.ready_for_approval is False


@verifies(SWR.SWR_3509, SWR.SWR_3113)
def test_the_analysis_is_retained_under_the_tombstone_and_in_the_analysis_log(
    tmp_path: Path,
) -> None:
    """Months later, "what happened to SWR-501's code" still has an answer."""
    root, source = project(tmp_path)
    before = source.read()
    delete_the_requirement(root)
    after = source.read()

    tombstone = (
        TombstoneLog()
        .observe(
            source_id=source.source_id,
            previous=RequirementBaseline.of_read(before).by_id(),
            current=RequirementBaseline.of_read(after).by_id(),
            at=LATER,
        )
        .get(GONE)
    )
    assert tombstone is not None

    impact = RemovalAnalyzer().analyse(
        tombstone,
        graph=build_relation_graph(after.requirements),
        coverage=coverage_of(root, GONE),
        requirements=after.by_id(),
        at=LATER,
    )

    ledger = RemovalLedger().with_impact(impact)
    assert ledger.for_tombstone(tombstone) is impact

    records = AnalysisRecordStore(root)
    records.append(impact.to_record())

    stored = records.read(GONE)
    assert len(stored.records) == 1
    replayed = stored.records[0]
    assert replayed.kind is AnalysisKind.MIGRATION
    assert replayed.outcome == "removal-impact"
    assert replayed.considered == impact.report
    assert replayed.record_id == impact.to_record().record_id


# -- across a process boundary (SWR-3119) ----------------------------------


@verifies(SWR.SWR_3119, SWR.SWR_3113)
def test_a_requirement_deleted_between_two_sessions_is_tombstoned_by_the_second(
    tmp_path: Path,
) -> None:
    """Productive use: a user closes Rotaris, deletes a requirement file, and opens the CLI.
    Expected outcome: the deletion is noticed. Two separate registries over one workspace stand
    in for two processes — before SWR-3119 the second compared against nothing, saw no
    difference, and a removal was undetectable outside a single sitting."""
    root = tmp_path / "project"
    store = write_store(root)
    write_code(root)

    # Session one: reads the store and leaves its memory behind.
    first = RequirementRegistry([SyntheticStore(store)], memory=RegistryMemory(root))
    seen = first.refresh()
    assert set(seen.ids) >= {GONE}
    assert seen.tombstones == (), "a first read is not a wave of removals"

    # Between sessions: the user deletes the requirement's own file.
    (store / "SWR-501-basket.md").unlink()

    # Session two: a different registry, nothing carried over in memory.
    second = RequirementRegistry([SyntheticStore(store)], memory=RegistryMemory(root))
    index = second.refresh()

    tombstone = index.tombstone(GONE)
    assert tombstone is not None, "the second process noticed what the first one saw"
    assert tombstone.active
    assert tombstone.source_path is not None and GONE in tombstone.source_path
    # Read back from disk, so it carries no title — and says so rather than inventing one.
    assert tombstone.last_title == ""

    # A third session re-reports nothing: the removal is already recorded.
    third = RequirementRegistry([SyntheticStore(store)], memory=RegistryMemory(root))
    again = third.refresh()
    assert [entry.req_id for entry in again.tombstones] == [GONE]
    assert again.tombstone(GONE) is not None
    assert again.tombstone(GONE).removed_at == tombstone.removed_at, (  # type: ignore[union-attr]
        "an already-recorded removal is not restamped on every later refresh"
    )
