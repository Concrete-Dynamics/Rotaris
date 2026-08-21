"""Restoring a session's working tree to a recorded checkpoint (SWR-2437).

:mod:`rotaris_core.session.checkpoints` knows how to move bytes; this module is
the policy around *rolling back* to one of those checkpoints, and it is written
for a graphical caller first — Rotaris is the primary interface for SWR-2437 and
the CLI subcommand is the headless equivalent of the same two calls.

The shape that policy takes is deliberately two-step:

1. :meth:`CheckpointRestorer.preview` answers "what would change, and is anything
   of mine in the way?" without touching the tree, so the caller can show the
   diff summary *before* asking for confirmation.
2. :meth:`CheckpointRestorer.restore` performs it, recording a ``pre_restore``
   safety checkpoint of the current tree first so the rollback can be rolled
   back.

Neither raises: a refusal is a populated ``blocked_reason`` on the returned
value, never an exception, because "you have uncommitted work in the way" is a
thing to render in a dialog, not a traceback.
"""

from __future__ import annotations

import datetime as dt
import logging
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.events import CheckpointCreatedEvent, CheckpointRestoredEvent, publish
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.session.checkpoint_service import load_checkpoints
from rotaris_core.session.checkpoints import CheckpointEngine, CheckpointError
from rotaris_core.session.diagnostics import SessionDiagnostics
from rotaris_core.session.state import SessionCheckpoint

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence

    from rotaris_core.session.checkpoints import CheckpointDiffEntry, CheckpointRef
    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.state import SessionState

__all__ = [
    "RESTORE_ACTIONS",
    "CheckpointRestorer",
    "RestorePreview",
    "RestoreResult",
    "format_checkpoint_rows",
    "format_preview_lines",
    "restore_action",
]

_log = logging.getLogger(__name__)

#: Actor attributed to every restore diagnostic, matching ``CheckpointService``
#: so a session's checkpoint story reads as one thread.
_ACTOR = "checkpoints"

#: Timeline event type for a completed restore.
_TIMELINE_EVENT = "checkpoint_restored"

#: Issue kind for a blocked or failed restore.
_ISSUE_KIND = "checkpoint_restore"

#: What a restore *does* to a path, keyed by the engine's status letter.
#:
#: The engine reports status the way ``git diff <commit>`` does — relative to
#: the checkpoint — so ``"A"`` means "present now, absent in the checkpoint",
#: which a restore **deletes**, and ``"D"`` means "in the checkpoint, gone now",
#: which a restore **recreates**. Anything user-facing has to invert those two
#: or it tells the user the exact opposite of what will happen; this mapping is
#: the single place that inversion lives.
RESTORE_ACTIONS: Mapping[str, str] = {
    "A": "delete",
    "D": "recreate",
    "M": "overwrite",
    "R": "rename",
}

_HEADER_ROW = f"{'SEQ':>4}  {'CREATED':<25}  {'ITER':>4}  {'FILES':>5}  KIND"

#: How many recorded checkpoints ``_drift_baseline`` may compare the working
#: tree against before settling for the newest one. Each comparison stages the
#: whole tree, so this is a latency bound on ``preview`` for a UI that previews
#: on selection.
_DRIFT_BASELINE_LOOKBACK = 10


@traces(SWR.SWR_2437)
def restore_action(status: str) -> str:
    """The user-facing verb for a diff entry's *status*, with A/D inverted.

    See :data:`RESTORE_ACTIONS`. An unknown letter degrades to ``"change"``
    rather than guessing, because a wrong verb here is a user restoring the
    wrong thing.
    """
    return RESTORE_ACTIONS.get(status[:1].upper(), "change")


