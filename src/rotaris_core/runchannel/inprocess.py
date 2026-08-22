"""Reaching a run that shares this process (SWR-2453).

Three different mechanisms answer the one interface, and which is which is the
useful part of reading this file:

* **Session-keyed registries.** Approvals and terminal input already resolve by
  session id — ``resolve_approval_host``, the terminal stream hub — so they need
  nothing but the id. These were always the shape a boundary wants.
* **A process-global API object.** Steering and queued prompts go through
  ``prompt_api``, keyed by session for the queue.
* **The live run.** Everything else reaches objects only the executing process
  holds, through :class:`~rotaris_core.runchannel.control.RunSurface`.

Only the third group is what a process boundary would actually have to carry;
the first two would work across one almost unchanged. Writing them down
together is how that became visible.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.runchannel.messages import ControlResult

if TYPE_CHECKING:
    from collections.abc import Callable

    from rotaris_core.runchannel.control import RunSurface

__all__ = ["InProcessRunControl"]

_FAILED = ControlResult(False)
_OK = ControlResult(True)


@traces(SWR.SWR_2453)
class InProcessRunControl:
    """Drive a run executing in this process.

    Both dependencies are read through callables rather than held, because a
    handle outlives any one run: the session id is empty until the run reports
    started, and the surface disappears when it ends. Asking each time is what
    lets a refused call be reported as "the run is gone" instead of raising on
    a stale reference.
    """

    __slots__ = ("_session_id", "_surface")

    def __init__(
        self,
        session_id: Callable[[], str],
        surface: Callable[[], RunSurface | None],
    ) -> None:
        self._session_id = session_id
        self._surface = surface

    # ── prompts waiting on a person ──────────────────────────────────────

    @traces(SWR.SWR_2504)
    def resolve_approval(self, request_id: str, option: str) -> ControlResult:
        """Answer one pending permission approval.

        False when the waiting dispatch is already gone — the run ended, the
        request timed out — so a host can say the answer did not land instead of
        implying the tool call went ahead.
        """
        from rotaris_core.permissions import ApprovalOption, resolve_approval_host

        session_id = self._session_id()
        if not request_id or not session_id:
            return _FAILED
        host = resolve_approval_host(session_id)
        if host is None:
            return _FAILED
        try:
            choice = ApprovalOption(option)
        except ValueError:
            return _FAILED
        return ControlResult(bool(host.barrier.resolve(request_id, choice)))

    def resolve_questions(
        self,
        agent_id: str,
        prompt_id: str,
        answers: dict[str, dict[str, str | None]],
    ) -> ControlResult:
        surface = self._surface()
        if surface is None:
            return _FAILED
        return ControlResult(bool(surface.resolve_questions(agent_id, prompt_id, answers)))

    def cancel_questions(self, agent_id: str, prompt_id: str) -> ControlResult:
        surface = self._surface()
        if surface is None:
            return _FAILED
        return ControlResult(bool(surface.cancel_questions(agent_id, prompt_id)))

    # ── talking to the agents ────────────────────────────────────────────

    def steer(self, agent_id: str, text: str) -> ControlResult:
        if self._surface() is None or not agent_id or not text.strip():
            return _FAILED
        from rotaris_core.api.prompts import prompt_api

        prompt_api.submit_steering(agent_id, text.strip())
        return _OK

    @traces(SWR.SWR_2434)
    def queue_prompt(self, text: str) -> ControlResult:
        """Queue a follow-up owned by — and only consumable by — this run."""
        session_id = self._session_id()
        if self._surface() is None or not text.strip():
            return _FAILED
        from rotaris_core.api.prompts import prompt_api

        prompt_id = prompt_api.submit_queued(
            text.strip(),
            {"session_id": session_id},
            session_id=session_id,
        )
        return ControlResult(bool(prompt_id), prompt_id)

    def edit_queued_prompt(self, prompt_id: str, text: str) -> ControlResult:
        if self._surface() is None or not prompt_id or not text.strip():
            return _FAILED
        from rotaris_core.api.prompts import prompt_api

        try:
            prompt_api.update_queued(prompt_id, text)
        except (KeyError, ValueError):
            return _FAILED
        return _OK

    def delete_queued_prompt(self, prompt_id: str) -> ControlResult:
        if self._surface() is None or not prompt_id:
            return _FAILED
        from rotaris_core.api.prompts import prompt_api

        try:
            prompt_api.unqueue(prompt_id)
        except (KeyError, ValueError):
            return _FAILED
        return _OK

    def edit_todo(self, operation: str, target_id: str, text: str = "") -> ControlResult:
        return self._on_surface(lambda s: s.edit_todo(operation, target_id, text))

    # ── changing how the run behaves ─────────────────────────────────────

    def switch_entry_model(self, model_key: str) -> ControlResult:
        if not model_key:
            return _FAILED
        return self._on_surface(lambda s: s.switch_entry_model(model_key))

    def switch_entry_reasoning(self, reasoning: str) -> ControlResult:
        if not reasoning:
            return _FAILED
        return self._on_surface(lambda s: s.switch_entry_reasoning(reasoning))

    @traces(SWR.SWR_2503, SWR.SWR_2509)
    def set_permission_mode(self, mode: str) -> ControlResult:
        if not mode:
            return _FAILED
        return self._on_surface(lambda s: s.set_permission_mode(mode))

    def force_compress(self) -> ControlResult:
        return self._on_surface(lambda s: s.force_compress())

    def clear_transcript(self) -> ControlResult:
        return self._on_surface(lambda s: s.clear_transcript())

    # ── stopping things ──────────────────────────────────────────────────

    def cancel_agent(self, agent_id: str) -> ControlResult:
        if agent_id == "orchestrator":
            return self.cancel()
        return self._on_surface(lambda s: s.cancel_agent(agent_id))

    @traces(SWR.SWR_2610)
    def skip_verifier_check(self) -> ControlResult:
        return self._on_surface(lambda s: s.skip_verifier_check())

    def pause(self) -> ControlResult:
        return self._on_surface(lambda s: s.pause())

    def cancel(self) -> ControlResult:
        """Stop the run, releasing whatever is blocked on a human first.

        Order matters and is the same one the desktop always used: a dispatch
        waiting on an approval, or a tool waiting on an answer, is a synchronous
        block inside the run — cancelling the run without releasing those first
        leaves it unwinding against a wait nobody will ever satisfy.
        """
        surface = self._surface()
        if surface is None:
            return _FAILED
        surface.cancel_pending_questions()
        surface.cancel_pending_approvals()
        surface.cancel()
        return _OK

    # ── the terminal the agent is using ──────────────────────────────────

    @traces(SWR.SWR_2428)
    def send_keys(self, stream_id: str, text: str, enter: bool = False) -> ControlResult:
        from rotaris_core.terminal_stream.hub import default_hub

        session_id = self._session_id()
        if not session_id or not stream_id:
            return _FAILED
        return ControlResult(default_hub().send_keys(session_id, stream_id, text, enter=enter))

    def resize_terminal(self, stream_id: str, cols: int, rows: int) -> ControlResult:
        from rotaris_core.terminal_stream.hub import default_hub

        session_id = self._session_id()
        if not session_id or not stream_id:
            return _FAILED
        return ControlResult(default_hub().resize(session_id, stream_id, cols, rows))

    def interrupt_terminal(self, stream_id: str) -> ControlResult:
        return self.send_keys(stream_id, "C-c")

    def kill_terminal(self, stream_id: str) -> ControlResult:
        from rotaris_core.terminal_stream.hub import default_hub

        session_id = self._session_id()
        if not session_id or not stream_id:
            return _FAILED
        hub = default_hub()
        control = hub.resolve_control(session_id, stream_id)
        if control is None or control.kill is None:
            return _FAILED
        control.kill()
        return _OK

    # ── internals ────────────────────────────────────────────────────────

    def _on_surface(self, call: Callable[[RunSurface], bool]) -> ControlResult:
        surface = self._surface()
        if surface is None:
            return _FAILED
        return ControlResult(bool(call(surface)))
