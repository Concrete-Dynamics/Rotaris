"""Central allow/ask/deny permission policy engine for tool dispatch (SWR-2501).

Every tool call — built-in, custom plugin, or MCP — is resolved here to exactly
one decision before it reaches its executor.  The engine is deliberately free of
I/O and of host knowledge: rule sources (SWR-2502 command patterns, SWR-2503
config presets), the interactive approval UI (SWR-2504) and the audit log
(SWR-2506) plug in through the seams defined below.

Fail-closed is a construction property, not a convention: there is no code path
from an error to :attr:`Decision.ALLOW`.
"""

from __future__ import annotations

import logging
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from threading import RLock
from typing import TYPE_CHECKING, Any, Literal, Protocol

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.core.path_auth import PathAuth

_log = logging.getLogger(__name__)

#: Tool names that are never gated.  Denying the loop's own terminator would
#: deadlock the run, which is why the SDK exempts them from confirmation too
#: (``Agent._requires_user_confirmation``).
_ALWAYS_ALLOWED_TOOLS = frozenset({"finish", "finishtool", "think", "thinktool"})

#: Action argument keys inspected when a rule declares a ``path_scope``.
_PATH_ARGUMENT_KEYS = frozenset(
    {"path", "file_path", "filename", "paths", "base_path", "dir", "directory"},
)

#: Pluggable command-line matcher.  Left unpopulated by SWR-2501; SWR-2502
#: supplies the pattern-matching implementations that fill this slot.
type CommandMatcher = Callable[[str], bool]

#: Where a rule applies relative to the workspace root.  ``None`` means the
#: rule does not care about paths at all.
type PathScope = Literal["inside_workspace", "outside_workspace"]


class Decision(StrEnum):
    """The three outcomes a policy resolution can produce."""

    ALLOW = "allow"
    ASK = "ask"
    DENY = "deny"


@traces(SWR.SWR_2506)
class DecisionSource(StrEnum):
    """What produced a decision — the audit log's ``resolution source`` (SWR-2506).

    Kept separate from ``rule_id`` because several distinct resolutions share one
    id: a user deny, a headless deny and an approval timeout all carry the rule
    id of the ``ask`` that triggered them.
    """

    #: A policy rule from the active preset matched.
    RULE = "rule"
    #: A rule the user created by approving a call for the session (SWR-2504).
    SESSION_RULE = "session-rule"
    #: No rule matched; the preset's default applied (SWR-2503).
    PRESET = "preset"
    #: A loop-control tool that is never gated.
    BUILTIN = "builtin"
    #: The policy could not be resolved and the engine failed closed.
    FAIL_CLOSED = "fail-closed"
    #: The user approved this one call.
    USER_ONCE = "user-once"
    #: The user approved the call for the rest of the session.
    USER_SESSION = "user-session"
    #: The user denied the call.
    USER_DENY = "user-deny"
    #: No approval UI was available; ``runtime.headless_approval_policy`` decided.
    HEADLESS_POLICY = "headless-policy"
    #: Nobody answered within ``runtime.approval_timeout_seconds``.
    TIMEOUT = "timeout"
    #: The prompt was cancelled (run shutdown, host teardown).
    CANCELLED = "cancelled"
    #: The host could not show the prompt at all.
    PRESENTER_ERROR = "presenter-error"


class MalformedPolicyError(ValueError):
    """Raised when a policy cannot be interpreted; always resolves fail-closed."""


@traces(SWR.SWR_2501)
@dataclass(frozen=True)
class PermissionRequest:
    """One tool dispatch, described in policy terms."""

    tool_name: str
    persona: str
    arguments: Mapping[str, Any] = field(default_factory=dict)
    #: Full command line for terminal-class tools; the axis SWR-2502 matches on.
    command: str | None = None

    def redacted_summary(self) -> str:
        """Short, log-safe description of the call (no argument values)."""
        if self.command:
            return f"{self.tool_name}: {self.command}"
        keys = ", ".join(sorted(str(key) for key in self.arguments))
        return f"{self.tool_name}({keys})"


@traces(SWR.SWR_2501)
@dataclass(frozen=True)
class PermissionDecision:
    """A resolved decision together with the rule that produced it."""

    decision: Decision
    rule_id: str
    reason: str
    #: Set by an approval resolver when the user approved the call for the rest
    #: of the session (SWR-2504); the engine turns it into a session rule.
    session_scoped: bool = False
    #: What produced this decision; the audit log's resolution source (SWR-2506).
    source: DecisionSource = DecisionSource.PRESET

    @property
    def allowed(self) -> bool:
        return self.decision is Decision.ALLOW


