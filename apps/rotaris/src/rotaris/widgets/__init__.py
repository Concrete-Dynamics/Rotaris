"""Rotaris' reusable Qt primitives — the design system's inventory (SWR-3702).

Grouped below the way the design system groups them, so a component can be found
by the name the designer gave it. Everything here takes its presentation from the
active theme (`rotaris.theme`); none of it holds a colour, radius or size of its
own.

Reach for one of these before writing a one-off control. If nothing fits, the
question to answer first is whether the design system has a name for what you are
building — `docs/reference/rotaris-design-system/components.css` is the
inventory, and adding to it is a design decision rather than a coding one.

Patterns are compositions of the primitives above them, not new inventory: the
card with a flush table, the title row a view opens with, the dot-grid empty
state, the monospace run log, the destructive confirm.
"""

from rotaris.widgets.cards import (
    Card,
    KpiCard,
    SectionLabel,
    Tag,
    artifact_link,
    make_availability_help,
    make_button,
    set_action_availability,
)
from rotaris.widgets.checkpoint_dialog import CheckpointRestoreDialog
from rotaris.widgets.cloud_credit import CARD_TITLE as CLOUD_CREDIT_TITLE
from rotaris.widgets.cloud_credit import CloudCreditCard
from rotaris.widgets.data_table import Table
from rotaris.widgets.evidence_ring import (
    EvidenceRing,
    EvidenceSite,
    EvidenceView,
    RingArc,
    evidence_sites,
    missing_evidence,
    ring_arcs,
    ring_description,
    ring_summary,
    verification_facts,
)
from rotaris.widgets.feedback import (
    ConfirmImpactDialog,
    EmptyState,
    InlineBanner,
    MergeOrderDialog,
)
from rotaris.widgets.forms import Field, FieldLabel, Input, Select, TextArea
from rotaris.widgets.hook_trust_dialog import HookTrustDialog, hook_trust_summary
from rotaris.widgets.icons import glyph_icon
from rotaris.widgets.kbd import Kbd, KbdSequence, format_shortcut
from rotaris.widgets.meters import (
    ContextBar,
    ContextRing,
    MeterBar,
    ProgressBarThin,
    SegmentedControl,
    Sparkline,
    StatusDot,
    ToggleSwitch,
)
from rotaris.widgets.model_combo import (
    MODEL_NAME_ROLE,
    UNAVAILABLE_SUFFIX,
    current_model_name,
    populate_model_combo,
    select_model,
)

# `NavRail` here is the design-system component. `views.chrome.NavRail` is the
# application's own rail, wired to the seven primary views; the two are not
# interchangeable and the chrome one is what `MainWindow` builds.
from rotaris.widgets.navigation import NavButton, NavItem, NavRail, Tabs
from rotaris.widgets.overlays import (
    Spinner,
    SpinnerSize,
    Toast,
    ToastKind,
    ToastStack,
    attach_tooltip,
)
from rotaris.widgets.patterns import (
    ConfirmDialog,
    LogPanel,
    PageHeader,
    SectionHeader,
    TableCard,
)
from rotaris.widgets.reflow import PANEL_REFLOW_MS, Coalescer, HiddenPanelReflow
from rotaris.widgets.requirement_card import (
    DELIVERY_ACTION_AREA,
    EpicCard,
    RequirementCardWidget,
    blocker_sentence,
    card_fact,
    is_blocked,
)
from rotaris.widgets.run_permission_dialog import (
    RunPermissionChoice,
    RunPermissionDialog,
)
from rotaris.widgets.slash_popup import SlashCommandPopup, SlashHighlighter
from rotaris.widgets.splitter import PanelSplitter, PanelSplitterHandle
from rotaris.widgets.terminal_view import TerminalView
from rotaris.widgets.tree import AgentTreeList

__all__ = [
    "CLOUD_CREDIT_TITLE",
    "DELIVERY_ACTION_AREA",
    "MODEL_NAME_ROLE",
    "UNAVAILABLE_SUFFIX",
    # ── core ──────────────────────────────────────────────────────────────
    "Kbd",
    "KbdSequence",
    "SegmentedControl",
    "StatusDot",
    "Tag",
    "ToggleSwitch",
    "format_shortcut",
    "make_availability_help",
    "make_button",
    "set_action_availability",
    # ── forms ─────────────────────────────────────────────────────────────
    "Field",
    "FieldLabel",
    "Input",
    "Select",
    "TextArea",
    # ── surfaces ──────────────────────────────────────────────────────────
    "Card",
    "KpiCard",
    "SectionLabel",
    # ── data ──────────────────────────────────────────────────────────────
    "ContextBar",
    "ContextRing",
    "MeterBar",
    "ProgressBarThin",
    "Sparkline",
    "Table",
    # ── feedback ──────────────────────────────────────────────────────────
    "EmptyState",
    "InlineBanner",
    "Spinner",
    "SpinnerSize",
    "Toast",
    "ToastKind",
    "ToastStack",
    "attach_tooltip",
    # ── navigation ────────────────────────────────────────────────────────
    "NavButton",
    "NavItem",
    "NavRail",
    "Tabs",
    # ── patterns ──────────────────────────────────────────────────────────
    "ConfirmDialog",
    "LogPanel",
    "PageHeader",
    "SectionHeader",
    "TableCard",
    # ── product-specific composites ───────────────────────────────────────
    "PANEL_REFLOW_MS",
    "AgentTreeList",
    "Coalescer",
    "HiddenPanelReflow",
    "CheckpointRestoreDialog",
    "CloudCreditCard",
    "ConfirmImpactDialog",
    "EpicCard",
    "EvidenceRing",
    "EvidenceSite",
    "EvidenceView",
    "HookTrustDialog",
    "MergeOrderDialog",
    "PanelSplitter",
    "PanelSplitterHandle",
    "RequirementCardWidget",
    "RingArc",
    "RunPermissionChoice",
    "RunPermissionDialog",
    "SlashCommandPopup",
    "SlashHighlighter",
    "TerminalView",
    "artifact_link",
    "blocker_sentence",
    "card_fact",
    "current_model_name",
    "evidence_sites",
    "glyph_icon",
    "hook_trust_summary",
    "is_blocked",
    "missing_evidence",
    "populate_model_combo",
    "ring_arcs",
    "ring_description",
    "ring_summary",
    "select_model",
    "verification_facts",
]
