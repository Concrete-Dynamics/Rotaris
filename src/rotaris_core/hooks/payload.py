"""The JSON a hook process reads on stdin (SWR-2702, SWR-2703).

A hook is user code, so the payload is the whole interface: everything the hook
is allowed to know about the call it observes arrives as one JSON object on
stdin, and *nothing* is interpolated into its command line.  That split is a
security property, not a style choice — a tool argument containing ``; rm -rf /``
is inert data here, and would be a shell injection if it were spliced into the
command.

Two invariants make the builders safe to call from an agent's hot path:

* **They never raise.**  A value that cannot be serialised degrades to its
  ``repr()``; a self-referential structure degrades to a cycle marker; an object
  whose ``__repr__`` itself explodes degrades to its type name.  A malformed
  tool argument must not be able to fail a tool call.
* **Redaction is structural.**  Every string at every depth of the nested
  payload goes through :func:`~rotaris_core.permissions.approval.redact_secrets`,
  so a token buried three levels down in a request body is masked just as a
  top-level ``--token`` flag is.  Flattening the payload to one string first
  would mask the same values, but would also destroy the shape the hook needs.
  A structural walk does lose one thing a flat string keeps — the key sitting
  next to a value — so a value hanging off a credential-shaped key is masked
  whole, with that key shape asked of the same redactor rather than restated
  here (see :func:`_key_is_secret`).
"""

from __future__ import annotations

import math
from collections.abc import Mapping
from functools import lru_cache
from typing import TYPE_CHECKING, Any

from rotaris_core.permissions.approval import redact_secrets
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pathlib import Path

__all__ = [
    "RESERVED_LIFECYCLE_FIELDS",
    "build_lifecycle_payload",
    "build_tool_payload",
    "redact_payload",
]

#: Top-level keys a lifecycle event's own fields may never occupy: a hook must
#: be able to trust ``event`` and ``session_id``, because that is what it
#: branches on.  Python already refuses a keyword passed twice, so a caller
#: forwarding an event's data as ``**fields`` has to strip these *before* the
#: call or get a :class:`TypeError`; :meth:`HookRunner.run_lifecycle
#: <rotaris_core.hooks.runner.HookRunner.run_lifecycle>` strips them here.
RESERVED_LIFECYCLE_FIELDS = frozenset({"event", "session_id", "workspace"})

#: Nesting depth past which a value is rendered as its ``repr()`` rather than
#: walked.  Deep structures are pathological in a payload, and the bound also
#: stops a mutually recursive ``__getitem__`` from exhausting the stack.
_MAX_DEPTH = 12

#: Stand-in for a value that refers back to a container already on the walk.
_CYCLE_MARKER = "<recursive>"

#: What a value hanging off a credential-shaped key is replaced with.  Matches
#: the mask :func:`redact_secrets` writes, so a payload reads consistently.
_MASKED = "***"

#: Probe value used to ask the one redactor whether a key name is
#: credential-shaped.  Deliberately innocuous, so any masking of the probe can
#: only have come from the key.
_KEY_PROBE_VALUE = "x"


@lru_cache(maxsize=512)
def _key_is_secret(key: str) -> bool:
    """Whether *key* names a credential, per the single redaction implementation.

    A structural walk sees a mapping's value without its key, so
    ``{"api_key": "hunter2"}`` would otherwise survive: ``"hunter2"`` on its own
    looks like any other word.  Rather than restate
    :data:`~rotaris_core.permissions.approval._SECRET_NAME` here — a second
    redactor is exactly what drifts — the key is *asked* of the real one: render
    it as an assignment with a harmless value and see whether the value is
    masked.
    """
    probe = f"{key}={_KEY_PROBE_VALUE}"
    return redact_secrets(probe) != probe


def _safe_repr(value: Any) -> str:
    """``repr(value)``, or a type-only placeholder when ``__repr__`` raises."""
    try:
        return repr(value)
    except Exception:  # noqa: BLE001 - a broken __repr__ must not fail a tool call
        return f"<unrepresentable {type(value).__name__}>"


