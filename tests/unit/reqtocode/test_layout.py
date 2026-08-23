"""Repository layout as data (SWR-2335): a foreign repository checks correctly.

Marker tokens (traces/verifies) are assembled through the T/V constants so this
file's own source never contains scannable reference tokens — the repo-level
sweep must not pick up synthetic fixtures.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.reqtocode.cli import find_repo_root, main
from rotaris_core.reqtocode.generator import REQ_DIR, regenerate_if_stale
from rotaris_core.reqtocode.layout import (
    CONFIG_FILENAME,
    DEFAULT_LAYOUT,
    LayoutError,
    RepoLayout,
    layout_from_mapping,
    load_layout,
)
from rotaris_core.reqtocode.verifier import (
    BASELINE_PATH,
    EXEMPT_MARKER,
    IMPL_ROOTS,
    TEST_ROOTS,
    verify,
)

T = "traces"
V = "verifies"

#: A repository that keeps requirements in specs/, code in lib/, tests in spec/.
FOREIGN_LAYOUT = RepoLayout(
    generated_path=Path("lib") / "_swr.py",
    impl_roots=(Path("lib"),),
    test_roots=(Path("spec"),),
    excused_test_roots=(),
).with_requirements_dir("specs")


def _write_foreign_repo(root: Path, *, impl_body: str, test_body: str) -> None:
    (root / "specs").mkdir(parents=True, exist_ok=True)
    (root / "specs" / "SWR-101-demo.md").write_text(
        "---\nreq-id: SWR-101\nstatus: approved\ntrace: required\ntest: required\n"
        'title: "Demo 101"\n---\n\nBody.\n',
        encoding="utf-8",
    )
    (root / "lib").mkdir(parents=True, exist_ok=True)
    (root / "lib" / "feature.py").write_text(impl_body, encoding="utf-8")
    (root / "spec").mkdir(parents=True, exist_ok=True)
    (root / "spec" / "test_feature.py").write_text(test_body, encoding="utf-8")


def _verify_foreign(root: Path, layout: RepoLayout = FOREIGN_LAYOUT):
    changed, errors = regenerate_if_stale(root, layout)
    assert errors == []
    del changed
    return verify(root, layout=layout)


@verifies(SWR.SWR_2335)
def test_foreign_layout_detects_missing_trace_and_missing_test(tmp_path: Path) -> None:
    _write_foreign_repo(
        tmp_path,
        impl_body="def feature() -> None: ...\n",
        test_body="def test_feature() -> None: ...\n",
    )

    result = _verify_foreign(tmp_path)

    assert any("SWR-101" in e and "trace: required" in e for e in result.errors)
    assert any("SWR-101" in e and "test: required" in e for e in result.errors)
    # The reverse checks reach into the foreign roots too, not just src/ and tests/.
    assert any("lib/feature.py has no" in e for e in result.errors)
    assert any("spec/test_feature.py::test_feature has no" in e for e in result.errors)


@verifies(SWR.SWR_2335)
def test_foreign_layout_accepts_annotated_code_and_tests(tmp_path: Path) -> None:
    _write_foreign_repo(
        tmp_path,
        impl_body=f"@{T}(SWR.SWR_101)\ndef feature() -> None: ...\n",
        test_body=f"@{V}(SWR.SWR_101)\ndef test_feature() -> None: ...\n",
    )

    result = _verify_foreign(tmp_path)

    assert result.errors == [], "\n".join(result.errors)
    assert result.stats["traced"] == 1
    assert result.stats["covered"] == 1


@verifies(SWR.SWR_2335)
def test_foreign_layout_ignores_the_default_rotaris_roots(tmp_path: Path) -> None:
    """Code at Rotaris' own paths is invisible to a repository that doesn't use them."""
    _write_foreign_repo(
        tmp_path,
        impl_body="def feature() -> None: ...\n",
        test_body=f"@{V}(SWR.SWR_101)\ndef test_feature() -> None: ...\n",
    )
    stray = tmp_path / "src" / "rotaris_core"
    stray.mkdir(parents=True)
    (stray / "stray.py").write_text(f"@{T}(SWR.SWR_101)\ndef stray() -> None: ...\n", "utf-8")

    result = _verify_foreign(tmp_path)

    assert any("SWR-101" in e and "trace: required" in e for e in result.errors)


@verifies(SWR.SWR_2335)
def test_baselines_follow_the_relocated_requirement_store(tmp_path: Path) -> None:
    _write_foreign_repo(
        tmp_path,
        impl_body="def feature() -> None: ...\n",
        test_body="def test_feature() -> None: ...\n",
    )
    (tmp_path / "specs" / "traceability-baseline.txt").write_text(
        "SWR-101 trace test\n", encoding="utf-8"
    )
    (tmp_path / "specs" / "orphan-baseline.txt").write_text("lib/feature.py\n", encoding="utf-8")
    (tmp_path / "specs" / "orphan-test-baseline.txt").write_text(
        "spec/test_feature.py::test_feature\n", encoding="utf-8"
    )

    result = _verify_foreign(tmp_path)

    assert result.errors == [], "\n".join(result.errors)
    assert result.stats["baseline_suppressed_trace"] == 1
    assert result.stats["baseline_suppressed_test"] == 1
    assert result.stats["baseline_suppressed_orphan"] == 1
    assert result.stats["baseline_suppressed_orphan_test"] == 1


@verifies(SWR.SWR_2335)
def test_custom_exempt_marker_excuses_orphans(tmp_path: Path) -> None:
    layout = RepoLayout(
        generated_path=Path("lib") / "_swr.py",
        impl_roots=(Path("lib"),),
        test_roots=(Path("spec"),),
        excused_test_roots=(),
        exempt_marker="// no-requirement",
    ).with_requirements_dir("specs")
    _write_foreign_repo(
        tmp_path,
        impl_body=f"# {layout.exempt_marker}\ndef feature() -> None: ...\n",
        test_body=f"# {layout.exempt_marker}\ndef test_feature() -> None: ...\n",
    )

    result = _verify_foreign(tmp_path, layout)

    assert not any("orphan" in e for e in result.errors), "\n".join(result.errors)


@verifies(SWR.SWR_2335)
def test_default_layout_reproduces_the_historical_constants() -> None:
    assert DEFAULT_LAYOUT.requirements_dir == Path("docs") / "requirements"
    assert DEFAULT_LAYOUT.generated_path == Path("src/rotaris_core/reqtocode/swr.py")
    assert DEFAULT_LAYOUT.impl_roots == (Path("src/rotaris_core"), Path("apps/rotaris/src"))
    assert DEFAULT_LAYOUT.test_roots == (Path("tests"), Path("apps/rotaris/tests"))
    # Both live-provider roots, excused on the same grounds: they exercise the
    # framework rather than a requirement, and they only run when asked for.
    assert DEFAULT_LAYOUT.excused_test_roots == (Path("tests/capability"), Path("tests/live"))
    assert DEFAULT_LAYOUT.exempt_marker == "# reqtocode: exempt"
    assert DEFAULT_LAYOUT.skip_parts == frozenset({"__pycache__", ".venv", "fixtures"})
    # The pre-SWR-2335 module constants are kept as aliases for existing callers.
    assert DEFAULT_LAYOUT.requirements_dir == REQ_DIR
    assert DEFAULT_LAYOUT.impl_roots == IMPL_ROOTS
    assert DEFAULT_LAYOUT.test_roots == TEST_ROOTS
    assert DEFAULT_LAYOUT.baseline_path == BASELINE_PATH
    assert DEFAULT_LAYOUT.exempt_marker == EXEMPT_MARKER


@verifies(SWR.SWR_2335)
def test_layout_is_read_from_a_stdlib_json_config(tmp_path: Path) -> None:
    (tmp_path / CONFIG_FILENAME).write_text(
        '{"requirements_dir": "specs", "generated_path": "lib/_swr.py",'
        ' "impl_roots": ["lib"], "test_roots": ["spec"], "excused_test_roots": []}',
        encoding="utf-8",
    )

    layout = load_layout(tmp_path)

    assert layout == FOREIGN_LAYOUT


@verifies(SWR.SWR_2335)
def test_unconfigured_repository_gets_the_default_layout(tmp_path: Path) -> None:
    assert load_layout(tmp_path) is DEFAULT_LAYOUT


@verifies(SWR.SWR_2335)
def test_malformed_config_is_reported_not_silently_ignored(tmp_path: Path) -> None:
    (tmp_path / CONFIG_FILENAME).write_text('{"impl_root": ["lib"]}', encoding="utf-8")
    with pytest.raises(LayoutError, match="unknown layout key"):
        load_layout(tmp_path)

    (tmp_path / CONFIG_FILENAME).write_text("{not json", encoding="utf-8")
    with pytest.raises(LayoutError, match="cannot read layout config"):
        load_layout(tmp_path)


@verifies(SWR.SWR_2335)
def test_config_may_not_escape_the_repository(tmp_path: Path) -> None:
    with pytest.raises(LayoutError, match="stay inside the repository"):
        layout_from_mapping({"impl_roots": ["../elsewhere"]})


@verifies(SWR.SWR_2335)
def test_cli_check_uses_the_repository_config(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / CONFIG_FILENAME).write_text(
        '{"requirements_dir": "specs", "generated_path": "lib/_swr.py",'
        ' "impl_roots": ["lib"], "test_roots": ["spec"], "excused_test_roots": []}',
        encoding="utf-8",
    )
    _write_foreign_repo(
        tmp_path,
        impl_body=f"@{T}(SWR.SWR_101)\ndef feature() -> None: ...\n",
        test_body=f"@{V}(SWR.SWR_101)\ndef test_feature() -> None: ...\n",
    )

    assert main(["--repo-root", str(tmp_path), "check", "--fix"]) == 0
    assert "[reqtocode] OK" in capsys.readouterr().out
    assert (tmp_path / "lib" / "_swr.py").is_file()


@verifies(SWR.SWR_2335)
def test_cli_reports_a_broken_config_as_a_user_error(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / CONFIG_FILENAME).write_text('{"impl_root": ["lib"]}', encoding="utf-8")

    # Exit 1 (violation), not 2 (internal error): the repository misconfigured it.
    assert main(["--repo-root", str(tmp_path), "check"]) == 1
    assert "CONFIG ERROR" in capsys.readouterr().err


@verifies(SWR.SWR_2335)
def test_find_repo_root_prefers_a_directory_carrying_the_config(tmp_path: Path) -> None:
    (tmp_path / CONFIG_FILENAME).write_text("{}", encoding="utf-8")
    nested = tmp_path / "lib" / "deep"
    nested.mkdir(parents=True)

    assert find_repo_root(nested / "module.py") == tmp_path