@dataclass(frozen=True, slots=True)
class RestorePreview:
    """What restoring one checkpoint would do, computed without touching the tree."""

    #: The recorded checkpoint the preview is about.
    checkpoint: SessionCheckpoint
    #: Paths that differ, in the *engine's* direction: ``"A"`` means a restore
    #: removes the path. Use :func:`restore_action` before showing this to a
    #: user.
    entries: tuple[CheckpointDiffEntry, ...]
    #: Uncommitted changes made since the newest recorded checkpoint that this
    #: restore would overwrite. Empty when nothing of the user's is in the way.
    dirty_paths: tuple[str, ...]
    #: Empty when a restore may proceed without ``force``; otherwise a sentence
    #: fit to show a user.
    blocked_reason: str


@dataclass(frozen=True, slots=True)
class RestoreResult:
    """The outcome of a restore attempt."""

    #: Whether the working tree was actually changed.
    restored: bool
    #: The checkpoint sequence that was asked for.
    sequence: int
    #: The ``kind="pre_restore"`` checkpoint recorded before mutating the tree.
    #: ``None`` when the restore was refused, and also on the benign case where
    #: the tree already matched ``HEAD`` so there was nothing new to record.
    safety_checkpoint: SessionCheckpoint | None
    #: Paths the restore touched. Empty when it was refused.
    changed_paths: tuple[str, ...]
    #: Empty on success; otherwise why the tree was left alone.
    blocked_reason: str


