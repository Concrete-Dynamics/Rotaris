"""Thread-safe persisted-session projection for the Rotaris store."""

from __future__ import annotations

import copy
import time
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from rotaris_core.cost import CostSnapshot, format_cost
from rotaris_core.reqtocode import SWR, traces

from rotaris.models.state import (
    AgentNode,
    AgentState,
    ArtifactInfo,
    KpiSnapshot,
    RunSummary,
    TodoItem,
    TranscriptDiff,
    TranscriptDiffLine,
    TranscriptEvent,
    VerifierSummary,
)

if TYPE_CHECKING:
    from collections.abc import Sequence
    from pathlib import Path

    from rotaris_core.edit_diff import EditDiffArtifact


@dataclass(frozen=True, slots=True)
class SessionProjectionContext:
    """Small immutable slice of UI-owned state needed by projection."""

    session_model_override: str = ""
    session_reasoning_override: str = ""
    files_touched: int = 0
    uncommitted: int = 0


@dataclass(frozen=True, slots=True)
class SessionProjection:
    session_name: str
    session_status: str
    active_model: str | None
    run: RunSummary
    transcript: tuple[TranscriptEvent, ...]
    agents: tuple[AgentNode, ...]
    artifacts: tuple[ArtifactInfo, ...]
    todos: tuple[TodoItem, ...]
    kpis: KpiSnapshot
    worktree_branch: str = ""
    pending_questions: dict[str, Any] | None = None
    #: Tool calls suspended on an interactive permission approval (SWR-2504),
    #: keyed by request id, oldest first.
    pending_approvals: tuple[dict[str, Any], ...] = ()
    #: The post-change check suite's live progress (SWR-2609). Inactive between
    #: suite runs, which is what the default expresses.
    verifier: VerifierSummary = VerifierSummary()


@dataclass(frozen=True, slots=True)
class SessionProjectionRead:
    projection: SessionProjection
    load_ms: float
    projection_ms: float


@dataclass(slots=True)
class _DiffIndex:
    """The user-only edit diffs, arranged the way a tool row asks for them."""

    by_key: dict[tuple[str, str], list[EditDiffArtifact]]
    unkeyed_by_agent: dict[str, list[EditDiffArtifact]]


def _build_diff_index(ui_edit_diffs: Sequence[dict[str, Any]]) -> _DiffIndex:
    """Validate and bucket the diffs once, so a row lookup is a dict hit."""
    index = _DiffIndex(by_key={}, unkeyed_by_agent={})
    for raw_diff in ui_edit_diffs:
        _index_diff(index, raw_diff)
    return index


@dataclass(slots=True)
class _TranscriptCarry:
    """Everything projecting one row needs to know about the rows before it.

    Two values, and both are small: the last thinking row *per agent* and the
    ids of the diffs already placed. That they are this small is what makes an
    incremental projection possible at all — a projector resuming mid-transcript
    has to carry only this across the boundary, not the transcript.
    """

    #: Last thinking row seen per agent — sessions recorded before the
    #: reasoning-fold fix carry an unstamped duplicate of every streamed burst
    #: (SWR-2446); those are dropped on projection.
    last_thinking: dict[str, dict[str, Any]]
    #: Diff artifacts already emitted, so a diff is placed beside exactly one
    #: tool row even when several could claim it.
    emitted_ids: set[str]

    @classmethod
    def empty(cls) -> _TranscriptCarry:
        return cls(last_thinking={}, emitted_ids=set())

    def copy(self) -> _TranscriptCarry:
        return _TranscriptCarry(
            last_thinking=dict(self.last_thinking),
            emitted_ids=set(self.emitted_ids),
        )


