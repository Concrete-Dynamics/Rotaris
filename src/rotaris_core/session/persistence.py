from __future__ import annotations

import datetime as dt
import json
import logging
import os
import shutil
from contextlib import suppress
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

from rotaris_core.fs import atomic_write as _atomic_write
from rotaris_core.session.liveness import pid_is_alive
from rotaris_core.session.state import SESSION_SCHEMA_VERSION, SessionState

_log = logging.getLogger(__name__)


@traces(SWR.SWR_1025, SWR.SWR_1026, SWR.SWR_1027, SWR.SWR_1545, SWR.SWR_1550, SWR.SWR_2436)
class SessionPersistence:
    def __init__(self, sessions_dir: Path) -> None:
        self.sessions_dir = sessions_dir

    def session_dir(self, session_id: str) -> Path:
        return self.sessions_dir / session_id

    @traces(SWR.SWR_2907)
    def save_snapshot(self, state: SessionState) -> None:
        from rotaris_core.session.task_context import session_task_title

        session_dir = self.session_dir(state.session_id)
        session_dir.mkdir(parents=True, exist_ok=True)

        from rotaris_core.session.diagnostics import write_split_state

        write_split_state(session_dir, state)

        # No ``snapshot.json`` is written here any more. It was a whole-state
        # duplicate of the split layout, kept for one release while tooling
        # moved over; that release has passed and nothing writes to it or reads
        # it back on a session this version created. ``load_snapshot`` still
        # reads one when it finds it, which is what SWR-1550 requires — the
        # obligation is that a session already on disk stays loadable, not that
        # new ones keep the shape.

        metadata = {
            "session_id": state.session_id,
            "created_at": state.created_at.isoformat(),
            "updated_at": state.updated_at.isoformat(),
            "execution_status": state.execution_status,
            "schema_version": state.schema_version,
            "internal": state.internal,
            "worktree": state.worktree.model_dump(mode="json") if state.worktree else None,
            # How many checkpoints (SWR-2436) this session can still restore.
            # ``list_sessions`` reads metadata.json and nothing else, so a
            # session list can only show restorable sessions if the count is
            # written here. Absent on pre-checkpoint session directories;
            # readers must default it to 0.
            "checkpoint_count": len(state.checkpoints),
            # Human-readable run title (SWR-2907). ``list_sessions`` reads only
            # metadata.json, so session lists can label runs by task wording
            # only if it is written here. Absent on pre-title directories;
            # readers must fall back to the session id.
            "task_title": session_task_title(state.todo_state),
            # Which requirement and unit this run belongs to (SWR-3612).
            # ``list_sessions`` reads metadata.json and nothing else, so the
            # session list can attribute a requirement-started run only if it is
            # written here. Absent on pre-requirement directories; readers must
            # default both to "".
            "requirement_id": state.requirement_id,
            "unit_id": state.unit_id,
            # Whether this run is blocked on a person right now (SWR-3625).
            # Written here for the same reason as the two above and one more:
            # only the *focused* session's pending prompts are ever projected
            # into the desktop's store, so a background run waiting on an
            # approval or a question had no way to say so anywhere. Reading it
            # off the metadata every session list already loads gives every
            # surface the same answer at once, and it survives a restart.
            # Absent on older session directories; readers must default it False.
            "awaiting_input": bool(state.pending_approvals) or bool(state.pending_questions),
        }
        metadata_path = session_dir / "metadata.json"
        _atomic_write(metadata_path, json.dumps(metadata, indent=2))

    def load_snapshot(self, session_id: str) -> SessionState:
        session_dir = self.session_dir(session_id)
        from rotaris_core.session.diagnostics import load_split_state

        state = load_split_state(session_dir)
        if state is not None:
            if state.schema_version > SESSION_SCHEMA_VERSION:
                raise ValueError(f"Unsupported session schema version: {state.schema_version}")
            return state

        # A session written before the split layout, or before this version
        # stopped duplicating it (SWR-1550). Nothing produces this file now, so
        # reaching here means the directory predates one of those two changes
        # and is the user's own history — it loads, or their session is gone.
        snapshot_path = session_dir / "snapshot.json"
        if not snapshot_path.exists():
            raise FileNotFoundError(f"Session snapshot not found for {session_id}")

        state = SessionState.model_validate_json(snapshot_path.read_text(encoding="utf-8"))
        if state.schema_version > SESSION_SCHEMA_VERSION:
            raise ValueError(f"Unsupported session schema version: {state.schema_version}")
        return state

    def list_sessions(self) -> list[dict[str, Any]]:
        if not self.sessions_dir.exists():
            return []

        sessions: list[dict[str, Any]] = []
        for entry in self.sessions_dir.iterdir():
            if not entry.is_dir():
                continue

            metadata_path = entry / "metadata.json"
            if not metadata_path.exists():
                continue

            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                updated_at = metadata["updated_at"]
                dt.datetime.fromisoformat(updated_at)
            except (KeyError, TypeError, ValueError, json.JSONDecodeError):
                continue

            sessions.append(metadata)

        return sorted(
            sessions,
            key=lambda item: dt.datetime.fromisoformat(item["updated_at"]),
            reverse=True,
        )

    @traces(SWR.SWR_2436)
    def delete_session(self, session_id: str) -> None:
        """Remove a session, including the checkpoint refs it left behind.

        SWR-2436 requires checkpoints to be pruned with the session lifecycle,
        and the refs do not live in the session directory — they are git refs
        under ``refs/rotaris/checkpoints/`` in the workspace. Removing only the
        directory would strand them forever, which is exactly the unbounded ref
        growth the requirement rules out.

        Ref cleanup is best-effort: a session must still delete when the git
        repository has moved, been removed, or was never there.
        """
        self._discard_checkpoint_refs(session_id)
        shutil.rmtree(self.session_dir(session_id), ignore_errors=True)

    def _discard_checkpoint_refs(self, session_id: str) -> None:
        """Delete ``session_id``'s checkpoint refs from whichever tree holds them."""
        from pathlib import Path as _Path

        from rotaris_core.session.checkpoints import CheckpointEngine

        try:
            snapshot = self.load_snapshot(session_id)
        except Exception:  # noqa: BLE001 - an unreadable session still has to delete
            return
        # An isolated session checkpointed its worktree, not the base workspace.
        worktree = snapshot.worktree
        root = (
            _Path(worktree.path) if worktree and worktree.path else _Path(snapshot.workspace_root)
        )
        try:
            engine = CheckpointEngine(root)
            if engine.available:
                engine.delete_all(session_id)
        except Exception:  # noqa: BLE001 - see the docstring: cleanup is best-effort
            _log.warning(
                "Could not remove checkpoint refs for session %s; "
                "they remain under refs/rotaris/checkpoints/.",
                session_id,
                exc_info=True,
            )

    def acquire_lock(self, session_id: str, pid: int | None = None) -> bool:
        session_dir = self.session_dir(session_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        lock_path = session_dir / "lock"
        lock_pid = os.getpid() if pid is None else pid

        for _ in range(2):
            try:
                fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            except FileExistsError:
                if not self._remove_stale_lock(lock_path):
                    return False
                continue

            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(
                    {
                        "pid": lock_pid,
                        "acquired_at": dt.datetime.now(dt.UTC).isoformat(),
                    },
                    handle,
                    indent=2,
                )
            return True

        return False

    def release_lock(self, session_id: str) -> None:
        lock_path = self.session_dir(session_id) / "lock"
        with suppress(FileNotFoundError):
            lock_path.unlink()

    def _remove_stale_lock(self, lock_path: Path) -> bool:
        try:
            payload = json.loads(lock_path.read_text(encoding="utf-8"))
            pid = int(payload["pid"])
        except (KeyError, TypeError, ValueError, json.JSONDecodeError, FileNotFoundError):
            pid = None

        if pid is not None and self._pid_is_alive(pid):
            return False

        with suppress(FileNotFoundError):
            lock_path.unlink()
        return True

    def _pid_is_alive(self, pid: int) -> bool:
        """The lock reaper's liveness probe, and the one every caller reuses.

        Kept as a method because ``session.recovery`` reaches it deliberately,
        so the reaper's answer and the session's can never disagree.
        """
        return pid_is_alive(pid)
