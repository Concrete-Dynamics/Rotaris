from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal

from rotaris_core.auth.manager import AuthManager
from rotaris_core.auth.storage import TokenStorage
from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)
_OPENAI_INSTANCE_EXAMPLE = "openai-compatible--my-label"

if TYPE_CHECKING:
    from pathlib import Path

    from rotaris_core.auth.provider import TokenSet
    from rotaris_core.config.project_snapshot import ProjectSnapshot


class UnknownLogoutProviderError(ValueError):
    def __init__(self, provider_id: str, *, known_targets: tuple[str, ...]) -> None:
        known = ", ".join(known_targets)
        suffix = f" Known providers: {known}." if known else " Known providers: copilot, codex."
        super().__init__(
            f"Unknown provider: {provider_id!r}.{suffix} "
            f"OpenAI-compatible instances use ids like '{_OPENAI_INSTANCE_EXAMPLE}'.",
        )


@dataclass(frozen=True)
class LogoutResult:
    provider_id: str
    kind: Literal["signed_out", "noop"]
    message: str
    removed_snapshot: bool = False

    @property
    def severity(self) -> Literal["information", "warning"]:
        return "information" if self.kind == "signed_out" else "warning"


def known_logout_targets(*, snapshot_base: Path | None = None) -> tuple[str, ...]:
    from rotaris_core.providers import OPENAI_COMPATIBLE_PROVIDER_ID, is_openai_compatible_instance
    from rotaris_core.providers.catalog import list_providers

    builtin_ids = sorted(
        provider.id for provider in list_providers() if provider.id != OPENAI_COMPATIBLE_PROVIDER_ID
    )
    snapshot = _read_snapshot(snapshot_base)
    openai_instances = (
        []
        if snapshot is None
        else [
            provider_id
            for provider_id in sorted(snapshot.providers)
            if is_openai_compatible_instance(provider_id)
        ]
    )
    return tuple([*builtin_ids, *openai_instances])


@traces(SWR.SWR_714, SWR.SWR_716, SWR.SWR_717, SWR.SWR_722, SWR.SWR_724, SWR.SWR_772, SWR.SWR_781)
def logout_provider(
    provider_id: str,
    *,
    storage: TokenStorage | None = None,
    snapshot_base: Path | None = None,
) -> LogoutResult:
    from rotaris_core.providers import OPENAI_COMPATIBLE_PROVIDER_ID, is_openai_compatible_instance
    from rotaris_core.providers.catalog import list_providers

    normalized = provider_id.strip().lower()
    if not normalized:
        raise UnknownLogoutProviderError(
            normalized,
            known_targets=known_logout_targets(snapshot_base=snapshot_base),
        )

    active_storage = storage or TokenStorage()
    snapshot = _read_snapshot(snapshot_base)
    builtin_ids = {
        provider.id for provider in list_providers() if provider.id != OPENAI_COMPATIBLE_PROVIDER_ID
    }
    has_tokens = active_storage.has_tokens(normalized)
    in_snapshot = snapshot is not None and normalized in snapshot.providers
    openai_instance = is_openai_compatible_instance(normalized)

    if normalized not in builtin_ids and not (openai_instance and (has_tokens or in_snapshot)):
        raise UnknownLogoutProviderError(
            normalized,
            known_targets=known_logout_targets(snapshot_base=snapshot_base),
        )

    if normalized in ("concrete-cloud", "geraet-cloud") and has_tokens:
        _revoke_rotaris_oidc_refresh_token(active_storage.load(normalized))

    AuthManager(storage=active_storage).logout(normalized)
    if has_tokens:
        return LogoutResult(
            provider_id=normalized,
            kind="signed_out",
            message=f"Signed out of {normalized}.",
        )

    return LogoutResult(
        provider_id=normalized,
        kind="noop",
        message=f"No stored tokens for {normalized}; nothing to do.",
    )


def _read_snapshot(base: Path | None) -> ProjectSnapshot | None:
    from rotaris_core.config.project_snapshot import read_snapshot

    try:
        return read_snapshot(base)
    except ValueError:
        return None


def _revoke_rotaris_oidc_refresh_token(token_set: TokenSet | None) -> None:
    """Best-effort standard OIDC refresh-token revocation; errors never block local logout."""
    if token_set is None or not token_set.refresh_token:
        return

    revocation_endpoint = token_set.extra.get("revocation_endpoint")
    if not revocation_endpoint:
        _log.debug(
            "Rotaris OIDC token has no discovered revocation endpoint; skipping remote revoke"
        )
        return
    try:
        import httpx

        from rotaris_core.auth.concrete_cloud import CLIENT_ID

        httpx.post(
            revocation_endpoint,
            data={
                "client_id": CLIENT_ID,
                "token": token_set.refresh_token,
                "token_type_hint": "refresh_token",
            },
            timeout=10.0,
        )
    except Exception:  # noqa: BLE001 — best-effort; never surface to caller
        _log.debug("Rotaris OIDC token revoke request failed (ignored)", exc_info=True)