@traces(SWR.SWR_2437)
class CheckpointRestorer:
    """Previews and performs a rollback of one session to one of its checkpoints.

    Args:
        session_manager: Owns the session directory the checkpoint mapping is
            read from and the safety checkpoint is written back to.
        session_id: The session whose checkpoints may be restored.
        tree_root: The working tree to restore into. Defaults to the session's
            own tree: its ``worktree`` binding when the session was isolated,
            the manager's workspace root otherwise. Passing it explicitly is for
            tests and for callers that already resolved it.
        diagnostics: Where the audit trail goes. Defaults to the session's own
            directory when it exists, and to a silent null object when it does
            not, so a restorer built for an unknown session still works.
    """

    def __init__(
        self,
        *,
        session_manager: SessionManager,
        session_id: str,
        tree_root: Path | None = None,
        diagnostics: SessionDiagnostics | None = None,
    ) -> None:
        self._session_manager = session_manager
        self._session_id = session_id
        state = _read_state(session_manager, session_id)
        self._session_known = state is not None
        resolved_root = (
            Path(tree_root) if tree_root is not None else _tree_root_for(session_manager, state)
        )
        self._engine = CheckpointEngine(resolved_root)
        self._diagnostics = (
            diagnostics
            if diagnostics is not None
            else _default_diagnostics(session_manager, session_id)
        )

    @property
    def available(self) -> bool:
        """Whether this session can be rolled back at all.

        ``False`` — never an exception — for an unknown session and for a tree
        Git does not manage: both are "there is nothing to offer here", which a
        UI renders as a disabled button, not an error dialog.
        """
        return self._session_known and self._engine.available

    @property
    def tree_root(self) -> Path:
        """The working tree a restore would change."""
        return self._engine.tree_root

    def list_checkpoints(self) -> tuple[SessionCheckpoint, ...]:
        """This session's recorded checkpoints, ascending by sequence.

        Re-read from the persisted snapshot on every call, so a long-lived UI
        picks up checkpoints a running session recorded after it opened.
        """
        return load_checkpoints(self._session_manager, self._session_id)

    def preview(self, sequence: int) -> RestorePreview | None:
        """What restoring *sequence* would change; ``None`` when it is unknown.

        Never raises, and never touches the working tree.
        """
        checkpoint = self._recorded(sequence)
        if checkpoint is None:
            return None
        ref = self._resolve_ref(sequence)
        if ref is None:
            return RestorePreview(
                checkpoint=checkpoint,
                entries=(),
                dirty_paths=(),
                blocked_reason=self._missing_ref_reason(sequence),
            )
        try:
            entries = self._engine.diff_summary(ref)
            dirty = self._dirty_paths(sequence, entries)
        except CheckpointError as exc:
            return RestorePreview(
                checkpoint=checkpoint,
                entries=(),
                dirty_paths=(),
                blocked_reason=f"Git could not inspect checkpoint {sequence}: {exc}",
            )
        return RestorePreview(
            checkpoint=checkpoint,
            entries=entries,
            dirty_paths=dirty,
            blocked_reason=_dirty_reason(dirty),
        )

    def restore(self, sequence: int, *, force: bool = False) -> RestoreResult:
        """Return the working tree to checkpoint *sequence*.

        Records a ``kind="pre_restore"`` checkpoint of the current tree before
        changing anything, so the rollback is itself undoable. When that safety
        checkpoint cannot be taken the tree is left alone: an irreversible
        restore is exactly what SWR-2437 forbids.

        Never raises. A refusal comes back as ``restored=False`` with a
        populated ``blocked_reason``, and the working tree is untouched.

        Args:
            sequence: The recorded checkpoint to restore.
            force: Proceed even though uncommitted changes would be overwritten.
                Only ever bypasses that one check — a missing ref or a Git
                failure still refuses.
        """
        checkpoint = self._recorded(sequence)
        if checkpoint is None:
            return self._refuse(
                sequence,
                f"No checkpoint {sequence} is recorded for session {self._session_id}.",
            )
        ref = self._resolve_ref(sequence)
        if ref is None:
            return self._refuse(sequence, self._missing_ref_reason(sequence))
        try:
            entries = self._engine.diff_summary(ref)
            dirty = self._dirty_paths(sequence, entries)
        except CheckpointError as exc:
            return self._refuse(sequence, f"Git could not inspect checkpoint {sequence}: {exc}")
        if dirty and not force:
            return self._refuse(sequence, _dirty_reason(dirty), dirty_paths=dirty)

        safety, safety_error = self._capture_safety_checkpoint(sequence)
        if safety_error:
            return self._refuse(sequence, safety_error)

        try:
            changed = self._engine.restore(ref)
        except CheckpointError as exc:
            return self._refuse(
                sequence,
                f"Git could not restore checkpoint {sequence}: {exc}",
                safety_checkpoint=safety,
            )

        with suppress(OSError):
            self._diagnostics.timeline(
                _TIMELINE_EVENT,
                actor=_ACTOR,
                message=(
                    f"Restored the working tree to checkpoint {sequence} "
                    f"over {len(changed)} file(s)."
                ),
                metadata={
                    "sequence": sequence,
                    "ref": ref.ref,
                    "commit": ref.commit,
                    "safety_sequence": safety.sequence if safety is not None else None,
                    "changed_file_count": len(changed),
                    "dirty_path_count": len(dirty),
                    "forced": force,
                    "tree_root": str(self._engine.tree_root),
                },
            )
        return self._published(
            RestoreResult(
                restored=True,
                sequence=sequence,
                safety_checkpoint=safety,
                changed_paths=changed,
                blocked_reason="",
            ),
        )

    # -- internals ---------------------------------------------------------

    @property
    def _bus_session_id(self) -> str:
        """The bus key this session's restore events are addressed to.

        The session this restorer was built for wins over the diagnostics
        writer's key, matching
        :func:`~rotaris_core.session.diagnostics.bus_session_id`: a restorer is
        always constructed with the session id it operates on.
        """
        return self._session_id or self._diagnostics.session_id

    @traces(SWR.SWR_1832)
    def _published(self, result: RestoreResult) -> RestoreResult:
        """Report one restore attempt on the event bus and return it unchanged.

        Called on **every** exit from :meth:`restore`, including a refusal: a
        rollback the tree refused is exactly the outcome a consumer needs to see,
        and ``blocked_reason`` carries why. Exactly one event per attempt, because
        :meth:`_refuse` is the only other way out of :meth:`restore`.

        The audit trail — the timeline entry for a completed restore, the issue
        for a refused one — is already written by the time this runs.
        """
        try:
            safety = result.safety_checkpoint
            publish(
                self._bus_session_id,
                CheckpointRestoredEvent(
                    session_id=self._bus_session_id,
                    sequence=result.sequence,
                    restored=result.restored,
                    safety_sequence=None if safety is None else safety.sequence,
                    changed_paths=len(result.changed_paths),
                    blocked_reason=result.blocked_reason,
                ),
            )
        except Exception:  # noqa: BLE001 - the restore already happened, or did not.
            _log.warning(
                "Could not publish checkpoint.restored for checkpoint %s.",
                result.sequence,
                exc_info=True,
            )
        return result

    def _recorded(self, sequence: int) -> SessionCheckpoint | None:
        return next(
            (entry for entry in self.list_checkpoints() if entry.sequence == sequence),
            None,
        )

    def _resolve_ref(self, sequence: int) -> CheckpointRef | None:
        try:
            return self._engine.resolve(self._session_id, sequence)
        except CheckpointError:
            return None

    def _missing_ref_reason(self, sequence: int) -> str:
        """Why a recorded checkpoint could not be resolved to a Git commit.

        A tree Git does not manage and a ref that was pruned away are different
        problems with different fixes, so they get different sentences.
        """
        if not self._engine.available:
            return (
                f"{self._engine.tree_root} is not inside a Git working tree, so checkpoint "
                f"{sequence} cannot be restored."
            )
        return (
            f"Checkpoint {sequence} is recorded for session {self._session_id} but its Git "
            f"snapshot is gone, so it can no longer be restored."
        )

    def _dirty_paths(
        self, sequence: int, entries: tuple[CheckpointDiffEntry, ...]
    ) -> tuple[str, ...]:
        """Paths this restore would overwrite that no checkpoint holds a copy of.

        The baseline is a *recorded checkpoint*, never ``HEAD``: in a
        checkpointed session almost everything differs from ``HEAD``, so a
        ``HEAD`` baseline would block every restore. What matters is work done
        on top of the last state Rotaris recorded, because that is the only work
        a restore can destroy without a copy existing somewhere.

        Raises:
            CheckpointError: Git refused; the caller turns that into a reason.
        """
        touched = {entry.path for entry in entries}
        if not touched:
            return ()
        baseline = self._drift_baseline(sequence, entries)
        if baseline is None:
            return ()
        if baseline.sequence == sequence:
            drifted = {entry.path for entry in entries}
        else:
            drifted = {entry.path for entry in self._engine.diff_summary(baseline)}
        return tuple(sorted(drifted & touched))

    def _drift_baseline(
        self, known_sequence: int, known_entries: tuple[CheckpointDiffEntry, ...]
    ) -> CheckpointRef | None:
        """What to measure unrecorded work against; ``None`` when there is none.

        Walks the recorded checkpoints newest first. A checkpoint the working
        tree matches exactly means the tree *is* a state Rotaris recorded, so
        nothing has drifted and there is nothing to protect — that is the
        ordinary case both after an iteration and immediately after a restore,
        where the tree matches the checkpoint that was just restored rather than
        the newest one. Otherwise the newest checkpoint is the baseline.

        The walk is capped: each comparison stages the whole working tree, and a
        session may retain fifty checkpoints. Past the cap the newest checkpoint
        is used, which can report drift that a much older checkpoint in fact
        holds — a restore that asks for ``force`` it did not strictly need, never
        a restore that skips a warning it owed.

        Raises:
            CheckpointError: Git refused; the caller turns that into a reason.
        """
        recorded = sorted(self.list_checkpoints(), key=lambda entry: entry.sequence, reverse=True)
        newest: CheckpointRef | None = None
        for entry in recorded[:_DRIFT_BASELINE_LOOKBACK]:
            ref = self._resolve_ref(entry.sequence)
            if ref is None:
                continue
            # The caller already staged the tree once to diff the checkpoint it
            # is about to restore; that is the single most expensive Git call
            # here, and the target is nearly always inside the walk.
            diff = (
                known_entries
                if entry.sequence == known_sequence
                else self._engine.diff_summary(ref)
            )
            if not diff:
                return None
            if newest is None:
                newest = ref
        return newest

    def _capture_safety_checkpoint(self, target: int) -> tuple[SessionCheckpoint | None, str]:
        """Record the pre-restore tree; return it plus a *fatal* error string.

        A non-empty error means the caller must not restore. An empty error with
        a ``None`` checkpoint is the benign case where the tree already matched
        ``HEAD``, so there was no new state to record and none to lose.
        """
        sequence = self._next_sequence()
        try:
            ref = self._engine.create(
                session_id=self._session_id,
                sequence=sequence,
                message=(
                    f"rotaris pre-restore checkpoint {sequence} for session {self._session_id} "
                    f"(before restoring checkpoint {target})"
                ),
                include_untracked=True,
            )
        except CheckpointError as exc:
            return None, f"Could not record a safety checkpoint before the restore: {exc}"
        if ref is None:
            return None, ""
        files: tuple[str, ...] = ()
        with suppress(CheckpointError):
            files = self._engine.files_in(ref)
        checkpoint = SessionCheckpoint(
            sequence=ref.sequence,
            ref=ref.ref,
            commit=ref.commit,
            created_at=dt.datetime.now(dt.UTC),
            files=list(files),
            kind="pre_restore",
        )
        error = self._record(checkpoint)
        if error:
            return None, error
        self._publish_created(checkpoint)
        return checkpoint, ""

    @traces(SWR.SWR_1832)
    def _publish_created(self, checkpoint: SessionCheckpoint) -> None:
        """Report the pre-restore safety checkpoint as a created one (SWR-1832).

        It is a real checkpoint on the session, offered for restore like any
        other, so it belongs on the wire as ``checkpoint.created`` with
        ``kind="pre_restore"``. Published only once it is recorded, so a
        consumer never hears about a checkpoint no UI can find.
        """
        try:
            publish(
                self._bus_session_id,
                CheckpointCreatedEvent(
                    session_id=self._bus_session_id,
                    sequence=checkpoint.sequence,
                    ref=checkpoint.ref,
                    kind=checkpoint.kind,
                    iteration=checkpoint.iteration,
                    changed_paths=len(checkpoint.files),
                ),
            )
        except Exception:  # noqa: BLE001 - the checkpoint is recorded either way.
            _log.warning(
                "Could not publish checkpoint.created for safety checkpoint %s.",
                checkpoint.sequence,
                exc_info=True,
            )

    def _record(self, checkpoint: SessionCheckpoint) -> str:
        """Persist *checkpoint* on the session; return a fatal error string.

        Re-reads the snapshot immediately before appending so a session that
        kept running does not lose checkpoints recorded since this restorer was
        constructed. A checkpoint that exists in Git but not on the session is
        one no UI can offer, which is the same as not having taken it, so a
        failure here is fatal to the restore.
        """
        state = _read_state(self._session_manager, self._session_id)
        if state is None:
            return "Could not read the session snapshot to record the safety checkpoint."
        state.checkpoints.append(checkpoint)
        try:
            self._session_manager.flush_session(state)
        except OSError as exc:
            return f"Could not persist the safety checkpoint on the session: {exc}"
        return ""

    def _next_sequence(self) -> int:
        """One past the highest sequence the session or Git knows about.

        Both are consulted so a pruned mapping cannot hand back a number whose
        ref still exists, which ``update-ref`` would silently overwrite.
        """
        sequences = [entry.sequence for entry in self.list_checkpoints()]
        with suppress(CheckpointError):
            sequences.extend(entry.sequence for entry in self._engine.list_refs(self._session_id))
        return max(sequences, default=0) + 1

    def _refuse(
        self,
        sequence: int,
        reason: str,
        *,
        dirty_paths: tuple[str, ...] = (),
        safety_checkpoint: SessionCheckpoint | None = None,
    ) -> RestoreResult:
        with suppress(OSError):
            self._diagnostics.issue(
                kind=_ISSUE_KIND,
                severity="warning",
                actor=_ACTOR,
                message=f"Restore of checkpoint {sequence} did not run: {reason}",
                metadata={
                    "sequence": sequence,
                    "dirty_paths": list(dirty_paths),
                    "safety_sequence": (
                        safety_checkpoint.sequence if safety_checkpoint is not None else None
                    ),
                    "tree_root": str(self._engine.tree_root),
                },
            )
        return self._published(
            RestoreResult(
                restored=False,
                sequence=sequence,
                safety_checkpoint=safety_checkpoint,
                changed_paths=(),
                blocked_reason=reason,
            ),
        )


