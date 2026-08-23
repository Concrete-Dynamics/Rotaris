"""User-defined lifecycle hooks (SWR-2700 epic).

Import from this package, not from its modules: the split between ``models``,
``payload``, ``runner``, ``registry``, ``trust`` and ``observer`` is an
implementation detail, and every name a caller needs is re-exported here.

Reading order, for a caller wiring hooks into a new host:

1. :func:`resolve_hooks` flattens a loaded config into :class:`ResolvedHook`
   entries, and :func:`superseded_hooks` returns the ones a higher scope
   replaced (SWR-2701).
2. :func:`trusted_hooks_for_config` applies the workspace trust gate to both and
   returns the :class:`TrustedHookSet` a run may actually execute — never use
   :func:`resolve_hooks` on its own to build a runner, because a workspace's
   ``.rotaris/agents.yaml`` travels inside a clone.
3. :class:`HookRunner` executes them, and :func:`register_hook_runner` publishes
   it under the session id so the tool-dispatch gate can find it (SWR-2702).
4. :class:`HookLifecycleObserver` bridges the Ralph observer seam onto the
   runner's lifecycle events (SWR-2703).

**Deliberately import-light.**  ``rotaris_core.hooks`` is imported on an agent's
hot path — ``safe_agent`` resolves a runner on every allowed tool call, and
``run_host`` builds one before the first agent exists — so importing this
package must not drag in the agent SDK.  Everything above except
:class:`HookLifecycleObserver` is a leaf that costs milliseconds.  The observer
subclasses ``rotaris_core.ralph.iteration_observer``, whose package
``__init__`` executes the Ralph loop and with it ``openhands.sdk`` (tens of
seconds), so it is served through a module ``__getattr__`` (PEP 562), exactly as
``rotaris_core.events`` serves its own observers: the name still imports, and it
is only paid for by a caller that actually wants to run one.
"""

from typing import TYPE_CHECKING, Any

from rotaris_core.hooks.external import (
    CLAUDE_CODE_AGENT_ID,
    ROTARIS_AGENT_ID,
    ExternalHookPolicy,
    ExternalHookPolicyStore,
    ExternalHookRecord,
    claude_settings_path,
    discover_claude_code_hooks,
    enabled_external_hooks,
    policy_path,
)
from rotaris_core.hooks.models import (
    DEFAULT_HOOK_TIMEOUT_SECONDS,
    HOOK_EVENTS,
    HOOK_FAILURE_DISABLE_THRESHOLD,
    HOOK_SOURCES,
    LIFECYCLE_HOOK_EVENTS,
    MAX_HOOK_OUTPUT_BYTES,
    TOOL_HOOK_EVENTS,
    ResolvedHook,
    hooks_for_event,
    matches_tool,
    resolve_hooks,
    superseded_hooks,
)
from rotaris_core.hooks.payload import (
    RESERVED_LIFECYCLE_FIELDS,
    build_lifecycle_payload,
    build_tool_payload,
    redact_payload,
)
from rotaris_core.hooks.registry import (
    discard_hook_runner,
    register_hook_runner,
    reset_hook_registry,
    resolve_hook_runner,
)
from rotaris_core.hooks.runner import HookOutcome, HookRunner
from rotaris_core.hooks.trust import (
    TRUST_FILENAME,
    HookTrustDecision,
    HookTrustPrompt,
    TrustedHookSet,
    clear_trust,
    load_trust,
    partition_hooks,
    pending_trust_prompt,
    resolve_trusted_hooks,
    skipped_hooks_notice,
    store_trust,
    trusted_hooks_for_config,
    workspace_hook_digest,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.hooks.observer import HookLifecycleObserver

#: Names served lazily by :func:`__getattr__`; see the module docstring.
_LAZY_EXPORTS = frozenset({"HookLifecycleObserver"})


@traces(SWR.SWR_2701, SWR.SWR_2702, SWR.SWR_2703, SWR.SWR_2704)
def __getattr__(name: str) -> Any:
    """Resolve the SDK-heavy observer export on first use, not on import."""
    if name in _LAZY_EXPORTS:
        from rotaris_core.hooks import observer

        return getattr(observer, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "DEFAULT_HOOK_TIMEOUT_SECONDS",
    "CLAUDE_CODE_AGENT_ID",
    "ExternalHookPolicy",
    "ExternalHookPolicyStore",
    "ExternalHookRecord",
    "HOOK_EVENTS",
    "HOOK_FAILURE_DISABLE_THRESHOLD",
    "HOOK_SOURCES",
    "LIFECYCLE_HOOK_EVENTS",
    "MAX_HOOK_OUTPUT_BYTES",
    "RESERVED_LIFECYCLE_FIELDS",
    "ROTARIS_AGENT_ID",
    "TOOL_HOOK_EVENTS",
    "TRUST_FILENAME",
    "HookLifecycleObserver",
    "HookOutcome",
    "HookRunner",
    "HookTrustDecision",
    "HookTrustPrompt",
    "ResolvedHook",
    "TrustedHookSet",
    "build_lifecycle_payload",
    "build_tool_payload",
    "clear_trust",
    "claude_settings_path",
    "discard_hook_runner",
    "discover_claude_code_hooks",
    "enabled_external_hooks",
    "hooks_for_event",
    "load_trust",
    "matches_tool",
    "partition_hooks",
    "pending_trust_prompt",
    "policy_path",
    "redact_payload",
    "register_hook_runner",
    "reset_hook_registry",
    "resolve_hook_runner",
    "resolve_hooks",
    "resolve_trusted_hooks",
    "skipped_hooks_notice",
    "store_trust",
    "superseded_hooks",
    "trusted_hooks_for_config",
    "workspace_hook_digest",
]
