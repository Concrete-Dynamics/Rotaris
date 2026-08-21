"""Why a discovered model cannot be used, in one vocabulary.

A provider catalog lists everything an account can *see*, which is more than it can
*call*. Discovery is the only place that knows which is which — the payload that
carries the answer is thrown away right after — and the model picker is several
layers downstream. These codes are what travels between them.

The reason *text* lives here too, not next to each consumer: the configuration
loader needs it when something names an unusable model, and the desktop needs it for
the picker tooltip. Two independently worded copies would drift.
"""

from __future__ import annotations

from rotaris_core.reqtocode import SWR, traces

#: The model is callable.
AVAILABLE = "available"

#: The provider lists the model but the account's policy has it switched off.
POLICY_DISABLED = "policy_disabled"

#: The model advertises endpoints, none of which Rotaris can dispatch to.
NO_SUPPORTED_ROUTE = "no_supported_route"

_REASONS: dict[str, str] = {
    POLICY_DISABLED: (
        "Your provider account has this model switched off. Enable it in the "
        "provider's settings, then refresh the model catalog."
    ),
    NO_SUPPORTED_ROUTE: (
        "The provider offers this model only on an endpoint Rotaris cannot send requests to."
    ),
}

_UNKNOWN_REASON = "The provider will not accept requests for this model."


@traces(SWR.SWR_2813)
def is_available(code: str | None) -> bool:
    """Whether ``code`` denotes a usable model.

    An absent code means available: entries discovered before availability was
    recorded, and every provider that has no notion of it, are usable.
    """
    return code in (None, "", AVAILABLE)


@traces(SWR.SWR_2813)
def availability_reason(code: str | None, *, detail: str | None = None) -> str:
    """One sentence a user can act on, optionally followed by the provider's own.

    ``detail`` is whatever the provider said about this specific model (Copilot
    returns a ``policy.terms`` string). It is appended rather than substituted so a
    terse or unhelpful provider message never costs the user the actionable part.
    """
    if is_available(code):
        return ""
    base = _REASONS.get(code or "", _UNKNOWN_REASON)
    extra = (detail or "").strip()
    if not extra or extra == base:
        return base
    if not extra.endswith((".", "!", "?")):
        extra = f"{extra}."
    return f"{base} {extra}"
