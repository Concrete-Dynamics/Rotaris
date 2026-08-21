"""Interactive approval flow for ``ask`` decisions (SWR-2504).

An ``ask`` from the policy engine (SWR-2501) suspends exactly one tool call
until a human resolves it.  The blocking handshake copies the proven
``UserPromptBarrier`` shape (SWR-2423) used by ``ask_questions``: a
:class:`threading.Event` per request, waited on by the synchronous dispatch
thread and resolved from the host's UI thread.  Sibling agents are unaffected
because each child conversation runs on its own thread.

Hosts bind late.  The engine is built per agent in three spawn paths (root and
nested in ``ralph/loop.py``, children in ``orchestrator/scheduler.py``), some of
them before a host has finished wiring its callbacks, so the approval host is
looked up **at resolve time** from a session-keyed registry rather than threaded
through ``runtime_kwargs``.  A host that never registers — the TUI, headless
CLI — leaves every ``ask`` on the fail-safe path: deny, never a silent allow and
never an unbounded hang.
"""

from __future__ import annotations

import logging
import re
import threading
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from enum import StrEnum
from threading import RLock
from typing import Any

from rotaris_core.core.waiting import wait_budget
from rotaris_core.permissions.engine import (
    Decision,
    DecisionSource,
    PermissionDecision,
    PermissionRequest,
)
from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

#: Headless resolution of an ``ask`` when no interactive host is registered.
HEADLESS_DENY = "deny"
HEADLESS_ABORT = "abort"
DEFAULT_HEADLESS_POLICY = HEADLESS_DENY

#: Matches the SDK-side ``ask_questions`` wait (SWR-2423) so a user facing both
#: prompts sees one consistent patience budget.
DEFAULT_APPROVAL_TIMEOUT = 300.0

_MASK = "***"
_SECRET_NAME = r"(?:api[_-]?keys?|keys?|tokens?|secrets?|passwords?|passwd|credentials?|auth)"

#: ``_`` is a word character, so a bare ``\bTOKEN\b`` never matches inside
#: ``GITHUB_TOKEN`` — and a screaming-snake-case environment variable is the
#: single most common way a credential appears in a shell command.  These two
#: fragments let an ``_``-joined prefix and suffix ride along, so
#: ``GITHUB_TOKEN``, ``ANTHROPIC_API_KEY``, ``AWS_SECRET_ACCESS_KEY`` and
#: ``MY_PASSWORD`` all match while ``sky_blue`` and ``--skip-tests`` do not
#: (the joiner is ``_`` only, and a secret word must still be a whole segment).
_NAME_PREFIX = r"(?:[A-Za-z0-9]+_)*"
_NAME_SUFFIX = r"(?:_[A-Za-z0-9]+)*"
_SECRET_KEY_NAME = rf"{_NAME_PREFIX}{_SECRET_NAME}{_NAME_SUFFIX}"

_ASSIGNMENT_RE = re.compile(rf"((?:--|-)?\b{_SECRET_KEY_NAME}\b\s*[=:]\s*)(\S+)", re.IGNORECASE)
_FLAG_VALUE_RE = re.compile(rf"(--{_SECRET_KEY_NAME}\s+)(\S+)", re.IGNORECASE)
_SCHEME_RE = re.compile(r"\b(Bearer|Basic|token)\s+(\S+)", re.IGNORECASE)
_SECRET_KEY_RE = re.compile(_SECRET_NAME, re.IGNORECASE)

#: Value shapes that are credentials wherever they appear, regardless of the key
#: they hang off.  Mirrors ``config.project_snapshot._SECRET_VALUE_PREFIXES``.
_SECRET_VALUE_PREFIXES = ("ghp_", "ghs_", "ghu_", "gho_", "sk-", "sk_", "iv1.", "eyj")

