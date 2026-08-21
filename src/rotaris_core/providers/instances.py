from __future__ import annotations

import re

from rotaris_core.reqtocode import SWR, traces

OPENAI_COMPATIBLE_PROVIDER_ID = "openai-compatible"
OPENAI_COMPATIBLE_PROVIDER_PREFIX = "openai-compatible--"
_INSTANCE_SLUG_RE = re.compile(r"[^a-z0-9]+")


@traces(SWR.SWR_769)
def build_instance_id(provider_family: str, label: str) -> str:
    slug = normalize_instance_label(label)
    return f"{provider_family}--{slug}"


def normalize_instance_label(label: str) -> str:
    normalized = _INSTANCE_SLUG_RE.sub("-", label.strip().lower()).strip("-")
    if not normalized:
        raise ValueError("Label must contain at least one letter or number.")
    return normalized


def is_openai_compatible_instance(provider_id: str) -> bool:
    return provider_id.startswith(OPENAI_COMPATIBLE_PROVIDER_PREFIX)
