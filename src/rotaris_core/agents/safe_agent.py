from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING, Any

from openhands.sdk import Agent as OpenHandsAgent
from pydantic import Field

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence

    from openhands.sdk.conversation import LocalConversation
    from openhands.sdk.event import ActionEvent, Event
    from openhands.sdk.llm import MessageToolCall

    from rotaris_core.hooks.runner import HookOutcome
    from rotaris_core.permissions import PermissionRequest


_log = logging.getLogger(__name__)
_FINISH_TOOL_NAMES = frozenset({"finish", "finishtool"})
_FINISH_MESSAGE_PREFIX_RE = re.compile(r"^\{\s*[\"']message[\"']\s*:\s*", re.DOTALL)

# Patterns for schema-level errors where a JSON field that should be an array
# is instead a single bare object. We use a character-by-character scan rather
# than regex because the nested-brace structure defeats simple patterns.
_ARRAY_FIELDS = frozenset({"tasks", "phases", "files", "items", "test_cases"})


@traces(SWR.SWR_2129)
def _repair_object_where_array_expected(raw_arguments: str) -> str | None:
    """Fix JSON where a known array field contains a single object instead of an array.

    Walks the JSON structure character-by-character to correctly handle nested
    braces, unlike regex-based approaches that fail on deeply nested fields.

    Returns the repaired JSON string, or None if no fixable pattern was found.
    Only repairs when the field name is in ``_ARRAY_FIELDS``.
    """
    if not raw_arguments or not raw_arguments.strip():
        return None

    # Quick pre-check: if no array field names appear, skip the full scan.
    has_array_field = any(field in raw_arguments for field in _ARRAY_FIELDS)
    if not has_array_field:
        return None

    repairs: list[tuple[int, int]] = []  # (start, end) of object value to wrap
    i = 0
    n = len(raw_arguments)

    while i < n:
        # Find next quoted key.
        quote_start = raw_arguments.find('"', i)
        if quote_start == -1:
            break

        # Extract the key name.
        quote_end = raw_arguments.find('"', quote_start + 1)
        if quote_end == -1:
            break
        key = raw_arguments[quote_start + 1 : quote_end]
        i = quote_end + 1

        if key not in _ARRAY_FIELDS:
            continue

        # Skip whitespace to find the colon.
        j = i
        while j < n and raw_arguments[j] in " \t\r\n":
            j += 1
        if j >= n or raw_arguments[j] != ":":
            continue
        i = j + 1  # skip colon

        # Skip whitespace to find the value.
        j = i
        while j < n and raw_arguments[j] in " \t\r\n":
            j += 1
        if j >= n:
            break
        i = j

        # If the value starts with '{' (not '['), we have a fixable site.
        if raw_arguments[i] != "{":
            continue
        if i > 0 and raw_arguments[i - 1] == "[":
            continue  # Already in an array

        # Find the matching closing brace.
        brace_start = i
        depth = 0
        in_string = False
        escaped = False
        while i < n:
            ch = raw_arguments[i]
            if in_string:
                if escaped:
                    escaped = False
                elif ch == "\\":
                    escaped = True
                elif ch == '"':
                    in_string = False
            elif ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    repairs.append((brace_start, i))
                    break
            i += 1

    if not repairs:
        return None

    # Apply repairs in reverse order so indices stay stable.
    result = raw_arguments
    for start, end in reversed(repairs):
        original = result[start : end + 1]
        result = result[:start] + "[" + original + "]" + result[end + 1 :]

    return result if result != raw_arguments else None


@traces(SWR.SWR_2129)
def recover_malformed_finish_arguments(raw_arguments: str) -> dict[str, str] | None:
    # ...existing code...
    """Recover a FinishTool payload when the model emits truncated JSON."""
    raw = raw_arguments.strip()
    if not raw:
        return None

    from openhands.sdk.agent.utils import parse_tool_call_arguments

    try:
        parsed = parse_tool_call_arguments(raw_arguments)
    except json.JSONDecodeError:
        parsed = None

    if isinstance(parsed, dict) and isinstance(parsed.get("message"), str):
        return None

    from_object_payload = False
    message = raw
    match = _FINISH_MESSAGE_PREFIX_RE.match(raw)
    if match is not None:
        from_object_payload = True
        message = raw[match.end() :].lstrip()

    if message.startswith(('"', "'")):
        quote = message[0]
        message = message[1:]
        if from_object_payload and message.endswith(f"{quote}}}"):
            message = message[:-2]
        elif message.endswith(quote):
            message = message[:-1]

    if from_object_payload and message.endswith("}"):
        message = message[:-1].rstrip()

    message = _unescape_common_json_sequences(message).strip()
    if not message:
        return None
    return {"message": message}


