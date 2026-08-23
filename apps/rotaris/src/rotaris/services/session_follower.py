"""Following a session this process is not running (SWR-2454 § Reach).

A session executing somewhere else — a `rotaris-cli` run in a terminal, a
headless CI job, a second desktop window, a detached background run — is reached
only through the filesystem. Its state files are rewritten whole, so watching it
by reading them costs the whole session on every look, and for most of a run
there was nothing in them to read anyway: the transcript was written near the
end.

Both halves changed. The engine now records the transcript as it happens
(`rotaris_core.session.transcript`) and publishes each row it writes to the
session's event store as a ``transcript.row`` event, and that store can be read
from a position (`eventstore.tail_events`). This module is the consumer: it
follows the store from where it last got to and turns what arrived into the same
:class:`~rotaris.models.state.TranscriptDelta` a locally-executing run produces.

**One derivation, deliberately.** The rows here are not built from the wire —
they *are* the run's rows, carried verbatim and put back at the index they came
from. Projecting them is the same `TranscriptProjector` the live path uses over
the same input, so a session watched from outside and the same session reopened
afterwards cannot disagree about what it said.

What this does not do is replace the whole-state read. Everything that is not the
transcript — todos, the agent tree, token counts — still arrives that way, and
so does the reconciliation that repairs anything the store missed. This makes the
transcript cheap and live; it does not make the reconciler unnecessary.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

from rotaris.models.state import TranscriptDelta

if TYPE_CHECKING:
    from pathlib import Path

_log = logging.getLogger(__name__)


@traces(SWR.SWR_2454, SWR.SWR_2902)
class SessionFollower:
    """Rebuild one foreign session's transcript from its event store.

    Args:
        session_dir: The session directory holding ``evidence/events.jsonl``.

    Stateful on purpose: the position in the store and the rows read so far are
    what make a look cost the addition rather than the session. Construct one per
    followed session and throw it away when the focus moves.
    """

    __slots__ = ("_offset", "_rows", "_seeded", "_session_dir")

    def __init__(self, session_dir: Path) -> None:
        self._session_dir = session_dir
        self._offset = 0
        self._rows: list[dict[str, Any]] = []
        #: Whether the view has been told anything yet. The first delta must
        #: start at row zero — it is the whole transcript so far — and every one
        #: after it describes only what moved.
        self._seeded = False

    @property
    def offset(self) -> int:
        """Where in the store the next look starts."""
        return self._offset

    @property
    def rows(self) -> list[dict[str, Any]]:
        """The transcript as read so far, in the run's own row shape."""
        return self._rows

    @traces(SWR.SWR_2454)
    def poll(self) -> TranscriptDelta | None:
        """Read what the run added, or ``None`` when it added nothing.

        A returned delta is applied exactly as a local run's is. ``first`` is the
        earliest row that changed, which for a settling row — a tool call closing,
        a streamed message finishing — is behind the end of the transcript: the
        run republishes a row at the index it already occupies, and a consumer
        replaces rather than appends.
        """
        from rotaris_core.eventstore import tail_session_events

        try:
            tail = tail_session_events(self._session_dir, self._offset)
        except Exception:  # noqa: BLE001 - a followed session must not break the window
            _log.warning("Could not follow the session store; reconciling instead.", exc_info=True)
            return None

        if tail.restarted:
            # The store no longer holds what was read from it — the cap dropped
            # its oldest lines, or this is a different session at the same path.
            # Nothing derived from it survives.
            self._rows = []
            self._seeded = False

        self._offset = tail.offset
        first = self._apply(tail.events)
        if first is None:
            return None
        if not self._seeded:
            first = 0
            self._seeded = True
        return TranscriptDelta(
            first=first,
            rows=[dict(row) for row in self._rows[first:]],
            new_diffs=[],
            personas={},
        )

    def _apply(self, events: Any) -> int | None:
        """Place each row at the index it names; answer the earliest one touched.

        A row arriving beyond the end is padded up to, rather than appended
        blindly. A gap means the store lost a line to its cap or to a corrupt
        write, and a placeholder keeps every later row at the index the run gave
        it — putting them one position early would misplace the whole tail, and a
        row nobody can read is a smaller lie than a transcript that is subtly out
        of order.
        """
        first: int | None = None
        for event in events:
            if event.event_type != "transcript.row":
                continue
            payload = event.payload
            index = payload.get("index")
            row = payload.get("row")
            if not isinstance(index, int) or isinstance(index, bool) or index < 0:
                continue
            if not isinstance(row, dict):
                continue
            while len(self._rows) <= index:
                self._rows.append({"role": "system", "content": "(this line was not recorded)"})
            self._rows[index] = row
            first = index if first is None else min(first, index)
        return first