def _sanitise(value: Any, depth: int, stack: set[int]) -> Any:
    """Return a JSON-safe, secret-free rendering of *value*.

    *stack* holds the ``id()`` of every container currently being walked, so a
    structure that points back at itself yields a marker instead of recursing
    forever.  Ids are removed on the way out, so a value that merely appears
    twice is rendered twice.
    """
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, str):
        return redact_secrets(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        # NaN and the infinities are not JSON; keep them readable instead.
        return value if math.isfinite(value) else repr(value)
    if isinstance(value, bytes | bytearray):
        return redact_secrets(bytes(value).decode("utf-8", errors="replace"))
    if depth >= _MAX_DEPTH:
        return redact_secrets(_safe_repr(value))

    marker = id(value)
    if isinstance(value, Mapping):
        if marker in stack:
            return _CYCLE_MARKER
        stack.add(marker)
        try:
            return {
                redact_secrets(str(key)): (
                    _MASKED if _key_is_secret(str(key)) else _sanitise(item, depth + 1, stack)
                )
                for key, item in value.items()
            }
        except Exception:  # noqa: BLE001 - a hostile mapping degrades, it does not raise
            return redact_secrets(_safe_repr(value))
        finally:
            stack.discard(marker)
    if isinstance(value, list | tuple | set | frozenset):
        if marker in stack:
            return _CYCLE_MARKER
        stack.add(marker)
        try:
            return [_sanitise(item, depth + 1, stack) for item in value]
        except Exception:  # noqa: BLE001 - a hostile iterable degrades, it does not raise
            return redact_secrets(_safe_repr(value))
        finally:
            stack.discard(marker)
    return redact_secrets(_safe_repr(value))


@traces(SWR.SWR_2702, SWR.SWR_2703)
def redact_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Return *payload* with every nested string redacted and JSON-safe.

    Never raises and never mutates its argument.  Idempotent, because
    :func:`redact_secrets` is: re-redacting an already-redacted payload is a
    no-op, so a caller that is unsure whether a payload has been through here
    can simply run it through again.
    """
    result = _sanitise(payload, 0, set())
    if isinstance(result, dict):
        return result
    # Only reachable for a Mapping whose iteration failed; keep the contract.
    return {"payload": result}


@traces(SWR.SWR_2702)
def build_tool_payload(
    *,
    event: str,
    tool_name: str,
    arguments: Mapping[str, Any],
    session_id: str,
    workspace: Path,
    command: str = "",
    result: Any = None,
) -> dict[str, Any]:
    """Describe one tool call for a ``pre_tool`` or ``post_tool`` hook.

    Always carries ``event``, ``tool_name``, ``arguments``, ``session_id``,
    ``workspace`` and ``command`` — ``command`` is ``""`` for a tool that is not
    shell-shaped, so a hook can read the key unconditionally.  ``result`` is
    present only when the caller supplies one, which in practice means only on
    ``post_tool``.
    """
    payload: dict[str, Any] = {
        "event": event,
        "tool_name": tool_name,
        "arguments": arguments,
        "session_id": session_id,
        "workspace": str(workspace),
        "command": command,
    }
    if result is not None:
        payload["result"] = result
    return redact_payload(payload)


@traces(SWR.SWR_2703)
def build_lifecycle_payload(
    *,
    event: str,
    session_id: str,
    workspace: Path,
    **fields: Any,
) -> dict[str, Any]:
    """Describe one lifecycle occurrence for a hook attached to *event*.

    The event's own data — a child report summary, a verifier verdict, an
    iteration number — is passed as keyword arguments and lands at the top level
    beside the three fixed keys.  Callers forwarding a dict they did not build
    themselves must drop :data:`RESERVED_LIFECYCLE_FIELDS` from it first.
    """
    payload: dict[str, Any] = {
        "event": event,
        "session_id": session_id,
        "workspace": str(workspace),
    }
    payload.update(fields)
    return redact_payload(payload)