@traces(SWR.SWR_2129)
def repair_finish_tool_call(tool_call: MessageToolCall) -> MessageToolCall:
    repaired = repair_malformed_tool_call_arguments(tool_call)
    if repaired is not tool_call:
        return repaired

    tool_name = str(tool_call.name or "").strip().lower()
    if tool_name not in _FINISH_TOOL_NAMES:
        return tool_call

    recovered = recover_malformed_finish_arguments(tool_call.arguments)
    if recovered is None:
        return tool_call

    _log.warning("Recovered malformed finish tool arguments from truncated JSON payload.")
    return tool_call.model_copy(update={"arguments": json.dumps(recovered)})


@traces(SWR.SWR_2129)
def repair_malformed_tool_call_arguments(tool_call: MessageToolCall) -> MessageToolCall:
    """Close truncated JSON tool arguments and repair schema-level errors.

    Handles two categories of malformed arguments:
    1. Truncated/unbalanced JSON (e.g. missing closing braces/brackets).
    2. Schema-level errors where a known array field contains a single object
       instead of an array (e.g. ``"tasks": {...}`` instead of ``"tasks": [{...}]``).
    """
    raw_arguments = tool_call.arguments
    if not raw_arguments or not raw_arguments.strip():
        return tool_call

    from openhands.sdk.agent.utils import parse_tool_call_arguments

    # Attempt 1: close unbalanced JSON (truncated payloads).
    repaired_arguments = _close_unbalanced_json(raw_arguments)
    if repaired_arguments is not None and repaired_arguments != raw_arguments:
        try:
            parse_tool_call_arguments(repaired_arguments)
        except json.JSONDecodeError:
            repaired_arguments = None

    if repaired_arguments is None:
        # Attempt 2: fix object-where-array-expected schema errors.
        # These arguments parse as valid JSON but have the wrong shape.
        schema_repaired = _repair_object_where_array_expected(raw_arguments)
        if schema_repaired is not None and schema_repaired != raw_arguments:
            try:
                parse_tool_call_arguments(schema_repaired)
                repaired_arguments = schema_repaired
            except json.JSONDecodeError:
                pass

    if repaired_arguments is None or repaired_arguments == raw_arguments:
        # Attempt 3: even if the arguments parse fine, check for schema errors
        # (object-where-array-expected) that wouldn't cause a parse failure.
        try:
            parse_tool_call_arguments(raw_arguments)
        except json.JSONDecodeError:
            return tool_call
        schema_repaired = _repair_object_where_array_expected(raw_arguments)
        if schema_repaired is not None and schema_repaired != raw_arguments:
            try:
                parse_tool_call_arguments(schema_repaired)
                repaired_arguments = schema_repaired
            except json.JSONDecodeError:
                pass
        else:
            return tool_call

    if repaired_arguments is None or repaired_arguments == raw_arguments:
        return tool_call

    _log.warning(
        "Recovered malformed %s tool arguments: schema repair (object-where-array-expected)",
        str(tool_call.name or "unknown"),
    )
    return tool_call.model_copy(update={"arguments": repaired_arguments})


def _close_unbalanced_json(raw_arguments: str) -> str | None:
    stack: list[str] = []
    repaired: list[str] = []
    in_string = False
    escaped = False

    for char in raw_arguments:
        repaired.append(char)
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue

        if char == '"':
            in_string = True
        elif char in "{[":
            stack.append("}" if char == "{" else "]")
        elif char in "}]":
            if not stack:
                return None
            if stack[-1] != char:
                if char == "}" and stack[-1] == "]":
                    repaired.insert(-1, stack.pop())
                    if not stack:
                        return None
                else:
                    return None
            stack.pop()

    if in_string or escaped:
        return None
    if not stack:
        return raw_arguments
    return "".join(repaired).rstrip() + "".join(reversed(stack))


def _unescape_common_json_sequences(message: str) -> str:
    return (
        message.replace("\\r\\n", "\n")
        .replace("\\n", "\n")
        .replace("\\t", "\t")
        .replace('\\"', '"')
        .replace("\\\\", "\\")
    )