#: Matches a secret-shaped run *anywhere* in the text, for the case where the
#: surrounding key does not look secret at all.  The lookbehind stops ``sk-``
#: from firing inside ordinary words such as ``task-force``.
_SECRET_VALUE_RE = re.compile(
    "(?<![A-Za-z0-9])(?:" + "|".join(re.escape(p) for p in _SECRET_VALUE_PREFIXES) + r")\S*",
    re.IGNORECASE,
)

#: Longest argument value rendered into an approval payload.  The user needs
#: enough to judge the call, not the whole file body of a write.
_ARGUMENT_PREVIEW_LIMIT = 240


@traces(SWR.SWR_2504, SWR.SWR_1829)
def redact_secrets(text: str) -> str:
    """Mask credential-looking values in *text* before it reaches a UI or a log.

    Deliberately conservative: it masks the value, never the surrounding
    command, so an approver still sees exactly which program runs with which
    flags.

    Four layers, in order: ``key=value`` / ``key: value`` assignments,
    ``--flag value`` pairs, ``Bearer``/``Basic``/``token`` schemes, and finally
    a value-shape sweep for tokens whose key gives nothing away.  The single
    implementation behind both the approval dialog (SWR-2504) and the event
    stream (SWR-1829) — ``events.schema.redact_text`` delegates here — so the
    two can no longer drift.

    Idempotent: the mask itself matches none of the four layers, so re-running
    it over already-redacted text is a no-op.
    """
    if not text:
        return text
    masked = _ASSIGNMENT_RE.sub(rf"\g<1>{_MASK}", text)
    masked = _FLAG_VALUE_RE.sub(rf"\g<1>{_MASK}", masked)
    masked = _SCHEME_RE.sub(rf"\g<1> {_MASK}", masked)
    return _SECRET_VALUE_RE.sub(_MASK, masked)


class ApprovalOption(StrEnum):
    """What the human chose for one pending request."""

    APPROVE_ONCE = "approve_once"
    APPROVE_SESSION = "approve_session"
    DENY = "deny"


class ApprovalWaitStatus(StrEnum):
    """Terminal state of one approval wait."""

    RESOLVED = "resolved"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


@dataclass(frozen=True, slots=True)
class ApprovalResponse:
    """Result handed back to the blocked dispatch thread."""

    status: ApprovalWaitStatus
    option: ApprovalOption | None = None


@traces(SWR.SWR_2504)
@dataclass(frozen=True, slots=True)
class ApprovalRequestPayload:
    """One approval request, in the shape a host renders and persists."""

    request_id: str
    session_id: str
    agent_id: str
    persona: str
    tool_name: str
    command: str
    argument_summary: str
    rule_id: str
    reason: str

    @classmethod
    def from_request(
        cls,
        *,
        request_id: str,
        session_id: str,
        agent_id: str,
        request: PermissionRequest,
        pending: PermissionDecision,
    ) -> ApprovalRequestPayload:
        """Build a redacted payload from the engine's request and pending decision."""
        return cls(
            request_id=request_id,
            session_id=session_id,
            agent_id=agent_id or request.persona,
            persona=request.persona,
            tool_name=request.tool_name,
            command=redact_secrets(request.command or ""),
            argument_summary=argument_summary(request),
            rule_id=pending.rule_id,
            reason=pending.reason,
        )

    def to_payload(self) -> dict[str, str]:
        """JSON-safe dict for the session snapshot and the host's UI state."""
        return {
            "request_id": self.request_id,
            "session_id": self.session_id,
            "agent_id": self.agent_id,
            "persona": self.persona,
            "tool_name": self.tool_name,
            "command": self.command,
            "argument_summary": self.argument_summary,
            "rule_id": self.rule_id,
            "reason": self.reason,
        }


