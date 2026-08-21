"""Repository-level ReqToCode gate (blueprint §7 layer 3, §9 meta-tests).

These tests make CI enforce traceability with zero extra CI config: a broken
trace is a failing test.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    import pytest
from rotaris_core.reqtocode.cli import main, run_check
from rotaris_core.reqtocode.generator import is_up_to_date, parse_requirements

REPO_ROOT = Path(__file__).resolve().parents[3]


@verifies(SWR.SWR_2324)
def test_requirement_sources_parse_without_errors() -> None:
    parsed = parse_requirements(REPO_ROOT)
    assert parsed.errors == [], "\n".join(parsed.errors)
    assert parsed.requirements, "requirement store is empty?"


@verifies(SWR.SWR_2324, SWR.SWR_2328)
def test_generated_traceables_file_is_up_to_date() -> None:
    assert is_up_to_date(REPO_ROOT), (
        "src/rotaris_core/reqtocode/swr.py is stale. Run: python -m rotaris_core.reqtocode check --fix"
    )


@verifies(SWR.SWR_2326, SWR.SWR_2328)
def test_repo_verifier_reports_zero_errors() -> None:
    from rotaris_core.reqtocode.verifier import verify

    result = verify(REPO_ROOT)
    assert result.errors == [], "\n".join(result.errors)


@verifies(SWR.SWR_2328)
def test_cli_check_passes_on_this_repo(capsys: pytest.CaptureFixture[str]) -> None:
    assert run_check(REPO_ROOT) == 0
    out = capsys.readouterr().out
    assert "[reqtocode] OK" in out


@verifies(SWR.SWR_2328)
def test_cli_reports_violations_with_exit_1(tmp_path: Path) -> None:
    folder = tmp_path / "docs" / "requirements"
    folder.mkdir(parents=True)
    (folder / "SWR-101-demo.md").write_text(
        '---\nreq-id: SWR-101\nstatus: approved\ntitle: "Demo"\n---\n\nBody.\n',
        encoding="utf-8",
    )
    (tmp_path / "src").mkdir()
    assert main(["--repo-root", str(tmp_path), "check", "--fix"]) == 1


@verifies(SWR.SWR_2328)
def test_cli_internal_error_exits_2(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import rotaris_core.reqtocode.cli as cli_module

    def _boom(*args: object, **kwargs: object) -> int:
        raise RuntimeError("boom")

    monkeypatch.setattr(cli_module, "run_check", _boom)
    assert cli_module.main(["--repo-root", str(tmp_path), "check"]) == 2