@traces(SWR.SWR_2110, SWR.SWR_2501)
class RotarisAgent(OpenHandsAgent):
    """OpenHands Agent with repair shims for malformed LLM tool calls.

    Repairs two categories of tool-call argument errors before they reach
    the SDK tool executor:
    1. Truncated/unbalanced JSON (missing closing braces/brackets).
    2. Schema-level errors (object-where-array-expected for known fields).
    3. FinishTool-specific malformed payloads (missing message field).

    It is also the single permission gate for tool dispatch (SWR-2501): every
    tool call the SDK runs — built-in, custom plugin, or MCP — goes through
    ``_execute_action_event``, so overriding it puts the policy engine in front
    of all of them at once.
    """

    permission_binding_key: str | None = Field(
        default=None,
        description=(
            "Key under which this agent's permission engine is registered "
            "(SWR-2501). Only a JSON-safe string may live on the agent spec: "
            "the spec is serialised into ConversationState, so the engine "
            "itself is looked up from the registry at dispatch time."
        ),
    )

    def _get_action_event(
        self,
        tool_call: MessageToolCall,
        conversation: Any,
        llm_response_id: str,
        on_event: Any,
        security_analyzer: Any = None,
        thought: Any = None,
        reasoning_content: Any = None,
        thinking_blocks: Any = None,
        responses_reasoning_item: Any = None,
    ) -> Any:
        # Apply generic repair (truncated JSON + schema errors) to ALL tool calls.
        repaired_tool_call = repair_malformed_tool_call_arguments(tool_call)
        # Then apply finish-specific recovery on top.
        repaired_tool_call = repair_finish_tool_call(repaired_tool_call)
        return super()._get_action_event(
            repaired_tool_call,
            conversation,
            llm_response_id,
            on_event,
            security_analyzer,
            thought,
            reasoning_content,
            thinking_blocks,
            responses_reasoning_item,
        )

    @traces(SWR.SWR_2501, SWR.SWR_2702)
    def _execute_action_event(
        self,
        conversation: LocalConversation,
        action_event: ActionEvent,
    ) -> list[Event]:
        """Gate one tool dispatch on the permission policy before executing it.

        A ``deny`` is returned as an ``AgentErrorEvent`` carrying the same
        ``tool_call_id``, which the SDK converts into a ``role="tool"`` message.
        The agent therefore sees a tool result naming the violated rule and can
        re-plan; the run is not aborted.

        The user's own ``pre_tool``/``post_tool`` hooks (SWR-2702) sit *inside*
        the allow branch, in :meth:`_dispatch_with_hooks`. Policy first, hooks
        second: a call the policy denies never happens, so firing a hook for it
        would have the hook observe — and act on — an event that does not exist.

        Runs on a parallel worker thread — no shared mutable state here.
        """
        from rotaris_core.permissions import Decision, resolve_permission_engine

        engine = resolve_permission_engine(self.permission_binding_key)
        request = _permission_request(engine.persona, action_event)
        decision = engine.resolve(request)

        if decision.decision is Decision.ALLOW:
            return self._dispatch_with_hooks(conversation, action_event, request)

        from openhands.sdk.event import AgentErrorEvent

        refusal = (
            f"Permission denied by rule '{decision.rule_id}'. {decision.reason} "
            f"The '{action_event.tool_name}' call was not executed. "
            "Choose a different approach or ask the user to adjust the permission policy."
        )
        _log.warning(
            "Permission denied for %s (rule %s)",
            request.redacted_summary(),
            decision.rule_id,
        )
        return [
            AgentErrorEvent(
                error=refusal,
                tool_name=action_event.tool_name,
                tool_call_id=action_event.tool_call.id,
            ),
        ]

    @traces(SWR.SWR_2702)
    def _dispatch_with_hooks(
        self,
        conversation: LocalConversation,
        action_event: ActionEvent,
        request: PermissionRequest,
    ) -> list[Event]:
        """Execute one allowed tool call with the user's tool hooks around it.

        Only reached once the permission engine has allowed the call. From here:

        * ``pre_tool`` runs *before* ``super()._execute_action_event(...)``. A
          blocking outcome returns the hook's own refusal as an
          ``AgentErrorEvent`` and the tool is never invoked.
        * ``post_tool`` runs *after* ``super()._execute_action_event(...)``
          returns, so it only ever sees calls that actually executed — never a
          policy denial, never a ``pre_tool`` block.

        The no-hooks path costs one registry dict lookup and nothing else: no
        payload, no filesystem, no extra imports beyond the registry module.
        The runner is resolved per call rather than cached on the agent, so a
        resumed session picks up its own runner instead of a stale one.
        """
        from rotaris_core.hooks.registry import resolve_hook_runner

        runner = resolve_hook_runner(_hook_session_id(self.permission_binding_key))
        if runner is None:
            # The overwhelmingly common case: this session configured no hooks.
            return super()._execute_action_event(conversation, action_event)

        tool_name = action_event.tool_name
        # SWR-2502 matchers read the shell command, not the tool name, whenever
        # one is available — so a matcher only ever selects on the command text
        # if the same facet the policy engine matches on is handed over here.
        command = request.command or ""

        if runner.has_hooks("pre_tool"):
            outcomes = runner.run_pre_tool(
                tool_name=tool_name,
                arguments=request.arguments,
                command=command,
            )
            _report_hook_warnings(outcomes)
            blocking = runner.blocking_outcome(outcomes)
            if blocking is not None:
                from openhands.sdk.event import AgentErrorEvent

                _log.warning(
                    "Hook %r blocked the %r call.",
                    blocking.name,
                    tool_name,
                )
                return [
                    AgentErrorEvent(
                        # Already phrased by the runner in the same shape a
                        # policy deny uses (SWR-2702); passed through verbatim.
                        # The fallback is unreachable while the runner keeps its
                        # contract, and only exists so a blocked call can never
                        # reach the agent as an empty tool result.
                        error=blocking.feedback or _BLANK_HOOK_REFUSAL,
                        tool_name=tool_name,
                        tool_call_id=action_event.tool_call.id,
                    ),
                ]

        events = super()._execute_action_event(conversation, action_event)

        if not runner.has_hooks("post_tool"):
            return events
        outcomes = runner.run_post_tool(
            tool_name=tool_name,
            arguments=request.arguments,
            result=_hook_result(events),
            command=command,
        )
        _report_hook_warnings(outcomes)
        # ``blocked`` is never True for post_tool (SWR-2702 forbids it, and the
        # runner enforces it); the filter documents that the call stands either
        # way — the feedback is added to the result, it does not replace it.
        feedback = "\n".join(
            outcome.feedback for outcome in outcomes if outcome.feedback and not outcome.blocked
        )
        if not feedback:
            return events
        return _with_hook_feedback(events, feedback)


