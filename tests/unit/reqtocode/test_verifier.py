"""Verifier lifecycle rules (blueprint §5/§6) against synthetic repositories.

Marker tokens (traces/verifies/@req) are assembled through the T/V/RQ
constants so this file's own source never contains scannable reference
tokens — the repo-level sweep must not pick up synthetic fixtures.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path
from rotaris_core.reqtocode.cli import _update_baseline
from rotaris_core.reqtocode.generator import regenerate_if_stale
from rotaris_core.reqtocode.verifier import BASELINE_PATH, load_baseline, verify

T = "traces"
V = "verifies"
RQ = "# @req"

_IMPORT = "from rotaris_core.reqtocode import SWR, traces, verifies\n"


def _write_req(
    root: Path,
    number: int,
    status: str = "approved",
    trace: str = "required",
    test: str = "required",
    legacy_id: str | None = None,
    body: str = "Body.",
) -> Path:
    folder = root / "docs" / "requirements" / "100-demo"
    folder.mkdir(parents=True, exist_ok=True)
    legacy = f"legacy-id: {legacy_id}\n" if legacy_id else ""
    path = folder / f"SWR-{number}-demo.md"
    path.write_text(
        f"---\nreq-id: SWR-{number}\nstatus: {status}\ntrace: {trace}\n"
        f'test: {test}\ntitle: "Demo {number}"\n{legacy}---\n\n{body}\n',
        encoding="utf-8",
    )
    return path


def _write_impl(root: Path, text: str) -> None:
    folder = root / "src" / "rotaris_core"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "feature.py").write_text(_IMPORT + text, encoding="utf-8")


def _write_test(root: Path, text: str) -> None:
    folder = root / "tests"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / "test_feature.py").write_text(_IMPORT + text, encoding="utf-8")


def _verify(root: Path):
    changed, errors = regenerate_if_stale(root)
    assert errors == []
    del changed
    return verify(root)


@verifies(SWR.SWR_2326)
def test_missing_trace_and_test_are_errors(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    result = _verify(tmp_path)
    assert any("SWR-101" in e and "trace: required" in e for e in result.errors)
    assert any("SWR-101" in e and "test: required" in e for e in result.errors)
    # Actionable: names the exact fix.
    assert any(f"@{T}(SWR.SWR_101)" in e for e in result.errors)


@verifies(SWR.SWR_2326)
def test_annotated_requirement_passes(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    _write_impl(tmp_path, f"@{T}(SWR.SWR_101)\ndef impl() -> None: ...\n")
    _write_test(tmp_path, f"@{V}(SWR.SWR_101)\ndef test_impl() -> None: ...\n")
    result = _verify(tmp_path)
    assert result.errors == []
    assert result.stats["traced"] == 1
    assert result.stats["covered"] == 1


@verifies(SWR.SWR_2326)
def test_markers_only_count_in_their_root(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    # traces in a test root is not a trace; verifies in an impl root is not coverage.
    _write_impl(tmp_path, f"@{V}(SWR.SWR_101)\ndef impl() -> None: ...\n")
    _write_test(tmp_path, f"@{T}(SWR.SWR_101)\ndef test_impl() -> None: ...\n")
    result = _verify(tmp_path)
    assert any("trace: required" in e for e in result.errors)
    assert any("test: required" in e for e in result.errors)


@verifies(SWR.SWR_2325, SWR.SWR_2326)
def test_req_comment_and_legacy_alias_count_as_coverage(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, legacy_id="FR-9-001")
    _write_req(tmp_path, 102)
    _write_impl(
        tmp_path,
        f"@{T}(SWR.SWR_101)\ndef impl() -> None: ...\n\n@{T}(SWR.SWR_102)\ndef impl2() -> None: ...\n",
    )
    _write_test(
        tmp_path,
        f"{RQ}: FR-9-001\ndef test_legacy() -> None: ...\n\n{RQ}: SWR-102\ndef test_direct() -> None: ...\n",
    )
    result = _verify(tmp_path)
    assert result.errors == []
    assert result.stats["covered"] == 2


@verifies(SWR.SWR_2326)
def test_unresolved_legacy_id_warns(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_test(tmp_path, f"{RQ}: FR-0-404\ndef test_x() -> None: ...\n")
    result = _verify(tmp_path)
    assert any("FR-0-404" in w and "does not resolve" in w for w in result.warnings)


@verifies(SWR.SWR_2326)
def test_reference_to_removed_requirement_is_error(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_impl(tmp_path, f"@{T}(SWR.SWR_909)\ndef impl() -> None: ...\n")
    result = _verify(tmp_path)
    assert any("SWR_909" in e and "no requirement SWR-909" in e for e in result.errors)


@verifies(SWR.SWR_2326)
def test_stale_generated_file_is_error(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="optional")
    regenerate_if_stale(tmp_path)
    _write_req(tmp_path, 101, trace="optional", test="optional", body="Edited text.")
    result = verify(tmp_path)
    assert any("stale or missing" in e for e in result.errors)


@verifies(SWR.SWR_2326)
def test_deprecated_reference_warns_and_is_not_enforced(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, status="deprecated")
    _write_impl(tmp_path, f"@{T}(SWR.SWR_101)\ndef impl() -> None: ...\n")
    result = _verify(tmp_path)
    assert result.errors == []
    assert any("SWR-101" in w and "deprecated but still referenced" in w for w in result.warnings)


@verifies(SWR.SWR_2326)
def test_draft_requirements_are_not_enforced(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, status="draft")
    result = _verify(tmp_path)
    assert result.errors == []
    assert result.warnings == []


@verifies(SWR.SWR_2327)
def test_baseline_suppresses_bootstrap_debt(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    (tmp_path / BASELINE_PATH).parent.mkdir(parents=True, exist_ok=True)
    (tmp_path / BASELINE_PATH).write_text("SWR-101 trace test\n", encoding="utf-8")
    result = _verify(tmp_path)
    assert result.errors == []
    assert result.stats["baseline_suppressed_trace"] == 1
    assert result.stats["baseline_suppressed_test"] == 1


@verifies(SWR.SWR_2327)
def test_baseline_does_not_hide_unlisted_flag(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    (tmp_path / BASELINE_PATH).parent.mkdir(parents=True, exist_ok=True)
    (tmp_path / BASELINE_PATH).write_text("SWR-101 trace\n", encoding="utf-8")
    result = _verify(tmp_path)
    assert not any("trace: required" in e for e in result.errors)
    assert any("test: required" in e for e in result.errors)


@verifies(SWR.SWR_2327)
def test_satisfied_and_stale_baseline_entries_warn(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, test="optional")
    _write_impl(tmp_path, f"@{T}(SWR.SWR_101)\ndef impl() -> None: ...\n")
    (tmp_path / BASELINE_PATH).parent.mkdir(parents=True, exist_ok=True)
    (tmp_path / BASELINE_PATH).write_text("SWR-101 trace\nSWR-999 trace\n", encoding="utf-8")
    result = _verify(tmp_path)
    assert result.errors == []
    assert any("SWR-101" in w and "is satisfied" in w for w in result.warnings)
    assert any("SWR-999" in w and "no longer matches" in w for w in result.warnings)


@verifies(SWR.SWR_2327)
def test_malformed_baseline_entry_is_error(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="optional")
    (tmp_path / BASELINE_PATH).parent.mkdir(parents=True, exist_ok=True)
    (tmp_path / BASELINE_PATH).write_text("SWR-101 bogus\n", encoding="utf-8")
    result = _verify(tmp_path)
    assert any("malformed baseline entry" in e for e in result.errors)


def _write_technical(
    root: Path,
    number: int,
    derived_from: str,
    *,
    status: str = "draft",
    req_type: str = "technical",
) -> Path:
    folder = root / "docs" / "requirements" / "100-demo"
    folder.mkdir(parents=True, exist_ok=True)
    type_line = f"type: {req_type}\n" if req_type else ""
    derived_line = f"derived-from: {derived_from}\n" if derived_from else ""
    path = folder / f"SWR-{number}-tech.md"
    path.write_text(
        f"---\nreq-id: SWR-{number}\nstatus: {status}\ntrace: optional\ntest: optional\n"
        f'{type_line}{derived_line}title: "Tech {number}"\n---\n\nBody.\n',
        encoding="utf-8",
    )
    return path


@verifies(SWR.SWR_2331)
def test_technical_requirement_with_valid_origin_passes(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_technical(tmp_path, 102, "SWR-101")
    result = _verify(tmp_path)
    assert result.errors == []


@verifies(SWR.SWR_2331)
def test_technical_requirement_without_derived_from_is_error(tmp_path: Path) -> None:
    _write_technical(tmp_path, 102, "")
    result = _verify(tmp_path)
    assert any("SWR-102" in e and "no derived-from" in e for e in result.errors)


@verifies(SWR.SWR_2331)
def test_derived_from_on_non_technical_is_error(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_technical(tmp_path, 102, "SWR-101", req_type="product")
    result = _verify(tmp_path)
    assert any("SWR-102" in e and "not type: technical" in e for e in result.errors)


@verifies(SWR.SWR_2331)
def test_dangling_and_self_origin_are_errors(tmp_path: Path) -> None:
    _write_technical(tmp_path, 102, "SWR-999")  # dangling
    _write_technical(tmp_path, 103, "SWR-103")  # self
    result = _verify(tmp_path)
    assert any("SWR-102" in e and "no such requirement exists" in e for e in result.errors)
    assert any("SWR-103" in e and "lists itself" in e for e in result.errors)


@verifies(SWR.SWR_2331)
def test_deprecated_origin_warns(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, status="deprecated")
    _write_technical(tmp_path, 102, "SWR-101")
    result = _verify(tmp_path)
    assert not any("SWR-102" in e for e in result.errors)
    assert any("SWR-102" in w and "deprecated requirement SWR-101" in w for w in result.warnings)


def _write_plain_module(root: Path, name: str, text: str = "def helper() -> None: ...\n") -> None:
    folder = root / "src" / "rotaris_core"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_text(text, encoding="utf-8")


@verifies(SWR.SWR_2333)
def test_untraced_module_is_orphan_error(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_plain_module(tmp_path, "orphan.py")
    result = _verify(tmp_path)
    assert any("orphan.py" in e and "orphan code" in e for e in result.errors)


@verifies(SWR.SWR_2333)
def test_traced_module_is_not_orphan(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_impl(tmp_path, f"@{T}(SWR.SWR_101)\ndef impl() -> None: ...\n")
    result = _verify(tmp_path)
    assert not any("orphan code" in e for e in result.errors)


@verifies(SWR.SWR_2333)
def test_exempt_marker_and_init_excused(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_plain_module(tmp_path, "glue.py", "# reqtocode: exempt\ndef glue() -> None: ...\n")
    _write_plain_module(tmp_path, "__init__.py", "from . import glue\n")
    result = _verify(tmp_path)
    assert not any("orphan code" in e for e in result.errors)


@verifies(SWR.SWR_2333)
def test_orphan_baseline_suppresses_then_flags_new(tmp_path: Path) -> None:
    from rotaris_core.reqtocode.verifier import ORPHAN_BASELINE_PATH

    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_plain_module(tmp_path, "legacy_orphan.py")
    (tmp_path / ORPHAN_BASELINE_PATH).parent.mkdir(parents=True, exist_ok=True)
    (tmp_path / ORPHAN_BASELINE_PATH).write_text(
        "src/rotaris_core/legacy_orphan.py\n", encoding="utf-8"
    )
    result = _verify(tmp_path)
    assert not any("orphan code" in e for e in result.errors)
    assert result.stats["baseline_suppressed_orphan"] == 1

    # A brand-new orphan is NOT excused by the baseline.
    _write_plain_module(tmp_path, "new_orphan.py")
    result = _verify(tmp_path)
    assert any("new_orphan.py" in e and "orphan code" in e for e in result.errors)


@verifies(SWR.SWR_2333)
def test_update_orphan_baseline_is_shrink_only(tmp_path: Path) -> None:
    from rotaris_core.reqtocode.verifier import load_orphan_baseline

    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_plain_module(tmp_path, "a_orphan.py")
    regenerate_if_stale(tmp_path)
    _update_baseline(tmp_path)  # bootstrap records the current orphan
    entries, errors = load_orphan_baseline(tmp_path)
    assert errors == []
    assert entries == {"src/rotaris_core/a_orphan.py"}

    # Pay the debt (trace it) and add a new orphan; baseline must not grow.
    _write_plain_module(
        tmp_path,
        "a_orphan.py",
        "from rotaris_core.reqtocode import SWR, traces\n\n"
        f"@{T}(SWR.SWR_101)\ndef impl() -> None: ...\n",
    )
    _write_plain_module(tmp_path, "b_orphan.py")
    regenerate_if_stale(tmp_path)
    _update_baseline(tmp_path)
    entries, _ = load_orphan_baseline(tmp_path)
    assert entries == set()  # a_orphan pruned, b_orphan NOT added
    result = verify(tmp_path)
    assert any("b_orphan.py" in e for e in result.errors)


@verifies(SWR.SWR_2327)
def test_update_baseline_is_shrink_only(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    regenerate_if_stale(tmp_path)
    _update_baseline(tmp_path)  # bootstrap: records all pre-existing debt
    entries, errors = load_baseline(tmp_path)
    assert errors == []
    assert entries == {101: {"trace", "test"}}

    # Pay the trace debt, add brand-new unannotated debt afterwards.
    _write_impl(tmp_path, f"@{T}(SWR.SWR_101)\ndef impl() -> None: ...\n")
    _write_req(tmp_path, 102)
    regenerate_if_stale(tmp_path)
    _update_baseline(tmp_path)
    entries, _ = load_baseline(tmp_path)
    assert entries == {101: {"test"}}  # pruned, and SWR-102 was NOT added
    result = verify(tmp_path)
    assert any("SWR-102" in e for e in result.errors)


def _write_test_file(root: Path, relpath: str, text: str, *, with_import: bool = True) -> Path:
    path = root / relpath
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text((_IMPORT if with_import else "") + text, encoding="utf-8")
    return path


@verifies(SWR.SWR_2334)
def test_untraced_test_is_orphan_error(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_test_file(tmp_path, "tests/test_orphan.py", "def test_something() -> None: ...\n")
    result = _verify(tmp_path)
    assert any(
        "tests/test_orphan.py::test_something" in e and "orphan test" in e for e in result.errors
    )


@verifies(SWR.SWR_2334)
def test_annotated_test_is_not_orphan(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    _write_impl(tmp_path, f"@{T}(SWR.SWR_101)\ndef impl() -> None: ...\n")
    _write_test_file(
        tmp_path, "tests/test_covered.py", f"@{V}(SWR.SWR_101)\ndef test_something() -> None: ...\n"
    )
    result = _verify(tmp_path)
    assert not any("orphan test" in e for e in result.errors)


@verifies(SWR.SWR_2334)
def test_req_comment_annotated_test_is_not_orphan(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional")
    _write_test_file(
        tmp_path, "tests/test_legacy.py", f"{RQ}: SWR-101\ndef test_something() -> None: ...\n"
    )
    result = _verify(tmp_path)
    assert not any("orphan test" in e for e in result.errors)


@verifies(SWR.SWR_2334)
def test_exempt_marker_excuses_test(tmp_path: Path) -> None:
    from rotaris_core.reqtocode.verifier import EXEMPT_MARKER

    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_test_file(
        tmp_path,
        "tests/test_exempt.py",
        f"{EXEMPT_MARKER}\ndef test_scaffolding() -> None: ...\n",
    )
    result = _verify(tmp_path)
    assert not any("orphan test" in e for e in result.errors)


@verifies(SWR.SWR_2334)
def test_capability_dir_is_excused(tmp_path: Path) -> None:
    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_test_file(
        tmp_path, "tests/capability/test_live.py", "def test_something() -> None: ...\n"
    )
    result = _verify(tmp_path)
    assert not any("orphan test" in e for e in result.errors)


@verifies(SWR.SWR_2334)
def test_same_named_methods_on_different_classes_do_not_collide(tmp_path: Path) -> None:
    _write_req(tmp_path, 101)
    _write_impl(tmp_path, f"@{T}(SWR.SWR_101)\ndef impl() -> None: ...\n")
    _write_test_file(
        tmp_path,
        "tests/test_grouped.py",
        f"class TestA:\n    @{V}(SWR.SWR_101)\n    def test_same(self) -> None: ...\n\n"
        "class TestB:\n    def test_same(self) -> None: ...\n",
    )
    result = _verify(tmp_path)
    orphan_errors = [e for e in result.errors if "orphan test" in e]
    assert len(orphan_errors) == 1
    assert "TestB::test_same" in orphan_errors[0]
    assert "TestA::test_same" not in orphan_errors[0]


@verifies(SWR.SWR_2334)
def test_orphan_test_baseline_suppresses_then_flags_new(tmp_path: Path) -> None:
    from rotaris_core.reqtocode.verifier import TEST_ORPHAN_BASELINE_PATH

    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_test_file(tmp_path, "tests/test_legacy_orphan.py", "def test_old() -> None: ...\n")
    (tmp_path / TEST_ORPHAN_BASELINE_PATH).parent.mkdir(parents=True, exist_ok=True)
    (tmp_path / TEST_ORPHAN_BASELINE_PATH).write_text(
        "tests/test_legacy_orphan.py::test_old\n", encoding="utf-8"
    )
    result = _verify(tmp_path)
    assert not any("orphan test" in e for e in result.errors)
    assert result.stats["baseline_suppressed_orphan_test"] == 1

    # A brand-new orphan test is NOT excused by the baseline.
    _write_test_file(
        tmp_path,
        "tests/test_legacy_orphan.py",
        "def test_old() -> None: ...\n\ndef test_new() -> None: ...\n",
    )
    result = _verify(tmp_path)
    assert any(
        "tests/test_legacy_orphan.py::test_new" in e and "orphan test" in e for e in result.errors
    )


@verifies(SWR.SWR_2334)
def test_update_test_orphan_baseline_is_shrink_only(tmp_path: Path) -> None:
    from rotaris_core.reqtocode.verifier import load_test_orphan_baseline

    _write_req(tmp_path, 101, trace="optional", test="optional")
    _write_test_file(tmp_path, "tests/test_a.py", "def test_a_one() -> None: ...\n")
    regenerate_if_stale(tmp_path)
    _update_baseline(tmp_path)  # bootstrap records the current orphan test
    entries, errors = load_test_orphan_baseline(tmp_path)
    assert errors == []
    assert entries == {"tests/test_a.py::test_a_one"}

    # Pay the debt (annotate it) and add a new orphan test; baseline must not grow.
    _write_impl(tmp_path, f"@{T}(SWR.SWR_101)\ndef impl() -> None: ...\n")
    _write_test_file(
        tmp_path, "tests/test_a.py", f"@{V}(SWR.SWR_101)\ndef test_a_one() -> None: ...\n"
    )
    _write_test_file(tmp_path, "tests/test_b.py", "def test_b_one() -> None: ...\n")
    regenerate_if_stale(tmp_path)
    _update_baseline(tmp_path)
    entries, _ = load_test_orphan_baseline(tmp_path)
    assert entries == set()  # test_a_one pruned, test_b_one NOT added
    result = verify(tmp_path)
    assert any("tests/test_b.py::test_b_one" in e for e in result.errors)
