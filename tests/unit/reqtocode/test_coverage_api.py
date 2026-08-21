"""Public coverage query API (SWR-2336): who implements and who covers a requirement.

Marker tokens (traces/verifies) are assembled through the T/V constants so this
file's own source never contains scannable reference tokens — the repo-level
sweep must not pick up synthetic fixtures.
"""

from __future__ import annotations

from pathlib import Path

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.coverage import (
    CoverageSite,
    RequirementCoverage,
    coverage_map,
    requirement_coverage,
)

T = "traces"
V = "verifies"

REPO_ROOT = Path(__file__).resolve().parents[3]


def _write_repo(root: Path) -> None:
    reqs = root / "docs" / "requirements"
    reqs.mkdir(parents=True)
    for number in (101, 102):
        (reqs / f"SWR-{number}-demo.md").write_text(
            f"---\nreq-id: SWR-{number}\nstatus: approved\ntrace: required\n"
            f'test: required\ntitle: "Demo {number}"\n---\n\nBody.\n',
            encoding="utf-8",
        )
    impl = root / "src" / "rotaris_core"
    impl.mkdir(parents=True)
    (impl / "one.py").write_text(f"@{T}(SWR.SWR_101)\ndef one() -> None: ...\n", encoding="utf-8")
    (impl / "two.py").write_text(f"@{T}(SWR.SWR_101)\ndef two() -> None: ...\n", encoding="utf-8")
    tests = root / "tests"
    tests.mkdir(parents=True)
    (tests / "test_one.py").write_text(
        f"@{V}(SWR.SWR_101)\ndef test_one() -> None: ...\n", encoding="utf-8"
    )


@verifies(SWR.SWR_2336)
def test_covered_requirement_returns_both_site_sets(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    coverage = requirement_coverage(tmp_path, 101)

    assert coverage.number == 101
    assert coverage.implementations == (
        CoverageSite("src/rotaris_core/one.py", 1, "traces"),
        CoverageSite("src/rotaris_core/two.py", 1, "traces"),
    )
    assert coverage.tests == (CoverageSite("tests/test_one.py", 1, "verifies"),)
    assert coverage.is_traced
    assert coverage.is_test_covered


@verifies(SWR.SWR_2336)
def test_uncovered_requirement_returns_empty_sets_without_raising(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    coverage = requirement_coverage(tmp_path, 102)

    assert coverage == RequirementCoverage(number=102)
    assert not coverage.is_traced
    assert not coverage.is_test_covered


@verifies(SWR.SWR_2336)
def test_unknown_requirement_number_is_answered_not_rejected(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    assert requirement_coverage(tmp_path, 999_999) == RequirementCoverage(number=999_999)


@verifies(SWR.SWR_2336)
def test_coverage_map_covers_every_declared_requirement(tmp_path: Path) -> None:
    _write_repo(tmp_path)

    mapping = coverage_map(tmp_path)

    assert set(mapping) == {101, 102}
    assert len(mapping[101].implementations) == 2
    assert mapping[102].implementations == ()


@verifies(SWR.SWR_2336)
def test_query_needs_no_git_checkout_and_writes_nothing(tmp_path: Path) -> None:
    _write_repo(tmp_path)
    before = sorted(p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*"))

    requirement_coverage(tmp_path, 101)
    coverage_map(tmp_path)

    assert not (tmp_path / ".git").exists()
    assert sorted(p.relative_to(tmp_path).as_posix() for p in tmp_path.rglob("*")) == before


@verifies(SWR.SWR_2336)
def test_querying_this_repository_returns_its_real_sites() -> None:
    coverage = requirement_coverage(REPO_ROOT, int(SWR.SWR_2326))

    assert coverage.is_traced
    assert coverage.is_test_covered
    assert any(
        site.path == "src/rotaris_core/reqtocode/verifier.py" for site in coverage.implementations
    )
    assert all(site.kind == "traces" for site in coverage.implementations)
    assert all(site.kind in {"verifies", "@req"} for site in coverage.tests)


@verifies(SWR.SWR_2336)
def test_repository_coverage_map_agrees_with_the_single_query() -> None:
    mapping = coverage_map(REPO_ROOT)

    assert mapping[int(SWR.SWR_2326)] == requirement_coverage(REPO_ROOT, int(SWR.SWR_2326))
