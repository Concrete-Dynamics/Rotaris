"""Productive use: the release pipeline runs the notice generator and refuses to
ship when an inventory entry cannot be licensed.
Expected outcome: a clean build writes the bundle into the desktop assets and exits 0;
any problem — an unreviewed package, a missing asset licence — exits 1 with each entry
named on stderr."""

from __future__ import annotations

import sys
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from collections.abc import Iterator
    from types import ModuleType

_SCRIPT = Path(__file__).resolve().parents[3] / "packaging" / "third_party_licences.py"


@pytest.fixture
def tpl() -> Iterator[ModuleType]:
    spec = spec_from_file_location("rotaris_third_party_licences", _SCRIPT)
    assert spec.loader is not None
    module = module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses look the module up during exec
    spec.loader.exec_module(module)
    yield module


def _run(tpl: ModuleType, output: Path, monkeypatch: pytest.MonkeyPatch) -> int:
    monkeypatch.setattr("sys.argv", ["third_party_licences.py", "-o", str(output)])
    return tpl.main()


@verifies(SWR.SWR_3720)
def test_the_default_output_lands_inside_the_bundled_assets(
    tpl: ModuleType,
) -> None:
    """AC-006: the file must live where PyInstaller's data walk picks it up, so the
    default destination is the desktop package's assets directory."""
    default = tpl._DESKTOP_ASSETS / "THIRD-PARTY-LICENSES.txt"

    assert (
        default
        == tpl._ROOT
        / "apps"
        / "rotaris"
        / "src"
        / "rotaris"
        / "assets"
        / "THIRD-PARTY-LICENSES.txt"
    )


@verifies(SWR.SWR_3720)
def test_a_clean_build_writes_the_bundle_and_exits_zero(
    tpl: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(tpl, "build", lambda version: ("notice text\n", []))

    exit_code = _run(tpl, tmp_path / "THIRD-PARTY-LICENSES.txt", monkeypatch)

    assert exit_code == 0
    assert (tmp_path / "THIRD-PARTY-LICENSES.txt").read_text(encoding="utf-8") == "notice text\n"


@verifies(SWR.SWR_3720)
def test_a_problem_names_every_offender_and_exits_one(
    tpl: ModuleType,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """AC-003: the release check fails loudly, naming each component to resolve."""
    monkeypatch.setattr(
        tpl,
        "build",
        lambda version: ("notice text\n", ["mystery-lib 1.0", "Demo Asset: licence file missing"]),
    )

    exit_code = _run(tpl, tmp_path / "out.txt", monkeypatch)

    assert exit_code == 1
    error = capsys.readouterr().err
    assert "RELEASE CHECK FAILED" in error
    assert "mystery-lib 1.0" in error
    assert "Demo Asset" in error


@verifies(SWR.SWR_3720)
def test_a_missing_asset_licence_fails_the_release_check(
    tpl: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """The fixture SWR-3720 AC-003 describes: a shipped component with no notice
    text makes the release validation fail end to end, through ``main()``."""
    monkeypatch.setattr(tpl, "_runtime_distributions", lambda: set())
    monkeypatch.setattr(tpl.metadata, "distributions", lambda: [])
    monkeypatch.setattr(tpl, "_provisioned_tools", lambda: [])
    monkeypatch.setattr(
        tpl,
        "BUNDLED_ASSETS",
        (
            tpl.BundledAsset(
                "Demo Asset", "font", "https://example.org", "OFL-1.1", tmp_path / "gone.txt"
            ),
        ),
    )

    exit_code = _run(tpl, tmp_path / "out.txt", monkeypatch)

    assert exit_code == 1
