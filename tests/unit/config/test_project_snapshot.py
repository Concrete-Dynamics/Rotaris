from __future__ import annotations

import os
import re
from datetime import UTC, datetime
from typing import TYPE_CHECKING

import pytest

from rotaris_core.config.project_snapshot import (
    ProjectSnapshot,
    SnapshotModel,
    SnapshotProvider,
    _assert_no_secrets,
    read_snapshot,
    remove_provider,
    snapshot_path,
    update_provider,
    write_snapshot,
)
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


def _sample_snapshot() -> ProjectSnapshot:
    return ProjectSnapshot(
        providers={
            "copilot": SnapshotProvider(
                id="copilot",
                display_name="GitHub Copilot",
                authenticated=True,
                discovered_at="2026-05-11T00:00:00+00:00",
                large_model="gpt-4o",
                medium_model="gpt-4o-mini",
                small_model="gpt-4o-mini",
                models=[
                    SnapshotModel(
                        id="gpt-4o",
                        display_name="GPT 4o",
                        capabilities={"vision": True},
                        limits={"max_input_tokens": 128000},
                        discovered_at="2026-05-11T00:00:00+00:00",
                    ),
                    SnapshotModel(
                        id="gpt-4o-mini",
                        display_name=None,
                        capabilities={},
                        limits={"max_input_tokens": 64000},
                        discovered_at="2026-05-11T00:00:00+00:00",
                    ),
                ],
            ),
            "codex": SnapshotProvider(
                id="codex",
                display_name="OpenAI Codex",
                authenticated=False,
                discovered_at="2026-05-11T00:01:00+00:00",
                models=[
                    SnapshotModel(
                        id="codex-mini",
                        display_name="Codex Mini",
                        capabilities={"reasoning": "light"},
                        limits={"max_output_tokens": 8192},
                        discovered_at="2026-05-11T00:01:00+00:00",
                    ),
                ],
            ),
        },
    )


@verifies(SWR.SWR_1734)
def test_snapshot_path_returns_workspace_settings_file(tmp_path: Path) -> None:
    assert snapshot_path(tmp_path) == tmp_path / "project_settings.yaml"


@verifies(SWR.SWR_1734)
def test_snapshot_timestamp_is_iso_8601_roundtrippable() -> None:
    value = _iso_now()

    parsed = datetime.fromisoformat(value)

    assert parsed.tzinfo == UTC


@verifies(SWR.SWR_1734)
def test_write_and_read_snapshot_roundtrip(tmp_path: Path) -> None:
    snapshot = _sample_snapshot()

    path = write_snapshot(snapshot, base=tmp_path)
    loaded = read_snapshot(tmp_path)

    assert path == snapshot_path(tmp_path)
    assert loaded == snapshot


@verifies(SWR.SWR_782)
def test_snapshot_allows_public_model_token_price_metadata(tmp_path: Path) -> None:
    """Productive use: an authenticated Cloud model retains its public token prices.
    Expected outcome: price metadata survives the secret guard without allowing credentials.
    """
    snapshot = ProjectSnapshot(
        providers={
            "concrete-cloud": SnapshotProvider(
                id="concrete-cloud",
                display_name="Rotaris Cloud",
                authenticated=True,
                discovered_at="2026-08-23T00:00:00+00:00",
                models=[
                    SnapshotModel(
                        id="concrete-cloud/openai/gpt-5-mini",
                        pricing={"input_cost_per_token": 0.00000025},
                        discovered_at="2026-08-23T00:00:00+00:00",
                    ),
                ],
            ),
        },
    )

    write_snapshot(snapshot, base=tmp_path)

    loaded = read_snapshot(tmp_path)
    assert loaded is not None
    assert loaded.providers["concrete-cloud"].models[0].pricing == {
        "input_cost_per_token": 0.00000025
    }


@verifies(SWR.SWR_1734)
def test_read_snapshot_defaults_missing_tier_aliases_to_none(tmp_path: Path) -> None:
    path = snapshot_path(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        """version: 1
providers:
  copilot:
    id: copilot
    display_name: GitHub Copilot
    authenticated: true
    models: []
    discovered_at: '2026-05-11T00:00:00+00:00'
""",
        encoding="utf-8",
    )

    snapshot = read_snapshot(tmp_path)

    assert snapshot is not None
    assert snapshot.providers["copilot"].large_model is None
    assert snapshot.providers["copilot"].medium_model is None
    assert snapshot.providers["copilot"].small_model is None


@verifies(SWR.SWR_1734)
def test_write_snapshot_uses_atomic_write_without_tmp_leftovers(tmp_path: Path) -> None:
    write_snapshot(_sample_snapshot(), base=tmp_path)

    leftovers = list(tmp_path.glob(".project_settings.yaml.*"))

    assert leftovers == []