@traces(SWR.SWR_2419, SWR.SWR_2421, SWR.SWR_2446, SWR.SWR_2432, SWR.SWR_2454)
def _project_row(
    raw_event: dict[str, Any],
    carry: _TranscriptCarry,
    diffs: _DiffIndex,
    persona_map: dict[str, str],
    session_live: bool,
) -> tuple[TranscriptEvent, ...]:
    """Project one raw row into the view rows it stands for.

    Zero rows for a dropped duplicate burst, one for an ordinary row, more when
    a tool row carries user-only edit diffs beside it. *carry* is advanced in
    place; it is the only thing this depends on from the rows before it.
    """
    from rotaris.services.config_service import _event_from_dict

    agent_name = str(raw_event.get("name") or "").strip()
    if raw_event.get("role") == "thinking":
        previous = carry.last_thinking.get(agent_name)
        carry.last_thinking[agent_name] = raw_event
        content = str(raw_event.get("content") or "")
        if (
            previous is not None
            and not raw_event.get("duration")
            and content
            and content == str(previous.get("content") or "")
        ):
            return ()
        if not session_live and not raw_event.get("duration") and raw_event.get("started_at"):
            # A session that is not running streams nothing: an unstamped
            # burst (killed run, legacy duplicate) must not tick "live".
            raw_event = {k: v for k, v in raw_event.items() if k != "started_at"}
    if (
        raw_event.get("role") == "tool"
        and not session_live
        and str(raw_event.get("status") or "") == "running"
    ):
        # A session that is not running is not calling a tool. The call's
        # real outcome died with the process, so the row states no outcome
        # rather than counting upward forever (SWR-2432).
        raw_event = {k: v for k, v in raw_event.items() if k != "started_at"} | {"status": ""}
    event_persona = str(raw_event.get("persona") or "").strip() or persona_map.get(agent_name, "")
    projected: list[TranscriptEvent] = [_event_from_dict(raw_event, persona=event_persona)]
    if raw_event.get("role") != "tool" or not agent_name:
        return tuple(projected)
    tool_event_key = str(raw_event.get("tool_event_key") or "").strip()
    matched = list(diffs.by_key.get((agent_name, tool_event_key), ()))
    if not matched and bool(raw_event.get("tool_terminal")):
        matched = diffs.unkeyed_by_agent.get(agent_name, [])
    for diff in matched:
        if diff.diff_id in carry.emitted_ids:
            continue
        projected.append(_diff_transcript_event(diff, persona=event_persona))
        carry.emitted_ids.add(diff.diff_id)
    return tuple(projected)


@traces(SWR.SWR_2419, SWR.SWR_2421, SWR.SWR_2446, SWR.SWR_2432)
def _project_transcript(
    transcript_events: list[dict[str, Any]],
    ui_edit_diffs: list[dict[str, Any]],
    persona_map: dict[str, str] | None = None,
    session_live: bool = True,
) -> tuple[TranscriptEvent, ...]:
    """Merge user-only diff artifacts beside their model-visible tool rows."""
    carry = _TranscriptCarry.empty()
    diffs = _build_diff_index(ui_edit_diffs)
    persona_map = persona_map or {}
    projected: list[TranscriptEvent] = []
    for raw_event in transcript_events:
        projected.extend(_project_row(raw_event, carry, diffs, persona_map, session_live))
    return tuple(projected)