#: Stand-in refusal for a blocking outcome that carried no text of its own.
#: See the comment at its only use site: not reachable via the runner's contract.
_BLANK_HOOK_REFUSAL = "Blocked by a pre_tool hook. The call was not executed."


@traces(SWR.SWR_2702)
def _hook_session_id(binding_key: str | None) -> str | None:
    """The session id inside a permission binding key, or ``None``.

    ``tool_registration.build_binding_key`` builds ``f"{session_id}/{scope}"``
    for an agent created with a session and the bare *scope* for one created
    without. A session id is ``<timestamp>-<hex>`` and a scope is a persona or
    canonical child name, so neither half contains a slash and the first one
    separates them.

    A key with no slash names no session, and a session-less agent has no hooks:
    returning ``None`` there makes the registry lookup a deliberate miss rather
    than a lookup of a persona name that could collide with a real session id.
    """
    if not binding_key:
        return None
    session_id, separator, _scope = binding_key.partition("/")
    return session_id if separator else None


@traces(SWR.SWR_2702)
def _report_hook_warnings(outcomes: Sequence[HookOutcome]) -> None:
    """Surface every hook warning; the runner already filed them as evidence.

    A hook that timed out, could not be started or exited non-zero is a
    *non-blocking* fault (SWR-2702): the call proceeds, but the user has to be
    able to see that their hook is broken, so it is never dropped on the floor
    here. Deliberately not turned into anything the agent can see — a warning is
    for the user, and an agent-visible error would make a non-2 exit blocking.
    """
    for outcome in outcomes:
        if outcome.warning:
            _log.warning("%s", outcome.warning)


#: Longest tool result handed to a ``post_tool`` hook. The result goes onto the
#: hook's stdin, and a tool that read a large file would otherwise put megabytes
#: there; a hook decides what to do about a call, and the head of the output is
#: what that decision is made on.
_MAX_HOOK_RESULT_CHARS = 4096


