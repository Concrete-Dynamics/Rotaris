"""Session-level policy around the Git checkpoint engine (SWR-2436).

:mod:`rotaris_core.session.checkpoints` knows how to write a working tree into
``refs/rotaris/checkpoints/`` and nothing else. This module is the layer that
decides *whether* to, numbers the checkpoints, records the mapping on the
session so it survives a resume, and keeps the ref namespace bounded.

The contract that matters to callers is that :meth:`CheckpointService.capture`
runs inside an iteration loop and never raises: a workspace that Git refuses to
checkpoint is a workspace without undo, not a failed run (SWR-2436 — "failures
to checkpoint warn but do not abort the iteration").
"""

from __future__ import annotations

import datetime as dt
import logging
from contextlib import suppress
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rotaris_core.events import CheckpointCreatedEvent, publish
from rotaris_core.reqtocode import SWR, traces
from rotaris_core.session.checkpoints import CheckpointEngine, CheckpointError
from rotaris_core.session.diagnostics import SessionDiagnostics
from rotaris_core.session.state import SessionCheckpoint

if TYPE_CHECKING:
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.session.manager import SessionManager
    from rotaris_core.session.state import SessionState

__all__ = ["CheckpointService", "load_checkpoints"]

_log = logging.getLogger(__name__)

#: Actor attributed to every checkpoint diagnostic, so a session's issues can be
#: filtered down to "what the undo machinery said".
_ACTOR = "checkpoints"