@traces(SWR.SWR_2454)
class TranscriptProjector:
    """Project a live session's transcript at a cost bounded by what changed.

    The same :func:`_project_row` the whole-list path uses, driven from a
    retained :class:`_TranscriptCarry` instead of from an empty one. That
    sameness is the point: a view fed by deltas and a view rebuilt from the
    session record are two runs of one function over one set of rows, so they
    cannot disagree about what a row renders as.

    **The boundary.** A live run mutates rows in place — the streaming tail, an
    open tool call, an unsettled check — so a delta is not always an append. The
    producer says how far back it reached; this class keeps one carry snapshot
    at exactly that index and re-projects forward from it. The snapshot is
    advanced, never accumulated: there is one, not one per row.

    A delta that reaches *behind* the retained boundary cannot be applied — the
    carry for that point is gone — and :meth:`apply` answers ``None`` so the
    caller re-reads the session instead. That is a correctness valve, not an
    error: it costs a whole-state read and changes nothing about what is shown.
    """

    __slots__ = ("_boundary", "_carry", "_diffs", "_prefix_len", "_rows")

    def __init__(self) -> None:
        self._boundary = 0
        self._prefix_len = 0
        self._carry = _TranscriptCarry.empty()
        self._diffs = _DiffIndex(by_key={}, unkeyed_by_agent={})
        #: Raw rows from :attr:`_boundary` onward, as last seen. Retained so a
        #: delta that starts further along can still be projected from the
        #: boundary — its own payload begins too late to do that alone.
        self._rows: list[dict[str, Any]] = []

    def reset(self) -> None:
        """Forget everything. The next delta has to start from row zero."""
        self._boundary = 0
        self._prefix_len = 0
        self._carry = _TranscriptCarry.empty()
        self._diffs = _DiffIndex(by_key={}, unkeyed_by_agent={})
        self._rows = []

    def seed(
        self,
        transcript_events: Sequence[dict[str, Any]],
        ui_edit_diffs: Sequence[dict[str, Any]],
        persona_map: dict[str, str] | None = None,
        session_live: bool = True,
    ) -> tuple[TranscriptEvent, ...]:
        """Project the whole transcript and seat the incremental boundary at 0.

        Called for a bootstrap, a focus change and the final refresh — the three
        moments that are whole-state anyway. The first delta after a seed pays
        one pass to move the boundary to the live tail; every delta after that
        is bounded by the change.
        """
        self._boundary = 0
        self._prefix_len = 0
        self._carry = _TranscriptCarry.empty()
        self._diffs = _build_diff_index(ui_edit_diffs)
        self._rows = list(transcript_events)
        names = persona_map or {}
        projected: list[TranscriptEvent] = []
        carry = self._carry.copy()
        for raw_event in self._rows:
            projected.extend(_project_row(raw_event, carry, self._diffs, names, session_live))
        return tuple(projected)

    def apply(
        self,
        first: int,
        rows: Sequence[dict[str, Any]],
        new_diffs: Sequence[dict[str, Any]] = (),
        persona_map: dict[str, str] | None = None,
        session_live: bool = True,
    ) -> tuple[int, tuple[TranscriptEvent, ...]] | None:
        """Project raw rows ``[first:]`` onto the view.

        Args:
            first: Raw index the producer reached back to. Every row from here
                on may have changed; nothing before it did.
            rows: The raw rows from *first* onward, already copied by the
                producer — this class never holds a row a run can still mutate.
            new_diffs: Edit-diff artifacts recorded since the last delta, folded
                into the retained index. Only the new ones, for the same reason
                only the changed rows are sent.
            persona_map: Agent name → persona, for rows that carry no persona.
            session_live: Whether the run is still executing.

        Returns:
            ``(first projected row, the projected rows from there on)``, or
            ``None`` when *first* reaches behind the retained boundary and the
            caller must re-seed.
        """
        if first < self._boundary:
            return None
        for raw_diff in new_diffs:
            _index_diff(self._diffs, raw_diff)
        names = persona_map or {}
        # Everything from the boundary: the head comes from what the previous
        # delta left behind, the tail is what arrived now.
        head = self._rows[: first - self._boundary]
        # Advance the retained carry across the head, counting the view rows it
        # accounts for — that count is what makes the returned index absolute.
        for raw_event in head:
            self._prefix_len += len(
                _project_row(raw_event, self._carry, self._diffs, names, session_live)
            )
        self._boundary = first
        self._rows = list(rows)
        carry = self._carry.copy()
        projected: list[TranscriptEvent] = []
        for raw_event in self._rows:
            projected.extend(_project_row(raw_event, carry, self._diffs, names, session_live))
        return self._prefix_len, tuple(projected)


def _index_diff(index: _DiffIndex, raw_diff: dict[str, Any]) -> None:
    """Fold one raw edit-diff record into *index*, ignoring an unusable one."""
    from rotaris_core.edit_diff import EditDiffArtifact

    try:
        diff = EditDiffArtifact.model_validate(raw_diff)
    except Exception:  # noqa: BLE001 - old or malformed UI metadata is non-fatal
        return
    agent_name = diff.agent_name.strip()
    if not agent_name:
        return
    if diff.tool_event_key:
        index.by_key.setdefault((agent_name, diff.tool_event_key), []).append(diff)
    else:
        index.unkeyed_by_agent.setdefault(agent_name, []).append(diff)


@traces(SWR.SWR_2419, SWR.SWR_2421)
def _diff_transcript_event(diff: EditDiffArtifact, persona: str = "") -> TranscriptEvent:
    entries = [
        TranscriptDiffLine(kind=entry.kind, line_number=entry.line_number, text=entry.text)
        for entry in diff.entries
    ]
    created = " [Created]" if diff.created else ""
    lines = [f"{diff.path}{created} +{diff.added_lines} -{diff.removed_lines}"]
    prefixes = {"context": " ", "add": "+", "delete": "-"}
    lines.extend(f"[{entry.line_number}]{prefixes[entry.kind]} {entry.text}" for entry in entries)
    if diff.truncated and diff.remaining_changed_lines:
        lines.append(f"… +{diff.remaining_changed_lines} more lines, diff truncated")
    return TranscriptEvent(
        "",
        diff.agent_name,
        "\n".join(lines),
        kind="edit_diff",
        tool=diff.tool_name,
        diff=TranscriptDiff(
            path=diff.path,
            operation=diff.operation,
            created=diff.created,
            added_lines=diff.added_lines,
            removed_lines=diff.removed_lines,
            entries=entries,
            truncated=diff.truncated,
            remaining_changed_lines=diff.remaining_changed_lines,
        ),
        persona=persona,
    )


