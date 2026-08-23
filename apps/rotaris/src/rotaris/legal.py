"""Product identity, operator contact and legal-document links for About & Legal.

One module owns every value the surface renders (SWR-3717): painting product
identity must never need the network, and the canonical legal URLs live in
exactly one place — a relocation of the published documents is a one-line change
here instead of a hunt through views. The document texts themselves live outside
this repository (``docs/legal/README.md``); the surface links them, it does not
duplicate them.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass
from pathlib import Path

from rotaris_core.reqtocode import SWR, traces

#: Publisher shown on the About & Legal surface; identical to SECURITY.md.
PUBLISHER = "Concrete Dynamics UG (haftungsbeschränkt)"

#: The public security contact the surface exposes (SWR-3717 AC-002).
SECURITY_CONTACT = "security@concrete-dynamics.com"

#: The product's own licence (``apps/rotaris/pyproject.toml`` ``license`` field).
PRODUCT_LICENSE = "MIT"

#: Canonical home of the published legal documents (SWR-3717 AC-003).
LEGAL_BASE_URL = "https://rotaris.ai"


@dataclass(frozen=True)
class LegalDocument:
    """One named link to the canonical published version of a legal document."""

    name: str
    url: str


#: The documents the surface must name and open, in display order.
LEGAL_DOCUMENTS: tuple[LegalDocument, ...] = (
    LegalDocument("Privacy Policy", f"{LEGAL_BASE_URL}/privacy"),
    LegalDocument("EULA", f"{LEGAL_BASE_URL}/eula"),
    LegalDocument("Terms / AGB", f"{LEGAL_BASE_URL}/terms"),
    LegalDocument("Acceptable Use Policy", f"{LEGAL_BASE_URL}/acceptable-use"),
    LegalDocument("Withdrawal / Widerrufsbelehrung", f"{LEGAL_BASE_URL}/widerruf"),
)


@traces(SWR.SWR_3717)
def installation_flavour() -> str:
    """How this running copy was installed.

    A frozen ``sys.frozen`` marks a standalone artifact; anything else is a
    package installation (pip or a development checkout).
    """
    return "Standalone build" if getattr(sys, "frozen", False) else "Package installation"


@traces(SWR.SWR_3717)
def build_identifier() -> str | None:
    """The build/commit id baked into the artifact, when the release pipeline
    wrote one (``assets/build_id.txt``); None for a package installation."""
    candidate = Path(__file__).resolve().parent / "assets" / "build_id.txt"
    try:
        text = candidate.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return text or None
