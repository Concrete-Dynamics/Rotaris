from __future__ import annotations

from dataclasses import dataclass

from rotaris_core.reqtocode import SWR, traces


@dataclass(frozen=True)
@traces(
    SWR.SWR_1050, SWR.SWR_1051, SWR.SWR_1052, SWR.SWR_1053, SWR.SWR_1054, SWR.SWR_1056, SWR.SWR_1058
)
class Theme:
    name: str
    # Backgrounds
    bg: str
    bg_overlay: str
    bg_selection: str
    bg_toast_warning: str
    bg_toast_error: str
    # Foregrounds
    fg: str
    fg_muted: str
    fg_dim: str
    fg_subtle: str
    # Borders
    border: str
    border_input: str
    border_focus: str
    border_active: str
    # Semantic accent colors
    green: str
    blue: str
    blue_light: str
    yellow: str
    yellow_vivid: str
    red: str
    red_vivid: str
    cyan: str
    purple: str
    footer_key: str

    def css_variables(self) -> dict[str, str]:
        """Return CSS variable name → value pairs for injection into Textual."""
        return {
            "theme-bg": self.bg,
            "theme-bg-overlay": self.bg_overlay,
            "theme-bg-selection": self.bg_selection,
            "theme-bg-toast-warning": self.bg_toast_warning,
            "theme-bg-toast-error": self.bg_toast_error,
            "theme-fg": self.fg,
            "theme-fg-muted": self.fg_muted,
            "theme-fg-dim": self.fg_dim,
            "theme-fg-subtle": self.fg_subtle,
            "theme-border": self.border,
            "theme-border-input": self.border_input,
            "theme-border-focus": self.border_focus,
            "theme-border-active": self.border_active,
            "theme-green": self.green,
            "theme-blue": self.blue,
            "theme-blue-light": self.blue_light,
            "theme-yellow": self.yellow,
            "theme-yellow-vivid": self.yellow_vivid,
            "theme-red": self.red,
            "theme-red-vivid": self.red_vivid,
            "theme-cyan": self.cyan,
            "theme-purple": self.purple,
            "theme-footer-key": self.footer_key,
        }
