"""Engine vocabulary → theme colour, in one place.

The requirement board paints values the engine owns — an evidence state, a
requirement's health, a delivery column, an agent's run state. Each mapping
lives here and nowhere else, because the alternative has a specific failure
mode: a view that spelled a failing test red directly would have to be found
again, by hand, the day the palette moves. It never is.

Every mapping is a function of the active theme rather than a module constant,
so switching theme re-answers all of them. And every one degrades on an unknown
token instead of raising: a board that cannot paint one segment is a much
smaller failure than a board that cannot paint at all, and none of these states
is ever encoded in colour alone (SWR-3304) — the label is always there too.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris.theme.color import Color
    from rotaris.theme.spec import Theme

__all__ = [
    "delivery_color",
    "evidence_color",
    "health_color",
    "state_color",
    "terminal_color",
]


def _theme() -> Theme:
    from rotaris.theme import tokens  # noqa: PLC0415  (cycle: theme/__init__ imports this)

    return tokens()


def state_color(state: str) -> Color:
    """An agent's run state, on the coordinate system.

    This is where the design system's flourish is load-bearing rather than
    decorative: running/waiting/done are literally the Y, X and Z axes.
    """
    color = _theme().color
    return {
        "running": color.run,
        "waiting": color.wait,
        "queued": color.wait,
        "done": color.done,
        "failed": color.fail,
        "cancelled": color.fail,
        "idle": color.idle,
    }.get(state, color.idle)


@traces(SWR.SWR_3304)
def evidence_color(state: str) -> Color:
    """One obligation's evidence state (SWR-3207).

    Keyed by the engine's own persisted spellings, so a rename there fails this
    mapping's test rather than silently painting a board grey.
    """
    color = _theme().color
    return {
        "satisfied": color.run,
        "stale": color.wait,
        "failed": color.fail,
        "missing": color.neutral[400],
        # `idle`, not a raw ramp step: an evidence segment is a *shape*, so it
        # owes 3:1, and the 600 reaches only 2.20:1 on a card. `idle` is the
        # theme's own "present but inactive" token and is lifted to clear that
        # floor — which is exactly what "not applicable" means here.
        "not-applicable": color.idle,
    }.get(state, color.idle)


@traces(SWR.SWR_3304)
def health_color(health: str) -> Color:
    """A requirement's derived health (SWR-3211)."""
    color = _theme().color
    return {
        "healthy": color.run,
        "needs-update": color.wait,
        "incomplete-traceability": color.info_state,
        "verification-failed": color.fail,
        # Amber rather than the failure red: a blocked requirement is stopped,
        # not broken, and the two must not read as the same fact.
        "blocked": color.axis_x[400],
        "superseded": color.accent[400],
        "deprecated": color.idle,
    }.get(health, color.idle)


@traces(SWR.SWR_3304)
def delivery_color(state: str) -> Color:
    """The accent of one delivery column, and of the badge on its cards."""
    color = _theme().color
    return {
        "backlog": color.idle,
        "ready": color.info_state,
        "running": color.run,
        "review": color.accent[400],
        "needs-update": color.wait,
        "blocked": color.axis_x[400],
        "done": color.done,
    }.get(state, color.idle)


@traces(SWR.SWR_2429)
def terminal_color(name: str, *, background: bool) -> Color:
    """Resolve one pyte colour name to something paintable.

    pyte hands back a palette name, a bare six-digit hex for 24-bit colour, or
    `"default"`. An unknown name falls back to the ground rather than to an
    arbitrary colour: an unstyled cell is better than an unreadable one.
    """
    from rotaris.theme.color import hex_color  # noqa: PLC0415

    color = _theme().color
    ground = color.terminal_bg if background else color.terminal_fg
    if not name or name == "default":
        return ground
    known = color.ansi.get(name)
    if known is not None:
        return known
    if len(name) == 6 and all(character in "0123456789abcdefABCDEF" for character in name):
        return hex_color(f"#{name}")
    return ground