@traces(SWR.SWR_2504, SWR.SWR_2506)
def argument_summary(request: PermissionRequest) -> str:
    """Render the call's arguments for a human, secrets masked, values clipped.

    Shared by the approval prompt (SWR-2504) and the audit log (SWR-2506) so a
    recorded call summary is redacted exactly like the one a user was shown.
    """
    if request.command:
        # The command line is the decisive axis for terminal-class tools and is
        # already carried verbatim; repeating it as an argument adds noise.
        return ""
    parts: list[str] = []
    for key in sorted(str(name) for name in request.arguments):
        raw = request.arguments[key]
        if _SECRET_KEY_RE.search(key):
            parts.append(f"{key}={_MASK}")
            continue
        rendered = redact_secrets(str(raw))
        if len(rendered) > _ARGUMENT_PREVIEW_LIMIT:
            rendered = f"{rendered[:_ARGUMENT_PREVIEW_LIMIT]}…"
        parts.append(f"{key}={rendered}")
    return "\n".join(parts)


@traces(SWR.SWR_1832)
def _request_summary(request: PermissionRequest) -> str:
    """One redacted line describing what is being approved.

    Composed exactly as ``permissions.audit.SessionAuditLog.record`` composes
    the summary it writes for the resolved decision, so the ``approval.requested``
    event and the ``permission.decision`` that answers it describe the same call
    in the same words.
    """
    command = redact_secrets(request.command or "")
    return f"{request.tool_name}: {command}" if command else argument_summary(request)


@dataclass(slots=True)
class _PendingApproval:
    request_id: str
    event: threading.Event
    response: ApprovalResponse | None = None


# --------------------------------------------------------------------------
# Pairing a raised approval with the decision that resolves it (SWR-1832).
# --------------------------------------------------------------------------

#: Decision sources that can only be produced by resolving an ``ask``.  A
#: decision from any other source never went near a human, so it must never
#: claim a request id — that is what tells a consumer "resolved without a human"
#: apart from "this is the answer to request X".
#:
#: ``FAIL_CLOSED`` is in the set even though the engine, not this module, stamps
#: it: ``PermissionEngine._resolve_ask`` uses it when the resolver raises or
#: hands back another ``ask``, and that deny *is* the resolution of a request
#: this module already announced.  Leaving it out would strand that request as
#: pending forever on the wire, which is the exact failure the pairing exists to
#: prevent.
_APPROVAL_DECISION_SOURCES: frozenset[str] = frozenset(
    {
        DecisionSource.USER_ONCE.value,
        DecisionSource.USER_SESSION.value,
        DecisionSource.USER_DENY.value,
        DecisionSource.HEADLESS_POLICY.value,
        DecisionSource.TIMEOUT.value,
        DecisionSource.CANCELLED.value,
        DecisionSource.PRESENTER_ERROR.value,
        DecisionSource.FAIL_CLOSED.value,
    },
)


@dataclass(frozen=True, slots=True)
class _RaisedApproval:
    """The ``approval.requested`` event awaiting its ``permission.decision``."""

    request_id: str
    session_id: str
    tool_name: str


#: Thread-local because that is exactly the scope of the hand-off:
#: ``PermissionEngine.resolve`` calls the approval resolver and then hands the
#: resulting decision to the audit sink in **one synchronous call stack on one
#: thread**, and each agent's dispatch runs on its own thread.  A module-level
#: dict keyed by session would instead pair one agent's approval with a sibling
#: agent's decision.
_raised_approval = threading.local()


@traces(SWR.SWR_2504, SWR.SWR_1832)
def note_approval_request(*, request_id: str, session_id: str, tool_name: str) -> None:
    """Record that this thread just raised *request_id*, for the decision to claim."""
    _raised_approval.value = _RaisedApproval(
        request_id=request_id,
        session_id=session_id,
        tool_name=tool_name,
    )


