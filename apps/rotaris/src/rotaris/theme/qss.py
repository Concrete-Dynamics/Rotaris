"""The application stylesheet, generated from a theme.

One entry point — :func:`build_qss` — assembled from fragments that mirror the
design system's own component groups, so a rule can be found by looking where
the designer would have put it.

Two things about QSS shape everything here, and both are silent failures rather
than errors, which is why they are called out at the top of the file instead of
being discovered again per rule:

* **QSS accepts properties it does not implement.** `box-shadow`,
  `letter-spacing`, `text-transform`, `opacity` and `font-variant-numeric` all
  parse and then do nothing. Anything the design system expresses with one of
  those is handled elsewhere — elevation in :mod:`rotaris.theme.motif`, tracking
  and tabular figures on the `QFont` a component builds from
  :class:`~rotaris.theme.spec.TypeStyle`, uppercase in the component that
  sets the text. None of them appear below; a rule here that used one would look
  correct and change nothing.
* **QSS has no variables and no `color-mix()`.** Both are resolved in Python
  before the string is built, which is what :mod:`rotaris.theme.color` is for.

:func:`object_styles` is the other half of this module's job. The accessibility
sweep has to know what the stylesheet gives a widget by `objectName` in order to
resolve a colour it cannot see, and it used to keep its own copy of that table.
A copy of a table is a table that will disagree eventually, so the table is
defined once here and the stylesheet is generated *from* it (SWR-3706).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

from rotaris.theme.color import Color, contrast_ratio

if TYPE_CHECKING:
    from rotaris.theme.spec import Theme

__all__ = ["ObjectStyle", "build_qss", "object_styles", "primary_button_fills"]


@dataclass(frozen=True)
class ObjectStyle:
    """What the application stylesheet gives one `objectName` by default.

    Only the properties the accessibility resolver needs in order to answer
    "what colour is this text, and on what". A rule with more in it than this
    still lives in the fragment functions; this is the part that has to be
    readable by something other than Qt.
    """

    background: Color | None = None
    foreground: Color | None = None
    font_size: int | None = None
    font_weight: int | None = None

    def declarations(self) -> str:
        parts = []
        if self.background is not None:
            parts.append(f"background: {self.background};")
        if self.foreground is not None:
            parts.append(f"color: {self.foreground};")
        if self.font_size is not None:
            parts.append(f"font-size: {self.font_size}px;")
        if self.font_weight is not None:
            parts.append(f"font-weight: {self.font_weight};")
        return " ".join(parts)


def object_styles(theme: Theme) -> dict[str, ObjectStyle]:
    """The `objectName` defaults, as data.

    Read by :func:`build_qss` to emit the rules, and by the accessibility sweep
    to resolve a widget's effective colours. One table, two readers — so
    retuning a token cannot quietly weaken the sweep that guards it.
    """
    color, type_ = theme.color, theme.type
    return {
        "appRoot": ObjectStyle(background=color.bg),
        "chrome": ObjectStyle(background=color.chrome),
        "panel": ObjectStyle(background=color.panel),
        "card": ObjectStyle(background=color.surface),
        "emptyState": ObjectStyle(background=color.surface),
        "muted": ObjectStyle(foreground=color.text_secondary),
        "dim": ObjectStyle(foreground=color.text_tertiary),
        "sectionLabel": ObjectStyle(
            foreground=color.text_tertiary,
            font_size=type_.scale.x2s,
            font_weight=type_.weight_strong,
        ),
    }


def _object_name_rules(theme: Theme) -> str:
    # QLabel-ish names get a transparent ground so they inherit whatever card
    # or panel they sit on; only the container names below set one.
    containers = {"appRoot", "chrome", "panel", "card", "emptyState"}
    rules = []
    for name, style in object_styles(theme).items():
        selector = f"QFrame#{name}" if name in {"card", "emptyState"} else f"QWidget#{name}"
        if name not in containers:
            selector = f"QLabel#{name}"
        rules.append(f"{selector} {{ {style.declarations()} }}")
    return "\n".join(rules)


def _base(theme: Theme) -> str:
    color, type_ = theme.color, theme.type
    return f"""
    QWidget {{
        background: transparent;
        color: {color.text};
        font-family: {type_.body};
        font-size: {type_.scale.sm}px;
    }}
    QMainWindow, QDialog {{ background: {color.bg}; }}
    QLabel {{ background: transparent; }}
    QLabel#mono, QLabel[mono="true"] {{ font-family: {type_.mono}; }}
    QLabel#heading {{
        font-family: {type_.display};
        font-size: {type_.scale.h5}px;
        font-weight: {type_.weight_display};
    }}
    QLabel#pageTitle {{
        font-family: {type_.display};
        font-size: {type_.scale.h4}px;
        font-weight: {type_.weight_display};
    }}
    """


def _surfaces(theme: Theme) -> str:
    color, radius, size = theme.color, theme.radius, theme.size
    return f"""
    /* Two selectors, one card. `Card` carries both the `card` object name and a
       `surface` property, and a pane that renames its card to say what the card
       is for keeps the property — so the ground, the hairline and the radius
       survive the rename that used to strip them. */
    QFrame#card, QFrame[surface="card"] {{
        background: {color.surface};
        border: {size.hairline}px solid {color.border};
        border-radius: {radius.md}px;
    }}
    QFrame#card[accented="true"], QFrame[surface="card"][accented="true"] {{}}
    /* `.card-accented .card-kicker` from the design system. It lives here and
       not in SectionLabel because the rule is about the *card*, not the label:
       a kicker takes the accent only when the card it sits in is accented, and a
       label that resolved that itself would have to know what contains it. */
    QFrame#card[accented="true"] QLabel#sectionLabel,
    QFrame[surface="card"][accented="true"] QLabel#sectionLabel {{
        color: {color.accent[300]};
    }}
    QFrame#card[selected="true"], QFrame[surface="card"][selected="true"] {{
        background: {color.accent_tint_soft};
    }}
    QFrame#emptyState {{
        border: {size.hairline}px dashed {color.border};
        border-radius: {radius.md}px;
    }}
    QFrame#dialogSurface {{
        background: {color.surface};
        border: {size.hairline}px solid {color.border};
        border-radius: {radius.lg}px;
    }}
    QFrame[role="divider"] {{ background: {color.divider}; border: none; max-height: 1px; }}
    """


def primary_button_fills(theme: Theme) -> dict[str, Color]:
    """The three fills the primary action is painted in, and why they stop where they do.

    The design system paints the primary button's hover in `accent-500` and its
    pressed in `accent-700`. On this palette `accent-500` carries the near-white
    label below the body floor, because lightening a fill under light text costs
    contrast rather than gaining it. The direction is right and the distance is
    not, so the hover travels as far towards the lighter step as it can while
    the label still clears the floor — pressed goes darker, which only ever
    helps a light label.

    Exported rather than inlined because the accessibility sweep has to check
    these exact fills. A sweep that recomputed them from ramp steps would be
    testing its own arithmetic instead of the stylesheet.
    """
    accent = theme.color.accent
    label = accent[100]
    hover = accent[600]
    for step in range(1, 12):
        candidate = accent[600].mix(accent[500], step * 0.05)
        if contrast_ratio(label, candidate) < theme.min_text_contrast:
            break
        hover = candidate
    return {
        "rest": accent[600],
        "hover": hover,
        "pressed": accent[700],
    }


def _buttons(theme: Theme) -> str:
    color, radius, size, type_ = theme.color, theme.radius, theme.size, theme.type
    accent, danger, warn = color.accent, color.danger, color.axis_x
    primary = primary_button_fills(theme)
    # The design system's `.btn`: 7px 13px, radius `--rt-radius-md`, `--rt-weight-medium`
    # (500), text `--rt-text-sm`. The horizontal padding is the design system's own
    # literal, kept rather than forced onto the 8px module — it is the system's number,
    # not the app's.
    pad_y, pad_x = 7, 13
    focus_pad_y, focus_pad_x = pad_y - size.focus_ring, pad_x - size.focus_ring
    # `opacity: .42` for a disabled control is CSS; QSS parses `opacity` and discards
    # it. The disabled recolour below is the same intent in Qt's own vocabulary.
    return f"""
    QPushButton {{
        background: transparent;
        border: {size.hairline}px solid transparent;
        border-radius: {radius.control}px;
        padding: {pad_y}px {pad_x}px;
        font-size: {type_.scale.sm}px;
        font-weight: {type_.weight_strong};
    }}
    QPushButton[variant="primary"] {{
        color: {accent[100]};
        background: {primary["rest"]};
    }}
    QPushButton[variant="primary"]:hover {{ background: {primary["hover"]}; }}
    QPushButton[variant="primary"]:pressed {{ background: {primary["pressed"]}; }}
    QPushButton[variant="secondary"] {{
        color: {color.text};
        background: transparent;
        border-color: {color.border_strong};
    }}
    QPushButton[variant="secondary"]:hover {{
        background: {color.text.with_opacity(0.07)};
        border-color: {color.border_strong};
    }}
    QPushButton[variant="secondary"]:pressed {{
        background: {color.text.with_opacity(0.04)};
    }}
    QPushButton[variant="ghost"] {{ color: {accent[300]}; }}
    QPushButton[variant="ghost"]:hover {{ background: {color.accent_tint}; }}
    QPushButton[variant="ghost"]:pressed {{ background: {color.accent_tint_strong}; }}
    QPushButton[variant="danger"] {{
        color: {danger[300]};
        background: transparent;
        border-color: {danger[700]};
    }}
    QPushButton[variant="danger"]:hover {{
        background: {danger[500].with_opacity(0.12)};
        border-color: {danger[600]};
    }}
    QPushButton[variant="danger"]:pressed {{
        background: {danger[500].with_opacity(0.08)};
    }}
    QPushButton[variant="warning"] {{
        color: {warn[300]};
        background: transparent;
        border-color: {warn[700]};
    }}
    QPushButton[variant="warning"]:hover {{
        background: {warn[500].with_opacity(0.12)};
        border-color: {warn[600]};
    }}
    QPushButton[variant="warning"]:pressed {{
        background: {warn[500].with_opacity(0.08)};
    }}
    QPushButton[variant="link"] {{
        color: {accent[300]};
        background: transparent;
        border: none;
        padding: 0;
        text-align: left;
        min-height: 0;
    }}
    QPushButton[variant="link"]:hover {{ color: {accent[200]}; }}
    QPushButton[variant="link"]:pressed {{ color: {accent[100]}; }}
    QPushButton[variant="icon"] {{
        min-width: {size.icon_button}px;
        max-width: {size.icon_button}px;
        min-height: {size.icon_button}px;
        max-height: {size.icon_button}px;
        padding: 0;
    }}
    QPushButton[variant="secondary"]:checked,
    QPushButton[variant="ghost"]:checked,
    QPushButton[variant="danger"]:checked,
    QPushButton[variant="warning"]:checked {{
        background: {color.accent_tint_strong};
        color: {accent[200]};
        border-color: {accent[500]};
    }}
    QPushButton[compact="true"] {{
        border-radius: {radius.sm}px;
        padding: {theme.space.xs}px {theme.space[1.125]}px;
        font-size: {type_.scale.xs}px;
    }}
    QPushButton:disabled, QToolButton:disabled, QAbstractSpinBox:disabled {{
        color: {color.text_disabled};
        background: {color.disabled_surface};
        border-color: {color.disabled_border};
    }}
    QPushButton[variant="link"]:disabled {{ background: transparent; border: none; }}
    /* Focus is drawn as a thicker border, so the padding gives back exactly
       what the extra border width takes — a control must not resize when it
       gains focus. */
    QPushButton:focus {{
        border: {size.focus_ring}px solid {color.focus};
        padding: {focus_pad_y}px {focus_pad_x}px;
    }}
    QPushButton[compact="true"]:focus {{
        padding: {max(0, theme.space.xs - size.focus_ring)}px {max(0, theme.space.sm - size.focus_ring)}px;
    }}
    QToolButton {{
        background: transparent;
        border: {size.hairline}px solid transparent;
        border-radius: {radius.sm}px;
        padding: 4px;
    }}
    QToolButton:hover {{ background: {color.hover}; }}
    QToolButton:focus {{ border: {size.focus_ring}px solid {color.focus}; }}
    QToolButton[availabilityHelp="true"] {{
        color: {accent[300]};
        border: {size.hairline}px solid {color.border_strong};
        padding: 0;
        min-width: 18px; max-width: 18px;
        min-height: 18px; max-height: 18px;
        font-size: {type_.scale.xs}px;
        font-weight: {type_.weight_display};
    }}
    QToolButton[availabilityHelp="true"]:hover {{ background: {color.accent_tint}; }}
    """


def _inputs(theme: Theme) -> str:
    color, radius, size, type_ = theme.color, theme.radius, theme.size, theme.type
    return f"""
    QPlainTextEdit, QLineEdit, QTextEdit {{
        background: {color.bg};
        color: {color.text};
        border: {size.hairline}px solid {color.border_strong};
        border-radius: {radius.control}px;
        padding: 6px 10px;
        font-size: {type_.scale.sm}px;
        selection-background-color: {color.accent[500].with_opacity(0.30)};
        selection-color: {color.text};
    }}
    QLineEdit {{ min-height: {size.control_height}px; }}
    QPlainTextEdit:hover, QLineEdit:hover, QTextEdit:hover {{
        border-color: {color.border_strong};
    }}
    QPlainTextEdit:focus, QLineEdit:focus, QTextEdit:focus {{
        border: {size.focus_ring}px solid {color.focus};
    }}
    QPlainTextEdit:disabled, QLineEdit:disabled, QTextEdit:disabled {{
        color: {color.text_disabled};
        background: {color.disabled_surface};
        border-color: {color.disabled_border};
    }}
    QLineEdit[mono="true"], QPlainTextEdit[mono="true"] {{ font-family: {type_.mono}; }}

    QComboBox {{
        background: {color.bg};
        border: {size.hairline}px solid {color.border_strong};
        border-radius: {radius.control}px;
        padding: 5px 30px 5px 11px;
        font-size: {type_.scale.sm}px;
        min-height: {size.control_height}px;
    }}
    QComboBox:hover {{ border-color: {color.border_strong}; }}
    QComboBox:focus, QComboBox:on {{ border: {size.focus_ring}px solid {color.focus}; }}
    QComboBox:disabled {{
        color: {color.text_disabled};
        background: {color.disabled_surface};
        border-color: {color.disabled_border};
    }}
    QComboBox::drop-down {{ border: none; width: 20px; }}
    QComboBox QAbstractItemView {{
        background: {color.surface_raised};
        border: {size.hairline}px solid {color.border_strong};
        border-radius: {radius.sm}px;
        selection-background-color: {color.accent[800]};
        selection-color: {color.text};
        outline: none;
    }}
    QComboBox[mono="true"] {{ font-family: {type_.mono}; }}

    QCheckBox, QRadioButton {{ spacing: 8px; background: transparent; }}
    QCheckBox::indicator, QRadioButton::indicator {{
        width: 15px; height: 15px;
        border: {size.hairline}px solid {color.border_strong};
        background: {color.bg};
    }}
    QCheckBox::indicator {{ border-radius: 4px; }}
    QRadioButton::indicator {{ border-radius: 8px; }}
    QCheckBox::indicator:checked, QRadioButton::indicator:checked {{
        background: {color.accent[500]};
        border-color: {color.accent[400]};
    }}
    QCheckBox::indicator:disabled, QRadioButton::indicator:disabled {{
        background: {color.disabled_surface};
        border-color: {color.disabled_border};
    }}
    QCheckBox:focus, QRadioButton:focus {{ color: {color.focus}; }}

    QAbstractSpinBox {{
        background: {color.bg};
        border: {size.hairline}px solid {color.border_strong};
        border-radius: {radius.control}px;
        padding: 5px 8px;
    }}
    QAbstractSpinBox:focus {{ border: {size.focus_ring}px solid {color.focus}; }}

    QProgressBar {{
        background: {color.track};
        border: none;
        border-radius: {radius.sm}px;
        text-align: center;
        color: {color.text_secondary};
        font-size: {type_.scale.x2s}px;
    }}
    QProgressBar::chunk {{ background: {color.accent[500]}; border-radius: {radius.sm}px; }}
    """


def _collections(theme: Theme) -> str:
    color, radius, size, type_ = theme.color, theme.radius, theme.size, theme.type
    return f"""
    QTreeWidget, QTreeView, QListWidget, QListView, QTableView, QTableWidget {{
        background: transparent;
        border: none;
        outline: none;
        alternate-background-color: transparent;
    }}
    QTreeWidget::item, QListWidget::item, QListView::item,
    QTableView::item, QTreeView::item {{
        padding: 7px 8px;
        border-radius: {radius.sm}px;
    }}
    QTreeWidget::item:hover, QListWidget::item:hover, QListView::item:hover,
    QTableView::item:hover, QTreeView::item:hover {{
        background: {color.text.with_opacity(0.04)};
    }}
    QTreeWidget::item:selected, QListWidget::item:selected, QListView::item:selected,
    QTableView::item:selected, QTreeView::item:selected {{
        background: {color.accent_tint};
        color: {color.text};
    }}
    QTreeWidget:focus, QListWidget:focus, QListView:focus, QTableView:focus {{
        border: {size.hairline}px solid {color.focus};
    }}
    QWidget#agentTreeRow[selected="true"] {{
        background: {color.accent_tint_soft};
        border-left: 2px solid {color.accent[500]};
        border-radius: {radius.sm - 1}px;
    }}
    QWidget[searchMatch="true"] {{
        background: {color.accent_tint_strong};
        border-left: 2px solid {color.focus};
    }}
    /* The design system's table header: a kicker, not a title. Tracking is set
       on the header's QFont by the Table component — QSS discards it. */
    QHeaderView::section {{
        background: transparent;
        color: {color.text_tertiary};
        border: none;
        border-bottom: {size.hairline}px solid {color.divider};
        padding: 7px 8px;
        font-size: {type_.scale.x2s}px;
        font-weight: {type_.weight_strong};
    }}
    QTableView {{ gridline-color: {color.divider}; }}
    """


def _chrome(theme: Theme) -> str:
    color, radius, size, type_ = theme.color, theme.radius, theme.size, theme.type
    return f"""
    QScrollArea {{ border: none; background: transparent; }}
    QScrollBar:vertical {{ background: transparent; width: {size.scrollbar}px; margin: 0; }}
    QScrollBar::handle:vertical {{
        background: {color.border_strong};
        border-radius: {size.scrollbar // 2}px;
        min-height: 28px;
    }}
    QScrollBar::handle:vertical:hover {{ background: {color.neutral[600]}; }}
    QScrollBar:horizontal {{ background: transparent; height: {size.scrollbar}px; margin: 0; }}
    QScrollBar::handle:horizontal {{
        background: {color.border_strong};
        border-radius: {size.scrollbar // 2}px;
        min-width: 28px;
    }}
    QScrollBar::handle:horizontal:hover {{ background: {color.neutral[600]}; }}
    QScrollBar::add-line, QScrollBar::sub-line {{ height: 0; width: 0; }}
    QScrollBar::add-page, QScrollBar::sub-page {{ background: transparent; }}

    QTabBar::tab {{
        background: transparent;
        color: {color.text_tertiary};
        padding: 8px 8px;
        border-bottom: 2px solid transparent;
        font-size: {type_.scale.sm}px;
        font-weight: {type_.weight_strong};
    }}
    QTabBar::tab:hover {{ color: {color.text_secondary}; }}
    QTabBar::tab:selected {{
        color: {color.accent[200]};
        border-bottom: 2px solid {color.accent[500]};
    }}
    QTabBar::tab:focus {{ border-bottom-color: {color.focus}; }}
    QTabWidget::pane {{ border: none; }}

    QToolTip {{
        background: {color.surface_raised};
        color: {color.text};
        border: {size.hairline}px solid {color.border};
        border-radius: {radius.sm}px;
        padding: 4px 8px;
        font-size: {type_.scale.xs}px;
    }}

    QMenu {{
        background: {color.surface_raised};
        border: {size.hairline}px solid {color.border_strong};
        border-radius: {radius.sm}px;
        padding: 5px;
    }}
    QMenu::item {{ padding: 6px 22px 6px 12px; border-radius: {radius.sm - 2}px; }}
    QMenu::item:selected {{ background: {color.accent_tint}; color: {color.text}; }}
    QMenu::item:disabled {{ color: {color.text_disabled}; }}
    QMenu::separator {{
        height: {size.hairline}px;
        background: {color.border};
        margin: 5px 8px;
    }}

    QMenuBar {{ background: {color.chrome}; }}
    QMenuBar::item:selected {{ background: {color.accent_tint}; }}
    QStatusBar {{ background: {color.chrome}; color: {color.text_secondary}; }}

    /* Size only. PanelSplitterHandle paints its own hairline, hover and focus:
       a 6px grab band and a 3:1 boundary line are different widths, and only
       the grab band belongs to the layout. */
    QSplitter::handle {{ background: {color.border}; }}
    QSplitter::handle:horizontal {{ width: 6px; }}
    QSplitter::handle:vertical {{ height: 6px; }}

    QGroupBox {{
        border: {size.hairline}px solid {color.border};
        border-radius: {radius.md}px;
        margin-top: {theme.space.md}px;
        padding-top: {theme.space.sm}px;
    }}
    QGroupBox::title {{
        subcontrol-origin: margin;
        left: {theme.space.md}px;
        padding: 0 {theme.space.xs}px;
        color: {color.text_tertiary};
        font-size: {type_.scale.x2s}px;
        font-weight: {type_.weight_strong};
    }}
    """


@traces(SWR.SWR_3706)
def build_qss(theme: Theme) -> str:
    """One application-wide stylesheet, derived entirely from *theme*."""
    fragments = (
        _base(theme),
        _object_name_rules(theme),
        _surfaces(theme),
        _buttons(theme),
        _inputs(theme),
        _collections(theme),
        _chrome(theme),
    )
    return "\n".join(fragment.strip("\n") for fragment in fragments)
