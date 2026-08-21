from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces


@traces(SWR.SWR_771)
def api_key_validation_error(value: str) -> str | None:
    """Return an actionable error when an API key cannot be an HTTP header value."""
    try:
        value.encode("ascii")
    except UnicodeEncodeError:
        return "API key must contain ASCII characters only. Re-enter its exact value."

    if any(ord(character) < 0x20 or ord(character) == 0x7F for character in value):
        return "API key must not contain control characters. Re-enter its exact value."
    return None
