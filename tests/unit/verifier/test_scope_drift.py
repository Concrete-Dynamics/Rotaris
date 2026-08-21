"""Scope drift (SWR-2607): what a change touched that no requirement asked for.

Productive scenario: an agent asked to fix one thing also adds a helper, or
refactors a neighbour. Each edit is defensible alone; together they are work
nobody scoped, invisible unless someone reads the whole diff.

Marker tokens are assembled through the T/V constants so this file's own source
carries no scannable reference token.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.verifier.requirement_evidence import build_iteration_evidence
from rotaris_core.verifier.scope_drift import (
    ScopeDriftEvidence,
    build_scope_drift,
    drift_from_orphans,
)

if TYPE_CHECKING:
    from pathlib import Path

T = "traces"
V = "verifies"


def _write_repo(root: Path) -> None:
    reqs = root / "docs" / "requirements"
    reqs.mkdir(parents=True)
    (reqs / "SWR-101-demo.md").write_text(
        "---\nreq-id: SWR-101\nstatus: approved\ntrace: required\ntest: required\n"
        'title: "Demo"\n---\n\nBody.\n',
        encoding="utf-8",
    )
    impl = root / "src" / "rotaris_core"
    impl.mkdir(parents=True)
    (impl / "traced.py").write_text(
        f"@{T}(SWR.SWR_101)\ndef traced() -> None: ...\n",
        encoding="utf-8",
    )
    (impl / "helper.py").write_text("def helper() -> None: ...\n", encoding="utf-8")
    (impl / "__init__.py").write_text("from . import traced\n", encoding="utf-8")
    tests = root / "tests" / "unit"
    tests.mkdir(parents=True)
    (tests / "test_traced.py").write_text(
        f"@{V}(SWR.SWR_101)\ndef test_traced() -> None: ...\n",
        encoding="utf-8",
    )


@verifies(SWR.SWR_2607)
def test_an_untraced_helper_changed_alongside_traced_work_is_reported(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    drift = build_scope_drift(
        tmp_path,
        ["src/rotaris_core/traced.py", "src/rotaris_core/helper.py"],
    )

    assert drift.files == ["src/rotaris_core/helper.py"]
    assert drift.total == 1
    assert drift.drifted is True


@verifies(SWR.SWR_2607)
def test_changing_only_traced_modules_reports_none_not_nothing(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    drift = build_scope_drift(tmp_path, ["src/rotaris_core/traced.py"])

    # "computed, and nothing drifted" — an instance, not a `None`.
    assert isinstance(drift, ScopeDriftEvidence)
    assert drift.files == []
    assert drift.total == 0
    assert drift.drifted is False


@verifies(SWR.SWR_2607)
def test_a_file_the_orphan_baseline_excuses_is_still_reported_when_changed(
    tmp_path: Path,
) -> None:
    _write_repo(tmp_path)
    (tmp_path / "docs" / "requirements" / "orphan-baseline.txt").write_text(
        "src/rotaris_core/helper.py\n",
        encoding="utf-8",
    )

    drift = build_scope_drift(tmp_path, ["src/rotaris_core/helper.py"])

    # The baseline forgives pre-existing debt so the build can stay green; it is
    # not a licence to keep editing untraced code unnoticed.
    assert drift.files == ["src/rotaris_core/helper.py"]
    assert drift.baselined_files == ["src/rotaris_core/helper.py"]


@verifies(SWR.SWR_2607)
def test_changed_test_files_never_appear_as_drift(tmp_path: Path) -> None:
    _write_repo(tmp_path)
    (tmp_path / "tests" / "unit" / "test_plain.py").write_text(
        "def test_plain() -> None: ...\n",
        encoding="utf-8",
    )

    drift = build_scope_drift(
        tmp_path,
        ["tests/unit/test_traced.py", "tests/unit/test_plain.py"],
    )

    # A new test is accounted for by its own `verifies`; drift is a statement
    # about production code.
    assert drift.files == []


@verifies(SWR.SWR_2607)
def test_structural_shims_are_excused_by_reqtocodes_own_rule(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    drift = build_scope_drift(tmp_path, ["src/rotaris_core/__init__.py"])

    # Not a second definition of "untraced": `find_orphan_modules` already
    # excuses re-export shims, and reusing it means the two can never disagree.
    assert drift.files == []


@verifies(SWR.SWR_2607)
def test_drift_classification_is_a_pure_projection_of_the_orphan_verdict() -> None:
    drift = drift_from_orphans(
        changed_files=["b.py", "a.py", "traced.py", "a.py"],
        orphan_modules=["a.py", "b.py", "never_changed.py"],
        baselined=["b.py"],
    )

    assert drift.files == ["a.py", "b.py"]
    assert drift.total == 2
    assert drift.baselined_files == ["b.py"]


@verifies(SWR.SWR_2607)
def test_an_iteration_that_changed_nothing_computes_no_drift(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    assert build_scope_drift(tmp_path, []) == ScopeDriftEvidence()


@verifies(SWR.SWR_2607)
def test_a_workspace_with_no_requirement_store_yields_not_computed(tmp_path: Path) -> None:
    impl = tmp_path / "src" / "rotaris_core"
    impl.mkdir(parents=True)
    (impl / "helper.py").write_text("def helper() -> None: ...\n", encoding="utf-8")

    # Reported through the shared builder, which is what the loop calls: with no
    # store there is no rule to apply, and `None` says so.
    assert build_iteration_evidence(tmp_path, ["src/rotaris_core/helper.py"]) is None


@verifies(SWR.SWR_2607)
def test_drift_and_requirement_coverage_come_from_one_sweep(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    evidence = build_iteration_evidence(
        tmp_path,
        ["src/rotaris_core/traced.py", "src/rotaris_core/helper.py"],
    )

    assert evidence is not None
    assert [req.req_id for req in evidence.requirements.requirements] == ["SWR-101"]
    assert evidence.scope_drift.files == ["src/rotaris_core/helper.py"]


@verifies(SWR.SWR_2607)
def test_the_drift_report_survives_the_json_round_trip(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    drift = build_scope_drift(tmp_path, ["src/rotaris_core/helper.py"])
    restored = ScopeDriftEvidence.model_validate(drift.model_dump(mode="json"))

    assert restored == drift
    assert restored.total == 1
