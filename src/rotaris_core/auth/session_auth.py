"""Resolve a run's provider credentials once, up front, and keep them fresh.

A run builds many models — the intent classifier, the entry persona, every
delegated persona, the summary agent, the improvement collector — and each build
used to resolve its provider's credential on its own. Whichever build first met
an expired token paid for the refresh, on whatever thread it happened to be on,
and a refresh that failed there surfaced as *that component* failing rather than
as an authentication problem.

:func:`prime_auth_providers` moves that work to the front of the run, onto the
run's own event loop, where a refresh is a plain ``await`` and a failure is
attributable. :func:`keep_auth_fresh` wraps it in the run's lifetime and keeps
credentials ahead of their expiry while the run continues — which matters most
for Copilot, whose session bearers outlive neither a long run nor LiteLLM's
appetite for them, and whose staged files nothing else refreshes (SWR-701).

Neither one raises into the run. A provider that cannot be resolved is recorded
in the report and logged; the per-build resolution in
:mod:`rotaris_core.config.loader` still covers it, so a broken credential for a
provider this run never uses cannot stop the run.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from rotaris_core.auth.provider import AuthStatus
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import AsyncIterator

    from rotaris_core.auth.storage import TokenStorage
    from rotaris_core.config.schema import RotarisConfig

_log = logging.getLogger(__name__)

#: How long before a credential's expiry the refresher tries to renew it. Wide
#: enough that a slow refresh still lands before the old token stops working.
REFRESH_MARGIN_S = 300.0

#: How often the refresher wakes to look at the credentials it primed. The check
#: itself is a file read and a comparison per provider, so this can be frequent
#: without costing anything.
REFRESH_POLL_S = 60.0


@dataclass(frozen=True)
class PrimeReport:
    """What one priming pass found, per provider."""

    authenticated: tuple[str, ...] = ()
    refreshed: tuple[str, ...] = ()
    unresolved: dict[str, str] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.unresolved


@traces(SWR.SWR_3712)
def configured_provider_ids(config: RotarisConfig) -> tuple[str, ...]:
    """Return every auth provider this configuration could need.

    The union of the providers behind the configured models and the ones behind
    the startup slots and personas. A run cannot know in advance which persona
    it will delegate to, so it primes all of them rather than guessing.
    """
    from rotaris_core.auth.provider_settings import configured_auth_provider_ids

    provider_ids = set(configured_auth_provider_ids(config))
    for model in config.models.values():
        auth_provider = getattr(model, "auth_provider", None)
        if auth_provider:
            provider_ids.add(auth_provider)
    return tuple(sorted(provider_ids))


@traces(SWR.SWR_3712)
async def prime_auth_providers(
    config: RotarisConfig,
    *,
    storage: TokenStorage | None = None,
) -> PrimeReport:
    """Resolve every configured provider's credential on the caller's loop.

    Classification is loop-free (SWR-3711), so only a credential that has to be
    renewed costs anything: it is refreshed with a plain ``await``, and
    persisting the new token re-stages the provider's bridge artifacts because
    the manager is bound to the workspace.

    A credential due to expire within :data:`REFRESH_MARGIN_S` is renewed here
    too, not only an already-expired one. Handing a run a token with two minutes
    left in it just moves the failure to the first agent that needs it.
    """
    from rotaris_core.auth.manager import AuthManager
    from rotaris_core.auth.storage import TokenStorage

    active_storage = storage or TokenStorage()
    manager = AuthManager(storage=active_storage, workspace_root=config.workspace_root)

    authenticated: list[str] = []
    refreshed: list[str] = []
    unresolved: dict[str, str] = {}

    for provider_id in configured_provider_ids(config):
        try:
            status = manager.peek_status(provider_id)
            if status is AuthStatus.AUTHENTICATED and not _expires_soon(
                active_storage,
                provider_id,
            ):
                authenticated.append(provider_id)
                _stage_current_tokens(active_storage, provider_id, config)
                continue
            if status in (AuthStatus.AUTHENTICATED, AuthStatus.EXPIRED):
                # ``renew`` rather than ``get_token``: the second would hand back
                # a still-valid token that is about to stop being one.
                token = await manager.renew(provider_id)
                if token:
                    refreshed.append(provider_id)
                else:
                    unresolved[provider_id] = (
                        manager.get_last_error(provider_id) or "refresh produced no token"
                    )
                continue
            unresolved[provider_id] = f"status is {status.value}"
        except Exception as exc:  # noqa: BLE001 — priming never fails a run
            unresolved[provider_id] = str(exc)

    for provider_id, reason in unresolved.items():
        _log.warning("Could not prime credentials for '%s': %s", provider_id, reason)
    if authenticated or refreshed:
        _log.debug(
            "Primed provider credentials (ready: %s; refreshed: %s)",
            ", ".join(authenticated) or "none",
            ", ".join(refreshed) or "none",
        )

    return PrimeReport(
        authenticated=tuple(authenticated),
        refreshed=tuple(refreshed),
        unresolved=unresolved,
    )


def _expires_soon(storage: TokenStorage, provider_id: str) -> bool:
    """Whether this credential falls due within the refresh margin.

    A credential with no expiry — an API key — never does.
    """
    token_set = storage.load(provider_id)
    if token_set is None or token_set.expires_at <= 0:
        return False
    return time.time() >= (token_set.expires_at - REFRESH_MARGIN_S)


def _stage_current_tokens(
    storage: TokenStorage,
    provider_id: str,
    config: RotarisConfig,
) -> None:
    """Write the bridge artifacts for a credential that needed no refresh.

    A refresh stages them on the way through ``AuthManager``; a credential that
    was already good never touches that path, and LiteLLM reads Copilot's staged
    files on every request. Best-effort: the model build re-stages too.
    """
    if provider_id != "copilot":
        return
    token_set = storage.load(provider_id)
    if token_set is None:
        return
    try:
        from rotaris_core.auth.copilot_bridge import (
            ensure_litellm_env,
            litellm_copilot_token_dir,
            stage_copilot_tokens,
        )

        token_dir = litellm_copilot_token_dir(config.workspace_root)
        ensure_litellm_env(token_dir)
        stage_copilot_tokens(token_set, token_dir=token_dir)
    except Exception as exc:  # noqa: BLE001 — best-effort bridge
        _log.warning("Failed to stage Copilot tokens while priming: %s", exc)


@traces(SWR.SWR_3712)
def seconds_until_refresh(
    config: RotarisConfig,
    *,
    storage: TokenStorage | None = None,
) -> float | None:
    """Return how long until the earliest usable credential needs renewing.

    ``None`` when nothing this configuration uses carries an expiry — a run made
    entirely of API-key providers has nothing to keep fresh.

    A credential that is *already* past its expiry is not counted. Priming
    tried it and said what went wrong; scheduling it here as permanently overdue
    would only turn one failed refresh into one per poll.
    """
    from rotaris_core.auth.storage import TokenStorage

    active_storage = storage or TokenStorage()
    deadlines: list[float] = []
    for provider_id in configured_provider_ids(config):
        token_set = active_storage.load(provider_id)
        if token_set is None or token_set.expires_at <= 0 or token_set.is_expired:
            continue
        deadlines.append(token_set.expires_at - REFRESH_MARGIN_S - time.time())
    if not deadlines:
        return None
    return max(0.0, min(deadlines))


@traces(SWR.SWR_3712)
@contextlib.asynccontextmanager
async def keep_auth_fresh(
    config: RotarisConfig,
    *,
    storage: TokenStorage | None = None,
) -> AsyncIterator[PrimeReport]:
    """Prime the run's credentials, then keep them ahead of their expiry.

    Yields the opening :class:`PrimeReport` so a caller can report what could not
    be resolved. The refresher runs for the body's lifetime and is cancelled on
    the way out, including when the body raises or the run is cancelled.
    """
    report = await prime_auth_providers(config, storage=storage)
    refresher = asyncio.create_task(
        _refresh_forever(config, storage=storage),
        name="auth-refresher",
    )
    try:
        yield report
    finally:
        refresher.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await refresher


async def _refresh_forever(
    config: RotarisConfig,
    *,
    storage: TokenStorage | None = None,
) -> None:
    """Re-prime whenever a primed credential comes within the refresh margin.

    The margin is several poll intervals wide, so a fixed poll always meets a
    deadline with time to spare.

    Nothing here may end the loop except cancellation: a refresher that died on
    one bad pass would leave the rest of the run with no one keeping its
    credentials current, and say nothing about it.
    """
    while True:
        await asyncio.sleep(REFRESH_POLL_S)
        try:
            if seconds_until_refresh(config, storage=storage) == 0.0:
                await prime_auth_providers(config, storage=storage)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — the next pass gets another go
            _log.warning("Could not refresh provider credentials mid-run.", exc_info=True)
