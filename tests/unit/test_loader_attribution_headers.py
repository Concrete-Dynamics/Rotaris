"""Regression test: every Copilot-routed LLM carries the editor-integration headers.

GitHub Copilot's backend rejects requests that do not look like they originate
from a known editor integration. Rotaris must therefore pass the same
``Copilot-Integration-Id`` / ``Editor-Version`` / ``Editor-Plugin-Version`` /
``OpenAI-Intent`` / ``User-Agent`` headers that the official VS Code Copilot
Chat client sends. These are defined once in
:data:`rotaris_core.auth.copilot_token.COPILOT_INTEGRATION_HEADERS` and must
propagate, unchanged, through the loader's LLM construction path so that
LiteLLM forwards them on every chat-completion request.

This test guards against silent regressions where someone refactors the loader
and drops or mutates the attribution headers — a class of bug that surfaces
only as opaque 4xx responses from the Copilot API.
"""

from __future__ import annotations

import json
import time
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pathlib import Path

from rotaris_core.auth.copilot_token import COPILOT_INTEGRATION_HEADERS
from rotaris_core.config import loader
from rotaris_core.config.project_snapshot import (
    ProjectSnapshot,
    SnapshotModel,
    SnapshotProvider,
    write_snapshot,
)
from rotaris_core.reqtocode import SWR, verifies


def _stage_fake_copilot_tokens(workspace_root: Path) -> None:
    """Pre-stage a non-expired Copilot token cache so LLM construction does not
    block on LiteLLM's interactive device-flow authenticator.
    """
    token_dir = workspace_root / ".rotaris" / "litellm_cache"
    token_dir.mkdir(parents=True, exist_ok=True)
    (token_dir / "access-token").write_text("ghu_fake_refresh", encoding="utf-8")
    (token_dir / "api-key.json").write_text(
        json.dumps(
            {
                "token": "tid=fake-bearer",
                "expires_at": int(time.time()) + 3600,
                "endpoints": {"api": "https://api.githubcopilot.com"},
            },
        ),
        encoding="utf-8",
    )


@verifies(SWR.SWR_701)
def test_copilot_llm_carries_all_editor_integration_headers(
    tmp_path: Path,
    monkeypatch: Any,
) -> None:
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", tmp_path)
    _stage_fake_copilot_tokens(tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": SnapshotProvider(
                    id="copilot",
                    display_name="copilot",
                    authenticated=True,
                    models=[
                        SnapshotModel(
                            id="copilot/gpt-5",
                            display_name="copilot/gpt-5",
                            limits={},
                            discovered_at="2026-05-11T00:00:00+00:00",
                        ),
                    ],
                    discovered_at="2026-05-11T00:00:00+00:00",
                ),
            },
        ),
        base=tmp_path,
    )

    config = loader.load_config(tmp_path)
    llm = loader.load_llm_for_model(config, "copilot/gpt-5")

    assert llm.extra_headers is not None
    # Every header defined in the canonical constant must appear with the
    # exact value — substring / prefix matching is not enough since the
    # Copilot backend is known to reject malformed attribution.
    for header, expected_value in COPILOT_INTEGRATION_HEADERS.items():
        assert llm.extra_headers.get(header) == expected_value, (
            f"missing or mutated attribution header {header!r}: "
            f"expected {expected_value!r}, got {llm.extra_headers.get(header)!r}"
        )


@verifies(SWR.SWR_701)
def test_copilot_llm_extra_headers_are_a_plain_dict_copy(tmp_path: Path, monkeypatch: Any) -> None:
    """The loader must hand LiteLLM a *copy* of the canonical headers, not the
    module-level singleton — otherwise a downstream caller mutating
    ``llm.extra_headers`` would poison every subsequent Copilot LLM.
    """
    monkeypatch.setattr(loader, "GLOBAL_CONFIG_DIR", tmp_path)
    _stage_fake_copilot_tokens(tmp_path)
    write_snapshot(
        ProjectSnapshot(
            providers={
                "copilot": SnapshotProvider(
                    id="copilot",
                    display_name="copilot",
                    authenticated=True,
                    models=[
                        SnapshotModel(
                            id="copilot/gpt-5",
                            display_name="copilot/gpt-5",
                            limits={},
                            discovered_at="2026-05-11T00:00:00+00:00",
                        ),
                    ],
                    discovered_at="2026-05-11T00:00:00+00:00",
                ),
            },
        ),
        base=tmp_path,
    )

    config = loader.load_config(tmp_path)
    llm = loader.load_llm_for_model(config, "copilot/gpt-5")

    assert llm.extra_headers is not COPILOT_INTEGRATION_HEADERS
    # Sanity check the defensive-copy assertion: mutating the LLM's headers
    # must not bleed back into the canonical mapping.
    assert llm.extra_headers is not None
    before = dict(COPILOT_INTEGRATION_HEADERS)
    llm.extra_headers["X-Test-Mutation"] = "should-not-leak"
    assert dict(COPILOT_INTEGRATION_HEADERS) == before