@traces(SWR.SWR_1832)
def take_approval_request_id(*, session_id: str, tool_name: str, source: str) -> str:
    """Claim the id of the approval this thread raised for this very call.

    Consumes the slot whichever way it goes, so a mismatch cannot leave an id
    behind for the *next* decision to pick up.  The slot can still go stale
    when a decision is never recorded at all — ``SessionAuditLog.record``
    returns early for a session with no registered directory — which is why the
    match is checked on three axes rather than trusted:

    * *source* must be one only an ``ask`` resolution produces, so a rule-based
      allow never claims anything;
    * *session_id* and *tool_name* must be the ones the request was raised for.

    A stale id therefore needs a later decision for the same session and tool
    that carries an approval source but was resolved by something that does not
    announce (the engine's built-in ``FailSafeApprovalResolver``).  In that
    window the pairing is the only thing at risk; the decision itself is
    unaffected.

    Returns ``""`` whenever any of that does not line up.
    """
    raised: _RaisedApproval | None = getattr(_raised_approval, "value", None)
    _raised_approval.value = None
    if raised is None or source not in _APPROVAL_DECISION_SOURCES:
        return ""
    if raised.session_id != session_id or raised.tool_name != tool_name:
        return ""
    return raised.request_id


@traces(SWR.SWR_1832)
def clear_approval_request() -> None:
    """Drop this thread's unclaimed request (test isolation)."""
    _raised_approval.value = None


@traces(SWR.SWR_2504)
class ApprovalBarrier:
    """Thread-safe pending approvals keyed by request id.

    Keyed by request rather than by conversation (the ``UserPromptBarrier``
    choice) because several agents may wait at the same time and each of them
    must resolve independently.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._pending: dict[str, _PendingApproval] = {}

    def create(self, request_id: str) -> None:
        """Register one pending approval."""
        if not request_id:
            raise ValueError("An approval request needs a non-empty id.")
        with self._lock:
            if request_id in self._pending:
                raise RuntimeError(f"Approval {request_id!r} is already pending.")
            self._pending[request_id] = _PendingApproval(request_id, threading.Event())

    def pending_ids(self) -> tuple[str, ...]:
        """Ids currently waiting on a human, oldest first."""
        with self._lock:
            return tuple(self._pending)

    def wait_for_response(self, request_id: str, timeout: float) -> ApprovalResponse:
        """Block until *request_id* resolves, is cancelled, or times out.

        A *timeout* of zero waits without a limit (SWR-3623) — the default for a
        run released from the board, whose whole promise is that the user
        answers in their own time. :func:`~rotaris_core.core.waiting.wait_budget`
        owns that reading so this barrier and the question barrier cannot
        disagree about it.
        """
        with self._lock:
            pending = self._pending.get(request_id)
        if pending is None:
            return ApprovalResponse(ApprovalWaitStatus.CANCELLED)

        if not pending.event.wait(timeout=wait_budget(timeout)):
            with self._lock:
                if self._pending.get(request_id) is pending:
                    self._pending.pop(request_id, None)
            return ApprovalResponse(ApprovalWaitStatus.TIMED_OUT)

        with self._lock:
            if self._pending.get(request_id) is pending:
                self._pending.pop(request_id, None)
        return pending.response or ApprovalResponse(ApprovalWaitStatus.CANCELLED)

    def resolve(self, request_id: str, option: ApprovalOption) -> bool:
        """Resolve one pending approval with the user's choice."""
        return self._finish(request_id, ApprovalResponse(ApprovalWaitStatus.RESOLVED, option))

    def cancel(self, request_id: str) -> bool:
        """Cancel one pending approval; its dispatch resolves fail-safe to deny."""
        return self._finish(request_id, ApprovalResponse(ApprovalWaitStatus.CANCELLED))

    def discard(self, request_id: str) -> None:
        """Drop a request nobody will wait on (the UI never got to show it)."""
        with self._lock:
            pending = self._pending.pop(request_id, None)
        if pending is not None:
            pending.response = ApprovalResponse(ApprovalWaitStatus.CANCELLED)
            pending.event.set()

    def cancel_all(self) -> None:
        """Release every waiter during run cancellation or shutdown."""
        with self._lock:
            pending_approvals = list(self._pending.values())
            self._pending.clear()
        for pending in pending_approvals:
            pending.response = ApprovalResponse(ApprovalWaitStatus.CANCELLED)
            pending.event.set()

    def _finish(self, request_id: str, response: ApprovalResponse) -> bool:
        with self._lock:
            pending = self._pending.get(request_id)
            if pending is None:
                return False
            pending.response = response
            pending.event.set()
            return True


