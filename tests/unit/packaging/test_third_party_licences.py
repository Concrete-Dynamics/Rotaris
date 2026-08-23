"""Productive use: a maintainer generates the third-party notice bundle for a release.
Expected outcome: Python distributions, the bundled fonts/icons and the tools Rotaris
downloads after installation appear in one inventory, with their licence text; and a
component whose licence cannot be identified is reported instead of silently passed."""

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
    """The generator as a module — ``packaging/`` is a build-tool dir, not a package."""
    spec = spec_from_file_location("rotaris_third_party_licences", _SCRIPT)
    assert spec.loader is not None
    module = module_from_spec(spec)
    sys.modules[spec.name] = module  # dataclasses look the module up during exec
    spec.loader.exec_module(module)
    yield module


class _FakeMeta(dict[str, str]):
    """A metadata mapping with the one extra method ``_declared_licence`` calls."""

    def get_all(self, key: str) -> list[str] | None:
        return None


class FakeDist:
    """Stands in for ``importlib.metadata.Distribution`` for one package."""

    def __init__(self, name: str, *, version: str = "1.0", declared: str | None = "MIT") -> None:
        self.metadata = _FakeMeta({"Name": name})
        if declared is not None:
            self.metadata["License-Expression"] = declared
        self.version = version
        self.files: tuple[str, ...] | None = None


@verifies(SWR.SWR_3720)
def test_every_bundled_asset_names_its_licence_text(tpl: ModuleType) -> None:
    """The four shipped fonts/icon sets must carry the notice text that travels
    with the artifact — a table entry without a readable file is a release error."""
    names = {asset.name for asset in tpl.BUNDLED_ASSETS}

    assert names == {"JetBrains Mono", "Manrope", "Space Grotesk", "Phosphor Icons"}

    for asset in tpl.BUNDLED_ASSETS:
        assert asset.licence_file.is_file(), asset.name
        assert asset.licence_file.read_text(encoding="utf-8").strip(), asset.name


@verifies(SWR.SWR_3720)
def test_build_renders_distributions_assets_and_provisioned_tools(
    tpl: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    """One inventory holds Python packages, bundled non-Python assets and the
    provisioned tools, each section clearly separated from the others."""
    monkeypatch.setattr(tpl, "_runtime_distributions", lambda: {"acme-lib"})
    monkeypatch.setattr(
        tpl.metadata,
        "distributions",
        lambda: [FakeDist("acme-lib", declared="MIT")],
    )
    monkeypatch.setattr(
        tpl,
        "_provisioned_tools",
        lambda: [
            tpl.ProvisionedTool("git", "2.55.0", "https://example.org/git.zip", "GPL-2.0-only")
        ],
    )

    text, problems = tpl.build("1.2.3")

    assert problems == []
    assert "acme-lib 1.0" in text
    assert "Licence: MIT" in text
    assert "JetBrains Mono (font)" in text
    assert "Phosphor Icons (icon font)" in text
    assert "git 2.55.0" in text
    assert "Provisioned after installation — not bundled in the installer" in text


@verifies(SWR.SWR_3720)
def test_a_bundled_asset_without_notice_text_fails_the_build(
    tpl: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    """A shipped component whose required notice text is missing blocks the
    release check rather than shipping silently (AC-003)."""
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

    _, problems = tpl.build("1.2.3")

    assert any("Demo Asset" in problem for problem in problems)


@verifies(SWR.SWR_3720)
def test_an_empty_licence_file_fails_the_build(
    tpl: ModuleType, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    empty = tmp_path / "LICENSE.txt"
    empty.write_text("   \n", encoding="utf-8")

    problems = tpl._bundled_asset_problems(
        (tpl.BundledAsset("Demo Asset", "font", "https://example.org", "OFL-1.1", empty),)
    )

    assert any("empty" in problem for problem in problems)


@verifies(SWR.SWR_3720)
def test_an_unreviewed_distribution_without_licence_fails_the_build(
    tpl: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    """No licence declaration and no shipped text, and not on the review table:
    the package is named so a maintainer can resolve it before the release."""
    monkeypatch.setattr(tpl, "_runtime_distributions", lambda: {"mystery-lib"})
    monkeypatch.setattr(
        tpl.metadata, "distributions", lambda: [FakeDist("mystery-lib", declared=None)]
    )
    monkeypatch.setattr(tpl, "_provisioned_tools", lambda: [])

    text, problems = tpl.build("1.2.3")

    assert any("mystery-lib 1.0" in problem for problem in problems)
    assert "mystery-lib" in text, "the inventory still lists the package it flags"


@verifies(SWR.SWR_3720)
def test_a_reviewed_distribution_is_classified_not_blocked(
    tpl: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The documented licence-review rule (AC-003) resolves a wheel whose metadata
    declares nothing: the classification and its provenance land in the inventory."""
    monkeypatch.setattr(tpl, "_runtime_distributions", lambda: {"lmnr-claude-code-proxy"})
    monkeypatch.setattr(
        tpl.metadata,
        "distributions",
        lambda: [FakeDist("lmnr-claude-code-proxy", declared=None)],
    )
    monkeypatch.setattr(tpl, "_provisioned_tools", lambda: [])

    text, problems = tpl.build("1.2.3")

    assert problems == []
    assert "Apache-2.0" in text
    assert "Rotaris licence review" in text


@verifies(SWR.SWR_3720)
def test_the_product_and_dev_only_names_do_not_enter_the_inventory(
    tpl: ModuleType,
) -> None:
    """``uv export --no-dev`` already excludes dev/CI packages; the parse only has
    to drop the two product packages and extras/markers."""
    report = "\n".join(
        [
            "# comment",
            "-e .",
            "ruff==0.9.0 ; sys_platform == 'win32'",
            "pytest-qt[dev]==4.5.0",
            "Rotaris==0.120.10",
            "rotaris-core==0.120.10",
        ]
    )

    names = tpl._parse_uv_export(report)

    assert names == {"ruff", "pytest-qt"}


@verifies(SWR.SWR_3720)
def test_provisioned_tools_come_from_the_setup_manifest(tpl: ModuleType) -> None:
    """The tools SWR-3715 downloads are recorded with name, version, source and
    licence identifier, straight from the pinned manifest — not a hand copy."""
    tools = tpl._provisioned_tools()

    assert tools is not None
    by_name = {tool.name: tool for tool in tools}
    assert {"git", "node", "ripgrep"} <= set(by_name)
    for tool in tools:
        assert tool.version
        assert tool.source_url.startswith("https://")
        assert tool.licence_id


@verifies(SWR.SWR_3720)
def test_an_unimportable_provisioned_manifest_is_reported(
    tpl: ModuleType, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The disclosure section must not disappear silently when the manifest cannot
    be read — the missing section is itself a release problem."""
    import sys

    monkeypatch.setitem(sys.modules, "rotaris_core.setup.manifest", None)

    sections, problems = tpl._provisioned_sections()

    assert any("could not be imported" in problem for problem in problems)
    assert sections == [tpl._PROVISIONED_HEADER]
