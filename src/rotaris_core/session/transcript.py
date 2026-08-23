"""The run's account of itself, written as it happens (SWR-2454).

``SessionState.transcript_events`` is the list of rows a session renders as a
conversation.  Until now the engine barely wrote it: ``cli/background.py``
appended the prompt, the intent line, and then — *after* the loop had finished —
one row per iteration.  Everything that makes a transcript worth reading (an
agent's message as it streams, the reasoning behind it, a tool call and how it
turned out) was built by the Rotaris desktop's own run observer, in the desktop
package, from callbacks the desktop installed.

Two consequences followed from that, and this module exists to remove both.

* **A CLI or headless session had no live transcript at all.**  Its record was
  near-empty until the run ended, so anything looking at that session while it
  ran — another process, a second window, an inspection tool — had nothing to
  show, however often it looked.
* **There was one transcript and two potential ways to derive it.**  The moment a
  second host wanted rows it would have built its own, and two views of one run
  would have disagreed about what that run said.

:class:`TranscriptRecorder` is the one writer.  It holds no Qt, no host and no
opinion about who is watching: it turns conversation events into rows, mutates
the rows a live turn is still changing, and reports what it touched.  A host
adds what it needs on top — the desktop publishes deltas to its view, the CLI
publishes nothing — and every host gets the same rows.

**Rows are mutated in place.**  A streamed message grows token by token; a tool
row is opened on the call and settled on the result.  ``record_*`` therefore
reports *which* rows it touched rather than only that something changed, and a
row this recorder may still change again is reported by :meth:`held_rows`.  That
set is bounded by how much is happening at once — agents, in-flight calls,
checks — never by how long the session has run, which is what lets a host
describe a change in time proportional to the change (SWR-2454).

**What reaches the wire.**  A row is published as a ``transcript.row`` event
(SWR-1829) when it is appended and again when it settles, so a consumer that can
only see the event store — a session running in another process — can rebuild
the same transcript.  Deliberately *not* on every mutation: a streamed row
changes once per token, and a store that recorded each of those would spend its
whole cap on one message.  The cost of that choice is stated where it lands: a
foreign viewer sees a streaming row's first token, then its finished text at the
end of the turn, and not the growth in between.
"""

from __future__ import annotations

import logging
import time
from threading import RLock
from typing import TYPE_CHECKING, Any

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.session.state import SessionState

_log = logging.getLogger(__name__)

#: How a verifier check's own status renders as a transcript row status.
_VERIFIER_ROW_STATUS: dict[str, str] = {
    "passed": "ok",
    "failed": "failed",
    "timeout": "failed",
    "skipped": "blocked",
}


def _is_terminal_tool(tool_name: str) -> bool:
    """True for the shell tool under any of the names it has been called."""
    return tool_name.strip().lower() in {"terminal", "bash"}


