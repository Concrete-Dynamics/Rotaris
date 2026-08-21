"""Observable workspace state.

`WorkspaceStore` is the single QObject the whole UI binds to. Views connect
to its change signals and re-read the plain dataclasses in
:mod:`rotaris.models.state`; services (git, config, run bridge) mutate it
through the methods below — never by poking the fields and forgetting the
signal.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import replace
from typing import TYPE_CHECKING

from PySide6.QtCore import QObject, Signal
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.requirements_state import RequirementsBoardState
from rotaris.models.state import (
    AgentNode,
    AgentState,
    ArtifactInfo,
    CheckpointList,
    CloudCredit,
    CommitInfo,
    DelegationSettings,
    ImprovementProposal,
    KpiSnapshot,
    McpServer,
    ModelOption,
    PersonaSpec,
    ProjectInitState,
    ProviderInfo,
    QueuedPromptItem,
    RunSummary,
    RuntimeToggles,
    RunUiState,
    SessionInfo,
    SkillInfo,
    SubscriptionLimit,
    TodoItem,
    TranscriptEvent,
    UiNotice,
    UiState,
    VerifierSummary,
    WorktreeInfo,
)

if TYPE_CHECKING:
    from rotaris.models.requirements_state import (
        ActionFeedback,
        PassProgress,
        PendingAction,
        QueueState,
    )


@traces(
    SWR.SWR_2011,
    SWR.SWR_2012,
    SWR.SWR_2013,
    SWR.SWR_2014,
    SWR.SWR_2015,
    SWR.SWR_2056,
    SWR.SWR_2057,
    SWR.SWR_2058,
    SWR.SWR_2059,
    SWR.SWR_2060,
    SWR.SWR_2074,
    SWR.SWR_2075,
    SWR.SWR_2076,
    SWR.SWR_2098,
    SWR.SWR_2122,
    SWR.SWR_2414,
    SWR.SWR_2415,
)
class WorkspaceStore(QObject):
    agents_changed = Signal()
    run_summary_changed = Signal()
    selection_changed = Signal(str)  # agent id ("" for none)
    transcript_changed = Signal()
    todos_changed = Signal()
    sessions_changed = Signal()
    artifacts_changed = Signal()
    git_changed = Signal()
    library_changed = Signal()
    queued_prompts_changed = Signal()
    settings_changed = Signal()
    status_changed = Signal()
    run_state_changed = Signal(str)  # running | idle | failed | paused
    cloud_credit_changed = Signal()
    improvement_proposals_changed = Signal()
    improvement_collection_changed = Signal(bool)
    #: the current VerifierSummary while the check suite runs (SWR-2609)
    verifier_changed = Signal(object)
    ui_changed = Signal()
    notice_changed = Signal()
    settings_dirty_changed = Signal(bool)
    pending_questions_changed = Signal(object)  # pending prompt dict | None
    #: tuple of pending approval payload dicts, oldest first (SWR-2504)
    pending_approvals_changed = Signal(object)
    #: the current ProjectInitState (SWR-2802)
    initialization_changed = Signal(object)
    #: the current CheckpointList for the session on offer (SWR-2437)
    checkpoints_changed = Signal(object)
    #: the BoardDelta an evaluation produced, or None when only the board's own
    #: meta moved — a view repaints the named cards, not the board (SWR-3312)
    requirements_changed = Signal(object)
    #: the requirement the user is looking at ("" for none) (SWR-3304)
    requirement_selected = Signal(str)
    #: the current QueueState — what is running, what is next, what is held and
    #: why (SWR-3608). Separate from `requirements_changed` because the queue
    #: moves on the scheduler's clock rather than the board's: a run starting
    #: changes the queue without changing a single card, and a queue panel that
    #: had to wait for a board evaluation would show a stale order.
    requirements_queue_changed = Signal(object)
    #: the board actions in flight and the feedback standing on the board
    #: (SWR-3601, SWR-3602), as `(pending, feedback)`
    requirement_actions_changed = Signal(object, object)

    def __init__(self, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.app_version = ""
        self.workspace_path = ""
        self.session_name = ""
        # Run whose transcript, controls, and KPIs the workspace view shows.
        # Empty until the first run starts; parallel runs move it on focus.
        self.focused_session_id = ""
        # The branch or commit a requirement surface asked the Git view to show
        # (SWR-3612). Empty until something asks.
        self.git_focus = ""
        self.session_status = "idle"  # running | idle | paused | failed
        self.run_state = RunUiState.IDLE
        self.session_runtime_label = ""
        self.active_model = ""
        self.session_model_override = ""
        self.session_persona_override = ""
        self.session_reasoning_override = ""
        self.pending_questions: dict[str, object] | None = None
        self.pending_approvals: tuple[dict[str, object], ...] = ()

        self.agents: dict[str, AgentNode] = {}
        self._agent_order: list[str] = []
        self.selected_agent_id: str = ""
        self.run_summary = RunSummary()

        self.transcript: list[TranscriptEvent] = []
        self.sessions: list[SessionInfo] = []
        self.artifacts: list[ArtifactInfo] = []
        self.kpis = KpiSnapshot()
        self.subscription_limits: list[SubscriptionLimit] = []
        #: Rotaris Cloud credit as last read (SWR-3013). Starts signed out;
        #: the account bridge replaces it once it knows better.
        self.cloud_credit = CloudCredit()
        self.improvement_proposals: list[ImprovementProposal] = []
        self.improvement_collection_active = False
        #: What the post-change check suite is doing (SWR-2609). Inactive
        #: whenever no suite is in flight, which is most of a run.
        self.verifier = VerifierSummary()
        self.todos: list[TodoItem] = []

        self.branch = ""
        self.ahead = 0
        self.behind = 0
        self.worktrees: list[WorktreeInfo] = []
        self.commits: list[CommitInfo] = []
        #: Checkpoints offered for one session at a time (SWR-2437). Replaced
        #: wholesale by :meth:`set_checkpoints`; never mutated in place.
        self.checkpoints = CheckpointList()
        self.commit_policy = (
            "Agents may create local commits only via git_commit — "
            "no push, pull, rebase or amend. You review and push."
        )

        self.initialization = ProjectInitState()

        #: The requirements area's whole state (SWR-3304). Default-empty and
        #: *not* available: a window that never opened the board has not read a
        #: requirement store, and saying "no requirements" would be a claim
        #: nobody made.
        self.requirements = RequirementsBoardState()

        self.mcp_servers: list[McpServer] = []
        self.skills: list[SkillInfo] = []
        self.skills_enabled = True
        self.prompt_stash: list[str] = []
        self.prompt_history: list[str] = []
        self.queued_prompts: list[QueuedPromptItem] = []

        self.model_slots: list[tuple[str, str]] = []
        self.model_slot_thinking: dict[str, str | None] = {}
        self.model_thinking_choices: dict[str, list[str | None]] = {}
        self.model_options: list[ModelOption] = []
        self.providers: list[ProviderInfo] = []
        self.personas: list[PersonaSpec] = []
        self.persona_edit_scope = "workspace"
        self.persona_scope_values: dict[tuple[str, str, str], str] = {}
        self._persona_unsets: set[tuple[str, str, str]] = set()
        self.delegation = DelegationSettings()
        self.runtime = RuntimeToggles()
        self.ui = UiState()
        self._notice_sequence = 0
        self._settings_baseline: tuple[object, ...] | None = None

    # ── models ───────────────────────────────────────────────────────────

    @property
    @traces(SWR.SWR_2814)
    def model_catalog(self) -> list[str]:
        """Names the user can actually run.

        Read-only on purpose: :attr:`model_options` is the one place a catalog is
        written, so a caller asking "which models do I have" can never disagree
        with the picker about a model the provider refuses (SWR-2812).
        """
        return [option.name for option in self.model_options if option.available]

    # ── agents ────────────────────────────────────────────────────────────

    def set_agents(self, agents: list[AgentNode]) -> None:
        incoming_ids = {agent.id for agent in agents}
        selection_removed = bool(
            self.selected_agent_id and self.selected_agent_id not in incoming_ids
        )
        if agents == self.agent_list() and not selection_removed:
            return
        self.agents = {a.id: a for a in agents}
        self._agent_order = [a.id for a in agents]
        if selection_removed:
            self.selected_agent_id = ""
        self.agents_changed.emit()
        if selection_removed:
            self.selection_changed.emit("")

    def set_run_summary(self, summary: RunSummary) -> None:
        if summary == self.run_summary:
            return
        self.run_summary = summary
        self.run_summary_changed.emit()

    def upsert_agent(self, agent: AgentNode) -> None:
        if agent.id not in self.agents:
            self._agent_order.append(agent.id)
        self.agents[agent.id] = agent
        self.agents_changed.emit()

    def update_agent(self, agent_id: str, **fields: object) -> None:
        agent = self.agents.get(agent_id)
        if agent is None:
            return
        for key, value in fields.items():
            setattr(agent, key, value)
        self.agents_changed.emit()

    def agent_list(self) -> list[AgentNode]:
        return [self.agents[i] for i in self._agent_order if i in self.agents]

    def agent_tree(self) -> list[tuple[AgentNode, str, int]]:
        """Depth-first agent list with box-drawing branch prefix and depth."""
        children: dict[str | None, list[AgentNode]] = {}
        for agent in self.agent_list():
            children.setdefault(agent.parent_id, []).append(agent)

        rows: list[tuple[AgentNode, str, int]] = []

        def walk(parent: str | None, prefix: str, depth: int) -> None:
            siblings = children.get(parent, [])
            for i, node in enumerate(siblings):
                last = i == len(siblings) - 1
                if parent is None:
                    rows.append((node, "", depth))
                    walk(node.id, "", depth + 1)
                else:
                    glyph = "└─ " if last else "├─ "
                    rows.append((node, prefix + glyph, depth))
                    walk(node.id, prefix + ("   " if last else "│  "), depth + 1)

        walk(None, "", 0)
        return rows

    def select_agent(self, agent_id: str) -> None:
        if agent_id and agent_id not in self.agents:
            return
        self.selected_agent_id = agent_id
        self.selection_changed.emit(agent_id)

    @property
    def selected_agent(self) -> AgentNode | None:
        return self.agents.get(self.selected_agent_id)

    def descendants(self, agent_id: str) -> list[AgentNode]:
        out: list[AgentNode] = []
        stack = [agent_id]
        while stack:
            current = stack.pop()
            for agent in self.agent_list():
                if agent.parent_id == current:
                    out.append(agent)
                    stack.append(agent.id)
        return out

    def cancel_agent(self, agent_id: str) -> None:
        """Cancel one agent; cancellation cascades to its live descendants."""
        targets = [self.agents.get(agent_id), *self.descendants(agent_id)]
        for agent in targets:
            if agent is not None and agent.state in (
                AgentState.RUNNING,
                AgentState.WAITING,
                AgentState.QUEUED,
            ):
                agent.state = AgentState.CANCELLED
                agent.activity = "cancelled by user"
        self.agents_changed.emit()

    def state_counts(self) -> dict[str, int]:
        counts = {"run": 0, "wait": 0, "done": 0, "fail": 0}
        for agent in self.agents.values():
            if agent.state is AgentState.RUNNING:
                counts["run"] += 1
            elif agent.state in (AgentState.WAITING, AgentState.QUEUED):
                counts["wait"] += 1
            elif agent.state is AgentState.DONE:
                counts["done"] += 1
            else:
                counts["fail"] += 1
        return counts

    def max_depth(self) -> int:
        return max((depth for _, _, depth in self.agent_tree()), default=0)

    # ── improvement proposals ────────────────────────────────────────────

    def set_improvement_proposals(self, proposals: list[ImprovementProposal]) -> None:
        self.improvement_proposals = proposals
        self.improvement_proposals_changed.emit()

    @traces(SWR.SWR_2414)
    def set_improvement_collection_active(self, active: bool) -> None:
        """Publish optional background post-run analysis without changing run state."""
        if active == self.improvement_collection_active:
            return
        self.improvement_collection_active = active
        self.improvement_collection_changed.emit(active)
        self.status_changed.emit()

    @traces(SWR.SWR_2609)
    def set_verifier(self, verifier: VerifierSummary) -> None:
        """Publish the check suite's progress without changing run state.

        Verification is a phase *within* a running run (SWR-2609), so this
        deliberately touches neither ``run_state`` nor ``session_status`` — the
        run controls must keep behaving exactly as they do during agent work.
        """
        if verifier == self.verifier:
            return
        self.verifier = verifier
        self.verifier_changed.emit(verifier)

    # ── requirements board ────────────────────────────────────────────────

    @traces(SWR.SWR_3312)
    def set_requirements(self, state: RequirementsBoardState, delta: object = None) -> None:
        """Publish an evaluated board, keeping the user's place in it.

        Selection and scroll position are carried over *here* rather than by
        each view: SWR-3312 requires them to survive a re-evaluation, and a
        value three views each restore for themselves is a value three views
        eventually restore differently.

        *delta* is the :class:`~rotaris.services.requirements_bridge.BoardDelta`
        the evaluation produced, or ``None`` when only the board's own meta
        moved (a busy flag, a failure notice) and no card changed.

        An evaluation that moved the queue announces that separately (SWR-3608):
        the queue panel is not a card and would otherwise have to re-read the
        whole board to notice that a run started.
        """
        previous = self.requirements
        self.requirements = state.preserving(previous)
        self.requirements_changed.emit(delta)
        if self.requirements.queue != previous.queue:
            self.requirements_queue_changed.emit(self.requirements.queue)

    @traces(SWR.SWR_3304)
    def select_requirement(self, req_id: str) -> None:
        """Move the board's selection, without re-publishing the board."""
        if req_id == self.requirements.selected_req_id:
            return
        self.requirements = replace(self.requirements, selected_req_id=req_id)
        self.requirement_selected.emit(req_id)

    @traces(SWR.SWR_3312)
    def set_requirements_scroll(self, offset: int) -> None:
        """Remember where the reader is, so the next evaluation puts them back.

        Signal-free on purpose: the scroll position is written *by* the view
        that owns the scroll bar, and emitting from here would send it straight
        back to the widget that just moved.
        """
        if offset == self.requirements.scroll_offset:
            return
        self.requirements = replace(self.requirements, scroll_offset=offset)

    @traces(SWR.SWR_3608)
    def set_requirements_queue(self, queue: QueueState) -> None:
        """Publish the delivery queue the scheduler decided (SWR-3608).

        Its own signal, and its own write path: the queue changes when a run
        starts, finishes or is held — none of which moves a card — and folding it
        into :meth:`set_requirements` would either repaint the whole board for a
        queue tick or leave the queue panel following the board's evaluation
        clock instead of the scheduler's.
        """
        if queue == self.requirements.queue:
            return
        self.requirements = replace(self.requirements, queue=queue)
        self.requirements_queue_changed.emit(queue)

    @traces(SWR.SWR_3601, SWR.SWR_3602)
    def set_requirement_actions(
        self,
        pending: tuple[PendingAction, ...],
        feedback: tuple[ActionFeedback, ...],
    ) -> None:
        """Publish what is in flight on the board and what came back.

        Both together, because they are two halves of one fact: an action that
        is answered stops being pending in the same instant its feedback appears,
        and publishing them separately would show a card as both running and
        refused for one repaint.
        """
        current = self.requirements
        if (pending, feedback) == (current.pending, current.feedback):
            return
        self.requirements = replace(current, pending=pending, feedback=feedback)
        self.requirement_actions_changed.emit(pending, feedback)

    @traces(SWR.SWR_3320)
    def set_requirement_pass(
        self,
        *,
        adopting: bool | None = None,
        verifying: bool | None = None,
        progress: PassProgress | None = None,
    ) -> None:
        """Publish what a running adoption or verification pass is doing.

        A sibling of :meth:`set_requirement_actions`, for the same reason: these
        fields describe a worker thread rather than a projection, so they are
        written directly instead of arriving on an evaluated board. That is what
        lets :meth:`RequirementsBoardState.preserving` carry them across the next
        evaluation — a repository event landing mid-pass must not re-enable the
        controls of a pass that is still running (SWR-3320).

        ``None`` means "leave this one alone", so a progress tick does not have
        to restate the busy flags it is not authoritative for.
        """
        current = self.requirements
        updated = replace(
            current,
            adopting=current.adopting if adopting is None else adopting,
            verifying=current.verifying if verifying is None else verifying,
            progress=current.progress if progress is None else progress,
        )
        if (updated.adopting, updated.verifying, updated.progress) == (
            current.adopting,
            current.verifying,
            current.progress,
        ):
            return
        self.requirements = updated
        # No delta: no card moved. The surfaces that read a pass read it off the
        # state, and the board's own cards are untouched (SWR-3317).
        self.requirements_changed.emit(None)

    # ── artifacts ─────────────────────────────────────────────────────────

    def set_artifacts(self, artifacts: list[ArtifactInfo]) -> None:
        if artifacts == self.artifacts:
            return
        self.artifacts = artifacts
        self.artifacts_changed.emit()

    def artifact(self, artifact_id: str) -> ArtifactInfo | None:
        return next((a for a in self.artifacts if a.id == artifact_id), None)

    def artifacts_for_agent(self, agent_id: str) -> list[ArtifactInfo]:
        """Instance scope: artifacts this agent produced or received."""
        agent = self.agents.get(agent_id)
        if agent is None:
            return []
        ids = {*agent.produced_artifact_ids, *agent.received_artifact_ids}
        return [a for a in self.artifacts if a.id in ids]

    def artifacts_for_persona(self, persona: str) -> list[ArtifactInfo]:
        """Agent-type scope: artifacts produced by any instance of a persona."""
        return [a for a in self.artifacts if a.persona == persona]

    # ── transcript / prompts ──────────────────────────────────────────────

    def set_transcript(self, events: list[TranscriptEvent]) -> None:
        if events == self.transcript:
            return
        self.transcript = events
        self.transcript_changed.emit()

    def append_event(self, event: TranscriptEvent) -> None:
        self.transcript.append(event)
        self.transcript_changed.emit()

    def set_pending_questions(self, pending: dict[str, object] | None) -> None:
        if pending == self.pending_questions:
            return
        self.pending_questions = pending
        self.pending_questions_changed.emit(pending)

    @traces(SWR.SWR_2504)
    def set_pending_approvals(self, pending: tuple[dict[str, object], ...]) -> None:
        """Publish the tool calls currently waiting on a permission approval."""
        if pending == self.pending_approvals:
            return
        self.pending_approvals = pending
        self.pending_approvals_changed.emit(pending)

    def add_history(self, text: str) -> None:
        if text and (not self.prompt_history or self.prompt_history[0] != text):
            self.prompt_history.insert(0, text)
        self.library_changed.emit()

    def stash_prompt(self, text: str) -> None:
        if text:
            self.prompt_stash.insert(0, text)
            self.library_changed.emit()

    def pop_stash(self, index: int = 0) -> str:
        if 0 <= index < len(self.prompt_stash):
            text = self.prompt_stash.pop(index)
            self.library_changed.emit()
            return text
        return ""

    def set_queued_prompts(self, prompts: list[QueuedPromptItem]) -> None:
        if prompts == self.queued_prompts:
            return
        self.queued_prompts = prompts
        self.queued_prompts_changed.emit()

    def add_queued_prompt(self, prompt_id: str, text: str) -> None:
        self.set_queued_prompts([*self.queued_prompts, QueuedPromptItem(prompt_id, text)])

    def update_queued_prompt(self, prompt_id: str, text: str) -> None:
        self.set_queued_prompts(
            [
                QueuedPromptItem(item.id, text) if item.id == prompt_id else item
                for item in self.queued_prompts
            ]
        )

    def remove_queued_prompt(self, prompt_id: str) -> None:
        self.set_queued_prompts([item for item in self.queued_prompts if item.id != prompt_id])

    # ── todos ────────────────────────────────────────────────────────────

    def set_todos(self, todos: list[TodoItem]) -> None:
        if todos == self.todos:
            return
        self.todos = todos
        self.todos_changed.emit()

    def rename_todo(self, task_id: str, text: str) -> None:
        cleaned = text.strip()
        if not cleaned:
            return
        for todo in self.todos:
            if todo.id == task_id and todo.text != cleaned:
                todo.text = cleaned
                self.todos_changed.emit()
                return

    def remove_todo(self, task_id: str) -> None:
        remaining = [todo for todo in self.todos if todo.id != task_id]
        if len(remaining) == len(self.todos):
            return
        self.todos = remaining
        self.todos_changed.emit()

    def add_todo(self, phase_id: str, text: str) -> None:
        cleaned = text.strip()
        if not cleaned:
            return
        from uuid import uuid4

        phase_name = next(
            (todo.phase_name for todo in self.todos if todo.phase_id == phase_id),
            "",
        )
        self.todos.append(
            TodoItem(
                id=f"local-{uuid4().hex[:8]}",
                phase_id=phase_id,
                status="open",
                text=cleaned,
                phase_name=phase_name,
            )
        )
        self.todos_changed.emit()

    # ── session / status ──────────────────────────────────────────────────

    @traces(SWR.SWR_2415)
    def set_focused_session(self, session_id: str) -> None:
        """Record which run the workspace view currently projects."""
        if session_id == self.focused_session_id:
            return
        self.focused_session_id = session_id
        self._apply_focus_marks()
        self.sessions_changed.emit()
        self.status_changed.emit()

    @traces(SWR.SWR_2415)
    def set_sessions(self, sessions: list[SessionInfo]) -> None:
        """Replace the session list, keeping the focus marker consistent.

        Rows for runs that are still starting survive the replacement: their
        snapshot may not have reached disk yet, and dropping the row would make
        a launching session flicker out of the lists.
        """
        known = {session.id for session in sessions}
        pending = [
            session
            for session in self.sessions
            if session.id not in known and session.status == "starting"
        ]
        self.sessions = pending + sessions
        self._apply_focus_marks()
        self.sessions_changed.emit()

    @traces(SWR.SWR_2415)
    def upsert_session(self, session: SessionInfo) -> None:
        """Insert or replace one session row.

        A launching run needs a visible row before its snapshot exists on disk,
        so the user sees it start instead of an empty workspace.
        """
        for index, existing in enumerate(self.sessions):
            if existing.id == session.id:
                self.sessions[index] = session
                break
        else:
            self.sessions.insert(0, session)
        self._apply_focus_marks()
        self.sessions_changed.emit()

    @traces(SWR.SWR_2415)
    def update_session_summary(
        self, session_id: str, *, status: str = "", branch: str = ""
    ) -> None:
        """Refresh one session row from a background run's live state."""
        if not session_id:
            return
        changed = False
        for session in self.sessions:
            if session.id != session_id:
                continue
            if status and session.status != status:
                session.status = status
                changed = True
            if branch and session.branch != branch:
                session.branch = branch
                changed = True
            break
        if changed:
            self.sessions_changed.emit()

    def _apply_focus_marks(self) -> None:
        for session in self.sessions:
            session.focused = session.id == self.focused_session_id

    def clear_session(self) -> None:
        """Discard all state owned by the loaded run."""
        self.session_name = ""
        self.session_runtime_label = ""
        self.set_agents([])
        self.selected_agent_id = ""
        self.selection_changed.emit("")
        self.set_transcript([])
        self.set_artifacts([])
        self.set_todos([])
        self.set_kpis(KpiSnapshot())
        self.set_session_status("idle")

    def set_session_status(self, status: str) -> None:
        run_state = RunUiState.from_backend(status)
        if run_state.busy:
            composer_mode = "queue"
        elif self.session_name:
            composer_mode = "continue"
        else:
            composer_mode = "start"
        if (
            run_state is self.run_state
            and self.session_status == run_state.value
            and composer_mode == self.ui.composer_mode
        ):
            return
        self.run_state = run_state
        self.session_status = run_state.value
        self.ui.composer_mode = composer_mode
        self.status_changed.emit()
        self.run_state_changed.emit(self.session_status)
        self.ui_changed.emit()

    def set_session_runtime_label(self, label: str) -> None:
        """Publish the active session's execution branch or an empty base marker."""
        if label == self.session_runtime_label:
            return
        self.session_runtime_label = label
        self.status_changed.emit()

    def set_kpis(self, kpis: KpiSnapshot) -> None:
        if kpis == self.kpis:
            return
        self.kpis = kpis
        self.status_changed.emit()

    @traces(SWR.SWR_3013)
    def set_cloud_credit(self, credit: CloudCredit) -> None:
        """Publish a new Rotaris Cloud credit reading (SWR-3013).

        Its own signal, not ``status_changed``: this arrives on a background
        poll, and the dashboard and status bar are the only things that care.
        """
        if credit == self.cloud_credit:
            return
        self.cloud_credit = credit
        self.cloud_credit_changed.emit()

    @traces(SWR.SWR_3612)
    def set_git_focus(self, target: str) -> None:
        """Ask the Git view to show *target* — a branch or a commit (SWR-3612).

        The requirement surfaces do not draw a branch, a worktree or a commit of
        their own; they hand the Git view what to show and switch to it. Which of
        the two *target* is stays open on purpose: a queue row knows its branch, a
        review knows its commit, and both mean "show me this run's work".

        Emitted unconditionally, unlike the setters that publish state: this is a
        navigation instruction, and asking twice for the same commit has to move
        the selection twice — the user navigated away in between.
        """
        self.git_focus = target
        self.git_changed.emit()

    # ── desktop interaction state ────────────────────────────────────────

    def set_active_view(self, view_id: str) -> None:
        if view_id == self.ui.active_view:
            return
        self.ui.active_view = view_id
        self.ui_changed.emit()

    def set_composer_draft(self, text: str) -> None:
        if text == self.ui.composer_draft:
            return
        self.ui.composer_draft = text
        self.ui_changed.emit()

    @traces(SWR.SWR_2089)
    def set_drawer_state(
        self, *, sidebar: bool | None = None, inspector: bool | None = None
    ) -> None:
        if sidebar is not None:
            self.ui.sidebar_open = sidebar
        if inspector is not None:
            self.ui.inspector_open = inspector
        self.ui_changed.emit()

    @traces(SWR.SWR_2090)
    def set_agent_popout(self, enabled: bool) -> None:
        if enabled == self.ui.agent_popout:
            return
        self.ui.agent_popout = enabled
        self.ui_changed.emit()

    @traces(SWR.SWR_2428)
    def set_terminal_popout(self, enabled: bool) -> None:
        if enabled == self.ui.terminal_popout:
            return
        self.ui.terminal_popout = enabled
        self.ui_changed.emit()

    @traces(SWR.SWR_2420)
    def set_auto_collapse_tools(self, enabled: bool) -> None:
        if enabled == self.ui.auto_collapse_tools:
            return
        self.ui.auto_collapse_tools = enabled
        self.mark_settings_dirty()
        self.ui_changed.emit()

    @traces(SWR.SWR_2432)
    def set_group_tool_calls(self, enabled: bool) -> None:
        if enabled == self.ui.group_tool_calls:
            return
        self.ui.group_tool_calls = enabled
        self.mark_settings_dirty()
        self.ui_changed.emit()

    @traces(SWR.SWR_2405)
    def set_worktree_cleanup_prompt(self, enabled: bool) -> None:
        if enabled == self.ui.worktree_cleanup_prompt_enabled:
            return
        self.ui.worktree_cleanup_prompt_enabled = enabled
        self.ui_changed.emit()

    def publish_notice(self, notice: UiNotice) -> None:
        self.ui.notice = notice
        self.notice_changed.emit()

    def new_notice_id(self) -> str:
        self._notice_sequence += 1
        return f"notice-{self._notice_sequence}"

    def clear_notice(self, notice_id: str = "") -> None:
        if self.ui.notice is None:
            return
        if notice_id and self.ui.notice.id != notice_id:
            return
        self.ui.notice = None
        self.notice_changed.emit()

    def setup_issues(self) -> list[tuple[str, str]]:
        """Return incomplete first-run steps as ``(label, destination)`` pairs."""
        issues: list[tuple[str, str]] = []
        if not self.workspace_path:
            issues.append(("Open a workspace", "workspace"))
        if not self.active_model and not self.model_catalog:
            issues.append(("Select a model", "settings"))
        if self.providers and not any(provider.connected for provider in self.providers):
            issues.append(("Authenticate a model provider", "settings"))
        return issues

    def set_session_persona(self, persona: str) -> None:
        """Entry persona for the next run, selected in the workspace composer."""
        self.session_persona_override = persona
        self.settings_changed.emit()

    def set_session_reasoning(self, level: str) -> None:
        """Reasoning override for the entry persona of the next run."""
        self.session_reasoning_override = level
        self.settings_changed.emit()

    def set_active_model(self, model: str) -> None:
        """Set the session-wide model override selected in the workspace."""
        if not model or model == self.active_model:
            return
        self.active_model = model
        self.session_model_override = model
        self.settings_changed.emit()
        self.status_changed.emit()

    # ── checkpoints ───────────────────────────────────────────────────────

    @traces(SWR.SWR_2437)
    def set_checkpoints(self, checkpoints: CheckpointList) -> None:
        """Publish the checkpoint listing the Git view offers a restore from.

        The equality guard matters for the same reason it does on
        :meth:`set_initialization`: the panel reloads the same listing whenever
        the user re-selects a session, and an unconditional emit would rebuild
        the table (and drop the user's row selection) on every one of them.
        """
        if checkpoints == self.checkpoints:
            return
        self.checkpoints = checkpoints
        self.checkpoints_changed.emit(checkpoints)

    # ── project initialization ────────────────────────────────────────────

    @traces(SWR.SWR_2802, SWR.SWR_2805)
    def set_initialization(self, state: ProjectInitState) -> None:
        """Publish the project-initialization status the UI renders.

        The change guard is load-bearing: :meth:`ConfigService.load
        <rotaris.services.config_service.ConfigService.load>` re-projects the
        same state on every reload, and an unconditional emit would re-open the
        first-run modal each time.
        """
        if state == self.initialization:
            return
        self.initialization = state
        self.initialization_changed.emit(state)

    @traces(SWR.SWR_2802)
    def set_initialization_running(self, running: bool) -> None:
        """Flip the in-progress flag; starting a run clears the previous error."""
        current = self.initialization
        self.set_initialization(
            replace(
                current,
                running=running,
                last_error="" if running else current.last_error,
            )
        )

    @traces(SWR.SWR_2802)
    def set_initialization_error(self, message: str) -> None:
        """Record a failed initialization run and leave the tasks pending."""
        self.set_initialization(replace(self.initialization, running=False, last_error=message))

    # ── library ───────────────────────────────────────────────────────────

    def set_mcp_enabled(self, name: str, enabled: bool) -> None:
        for server in self.mcp_servers:
            if server.name == name:
                server.enabled = enabled
                server.session_override = True
        self.library_changed.emit()

    @traces(SWR.SWR_2097)
    def set_mcp_health(
        self,
        name: str,
        health: str,
        *,
        detail: str = "",
        tool_count: int | None = None,
    ) -> None:
        for server in self.mcp_servers:
            if server.name == name:
                server.health = health
                server.health_detail = detail
                server.tool_count = tool_count
        self.library_changed.emit()

    @traces(SWR.SWR_2098)
    def set_skills_enabled(self, enabled: bool) -> None:
        if self.skills_enabled == enabled:
            return
        self.skills_enabled = enabled
        self.mark_settings_dirty()
        self.library_changed.emit()

    @traces(SWR.SWR_2098)
    def set_skill_load_mode(self, name: str, mode: str) -> None:
        if mode not in {"off", "name-only", "user-invocable-only", "on"}:
            raise ValueError(f"Unsupported skill load mode: {mode}")
        for skill in self.skills:
            if skill.name == name and skill.load_mode != mode:
                skill.load_mode = mode
                self.mark_settings_dirty()
                self.library_changed.emit()
                return

    @traces(SWR.SWR_2098)
    def set_skill_invocation_mode(self, name: str, mode: str) -> None:
        if mode not in {"default", "manual-only", "auto-only"}:
            raise ValueError(f"Unsupported skill invocation mode: {mode}")
        for skill in self.skills:
            if skill.name == name and skill.invocation_mode != mode:
                skill.invocation_mode = mode
                self.mark_settings_dirty()
                self.library_changed.emit()
                return

    # ── settings ──────────────────────────────────────────────────────────

    def set_strategy(self, strategy: str) -> None:
        if strategy == self.delegation.strategy:
            return
        self.delegation.strategy = strategy
        self.mark_settings_dirty()

    def set_agent_model(self, agent_id: str, model: str, scope: str = "instance") -> None:
        agent = self.agents.get(agent_id)
        if agent is None:
            return
        if scope == "type":
            persona = agent.persona
            for other in self.agents.values():
                if other.persona == persona:
                    other.model = model
        else:
            agent.model = model
        self.agents_changed.emit()

    def set_agent_reasoning(self, agent_id: str, level: str, scope: str = "instance") -> None:
        agent = self.agents.get(agent_id)
        if agent is None:
            return
        if scope == "type":
            persona = agent.persona
            for other in self.agents.values():
                if other.persona == persona:
                    other.reasoning = level
        else:
            agent.reasoning = level
        self.agents_changed.emit()

    def set_persona_edit_scope(self, scope: str) -> None:
        if scope not in {"workspace", "global"}:
            raise ValueError("Persona edit scope must be 'workspace' or 'global'.")
        if scope == self.persona_edit_scope:
            return
        self.persona_edit_scope = scope
        self.settings_changed.emit()

    def persona_value(self, name: str, field: str, scope: str | None = None) -> str:
        """Return the value visible while editing one configuration scope."""
        selected_scope = scope or self.persona_edit_scope
        key = (name, field, selected_scope)
        if key in self.persona_scope_values:
            return self.persona_scope_values[key]
        if selected_scope == "workspace":
            global_key = (name, field, "global")
            if global_key in self.persona_scope_values:
                return self.persona_scope_values[global_key]
        default_key = (name, field, "default")
        if default_key in self.persona_scope_values:
            return self.persona_scope_values[default_key]
        persona = self._persona(name)
        return str(getattr(persona, field, "") if persona is not None else "")

    def ensure_persona_scope_values(self) -> None:
        """Upgrade persona rows created by older callers into layered edit state."""
        for persona in self.personas:
            for field in ("model", "reasoning"):
                if any(
                    value_name == persona.name and value_field == field
                    for value_name, value_field, _scope in self.persona_scope_values
                ):
                    continue
                origin = str(getattr(persona, f"{field}_scope"))
                self.persona_scope_values[(persona.name, field, origin)] = str(
                    getattr(persona, field)
                )

    def persona_value_origin(self, name: str, field: str, scope: str | None = None) -> str:
        """Return the layer supplying the value visible in an edit scope."""
        selected_scope = scope or self.persona_edit_scope
        persona = self._persona(name)
        has_scoped_values = any(
            value_name == name and value_field == field
            for value_name, value_field, _value_scope in self.persona_scope_values
        )
        if not has_scoped_values and persona is not None:
            return str(getattr(persona, f"{field}_scope"))
        if (name, field, selected_scope) in self.persona_scope_values:
            return selected_scope
        if selected_scope == "workspace" and (name, field, "global") in self.persona_scope_values:
            return "global"
        return "default"

    def set_persona_model(self, name: str, model: str) -> None:
        persona = self._persona(name)
        if persona is None or self.persona_value(name, "model") == model:
            return
        self.persona_scope_values[(name, "model", self.persona_edit_scope)] = model
        self._persona_unsets.discard((name, "model", self.persona_edit_scope))
        self._refresh_persona_effective_fields(persona)
        self.mark_settings_dirty()

    def set_persona_reasoning(self, name: str, level: str) -> None:
        persona = self._persona(name)
        if persona is None or self.persona_value(name, "reasoning") == level:
            return
        self.persona_scope_values[(name, "reasoning", self.persona_edit_scope)] = level
        self._persona_unsets.discard((name, "reasoning", self.persona_edit_scope))
        self._refresh_persona_effective_fields(persona)
        self.mark_settings_dirty()

    def unset_persona_override(self, name: str, field: str) -> None:
        if field not in {"model", "reasoning"}:
            raise ValueError("Persona override field must be 'model' or 'reasoning'.")
        persona = self._persona(name)
        key = (name, field, self.persona_edit_scope)
        if persona is None:
            return
        if key not in self.persona_scope_values:
            if getattr(persona, f"{field}_scope") != self.persona_edit_scope:
                return
            self.persona_scope_values[key] = str(getattr(persona, field))
        self.persona_scope_values.pop(key)
        self._persona_unsets.add(key)
        self._refresh_persona_effective_fields(persona)
        self.mark_settings_dirty()

    def _refresh_persona_effective_fields(self, persona: PersonaSpec) -> None:
        for field in ("model", "reasoning"):
            origin = "default"
            for scope in ("workspace", "global", "default"):
                key = (persona.name, field, scope)
                if key in self.persona_scope_values:
                    origin = scope
                    break
            setattr(persona, field, self.persona_value(persona.name, field, "workspace"))
            setattr(persona, f"{field}_scope", origin)

    def _persona(self, name: str) -> PersonaSpec | None:
        return next((persona for persona in self.personas if persona.name == name), None)

    def set_runtime_toggle(self, name: str, value: object) -> None:
        if getattr(self.runtime, name) == value:
            return
        setattr(self.runtime, name, value)
        self.mark_settings_dirty()

    @traces(SWR.SWR_2505, SWR.SWR_2507)
    def set_runtime_list(self, name: str, values: list[str]) -> None:
        """Replace a list-valued runtime policy field (sandbox roots, host lists).

        Stores a copy rather than the caller's list: the sandbox writable roots
        and the two egress host lists are edited in place by a settings widget,
        and sharing the object would let the widget mutate the store — and the
        saved-settings baseline it is compared against — without a signal.
        """
        incoming = list(values)
        if list(getattr(self.runtime, name)) == incoming:
            return
        setattr(self.runtime, name, incoming)
        self.mark_settings_dirty()

    def mark_settings_dirty(self) -> None:
        self.ui.settings_dirty = True
        self.settings_changed.emit()
        self.settings_dirty_changed.emit(True)

    def mark_settings_saved(self) -> None:
        self._settings_baseline = (
            deepcopy(self.model_slots),
            deepcopy(self.model_slot_thinking),
            deepcopy(self.personas),
            deepcopy(self.persona_scope_values),
            deepcopy(self._persona_unsets),
            deepcopy(self.delegation),
            deepcopy(self.runtime),
            deepcopy(self.skills),
            self.skills_enabled,
        )
        self.ui.settings_dirty = False
        self.settings_dirty_changed.emit(False)

    def discard_settings_changes(self) -> None:
        if self._settings_baseline is None:
            return
        (
            model_slots,
            model_slot_thinking,
            personas,
            persona_scope_values,
            persona_unsets,
            delegation,
            runtime,
            skills,
            skills_enabled,
        ) = deepcopy(self._settings_baseline)
        self.model_slots = model_slots  # type: ignore[assignment]
        self.model_slot_thinking = model_slot_thinking  # type: ignore[assignment]
        self.personas = personas  # type: ignore[assignment]
        self.persona_scope_values = persona_scope_values  # type: ignore[assignment]
        self._persona_unsets = persona_unsets  # type: ignore[assignment]
        self.delegation = delegation  # type: ignore[assignment]
        self.runtime = runtime  # type: ignore[assignment]
        self.skills = skills  # type: ignore[assignment]
        self.skills_enabled = skills_enabled  # type: ignore[assignment]
        self.ui.settings_dirty = False
        self.settings_changed.emit()
        self.settings_dirty_changed.emit(False)


