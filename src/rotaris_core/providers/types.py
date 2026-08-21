from __future__ import annotations

from pydantic import BaseModel, ConfigDict

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_720)
class ProviderDescriptor(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str
    display_name: str
    auth_provider_id: str
    discovery_endpoint: str
    discovery_auth_header: str
    default_base_url: str