@traces(SWR.SWR_2454, SWR.SWR_2417, SWR.SWR_2419, SWR.SWR_2421, SWR.SWR_2432, SWR.SWR_2446)
class TranscriptRecorder:
    """Turn one run's conversation into the rows its transcript renders.

    Args:
        state: The session record this writes into.  Rows are appended to
            ``state.transcript_events`` and edit diffs to ``state.ui_edit_diffs``;
            tool counts land in ``state.agent_metrics``.
        on_change: Called after every change with the rows that changed and are
            no longer held — the host's cue to persist, publish, or both.  The
            rows still in flight are :meth:`held_rows`, and a host needs both to
            work out what to send.
        publish: Called with ``(index, row)`` for a row the wire should carry.
            ``None`` for a recorder whose rows nobody outside the process needs.

    Not thread-safe, and does not need to be: every ``record_*`` entry point is
    called from the run's own event-loop thread, which is also the thread that
    owns *state*.
    """

    #: Caps for persisted chat payloads — the record is rewritten on every save,
    #: so an unbounded row costs the whole session every time.
    TOOL_DETAIL_MAX = 400
    TOOL_FULL_MAX = 2000
    THINKING_MAX = 4000

    def __init__(
        self,
        state: SessionState,
        *,
        on_change: Callable[[tuple[dict[str, Any], ...]], None] | None = None,
        publish: Callable[[int, dict[str, Any]], None] | None = None,
    ) -> None:
        self.state = state
        self.on_change = on_change
        self.publish = publish
        #: Live row references (the dicts inside ``state.transcript_events``) so
        #: streamed deltas and tool results update rows in place.
        self._stream_segments: dict[str, dict[str, Any]] = {}
        self._thinking_segments: dict[str, dict[str, Any]] = {}
        #: Most recent thinking row per agent, kept past ``_finish_thinking`` so
        #: an action event's complete ``reasoning_content`` folds into the burst
        #: it repeats instead of duplicating it (SWR-2446).
        self._last_thinking_rows: dict[str, dict[str, Any]] = {}
        self._committed_message_segments: dict[str, dict[str, Any]] = {}
        self._tool_rows: dict[str, dict[str, Any]] = {}
        #: Monotonic start per in-flight call (same key as ``_tool_rows``) —
        #: kept out of the rows because the value is process-local.
        self._tool_started: dict[str, float] = {}
        #: In-flight tool calls per agent (call_id → tool name).
        self._active_tool_calls: dict[str, dict[str, str]] = {}
        #: SDK callbacks can replay an event while a conversation is resumed.
        #: Count each stable call id once in the live session metrics.
        self._counted_tool_calls: set[str] = set()
        #: The SDK can likewise replay a committed message event on resume.
        #: Keep its stable event id from creating a second row.
        self._persisted_message_events: set[str] = set()
        #: Live verifier rows keyed by ``"<iteration>:<index>"`` (SWR-2609).
        self._verifier_rows: dict[str, dict[str, Any]] = {}
        #: Raw index of each row, by object identity.  ``_append`` is the only
        #: place a row is added, which is what makes this complete.  Seeded from
        #: what the record already holds, because a resumed session's rows are
        #: real rows a host may still need to locate.
        self._row_index: dict[int, int] = {
            id(row): index for index, row in enumerate(state.transcript_events)
        }

    # ── what a host asks about ───────────────────────────────────────────

    def held_rows(self) -> list[dict[str, Any]]:
        """Every row this recorder may still mutate in place.

        The streamed tail, an open tool call, an unsettled check, a reasoning
        burst that may still be folded.  Bounded by how much is happening at
        once and not by session length, which is what makes a host's change
        boundary cheap to compute.
        """
        held: list[dict[str, Any]] = []
        for source in (
            self._stream_segments,
            self._thinking_segments,
            self._last_thinking_rows,
            self._committed_message_segments,
            self._tool_rows,
            self._verifier_rows,
        ):
            held.extend(source.values())
        return held

    def index_of(self, row: dict[str, Any]) -> int | None:
        """Where *row* sits in the transcript, or ``None`` if it is not ours."""
        return self._row_index.get(id(row))

    def reindex(self) -> None:
        """Rebuild the index from the record.

        For a host that reloaded the transcript underneath this recorder — a
        resumed session, a restored checkpoint.  Nothing is held afterwards,
        because none of those rows belongs to a turn still in flight.
        """
        self._row_index = {id(row): index for index, row in enumerate(self.state.transcript_events)}
        self._stream_segments.clear()
        self._thinking_segments.clear()
        self._last_thinking_rows.clear()
        self._committed_message_segments.clear()
        self._tool_rows.clear()
        self._tool_started.clear()
        self._verifier_rows.clear()

    def active_tool_names(self, agent_name: str) -> list[str]:
        """Tools *agent_name* has in flight right now."""
        return sorted(set(self._active_tool_calls.get(agent_name, {}).values()))

    def forget_active_tools(self, agent_name: str) -> None:
        """Drop an ended agent's in-flight calls.

        A child that died mid-call never sends the result that would have closed
        them, so without this its chips stay lit for the rest of the session.
        """
        self._active_tool_calls.pop(agent_name, None)

    # ── recording ────────────────────────────────────────────────────────

    @traces(SWR.SWR_2421)
    def record_conversation_event(self, agent_name: str, persona: str, event: object) -> bool:
        """Record one SDK conversation event.  ``True`` when the transcript changed."""
        from openhands.sdk.event.condenser import Condensation
        from openhands.sdk.event.llm_convertible.action import ActionEvent
        from openhands.sdk.event.llm_convertible.message import MessageEvent
        from openhands.sdk.event.llm_convertible.observation import (
            AgentErrorEvent,
            ObservationEvent,
            UserRejectObservation,
        )

        changed = False
        settled: list[dict[str, Any]] = []
        if isinstance(event, Condensation):
            self._append(
                {
                    "role": "system",
                    "content": (
                        "Memory condensed: preserved facts and cleared history to save tokens."
                    ),
                }
            )
            changed = True
        elif isinstance(event, ActionEvent):
            changed = self._record_action(agent_name, persona, event, settled)
        elif isinstance(event, ObservationEvent | UserRejectObservation | AgentErrorEvent):
            changed = self._record_tool_result(agent_name, event, settled)
        elif isinstance(event, MessageEvent) and str(getattr(event, "source", "")) == "agent":
            changed = self._record_agent_message(agent_name, persona, event)

        if changed:
            self._changed(*settled)
        return changed

    @traces(SWR.SWR_2446)
    def record_token_chunk(self, agent_name: str, persona: str, chunk: object) -> bool:
        """Record one streamed token chunk.  ``True`` when the transcript changed."""
        from rotaris_core.tui.streaming import extract_reasoning_text, extract_stream_text

        changed = False
        reasoning_delta = extract_reasoning_text(chunk)
        if reasoning_delta:
            self._append_thinking(agent_name, persona, reasoning_delta, streaming=True)
            changed = True

        text_delta, _has_reasoning = extract_stream_text(chunk)
        if text_delta and not text_delta.strip() and agent_name not in self._stream_segments:
            # A blank line ahead of the first visible token belongs to no
            # message yet — opening a row for it would show an empty one. Once
            # a segment is open the same whitespace is kept, because that is
            # what separates the Markdown blocks inside it (SWR-1217).
            text_delta = ""
        if text_delta:
            # Visible text ends the thinking burst.
            self._finish_thinking(agent_name)
            seg = self._stream_segments.get(agent_name)
            if seg is None:
                self._committed_message_segments.pop(agent_name, None)
                seg = self._append(
                    {
                        "role": "agent",
                        "name": agent_name,
                        "persona": persona,
                        "content": text_delta,
                    }
                )
                self._stream_segments[agent_name] = seg
            else:
                seg["content"] = str(seg.get("content", "")) + text_delta
            changed = True

        if changed:
            self._changed()
        return changed

    def record_system(self, content: str) -> dict[str, Any]:
        """Append one system row — a notice the run wants in the conversation."""
        row = self._append({"role": "system", "content": content})
        self._changed()
        return row

    def record_user(self, content: str) -> dict[str, Any]:
        """Append the prompt a person gave this run."""
        row = self._append({"role": "user", "content": content})
        self._changed()
        return row

    def record_agent(self, agent_name: str, content: str) -> dict[str, Any]:
        """Append one agent row the conversation did not produce itself.

        For the outcome of an iteration whose answer came from a report rather
        than from a message — a child that failed and was summarised, a run whose
        conversation this recorder never saw.
        """
        row = self._append({"role": "agent", "name": agent_name, "content": content})
        self._changed()
        return row

    def amend(self, row: dict[str, Any], **fields: Any) -> None:
        """Change a row already recorded, and report it as settled.

        For the case where what a row should say is only known after it was
        written — the run-intent line, which is appended before the todo it is
        phrased against exists.
        """
        row.update(fields)
        self._changed(row)

    def has_agent_rows(self) -> bool:
        """Whether any agent has spoken into this transcript.

        Asked by the runner: an iteration's outcome needs a row of its own only
        when the conversation left none, which happens when this recorder never
        saw the conversation at all.
        """
        return any(str(row.get("role") or "") == "agent" for row in self.state.transcript_events)

    @traces(SWR.SWR_2609)
    def record_verifier_check_started(
        self,
        iteration_num: int,
        check: Any,
        index: int,
        started: float,
    ) -> None:
        """Open a live row for one post-change check."""
        name = str(getattr(check, "name", "") or "check")
        command = str(getattr(check, "command", "") or "")
        row = self._append(
            {
                "role": "verifier",
                "name": "verifier",
                "persona": "verifier",
                "tool": name,
                "content": command,
                "detail": "",
                "full_text": self.cap_full_text(command),
                "full_detail": "",
                "tool_event_key": f"verify:{iteration_num}:{index}",
                "tool_terminal": False,
                "status": "running",
                "started_at": started,
            }
        )
        self._verifier_rows[f"{iteration_num}:{index}"] = row
        self._changed()

    @traces(SWR.SWR_2609, SWR.SWR_2610)
    def record_verifier_check_finished(self, iteration_num: int, result: Any, index: int) -> None:
        """Settle a check's row on its own outcome, not on the suite's."""
        row = self._verifier_rows.pop(f"{iteration_num}:{index}", None)
        status = str(getattr(result, "status", "") or "")
        detail = str(getattr(result, "skip_reason", "") or "") or str(
            getattr(result, "output_excerpt", "") or ""
        )
        full_detail = self.cap_full_text(detail)
        capped = full_detail
        if len(capped) > self.TOOL_DETAIL_MAX:
            capped = capped[: self.TOOL_DETAIL_MAX - 1].rstrip() + "…"
        if row is None:
            # A check that was never announced (a permission denial, or a suite
            # whose budget ran out before it started) still deserves a row.
            row = self._append(
                {
                    "role": "verifier",
                    "name": "verifier",
                    "persona": "verifier",
                    "tool": str(getattr(result, "name", "") or "check"),
                    "content": str(getattr(result, "command", "") or ""),
                    "tool_event_key": f"verify:{iteration_num}:{index}",
                }
            )
        row["detail"] = capped
        row["full_detail"] = full_detail
        row["tool_terminal"] = True
        row["status"] = _VERIFIER_ROW_STATUS.get(status, "failed")
        row["duration"] = float(getattr(result, "duration_s", 0.0) or 0.0)
        # Named explicitly: the row was popped above, so it is no longer among
        # the rows ``held_rows`` reports.
        self._changed(row)

    @traces(SWR.SWR_2446)
    def finish_all_thinking(self) -> None:
        """Stamp durations on every reasoning burst still open.

        For the end of an iteration: a burst whose agent never spoke again would
        otherwise render as reasoning that never stopped.
        """
        settled = [
            row
            for row in (self._finish_thinking(name) for name in list(self._thinking_segments))
            if row is not None
        ]
        if settled:
            self._changed(*settled)

    def clear_verifier_rows(self) -> None:
        """Let go of any check rows the suite left open."""
        self._verifier_rows.clear()

    def clear(self) -> None:
        """Drop the whole transcript, as a user clearing the chat asks for."""
        self.state.transcript_events.clear()
        self._stream_segments.clear()
        self._thinking_segments.clear()
        self._last_thinking_rows.clear()
        self._committed_message_segments.clear()
        self._tool_rows.clear()
        self._tool_started.clear()
        self._verifier_rows.clear()
        self._row_index.clear()
        self._changed()

    # ── row construction ─────────────────────────────────────────────────

    @classmethod
    def cap_full_text(cls, text: str, *, preserve_lines: bool = False) -> str:
        """Truncate-with-ellipsis for a tool row's untruncated detail fields.

        Collapsing whitespace is right for a one-line summary and wrong for
        command output: a test run flattened into a single line is unreadable,
        and it is the persisted fallback a reloaded session renders from
        (SWR-2428).
        """
        if preserve_lines:
            text = "\n".join(line.rstrip() for line in text.splitlines())
        else:
            text = " ".join(text.split())
        if len(text) > cls.TOOL_FULL_MAX:
            return text[: cls.TOOL_FULL_MAX - 1].rstrip() + "…"
        return text

    @staticmethod
    def _timestamp() -> str:
        return time.strftime("%H:%M:%S")

    def _append(self, row: dict[str, Any]) -> dict[str, Any]:
        """Add one row to the transcript and announce it.

        The only place a row is created, which is what makes ``_row_index``
        complete rather than best-effort.
        """
        row.setdefault("ts", self._timestamp())
        index = len(self.state.transcript_events)
        self._row_index[id(row)] = index
        self.state.transcript_events.append(row)
        self._emit(index, row)
        return row

    def _emit(self, index: int, row: dict[str, Any]) -> None:
        """Offer one row to the wire.  Never raises into the run."""
        if self.publish is None:
            return
        try:
            self.publish(index, row)
        except Exception:  # noqa: BLE001 - a stream consumer may not fail a run.
            _log.warning("Could not publish a transcript row.", exc_info=True)

    def _changed(self, *settled: dict[str, Any]) -> None:
        """Report the change: settled rows to the wire, everything to the host."""
        for row in settled:
            index = self._row_index.get(id(row))
            if index is not None:
                self._emit(index, row)
        if self.on_change is None:
            return
        try:
            self.on_change(settled)
        except Exception:  # noqa: BLE001 - a host's reaction may not fail a run.
            _log.warning("A transcript change handler failed.", exc_info=True)

    @traces(SWR.SWR_2417, SWR.SWR_2444, SWR.SWR_2432)
    def _record_action(
        self,
        agent_name: str,
        persona: str,
        event: Any,
        settled: list[dict[str, Any]],
    ) -> bool:
        """Persist one tool call as a chat row; flush thought/reasoning first."""
        from rotaris_core.tui.live_activity import describe_sdk_event

        reasoning = getattr(event, "reasoning_content", None)
        if isinstance(reasoning, str) and reasoning.strip():
            self._append_thinking(agent_name, persona, reasoning)

        thought_text = self._visible_text(getattr(event, "thought", None) or [])
        if thought_text:
            self._persist_visible_text(agent_name, persona, thought_text)

        # A tool call starts: streamed and thinking segments belong to the turn
        # before it, and are finished text now rather than a growing tail.
        settled.extend(self._close_segments(agent_name))

        update = describe_sdk_event(event) or {}
        summary = update.get("activity_text") or str(getattr(event, "tool_name", "tool"))
        full_summary = self.cap_full_text(str(update.get("feed_text") or summary))
        row = self._append(
            {
                "role": "tool",
                "name": agent_name,
                "persona": persona,
                "tool": str(getattr(event, "tool_name", "")),
                "content": summary,
                "detail": "",
                "full_text": full_summary,
                "full_detail": "",
                "tool_event_key": str(getattr(event, "tool_call_id", "") or ""),
                "tool_terminal": False,
                "status": "running",
                # Wall-clock, unlike the monotonic stamp below: the UI has to
                # count a running call upward across process boundaries, and a
                # grouped run of calls times itself from the first one (SWR-2432).
                "started_at": time.time(),
            }
        )
        call_id = str(getattr(event, "tool_call_id", "") or "")
        tool_name = str(getattr(event, "tool_name", "") or "")
        if _is_terminal_tool(tool_name):
            # The engine publishes this agent's foreground terminal under its
            # canonical name, which is the name this row is stamped with — so
            # the preview can find the live screen (SWR-2428).
            row["stream_id"] = f"fg:{agent_name}"
        self._count_tool_call(agent_name, tool_name, call_id)
        if call_id:
            self._tool_rows[f"{agent_name}:{call_id}"] = row
            self._tool_started[f"{agent_name}:{call_id}"] = time.monotonic()
            if tool_name:
                self._active_tool_calls.setdefault(agent_name, {})[call_id] = tool_name
                self._sync_child_active_tools(agent_name)
        return True

    def _count_tool_call(self, agent_name: str, tool_name: str, call_id: str) -> None:
        """Mirror a started call into session metrics before the conversation ends."""
        if not tool_name:
            return
        stable_id = f"{agent_name}:{call_id}" if call_id else ""
        if stable_id and stable_id in self._counted_tool_calls:
            return
        if stable_id:
            self._counted_tool_calls.add(stable_id)

        from rotaris_core.session.state import AgentMetrics

        metrics = self.state.agent_metrics.setdefault(agent_name, AgentMetrics())
        metrics.tool_calls[tool_name] = metrics.tool_calls.get(tool_name, 0) + 1
        metrics.tool_call_count += 1
        self.state.global_tool_call_count += 1

    @traces(SWR.SWR_2417, SWR.SWR_2419, SWR.SWR_2444)
    def _record_tool_result(
        self,
        agent_name: str,
        event: Any,
        settled: list[dict[str, Any]],
    ) -> bool:
        """Attach a tool result or failure to the row that started it."""
        from rotaris_core.tui.live_activity import describe_sdk_event

        update = describe_sdk_event(event)
        if update is None:
            return False
        icon = update.get("activity_icon", "")
        status = {"completed": "ok", "failed": "failed", "blocked": "blocked"}.get(
            str(update.get("activity_phase", "")), "ok"
        )
        full_detail_text = str(update.get("feed_text") or update.get("activity_text") or "")
        call_id = str(getattr(event, "tool_call_id", "") or "")
        row = self._tool_rows.pop(f"{agent_name}:{call_id}", None)
        terminal_row = _is_terminal_tool(str((row or {}).get("tool") or ""))
        full_detail_text = self.cap_full_text(full_detail_text, preserve_lines=terminal_row)
        detail = " ".join(full_detail_text.split()) if terminal_row else full_detail_text
        if len(detail) > self.TOOL_DETAIL_MAX:
            detail = detail[: self.TOOL_DETAIL_MAX - 1].rstrip() + "…"
        started_at = self._tool_started.pop(f"{agent_name}:{call_id}", None)
        open_calls = self._active_tool_calls.get(agent_name)
        tool_name = open_calls.get(call_id, "") if open_calls is not None else ""
        if open_calls is not None and call_id in open_calls:
            del open_calls[call_id]
            self._sync_child_active_tools(agent_name)
        if row is not None:
            row["detail"] = detail
            row["full_detail"] = full_detail_text
            row["tool_terminal"] = True
            row["status"] = status
            if started_at is not None:
                row["duration"] = round(time.monotonic() - started_at, 1)
            self._persist_ui_edit_diff(agent_name, event, row)
            settled.append(row)
        else:
            self._append({"role": "system", "content": f"{icon} {detail}".strip()})
        pending = self.state.pending_questions
        if (
            tool_name == "ask_questions"
            and isinstance(pending, dict)
            and pending.get("agent_id") == agent_name
        ):
            self.state.pending_questions = None
        return True

    def _record_agent_message(self, agent_name: str, persona: str, event: Any) -> bool:
        content = self._visible_text(getattr(event.llm_message, "content", []) or [])
        if not content:
            return False
        event_id = str(getattr(event, "id", "") or "")
        stable_id = f"{agent_name}:{event_id}" if event_id else ""
        if stable_id and stable_id in self._persisted_message_events:
            return False
        self._persist_visible_text(agent_name, persona, content)
        if stable_id:
            self._persisted_message_events.add(stable_id)
        return True

    @staticmethod
    def _visible_text(items: Any) -> str:
        from rotaris_core.sdk_text import visible_message_text

        return visible_message_text(items)

    @traces(SWR.SWR_2419)
    def _persist_ui_edit_diff(
        self,
        agent_name: str,
        event: Any,
        tool_row: dict[str, Any],
    ) -> None:
        """Persist one structured diff outside the model-visible transcript."""
        observation = getattr(event, "observation", None)
        raw_diff = getattr(observation, "ui_diff", None)
        if not isinstance(raw_diff, dict):
            return

        from rotaris_core.edit_diff import EditDiffArtifact

        tool_name = str(tool_row.get("tool") or getattr(event, "tool_name", "") or "")
        tool_event_key = str(tool_row.get("tool_event_key") or "").strip() or None
        diff_id = (
            f"{agent_name}:{tool_event_key}"
            if tool_event_key is not None
            else f"{agent_name}:{tool_name}:{len(self.state.ui_edit_diffs)}"
        )
        try:
            diff = EditDiffArtifact.model_validate(
                {
                    **raw_diff,
                    "diff_id": diff_id,
                    "agent_name": agent_name,
                    "tool_name": tool_name,
                    "tool_event_key": tool_event_key,
                }
            )
        except Exception:  # noqa: BLE001 - invalid SDK UI metadata must not break the run
            return

        payload = diff.model_dump(mode="json")
        for index, existing in enumerate(self.state.ui_edit_diffs):
            if str(existing.get("diff_id") or "") != diff_id:
                continue
            self.state.ui_edit_diffs[index] = payload
            return
        self.state.ui_edit_diffs.append(payload)

    def _sync_child_active_tools(self, agent_name: str) -> None:
        """Mirror the live tool set onto the persisted child state entry."""
        tools = self.active_tool_names(agent_name)
        for item in self.state.child_states:
            if str(item.get("canonical_name") or item.get("name")) == agent_name:
                item["active_tools"] = tools

    @traces(SWR.SWR_2446)
    def _append_thinking(
        self, agent_name: str, persona: str, text: str, *, streaming: bool = False
    ) -> None:
        if not streaming:
            self._reconcile_thinking(agent_name, persona, text)
            return
        seg = self._thinking_segments.get(agent_name)
        if seg is None:
            seg = self._append(
                {
                    "role": "thinking",
                    "name": agent_name,
                    "persona": persona,
                    "content": "",
                    "started_at": time.time(),
                    "chars": 0,
                }
            )
            self._thinking_segments[agent_name] = seg
            self._last_thinking_rows[agent_name] = seg
        # Count every streamed character — the persisted content is capped, but
        # the token estimate in the transcript keeps climbing past the cap.
        seg["chars"] = int(seg.get("chars", 0) or 0) + len(text)
        existing = str(seg.get("content", ""))
        if len(existing) < self.THINKING_MAX:
            seg["content"] = (existing + text)[: self.THINKING_MAX]

    @traces(SWR.SWR_2446)
    def _reconcile_thinking(self, agent_name: str, persona: str, text: str) -> None:
        """Fold an action event's complete ``reasoning_content`` into its burst.

        The SDK delivers reasoning twice: streamed as deltas, then whole on the
        action event that ends the turn. The second copy must never become its
        own row — it duplicated every burst, and with no duration ever stamped
        it rendered as a perpetually counting "reasoning…" row.
        """
        seg = self._thinking_segments.get(agent_name)
        if seg is not None:
            # The open streamed burst is the turn this action ends; the event's
            # reasoning is authoritative for it.
            seg["chars"] = max(int(seg.get("chars", 0) or 0), len(text))
            seg["content"] = text[: self.THINKING_MAX]
            return
        last = self._last_thinking_rows.get(agent_name)
        if last is not None:
            content = str(last.get("content", ""))
            if content and (text.startswith(content) or content.startswith(text)):
                # Burst already closed (visible text ended it) — same reasoning.
                last["chars"] = max(int(last.get("chars", 0) or 0), len(text))
                last["content"] = text[: self.THINKING_MAX]
                return
        # Reasoning the provider never streamed: it arrives whole with the
        # action, so the row is complete on creation — no started_at, nothing
        # for the live tick to count.
        row = self._append(
            {
                "role": "thinking",
                "name": agent_name,
                "persona": persona,
                "content": text[: self.THINKING_MAX],
                "chars": len(text),
            }
        )
        self._last_thinking_rows[agent_name] = row

    @traces(SWR.SWR_2446)
    def _finish_thinking(self, agent_name: str) -> dict[str, Any] | None:
        """Stamp the thinking duration when a streamed burst ends."""
        seg = self._thinking_segments.pop(agent_name, None)
        if seg is None or "duration" in seg:
            return seg
        started_at = float(seg.get("started_at", 0.0) or 0.0)
        if started_at:
            seg["duration"] = round(max(0.0, time.time() - started_at), 1)
        return seg

    def _close_segments(self, agent_name: str) -> tuple[dict[str, Any], ...]:
        """End the turn's open segments and report the rows that are now final."""
        closed: list[dict[str, Any]] = []
        streamed = self._stream_segments.pop(agent_name, None)
        if streamed is not None:
            closed.append(streamed)
        thinking = self._finish_thinking(agent_name)
        if thinking is not None:
            closed.append(thinking)
        committed = self._committed_message_segments.pop(agent_name, None)
        if committed is not None and committed not in closed:
            closed.append(committed)
        return tuple(closed)

    @staticmethod
    def _message_key(text: str) -> str:
        """Whitespace-insensitive form of a message, for matching two copies of it.

        A streamed segment is assembled delta by delta while the final message
        arrives whole, so the two are sanitised at different boundaries and
        their whitespace can differ by a space or a newline. Comparing the
        words is what actually answers "is this the same message" — comparing
        the characters answers it wrong and posts the message twice.
        """
        return " ".join(text.split())

    def _persist_visible_text(self, agent_name: str, persona: str, content: str) -> None:
        """Commit an agent message, replacing its own streamed segment if any."""
        self._finish_thinking(agent_name)
        message_key = self._message_key(content)
        seg = self._stream_segments.pop(agent_name, None)
        if seg is not None:
            streamed = self._message_key(str(seg.get("content", "")))
            if not streamed or message_key.startswith(streamed) or streamed.startswith(message_key):
                seg["content"] = content
                self._committed_message_segments[agent_name] = seg
                return
        committed = self._committed_message_segments.get(agent_name)
        if committed is not None:
            prior = self._message_key(str(committed.get("content", "")))
            if prior and message_key.startswith(prior):
                committed["content"] = content
                return
        row = self._append(
            {"role": "agent", "name": agent_name, "persona": persona, "content": content}
        )
        self._committed_message_segments[agent_name] = row