@traces(SWR.SWR_2501)
@dataclass(frozen=True)
class PermissionRule:
    """One ordered policy rule.

    A rule matches when *every* populated facet matches.  ``None`` facets are
    wildcards, so a rule with no facets at all matches every request.
    """

    rule_id: str
    decision: Decision
    tools: frozenset[str] | None = None
    personas: frozenset[str] | None = None
    path_scope: PathScope | None = None
    matcher: CommandMatcher | None = None
    #: Exact ``(name, rendered value)`` pairs every matching request must carry.
    #: Lets a session-scoped approval (SWR-2504) pin one concrete call of a tool
    #: that has no command line, instead of the whole tool.
    arguments: tuple[tuple[str, str], ...] | None = None
    description: str = ""

    def matches(self, request: PermissionRequest, workspace_root: Path) -> bool:
        """Whether this rule applies to *request*.

        May raise; the engine treats any exception here as fail-closed input.
        """
        if self.tools is not None and request.tool_name.lower() not in self.tools:
            return False
        if self.personas is not None and request.persona not in self.personas:
            return False
        if self.matcher is not None and not self.matcher(request.command or ""):
            return False
        if self.arguments is not None and not _arguments_match(self.arguments, request):
            return False
        return not (
            self.path_scope is not None
            and not _path_scope_matches(self.path_scope, request, workspace_root)
        )


def _arguments_match(
    expected: tuple[tuple[str, str], ...],
    request: PermissionRequest,
) -> bool:
    """Whether *request* carries exactly the rendered argument values in *expected*."""
    if len(expected) != len(request.arguments):
        return False
    return all(str(request.arguments.get(key)) == value for key, value in expected)


def _render_arguments(request: PermissionRequest) -> tuple[tuple[str, str], ...]:
    """Freeze a request's arguments into the comparable shape rules store."""
    return tuple(
        (str(key), str(request.arguments[key])) for key in sorted(str(k) for k in request.arguments)
    )


def _exact_command_matcher(command: str) -> CommandMatcher:
    """Matcher that accepts only the identical command line."""

    def _matches(candidate: str) -> bool:
        return candidate == command

    return _matches


def _path_scope_matches(
    scope: PathScope,
    request: PermissionRequest,
    workspace_root: Path,
) -> bool:
    """Classify a request's path arguments against the workspace boundary.

    ``inside_workspace`` requires every path argument to resolve inside the
    root; ``outside_workspace`` requires at least one to escape it.  A request
    carrying no path arguments never matches a path-scoped rule.
    """
    candidates = _path_arguments(request.arguments)
    if not candidates:
        return False
    inside = [_is_inside(candidate, workspace_root) for candidate in candidates]
    if scope == "inside_workspace":
        return all(inside)
    return not all(inside)


def _path_arguments(arguments: Mapping[str, Any]) -> list[str]:
    found: list[str] = []
    for key, value in arguments.items():
        if key not in _PATH_ARGUMENT_KEYS:
            continue
        if isinstance(value, str):
            found.append(value)
        elif isinstance(value, (list, tuple)):
            found.extend(str(item) for item in value)
    return found


def _is_inside(candidate: str, workspace_root: Path) -> bool:
    path = Path(candidate)
    if not path.is_absolute():
        path = workspace_root / path
    try:
        return path.resolve().is_relative_to(workspace_root)
    except (OSError, ValueError):
        # An unresolvable path is treated as escaping the workspace: the
        # stricter reading is the only fail-closed one.
        return False


@traces(SWR.SWR_2501)
@dataclass(frozen=True)
class PermissionPolicy:
    """An ordered rule list plus the default applied when nothing matches.

    First matching rule wins.  The ordering guarantee is load-bearing for
    SWR-2502, whose pattern rules rely on deterministic precedence.
    """

    rules: tuple[PermissionRule, ...] = ()
    default_decision: Decision = Decision.ALLOW
    preset_name: str = "unrestricted"

    def validate(self) -> None:
        """Raise :class:`MalformedPolicyError` if the policy cannot be applied."""
        if not self.preset_name:
            raise MalformedPolicyError("Policy preset name must not be empty")
        seen: set[str] = set()
        for rule in self.rules:
            if not rule.rule_id:
                raise MalformedPolicyError("Every permission rule needs a non-empty rule_id")
            if rule.rule_id in seen:
                raise MalformedPolicyError(f"Duplicate permission rule id: {rule.rule_id!r}")
            seen.add(rule.rule_id)
            if not isinstance(rule.decision, Decision):
                raise MalformedPolicyError(
                    f"Rule {rule.rule_id!r} carries a non-Decision outcome: {rule.decision!r}",
                )


#: The permissive default shipped with SWR-2501: the engine is consulted on
#: every dispatch, but nothing is gated until SWR-2503 supplies real presets.
ALLOW_ALL_POLICY = PermissionPolicy()


