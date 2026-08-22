"""Running user hooks with bounded failure (SWR-2704, SWR-2702, SWR-2703).

:class:`HookRunner` is the whole execution engine: it picks the hooks that apply
to one event, runs each as a real host process with the payload on stdin, maps
the exit code onto the documented semantics, and turns everything that can go
wrong into a :class:`HookOutcome` instead of an exception.

Three properties are load-bearing for the callers, which sit on an agent's hot
path (the tool-dispatch gate and the iteration observer):

* **Nothing raises.**  ``run_pre_tool`` / ``run_post_tool`` / ``run_lifecycle``
  are total.  A missing interpreter, an unwritable workspace, a hook that dies
  on a signal, a broken diagnostics directory — each becomes an outcome with a
  ``warning``, never an exception into the loop (SWR-2704).
* **Nothing hangs.**  Every process is spawned with an explicit timeout and
  killed when it expires, and the payload goes in through ``communicate`` so a
  hook that writes more than a pipe buffer cannot deadlock the caller.
* **Hooks are user code, not agent actions.**  They run on the host, through
  the user's shell, outside the permission policy and outside the sandbox
  (SWR-2702).  What keeps that honest is the audit trail: every invocation is
  written to the session timeline and every failure to the issue log (SWR-2506).

The payload never touches the command line.  It is handed to the process on
stdin as JSON, so a tool argument containing shell metacharacters is inert.

Every invocation is also published to the session's event bus as
``hook.start`` / ``hook.finish`` (SWR-1832), and so is a hook the workspace
trust gate refused (:func:`publish_skipped_hooks`, SWR-2815) — with
``skipped=True`` and no exit code, because no process ever existed.  Publishing
is best-effort and comes *after* the audit trail is written: a broken stream
degrades the stream, never the run.

Thread safety: ``run_*`` is synchronous and may be called concurrently from
several agent worker threads (``safe_agent._execute_action_event`` runs off the
event loop).  The failure counters and the disabled set live behind an
``RLock``; the subprocess itself runs outside that lock, so one slow hook cannot
serialise the others.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import time
from dataclasses import dataclass
from threading import RLock
from typing import TYPE_CHECKING, Any

from rotaris_core.events import HookFinishEvent, HookStartEvent, publish
from rotaris_core.hooks.models import (
    DEFAULT_HOOK_TIMEOUT_SECONDS,
    HOOK_FAILURE_DISABLE_THRESHOLD,
    LIFECYCLE_HOOK_EVENTS,
    MAX_HOOK_OUTPUT_BYTES,
    hooks_for_event,
    matches_tool,
)
from rotaris_core.hooks.payload import (
    RESERVED_LIFECYCLE_FIELDS,
    build_lifecycle_payload,
    build_tool_payload,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Mapping, Sequence
    from pathlib import Path

    from rotaris_core.hooks.models import ResolvedHook
    from rotaris_core.session.diagnostics import SessionDiagnostics

__all__ = ["HookOutcome", "HookRunner", "disabled_hooks_notice", "publish_skipped_hooks"]

_log = logging.getLogger(__name__)

#: The one exit code with a meaning beyond "worked" / "did not work": block a
#: ``pre_tool`` call, or inject feedback after a ``post_tool`` one (SWR-2702).
_BLOCK_EXIT_CODE = 2

#: Reported when the hook never produced an exit code of its own — it could not
#: be spawned, or it was killed on timeout.  Deliberately platform-independent:
#: a killed process reports ``-9`` on POSIX and ``1`` on Windows, and callers
#: should read :attr:`HookOutcome.timed_out` rather than guess from the code.
_NO_EXIT_CODE = -1

#: How long to wait for a killed process to be reaped before giving up on its
#: output.  Prevents the timeout path from becoming a second unbounded wait.
_REAP_GRACE_SECONDS = 5.0

#: Timeline event type for one hook invocation (SWR-2506 audit trail).
_TIMELINE_EVENT = "hook_run"

#: Longest excerpt of a failing hook's stderr embedded in a user-visible warning.
_WARNING_EXCERPT_LIMIT = 200

#: Why a hook that never ran did not run, on the ``hook.finish`` event it still
#: emits.  The only skip reason today is the SWR-2815 workspace trust gate.
SKIP_REASON_UNTRUSTED_WORKSPACE = "untrusted_workspace"


@dataclass(frozen=True, slots=True)
class HookOutcome:
    """What one hook invocation did, in terms the caller can act on.

    ``blocked`` and ``feedback`` drive control flow; ``warning`` drives the
    user-visible notification; everything else is evidence.
    """

    #: Stable identity of the hook entry (``source:index:event``).
    hook_id: str
    #: Display name, falling back to :attr:`hook_id` for an unnamed entry.
    name: str
    #: The event that fired it, e.g. ``"pre_tool"``.
    event: str
    #: The process exit code, or ``-1`` when it never produced one.
    exit_code: int
    #: Captured stdout, decoded leniently and bounded by ``MAX_HOOK_OUTPUT_BYTES``.
    stdout: str
    #: Captured stderr, same treatment.
    stderr: str
    #: The hook exceeded its timeout and was terminated.
    timed_out: bool
    #: The tool call must not proceed.  Only ever ``True`` for ``pre_tool``.
    blocked: bool
    #: Text to feed back to the agent; ``""`` when nothing is fed back.
    feedback: str
    #: User-visible warning; ``""`` when the hook behaved.
    warning: str
    #: Wall-clock duration of the invocation.
    duration_ms: int


@dataclass(frozen=True, slots=True)
class _Execution:
    """The raw result of one process run, before it is given a meaning."""

    exit_code: int
    stdout: str
    stderr: str
    timed_out: bool
    #: Why the process never ran at all; ``""`` when it did run.
    crash_reason: str
    duration_ms: int


def _bounded_text(raw: bytes) -> str:
    """Decode captured output leniently and cap it at the documented size.

    Non-UTF-8 bytes become replacement characters rather than an exception: a
    hook that prints a stray byte must not be able to crash the runner.
    """
    if len(raw) <= MAX_HOOK_OUTPUT_BYTES:
        return raw.decode("utf-8", errors="replace")
    head = raw[:MAX_HOOK_OUTPUT_BYTES].decode("utf-8", errors="replace")
    return f"{head}\n[truncated: {len(raw)} bytes of output, {MAX_HOOK_OUTPUT_BYTES} kept]"


def _timeout_for(hook: ResolvedHook) -> float:
    """The hook's wall-clock budget; the documented default when it has none.

    Config validation already rejects a non-positive timeout, but a runner is
    also built from hand-made hooks in tests and by the SDK, and "no budget"
    must never degrade into "unbounded".
    """
    return hook.timeout_seconds if hook.timeout_seconds > 0 else DEFAULT_HOOK_TIMEOUT_SECONDS


def _terminate(process: subprocess.Popen[bytes], hook: ResolvedHook) -> None:
    """Kill an overrunning hook process, tolerating a kill that itself fails.

    Kills the process the shell started.  A grandchild that detached from it may
    outlive the kill on some platforms; process-group signalling is deliberately
    not attempted, because it is POSIX-only and this runs on Windows too.
    """
    try:
        process.kill()
    except Exception:  # noqa: BLE001 - already-dead or unkillable, either way carry on
        _log.debug("Could not kill the hook process for %s.", hook.hook_id, exc_info=True)


def _excerpt(text: str) -> str:
    """A single-paragraph, length-capped snippet for a user-visible warning."""
    collapsed = " ".join(text.split())
    if len(collapsed) <= _WARNING_EXCERPT_LIMIT:
        return collapsed
    return collapsed[:_WARNING_EXCERPT_LIMIT] + "…"


@traces(SWR.SWR_1832)
def _combined_output(outcome: HookOutcome) -> str:
    """The hook's captured streams as the single ``output`` field on the wire.

    Both are already bounded by ``MAX_HOOK_OUTPUT_BYTES`` at capture time, and
    both are masked by the event's own validator.  They are joined rather than
    picked between because a hook's refusal reason is on stderr while its
    feedback is on stdout, and a consumer that only sees one of them is reading
    half the story.
    """
    parts = [part for part in (outcome.stdout.strip(), outcome.stderr.strip()) if part]
    return "\n".join(parts)


@traces(SWR.SWR_2815, SWR.SWR_1832)
def publish_skipped_hooks(
    session_id: str,
    hooks: Sequence[ResolvedHook],
    *,
    skip_reason: str = SKIP_REASON_UNTRUSTED_WORKSPACE,
) -> None:
    """Report hooks the trust gate held back, as ``hook.finish`` events.

    A hook refused by the SWR-2815 workspace trust gate never reaches a runner,
    so it produces no ``hook.start`` and no process.  It still has to be on the
    wire: a consumer comparing a run against the repository's configuration
    would otherwise see a configured hook simply never mentioned, which is
    indistinguishable from a hook that ran and did nothing.

    ``exit_code`` and ``duration_ms`` are left unset — there was no process —
    and ``skip_reason`` says why.  Never raises.
    """
    for hook in hooks:
        try:
            publish(
                session_id,
                HookFinishEvent(
                    session_id=session_id,
                    hook_id=hook.hook_id,
                    hook_name=hook.name,
                    lifecycle_point=hook.event,
                    scope=hook.source,
                    skipped=True,
                    skip_reason=skip_reason,
                ),
            )
        except Exception:  # noqa: BLE001 - the trust gate's verdict already stands.
            # ``hook_id``, never the hook itself: its ``command`` is an
            # unredacted shell one-liner, and the whole reason the event model
            # masks it is that it routinely carries a credential.
            _log.warning(
                "Could not publish hook.finish for skipped %s.",
                hook.hook_id,
                exc_info=True,
            )


@traces(SWR.SWR_2704)
class HookRunner:
    """Executes one session's hooks, bounded in time and in failure count.

    Construct one per session, register it under the session id
    (:mod:`rotaris_core.hooks.registry`) and call it from wherever the event
    happens.  A runner with no hooks is a cheap no-op: every ``run_*`` returns
    an empty tuple without touching the filesystem.
    """

    __slots__ = (
        "_announced",
        "_diagnostics",
        "_disabled",
        "_env",
        "_failures",
        "_hooks",
        "_lock",
        "_session_id",
        "_skipped",
        "_workspace",
    )

    def __init__(
        self,
        *,
        session_id: str,
        workspace: Path,
        hooks: Sequence[ResolvedHook] = (),
        diagnostics: SessionDiagnostics | None = None,
        env: Mapping[str, str] | None = None,
        skipped: Sequence[ResolvedHook] = (),
    ) -> None:
        self._session_id = session_id
        self._workspace = workspace
        self._hooks: tuple[ResolvedHook, ...] = tuple(hooks)
        self._diagnostics = diagnostics
        self._env: dict[str, str] = {str(key): str(value) for key, value in (env or {}).items()}
        self._lock = RLock()
        self._failures: dict[str, int] = {}
        self._disabled: set[str] = set()
        #: Hooks the SWR-2815 trust gate refused, so the caller only has to pass
        #: ``TrustedHookSet.blocked`` through for them to reach the wire
        #: (SWR-1832).
        self._skipped: tuple[ResolvedHook, ...] = tuple(skipped)
        #: Whether :meth:`announce_skipped_hooks` has already run.  The
        #: announcement is deliberately **not** made in this constructor: a run
        #: host builds its hook runner before it registers the session's event
        #: sink, and ``publish`` to a session without a sink is a silent no-op,
        #: so announcing here would drop every skipped hook on a real run.
        self._announced = not self._skipped

    @property
    def session_id(self) -> str:
        """The session these hooks belong to; also the registry key."""
        return self._session_id

    @property
    def workspace(self) -> Path:
        """Working directory every hook process is started in."""
        return self._workspace

    @property
    def skipped_hooks(self) -> tuple[ResolvedHook, ...]:
        """Hooks the workspace trust gate held back before this runner was built."""
        return self._skipped

    @traces(SWR.SWR_2815, SWR.SWR_1832)
    def announce_skipped_hooks(self) -> None:
        """Report the hooks the trust gate refused, once (SWR-1832).

        Idempotent and cheap after the first call, so every public entry point
        can call it: the run host builds this runner *before* it registers the
        session's event sink, and the bus drops a publish to a session with no
        sink, so this has to happen on first use rather than at construction.
        A host that would rather not wait for the first hook event can call it
        itself as soon as its sink is up.
        """
        with self._lock:
            if self._announced:
                return
            self._announced = True
            skipped = self._skipped
        publish_skipped_hooks(self._session_id, skipped)

    @property
    def disabled_hook_ids(self) -> frozenset[str]:
        """Hooks switched off for the rest of this session after repeated failures."""
        with self._lock:
            return frozenset(self._disabled)

    @traces(SWR.SWR_2702, SWR.SWR_2703)
    def has_hooks(self, event: str) -> bool:
        """Whether any still-enabled hook is attached to *event*.

        A cheap gate for callers that would otherwise assemble a payload for
        nothing on every single tool call.
        """
        self.announce_skipped_hooks()
        with self._lock:
            disabled = self._disabled
            return any(hook.event == event and hook.hook_id not in disabled for hook in self._hooks)

    @traces(SWR.SWR_2702)
    def run_pre_tool(
        self,
        *,
        tool_name: str,
        arguments: Mapping[str, Any],
        command: str = "",
    ) -> tuple[HookOutcome, ...]:
        """Run the ``pre_tool`` hooks matching this call, in declaration order.

        Exit ``0`` proceeds, exit ``2`` blocks with the hook's stderr as the
        refusal fed back to the agent, and any other exit code is a non-blocking
        warning (SWR-2702).  A timeout or a spawn failure also proceeds with a
        warning, unless the entry is ``required: true`` — the hook then never
        delivered a verdict, and a required hook without a verdict blocks
        (SWR-2704).
        """
        return self._run_tool_hooks(
            "pre_tool",
            tool_name=tool_name,
            arguments=arguments,
            command=command,
            result=None,
        )

    @traces(SWR.SWR_2702)
    def run_post_tool(
        self,
        *,
        tool_name: str,
        arguments: Mapping[str, Any],
        result: Any = None,
        command: str = "",
    ) -> tuple[HookOutcome, ...]:
        """Run the ``post_tool`` hooks matching this call.

        Exit ``2`` populates ``feedback`` for injection into the conversation
        but never blocks — the call already happened.
        """
        return self._run_tool_hooks(
            "post_tool",
            tool_name=tool_name,
            arguments=arguments,
            command=command,
            result=result,
        )

    @traces(SWR.SWR_2703)
    def run_lifecycle(self, event: str, **fields: Any) -> tuple[HookOutcome, ...]:
        """Run the hooks attached to a lifecycle *event*, informationally.

        *fields* become top-level keys of the JSON payload (a child report
        summary, a verifier verdict, …); a field named like one of the three
        fixed keys is dropped rather than allowed to raise out of a caller that
        forwarded a dict it did not build.  Matchers are ignored here: a matcher
        selects tool calls, and a lifecycle event has none.  Whatever the exit
        code and whatever ``required`` says, the returned outcomes always carry
        ``blocked=False`` — a lifecycle hook cannot stop the loop (SWR-2703).

        An event name outside :data:`LIFECYCLE_HOOK_EVENTS` is a no-op, so a
        caller can fire a new event before any hook point is declared for it.
        """
        self.announce_skipped_hooks()
        if event not in LIFECYCLE_HOOK_EVENTS:
            _log.debug("Ignoring hooks for unknown lifecycle event %r.", event)
            return ()
        applicable = self._enabled(hooks_for_event(self._hooks, event))
        if not applicable:
            return ()
        payload = build_lifecycle_payload(
            event=event,
            session_id=self._session_id,
            workspace=self._workspace,
            **{key: value for key, value in fields.items() if key not in RESERVED_LIFECYCLE_FIELDS},
        )
        return tuple(self._run_one(hook, payload, tool_name="") for hook in applicable)

    @staticmethod
    def blocking_outcome(outcomes: Sequence[HookOutcome]) -> HookOutcome | None:
        """The first outcome that blocks the call, or ``None`` if none does."""
        for outcome in outcomes:
            if outcome.blocked:
                return outcome
        return None

    # -- internals ---------------------------------------------------------

    def _enabled(self, hooks: Sequence[ResolvedHook]) -> tuple[ResolvedHook, ...]:
        """Drop the hooks this session has already disabled."""
        with self._lock:
            disabled = frozenset(self._disabled)
        return tuple(hook for hook in hooks if hook.hook_id not in disabled)

    def _run_tool_hooks(
        self,
        event: str,
        *,
        tool_name: str,
        arguments: Mapping[str, Any],
        command: str,
        result: Any,
    ) -> tuple[HookOutcome, ...]:
        self.announce_skipped_hooks()
        candidates = self._enabled(hooks_for_event(self._hooks, event))
        applicable = tuple(
            hook for hook in candidates if matches_tool(hook, tool_name=tool_name, command=command)
        )
        if not applicable:
            return ()
        payload = build_tool_payload(
            event=event,
            tool_name=tool_name,
            arguments=arguments,
            session_id=self._session_id,
            workspace=self._workspace,
            command=command,
            result=result,
        )
        return tuple(self._run_one(hook, payload, tool_name=tool_name) for hook in applicable)

    @traces(SWR.SWR_1832)
    def _publish_start(self, hook: ResolvedHook, *, tool_name: str) -> None:
        """Announce one hook before its process starts (SWR-1832).

        Published *before* execution rather than alongside the finish event: a
        hook is user shell code with its own timeout budget, so "this hook is
        running" is a state a consumer has to be able to see while it lasts.
        There is no durable record to write first — the timeline entry is the
        audit of a *completed* invocation, and this event describes one that has
        not happened yet.
        """
        publish(
            self._session_id,
            HookStartEvent(
                session_id=self._session_id,
                hook_id=hook.hook_id,
                hook_name=hook.name,
                lifecycle_point=hook.event,
                scope=hook.source,
                tool_name=tool_name,
                # ``str()`` first: a runner can be built from hand-made hooks,
                # and the redaction validator expects text.
                command=str(hook.command),
            ),
        )

    @traces(SWR.SWR_1832)
    def _publish_finish(self, hook: ResolvedHook, outcome: HookOutcome, *, tool_name: str) -> None:
        """Report one finished hook invocation, after its audit trail is written."""
        publish(
            self._session_id,
            HookFinishEvent(
                session_id=self._session_id,
                hook_id=outcome.hook_id,
                hook_name=outcome.name,
                lifecycle_point=outcome.event,
                scope=hook.source,
                tool_name=tool_name,
                # ``-1`` is this module's "no exit code of its own" sentinel; on
                # the wire that is ``None``, so a consumer never has to know it.
                exit_code=None if outcome.exit_code == _NO_EXIT_CODE else outcome.exit_code,
                duration_ms=float(outcome.duration_ms),
                blocked=outcome.blocked,
                timed_out=outcome.timed_out,
                skipped=False,
                skip_reason="",
                output=_combined_output(outcome),
            ),
        )

    def _run_one(
        self,
        hook: ResolvedHook,
        payload: Mapping[str, Any],
        *,
        tool_name: str,
    ) -> HookOutcome:
        # Wrapped: publishing is best-effort, running the hook is not.  ``publish``
        # already swallows a broken sink, so this only catches a model that
        # refuses to build.
        try:
            self._publish_start(hook, tool_name=tool_name)
        except Exception:  # noqa: BLE001 - a broken stream must not skip a hook.
            _log.warning("Could not publish hook.start for %s.", hook.hook_id, exc_info=True)
        execution = self._execute(hook, payload)
        blocked, feedback, warning, failed = self._resolve(hook, tool_name, execution)
        # Belt and braces: only a pre_tool hook can ever stop a call.
        blocked = blocked and hook.event == "pre_tool"
        if failed:
            notice = self._record_failure(hook)
            if notice:
                warning = f"{warning} {notice}".strip()
        outcome = HookOutcome(
            hook_id=hook.hook_id,
            name=hook.name,
            event=hook.event,
            exit_code=execution.exit_code,
            stdout=execution.stdout,
            stderr=execution.stderr,
            timed_out=execution.timed_out,
            blocked=blocked,
            feedback=feedback,
            warning=warning,
            duration_ms=execution.duration_ms,
        )
        # Durable audit entry first, wire event second: a broken stream can lose
        # an event, it can never lose the record that the hook ran (SWR-1832).
        self._audit(hook, outcome, tool_name=tool_name)
        try:
            self._publish_finish(hook, outcome, tool_name=tool_name)
        except Exception:  # noqa: BLE001 - see ``_run_one``'s start publication.
            _log.warning("Could not publish hook.finish for %s.", hook.hook_id, exc_info=True)
        return outcome

    def _process_env(self) -> dict[str, str]:
        """The hook's environment: the host's, plus this runner's overrides."""
        env = dict(os.environ)
        env.update(self._env)
        return env

    def _execute(self, hook: ResolvedHook, payload: Mapping[str, Any]) -> _Execution:
        """Run one hook process to completion, a timeout, or a spawn failure."""
        try:
            stdin_bytes = json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        except (TypeError, ValueError):  # pragma: no cover - payload is pre-sanitised
            stdin_bytes = b"{}"
        timeout = _timeout_for(hook)
        started = time.monotonic()

        def elapsed_ms() -> int:
            return int((time.monotonic() - started) * 1000)

        try:
            # shell=True on purpose: a hook is a user's shell one-liner, and the
            # payload is never interpolated into it — it goes in on stdin.
            process = subprocess.Popen(  # noqa: S602
                hook.command,
                shell=True,
                cwd=str(self._workspace),
                env=self._process_env(),
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
        except (OSError, ValueError) as exc:
            return _Execution(
                exit_code=_NO_EXIT_CODE,
                stdout="",
                stderr="",
                timed_out=False,
                crash_reason=str(exc) or type(exc).__name__,
                duration_ms=elapsed_ms(),
            )

        try:
            # communicate() writes stdin, closes it so a hook reading to EOF is
            # released, and drains both pipes concurrently so a chatty hook
            # cannot fill a pipe buffer and deadlock.
            raw_out, raw_err = process.communicate(input=stdin_bytes, timeout=timeout)
        except subprocess.TimeoutExpired:
            _terminate(process, hook)
            try:
                # Second communicate: kill() only signals — this one reaps the
                # process and collects whatever it managed to write.  Bounded,
                # so an unreapable child cannot turn the timeout path into a
                # second unbounded wait.
                raw_out, raw_err = process.communicate(timeout=_REAP_GRACE_SECONDS)
            except Exception:  # noqa: BLE001 - an unreapable child must not raise here
                raw_out, raw_err = b"", b""
            return _Execution(
                exit_code=_NO_EXIT_CODE,
                stdout=_bounded_text(raw_out or b""),
                stderr=_bounded_text(raw_err or b""),
                timed_out=True,
                crash_reason="",
                duration_ms=elapsed_ms(),
            )
        except Exception as exc:  # noqa: BLE001 - broken pipe, encoding, anything
            _terminate(process, hook)  # pragma: no cover - never leave a child running
            return _Execution(
                exit_code=_NO_EXIT_CODE,
                stdout="",
                stderr="",
                timed_out=False,
                crash_reason=str(exc) or type(exc).__name__,
                duration_ms=elapsed_ms(),
            )

        return _Execution(
            exit_code=_NO_EXIT_CODE if process.returncode is None else process.returncode,
            stdout=_bounded_text(raw_out or b""),
            stderr=_bounded_text(raw_err or b""),
            timed_out=False,
            crash_reason="",
            duration_ms=elapsed_ms(),
        )

    def _resolve(
        self,
        hook: ResolvedHook,
        tool_name: str,
        execution: _Execution,
    ) -> tuple[bool, str, str, bool]:
        """Map one execution onto ``(blocked, feedback, warning, failed)``.

        ``failed`` feeds the disable counter, so it is deliberately *not* set
        for a ``pre_tool`` exit 2 or a ``post_tool`` exit 2 — those are the hook
        working exactly as designed, and counting them would switch off a
        correctly blocking hook after three legitimate blocks (SWR-2704).
        """
        blocks_without_verdict = hook.event == "pre_tool" and hook.required

        if execution.crash_reason:
            warning = f"Hook '{hook.name}' ({hook.event}) could not run: {execution.crash_reason}"
            feedback = (
                self._refusal(hook, tool_name, "The hook could not be started.")
                if blocks_without_verdict
                else ""
            )
            return blocks_without_verdict, feedback, warning, True

        if execution.timed_out:
            budget = _timeout_for(hook)
            warning = (
                f"Hook '{hook.name}' ({hook.event}) timed out after {budget:g} s "
                "and was terminated."
            )
            feedback = (
                self._refusal(hook, tool_name, f"The hook timed out after {budget:g} s.")
                if blocks_without_verdict
                else ""
            )
            return blocks_without_verdict, feedback, warning, True

        code = execution.exit_code
        if code == 0:
            return False, "", "", False

        if code == _BLOCK_EXIT_CODE and hook.event == "pre_tool":
            reason = execution.stderr.strip() or "The hook gave no reason."
            return True, self._refusal(hook, tool_name, reason), "", False

        if code == _BLOCK_EXIT_CODE and hook.event == "post_tool":
            reported = execution.stderr.strip() or "(the hook wrote nothing to stderr)"
            call = f"the '{tool_name}' call" if tool_name else "the call"
            return False, f"Hook '{hook.name}' reported after {call}: {reported}", "", False

        detail = _excerpt(execution.stderr) or _excerpt(execution.stdout)
        warning = f"Hook '{hook.name}' ({hook.event}) exited {code}."
        if detail:
            warning = f"{warning} {detail}"
        return False, "", warning, True

    @staticmethod
    def _refusal(hook: ResolvedHook, tool_name: str, reason: str) -> str:
        """The refusal an agent sees, in the same shape as a policy ``deny``."""
        call = f"The '{tool_name}' call" if tool_name else "The call"
        return (
            f"Blocked by hook '{hook.name}'. {reason} {call} was not executed. "
            "Choose a different approach or ask the user to adjust the hook configuration."
        )

    def _record_failure(self, hook: ResolvedHook) -> str:
        """Count one failure; return the disable notice when it crosses the line.

        The notice is returned exactly once — on the invocation that disables
        the hook.  Later events simply skip the hook, silently, because a hook
        the user has already been told about should not warn on every call for
        the rest of the session.
        """
        with self._lock:
            count = self._failures.get(hook.hook_id, 0) + 1
            self._failures[hook.hook_id] = count
            if count < HOOK_FAILURE_DISABLE_THRESHOLD or hook.hook_id in self._disabled:
                return ""
            self._disabled.add(hook.hook_id)
        return (
            f"Hook '{hook.name}' failed {count} times and is disabled for the rest of this session."
        )

    def _audit(self, hook: ResolvedHook, outcome: HookOutcome, *, tool_name: str) -> None:
        """Record the invocation, and any failure, in the session evidence.

        Hooks bypass the permission policy, so this trail is the only record
        that they ran (SWR-2506).  A diagnostics directory that cannot be
        written degrades to a log line: evidence is best-effort, the run is not.
        """
        diagnostics = self._diagnostics
        if diagnostics is None:
            return
        metadata: dict[str, Any] = {
            "hook_id": outcome.hook_id,
            "hook_name": outcome.name,
            "event": outcome.event,
            "source": hook.source,
            "exit_code": outcome.exit_code,
            "duration_ms": outcome.duration_ms,
            "timed_out": outcome.timed_out,
            "blocked": outcome.blocked,
        }
        if tool_name:
            metadata["tool_name"] = tool_name
        # Captured output is already bounded by MAX_HOOK_OUTPUT_BYTES (SWR-2704);
        # empty streams are simply left out rather than written as empty keys.
        if outcome.stdout:
            metadata["stdout"] = outcome.stdout
        if outcome.stderr:
            metadata["stderr"] = outcome.stderr
        try:
            diagnostics.timeline(
                _TIMELINE_EVENT,
                severity="warning" if outcome.warning else "info",
                actor=outcome.name,
                message=(
                    f"Hook '{outcome.name}' ({outcome.event}) exited {outcome.exit_code} "
                    f"in {outcome.duration_ms} ms"
                ),
                metadata=metadata,
            )
            if outcome.warning:
                diagnostics.issue(
                    kind="hook_failure",
                    severity="warning",
                    actor=outcome.name,
                    message=outcome.warning,
                    metadata=metadata,
                )
        except Exception:  # noqa: BLE001 - evidence is best-effort, the run is not
            _log.warning(
                "Could not record hook %s in the session diagnostics.",
                outcome.hook_id,
                exc_info=True,
            )


@traces(SWR.SWR_2704)
def disabled_hooks_notice(runner: object) -> str:
    """Warning for hooks a run switched off after repeated failures, or ``""``.

    Reports the count only. A hook's *name* is written by whoever wrote the
    config it came from, and an advisory is not a place to render text the user
    has not opened on purpose.
    """
    try:
        disabled = runner.disabled_hook_ids  # type: ignore[attr-defined]
    except Exception:  # noqa: BLE001 - a warning must not become the failure.
        return ""
    count = len(disabled)
    if not count:
        return ""
    noun = "hook" if count == 1 else "hooks"
    return (
        f"{count} {noun} failed repeatedly and {'was' if count == 1 else 'were'} "
        f"switched off for the rest of this session. See the session's "
        f"diagnostics for the command output."
    )