@traces(SWR.SWR_2437)
def format_checkpoint_rows(checkpoints: Sequence[SessionCheckpoint]) -> tuple[str, ...]:
    """A header plus one fixed-width row per checkpoint, newest last.

    The columns are the ones SWR-2437 asks the checkpoint list to show —
    sequence, time, iteration and how many files changed — so the CLI listing
    and Rotaris's list view stay the same listing.
    """
    rows = [_HEADER_ROW]
    for entry in checkpoints:
        created = entry.created_at.replace(microsecond=0).isoformat()
        rows.append(
            f"{entry.sequence:>4}  {created:<25}  {entry.iteration:>4}  "
            f"{len(entry.files):>5}  {entry.kind}"
        )
    return tuple(rows)


@traces(SWR.SWR_2437)
def format_preview_lines(preview: RestorePreview) -> tuple[str, ...]:
    """The confirmation text for *preview*: what changes, and what is in the way.

    Every path is labelled with :func:`restore_action`, so the reader is told
    what the restore does to it rather than the engine's checkpoint-relative
    status letter.
    """
    sequence = preview.checkpoint.sequence
    lines: list[str] = []
    if preview.entries:
        lines.append(
            f"Restoring checkpoint {sequence} would change {len(preview.entries)} file(s):"
        )
        lines.extend(
            f"  {restore_action(entry.status):<9} {entry.path}"
            for entry in sorted(preview.entries, key=lambda item: item.path)
        )
    elif not preview.blocked_reason:
        # An empty diff with a reason means the checkpoint could not be read at
        # all; "would change nothing" would read as reassurance it has not
        # earned, so the reason is left to speak for itself.
        lines.append(f"Restoring checkpoint {sequence} would change nothing.")
    if preview.dirty_paths:
        lines.append(
            f"Warning: {len(preview.dirty_paths)} uncommitted change(s) would be overwritten:"
        )
        lines.extend(f"  {path}" for path in preview.dirty_paths)
    return tuple(lines)