class AuditSink(Protocol):
    """Receives every resolved decision.  SWR-2506 supplies the real writer."""

    def record(self, request: PermissionRequest, decision: PermissionDecision) -> None: ...


class ApprovalResolver(Protocol):
    """Turns an ``ask`` into a terminal decision.  SWR-2504 supplies the UI."""

    def resolve(
        self,
        request: PermissionRequest,
        pending: PermissionDecision,
    ) -> PermissionDecision: ...


@traces(SWR.SWR_2501)
class NullAuditSink:
    """Drops decisions on the floor until SWR-2506 lands."""

    def record(self, request: PermissionRequest, decision: PermissionDecision) -> None:
        del request, decision


@traces(SWR.SWR_2501)
class FailSafeApprovalResolver:
    """Resolves every ``ask`` to ``deny``.

    This is the interim behaviour SWR-2504 mandates for hosts without an
    approval UI: never silently allow, never hang the session.  SWR-2504
    replaces it with the Rotaris resolver.
    """

    def resolve(
        self,
        request: PermissionRequest,
        pending: PermissionDecision,
    ) -> PermissionDecision:
        del request
        return PermissionDecision(
            decision=Decision.DENY,
            rule_id=pending.rule_id,
            reason=(
                f"{pending.reason} No interactive approval is available in this host, "
                "so the request was denied fail-safe."
            ),
            source=DecisionSource.HEADLESS_POLICY,
        )


