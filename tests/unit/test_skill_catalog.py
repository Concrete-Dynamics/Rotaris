from __future__ import annotations

import json
from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.skills import (
    add_manual_skill,
    clear_skill_catalog_cache,
    format_skill_catalog,
    get_skill_catalog,
)
from rotaris_core.skills.catalog import normalize_skill_name, parse_skill_file


@pytest.fixture(autouse=True)
def _clear_cache() -> None:
    clear_skill_catalog_cache()
    yield
    clear_skill_catalog_cache()


def _write_skill(directory: Path, name: str, description: str, extra: str = "") -> Path:
    directory.mkdir(parents=True)
    skill_file = directory / "SKILL.md"
    skill_file.write_text(
        f"---\nname: {name}\ndescription: {description}\n{extra}---\n\nbody\n",
        encoding="utf-8",
    )
    return skill_file


@verifies(SWR.SWR_421)
def test_normalize_skill_name() -> None:
    assert normalize_skill_name("Code Review!") == "code-review"


@verifies(SWR.SWR_422, SWR.SWR_423, SWR.SWR_438)
def test_parse_skill_file_normalizes_legacy_trigger_alias(tmp_path: Path) -> None:
    skill_file = _write_skill(
        tmp_path / "review",
        "Reviewer",
        "Review pull requests.",
        'type: keyword\ntriggers: ["/review", "review"]\n',
    )

    meta = parse_skill_file(skill_file, source_scope="project")

    assert meta.normalized_name == "reviewer"
    assert meta.trigger_keywords == ("/review", "review")
    assert meta.raw_metadata["type"] == "keyword"


@verifies(SWR.SWR_424, SWR.SWR_438)
def test_parse_skill_file_rejects_missing_description(tmp_path: Path) -> None:
    skill_file = tmp_path / "SKILL.md"
    skill_file.write_text("---\nname: Missing Description\n---\n\nbody\n", encoding="utf-8")

    with pytest.raises(ValueError, match="description"):
        parse_skill_file(skill_file, source_scope="manual")


@verifies(SWR.SWR_424)
def test_parse_skill_file_rejects_unsupported_trigger_shape(tmp_path: Path) -> None:
    skill_file = _write_skill(
        tmp_path / "bad",
        "Bad",
        "Bad trigger.",
        "trigger: always\n",
    )

    with pytest.raises(ValueError, match="trigger"):
        parse_skill_file(skill_file, source_scope="project")


@verifies(SWR.SWR_418, SWR.SWR_421, SWR.SWR_437)
def test_discovery_priority_and_name_collision(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    home = tmp_path / "home"
    workspace = tmp_path / "workspace"
    monkeypatch.setattr(Path, "home", lambda: home)

    _write_skill(home / ".openhands" / "skills" / "installed" / "dupe", "Dupe", "OpenHands")
    _write_skill(home / ".config" / "opencode" / "skills" / "dupe", "Dupe", "User")
    _write_skill(workspace / ".opencode" / "skills" / "dupe", "Dupe", "Project opencode")
    _write_skill(workspace / ".agents" / "skills" / "dupe", "Dupe", "Project agents")

    catalog = get_skill_catalog(workspace)

    assert catalog.skills["dupe"].description == "Project agents"
    assert catalog.skills["dupe"].source_scope == "project"


@verifies(SWR.SWR_419)
def test_discovery_includes_codex_user_skills(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    home = tmp_path / "home"
    workspace = tmp_path / "workspace"
    monkeypatch.setattr(Path, "home", lambda: home)
    _write_skill(home / ".agents" / "skills" / "caveman", "caveman", "Talk tersely")

    catalog = get_skill_catalog(workspace)

    assert (
        catalog.skills["caveman"].skill_file
        == (home / ".agents" / "skills" / "caveman" / "SKILL.md").resolve()
    )
    assert catalog.skills["caveman"].source_scope == "user"


@verifies(SWR.SWR_420)
def test_openhands_disabled_installed_skill_is_skipped(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    home = tmp_path / "home"
    workspace = tmp_path / "workspace"
    monkeypatch.setattr(Path, "home", lambda: home)
    _write_skill(home / ".openhands" / "skills" / "installed" / "skip-me", "Skip Me", "Skip")
    manifest = home / ".openhands" / "skills" / ".installed.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps({"disabled": ["skip-me"]}), encoding="utf-8")

    catalog = get_skill_catalog(workspace)

    assert catalog.skills == {}


@verifies(SWR.SWR_432)
def test_manual_skill_overrides_discovered_skill(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    _write_skill(workspace / ".agents" / "skills" / "dupe", "Dupe", "Discovered")
    manual = _write_skill(tmp_path / "manual", "Dupe", "Manual")

    meta = add_manual_skill(workspace, manual)

    catalog = get_skill_catalog(workspace)
    assert meta.source_scope == "manual"
    assert catalog.skills["dupe"].description == "Manual"


@verifies(SWR.SWR_432)
def test_manual_skill_relative_path_resolves_from_workspace(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    manual = _write_skill(workspace / "skills" / "manual", "Manual", "Manual skill")

    meta = add_manual_skill(workspace, "skills/manual")

    assert meta.skill_file == manual.resolve()


@verifies(SWR.SWR_425, SWR.SWR_426, SWR.SWR_430, SWR.SWR_435)
def test_format_skill_catalog_omits_body(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    _write_skill(workspace / ".agents" / "skills" / "demo", "Demo", "Use demo")

    rendered = format_skill_catalog(get_skill_catalog(workspace))

    assert "Demo: Use demo" in rendered
    assert "\nbody\n" not in rendered


@verifies(SWR.SWR_434)
def test_discovery_warns_and_skips_malformed_skill_without_aborting(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Productive use: one broken SKILL.md never costs the user their whole catalog.
    Expected outcome: discovery logs a warning for the bad entry and returns the good ones."""
    home = tmp_path / "home"
    workspace = tmp_path / "workspace"
    monkeypatch.setattr(Path, "home", lambda: home)

    _write_skill(workspace / ".agents" / "skills" / "good", "Good", "Usable skill.")
    broken = workspace / ".agents" / "skills" / "broken"
    broken.mkdir(parents=True)
    (broken / "SKILL.md").write_text("---\nname: Broken\n---\n\nbody\n", encoding="utf-8")

    with caplog.at_level("WARNING"):
        catalog = get_skill_catalog(workspace)

    assert "good" in catalog.skills
    assert "broken" not in catalog.skills
    assert any("Skipping invalid SKILL.md" in record.message for record in caplog.records)