def _dirty_reason(dirty_paths: tuple[str, ...]) -> str:
    if not dirty_paths:
        return ""
    shown = ", ".join(dirty_paths[:5])
    more = f" and {len(dirty_paths) - 5} more" if len(dirty_paths) > 5 else ""
    return (
        f"{len(dirty_paths)} uncommitted change(s) would be overwritten: {shown}{more}. "
        f"Restore again with force to overwrite them."
    )


def _read_state(session_manager: SessionManager, session_id: str) -> SessionState | None:
    try:
        return session_manager.read_session_snapshot(session_id)
    except (OSError, ValueError):
        return None


def _tree_root_for(session_manager: SessionManager, state: SessionState | None) -> Path:
    """The tree the session actually worked in.

    An isolated session edited its worktree while its session directory stayed
    in the base workspace, so restoring into the workspace root would wreck a
    tree the session never touched.
    """
    binding = state.worktree if state is not None else None
    if binding is not None and binding.path:
        return Path(binding.path)
    return Path(session_manager.workspace_root)


def _default_diagnostics(session_manager: SessionManager, session_id: str) -> SessionDiagnostics:
    session_dir = session_manager.session_dir(session_id)
    exists = False
    with suppress(OSError):
        exists = session_dir.is_dir()
    return SessionDiagnostics(session_dir if exists else None, session_id)