@traces(SWR.SWR_2066, SWR.SWR_2122, SWR.SWR_2402, SWR.SWR_2406)
@traces(SWR.SWR_841)
def _cost_snapshot(state: Any) -> CostSnapshot:
    """Read the persisted cost, tolerating snapshots written before it existed."""
    cost = getattr(state, "global_cost", None)
    return cost if isinstance(cost, CostSnapshot) else CostSnapshot()


#: What an agent that never finished becomes, keyed by how its run ended. The
#: same three-way split the run summary below already applies to the session
#: itself, so a settled row and the run header can only ever say the same thing.
_SETTLED_AGENT_STATE: dict[str, AgentState] = {
    "completed": AgentState.DONE,
    "succeeded": AgentState.DONE,
    "done": AgentState.DONE,
    "failed": AgentState.FAILED,
    "error": AgentState.FAILED,
}

#: Replaces the agent's activity line when it is settled, so the row says why it
#: stopped rather than silently changing colour.
_SETTLED_AGENT_ACTIVITY = "ended with the run"

#: The status a session carries before it has reported a run at all. Deliberately
#: *not* settled: "no run has started" is not an outcome, so there is no ending
#: for an agent to be given. Only a run that stopped settles its agents.
_UNSTARTED_EXECUTION_STATUS = "idle"


@traces(SWR.SWR_2913)
def _settle_agents_with_session(agents: list[AgentNode], execution_status: str) -> None:
    """Close agents the session's own status says cannot still be running.

    The workspace reads one snapshot twice: the run header, session list and
    composer come from ``execution_status``; the agent tree, live counter and
    inspector come from ``child_states``. Nothing tied the two together, so a
    snapshot where they disagreed was rendered as a contradiction — ``RUN
    Completed`` above a pulsing dot and ``1 live`` (SWR-2907).

    SWR-2906 stops the engine writing such a snapshot. This is the half that
    makes one impossible to *display*: it is computed from the same read that
    produces the header, so a session recorded by an older build, one whose
    process was killed before it wrote a terminal status, or one whose
    optimistic UI update lost a race with the final refresh all still render
    consistently.

    ``ACTIVE_EXECUTION_STATUSES`` is reused rather than restated — it is already
    the single answer to "does this status claim a live run", shared with
    stale-session detection (SWR-2817) and worktree integration.

    Mutates *agents* in place; a session that really is running is untouched.
    """
    from rotaris_core.session.recovery import ACTIVE_EXECUTION_STATUSES

    if (
        execution_status in ACTIVE_EXECUTION_STATUSES
        or execution_status == _UNSTARTED_EXECUTION_STATUS
    ):
        return
    settled = _SETTLED_AGENT_STATE.get(execution_status, AgentState.CANCELLED)
    for agent in agents:
        if agent.state in (AgentState.RUNNING, AgentState.WAITING, AgentState.QUEUED):
            agent.state = settled
            agent.activity = _SETTLED_AGENT_ACTIVITY
            agent.active_tools = []


