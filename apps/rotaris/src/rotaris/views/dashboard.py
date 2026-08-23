"""Overview screen: KPI strip, sessions, context windows, activity, limits."""

from __future__ import annotations

from typing import TYPE_CHECKING

from PySide6.QtCore import Qt, Signal
from PySide6.QtWidgets import (
    QGridLayout,
    QHBoxLayout,
    QLabel,
    QLayout,
    QScrollArea,
    QSizePolicy,
    QVBoxLayout,
    QWidget,
)
from rotaris_core.reqtocode import SWR, traces

from rotaris import theme
from rotaris.models.state import RunUiState
from rotaris.theme import tokens
from rotaris.theme.manager import Themed
from rotaris.theme.phosphor import set_button_icon
from rotaris.widgets import (
    AgentTreeList,
    Card,
    CloudCreditCard,
    ContextBar,
    EmptyState,
    KpiCard,
    PanelSplitter,
    ProgressBarThin,
    Sparkline,
    StatusDot,
    Tag,
    make_button,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from PySide6.QtGui import QResizeEvent

    from rotaris.models.state import AgentNode, ImprovementProposal, SessionInfo, SubscriptionLimit
    from rotaris.models.store import WorkspaceStore
    from rotaris.theme.spec import Theme


_PROPOSAL_STATUS_LABEL = {
    "pending_review": "pending",
    "approved": "approved",
    "rejected": "rejected",
    "deferred": "deferred",
}
_PROPOSAL_STATUS_TAG_KIND = {
    "pending_review": "outline",
    "approved": "accent",
    "rejected": "neutral",
    "deferred": "neutral",
}
_PROPOSAL_ACTIONS = (("Approve", "approved"), ("Reject", "rejected"), ("Defer", "deferred"))

#: Width of Overview's right column before the user resizes it, and the bounds
#: that keep both columns readable at the supported 1000px window (SWR-3011).
_RIGHT_COLUMN_WIDTH = 340
_RIGHT_COLUMN_MIN_WIDTH = 260
_RIGHT_COLUMN_MAX_WIDTH = 560
_LEFT_COLUMN_MIN_WIDTH = 320


class _StyledLabel(Themed, QLabel):
    """A label that keeps the recipe for its style instead of the result.

    Overview is written in small captions and mono figures the application
    stylesheet has no selector for, and the ones in the KPI strip are created
    once and afterwards only given new text. Holding the function that builds
    the style is what lets those follow a theme switch: a resolved colour could
    only be replaced by rebuilding the row around it, and nothing rebuilds them.
    """

    def __init__(
        self, text: str, style: Callable[[Theme], str], parent: QWidget | None = None
    ) -> None:
        super().__init__(text, parent)
        self._style = style
        self.install_theme_hook()

    def apply_theme(self, theme: Theme) -> None:
        self.setStyleSheet(self._style(theme))


def _mono(text: str) -> QLabel:
    """A figure in the mono face — a token count, a branch, a context window."""
    return _StyledLabel(
        text,
        lambda t: (
            f"font-family:{t.type.mono};font-size:{t.type.scale.xs}px;"
            f"color:{t.color.text_secondary};"
        ),
    )


def _mono_dim(text: str) -> QLabel:
    """A mono figure that is background to the row rather than its subject."""
    return _StyledLabel(
        text,
        lambda t: (
            f"font-family:{t.type.mono};font-size:{t.type.scale.xs}px;"
            f"color:{t.color.text_tertiary};"
        ),
    )


def _dim(text: str) -> QLabel:
    """A caption under or beside the value it qualifies."""
    return _StyledLabel(
        text, lambda t: f"font-size:{t.type.scale.xs}px;color:{t.color.text_tertiary};"
    )


def _caption(text: str) -> QLabel:
    """The smallest supporting line: a category, a duration, a detail."""
    return _StyledLabel(
        text, lambda t: f"font-size:{t.type.scale.x2s}px;color:{t.color.text_tertiary};"
    )


def _body(text: str) -> QLabel:
    """A row's own subject — sized, but left in the stylesheet's text colour."""
    return _StyledLabel(text, lambda t: f"font-size:{t.type.scale.sm}px;")


def _body_dim(text: str) -> QLabel:
    """A row's subject when it is context for something else on the same line."""
    return _StyledLabel(
        text, lambda t: f"font-size:{t.type.scale.sm}px;color:{t.color.text_secondary};"
    )


@traces(SWR.SWR_2008)
@traces(SWR.SWR_841)
class DashboardView(Themed, QScrollArea):
    request_view = Signal(str)
    new_session_requested = Signal()
    proposal_action_requested = Signal(str, str, str)  # artifact_id, proposal_id, status
    proposal_open_requested = Signal(str, str)  # artifact_id, proposal_id ("" for header link)
    session_focus_requested = Signal(str)  # show that run in the workspace
    session_continue_requested = Signal(str)  # focus and compose a follow-up
    #: Rotaris Cloud credit tile intents (SWR-3013). The window owns what they do:
    #: signing in, opening the account, and asking for a fresh reading.
    cloud_sign_in_requested = Signal()
    cloud_account_open_requested = Signal()
    cloud_refresh_requested = Signal()

    def __init__(self, store: WorkspaceStore, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        t = tokens()
        self._store = store
        self.setWidgetResizable(True)
        container = QWidget()
        container.setSizePolicy(QSizePolicy.Policy.Ignored, QSizePolicy.Policy.Preferred)
        self.setWidget(container)
        self.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        root = QVBoxLayout(container)
        root.setContentsMargins(30, 26, 30, 26)
        root.setSpacing(14)

        # header
        header = QHBoxLayout()
        title = QLabel("Overview")
        title.setObjectName("pageTitle")
        header.addWidget(title)
        self.session_label = _body_dim("")
        header.addWidget(self.session_label)
        header.addStretch(1)
        self.sessions_button = make_button("Sessions", "secondary")
        set_button_icon(self.sessions_button, "clock-counter-clockwise")
        header.addWidget(self.sessions_button)
        self.new_session_button = make_button("New session", "primary")
        set_button_icon(self.new_session_button, "plus")
        self.new_session_button.clicked.connect(self._primary_action)
        header.addWidget(self.new_session_button)
        root.addLayout(header)

        self.onboarding = EmptyState(
            "Ready to start",
            "Describe your first task in Workspace. Rotaris will keep progress and results visible.",
            action_label="Start first run",
            action_id="workspace",
        )
        self.onboarding.action_requested.connect(self.request_view.emit)
        root.addWidget(self.onboarding)

        # KPI strip
        self.kpi_grid = QGridLayout()
        self.kpi_grid.setSpacing(t.space.md)
        self.kpi_tokens = KpiCard("Cumulative tokens")
        self.kpi_sparkline = Sparkline()
        self.kpi_tokens.body.addWidget(self.kpi_sparkline)
        self.kpi_tokens_cost = _dim("")
        self.kpi_tokens.body.addWidget(self.kpi_tokens_cost)
        self.kpi_tools = KpiCard("Tool calls")
        self.kpi_tools_breakdown = QHBoxLayout()
        self.kpi_tools_breakdown.setSpacing(5)
        self.kpi_tools_breakdown.addStretch(1)
        self.kpi_tools.body.addLayout(self.kpi_tools_breakdown)
        self.kpi_git = KpiCard("Git")
        self.kpi_git_detail = _dim("")
        self.kpi_git.body.addWidget(self.kpi_git_detail)
        self.kpi_agents = KpiCard("Agents")
        self.kpi_agents_detail = _mono("")
        self.kpi_agents.body.addWidget(self.kpi_agents_detail)
        self.kpi_cards = (self.kpi_tokens, self.kpi_tools, self.kpi_git, self.kpi_agents)
        for i, card in enumerate(self.kpi_cards):
            self.kpi_grid.addWidget(card, 0, i)
        root.addLayout(self.kpi_grid)

        # two-column body, divided where the user wants it (SWR-3011)
        left = QVBoxLayout()
        left.setSpacing(t.space.md)
        right = QVBoxLayout()
        right.setSpacing(t.space.md)

        self.sessions_card = Card("Sessions", accented=True)
        self.sessions_rows = QVBoxLayout()
        self.sessions_rows.setSpacing(2)
        self.sessions_card.body.addLayout(self.sessions_rows)
        left.addWidget(self.sessions_card)

        self.context_card = Card("Context windows", accented=True)
        self.context_card.add_header_widget(
            _caption(f"┊ compression threshold {store.runtime.compression_threshold_pct}%")
        )
        self.context_rows = QVBoxLayout()
        self.context_rows.setSpacing(9)
        self.context_card.body.addLayout(self.context_rows)
        left.addWidget(self.context_card)

        self.active_card = Card("Active now", accented=True)
        self.active_rows = QVBoxLayout()
        self.active_rows.setSpacing(2)
        self.active_card.body.addLayout(self.active_rows)
        left.addWidget(self.active_card)
        left.addStretch(1)

        # Money first in the right column: the balance decides whether the
        # provider quotas underneath it are even reachable.
        self.cloud_credit_card = CloudCreditCard()
        self.cloud_credit_card.sign_in_requested.connect(self.cloud_sign_in_requested.emit)
        self.cloud_credit_card.account_open_requested.connect(
            self.cloud_account_open_requested.emit
        )
        self.cloud_credit_card.refresh_requested.connect(self.cloud_refresh_requested.emit)
        right.addWidget(self.cloud_credit_card)

        self.limits_card = Card("Subscription limits")
        self.limits_rows = QVBoxLayout()
        self.limits_rows.setSpacing(14)
        self.limits_card.body.addLayout(self.limits_rows)
        right.addWidget(self.limits_card)

        tree_card = Card("Agent tree")
        mission_link = make_button("Mission control →", "link")
        mission_link.clicked.connect(lambda: self.request_view.emit("mission"))
        tree_card.add_header_widget(mission_link)
        self.agent_tree = AgentTreeList(store)
        tree_card.body.addWidget(self.agent_tree)
        right.addWidget(tree_card)

        self.proposals_card = Card("Improvement proposals")
        self.proposals_tag = Tag("0 new", "accent")
        self.proposals_card.add_header_widget(self.proposals_tag)
        proposals_link = make_button("Open in Library →", "link")
        proposals_link.clicked.connect(lambda: self.proposal_open_requested.emit("", ""))
        self.proposals_card.add_header_widget(proposals_link)
        self.proposals_rows = QVBoxLayout()
        self.proposals_rows.setSpacing(t.space.xs)
        self.proposals_card.body.addLayout(self.proposals_rows)
        right.addWidget(self.proposals_card)
        right.addStretch(1)

        left_holder = QWidget()
        left_holder.setLayout(left)
        left_holder.setMinimumWidth(_LEFT_COLUMN_MIN_WIDTH)
        right_holder = QWidget()
        right_holder.setLayout(right)
        right_holder.setMinimumWidth(_RIGHT_COLUMN_MIN_WIDTH)
        right_holder.setMaximumWidth(_RIGHT_COLUMN_MAX_WIDTH)
        self.columns = PanelSplitter(
            "dashboard.columns",
            Qt.Orientation.Horizontal,
            defaults=(0, _RIGHT_COLUMN_WIDTH),
        )
        self.columns.addWidget(left_holder)
        self.columns.addWidget(right_holder)
        self.columns.setStretchFactor(0, 1)
        self.columns.name_handles(["Resize the Overview columns"])
        root.addWidget(self.columns)
        root.addStretch(1)

        store.agents_changed.connect(self.refresh)
        store.sessions_changed.connect(self.refresh)
        store.status_changed.connect(self.refresh)
        store.git_changed.connect(self.refresh)
        store.improvement_proposals_changed.connect(self.refresh)
        store.settings_changed.connect(self.refresh)
        store.cloud_credit_changed.connect(self._refresh_cloud_credit)
        self._refresh_cloud_credit()
        self.refresh()
        self.install_theme_hook()

    # ── refresh ───────────────────────────────────────────────────────────

    def apply_theme(self, theme: Theme) -> None:
        """Rebuild every row, because each one colours itself as it is built.

        A status dot, a meter fill and a proposal's link colour are handed to
        their widget as a finished colour, so there is nothing for a repolish to
        recompute. Rebuilding is what re-reads them, and this screen is rebuilt
        on every store signal anyway.
        """
        self.refresh()

    @traces(SWR.SWR_3013)
    def _refresh_cloud_credit(self) -> None:
        self.cloud_credit_card.set_credit(self._store.cloud_credit)

    def refresh(self) -> None:
        s = self._store
        if s.session_name:
            runtime = f" · {s.session_runtime_label}" if s.session_runtime_label else ""
            self.session_label.setText(f"session {s.session_name} · {s.session_status}{runtime}")
        else:
            self.session_label.setText("no active session")
        issues = s.setup_issues()
        show_onboarding = not s.session_name and not s.transcript
        self.onboarding.setVisible(show_onboarding)
        if issues:
            issue_text = "  •  ".join(label for label, _destination in issues)
            destination = issues[0][1]
            self.onboarding.configure(
                "Finish workspace setup",
                f"Before the first run: {issue_text}",
                action_label="Continue setup",
                action_id=destination,
            )
        else:
            self.onboarding.configure(
                "Ready for the first run",
                "Describe the outcome you want. Rotaris will expose agent progress, tools, and artifacts.",
                action_label="Start first run",
                action_id="workspace",
            )
        # Both stay available during a run: a new session starts beside it and
        # the browser switches between runs instead of replacing one.
        self.new_session_button.setEnabled(True)
        self.sessions_button.setEnabled(True)
        self.new_session_button.setToolTip("Start another session beside the active runs.")
        self.sessions_button.setToolTip("Browse and switch between sessions.")
        self.new_session_button.setText("New session")
        self.kpi_tokens.set_value(f"{s.kpis.cumulative_tokens:,}", "tok")
        self.kpi_sparkline.set_values(list(reversed(s.kpis.token_history)))
        self.kpi_tokens_cost.setText(f"cost {s.kpis.cumulative_cost_label}")

        self.kpi_tools.set_value(str(s.kpis.tool_calls), f"across {len(s.agents)} agents")
        _clear(self.kpi_tools_breakdown)
        for name, count in s.kpis.tool_call_breakdown:
            self.kpi_tools_breakdown.addWidget(_chip(f"{name} {count}"))
        self.kpi_tools_breakdown.addStretch(1)

        self.kpi_git.set_value(f"↑{s.ahead} ↓{s.behind}", f"vs master · {s.branch}")
        self.kpi_git_detail.setText(
            f"{s.kpis.files_touched} files touched · {s.kpis.uncommitted} uncommitted"
        )

        counts = s.state_counts()
        self.kpi_agents.set_value(
            str(len(s.agents)),
            f"depth {s.max_depth()} / {s.delegation.depth_cap} · "
            f"fan-out {counts['run']} / {s.delegation.fanout_limit}",
        )
        self.kpi_agents_detail.setText(
            f"run {counts['run']}   wait {counts['wait']}   "
            f"done {counts['done']}   fail {counts['fail']}"
        )

        _clear(self.sessions_rows)
        for session in s.sessions:
            self.sessions_rows.addWidget(
                _session_row(
                    session,
                    self.session_focus_requested.emit,
                    self.session_continue_requested.emit,
                )
            )
        if not s.sessions:
            self.sessions_rows.addWidget(
                EmptyState(
                    "No saved sessions",
                    "Completed and paused runs will appear here.",
                    compact=True,
                )
            )

        _clear(self.context_rows)
        for agent in s.agent_list():
            if agent.ctx_used <= 0 and not agent.is_live:
                continue
            self.context_rows.addWidget(_context_row(agent, s.runtime.compression_threshold_pct))
        if not any(agent.ctx_used > 0 or agent.is_live for agent in s.agent_list()):
            self.context_rows.addWidget(
                EmptyState(
                    "No context data",
                    "Context use appears after agents begin working.",
                    compact=True,
                )
            )

        _clear(self.active_rows)
        for agent in s.agent_list():
            if agent.is_live or agent.state.value == "waiting":
                self.active_rows.addWidget(_active_row(agent))
        if not any(agent.is_live or agent.state.value == "waiting" for agent in s.agent_list()):
            self.active_rows.addWidget(
                EmptyState(
                    "Nothing active", "Start or resume a run to see live work.", compact=True
                )
            )

        _clear(self.limits_rows)
        for limit in s.subscription_limits:
            self.limits_rows.addWidget(_limit_row(limit))
        if not s.subscription_limits:
            self.limits_rows.addWidget(
                EmptyState(
                    "Usage unavailable",
                    "Connected providers may expose subscription limits here.",
                    compact=True,
                )
            )

        _clear(self.proposals_rows)
        pending = sum(1 for p in s.improvement_proposals if p.status == "pending_review")
        self.proposals_tag.setText(f"{pending} new")
        for proposal in s.improvement_proposals:
            self.proposals_rows.addWidget(
                _proposal_row(
                    proposal,
                    self.proposal_action_requested.emit,
                    self.proposal_open_requested.emit,
                )
            )
        if not s.improvement_proposals:
            self.proposals_rows.addWidget(
                EmptyState(
                    "No proposals",
                    "Run improvement analysis to produce reviewable suggestions.",
                    compact=True,
                )
            )

    def resizeEvent(self, event: QResizeEvent) -> None:  # noqa: N802
        super().resizeEvent(event)
        columns = 2 if self.viewport().width() < 1080 else 4
        for index, card in enumerate(self.kpi_cards):
            self.kpi_grid.addWidget(card, index // columns, index % columns)

    def _primary_action(self) -> None:
        self.new_session_requested.emit()


def _clear(layout: QLayout) -> None:
    while layout.count():
        item = layout.takeAt(0)
        widget = item.widget()
        if widget is not None:
            # Hide and unparent before posting the deletion: see the same
            # sequence, and why it matters, in `views/workspace.py::_clear`.
            widget.hide()
            widget.setParent(None)
            widget.deleteLater()


def _chip(text: str) -> QLabel:
    """One tool name and its call count, as a bordered mono pill."""
    return _StyledLabel(
        text,
        lambda t: (
            f"padding:{t.space[0.25]}px {t.space.sm}px;"
            f"border:{t.size.hairline}px solid {t.color.border_strong};"
            f"border-radius:{t.radius.sm}px;"
            f"font-family:{t.type.mono};font-size:{t.type.scale.x2s}px;"
            f"color:{t.color.text_secondary};"
        ),
    )


def _proposal_summary_link(
    proposal: ImprovementProposal, on_open: Callable[[str, str], None]
) -> QLabel:
    t = tokens()
    # The anchor's colour has to be written into the markup: Qt renders rich
    # text links in the palette's Link colour, and this one is a summary the
    # user reads, not a link they are meant to notice.
    label = QLabel(
        f'<a href="{proposal.id}" style="color:{t.color.text};text-decoration:none;">'
        f"{proposal.summary}</a>"
    )
    label.setStyleSheet(f"font-size:{t.type.scale.sm}px;")
    label.setTextInteractionFlags(Qt.TextInteractionFlag.TextBrowserInteraction)
    label.setCursor(Qt.CursorShape.PointingHandCursor)
    label.setToolTip("Open in Library → Improvement proposals")
    label.linkActivated.connect(lambda _href, p=proposal: on_open(p.artifact_id, p.id))
    return label


def _proposal_row(
    proposal: ImprovementProposal,
    on_action: Callable[[str, str, str], None],
    on_open: Callable[[str, str], None],
) -> QWidget:
    t = tokens()
    row = QWidget()
    layout = QVBoxLayout(row)
    layout.setContentsMargins(0, 2, 0, 6)
    layout.setSpacing(t.space.xs)

    top = QHBoxLayout()
    top.setSpacing(t.space.sm)
    top.addWidget(_proposal_summary_link(proposal, on_open))
    top.addStretch(1)
    top.addWidget(
        Tag(
            _PROPOSAL_STATUS_LABEL.get(proposal.status, proposal.status),
            _PROPOSAL_STATUS_TAG_KIND.get(proposal.status, "neutral"),
        )
    )
    layout.addLayout(top)

    detail = QHBoxLayout()
    detail.setSpacing(6)
    detail.addWidget(_caption(proposal.category.replace("_", " ")))
    detail.addStretch(1)
    for label, status in _PROPOSAL_ACTIONS:
        if proposal.status == status:
            continue
        button = make_button(label, "link")
        button.clicked.connect(
            lambda _checked=False, s=status: on_action(proposal.artifact_id, proposal.id, s)
        )
        detail.addWidget(button)
    layout.addLayout(detail)
    return row


@traces(SWR.SWR_2415, SWR.SWR_2907, SWR.SWR_3612)
def _session_row(
    session: SessionInfo,
    on_focus: Callable[[str], None],
    on_continue: Callable[[str], None],
) -> QWidget:
    """One session as a run switcher: focus it, or continue a finished run."""
    t = tokens()
    state = RunUiState.from_backend(session.status)
    row = QWidget()
    layout = QHBoxLayout(row)
    layout.setContentsMargins(10, 7, 10, 7)
    layout.setSpacing(t.space.lg)
    dot_color = {"attached": t.color.run, "background": t.color.info_state}.get(
        session.status,
        t.color.run
        if state.busy
        else (t.color.fail if state is RunUiState.FAILED else t.color.idle),
    )
    dot = StatusDot(size=7)
    dot.set_state(dot_color, pulse=state.busy)
    layout.addWidget(dot)
    switch = make_button(session.name, "link")
    switch.setAccessibleName(f"Switch to session {session.name}")
    # Rows read as task wording (SWR-2907); the id lives in the tooltip so a
    # run can still be matched to its session directory and branch, and a
    # requirement-started run names what it is for beside it (SWR-3612).
    tip = f"Show this run in the workspace. Session {session.id}"
    if session.attribution:
        tip = f"{tip}. Started for requirement {session.attribution}"
    switch.setToolTip(tip)
    switch.clicked.connect(lambda _checked=False, sid=session.id: on_focus(sid))
    if session.focused:
        # Every other session is a link at the accent's 300 step, so the focused
        # one steps *up* to stand apart. Stepping down would look like emphasis
        # while measuring as less contrast against the card.
        switch.setStyleSheet(f"color:{t.color.accent[200]};")
    # One description, composed: setting a second would drop the first, and a
    # focused requirement run has both to say.
    described = [
        part
        for part in (
            "Currently focused run" if session.focused else "",
            f"Started for requirement {session.attribution}" if session.attribution else "",
        )
        if part
    ]
    if described:
        switch.setAccessibleDescription(". ".join(described))
    layout.addWidget(switch)
    if session.requirement_id:
        # Nothing at all for a run a person started: an empty badge would read
        # as a requirement whose id failed to load (SWR-3612).
        requirement_tag = Tag(session.requirement_id, "accent")
        requirement_tag.setAccessibleName(f"Requirement {session.attribution}")
        requirement_tag.setToolTip(f"This run implements requirement {session.attribution}.")
        layout.addWidget(requirement_tag)
    if session.focused:
        layout.addWidget(Tag("focused", "info"))
    layout.addWidget(_caption(session.detail or session.status))
    layout.addStretch(1)
    if not state.busy:
        resume = make_button("Continue run", "link")
        resume.setAccessibleName(f"Continue session {session.name}")
        resume.clicked.connect(lambda _checked=False, sid=session.id: on_continue(sid))
        layout.addWidget(resume)
    layout.addWidget(_mono(f"⎇ {session.branch}"))
    layout.addWidget(_mono_dim(session.tokens_label))
    layout.addWidget(_dim(session.duration_label))
    return row


def _context_row(agent: AgentNode, threshold: int) -> QWidget:
    t = tokens()
    row = QWidget()
    layout = QHBoxLayout(row)
    layout.setContentsMargins(0, 0, 0, 0)
    layout.setSpacing(t.space.md)
    dot = StatusDot(size=6)
    dot.set_state(theme.state_color(agent.state.value), pulse=agent.is_live)
    layout.addWidget(dot)
    name = _body(agent.name)
    name.setFixedWidth(150)
    layout.addWidget(name)
    bar = ContextBar()
    bar.set_fill(agent.ctx_pct, threshold=threshold)
    layout.addWidget(bar, 1)
    nums = (
        f"{agent.ctx_used:,} / {agent.ctx_limit:,}"
        if agent.ctx_used
        else f"— / {agent.ctx_limit:,}"
    )
    layout.addWidget(_mono(nums))
    return row


def _active_row(agent: AgentNode) -> QWidget:
    t = tokens()
    row = QWidget()
    layout = QHBoxLayout(row)
    layout.setContentsMargins(10, 7, 10, 7)
    layout.setSpacing(t.space.md)
    dot = StatusDot(size=6)
    dot.set_state(theme.state_color(agent.state.value), pulse=agent.is_live)
    layout.addWidget(dot)
    name = _body(agent.name)
    name.setFixedWidth(140)
    layout.addWidget(name)
    layout.addWidget(_body_dim(agent.activity), 1)
    layout.addWidget(_mono_dim(agent.elapsed or "—"))
    return row


def _limit_row(limit: SubscriptionLimit) -> QWidget:
    t = tokens()
    row = QWidget()
    layout = QVBoxLayout(row)
    layout.setContentsMargins(0, 0, 0, 0)
    layout.setSpacing(6)
    top = QHBoxLayout()
    top.addWidget(_body(limit.label))
    top.addStretch(1)
    top.addWidget(_mono(limit.used_label))
    layout.addLayout(top)
    bar = ProgressBarThin()
    # A meter fill is a shape, not a word, so it takes the graphical step.
    bar.set_fill(
        limit.pct, color=limit.color or (t.color.wait if limit.pct >= 60 else t.color.accent.base)
    )
    layout.addWidget(bar)
    layout.addWidget(_caption(limit.detail))
    return row