# ── the registry ─────────────────────────────────────────────────────────
#
# The recorder is fed from ``orchestrator/child_run.py``, which sees every SDK
# event of every conversation and has a scheduler rather than a session record
# in hand.  A per-session registry is how the other run-scoped singletons reach
# that depth already — the event store, the approval host, the permission audit
# log — and this follows them rather than threading a recorder through three
# constructors.  Late binding is the point: ``discard_transcript_recorder``
# genuinely stops recording, so an event escaping a run's ``finally`` cannot
# append to a session that is over.

_recorders_lock = RLock()
_recorders: dict[str, TranscriptRecorder] = {}


@traces(SWR.SWR_2454)
def register_transcript_recorder(session_id: str, recorder: TranscriptRecorder) -> None:
    """Make *recorder* the transcript writer for *session_id*.

    Replaces any previous one.  A host that wants its own — the desktop, which
    publishes each change to its view — registers it before the run starts, and
    the runner then finds it instead of building a plain one.
    """
    if not session_id:
        raise ValueError("A transcript recorder needs a non-empty session id.")
    with _recorders_lock:
        _recorders[session_id] = recorder


@traces(SWR.SWR_2454)
def resolve_transcript_recorder(session_id: str | None) -> TranscriptRecorder | None:
    """The recorder registered for *session_id*, or ``None``.

    Never falls back to another session's: parallel runs share one process, and
    one run's rows in another run's transcript is worse than no rows at all.
    """
    if not session_id:
        return None
    with _recorders_lock:
        return _recorders.get(session_id)