@traces(SWR.SWR_835, SWR.SWR_841)
def build_session_projection(
    state: Any,
    config: Any,
    context: SessionProjectionContext,
    artifacts: list[ArtifactInfo],
) -> SessionProjection:
    """Convert persisted state to plain UI models without touching Qt."""
    from rotaris.services.config_service import (
        _agent_from_dict,
        _artifact_tuples,
        _display_model_name,
        _todos_from_state,
    )

    session_model_key = str(getattr(state, "active_model_key", "") or "")
    active_model = _display_model_name(config, session_model_key) if session_model_key else None
    effective_session_model = active_model or context.session_model_override

    agents = [_agent_from_dict(raw, state, config) for raw in state.child_states]
    known_ids = {agent.id for agent in agents}
    for agent in agents:
        if (
            not agent.parent_id
            or agent.parent_id == "orchestrator"
            or agent.parent_id not in known_ids
        ):
            agent.parent_id = None
    _settle_agents_with_session(agents, str(state.execution_status))

    root_state = {
        "running": AgentState.RUNNING,
        "paused": AgentState.WAITING,
        "failed": AgentState.FAILED,
        "completed": AgentState.DONE,
    }.get(state.execution_status, AgentState.QUEUED)
    root_persona = config.default_persona if config is not None else "orchestrator"
    root_config = config.personas.get(root_persona) if config is not None else None
    root_model = effective_session_model or (root_config.model if root_config else "")
    root_model_config = config.models.get(root_model) if config is not None else None
    root_ctx_limit = (
        root_model_config.max_input_tokens
        if root_model_config and root_model_config.max_input_tokens
        else 128_000
    )
    verifier = _project_verifier(state)
    if verifier.active:
        # The agent is done and the workspace's own checks are what the run is
        # waiting on; "Coordinating run" would be a lie for the whole suite.
        activity = f"Verifying — {verifier.position_label}"
    elif root_state is AgentState.RUNNING:
        activity = "Coordinating run"
    else:
        activity = state.execution_status
    run = RunSummary(
        state=root_state,
        activity=activity,
        model=_display_model_name(config, root_model),
        reasoning=context.session_reasoning_override
        or str(getattr(root_config, "thinking", None) or "medium"),
        ctx_used=getattr(state, "root_context_tokens", 0) or 0,
        ctx_limit=root_ctx_limit,
        tool_calls=state.global_tool_call_count,
    )

    infos_by_id = {info.id: info for info in artifacts}
    for agent in agents:
        agent.artifacts = _artifact_tuples(agent, infos_by_id)

    # Build name -> persona map from child states for transcript coloring.
    # child_states holds plain dicts, and a transcript row may be labelled with any
    # of the child's identifiers, so map every one of them onto the persona.
    persona_map: dict[str, str] = {}
    for raw in state.child_states:
        p = str(raw.get("persona") or "").strip()
        if not p:
            continue
        for key in ("canonical_name", "name", "task_id"):
            name = str(raw.get(key) or "").strip()
            if name:
                persona_map[name] = p
    # Root orchestrator entry, if not already covered.
    root_name = str(getattr(state, "orchestrator_name", "") or "orchestrator").strip()
    if root_name and root_name not in persona_map:
        persona_map[root_name] = root_persona

    tokens = state.global_token_usage.total_tokens
    if not tokens and state.token_usage:
        tokens = int(state.token_usage.get("prompt_tokens", 0)) + int(
            state.token_usage.get("completion_tokens", 0)
        )
    breakdown: dict[str, int] = {}
    for metrics in state.agent_metrics.values():
        for tool, count in metrics.tool_calls.items():
            breakdown[tool] = breakdown.get(tool, 0) + count

    pending_questions = copy.deepcopy(getattr(state, "pending_questions", None))
    transcript = list(
        _project_transcript(
            state.transcript_events,
            getattr(state, "ui_edit_diffs", []) or [],
            persona_map=persona_map,
            session_live=state.execution_status == "running",
        )
    )
    if pending_questions:
        steps = pending_questions.get("steps", [])
        first_title = str(steps[0].get("title", "?")) if steps else "?"
        step_count = len(steps)
        transcript.append(
            TranscriptEvent(
                timestamp="",
                role=str(pending_questions.get("agent_id", "")),
                text=f"{step_count} step{'s' if step_count != 1 else ''} — {first_title}",
                kind="question_stepper",
            )
        )

    pending_approvals = _project_pending_approvals(state)
    for approval in pending_approvals:
        summary = approval.get("command") or approval.get("tool_name", "")
        transcript.append(
            TranscriptEvent(
                timestamp="",
                role=str(approval.get("agent_id", "")),
                text=f"Approval needed — {summary}",
                kind="approval",
            )
        )

    return SessionProjection(
        session_name=state.session_id,
        session_status=state.execution_status,
        worktree_branch=(str(getattr(getattr(state, "worktree", None), "branch", "") or "")),
        active_model=active_model,
        run=run,
        transcript=tuple(transcript),
        agents=tuple(agents),
        artifacts=tuple(artifacts),
        todos=tuple(
            _todos_from_state(getattr(state, "agent_todo_state", None) or state.todo_state)
        ),
        kpis=KpiSnapshot(
            cumulative_tokens=tokens,
            cumulative_cost_label=format_cost(_cost_snapshot(state)),
            tool_calls=state.global_tool_call_count,
            tool_call_breakdown=sorted(breakdown.items(), key=lambda item: -item[1])[:5],
            files_touched=context.files_touched,
            uncommitted=context.uncommitted,
        ),
        pending_questions=pending_questions,
        pending_approvals=pending_approvals,
        verifier=verifier,
    )