@traces(SWR.SWR_2501)
class PermissionEngine:
    """Resolves one decision per tool dispatch.

    :meth:`resolve` never raises and never returns :attr:`Decision.ASK` — an
    ``ask`` is routed through the approval resolver before it comes back, so
    callers only have to handle allow and deny.
    """

    def __init__(
        self,
        *,
        policy: PermissionPolicy,
        path_auth: PathAuth,
        persona: str,
        headless: bool = True,
        agent_id: str = "",
        audit_sink: AuditSink | None = None,
        approval_resolver: ApprovalResolver | None = None,
    ) -> None:
        self._policy = policy
        self._workspace_root = path_auth.workspace_root
        self._persona = persona
        self._headless = headless
        self._agent_id = agent_id or persona
        self._audit_sink: AuditSink = audit_sink or NullAuditSink()
        self._approval_resolver: ApprovalResolver = approval_resolver or FailSafeApprovalResolver()
        self._policy_error: MalformedPolicyError | None = None
        self._policy_validated = False
        # Rules the user created by approving a call for the session (SWR-2504).
        # Held beside the policy rather than inside it so a mid-session mode
        # change (SWR-2503 ``set_policy``) neither drops nor widens them.
        self._session_lock = RLock()
        self._session_rules: tuple[PermissionRule, ...] = ()

    @property
    def policy(self) -> PermissionPolicy:
        return self._policy

    @property
    def session_rules(self) -> tuple[PermissionRule, ...]:
        """Allow rules added by session-scoped approvals, newest first."""
        with self._session_lock:
            return self._session_rules

    def set_policy(self, policy: PermissionPolicy) -> None:
        """Swap the active policy; takes effect on the next :meth:`resolve` call.

        Supports SWR-2503's mid-session mode change: nothing here re-reads
        the policy eagerly, so the very next tool dispatch after this call
        sees the new rules. Re-validates lazily, same as construction.
        """
        self._policy = policy
        self._policy_validated = False
        self._policy_error = None

    @property
    def persona(self) -> str:
        return self._persona

    @property
    def agent_id(self) -> str:
        """Canonical name of the agent this engine gates (persona as fallback).

        For a delegated child this is the same string ``child.spawn``
        announces, so an ``approval.requested`` raised through this engine's
        resolver joins back to the child that asked.  Note the fallback: an
        engine built without an explicit name reports its persona, so this is
        never empty and an ``agent_id`` is not by itself proof of a delegation.

        The resolver keeps its **own** copy — :class:`ApprovalResolver` passes
        only the request, so it cannot read this property — and it is the
        resolver's copy that reaches the event.  A caller that sets ``agent_id``
        here must pass the same value to the resolver, as ``agents.factory``
        does; wiring one and not the other yields an engine that knows its agent
        and an event that names none.
        """
        return self._agent_id

    @traces(SWR.SWR_2504)
    def add_session_rule(self, request: PermissionRequest) -> PermissionRule:
        """Allow future calls that match *request* exactly, for this session.

        Deliberately narrow: the rule pins the tool name and — for terminal-class
        calls — the exact command string.  A user approving ``git push`` once
        must not thereby approve every ``git`` invocation.
        """
        with self._session_lock:
            rule_id = f"session:allow:{len(self._session_rules) + 1}"
            command = request.command
            rule = PermissionRule(
                rule_id=rule_id,
                decision=Decision.ALLOW,
                tools=frozenset({request.tool_name.lower()}),
                personas=frozenset({request.persona}),
                matcher=_exact_command_matcher(command) if command else None,
                arguments=None if command else _render_arguments(request),
                description=f"Approved for this session: {request.redacted_summary()}",
            )
            self._session_rules = (rule, *self._session_rules)
        return rule

    def resolve(self, request: PermissionRequest) -> PermissionDecision:
        """Resolve *request* to ``allow`` or ``deny``.  Never raises."""
        decision = self._decide(request)
        if decision.decision is Decision.ASK:
            decision = self._resolve_ask(request, decision)
        self._record(request, decision)
        return decision

    def _decide(self, request: PermissionRequest) -> PermissionDecision:
        try:
            return self._decide_unguarded(request)
        except Exception as exc:  # noqa: BLE001 - fail-closed by design
            _log.warning(
                "Permission policy could not be resolved for %s; failing closed: %s",
                request.redacted_summary(),
                exc,
            )
            return self._fail_closed(str(exc))

    def _decide_unguarded(self, request: PermissionRequest) -> PermissionDecision:
        if request.tool_name.lower() in _ALWAYS_ALLOWED_TOOLS:
            return PermissionDecision(
                decision=Decision.ALLOW,
                rule_id="builtin:meta-tool",
                reason=f"Tool '{request.tool_name}' is a loop-control tool and is never gated.",
                source=DecisionSource.BUILTIN,
            )

        self._ensure_policy_valid()

        session_rules = self.session_rules
        for rule in (*session_rules, *self._policy.rules):
            if rule.matches(request, self._workspace_root):
                detail = f" ({rule.description})" if rule.description else ""
                return PermissionDecision(
                    decision=rule.decision,
                    rule_id=rule.rule_id,
                    reason=(
                        f"Rule '{rule.rule_id}'{detail} resolved "
                        f"'{request.tool_name}' to {rule.decision.value}."
                    ),
                    source=(
                        DecisionSource.SESSION_RULE
                        if rule in session_rules
                        else DecisionSource.RULE
                    ),
                )

        return PermissionDecision(
            decision=self._policy.default_decision,
            rule_id=f"preset:{self._policy.preset_name}",
            reason=(
                f"No rule matched; permission mode '{self._policy.preset_name}' "
                f"defaults to {self._policy.default_decision.value}."
            ),
            source=DecisionSource.PRESET,
        )

    def _ensure_policy_valid(self) -> None:
        if not self._policy_validated:
            try:
                self._policy.validate()
            except MalformedPolicyError as exc:
                self._policy_error = exc
            finally:
                self._policy_validated = True
        if self._policy_error is not None:
            raise self._policy_error

    def _fail_closed(self, detail: str) -> PermissionDecision:
        """Interactive hosts get ``ask``, headless hosts ``deny``.  Never ``allow``."""
        decision = Decision.DENY if self._headless else Decision.ASK
        return PermissionDecision(
            decision=decision,
            rule_id="failclosed:unresolvable-policy",
            reason=(
                f"The permission policy could not be resolved ({detail}); "
                f"failing closed to {decision.value}."
            ),
            source=DecisionSource.FAIL_CLOSED,
        )

    def _resolve_ask(
        self,
        request: PermissionRequest,
        pending: PermissionDecision,
    ) -> PermissionDecision:
        try:
            resolved = self._approval_resolver.resolve(request, pending)
        except Exception as exc:  # noqa: BLE001 - fail-closed by design
            _log.warning(
                "Approval resolution failed for %s; denying: %s",
                request.redacted_summary(),
                exc,
            )
            return self._denied_ask(pending, f"approval resolution failed: {exc}")
        if resolved.decision is Decision.ASK:
            return self._denied_ask(pending, "approval resolver returned no verdict")
        if resolved.decision is Decision.ALLOW and resolved.session_scoped:
            rule = self.add_session_rule(request)
            _log.info(
                "Session-scoped approval added rule %s for %s",
                rule.rule_id,
                request.redacted_summary(),
            )
        return resolved

    @staticmethod
    def _denied_ask(pending: PermissionDecision, detail: str) -> PermissionDecision:
        return PermissionDecision(
            decision=Decision.DENY,
            rule_id=pending.rule_id,
            reason=f"{pending.reason} Denied because {detail}.",
            source=DecisionSource.FAIL_CLOSED,
        )

    def _record(self, request: PermissionRequest, decision: PermissionDecision) -> None:
        try:
            self._audit_sink.record(request, decision)
        except Exception as exc:  # noqa: BLE001 - auditing must never break dispatch
            _log.warning("Permission audit sink raised for %s: %s", request.redacted_summary(), exc)
