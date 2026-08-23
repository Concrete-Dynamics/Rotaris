"""Secret redaction: credential values never reach logs, errors or diagnostics.

SWR-3719 AC-004: tokens, API keys, refresh tokens and equivalent secrets must
not be written to normal logs, diagnostics exports or UI error messages. The
redaction ladder, the event-stream alias and the UI mask are the three surfaces
a stored credential could leak through — each is exercised with a real secret
value."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from rotaris_core.auth.provider_settings import mask_secret
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.events.schema import redact_text
from rotaris_core.hooks.payload import redact_payload
from rotaris_core.permissions.approval import redact_secrets
from rotaris_core.reqtocode import SWR, verifies

if TYPE_CHECKING:
    from pathlib import Path

    import pytest

_SECRETS = ("ghp_abc123secret", "sk-9f8e7d6c5b4a3210", "eyJhbGciOiJIUzI1NiJ9.part2.part3")


@verifies(SWR.SWR_3719)
def test_the_redaction_ladder_masks_known_token_shapes() -> None:
    """Every recognised secret shape is masked, whatever text surrounds it."""
    for secret in _SECRETS:
        for text in (
            f"Authorization: Bearer {secret}",
            f"api_key={secret}",
            f"--token {secret}",
            f"plain word {secret} trailing",
        ):
            redacted = redact_secrets(text)
            assert secret not in redacted, text


@verifies(SWR.SWR_3719)
def test_the_event_stream_alias_uses_the_same_ladder() -> None:
    """The event stream's redaction is the ladder itself, not a second rule."""
    secret = "sk-9f8e7d6c5b4a3210"

    assert redact_text(f"X-API-Key: {secret}") == redact_secrets(f"X-API-Key: {secret}")
    assert secret not in redact_text(f"X-API-Key: {secret}")


@verifies(SWR.SWR_3719)
def test_hook_payloads_redact_secret_keys_and_values() -> None:
    """A hook command that happens to carry credentials is masked in its payload."""
    secret = "ghp_abc123secret"

    payload = redact_payload(
        {"command": ["curl", "-H", f"Authorization: Bearer {secret}"], "env": {"TOKEN": secret}}
    )

    rendered = str(payload)
    assert secret not in rendered


@verifies(SWR.SWR_3719)
def test_storage_logs_never_contain_the_credential(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    """A corrupt token file is logged by provider id, never by its contents."""
    storage = TokenStorage(token_dir=tmp_path)
    corrupt = tmp_path / "broken.json"
    corrupt.write_text("super-secret-value !!!", encoding="utf-8")

    with caplog.at_level(logging.WARNING, logger="rotaris_core.auth.storage"):
        assert storage.load("broken") is None

    assert "super-secret-value" not in caplog.text
    assert "broken" in caplog.text


@verifies(SWR.SWR_3719)
def test_the_ui_mask_keeps_only_the_first_and_last_characters() -> None:
    """UI error surfaces may name a credential's type, never its value."""
    secret = "sk-9f8e7d6c5b4a3210"

    masked = mask_secret(secret)

    assert masked is not None
    assert secret not in masked
    assert masked == "sk****10"
    assert mask_secret("abcd") == "****"
    assert mask_secret(None) is None