@traces(SWR.SWR_2609)
def _project_verifier(state: Any) -> VerifierSummary:
    """Freeze the snapshot's in-flight check suite, or report an idle verifier.

    A malformed payload resolves to the idle summary rather than raising: the
    verification indicator is progress reporting, and a broken one must not be
    able to stop the workspace from rendering the run it describes.
    """
    warning = str(getattr(state, "gate_warning", "") or "")
    payload = getattr(state, "verifier_state", None)
    if not isinstance(payload, dict) or not payload.get("active"):
        # The gate warning survives an idle verifier on purpose (SWR-2615): a run
        # with no suite has nothing in flight, and that is exactly the run whose
        # silence would otherwise read as "verified".
        return VerifierSummary(gate_warning=warning)
    try:
        return VerifierSummary(
            active=True,
            check=str(payload.get("check", "") or ""),
            command=str(payload.get("command", "") or ""),
            index=int(payload.get("index", 0) or 0),
            total=int(payload.get("total", 0) or 0),
            started_at=float(payload.get("started_at", 0.0) or 0.0),
            deadline_s=float(payload.get("deadline_s", 0.0) or 0.0),
            gate_warning=warning,
        )
    except (TypeError, ValueError):
        return VerifierSummary(active=True, gate_warning=warning)


@traces(SWR.SWR_2504)
def _project_pending_approvals(state: Any) -> tuple[dict[str, Any], ...]:
    """Freeze the snapshot's pending approvals into insertion order."""
    pending = getattr(state, "pending_approvals", None)
    if not isinstance(pending, dict):
        return ()
    return tuple(
        copy.deepcopy(payload) for payload in pending.values() if isinstance(payload, dict)
    )


class SessionProjectionReader:
    """Worker-owned reader and artifact cache; safe to keep off the Qt thread."""

    def __init__(self, workspace: Path, config: Any) -> None:
        from rotaris_core.session.manager import SessionManager

        self._manager = SessionManager(workspace)
        self._config = config
        self._artifact_store: Any | None = None
        self._artifact_cache_key: tuple[str, int] | None = None

    def read(
        self,
        session_id: str,
        context: SessionProjectionContext,
    ) -> SessionProjectionRead:
        started = time.perf_counter()
        state = self._manager.read_session_snapshot(session_id)
        loaded = time.perf_counter()
        projection = build_session_projection(
            state,
            self._config,
            context,
            self._artifact_infos(session_id),
        )
        finished = time.perf_counter()
        return SessionProjectionRead(
            projection=projection,
            load_ms=(loaded - started) * 1000,
            projection_ms=(finished - loaded) * 1000,
        )

    def _artifact_infos(self, session_id: str) -> list[ArtifactInfo]:
        from rotaris_core.orchestrator.artifacts import SessionArtifactStore

        from rotaris.services.config_service import _relative_time

        session_dir = self._manager.session_dir(session_id)
        index_path = session_dir / "artifacts" / SessionArtifactStore.INDEX_FILENAME
        try:
            mtime = index_path.stat().st_mtime_ns
        except OSError:
            mtime = 0
        key = (session_id, mtime)
        if self._artifact_store is None or self._artifact_cache_key != key:
            store = SessionArtifactStore(session_dir)
            store.hydrate()
            self._artifact_store = store
            self._artifact_cache_key = key
        return [
            ArtifactInfo(
                id=record.id,
                slug=record.slug,
                title=record.title,
                kind=record.kind,
                status=record.status,
                persona=record.source_persona or "",
                producer=record.canonical_name or record.created_by or "",
                summary=record.summary,
                created_label=_relative_time(record.created_at),
                edited=record.edited_at is not None,
            )
            for record in self._artifact_store.list(include_superseded=False)
        ]