@traces(SWR.SWR_2436)
class CheckpointService:
    """Records per-iteration checkpoints for one session and prunes old ones.

    Args:
        session_manager: Owns the session directory the mapping is persisted to.
        state: The live session state; checkpoints are appended to it in place.
        tree_root: The working tree to checkpoint. Passed explicitly rather than
            derived from *state* or *config*, because in an isolated session the
            tree is the worktree while the session directory stays in the base
            workspace, and guessing which one a caller meant is how that gets
            silently wrong.
        config: Supplies ``config.checkpoints`` (enabled, retention, untracked).
        diagnostics: Where warnings and timeline entries go. Defaults to a
            silent null object, so a service built outside a session directory
            still works.
        isolated: Whether this session runs in a Rotaris-managed Git worktree.
            Resolves the ``enabled=None`` default.
    """

    def __init__(
        self,
        *,
        session_manager: SessionManager,
        state: SessionState,
        tree_root: Path,
        config: RotarisConfig,
        diagnostics: SessionDiagnostics | None = None,
        isolated: bool = False,
    ) -> None:
        self._session_manager = session_manager
        self._state = state
        self._config = config
        self._isolated = isolated
        self._diagnostics = diagnostics if diagnostics is not None else SessionDiagnostics(None)
        self._engine = CheckpointEngine(Path(tree_root))
        self._enabled: bool | None = None

    @property
    def enabled(self) -> bool:
        """Whether this session checkpoints at all.

        Resolves the deliberately three-valued ``checkpoints.enabled``: an
        explicit ``True``/``False`` wins outright, and the unset default means
        *on in a worktree-isolated session, off elsewhere* — Rotaris owns the
        tree there, so a checkpoint cannot surprise anyone (SWR-2436).

        A workspace that is not a Git working tree resolves to ``False``. That
        is not an error: it is simply a workspace without undo.
        """
        if self._enabled is None:
            configured = self._config.checkpoints.enabled
            wanted = self._isolated if configured is None else configured
            self._enabled = bool(wanted) and self._engine.available
        return self._enabled

    def capture(
        self,
        *,
        iteration: int = 0,
        child_name: str = "",
        kind: str = "iteration",
    ) -> SessionCheckpoint | None:
        """Checkpoint the working tree and record it on the session.

        Never raises — it is called from the iteration loop, where an undo
        facility failing must not end the run.

        Returns:
            The recorded checkpoint, or ``None`` when checkpointing is off, when
            the tree is identical to ``HEAD`` (there is nothing to undo), or when
            Git refused, in which case a warning is recorded on the session.
        """
        if not self.enabled:
            return None
        try:
            checkpoint = self._create(iteration=iteration, child_name=child_name, kind=kind)
        except (CheckpointError, OSError) as exc:
            self._warn(
                f"Could not record a checkpoint after iteration {iteration}: {exc}",
                iteration=iteration,
                child_name=child_name,
                kind=kind,
            )
            return None
        if checkpoint is None:
            # A clean tree is the normal outcome of an iteration that only read
            # files. It is not a failure and must not be reported as one.
            return None
        # A diagnostics write is itself file I/O; losing the timeline entry is
        # never a reason to lose the iteration.
        with suppress(OSError):
            self._diagnostics.timeline(
                "checkpoint_created",
                actor=_ACTOR,
                message=(
                    f"Recorded checkpoint {checkpoint.sequence} "
                    f"over {len(checkpoint.files)} file(s)."
                ),
                metadata={
                    "sequence": checkpoint.sequence,
                    "ref": checkpoint.ref,
                    "commit": checkpoint.commit,
                    "iteration": checkpoint.iteration,
                    "child_name": checkpoint.child_name,
                    "kind": checkpoint.kind,
                    "file_count": len(checkpoint.files),
                },
            )
        self._publish_created(checkpoint)
        return checkpoint

    @traces(SWR.SWR_1832)
    def _publish_created(self, checkpoint: SessionCheckpoint) -> None:
        """Put one recorded checkpoint on the session's event bus (SWR-1832).

        After the session snapshot and the timeline entry are written: a
        checkpoint a consumer heard about but that was never recorded is one it
        could offer to restore and Rotaris could not find.

        ``changed_paths`` is the *count* of captured paths, never the paths
        themselves — a stream line must not grow with the size of the change
        set.
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
        except Exception:  # noqa: BLE001 - the checkpoint is taken either way.
            _log.warning(
                "Could not publish checkpoint.created for checkpoint %s.",
                checkpoint.sequence,
                exc_info=True,
            )

    @property
    def _bus_session_id(self) -> str:
        """The bus key this session's checkpoint events are addressed to.

        Same precedence as :func:`~rotaris_core.session.diagnostics.bus_session_id`:
        the session this service was built for wins, and the diagnostics
        writer's already-resolved key (an explicit id, else the session
        directory's name) is the fallback.
        """
        return self._state.session_id or self._diagnostics.session_id

    def list_checkpoints(self) -> tuple[SessionCheckpoint, ...]:
        """Every checkpoint recorded for this session, ascending by sequence."""
        return tuple(sorted(self._state.checkpoints, key=lambda entry: entry.sequence))

    def record(self, checkpoint: SessionCheckpoint) -> None:
        """Attach *checkpoint* to the session, prune, and persist immediately.

        Persisting bypasses ``save_session``'s debounce on purpose: a checkpoint
        that only exists in memory is exactly the one lost to the crash a user
        wanted to undo.
        """
        self._state.checkpoints.append(checkpoint)
        self._trim()
        self._persist()

    def prune(self) -> int:
        """Enforce ``checkpoints.max_per_session`` and persist the result.

        Refs and the recorded mapping are trimmed together, so the session never
        offers a restore that points at a ref Git no longer has.

        Never raises.

        Returns:
            How many refs were deleted.
        """
        removed = self._trim()
        self._persist()
        return removed

    def discard_session(self) -> int:
        """Delete every checkpoint ref for this session and clear the mapping.

        Called when a session is deleted, so the ``refs/rotaris/`` namespace does
        not outlive the sessions that filled it. Never raises: a session must
        remain deletable even when Git refuses.

        Call this *before* removing the session directory — it persists the
        cleared mapping, and persisting would otherwise recreate the directory.

        Returns:
            How many refs were deleted.
        """
        removed = 0
        if self._engine.available:
            try:
                removed = self._engine.delete_all(self._state.session_id)
            except CheckpointError as exc:
                self._warn(f"Could not delete this session's checkpoints: {exc}")
        if self._state.checkpoints:
            self._state.checkpoints = []
            if self._session_manager.session_dir(self._state.session_id).exists():
                self._persist()
        return removed

    # -- internals ---------------------------------------------------------

    def _create(self, *, iteration: int, child_name: str, kind: str) -> SessionCheckpoint | None:
        sequence = self._next_sequence()
        ref = self._engine.create(
            session_id=self._state.session_id,
            sequence=sequence,
            message=self._message(sequence=sequence, iteration=iteration, child_name=child_name),
            include_untracked=self._config.checkpoints.include_untracked,
        )
        if ref is None:
            return None
        checkpoint = SessionCheckpoint(
            sequence=ref.sequence,
            ref=ref.ref,
            commit=ref.commit,
            created_at=dt.datetime.now(dt.UTC),
            iteration=iteration,
            child_name=child_name,
            files=list(self._engine.files_in(ref)),
            kind=kind,
        )
        self.record(checkpoint)
        return checkpoint

    def _next_sequence(self) -> int:
        """One past the highest sequence ever recorded on this session.

        Derived from the recorded sequences rather than their count, so a resume
        or a prune cannot hand out a number that is already taken and silently
        overwrite the ref an older checkpoint still points at.
        """
        highest = max((entry.sequence for entry in self._state.checkpoints), default=0)
        return highest + 1

    def _message(self, *, sequence: int, iteration: int, child_name: str) -> str:
        attribution = f" by {child_name}" if child_name else ""
        return (
            f"rotaris checkpoint {sequence} for session {self._state.session_id} "
            f"(iteration {iteration}{attribution})"
        )

    def _trim(self) -> int:
        """Drop refs and mapping entries beyond the retention limit."""
        if not self._engine.available:
            return 0
        keep = self._config.checkpoints.max_per_session
        try:
            removed = self._engine.prune(self._state.session_id, keep=keep)
        except CheckpointError as exc:
            self._warn(f"Could not prune this session's old checkpoints: {exc}")
            return 0
        ordered = self.list_checkpoints()
        self._state.checkpoints = list(ordered[-keep:]) if keep > 0 else []
        return removed

    def _persist(self) -> None:
        try:
            self._session_manager.flush_session(self._state)
        except OSError as exc:
            self._warn(f"Could not persist the checkpoint mapping: {exc}")

    def _warn(self, message: str, **metadata: Any) -> None:
        # Recording the warning must not become the failure it is reporting.
        with suppress(OSError):
            self._diagnostics.issue(
                kind="checkpoint",
                severity="warning",
                actor=_ACTOR,
                message=message,
                metadata=dict(metadata),
            )


@traces(SWR.SWR_2436)
def load_checkpoints(
    session_manager: SessionManager,
    session_id: str,
) -> tuple[SessionCheckpoint, ...]:
    """Checkpoints recorded for *session_id*, ascending by sequence.

    Reads the persisted snapshot directly, so a CLI listing or a desktop session
    browser can offer a rollback without constructing a service or touching Git.

    Returns an empty tuple when the session has no readable snapshot.
    """
    try:
        state = session_manager.read_session_snapshot(session_id)
    except (OSError, ValueError):
        return ()
    return tuple(sorted(state.checkpoints, key=lambda entry: entry.sequence))
