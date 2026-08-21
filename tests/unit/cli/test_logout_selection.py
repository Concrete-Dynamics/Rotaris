from __future__ import annotations

from datetime import UTC, datetime

from rotaris_core.auth.provider import TokenSet
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.cli import logout_selection
from rotaris_core.config.project_snapshot import ProjectSnapshot, SnapshotProvider, write_snapshot
from rotaris_core.reqtocode import SWR, verifies


def _snapshot_provider(provider_id: str, display_name: str) -> SnapshotProvider:
    timestamp = datetime.now(UTC).isoformat()
    return SnapshotProvider(
        id=provider_id,
        display_name=display_name,
        family="openai-compatible",
        authenticated=True,
        discovered_at=timestamp,
    )


@verifies(SWR.SWR_707)
def test_prompt_menu_returns_selected_provider_after_down_enter() -> None:
    keys = iter(["down", "enter"])
    frames: list[tuple[str, tuple[str, ...], int]] = []

    selected = logout_selection.prompt_for_selection(
        "Choose provider:",
        [("copilot", "GitHub Copilot"), ("codex", "OpenAI Codex")],
        read_key=lambda: next(keys),
        render=lambda title, labels, index: frames.append((title, tuple(labels), index)),
    )

    assert selected == "codex"
    assert frames[0] == ("Choose provider:", ("GitHub Copilot", "OpenAI Codex"), 0)
    assert frames[1] == ("Choose provider:", ("GitHub Copilot", "OpenAI Codex"), 1)


@verifies(SWR.SWR_707)
def test_build_logout_options_only_displays_logged_in_providers(tmp_path) -> None:
    storage = TokenStorage(token_dir=tmp_path / "tokens")
    storage.save("copilot", TokenSet(access_token="cop", refresh_token="cop_r"))
    storage.save(
        "openai-compatible--acme",
        TokenSet(access_token="acme", refresh_token="acme_r"),
    )
    write_snapshot(
        ProjectSnapshot(
            providers={
                "openai-compatible--acme": _snapshot_provider(
                    "openai-compatible--acme",
                    "Acme Local",
                ),
            },
        ),
        base=tmp_path / "snapshot",
    )

    options = logout_selection.build_logout_options(
        storage=storage,
        snapshot_base=tmp_path / "snapshot",
    )

    assert options == [
        ("copilot", "GitHub Copilot"),
        ("openai-compatible--acme", "Acme Local [openai-compatible--acme]"),
    ]