@verifies(SWR.SWR_1734)
@pytest.mark.skipif(os.name == "nt", reason="Windows does not preserve POSIX 0644 mode bits")
def test_write_snapshot_sets_0644_permissions(tmp_path: Path) -> None:
    path = write_snapshot(_sample_snapshot(), base=tmp_path)

    assert oct(path.stat().st_mode & 0o777) == "0o644"


@verifies(SWR.SWR_1734)
def test_write_snapshot_creates_parent_directory(tmp_path: Path) -> None:
    workspace_root = tmp_path / "workspace"

    path = write_snapshot(_sample_snapshot(), base=workspace_root)

    assert path.exists()
    assert path.parent == workspace_root


@verifies(SWR.SWR_1734)
def test_read_snapshot_missing_file_returns_none(tmp_path: Path) -> None:
    assert read_snapshot(tmp_path) is None


@verifies(SWR.SWR_1734)
def test_read_snapshot_reuses_parse_but_hands_out_independent_copies(tmp_path: Path) -> None:
    write_snapshot(_sample_snapshot(), base=tmp_path)

    first = read_snapshot(tmp_path)
    second = read_snapshot(tmp_path)

    assert first is not None
    assert second is not None
    assert first is not second
    assert first == second

    first.providers.clear()

    assert read_snapshot(tmp_path) == second


@verifies(SWR.SWR_1734)
def test_read_snapshot_sees_writes_through_this_module(tmp_path: Path) -> None:
    write_snapshot(_sample_snapshot(), base=tmp_path)
    read_snapshot(tmp_path)

    removed = next(iter(_sample_snapshot().providers))
    remove_provider(removed, base=tmp_path)
    reloaded = read_snapshot(tmp_path)

    assert reloaded is not None
    assert removed not in reloaded.providers


@verifies(SWR.SWR_1734)
def test_read_snapshot_returns_none_after_file_is_deleted(tmp_path: Path) -> None:
    write_snapshot(_sample_snapshot(), base=tmp_path)
    assert read_snapshot(tmp_path) is not None

    snapshot_path(tmp_path).unlink()

    assert read_snapshot(tmp_path) is None


