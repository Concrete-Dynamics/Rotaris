"""Conversation control: lifecycle helpers shared by the Scheduler and tools.

This module owns everything about running blocking conversation methods
safely off the caller's thread: pause/close daemon-thread wrappers, the
graceful pause (wait for in-flight tools, then pause — or close on
deadline), the thread-safe tool-activity registry those decisions consult,
and LLM error-type infrastructure. Extracted from ``scheduler.py`` so it
can be shared without import cycles.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any, Protocol

from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# LLM error-type infrastructure
# ---------------------------------------------------------------------------

_llm_bad_request_errors: tuple[type[Exception], ...] = ()
_ConversationRunError: type[Exception] | None = None

try:
    from openhands.sdk.conversation.exceptions import (
        ConversationRunError as _ConversationRunErrorImported,
    )
    from openhands.sdk.llm.exceptions.types import (
        LLMBadRequestError as _LLMBadRequestError,
    )

    _llm_bad_request_errors = (_LLMBadRequestError,)
    _ConversationRunError = _ConversationRunErrorImported
except ImportError:
    pass


@traces(SWR.SWR_919)
def should_unwrap_conversation_run_error(exc: RuntimeError) -> bool:
    """Return True if *exc* is a ``ConversationRunError`` wrapping an LLM error."""
    if _ConversationRunError is None:
        return False
    if not isinstance(exc, _ConversationRunError):
        return False
    cause = getattr(exc, "original_exception", exc.__cause__)
    if cause is None:
        return False
    return isinstance(cause, _llm_bad_request_errors)


# ---------------------------------------------------------------------------
# Conversation state inspection
# ---------------------------------------------------------------------------


def capture_conversation_state(conversation: Any) -> dict[str, Any]:
    """Capture diagnostic state from a conversation before pausing/closing."""
    state: dict[str, Any] = {}
    for attr in ("paused", "running", "stopped", "closed"):
        try:
            state[attr] = getattr(conversation, attr, None)
        except Exception:  # noqa: BLE001
            state[attr] = "<error>"
    # Check if there's an active LLM stream (heuristic: _current_stream or similar).
    for stream_attr in ("_current_stream", "_active_stream", "active_stream"):
        try:
            val = getattr(conversation, stream_attr, None)
            if val is not None:
                state["has_active_stream"] = True
                break
        except Exception:  # noqa: BLE001
            pass
    else:
        state["has_active_stream"] = None
    return state


# ---------------------------------------------------------------------------
# Tool activity registry
# ---------------------------------------------------------------------------


class ToolActivityRegistry:
    """Thread-safe registry of in-flight tool calls per child.

    Written from the SDK worker thread (conversation event callbacks) and
    read from UI/signal-handler threads plus the graceful-pause poll
    threads. All access is serialized by an internal lock — the previous
    plain-dict tracking had a discard-then-delete window where a
    concurrently started tool call could be dropped, making a graceful
    pause believe no tools were running.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._active: dict[str, set[str]] = {}

    def tool_started(self, canonical_name: str, call_id: str) -> None:
        with self._lock:
            self._active.setdefault(canonical_name, set()).add(call_id)

    def tool_finished(self, canonical_name: str, call_id: str) -> None:
        with self._lock:
            tool_set = self._active.get(canonical_name)
            if tool_set is None:
                return
            tool_set.discard(call_id)
            if not tool_set:
                del self._active[canonical_name]

    def clear(self, canonical_name: str) -> None:
        """Drop all tracking for *canonical_name* (child run has ended)."""
        with self._lock:
            self._active.pop(canonical_name, None)

    def has_active_tools(self, canonical_name: str) -> bool:
        with self._lock:
            return bool(self._active.get(canonical_name))

    def active_tool_ids(self, canonical_name: str) -> set[str]:
        """Return a snapshot copy of the active tool call ids."""
        with self._lock:
            return set(self._active.get(canonical_name, ()))


# ---------------------------------------------------------------------------
# Idempotence guard for graceful_pause_conversation
# ---------------------------------------------------------------------------

_graceful_pause_inflight: set[str] = set()
_graceful_pause_inflight_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Pause / close helpers
# ---------------------------------------------------------------------------


_CONVERSATION_PAUSE_TIMEOUT_S = 20.0


class SupportsPause(Protocol):
    def pause(self) -> None: ...


def pause_with_daemon(conversation: SupportsPause, *, block: bool = True) -> None:
    """Pause *conversation* in a daemon thread with a 20 s timeout.

    Dispatches ``conversation.pause()`` to a daemon thread so the caller
    never blocks on the pause call itself (critical for signal-handler /
    UI-thread callers). With ``block=True`` the caller additionally waits
    up to the timeout for the pause to land. Pass ``block=False`` from call
    sites that run *inside* the conversation's own run loop (tool
    executors): the run loop cannot advance to its pause check until the
    executor returns, so blocking there always burns the full timeout. The
    completion/warning log then comes from a watchdog thread instead.
    """
    event = threading.Event()
    pre_state = capture_conversation_state(conversation)

    def _do_pause() -> None:
        try:
            conversation.pause()
        except Exception:
            _log.exception("Failed to pause active conversation during shutdown")
        finally:
            event.set()

    t = threading.Thread(target=_do_pause, name="rotaris-conversation-pause", daemon=True)
    t.start()

    def _await_and_log() -> None:
        if not event.wait(timeout=_CONVERSATION_PAUSE_TIMEOUT_S):
            _log.warning(
                "conversation.pause() did not complete within %.0fs (pre_state=%s)",
                _CONVERSATION_PAUSE_TIMEOUT_S,
                pre_state,
            )
        else:
            _log.info(
                "conversation.pause() completed (pre_state=%s)",
                pre_state,
            )

    if block:
        _await_and_log()
        return
    threading.Thread(
        target=_await_and_log,
        name="rotaris-conversation-pause-watch",
        daemon=True,
    ).start()