@traces(SWR.SWR_2454)
def discard_transcript_recorder(session_id: str | None) -> None:
    """Stop recording for *session_id* once its run is over."""
    if not session_id:
        return
    with _recorders_lock:
        _recorders.pop(session_id, None)


def reset_transcript_recorders() -> None:
    """Clear every registration (test isolation and full-process shutdown)."""
    with _recorders_lock:
        _recorders.clear()


@traces(SWR.SWR_1829, SWR.SWR_2454)
def wire_publisher(session_id: str) -> Callable[[int, dict[str, Any]], None]:
    """A ``publish`` callable putting each row on the session's event bus.

    Separate from the recorder so that a recorder can be built without one — a
    test, a probe, a host reconstructing a transcript it is only reading.
    """

    def publish_row(index: int, row: dict[str, Any]) -> None:
        from rotaris_core.events.bus import publish
        from rotaris_core.events.schema import TranscriptRowEvent

        publish(
            session_id,
            TranscriptRowEvent(session_id=session_id, index=index, row=dict(row)),
        )

    return publish_row


@traces(SWR.SWR_2454)
def ensure_transcript_recorder(
    session_id: str,
    state: SessionState,
    *,
    on_change: Callable[[tuple[dict[str, Any], ...]], None] | None = None,
) -> TranscriptRecorder:
    """The recorder for this run, building and registering one if none exists.

    The runner calls this; a host that wants to observe every change registers
    its own first and gets it back untouched.  Doing it in one call is what stops
    the two halves drifting: a recorder registered without a wire publisher
    records a transcript nothing outside the process can follow, and a publisher
    without a recorder publishes nothing.

    A registered recorder is reused only while it is writing into *this* record.
    One left behind by a run that died before its teardown holds the previous
    record for that session id, and handing it back would write the resumed run's
    rows into an object nobody persists.
    """
    existing = resolve_transcript_recorder(session_id)
    if existing is not None and existing.state is state:
        return existing
    recorder = TranscriptRecorder(
        state,
        on_change=on_change,
        publish=wire_publisher(session_id),
    )
    register_transcript_recorder(session_id, recorder)
    return recorder