#: Called on the waiting agent's thread with a JSON-safe payload; the host must
#: hand it to its UI thread and return immediately.
type ApprovalPresenter = Callable[[dict[str, Any]], None]


@traces(SWR.SWR_2504)
@dataclass(slots=True)
class ApprovalHost:
    """One session's approval capabilities.

    ``present is None`` means the host registered for lifecycle reasons (abort
    hook, barrier release on cancel) but cannot ask a human — those sessions
    take the headless path.
    """

    barrier: ApprovalBarrier = field(default_factory=ApprovalBarrier)
    present: ApprovalPresenter | None = None
    dismiss: Callable[[str], None] | None = None
    on_abort: Callable[[], None] | None = None

    @property
    def interactive(self) -> bool:
        return self.present is not None


_hosts_lock = RLock()
_hosts: dict[str, ApprovalHost] = {}


@traces(SWR.SWR_2504)
def register_approval_host(session_id: str, host: ApprovalHost) -> ApprovalHost:
    """Publish one session's approval host; replaces any previous registration."""
    if not session_id:
        raise ValueError("An approval host needs a non-empty session id.")
    with _hosts_lock:
        _hosts[session_id] = host
    return host


@traces(SWR.SWR_2504)
def resolve_approval_host(session_id: str | None) -> ApprovalHost | None:
    """Return the host registered for *session_id*, or ``None``.

    Never falls back to another session's host: approving in one window must
    not authorise a tool call in another.
    """
    if not session_id:
        return None
    with _hosts_lock:
        return _hosts.get(session_id)


@traces(SWR.SWR_2504)
def ensure_approval_host(session_id: str) -> ApprovalHost:
    """Return the session's host, registering a non-interactive one if absent.

    Lets a non-UI layer (the headless runner) attach an abort hook without
    clobbering an interactive host a desktop front-end registered first.
    """
    with _hosts_lock:
        host = _hosts.get(session_id)
        if host is None:
            host = ApprovalHost()
            _hosts[session_id] = host
        return host


@traces(SWR.SWR_2504)
def discard_approval_host(session_id: str | None) -> None:
    """Drop a session's host once its run is over, releasing any waiter."""
    if not session_id:
        return
    with _hosts_lock:
        host = _hosts.pop(session_id, None)
    if host is not None:
        host.barrier.cancel_all()


@traces(SWR.SWR_2504)
def reset_approval_registry() -> None:
    """Clear every registration (test isolation and full-process shutdown)."""
    with _hosts_lock:
        hosts = list(_hosts.values())
        _hosts.clear()
    for host in hosts:
        host.barrier.cancel_all()