def close_conversation_async(conversation: Any, name_hint: str = "") -> None:
    """Close *conversation* in a daemon thread with a 50ms initial wait.

    Spawns a separate watchdog thread that logs a warning if ``close()``
    does not complete within 3s.
    """
    event = threading.Event()
    context = f" [{name_hint}]" if name_hint else ""

    def _do_close() -> None:
        try:
            conversation.close()
        except Exception:  # noqa: BLE001
            _log.exception("Failed to close active conversation during shutdown%s", context)
        finally:
            event.set()

    close_thread = threading.Thread(
        target=_do_close,
        name="rotaris-conversation-close",
        daemon=True,
    )
    close_thread.start()
    if event.wait(timeout=0.05):
        return

    def _warn_if_still_open() -> None:
        if not event.wait(timeout=3.0):
            _log.warning("conversation.close() did not complete within 3s%s", context)

    threading.Thread(
        target=_warn_if_still_open,
        name="rotaris-conversation-close-watchdog",
        daemon=True,
    ).start()


@traces(SWR.SWR_162)
def graceful_pause_conversation(
    conversation: Any,
    canonical_name: str,
    *,
    registry: ToolActivityRegistry,
    tool_deadline: float = 30.0,
    force_close_when_stuck: bool = False,
    force_close_on_deadline: bool = True,
    poll_interval: float = 0.5,
) -> None:
    """Pause or close a conversation, waiting for active tools to complete first.

    If no tools are currently running for *canonical_name*, pause immediately.
    If tools are running, spawn a daemon thread that polls every
    *poll_interval* seconds waiting for them to finish (up to *tool_deadline*
    seconds). When tools finish within the deadline, pause the conversation.
    When the deadline expires with tools still running and
    *force_close_on_deadline* is True, force-close the conversation.
    When ``force_close_on_deadline=False``, pause immediately on deadline
    expiry instead of force-closing — the conversation will be resumed.

    This function always returns immediately — all work is dispatched to
    daemon threads so it never blocks the caller (critical: ``request_stop``
    is called from signal handlers / UI threads that must not block).

    Args:
        conversation: The SDK conversation to pause/close.
        canonical_name: The child's canonical name for tool lookup.
        registry: Tool-activity registry consulted for in-flight tool calls.
        tool_deadline: Seconds to wait for tools before force-closing.
        force_close_when_stuck: If True, skip the tool-wait and force-close.
        force_close_on_deadline: If False, pause immediately on deadline
            instead of force-closing (for conversations that will be resumed).
        poll_interval: Seconds between registry polls in the wait thread.
    """
    # --- idempotence guard ---
    # Multiple callers (_pause_parent_for_background_notification for each
    # background child that finishes, request_stop, etc.) can race to pause
    # the same parent.  Only let one graceful-pause daemon thread run per
    # canonical_name at a time, otherwise the second thread starts its own
    # 30 s countdown and force-closes the already-paused conversation.
    with _graceful_pause_inflight_lock:
        if canonical_name in _graceful_pause_inflight:
            _log.debug(
                "Graceful pause already in-flight for %s; skipping duplicate.",
                canonical_name,
            )
            return
        _graceful_pause_inflight.add(canonical_name)

    def _done() -> None:
        with _graceful_pause_inflight_lock:
            _graceful_pause_inflight.discard(canonical_name)

    if force_close_when_stuck:
        _done()
        close_conversation_async(conversation, name_hint=canonical_name)
        return

    if not registry.has_active_tools(canonical_name):
        # No tools active — pause immediately.
        # safety net: any leaked entries are stale
        registry.clear(canonical_name)
        pause_with_daemon(conversation)
        _done()
        return

    def _wait_then_pause() -> None:
        try:
            deadline = time.monotonic() + tool_deadline
            while time.monotonic() < deadline:
                if not registry.has_active_tools(canonical_name):
                    _log.info(
                        "Graceful pause: tools finished for %s; pausing now.",
                        canonical_name,
                    )
                    registry.clear(canonical_name)
                    pause_with_daemon(conversation)
                    return
                time.sleep(poll_interval)

            # Deadline expired — tools still running.
            if force_close_on_deadline:
                _log.warning(
                    "Graceful pause: tools still active for %s after %.1fs; "
                    "force-closing conversation.",
                    canonical_name,
                    tool_deadline,
                )
                registry.clear(canonical_name)
                close_conversation_async(conversation, name_hint=canonical_name)
            else:
                _log.info(
                    "Graceful pause: tools still active for %s after %.1fs; "
                    "pausing immediately (force_close_on_deadline=False).",
                    canonical_name,
                    tool_deadline,
                )
                registry.clear(canonical_name)
                pause_with_daemon(conversation)
        finally:
            _done()

    threading.Thread(
        target=_wait_then_pause,
        name=f"rotaris-graceful-pause-{canonical_name}",
        daemon=True,
    ).start()
