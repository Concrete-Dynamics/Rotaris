"""JSONL writer that turns the event bus into the headless stdout stream (SWR-1828).

``--output-format stream-json`` promises one JSON object per line on stdout and
*nothing else*.  This module owns the writing half of that promise; the CLI
(``rotaris_core.cli.background``) owns diverting every human-readable message to
stderr so the promise can be kept.

Three properties are load-bearing:

* **Flush per line.**  A consumer tails the stream while the run is still going,
  so an event buffered until process exit is an event that arrived too late —
  and a crashed run would lose it entirely.
* **One lock around the write.**  Events reach a sink from the event-loop thread
  *and* from ``asyncio.to_thread`` workers (``on_child_spawned`` is the known
  case).  Two unsynchronized ``write`` calls can interleave mid-line and produce
  a line no JSON parser will accept, which breaks the contract for every event
  after it, not just the two that collided.
* **A dead consumer is not a failed run.**  ``rotaris-headless run … | head -5``
  closes the pipe under us; that must end the *stream*, not the run.  The bus
  already swallows sink exceptions, but relying on that would hide real bugs in
  this module from its own tests, so nothing escapes from here either.

The module is deliberately import-light — it reaches only ``events.schema`` —
because the CLI imports it before it knows whether a run will even start.
"""

from __future__ import annotations

import logging
import sys
import threading
from typing import TYPE_CHECKING

from rotaris_core.events.schema import serialize_event
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from typing import TextIO

    from rotaris_core.events.schema import RotarisEvent

_log = logging.getLogger(__name__)

#: The default ``--output-format``: human-readable output, no event stream.
OUTPUT_FORMAT_TEXT = "text"

#: The machine-readable ``--output-format``: JSONL on stdout, diagnostics on
#: stderr.  Spelled with a hyphen on both CLIs, matching SWR-1828.
OUTPUT_FORMAT_STREAM_JSON = "stream-json"

#: Every accepted ``--output-format`` value, in help-text order.
OUTPUT_FORMATS: tuple[str, ...] = (OUTPUT_FORMAT_TEXT, OUTPUT_FORMAT_STREAM_JSON)


@traces(SWR.SWR_1828)
class JsonlEventStream:
    """An :data:`~rotaris_core.events.bus.EventSink` that writes JSONL to a text stream.

    Args:
        stream: Where to write.  ``None`` (the default) means "resolve
            ``sys.stdout`` at write time".  Binding ``sys.stdout`` in the
            constructor would capture whatever object happened to be installed
            when the CLI was imported, which is both wrong under ``capsys`` and
            wrong for any host that redirects stdout after start-up.

    The stream is never closed by this object even on :meth:`close`: the usual
    target is the process's own stdout, and closing that would break everything
    downstream of the run.
    """

    def __init__(self, stream: TextIO | None = None) -> None:
        self._stream = stream
        self._lock = threading.Lock()
        self._closed = False

    @property
    def closed(self) -> bool:
        """Whether the sink stopped writing — after :meth:`close` or a dead pipe."""
        return self._closed

    def _target(self) -> TextIO | None:
        """Resolve the destination lazily; ``sys.stdout`` can be ``None`` (pythonw)."""
        if self._stream is not None:
            return self._stream
        return sys.stdout

    @traces(SWR.SWR_1828)
    def __call__(self, event: RotarisEvent) -> None:
        """Write *event* as one flushed JSONL line.  Never raises."""
        try:
            line = serialize_event(event)
        except Exception:  # noqa: BLE001 - one bad event must not end the stream.
            _log.warning(
                "Dropping an unserializable %r event.",
                getattr(event, "event", "?"),
                exc_info=True,
            )
            return

        with self._lock:
            if self._closed:
                return
            target = self._target()
            if target is None:
                self._closed = True
                return
            try:
                # One ``write`` per event: two calls could be split by another
                # writer on this stream even though our own lock is held.
                target.write(f"{line}\n")
                target.flush()
            except (OSError, ValueError) as exc:
                # BrokenPipeError (an OSError) is the consumer hanging up;
                # ValueError is "I/O operation on closed file".  Both mean the
                # stream is gone for good, so stop trying rather than paying
                # for an exception on every remaining event.
                self._closed = True
                _log.debug("Event stream ended while writing %r: %r", event.event, exc)
            except Exception:  # noqa: BLE001 - a broken stream must not fail the run.
                self._closed = True
                _log.warning(
                    "Event sink failed writing a %r event; the stream stopped.",
                    event.event,
                    exc_info=True,
                )

    @traces(SWR.SWR_1828)
    def close(self) -> None:
        """Flush and stop accepting events.  Idempotent; never raises."""
        with self._lock:
            if self._closed:
                return
            self._closed = True
            target = self._target()
            if target is None:
                return
            try:
                target.flush()
            except (OSError, ValueError) as exc:
                _log.debug("Event stream was already gone at close: %r", exc)
            except Exception:  # noqa: BLE001 - closing must not fail the run.
                _log.warning("Event sink failed to flush on close.", exc_info=True)


@traces(SWR.SWR_1828)
def stream_json_sink(stream: TextIO | None = None) -> JsonlEventStream:
    """Build the sink for ``--output-format stream-json``.

    The one obvious constructor the CLI calls, so a later change of transport
    (a socket, a file) has a single site to change instead of every entry point.
    """
    return JsonlEventStream(stream)