@traces(SWR.SWR_2504)
class BrokeredApprovalResolver:
    """Turns an ``ask`` into a terminal decision via the session's host.

    Implements the engine's ``ApprovalResolver`` protocol.  Every failure mode —
    no host, a presenter that raises, a cancelled prompt, a timeout — ends in
    ``deny``; there is no path from an error to an allow.

    ``agent_id`` is the identity binding: the canonical name of the agent whose
    engine this resolver serves.  The ``ApprovalResolver`` protocol passes only
    the request, so the resolver cannot ask the engine whom it gates — the
    caller must hand both the same value, which ``agents.factory`` does.  A
    resolver built without it still works; it then reports no agent name on
    ``approval.requested``.

    The two surfaces differ deliberately when it is absent.  The approval
    dialog falls back to the persona (:meth:`ApprovalRequestPayload.from_request`)
    because a human reading a prompt is better served by an approximate label
    than by a blank one, and the prompt names the persona beside it anyway.  The
    event does not, because a supervisor *routes* on ``agent_name`` and would
    join a persona name against child names.
    """

    def __init__(
        self,
        *,
        session_id: str,
        agent_id: str = "",
        headless_policy: str = DEFAULT_HEADLESS_POLICY,
        timeout: float = DEFAULT_APPROVAL_TIMEOUT,
    ) -> None:
        self._session_id = session_id
        self._agent_id = agent_id
        self._headless_policy = headless_policy
        self._timeout = timeout

    def resolve(
        self,
        request: PermissionRequest,
        pending: PermissionDecision,
    ) -> PermissionDecision:
        host = resolve_approval_host(self._session_id)
        if host is None or not host.interactive:
            return self._headless_decision(request, pending, host)
        return self._ask_host(host, request, pending)

    @traces(SWR.SWR_1832)
    def _raise(
        self,
        request: PermissionRequest,
        pending: PermissionDecision,
        *,
        request_id: str,
        resolver: str,
        timeout_seconds: float | None,
        unattended_reason: str,
    ) -> None:
        """Announce one pending approval on the session's event bus.

        This is the event that lets a consumer tell "still working" from
        "stalled at a prompt nobody will answer", so it is published *before*
        the wait begins — including on the unattended path, where the wait is
        zero but the run is still being shaped by a decision no human made.

        It also names *who* is blocked, from the two sources the approval dialog
        renders: this resolver's ``agent_id`` binding — for a delegated child,
        the canonical name the factory pins to the very string ``child.spawn``
        announces — and the persona the engine matched the request against.
        Both are already in hand; neither costs a lookup that could fail, which
        is what keeps the guard below a guard against the event bus and not
        against an identity lookup.

        Unlike the dialog payload, ``agent_id`` is *not* backfilled from the
        persona when it is empty.  A resolver with no binding genuinely does not
        know which agent it gates, the persona travels in its own field anyway,
        and a supervisor routes on the name — so a stand-in there would send it
        to the wrong work.

        Nothing here can fail the dispatch it is describing: an approval that
        cannot be announced is still an approval.
        """
        try:
            # Imported here, not at module scope: ``events.schema`` imports this
            # module for its redaction ladder, so importing the package eagerly
            # would close the cycle.
            from rotaris_core.events import ApprovalRequestedEvent, publish

            note_approval_request(
                request_id=request_id,
                session_id=self._session_id,
                tool_name=request.tool_name,
            )
            publish(
                self._session_id,
                ApprovalRequestedEvent(
                    session_id=self._session_id,
                    request_id=request_id,
                    agent_name=self._agent_id,
                    persona=request.persona,
                    tool_name=request.tool_name,
                    rule_id=pending.rule_id,
                    # Already redacted; the model validator masks it again
                    # because a future caller may not be as careful.
                    summary=_request_summary(request),
                    resolver=resolver,
                    timeout_seconds=timeout_seconds,
                    unattended_reason=unattended_reason,
                ),
            )
        except Exception:  # noqa: BLE001 - a broken stream must not fail dispatch.
            _log.warning(
                "Could not announce the approval request for %s.",
                request.redacted_summary(),
                exc_info=True,
            )

    def _ask_host(
        self,
        host: ApprovalHost,
        request: PermissionRequest,
        pending: PermissionDecision,
    ) -> PermissionDecision:
        presenter = host.present
        if presenter is None:  # pragma: no cover - guarded by the caller
            return self._headless_decision(request, pending, host)

        request_id = uuid.uuid4().hex
        host.barrier.create(request_id)
        payload = ApprovalRequestPayload.from_request(
            request_id=request_id,
            session_id=self._session_id,
            agent_id=self._agent_id,
            request=request,
            pending=pending,
        ).to_payload()
        self._raise(
            request,
            pending,
            request_id=request_id,
            resolver="brokered",
            timeout_seconds=self._timeout,
            unattended_reason="",
        )

        try:
            presenter(payload)
        except Exception as exc:  # noqa: BLE001 - fail-closed by design
            host.barrier.discard(request_id)
            _log.warning(
                "Approval request for %s could not be shown; denying: %s",
                request.redacted_summary(),
                exc,
            )
            return _denied(
                pending,
                "the approval request could not be shown",
                DecisionSource.PRESENTER_ERROR,
            )

        try:
            response = host.barrier.wait_for_response(request_id, self._timeout)
        finally:
            self._dismiss(host, request_id)
        return self._from_response(request, pending, response)

    @staticmethod
    def _dismiss(host: ApprovalHost, request_id: str) -> None:
        dismiss = host.dismiss
        if dismiss is None:
            return
        try:
            dismiss(request_id)
        except Exception as exc:  # noqa: BLE001 - a stale UI row must not break dispatch
            _log.warning("Approval host failed to dismiss %s: %s", request_id, exc)

    def _from_response(
        self,
        request: PermissionRequest,
        pending: PermissionDecision,
        response: ApprovalResponse,
    ) -> PermissionDecision:
        if response.status is ApprovalWaitStatus.TIMED_OUT:
            return _denied(
                pending,
                f"no answer arrived within {self._timeout:.0f} seconds",
                DecisionSource.TIMEOUT,
            )
        if response.status is ApprovalWaitStatus.CANCELLED:
            return _denied(
                pending,
                "the approval request was cancelled",
                DecisionSource.CANCELLED,
            )
        if response.option is ApprovalOption.APPROVE_ONCE:
            return PermissionDecision(
                decision=Decision.ALLOW,
                rule_id="approval:once",
                reason=(
                    f"The user approved '{request.tool_name}' once "
                    f"(rule '{pending.rule_id}' asked)."
                ),
                source=DecisionSource.USER_ONCE,
            )
        if response.option is ApprovalOption.APPROVE_SESSION:
            return PermissionDecision(
                decision=Decision.ALLOW,
                rule_id="approval:session",
                reason=(
                    f"The user approved '{request.tool_name}' for this session "
                    f"(rule '{pending.rule_id}' asked)."
                ),
                session_scoped=True,
                source=DecisionSource.USER_SESSION,
            )
        return _denied(pending, "the user denied the request", DecisionSource.USER_DENY)

    @traces(SWR.SWR_1832)
    def _headless_decision(
        self,
        request: PermissionRequest,
        pending: PermissionDecision,
        host: ApprovalHost | None,
    ) -> PermissionDecision:
        """Resolve an ``ask`` that can never reach a human.

        Still announced as an ``approval.requested`` (SWR-1832), carrying
        ``unattended_reason``: a consumer watching a run needs to see that a
        call was gated and answered by policy rather than silently denied, and
        the id is what pairs the announcement with the deny that follows it.
        """
        self._raise(
            request,
            pending,
            request_id=uuid.uuid4().hex,
            resolver="headless",
            # There is no wait at all on this path, which is exactly what
            # ``None`` means on the event.
            timeout_seconds=None,
            unattended_reason=DecisionSource.HEADLESS_POLICY.value,
        )
        if self._headless_policy == HEADLESS_ABORT:
            self._abort(host)
            return _denied(
                pending,
                "no approval UI is available in this host and the headless "
                "approval policy aborts the run",
                DecisionSource.HEADLESS_POLICY,
            )
        return _denied(
            pending,
            "no approval UI is available in this host",
            DecisionSource.HEADLESS_POLICY,
        )

    @staticmethod
    def _abort(host: ApprovalHost | None) -> None:
        on_abort = host.on_abort if host is not None else None
        if on_abort is None:
            _log.warning(
                "Headless approval policy is 'abort' but no abort hook is registered; "
                "the request was denied instead.",
            )
            return
        try:
            on_abort()
        except Exception as exc:  # noqa: BLE001 - the deny still stands
            _log.warning("Run abort after an unanswerable approval failed: %s", exc)


def _denied(
    pending: PermissionDecision,
    detail: str,
    source: DecisionSource,
) -> PermissionDecision:
    return PermissionDecision(
        decision=Decision.DENY,
        rule_id=pending.rule_id,
        reason=f"{pending.reason} Denied because {detail}.",
        source=source,
    )
