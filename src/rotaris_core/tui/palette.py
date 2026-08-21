from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.tui.themes.base import Theme

# Shared animation frames used by ChatPanel and AgentStatusPane.
BRAILLE_FRAMES = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"


@dataclass(frozen=True, slots=True)
@traces(SWR.SWR_1055)
class RenderPalette:
    """Semantic color/style assignments for TUI rendering.

    Centralises the mapping from semantic role (e.g. ``user_label``) to the
    concrete Rich style string so that theme changes or design tweaks require
    edits in one place rather than across every widget.
    """

    # Foreground variants
    fg: str
    fg_dim: str
    fg_muted: str
    fg_subtle: str

    # Semantic labels (role → style)
    user_label: str  # "user" prefix in chat
    agent_label: str  # "ai" prefix in chat
    persona_label: str  # persona name in chat header
    system_label: str  # "sys" prefix
    auth_label: str  # "auth" prefix

    # Status colours
    green: str
    blue: str
    cyan: str
    yellow: str
    red: str
    purple: str

    # Structural
    border: str
    border_active: str

    @classmethod
    def from_theme(cls, theme: Theme) -> RenderPalette:
        return cls(
            fg=theme.fg,
            fg_dim=theme.fg_dim,
            fg_muted=theme.fg_muted,
            fg_subtle=theme.fg_subtle,
            user_label=f"bold {theme.cyan}",
            agent_label=f"bold {theme.green}",
            persona_label=f"bold {theme.blue}",
            system_label=f"bold {theme.fg_dim}",
            auth_label=f"bold {theme.yellow}",
            green=theme.green,
            blue=theme.blue,
            cyan=theme.cyan,
            yellow=theme.yellow,
            red=theme.red,
            purple=theme.purple,
            border=theme.border,
            border_active=theme.border_active,
        )