def sample_store(parent: QObject | None = None) -> WorkspaceStore:
    """A fully-populated store mirroring the Rotaris design prototype.

    Used by the demo mode (``rotaris --demo``) and by the frontend tests, so
    every view has realistic data without a live backend.
    """
    from rotaris_core.testing.lorem import LoremMarkdownGenerator

    lorem = LoremMarkdownGenerator(seed=2026)

    s = WorkspaceStore(parent)
    s.app_version = "0.1.0"
    s.workspace_path = "~/dev/Rotaris"
    s.session_name = "auth-flow-refactor"
    s.set_session_status("running")
    s.session_runtime_label = "26m 12s"
    s.active_model = "copilot/gpt-5"
    s.branch = "rotaris/auth-refactor"
    s.ahead = 4

    run, wait, done = AgentState.RUNNING, AgentState.WAITING, AgentState.DONE
    s.set_run_summary(
        RunSummary(
            state=run,
            activity="Coordinating task agents",
            model="copilot/gpt-5",
            reasoning="high",
            ctx_used=96_412,
            ctx_limit=200_000,
            tool_calls=41,
        )
    )
    s.set_agents(
        [
            AgentNode(
                id="intent-classifier",
                name="intent-classifier",
                persona="intent-classifier",
                state=done,
                activity="classified: refactor",
                model="gpt-5-nano",
                ctx_used=4_000,
                ctx_limit=200_000,
                tool_calls=0,
            ),
            AgentNode(
                id="planner",
                name="planner",
                persona="planner",
                state=done,
                activity="plan-async-refactor published",
                model="gpt-5-mini",
                ctx_used=11_500,
                ctx_limit=128_000,
                tool_calls=6,
            ),
            AgentNode(
                id="codebase-analyst",
                name="codebase-analyst",
                persona="codebase-analyst",
                state=done,
                activity="call graph of src/api handlers",
                model="gpt-5-mini",
                ctx_used=28_000,
                ctx_limit=128_000,
                tool_calls=18,
            ),
            AgentNode(
                id="architect",
                name="architect",
                persona="architect",
                state=done,
                activity="async interface contract agreed",
                model="copilot/gpt-5",
                ctx_used=62_000,
                ctx_limit=200_000,
                tool_calls=12,
            ),
            AgentNode(
                id="coding-agent-1",
                name="coding-agent-1",
                persona="coding-agent",
                state=run,
                depends_on=["architect"],
                activity="haet_edit src/api/session.py · 4 anchors ok",
                model="copilot/gpt-5",
                ctx_used=91_300,
                ctx_limit=128_000,
                tool_calls=38,
                elapsed="14m 40s",
                tools=["haet_edit", "shell", "read_file", "write_file", "grep", "serena", "fetch"],
                called_tools=["haet_edit", "shell", "read_file", "write_file", "grep"],
                active_tools=["haet_edit", "shell", "read_file"],
                artifacts=[
                    ("plan-async-refactor", "planner", True),
                    ("aiohttp-migration-notes", "librarian", True),
                    ("report-coding-agent-1", "pending", False),
                ],
                received_artifact_ids=["art_demo01", "art_demo02"],
                produced_artifact_ids=["art_demo03"],
            ),
            AgentNode(
                id="librarian",
                name="librarian",
                persona="librarian",
                state=done,
                parent_id="coding-agent-1",
                activity="aiohttp migration notes → artifact",
                model="gpt-5-mini",
                ctx_used=18_000,
                ctx_limit=128_000,
                tool_calls=9,
            ),
            AgentNode(
                id="tester",
                name="tester",
                persona="tester",
                state=run,
                parent_id="coding-agent-1",
                activity="shell pytest tests/unit -x -q · 38s",
                model="gpt-5-mini",
                ctx_used=22_040,
                ctx_limit=128_000,
                tool_calls=11,
                elapsed="6m 03s",
                tools=["write_file", "haet_edit", "shell", "serena"],
                called_tools=["write_file", "shell"],
                active_tools=["shell"],
            ),
            AgentNode(
                id="coding-agent-2",
                name="coding-agent-2",
                persona="coding-agent",
                state=wait,
                depends_on=["coding-agent-1"],
                activity="depends_on: coding-agent-1",
                model="copilot/gpt-5",
                ctx_used=4_120,
                ctx_limit=128_000,
            ),
            AgentNode(
                id="docs-writer",
                name="docs-writer",
                persona="docs-writer",
                state=AgentState.QUEUED,
                activity="queued — README + requirement log",
                model="gpt-5-mini",
                ctx_used=0,
                ctx_limit=128_000,
            ),
            AgentNode(
                id="verifier",
                name="verifier",
                persona="verifier",
                state=AgentState.QUEUED,
                activity="final acceptance gate",
                model="copilot/gpt-5",
                reasoning="high",
                ctx_used=0,
                ctx_limit=200_000,
            ),
        ]
    )
    s.transcript = [
        TranscriptEvent(
            "14:02:11",
            "you",
            "Refactor the API layer to use async handlers. "
            "Keep the public interface stable and make sure the unit suite "
            "stays green.",
            kind="user",
        ),
        TranscriptEvent(
            "14:02:14",
            "intent",
            "Classified as refactor — orchestrator "
            "instructions tailored for behaviour-preserving change.",
            kind="intent",
            persona="intent-classifier",
        ),
        TranscriptEvent(
            "14:02:28",
            "orchestrator",
            "The request is a behaviour-preserving refactor, so I should split the work "
            "between a coding agent and a librarian and gate the merge on the test suite.",
            kind="thinking",
            duration=7.0,
            char_count=920,
        ),
        TranscriptEvent("14:02:31", "orchestrator", lorem.markdown(words=90)),
        TranscriptEvent(
            "",
            "orchestrator",
            "coding-agent-1",
            kind="tool",
            tool="delegate",
            detail="depends_on=[architect] · background id b-101",
            status="ok",
            duration=0.4,
        ),
        TranscriptEvent(
            "",
            "orchestrator",
            "librarian",
            kind="tool",
            tool="delegate",
            detail="background id b-102",
            status="ok",
            duration=0.3,
        ),
        TranscriptEvent(
            "14:11:02", "coding-agent-1", lorem.markdown(words=220), persona="coding-agent"
        ),
        TranscriptEvent(
            "",
            "coding-agent-1",
            "src/api/session.py",
            kind="tool",
            tool="haet_edit",
            detail="4 anchors ok · queue pos 1",
            persona="coding-agent",
            status="ok",
            duration=0.8,
        ),
        TranscriptEvent(
            "",
            "coding-agent-1",
            "pytest tests/unit/test_session.py -x -q",
            kind="tool",
            tool="shell",
            detail="exit 0 · 3.2s",
            full_text="pytest tests/unit/test_session.py -x -q --maxfail=1 -vv",
            full_detail=(
                "exit 0 · 3.2s\n"
                "collected 12 items\n"
                "tests/unit/test_session.py::test_create_session PASSED\n"
                "tests/unit/test_session.py::test_load_session PASSED\n"
                "tests/unit/test_session.py::test_persist_snapshot PASSED\n"
                "12 passed in 3.20s"
            ),
            persona="coding-agent",
            status="ok",
            duration=3.2,
        ),
        TranscriptEvent(
            "14:18:47",
            "system",
            "Background task b-102 completed — librarian report available.",
            kind="system",
        ),
        TranscriptEvent(
            "14:22:19", "coding-agent-1", lorem.markdown(words=60), persona="coding-agent"
        ),
        TranscriptEvent("14:26:05", "tester", lorem.markdown(words=25), persona="tester"),
    ]
    s.prompt_history = [
        "Refactor the API layer to use async handlers…",
        "Run the unit suite and fix the two failing session tests",
        "Summarize draft requirements in docs/requirements",
        "/compress",
    ]
    s.prompt_stash = [
        "also add rate limiting to the token refresh endpoint…",
        "write an ADR for the async migration decision",
    ]

    s.sessions = [
        SessionInfo(
            "s-1", "auth-flow-refactor", "attached", "rotaris/auth-refactor", "612k tok", "26m"
        ),
        SessionInfo("s-2", "docs-sweep", "background", "rotaris/docs-pass", "98k tok", "1h 12m"),
        SessionInfo(
            "s-3",
            "ralph: migrate-config-loader",
            "completed",
            "rotaris/config-v2",
            "1.2M tok",
            "yesterday",
            detail="completed · 9 iterations",
        ),
    ]
    s.kpis = KpiSnapshot(
        cumulative_tokens=612_480,
        token_history=[20, 19, 17, 17, 13, 12, 9, 9, 6, 4, 2],
        tool_calls=147,
        tool_call_breakdown=[("shell", 41), ("haet_edit", 38), ("grep", 24)],
        files_touched=9,
        uncommitted=3,
    )
    s.subscription_limits = [
        SubscriptionLimit("Copilot premium requests", "412 / 1,500", 27, "resets Jul 1 · 27% used"),
        SubscriptionLimit("Codex weekly limit", "63%", 63, "resets in 2d 14h · 5h window at 22%"),
    ]
    s.improvement_proposals = [
        ImprovementProposal(
            id="imp_00000001",
            artifact_id="impart_demo01",
            category="preflight_check",
            summary="Cache LSP diagnostics between tester runs",
            recommended_action="Persist the LSP diagnostics cache to .rotaris/ so repeated "
            "tester runs skip the cold-start reindex.",
            risk="low",
            status="pending_review",
            created_label="2h",
        ),
        ImprovementProposal(
            id="imp_00000002",
            artifact_id="impart_demo01",
            category="persona_memory_update",
            summary="Persona memory: repo prefers ruff over black",
            recommended_action="Record in the tester persona's workspace memory that this repo "
            "formats with ruff, not black.",
            risk="low",
            status="approved",
            created_label="2h",
        ),
    ]
    s.artifacts = [
        ArtifactInfo(
            id="art_demo01",
            slug="plan-async-refactor",
            title="plan-async-refactor",
            kind="agent_published",
            status="published",
            persona="planner",
            producer="planner",
            summary="Six-phase async refactor plan with tester gating.",
            created_label="24m",
        ),
        ArtifactInfo(
            id="art_demo02",
            slug="aiohttp-migration-notes",
            title="aiohttp-migration-notes",
            kind="agent_published",
            status="published",
            persona="librarian",
            producer="librarian",
            summary="Session/connector lifecycle notes for the aiohttp migration.",
            created_label="18m",
        ),
        ArtifactInfo(
            id="art_demo03",
            slug="report-coding-agent-1",
            title="report-coding-agent-1",
            kind="child_report",
            status="running",
            persona="coding-agent",
            producer="coding-agent-1",
            summary="Handler conversion progress report (in flight).",
            created_label="2m",
        ),
    ]
    s.todos = [
        TodoItem("task-map", "phase-build", "done", "Map handler call graph", "Build"),
        TodoItem("task-design", "phase-build", "done", "Design async interface", "Build"),
        TodoItem("task-convert", "phase-build", "active", "Convert session handlers", "Build"),
        TodoItem("task-tests", "phase-build", "open", "Update tests + docs", "Build"),
    ]

    s.worktrees = [
        WorktreeInfo(
            "rotaris/auth-refactor",
            "~/dev/Rotaris",
            "auth-flow-refactor",
            "running",
            ahead=4,
            additions=412,
            deletions=188,
            files_touched=9,
            agent_commits=4,
            active=True,
        ),
        WorktreeInfo("rotaris/docs-pass", "../Rotaris-docs", "docs-sweep", "background", ahead=1),
        WorktreeInfo("master", "../Rotaris-main", is_base=True),
    ]
    s.commits = [
        CommitInfo("a3f9c21", "refactor: convert session handlers to async", "coding-agent", "4m"),
        CommitInfo(
            "7c02e8d", "refactor: async token store with to_thread wrappers", "coding-agent", "18m"
        ),
        CommitInfo("f14b990", "test: session handler async smoke coverage", "tester", "22m"),
        CommitInfo("05dd317", "docs: ADR-014 async migration decision", "docs-writer", "31m"),
        CommitInfo("c9a1b02", "merge: config loader v2 (master)", "you", "2d", local=False),
        CommitInfo("881f6ae", "feat: MCP auto-discovery from mcp.json", "you", "3d", local=False),
        CommitInfo("2b44c17", "chore: bump to v0.55.3", "you", "4d", local=False),
    ]

    s.mcp_servers = [
        McpServer("playwright", "stdio", "browser automation · headless", "yaml"),
        McpServer("tavily", "http", "web search", "yaml"),
        McpServer(
            "filesystem", "stdio", "scoped file access · discovered in project mcp.json", "project"
        ),
        McpServer(
            "github",
            "stdio",
            "command not found — marked unavailable",
            "user",
            enabled=False,
            available=False,
        ),
        McpServer(
            "postgres",
            "stdio",
            "disabled for this workspace — global default is on",
            "default",
            enabled=False,
            session_override=True,
        ),
    ]
    s.skills = [
        SkillInfo(
            "api-conventions",
            "project",
            "Handler naming, error envelopes, pagination rules for src/api.",
            "/api",
            "docs/skills/api/SKILL.md",
            load_scope="this session",
            in_context=True,
        ),
        SkillInfo(
            "release-checklist",
            "user",
            "Version bump, tag, wheel build and GitHub Release steps.",
            "/release",
            "~/.config/rotaris/skills/…",
            load_scope="every session",
        ),
        SkillInfo(
            "traceability",
            "project",
            "Map requirements to @req-annotated tests; regenerate the matrix.",
            "/trace",
            "docs/skills/traceability/SKILL.md",
        ),
    ]

    s.model_slots = [
        ("small_model", "copilot/gpt-5-nano"),
        ("medium_model", "copilot/gpt-5-mini"),
        ("large_model", "copilot/gpt-5"),
        ("default_summary_model", "medium_model"),
        ("fallback_model", "small_model"),
    ]
    s.model_slot_thinking = {
        "small_model": None,
        "medium_model": "medium",
        "large_model": "high",
        "default_summary_model": None,
        "fallback_model": None,
    }
    s.model_thinking_choices = {
        model: [None, "low", "medium", "high", "max"]
        for model in (
            "copilot/gpt-5",
            "copilot/gpt-5-mini",
            "copilot/gpt-5-nano",
        )
    }
    s.model_options = [
        ModelOption(name)
        for name in (
            "copilot/gpt-5",
            "copilot/gpt-5-mini",
            "copilot/gpt-5-nano",
            "gpt-5-mini",
            "gpt-5-nano",
            "claude-fable-5",
            "claude-opus-4-8",
        )
    ] + [
        ModelOption(
            "copilot/gpt-5.6-sol",
            available=False,
            reason=(
                "Your provider account has this model switched off. Enable it in "
                "the provider's settings, then refresh the model catalog."
            ),
        )
    ]
    s.providers = [
        ProviderInfo(
            "copilot",
            "GitHub Copilot",
            True,
            "Device Flow (RFC 8628) · 24 models discovered · token 0600",
            "healthy",
            "device_code",
        ),
        ProviderInfo(
            "codex",
            "OpenAI Codex",
            True,
            "PKCE authorization code · refresh handled automatically",
            "healthy",
            "pkce",
        ),
    ]
    s.personas = [
        PersonaSpec(
            "orchestrator",
            "Tech lead — decompose, delegate, completion gate",
            "large_model",
            "high",
            ["delegate", "todo", "haet_read", "artifact_read"],
        ),
        PersonaSpec(
            "coding-agent",
            "Implementation — write, edit, verify code",
            "large_model",
            "medium",
            ["write_file", "haet_edit", "shell", "grep", "serena"],
        ),
        PersonaSpec(
            "tester",
            "QA — write and run tests, coverage gaps",
            "medium_model",
            "medium",
            ["write_file", "haet_edit", "shell", "serena"],
        ),
        PersonaSpec(
            "librarian",
            "External reference — docs, RFCs, web research",
            "medium_model",
            "low",
            ["fetch", "read_file", "haet_read", "tavily"],
        ),
        PersonaSpec(
            "codebase-analyst",
            "Internal analyst — call graphs, LSP, read-only",
            "medium_model",
            "medium",
            ["grep", "glob", "find", "serena"],
        ),
        PersonaSpec(
            "verifier",
            "Final acceptance gate vs original request",
            "large_model",
            "high",
            ["haet_read", "grep", "shell", "serena"],
        ),
    ]
    return s
