"""One stable colour per agent, in whatever theme is running.

A reader following a delegated run identifies an agent by the colour of its
transcript label, so that colour has to be two things at once: **the same every
launch** for a given agent, and **readable in every theme**. Those pull in
opposite directions — a fixed hex is stable and goes dim on High Contrast's
darker ground; a colour computed per theme is readable and moves under the
reader.

The split here is that identity is the **hue** and readability is the
**lightness**. The twelve seeds below are the colours Rotaris has always used,
kept so a returning user's architect is still teal; each one is re-lit through
the active theme so it clears that theme's floor on that theme's ground.
"""

from __future__ import annotations

import hashlib
import re
from typing import TYPE_CHECKING, Final

from rotaris_core.reqtocode import SWR, traces

from rotaris.theme.a11y import raise_to_readable
from rotaris.theme.color import hex_color, oklch, to_oklch

if TYPE_CHECKING:
    from rotaris.theme.color import Color
    from rotaris.theme.spec import Theme

__all__ = [
    "known_personas",
    "persona_color",
    "persona_display",
    "persona_instance_color",
    "shade_count",
]

#: The hues Rotaris has always assigned, as the hexes they were authored in.
#: Read for their hue and chroma, never painted directly.
_SEEDS: Final = (
    "#e08b6b",  # coral — coding-agent
    "#d9b44a",  # amber — tester
    "#4db8b8",  # teal — architect
    "#9c7fc4",  # violet — refactorer
    "#6b8ec4",  # slate-blue — librarian
    "#d97b9e",  # rose — docs-writer
    "#4da6c4",  # cyan — planner
    "#8bc46b",  # lime — oracle
    "#e0a64b",  # orange — intent-classifier
    "#7b8ec4",  # indigo — codebase-analyst
    "#c49b6b",  # tan — verifier
    "#8bc49b",  # sage — backend-dev
)

_INDEX: Final[dict[str, int]] = {
    "coding-agent": 0,
    "tester": 1,
    "architect": 2,
    "refactorer": 3,
    "librarian": 4,
    "docs-writer": 5,
    "planner": 6,
    "oracle": 7,
    "intent-classifier": 8,
    "codebase-analyst": 9,
    "verifier": 10,
    "backend-dev": 11,
}

#: Lightness and chroma steps applied on top of a persona's own colour to tell
#: concurrent instances of it apart. The ramp only ever climbs — see
#: :mod:`rotaris.theme.a11y` for why down is not an option on a dark ground.
#: Each step also drops chroma, so neighbouring steps differ in two dimensions
#: rather than one.
_SHADE_STEPS: Final = (
    (0.00, 0.00),  # the persona's own colour: instance and persona stay a family
    (0.06, -0.015),
    (0.12, -0.030),
    (0.18, -0.045),
    (0.24, -0.060),
)

#: Coprime with the number of steps, so sequential instance numbers land on
#: different buckets than their neighbours instead of relying on a hash that can
#: cluster adjacent small integers.
_SHADE_STRIDE: Final = 3
_TRAILING_INT: Final = re.compile(r"(\d+)$")
_MIN_CHROMA: Final = 0.04


def _theme() -> Theme:
    from rotaris.theme import tokens  # noqa: PLC0415  (cycle: theme/__init__ imports this)

    return tokens()


def known_personas() -> tuple[str, ...]:
    """The persona names with a fixed seat in the ramp.

    Public because the accessibility sweep has to check every one of them
    against every ground, and a sweep that reached into a private mapping would
    break the next time this module was tidied — which is exactly the sort of
    breakage that gets fixed by deleting the assertion.
    """
    return tuple(_INDEX)


def shade_count() -> int:
    """How many distinct instance shades one persona can resolve to."""
    return len(_SHADE_STEPS)


@traces(SWR.SWR_2421)
def persona_color(name: str) -> Color:
    """A stable colour for *name*, readable in the active theme.

    Known personas take a fixed seat in the ramp; anything else — a user-defined
    persona — falls back to a deterministic hash, so the same name gets the same
    colour across launches without a registry to keep in step.
    """
    theme = _theme()
    if not name:
        return theme.color.run
    index = _INDEX.get(name)
    if index is None:
        digest = int(hashlib.md5(name.encode(), usedforsecurity=False).hexdigest(), 16)
        index = digest % len(_SEEDS)
    return raise_to_readable(hex_color(_SEEDS[index]), theme)


@traces(SWR.SWR_2435)
def persona_instance_color(persona: str, instance: str) -> Color:
    """A stable per-instance shade of *persona*'s colour.

    Two coding agents running at once share a hue and separate by lightness, so
    the transcript reads as one family with distinguishable members. The same
    pair always resolves to the same colour, and every shade stays above the
    floor — the step is a preference, the floor is the guarantee, and
    desaturating costs luminance, so a step can land under the floor even while
    climbing.
    """
    base = persona_color(persona)
    if not instance or instance == persona:
        return base
    theme = _theme()
    lightness, chroma, hue = to_oklch(base)
    trailing = _TRAILING_INT.search(instance)
    if trailing is not None:
        # The common "persona-N" convention: derive the bucket from N directly
        # so neighbours never collide.
        bucket = (int(trailing.group(1)) * _SHADE_STRIDE) % len(_SHADE_STEPS)
    else:
        digest = int(
            hashlib.md5(f"{persona}:{instance}".encode(), usedforsecurity=False).hexdigest(), 16
        )
        bucket = digest % len(_SHADE_STEPS)
    lightness_step, chroma_step = _SHADE_STEPS[bucket]
    chroma = max(_MIN_CHROMA, chroma + chroma_step)
    return raise_to_readable(oklch(min(0.97, lightness + lightness_step), chroma, hue), theme)


@traces(SWR.SWR_2906)
def persona_display(persona: str) -> str:
    """`coding-agent` → `Coding Agent`: the agent type as a reader sees it."""
    return persona.replace("-", " ").replace("_", " ").title() if persona else "Agent"