@verifies(SWR.SWR_1734)
def test_read_snapshot_invalid_yaml_raises_value_error_with_path(tmp_path: Path) -> None:
    path = snapshot_path(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("providers: [unclosed", encoding="utf-8")

    with pytest.raises(ValueError, match=re.escape(str(path))):
        read_snapshot(tmp_path)


@verifies(SWR.SWR_1734)
def test_read_snapshot_schema_mismatch_raises_value_error(tmp_path: Path) -> None:
    path = snapshot_path(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        """version: 999
providers:
  copilot:
    id: copilot
    display_name: GitHub Copilot
    authenticated: true
    discovered_at: '2026-05-11T00:00:00+00:00'
    models: []
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match=re.escape(str(path))):
        read_snapshot(tmp_path)


@verifies(SWR.SWR_1734)
def test_read_snapshot_malformed_providers_raises_value_error(tmp_path: Path) -> None:
    path = snapshot_path(tmp_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        """version: 1
providers:
  copilot:
    id: copilot
    display_name: GitHub Copilot
    authenticated: yes
    discovered_at: '2026-05-11T00:00:00+00:00'
    models:
      - id: gpt-4o
        display_name: GPT 4o
        capabilities: {}
        limits: {}
        discovered_at: '2026-05-11T00:00:00+00:00'
  codex: not-a-provider
""",
        encoding="utf-8",
    )

    with pytest.raises(ValueError, match=re.escape(str(path))):
        read_snapshot(tmp_path)


@verifies(SWR.SWR_1734)
def test_update_provider_adds_new_provider_preserves_others(tmp_path: Path) -> None:
    existing = _sample_snapshot()
    write_snapshot(existing, base=tmp_path)
    new_provider = SnapshotProvider(
        id="new-provider",
        display_name="New Provider",
        authenticated=True,
        discovered_at="2026-05-11T00:02:00+00:00",
        models=[],
    )

    merged = update_provider(new_provider, base=tmp_path)

    assert set(merged.providers) == {"copilot", "codex", "new-provider"}
    assert merged.providers["copilot"] == existing.providers["copilot"]


@verifies(SWR.SWR_1734)
def test_update_provider_replaces_existing_provider_by_id(tmp_path: Path) -> None:
    write_snapshot(_sample_snapshot(), base=tmp_path)
    replacement = SnapshotProvider(
        id="copilot",
        display_name="GitHub Copilot Updated",
        authenticated=False,
        discovered_at="2026-05-11T00:03:00+00:00",
        models=[
            SnapshotModel(
                id="gpt-5",
                display_name="GPT 5",
                capabilities={"reasoning": "high"},
                limits={"max_output_tokens": 16384},
                discovered_at="2026-05-11T00:03:00+00:00",
            ),
        ],
    )

    merged = update_provider(replacement, base=tmp_path)

    assert merged.providers["copilot"] == replacement
    assert set(merged.providers) == {"copilot", "codex"}


@verifies(SWR.SWR_1734)
def test_remove_provider_deletes_existing_provider(tmp_path: Path) -> None:
    write_snapshot(_sample_snapshot(), base=tmp_path)

    removed = remove_provider("copilot", base=tmp_path)

    assert removed is True
    snapshot = read_snapshot(tmp_path)
    assert snapshot is not None
    assert set(snapshot.providers) == {"codex"}


@verifies(SWR.SWR_1734)
def test_remove_provider_returns_false_when_provider_missing(tmp_path: Path) -> None:
    write_snapshot(_sample_snapshot(), base=tmp_path)

    removed = remove_provider("missing", base=tmp_path)

    assert removed is False


@verifies(SWR.SWR_1734)
def test_secret_scrubbing_rejects_secret_like_key_name() -> None:
    with pytest.raises(
        ValueError,
        match=r"Refusing to write snapshot: secret-like field detected: providers\.copilot\.token",
    ):
        _assert_no_secrets({"providers": {"copilot": {"token": "ghu_abc123"}}})


@verifies(SWR.SWR_1734)
@pytest.mark.parametrize("key", ["Authorization", "auth", "bearer"])
def test_secret_scrubbing_rejects_auth_like_key_names(key: str) -> None:
    with pytest.raises(ValueError, match="secret-like field detected"):
        _assert_no_secrets({"providers": {"copilot": {key: "not persisted"}}})


@verifies(SWR.SWR_1734)
@pytest.mark.parametrize(
    "value",
    [
        "Bearer ghu_xxx",
        "ghu_xxx",
        "gho_xxx",
        "sk-proj-test",
        "Iv1.exampletoken",
        "eyJhbGciOiJub25lIn0",
    ],
)
def test_secret_scrubbing_rejects_common_token_value_patterns(value: str) -> None:
    with pytest.raises(ValueError, match="secret-like field detected"):
        _assert_no_secrets({"providers": {"copilot": {"capabilities": {"notes": value}}}})


@verifies(SWR.SWR_1734)
def test_secret_scrubbing_rejects_nested_token_like_value() -> None:
    with pytest.raises(
        ValueError,
        match=(
            r"Refusing to write snapshot: secret-like field detected: "
            r"providers\.copilot\.capabilities\.api_key"
        ),
    ):
        _assert_no_secrets(
            {
                "providers": {
                    "copilot": {"capabilities": {"api_key": "sk-proj-abcdef1234567890XYZ"}}
                }
            },
        )


@verifies(SWR.SWR_1734)
def test_secret_scrubbing_allows_benign_snapshot_content(tmp_path: Path) -> None:
    snapshot = ProjectSnapshot(
        providers={
            "copilot": SnapshotProvider(
                id="copilot",
                display_name="GPT 4o",
                authenticated=True,
                discovered_at="2026-05-11T00:04:00+00:00",
                models=[
                    SnapshotModel(
                        id="gpt-4o",
                        display_name="GPT 4o",
                        capabilities={"vision": True},
                        limits={"max_input_tokens": 128000, "max_output_tokens": 16384},
                        discovered_at="2026-05-11T00:04:00+00:00",
                    ),
                ],
            ),
        },
    )

    path = write_snapshot(snapshot, base=tmp_path)

    assert path.exists()
    assert read_snapshot(tmp_path) == snapshot


@verifies(SWR.SWR_1734)
def test_secret_scrubbing_rejects_token_prefix_in_model_capabilities(tmp_path: Path) -> None:
    snapshot = ProjectSnapshot(
        providers={
            "codex": SnapshotProvider(
                id="codex",
                display_name="OpenAI Codex",
                authenticated=True,
                discovered_at="2026-05-11T00:05:00+00:00",
                models=[
                    SnapshotModel(
                        id="codex-mini",
                        display_name="Codex Mini",
                        capabilities={"notes": "sk-proj-abcdef1234567890XYZ"},
                        limits={},
                        discovered_at="2026-05-11T00:05:00+00:00",
                    ),
                ],
            ),
        },
    )

    with pytest.raises(
        ValueError,
        match=r"secret-like field detected: providers\.codex\.models\.0\.capabilities\.notes",
    ):
        write_snapshot(snapshot, base=tmp_path)
