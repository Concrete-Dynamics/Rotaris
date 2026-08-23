from __future__ import annotations

from enum import StrEnum
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_3721)
class ConnectionMode(StrEnum):
    """How model traffic reaches a provider (SWR-3721).

    The four modes the desktop must be able to state before a user relies on a
    provider: Rotaris-managed cloud traffic, direct client-to-provider HTTP,
    a locally invoked provider SDK/CLI, and user-defined endpoints.
    """

    ROTARIS_CLOUD = "rotaris-cloud"
    DIRECT = "direct"
    LOCAL_SDK = "local-sdk"
    CUSTOM = "custom"


@traces(SWR.SWR_720)
class ProviderDescriptor(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    display_name: str
    auth_provider_id: str
    discovery_endpoint: str
    discovery_auth_header: str
    default_base_url: str
    # SWR-3721: the data-flow classification, operator and optional privacy
    # information the settings UI renders. ``connection_mode`` is required, so a
    # built-in without transparency metadata fails catalog validation.
    connection_mode: ConnectionMode
    operator_name: str | None = None
    privacy_url: str | None = None

    @traces(SWR.SWR_3721)
    def destination_host(self) -> str | None:
        """Canonical destination host for fixed HTTP endpoints.

        None for a local-SDK sentinel (``claude-agent-sdk://local``) and for
        user-defined endpoints, whose destination is the configured base URL.
        """
        if self.connection_mode not in (ConnectionMode.ROTARIS_CLOUD, ConnectionMode.DIRECT):
            return None
        parsed = urlparse(self.default_base_url)
        return parsed.hostname or None