@traces(SWR.SWR_2702)
def _hook_result(events: Sequence[Event]) -> Any:
    """A small, JSON-safe rendering of what the tool returned, for ``post_tool``.

    Renders what the *agent* was given rather than the observation's internals:
    that text is the tool's own account of what happened, and it is already
    whatever size the tool decided to show. It is capped again here so a hook's
    stdin stays bounded whatever the tool did.

    Best-effort by design: a hook that cannot read the result still gets the
    tool name and arguments, and an observation that refuses to render must not
    fail the tool call it is describing. The runner redacts whatever comes back.
    """
    from openhands.sdk.event import AgentErrorEvent, ObservationEvent

    rendered: list[Any] = []
    for event in events:
        if isinstance(event, AgentErrorEvent):
            rendered.append({"error": _truncated(event.error)})
        elif isinstance(event, ObservationEvent):
            rendered.append({"observation": _truncated(_observation_text(event))})
    if not rendered:
        return None
    return rendered[0] if len(rendered) == 1 else rendered


def _observation_text(event: Any) -> str:
    """The text an observation put in front of the agent, or ``""``."""
    try:
        return "".join(
            str(getattr(part, "text", "") or "") for part in event.observation.to_llm_content
        )
    except Exception as exc:  # noqa: BLE001 - never let introspection break dispatch
        _log.debug("Could not render an observation for a post_tool hook: %s", exc)
        return ""


def _truncated(text: str) -> str:
    if len(text) <= _MAX_HOOK_RESULT_CHARS:
        return text
    return f"{text[:_MAX_HOOK_RESULT_CHARS]}\n[truncated: {len(text)} characters]"


@traces(SWR.SWR_2702)
def _with_hook_feedback(events: list[Event], feedback: str) -> list[Event]:
    """Attach a ``post_tool`` hook's message to the result the agent will read.

    Carried on the observation's ``extended_content``, which the SDK appends to
    the ``role="tool"`` message in ``ObservationEvent.to_llm_message`` — the
    same channel agent-context injections use. That is the shape the tool result
    "standing while the agent additionally sees the hook's message" wants: the
    observation is untouched, the text is correlated with the right
    ``tool_call_id``, and nothing is inserted between an assistant tool-call
    block and its results, which a separate message event would do on a parallel
    batch and some providers reject.

    A tool that produced no observation at all (it raised, so the SDK returned
    an ``AgentErrorEvent``, which has no ``extended_content``) falls back to a
    trailing user message rather than losing the hook's feedback.
    """
    from openhands.sdk.event import MessageEvent, ObservationEvent
    from openhands.sdk.llm import Message, TextContent

    attached = False
    updated: list[Event] = []
    for event in events:
        if not attached and isinstance(event, ObservationEvent):
            updated.append(
                event.model_copy(
                    update={
                        "extended_content": [*event.extended_content, TextContent(text=feedback)],
                    },
                ),
            )
            attached = True
        else:
            updated.append(event)
    if attached:
        return updated
    updated.append(
        MessageEvent(
            source="user",
            llm_message=Message(role="user", content=[TextContent(text=feedback)]),
        ),
    )
    return updated


@traces(SWR.SWR_2501)
def _permission_request(persona: str, action_event: ActionEvent) -> PermissionRequest:
    """Describe one ``ActionEvent`` in policy terms.

    Argument extraction is best-effort: a tool whose action refuses to dump
    still gets a decision, just one made on tool name and persona alone.
    """
    from rotaris_core.permissions import PermissionRequest

    arguments: dict[str, Any] = {}
    action = action_event.action
    if action is not None:
        try:
            dumped = action.model_dump()
        except Exception as exc:  # noqa: BLE001 - never let introspection break dispatch
            _log.debug("Could not dump action arguments for %s: %s", action_event.tool_name, exc)
        else:
            if isinstance(dumped, dict):
                arguments = dumped

    raw_command = arguments.get("command")
    if not isinstance(raw_command, str):
        # SWR-2505: ``command`` is the only facet a rule matcher can read
        # (``arguments`` is exact-match only), and a tool whose effect is a
        # network target carries that target in ``url``, not in ``command``.
        # Without this, every host-scoped rule is silently bypassed for
        # ``fetch``.
        raw_command = arguments.get("url")
    command = raw_command if isinstance(raw_command, str) else None

    return PermissionRequest(
        tool_name=action_event.tool_name,
        persona=persona,
        arguments=arguments,
        command=command,
    )
