"""Claude Code subscription provider (SWR-777).

Runs agent requests through the official Claude Agent SDK authenticated
against a Claude Code subscription (Pro/Max/Team/Enterprise) instead of
API-key/LiteLLM billing. This module holds the provider constants, the
subscription-token validation, the conflicting-credential precheck, and the
static model catalog; the Agent SDK execution path lives in
``claude_code_runtime``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Mapping

    from rotaris_core.providers.discovery import DiscoveredModel

CLAUDE_CODE_PROVIDER_ID = "claude-code"

#: Prefix of subscription OAuth tokens minted by ``claude setup-token``.
SUBSCRIPTION_TOKEN_PREFIX = "sk-ant-oat"

#: Anthropic API-key prefix — presence means the user pasted the wrong secret.
_API_KEY_PREFIX = "sk-ant-api"

#: Environment variables that take precedence over ``CLAUDE_CODE_OAUTH_TOKEN``
#: in Claude Code's credential resolution. If any is set, requests would be
#: billed against the API/gateway instead of the subscription.
CONFLICTING_ENV_VARS: tuple[str, ...] = (
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
    "CLAUDE_CODE_USE_FOUNDRY",
)

SETUP_TOKEN_INSTRUCTIONS = (
    "The Claude Code provider authenticates with a subscription OAuth token.\n"
    "1. Install Claude Code and sign in with the account that owns your\n"
    "   Pro/Max/Team/Enterprise subscription.\n"
    "2. Run 'claude setup-token' in a terminal — it opens a browser\n"
    "   authorization flow and prints a token starting with 'sk-ant-oat'.\n"
    "3. Paste that token here. It is stored locally with 0600 permissions\n"
    "   and never written to workspace files, logs, or session snapshots."
)


class ClaudeCodeCredentialConflictError(RuntimeError):
    """A higher-precedence API/gateway credential would bypass the subscription."""

    def __init__(self, conflicts: tuple[str, ...]) -> None:
        self.conflicts = conflicts
        names = ", ".join(conflicts)
        super().__init__(
            f"Refusing to run the claude-code provider: {names} "
            "take(s) precedence over the subscription token, so requests would "
            "be billed to the Anthropic API/gateway instead of your Claude "
            "subscription. Unset the conflicting variable(s) (e.g. "
            "'unset ANTHROPIC_API_KEY') or remove the apiKeyHelper from "
            "~/.claude/settings.json, then retry.",
        )


@traces(SWR.SWR_777)
def subscription_token_validation_error(token: str) -> str | None:
    """Validate a pasted ``claude setup-token`` value.

    Rejects raw Anthropic API keys so the provider can never silently fall
    back to API-key billing.
    """
    from rotaris_core.auth.api_key import api_key_validation_error

    token = token.strip()
    if not token:
        return "Subscription token is required. Run 'claude setup-token' to mint one."
    header_error = api_key_validation_error(token)
    if header_error is not None:
        return header_error
    if token.startswith(_API_KEY_PREFIX):
        return (
            "This looks like an Anthropic API key, which would bill the API "
            "instead of your Claude subscription. Run 'claude setup-token' and "
            "paste the resulting 'sk-ant-oat...' token instead."
        )
    if not token.startswith(SUBSCRIPTION_TOKEN_PREFIX):
        return (
            "Expected a subscription OAuth token starting with 'sk-ant-oat' "
            "(minted by 'claude setup-token')."
        )
    return None


def _default_claude_settings_path() -> Path:
    return Path.home() / ".claude" / "settings.json"


def _api_key_helper_configured(settings_path: Path) -> bool:
    if not settings_path.is_file():
        return False
    try:
        data = json.loads(settings_path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return False
    return isinstance(data, dict) and bool(data.get("apiKeyHelper"))


@traces(SWR.SWR_777)
def detect_conflicting_credentials(
    env: Mapping[str, str] | None = None,
    *,
    claude_settings_path: Path | None = None,
) -> tuple[str, ...]:
    """Return the higher-precedence credentials present in the environment.

    Checks the documented Claude Code credential precedence chain:
    ``ANTHROPIC_AUTH_TOKEN`` / ``ANTHROPIC_API_KEY`` env vars, the
    Bedrock/Vertex/Foundry gateway switches, and an ``apiKeyHelper`` in
    ``~/.claude/settings.json`` all outrank ``CLAUDE_CODE_OAUTH_TOKEN``.
    """
    if env is None:
        import os

        env = os.environ
    conflicts = [name for name in CONFLICTING_ENV_VARS if env.get(name)]
    settings_path = claude_settings_path or _default_claude_settings_path()
    if _api_key_helper_configured(settings_path):
        conflicts.append("apiKeyHelper (~/.claude/settings.json)")
    return tuple(conflicts)


@traces(SWR.SWR_777)
def ensure_no_conflicting_credentials(
    env: Mapping[str, str] | None = None,
    *,
    claude_settings_path: Path | None = None,
) -> None:
    """Raise :class:`ClaudeCodeCredentialConflictError` on any conflict."""
    conflicts = detect_conflicting_credentials(env, claude_settings_path=claude_settings_path)
    if conflicts:
        raise ClaudeCodeCredentialConflictError(conflicts)


@traces(SWR.SWR_777)
def claude_code_models(*, qualified_provider_id: str | None = None) -> list[DiscoveredModel]:
    """Static model catalog for the subscription provider.

    The Agent SDK has no models endpoint; it accepts the evergreen aliases
    the Claude Code CLI resolves to the subscription's current models.
    """
    from rotaris_core.providers.discovery import DiscoveredModel

    prefix = qualified_provider_id or CLAUDE_CODE_PROVIDER_ID
    aliases = (
        ("opus", "Claude Opus (subscription)"),
        ("sonnet", "Claude Sonnet (subscription)"),
        ("haiku", "Claude Haiku (subscription)"),
    )
    return [
        DiscoveredModel(
            id=alias,
            qualified_id=f"{prefix}/{alias}",
            display_name=display_name,
        )
        for alias, display_name in aliases
    ]
