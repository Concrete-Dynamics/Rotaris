"""Manages child task lifecycle, dependency DAG, and name deduplication."""

from __future__ import annotations

import datetime as dt
import hashlib
import logging
import queue
import re
import threading
import time
from typing import TYPE_CHECKING

from rotaris_core.orchestrator.child_state import (
    ChildLaunchClaim,
    ChildNotification,
    ChildTaskRecord,
    ChildTaskState,
)
from rotaris_core.orchestrator.wait_barrier import WaitBarrier
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.config.schema import RuntimePolicy
    from rotaris_core.orchestrator.artifacts import SessionArtifactStore
    from rotaris_core.orchestrator.report import ChildReportArtifact

    SpawnNotificationCallback = Callable[[ChildTaskRecord], None]
    TerminalStateCallback = Callable[[ChildTaskRecord], None]

_MAX_CANONICAL_NAME_CHARS = 80
_CANONICAL_NAME_SAFE_CHARS = re.compile(r"[^A-Za-z0-9_.-]+")
_log = logging.getLogger(__name__)


@traces(
    SWR.SWR_2132,
    SWR.SWR_1511,
    SWR.SWR_1513,
    SWR.SWR_1514,
    SWR.SWR_103,
    SWR.SWR_106,
    SWR.SWR_107,
    SWR.SWR_108,
    SWR.SWR_109,
    SWR.SWR_111,
    SWR.SWR_112,
    SWR.SWR_128,
    SWR.SWR_139,
    SWR.SWR_140,
    SWR.SWR_177,
    SWR.SWR_561,
    SWR.SWR_2433,
)
class ChildManager:
    """Manages the set of child tasks for a single parent agent."""

    def __init__(
        self,
        parent_agent_id: str,
        current_depth: int,
        policy: RuntimePolicy,
        spawn_notification_callback: SpawnNotificationCallback | None = None,
        artifact_store: SessionArtifactStore | None = None,
        terminal_state_callback: TerminalStateCallback | None = None,
    ):
        self._parent_id = parent_agent_id
        self._depth = current_depth
        self._policy = policy
        self._spawn_notification_callback = spawn_notification_callback
        self._terminal_state_callback = terminal_state_callback
        self._artifact_store = artifact_store
        # canonical_name → record
        self._children: dict[str, ChildTaskRecord] = {}
        # canonical_name → report
        self._reports: dict[str, ChildReportArtifact] = {}
        self._name_counters: dict[str, int] = {}  # base_name → next counter
        # canonical names parent has seen
        self._observed_terminal: set[str] = set()
        self._lock = threading.Lock()
        self.results_by_task_id: dict[str, ChildReportArtifact] = {}
        self.pending_notifications: queue.SimpleQueue[ChildNotification] = queue.SimpleQueue()
        self._version: int = 0
        self._cached_snapshot: list[ChildTaskRecord] | None = None
        # Per-model delegation queue: model_key → list of canonical names waiting for a slot.
        self._model_slot_queues: dict[str, list[str]] = {}
        # Per-model max_parallel caps, populated by the delegate tool at enqueue time.
        self._model_max_parallel: dict[str, int] = {}
        # Explicit wait_for_tasks ↔ drain handshake (see wait_barrier.py).
        self.wait_barrier = WaitBarrier()

    def _bump_version(self) -> None:
        """Invalidate cached snapshot on any child mutation."""
        self._version += 1
        self._cached_snapshot = None

    def bump_version(self) -> None:
        """Public invalidation for callers that mutate child state outside ChildManager."""
        self._bump_version()

    @property
    def artifact_store(self) -> SessionArtifactStore | None:
        """Session-scoped artifact store (shared across iterations) or None."""
        return self._artifact_store

    @property
    def parent_agent_id(self) -> str:
        """Canonical identifier of the manager's root parent."""
        return self._parent_id

    def _resolve_dep(self, dep: str) -> str:
        """Resolve a dependency identifier to its canonical name.

        Accepts a task_id (format ``bg_XXXXXXXX``) and maps it to the canonical
        name of the corresponding child record.  Non-task_id strings are passed
        through unchanged (treated as canonical names for internal/test use).

        Raises ValueError if a task_id is supplied but no matching child exists.
        Must be called while self._lock is held.
        """
        if not dep.startswith("bg_"):
            return dep
        for record in self._children.values():
            if record.task_id == dep:
                return record.canonical_name
        raise ValueError(
            f"Unknown task_id in depends_on: {dep!r}. "
            "Ensure the referenced task was spawned before declaring this dependency.",
        )

    def spawn_child(
        self,
        name: str,
        persona: str,
        task_payload: str,
        depends_on: list[str] | None = None,
        inherited_context: list[str] | None = None,
        category: str | None = None,
        session_id: str | None = None,
        run_in_background: bool = False,
        produced_artifact_ids: list[str] | None = None,
        received_artifact_ids: list[str] | None = None,
        model_key: str | None = None,
        parent_agent_id: str | None = None,
    ) -> ChildTaskRecord:
        """Register a new child task. Deduplicates name if needed.

        Validations:
        - self._depth + 1 <= policy.max_depth  (depth exceeded → ValueError)
        - len(self._children) < policy.max_children  (too many total → ValueError)
        - len(active non-terminal children) < policy.max_active_children  (too many active → ValueError)
        - Each entry in depends_on must be a task_id (``bg_XXXXXXXX``, as returned by a prior
          delegation) of a known sibling.  Task_ids are normalised to canonical names before
          storage so all downstream logic remains canonical-name keyed.
        - No dependency cycles (cycle → ValueError)

        If depends_on is non-empty, initial state = WAITING_ON_DEPENDENCIES.
        Otherwise initial state = QUEUED.

        When all dependencies have SUCCEEDED the framework automatically prepends their
        summary and key findings to this task's payload (see resolve_ready_children).

        ``model_key`` is the resolved model config key for per-model concurrency tracking.
        When supplied, it is stored on the record so ``resolve_ready_children`` can gate
        QUEUED → RUNNING on model slot availability.

        Returns ChildTaskRecord with canonical name assigned.
        """
        callback = self._spawn_notification_callback
        with self._lock:
            if self._depth + 1 > self._policy.max_depth:
                raise ValueError(f"Max depth {self._policy.max_depth} exceeded")

            if len(self._children) >= self._policy.max_children:
                raise ValueError(f"Max total children {self._policy.max_children} exceeded")

            if self.active_count >= self._policy.max_active_children:
                raise ValueError(f"Max active children {self._policy.max_active_children} exceeded")

            effective_parent_id = (
                parent_agent_id if parent_agent_id is not None else self._parent_id
            )

            # Normalise task_ids → canonical names before any further validation.
            depends_on = [self._resolve_dep(d) for d in (depends_on or [])]
            for dep in depends_on:
                if dep not in self._children:
                    known = ", ".join(self._children.keys()) if self._children else "none"
                    raise ValueError(f"Unknown dependency: {dep!r}. Known task names: {known}")
                dependency = self._children[dep]
                if dependency.parent_agent_id != effective_parent_id:
                    raise ValueError(
                        f"Dependency {dep!r} belongs to parent "
                        f"{dependency.parent_agent_id!r}; expected {effective_parent_id!r}",
                    )

            canonical_base = self._canonicalize_name(name)
            canonical_name = self._deduplicate_name(canonical_base)

            if self._detect_cycles(canonical_name, depends_on):
                raise ValueError("Dependency cycle detected")

            state = ChildTaskState.WAITING_ON_DEPENDENCIES if depends_on else ChildTaskState.QUEUED
            task_id = self._generate_task_id(canonical_name)

            record = ChildTaskRecord(
                name=name,
                canonical_name=canonical_name,
                persona=persona,
                task_payload=task_payload,
                depends_on=depends_on,
                inherited_context=list(inherited_context or []),
                state=state,
                parent_agent_id=effective_parent_id,
                depth=self._depth + 1,
                spawned_at=dt.datetime.now(dt.UTC),
                category=category,
                session_id=session_id,
                run_in_background=run_in_background,
                task_id=task_id,
                produced_artifact_ids=list(produced_artifact_ids or []),
                received_artifact_ids=list(received_artifact_ids or []),
                model_key=model_key,
            )
            self._children[canonical_name] = record
            self._bump_version()
        if callback is not None:
            try:
                callback(record)
            except Exception:  # noqa: BLE001
                _log.exception(
                    "Child spawn notification callback failed for child %s",
                    record.canonical_name,
                )
        return record

    def _format_dependency_context(self, dep_canonical_names: list[str]) -> str:
        """Build a PRIOR AGENT CONTEXT block from completed dependency reports.

        Completed dependency reports are forwarded as compact summary + key findings.
        Verbatim last replies remain available through background_output with
        detail_level="verbatim"; they are not injected automatically because they often
        duplicate key_findings and can balloon downstream prompts.

        Returns an empty string when no reports are available yet (guards edge cases
        where resolve_ready_children races ahead of report storage).
        """
        blocks: list[str] = []
        for dep in dep_canonical_names:
            report = self._reports.get(dep)
            if report is None:
                continue
            dep_record = self._children.get(dep)
            persona = dep_record.persona if dep_record else "unknown"
            blocks.append(self._format_single_report_block(dep, persona, report))
        if not blocks:
            return ""
        return (
            "PRIOR AGENT CONTEXT: (authoritative — trust these findings; do NOT "
            "re-explore files, paths, or patterns already named below unless "
            "verifying a specific edit)\n\n" + "\n\n".join(blocks) + "\n\n---\n\n"
        )

    @classmethod
    def _format_single_report_block(
        cls,
        dep: str,
        persona: str,
        report: ChildReportArtifact,
    ) -> str:
        response = report.final_response or report.last_response
        lines = [f"=== {dep} (persona: {persona}) [{report.status}] ==="]
        if response:
            lines.extend(["RESULT:", response])
        else:
            lines.append("RESULT: No assistant response was captured.")
        return "\n".join(lines)

    @traces(SWR.SWR_368)
    def build_inherited_context_block(self, inherited_task_ids: list[str]) -> str:
        """Return a PRIOR AGENT CONTEXT block for already-completed sibling task_ids.

        Used by the delegate tool's ``inherited_context`` field. Only succeeded tasks
        contribute to the block; pending, failed, cancelled, or unknown task_ids are
        skipped silently so the orchestrator can opportunistically forward whatever
        context exists.

        Raises ValueError only on a malformed entry (empty string).
        """
        if not inherited_task_ids:
            return ""
        with self._lock:
            canonical_names: list[str] = []
            seen: set[str] = set()
            for task_id in inherited_task_ids:
                if not task_id:
                    raise ValueError("inherited_context entries must be non-empty task_ids")
                # Map task_id → canonical_name; skip silently if no match or not succeeded.
                match = next(
                    (r for r in self._children.values() if r.task_id == task_id),
                    None,
                )
                if match is None:
                    continue
                if match.state != ChildTaskState.SUCCEEDED:
                    continue
                if match.canonical_name in seen:
                    continue
                if match.canonical_name not in self._reports:
                    continue
                seen.add(match.canonical_name)
                canonical_names.append(match.canonical_name)
            if not canonical_names:
                return ""
            return self._format_dependency_context(canonical_names)

    def resolve_ready_children(self) -> list[ChildTaskRecord]:
        """Return children that are QUEUED and have all dependencies SUCCEEDED.

        Also transitions WAITING_ON_DEPENDENCIES → QUEUED when deps are all SUCCEEDED,
        and WAITING_ON_MODEL_SLOT → QUEUED when the model has a free concurrency slot.

        When a child becomes ready its task_payload is prefixed with a PRIOR AGENT CONTEXT
        block containing the summary and key findings of every succeeded dependency.
        """
        with self._lock:
            ready = []
            changed = False
            for record in self._children.values():
                if record.state == ChildTaskState.WAITING_ON_DEPENDENCIES:
                    all_succeeded = all(
                        self._children[dep].state == ChildTaskState.SUCCEEDED
                        for dep in record.depends_on
                    )
                    if all_succeeded:
                        context_block = self._format_dependency_context(record.depends_on)
                        if context_block:
                            record.task_payload = context_block + record.task_payload
                        record.transition(ChildTaskState.QUEUED)
                        changed = True
                if record.state == ChildTaskState.WAITING_ON_MODEL_SLOT:
                    model_key = record.model_key
                    if model_key:
                        active = self._count_model_active_locked(model_key)
                        max_parallel = self._model_max_parallel.get(model_key)
                        if max_parallel is not None and active < max_parallel:
                            record.transition(ChildTaskState.QUEUED)
                            changed = True
                            ready.append(record)
                            continue
                if record.state == ChildTaskState.QUEUED:
                    ready.append(record)

            if changed:
                self._bump_version()
            return ready

    @traces(SWR.SWR_177)
    def claim_ready_children(self, parent_agent_id: str | None = None) -> list[ChildLaunchClaim]:
        """Atomically reserve every ready direct child for one launcher.

        The transition to ``STARTING`` happens while the manager lock is held.
        This reserves both the child and its model slot before agent construction
        yields control to another drain path.
        """
        owner = parent_agent_id if parent_agent_id is not None else self._parent_id
        claims: list[ChildLaunchClaim] = []
        changed = False
        with self._lock:
            for record in self._children.values():
                if record.parent_agent_id != owner:
                    continue

                if record.state == ChildTaskState.WAITING_ON_DEPENDENCIES:
                    all_succeeded = all(
                        self._children[dep].state == ChildTaskState.SUCCEEDED
                        for dep in record.depends_on
                    )
                    if all_succeeded:
                        context_block = self._format_dependency_context(record.depends_on)
                        if context_block:
                            record.task_payload = context_block + record.task_payload
                        record.transition(ChildTaskState.QUEUED)
                        changed = True

                if record.state == ChildTaskState.WAITING_ON_MODEL_SLOT:
                    model_key = record.model_key
                    max_parallel = self._model_max_parallel.get(model_key or "")
                    if (
                        model_key
                        and max_parallel is not None
                        and self._count_model_active_locked(model_key) < max_parallel
                    ):
                        record.transition(ChildTaskState.QUEUED)
                        queue_for_model = self._model_slot_queues.get(model_key, [])
                        if record.canonical_name in queue_for_model:
                            queue_for_model.remove(record.canonical_name)
                        changed = True

                if record.state != ChildTaskState.QUEUED:
                    continue

                model_key = record.model_key
                max_parallel = self._model_max_parallel.get(model_key or "")
                if (
                    model_key
                    and max_parallel is not None
                    and self._count_model_active_locked(model_key) >= max_parallel
                ):
                    record.transition(ChildTaskState.WAITING_ON_MODEL_SLOT)
                    model_queue = self._model_slot_queues.setdefault(model_key, [])
                    if record.canonical_name not in model_queue:
                        model_queue.append(record.canonical_name)
                    changed = True
                    continue

                record.launch_generation += 1
                record.transition(ChildTaskState.STARTING)
                claims.append(
                    ChildLaunchClaim(
                        canonical_name=record.canonical_name,
                        task_id=record.task_id,
                        parent_agent_id=owner,
                        generation=record.launch_generation,
                    ),
                )
                changed = True

            if changed:
                self._bump_version()
        return claims

    def _claim_matches_locked(self, claim: ChildLaunchClaim) -> ChildTaskRecord | None:
        record = self._children.get(claim.canonical_name)
        if record is None:
            return None
        if (
            record.state != ChildTaskState.STARTING
            or record.parent_agent_id != claim.parent_agent_id
            or record.launch_generation != claim.generation
            or record.task_id != claim.task_id
        ):
            return None
        return record

    @traces(SWR.SWR_177)
    def record_for_launch_claim(self, claim: ChildLaunchClaim) -> ChildTaskRecord | None:
        """Return the live record while *claim* still owns its STARTING state."""
        with self._lock:
            return self._claim_matches_locked(claim)

    @traces(SWR.SWR_177)
    def transition_launch_claim(
        self,
        claim: ChildLaunchClaim,
        state: ChildTaskState,
    ) -> ChildTaskRecord | None:
        """Commit a current claim to a launched or terminal state."""
        if state not in {
            ChildTaskState.RUNNING,
            ChildTaskState.FAILED,
            ChildTaskState.CANCELLED,
        }:
            raise ValueError(f"Unsupported launch-claim target state: {state}")
        with self._lock:
            record = self._claim_matches_locked(claim)
            if record is None:
                return None
            record.transition(state)
            self._bump_version()
            return record

    def mark_child_terminal(
        self,
        canonical_name: str,
        state: ChildTaskState,
        report: ChildReportArtifact,
    ) -> None:
        """Move child to terminal state and store report.

        If a child FAILED or CANCELLED, cascade BLOCKED to any children that depend on it.
        Enqueues a ChildNotification for background-flagged children.
        """
        terminal_records: list[ChildTaskRecord] = []
        with self._lock:
            if canonical_name not in self._children:
                raise ValueError(f"Unknown child: {canonical_name}")

            record = self._children[canonical_name]

            if record.state != state:
                record.transition(state)
            terminal_records.append(record.model_copy(deep=True))

            self._reports[canonical_name] = report
            self._bump_version()

            if record.task_id:
                self.results_by_task_id[record.task_id] = report

            if record.run_in_background and record.task_id:
                duration_s = 0.0
                if record.spawned_at is not None:
                    elapsed = dt.datetime.now(dt.UTC) - record.spawned_at
                    duration_s = elapsed.total_seconds()
                still_running = sum(
                    1
                    for c in self._children.values()
                    if not c.state.is_terminal() and c.canonical_name != canonical_name
                )
                notification = ChildNotification(
                    task_id=record.task_id,
                    canonical_name=canonical_name,
                    description=record.name,
                    state=state,
                    duration_s=duration_s,
                    still_running_count=still_running,
                    artifact_ids=list(record.produced_artifact_ids),
                )
                self.pending_notifications.put(notification)

            if state in (ChildTaskState.FAILED, ChildTaskState.CANCELLED):
                terminal_records.extend(self._cascade_blocked(canonical_name))

            # Release a model slot so the next queued child can proceed.
            model_key = record.model_key
            if model_key:
                self._release_model_slot_locked(model_key)

        callback = self._terminal_state_callback
        if callback is not None:
            for terminal_record in terminal_records:
                try:
                    callback(terminal_record)
                except Exception:  # noqa: BLE001
                    _log.exception(
                        "Terminal-state callback failed for child %s",
                        terminal_record.canonical_name,
                    )

        # Child results are deliberately session-ephemeral. Only an explicit
        # artifact_write call creates a durable artifact-store record.
        return

    @traces(SWR.SWR_2912)
    def finalize_incomplete(self, reason: str) -> list[str]:
        """Close every record that never reached a terminal state. Idempotent.

        Called when the iteration that owns this manager is over and nothing
        further will move its records — a cancellation, or a crash. Without it a
        child that was spawned but never dispatched stays ``queued`` in the
        session snapshot for ever, and every host that reads the snapshot back
        reports it as part of a run that has ended (SWR-2906).

        ``CANCELLED`` is not a choice among several: it is the one terminal
        state ``VALID_TRANSITIONS`` allows from *every* non-terminal state, so
        it is the only sweep that cannot raise partway through.

        Routed through :meth:`mark_child_terminal` rather than transitioning the
        records directly, so a swept child releases its model slot, cascades
        ``BLOCKED`` to its dependents, and reaches the terminal-state callback
        exactly as an ordinarily-finished one does — that callback is what the
        hosts persist from.

        Returns the canonical names it closed, oldest first.
        """
        from rotaris_core.orchestrator.report import ChildReportArtifact  # noqa: PLC0415

        with self._lock:
            pending = [
                (record.canonical_name, record.persona)
                for record in self._children.values()
                if not record.state.is_terminal()
            ]

        closed: list[str] = []
        for canonical_name, persona in pending:
            with self._lock:
                record = self._children.get(canonical_name)
                # Re-checked per record, not once up front: closing one child
                # cascades BLOCKED onto its dependents, so a name that was
                # pending when the list was taken can already be terminal by the
                # time the sweep reaches it. Marking it again would overwrite the
                # report that explains why it really ended.
                already_done = record is None or record.state.is_terminal()
            if already_done:
                continue
            self.mark_child_terminal(
                canonical_name,
                ChildTaskState.CANCELLED,
                ChildReportArtifact(
                    agent_name=canonical_name,
                    persona=persona,
                    status="cancelled",
                    summary=reason,
                ),
            )
            closed.append(canonical_name)
        return closed

    def register_produced_artifact(self, canonical_name: str, artifact_id: str) -> None:
        """Record an agent-authored artifact against a live child task."""
        with self._lock:
            record = self._children.get(canonical_name)
            if record is None:
                raise ValueError(f"Unknown child: {canonical_name}")
            if artifact_id in record.produced_artifact_ids:
                return
            record.produced_artifact_ids.append(artifact_id)
            self._bump_version()

    def _cascade_blocked(self, failed_canonical_name: str) -> list[ChildTaskRecord]:
        """Helper to block children that depend on a failed/cancelled/blocked child."""
        blocked_records: list[ChildTaskRecord] = []
        for record in self._children.values():
            if (
                record.state
                in (
                    ChildTaskState.WAITING_ON_DEPENDENCIES,
                    ChildTaskState.QUEUED,
                    ChildTaskState.WAITING_ON_MODEL_SLOT,
                )
                and failed_canonical_name in record.depends_on
            ):
                # Transition requires QUEUED, WAITING_ON_DEPENDENCIES, or
                # WAITING_ON_MODEL_SLOT to BLOCKED.
                record.transition(ChildTaskState.BLOCKED)
                self._bump_version()
                blocked_records.append(record.model_copy(deep=True))
                # Recursively block things depending on this one
                blocked_records.extend(self._cascade_blocked(record.canonical_name))
        return blocked_records

    def get_newly_terminal(self) -> list[tuple[ChildTaskRecord, ChildReportArtifact]]:
        """Return terminal children that parent hasn't observed yet. Mark as observed."""
        newly_terminal = []
        for canonical_name, record in self._children.items():
            if record.state.is_terminal() and canonical_name not in self._observed_terminal:
                report = self._reports.get(canonical_name)
                if report:
                    newly_terminal.append((record, report))
                self._observed_terminal.add(canonical_name)
        return newly_terminal

    def get_all_children_summary(self) -> list[dict[str, str]]:
        """Return summary dicts of all children for parent resume message.
        Each dict: {"canonical_name": ..., "persona": ..., "state": ..., "summary": ...}
        """
        summaries = []
        for canonical_name, record in self._children.items():
            report = self._reports.get(canonical_name)
            summary_text = report.summary if report else ""
            summaries.append(
                {
                    "canonical_name": canonical_name,
                    "persona": record.persona,
                    "state": record.state.value,
                    "summary": summary_text,
                },
            )
        return summaries

    def snapshot_children(self) -> list[ChildTaskRecord]:
        """Return a thread-safe copy of the current child records (cached)."""
        with self._lock:
            if self._cached_snapshot is not None:
                return self._cached_snapshot
            snapshot = [record.model_copy(deep=True) for record in self._children.values()]
            self._cached_snapshot = snapshot
            return snapshot

    def rebind_parent(self, parent_agent_id: str) -> None:
        """Update the parent agent id used for subsequently spawned children."""
        with self._lock:
            self._parent_id = parent_agent_id
            self._bump_version()

    def get_pending_notifications(self) -> list[ChildNotification]:
        """Non-blocking drain of the notification queue."""
        notifications: list[ChildNotification] = []
        while True:
            try:
                notifications.append(self.pending_notifications.get_nowait())
            except queue.Empty:
                break
        return notifications

    def discard_notifications(self, task_ids: set[str]) -> None:
        """Drop pending notifications for tasks already reported to the parent.

        The drain calls this after delivering a child's report through a
        wait-barrier or foreground resume so the same completion is not
        re-announced as a "[BACKGROUND TASK COMPLETED]" notification.
        """
        if not task_ids:
            return
        for notification in self.get_pending_notifications():
            if notification.task_id not in task_ids:
                self.pending_notifications.put(notification)

    def get_record_by_task_id(self, task_id: str) -> ChildTaskRecord | None:
        with self._lock:
            for record in self._children.values():
                if record.task_id == task_id:
                    return record
            return None

    def _generate_task_id(self, canonical_name: str) -> str:
        raw = f"{canonical_name}{time.monotonic_ns()}"
        digest = hashlib.md5(raw.encode(), usedforsecurity=False).hexdigest()[:8]
        return f"bg_{digest}"

    def _canonicalize_name(self, name: str) -> str:
        """Normalize human task names into compact stable child identifiers."""
        collapsed = " ".join(name.strip().split())
        if not collapsed:
            collapsed = "task"
        normalized = _CANONICAL_NAME_SAFE_CHARS.sub("-", collapsed).strip("-._")
        if not normalized:
            normalized = "task"
        if len(normalized) > _MAX_CANONICAL_NAME_CHARS:
            suffix = hashlib.md5(normalized.encode(), usedforsecurity=False).hexdigest()[:8]
            head = normalized[: _MAX_CANONICAL_NAME_CHARS - len(suffix) - 1].rstrip("-._")
            normalized = f"{head}-{suffix}" if head else suffix
        return normalized

    def _deduplicate_name(self, name: str) -> str:
        """If name exists in _children, return name_N with lowest available N (starting from 1).
        First use of a name returns it unchanged.
        """
        if name not in self._children and name not in self._name_counters:
            self._name_counters[name] = 1
            return name

        counter = self._name_counters.get(name, 1)
        while True:
            deduped = f"{name}_{counter}"
            counter += 1
            if deduped not in self._children:
                self._name_counters[name] = counter
                return deduped

    def _detect_cycles(self, name: str, depends_on: list[str]) -> bool:
        """DFS cycle detection. Returns True if adding these edges would create a cycle.
        Build adjacency from existing children's depends_on + the new edges.
        """
        # Adjacency list: node -> list of dependencies
        adj: dict[str, list[str]] = {
            node: record.depends_on.copy() for node, record in self._children.items()
        }
        adj[name] = depends_on.copy()

        visited: set[str] = set()
        stack: set[str] = set()

        def has_cycle(node: str) -> bool:
            if node in stack:
                return True
            if node in visited:
                return False

            visited.add(node)
            stack.add(node)

            for dep in adj.get(node, []):
                if has_cycle(dep):
                    return True

            stack.remove(node)
            return False

        # Start from the new node since existing graph is acyclic
        return has_cycle(name)

    @property
    def active_count(self) -> int:
        """Count of non-terminal children that are actively consuming resources.

        ``WAITING_ON_MODEL_SLOT`` children are excluded: they are idle, waiting
        for a model concurrency slot rather than consuming an LLM connection.
        """
        return sum(1 for c in self._children.values() if c.state.counts_as_active())

    @property
    def all_terminal(self) -> bool:
        """True if all children are in terminal states."""
        return (
            all(c.state.is_terminal() for c in self._children.values()) if self._children else True
        )

    # -- Per-model concurrency queue ---------------------------------------

    def _count_model_active_locked(self, model_key: str) -> int:
        """Count children using *model_key* that are actively consuming an LLM slot.

        Counts STARTING and RUNNING states. A STARTING child owns its slot while
        its agent is being constructed.

        Must be called while ``self._lock`` is held.
        """
        return sum(
            1
            for c in self._children.values()
            if c.model_key == model_key
            and c.state in {ChildTaskState.STARTING, ChildTaskState.RUNNING}
        )

    def enqueue_model_slot(
        self,
        canonical_name: str,
        model_key: str,
        max_parallel: int,
    ) -> bool:
        """Attempt to assign a model concurrency slot to *canonical_name*.

        Returns ``True`` if the child was queued (slot not available),
        ``False`` if a slot was available (child stays in QUEUED / proceeds normally).

        When queued the child transitions to ``WAITING_ON_MODEL_SLOT`` and waits
        for ``_release_model_slot_locked`` to be called when a sibling finishes.
        """
        with self._lock:
            record = self._children.get(canonical_name)
            if record is None:
                return False
            self._model_max_parallel[model_key] = max_parallel
            active = self._count_model_active_locked(model_key)
            if active < max_parallel:
                return False
            if record.state not in (
                ChildTaskState.QUEUED,
                ChildTaskState.WAITING_ON_DEPENDENCIES,
            ):
                return False
            record.transition(ChildTaskState.WAITING_ON_MODEL_SLOT)
            self._model_slot_queues.setdefault(model_key, []).append(canonical_name)
            self._bump_version()
            return True

    def _release_model_slot_locked(self, model_key: str) -> None:
        """Dequeue the next ``WAITING_ON_MODEL_SLOT`` child for *model_key*.

        Transitions the dequeued child to QUEUED so ``resolve_ready_children``
        can pick it up on the next drain cycle.

        Must be called while ``self._lock`` is held.
        """
        queue = self._model_slot_queues.get(model_key)
        if not queue:
            return
        # Prune stale entries (children that were cancelled / blocked externally).
        while queue:
            canonical_name = queue.pop(0)
            record = self._children.get(canonical_name)
            if record is not None and record.state == ChildTaskState.WAITING_ON_MODEL_SLOT:
                record.transition(ChildTaskState.QUEUED)
                self._bump_version()
                return
        # All entries were stale; clean up the now-empty queue key.
        if not queue:
            self._model_slot_queues.pop(model_key, None)
