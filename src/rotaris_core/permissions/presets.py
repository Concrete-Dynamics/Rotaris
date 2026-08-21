"""Named permission mode presets (SWR-2503).

Each preset supplies the ``default_decision`` and ``preset_name`` the engine
(SWR-2501) falls back to once no rule matches, filling in the seam
``ALLOW_ALL_POLICY`` deliberately left open.

Three rule families compose into each preset, in this order, because the engine
resolves first-match-wins and a rule placed after a broader one is dead code:

1. **Network egress for the ``fetch`` tool (SWR-2505).** These must sit ahead of
   the blanket ``read-only-tool`` allow — ``fetch`` is in
   :data:`~.tool_classes.READ_ONLY_TOOLS` and would otherwise be allowed to
   contact any host in every mode.
2. **Destructive command patterns (SWR-2502).** :data:`DESTRUCTIVE_COMMAND_RULES`
   was exported but never referenced, so none of its nine starter rules was
   active in any mode: no preset actually blocked ``rm -rf``, ``sudo`` or a
   force-push.  All nine are wired into ``restricted`` and ``ask`` here.  Note
   what that means for ``restricted``, whose default is ``deny``: the four
   ``ask`` rules *loosen* it from a flat deny to a prompt for those named
   categories (a dependency install, a history rewrite, a command that cannot be
   read statically, container control).  That is the intended reading — a
   restricted run should be able to ask rather than be unable to proceed — but
   it is a behaviour change, not a no-op.
3. **Network-reaching terminal commands (SWR-2505).** Classified so a mode can
   gate them separately from local commands.  Both rules are decision-neutral
   against their preset's default (``deny`` in ``restricted``, ``ask`` in
   ``ask``); their value is the named rule id in the refusal and in the audit
   log.

``autonomous`` keeps only the ``deny`` rules: an unattended run has nobody to
answer an ``ask``, so an ``ask`` rule there would resolve fail-safe to deny and
turn the permissive mode into the strict one by accident.  Its
``default_decision`` stays ``ALLOW`` — ``modes.resolve_effective_mode``
(SWR-2508) tests exactly that to decide whether a run needs the unsandboxed
downgrade.
"""

from __future__ import annotations

import logging

from rotaris_core.permissions.command_patterns import DESTRUCTIVE_COMMAND_RULES
from rotaris_core.permissions.engine import Decision, PermissionPolicy, PermissionRule
from rotaris_core.permissions.network import network_command_matcher, remote_url_matcher
from rotaris_core.permissions.tool_classes import NETWORK_TOOLS, READ_ONLY_TOOLS
from rotaris_core.reqtocode import SWR, traces

_log = logging.getLogger(__name__)

#: The ``deny`` half of SWR-2502's starter set; the half every mode carries,
#: including ``autonomous``.
_DESTRUCTIVE_DENY_RULES: tuple[PermissionRule, ...] = tuple(
    rule for rule in DESTRUCTIVE_COMMAND_RULES if rule.decision is Decision.DENY
)


@traces(SWR.SWR_2505)
def _fetch_rules(preset: str) -> tuple[PermissionRule, ...]:
    """The two host-scoped ``fetch`` rules a supervised preset carries.

    Ordered remote-then-local and placed ahead of every other rule that could
    match ``fetch``, so the target host — not the tool's read-only class —
    decides.  ``fetch`` to this machine (a local dev server, a local docs build)
    stays allowed; anything else routes through the mode's approval path.

    The host is read off ``PermissionRequest.command``, which
    ``RotarisAgent._permission_request`` fills from the action's ``url`` for a
    tool that has no command line.  A URL that cannot be parsed counts as
    remote, so an unreadable target asks rather than slipping through.
    """
    return (
        PermissionRule(
            rule_id=f"{preset}:fetch-remote-host",
            decision=Decision.ASK,
            tools=NETWORK_TOOLS,
            matcher=remote_url_matcher(),
            description="network egress to a host outside this machine",
        ),
        PermissionRule(
            rule_id=f"{preset}:fetch-local-host",
            decision=Decision.ALLOW,
            tools=NETWORK_TOOLS,
            description="network access confined to this machine",
        ),
    )


@traces(SWR.SWR_2505)
def _network_command_rule(preset: str, decision: Decision) -> PermissionRule:
    """The classification rule for terminal commands that reach the network."""
    return PermissionRule(
        rule_id=f"{preset}:network-command",
        decision=decision,
        matcher=network_command_matcher(),
        description="terminal command that reaches the network",
    )


#: ``restricted``: mutating tools denied by default; reads outside the
#: workspace require approval; reads inside the workspace are always fine.
_RESTRICTED = PermissionPolicy(
    rules=(
        *_fetch_rules("restricted"),
        *DESTRUCTIVE_COMMAND_RULES,
        _network_command_rule("restricted", Decision.DENY),
        PermissionRule(
            rule_id="restricted:read-outside-workspace",
            decision=Decision.ASK,
            tools=READ_ONLY_TOOLS,
            path_scope="outside_workspace",
            description="Read tool targeting a path outside the workspace.",
        ),
        PermissionRule(
            rule_id="restricted:read-only-tool",
            decision=Decision.ALLOW,
            tools=READ_ONLY_TOOLS,
            description="Read-only tool.",
        ),
    ),
    default_decision=Decision.DENY,
    preset_name="restricted",
)

#: ``ask``: mutating tools require approval by default; read-only tools are
#: always allowed regardless of path — except network egress, which is gated on
#: the target host first.
_ASK = PermissionPolicy(
    rules=(
        *_fetch_rules("ask"),
        *DESTRUCTIVE_COMMAND_RULES,
        _network_command_rule("ask", Decision.ASK),
        PermissionRule(
            rule_id="ask:read-only-tool",
            decision=Decision.ALLOW,
            tools=READ_ONLY_TOOLS,
            description="Read-only tool.",
        ),
    ),
    default_decision=Decision.ASK,
    preset_name="ask",
)

#: ``autonomous``: everything is allowed by default; only the destructive
#: ``deny`` patterns bite.  Deliberately no path-scoped ``ask`` rule — the
#: module docstring explains why an ``ask`` in this preset is a bug (it
#: resolves fail-safe to deny unattended, and prompts an attended run that
#: chose not to be prompted), and it would invert the SWR-2509 ordering:
#: ``ask`` allows every read anywhere, so ``autonomous`` prompting for one
#: would make the more permissive mode the stricter one.  The workspace
#: boundary for file tools stays enforced by ``PathAuth``
#: (``runtime.allow_outside_workspace``), which errors instead of prompting.
_AUTONOMOUS = PermissionPolicy(
    rules=(*_DESTRUCTIVE_DENY_RULES,),
    default_decision=Decision.ALLOW,
    preset_name="autonomous",
)

PRESETS: dict[str, PermissionPolicy] = {
    "restricted": _RESTRICTED,
    "ask": _ASK,
    "autonomous": _AUTONOMOUS,
}

#: Safer than SWR-2501's shipped ``ALLOW_ALL_POLICY``; matches the market
#: baseline (ask before mutating).
DEFAULT_PRESET = "ask"

#: Applied when a configured mode name does not match a known preset — the
#: strictest reading, consistent with the engine's fail-closed design.
FALLBACK_PRESET = "restricted"

#: How tightly each preset confines, ascending: lower is stricter (SWR-2509).
#:
#: The order lives here, beside the presets it ranks, so that adding a preset
#: without deciding where it sits is impossible — the guard at the bottom of
#: this module refuses to import otherwise.  A comparison between two modes
#: needs a total order, and an order kept somewhere else drifts from the presets
#: silently.
PRESET_RESTRICTIVENESS: dict[str, int] = {
    "restricted": 0,
    "ask": 1,
    "autonomous": 2,
}


@traces(SWR.SWR_2503)
def resolve_preset(mode_name: str | None) -> PermissionPolicy:
    """Look up *mode_name* in :data:`PRESETS`, falling back strictest-first.

    ``None`` or an empty string resolves to :data:`DEFAULT_PRESET`; any other
    unrecognized name resolves to :data:`FALLBACK_PRESET`. Never raises.
    """
    if not mode_name:
        return PRESETS[DEFAULT_PRESET]
    preset = PRESETS.get(mode_name)
    if preset is None:
        _log.warning(
            "Unknown permission mode %r; falling back to the strictest preset (%r).",
            mode_name,
            FALLBACK_PRESET,
        )
        return PRESETS[FALLBACK_PRESET]
    return preset


@traces(SWR.SWR_2509)
def restrictiveness_rank(mode_name: str | None) -> int:
    """Rank *mode_name* on :data:`PRESET_RESTRICTIVENESS`; lower confines more.

    Resolves names exactly the way :func:`resolve_preset` does — empty to
    :data:`DEFAULT_PRESET`, anything unrecognized to :data:`FALLBACK_PRESET` —
    because a mode's rank has to describe the policy it will actually get, not
    the string somebody wrote in a config file.  Ranking an unknown name as
    anything but the strictest would let a name nobody can resolve stand as
    evidence that loosening is safe.  Silent here rather than warning, unlike
    ``resolve_preset``: this is called once per pinned engine on every mode
    change, and the same unknown name would be reported over and over.
    """
    if not mode_name:
        return PRESET_RESTRICTIVENESS[DEFAULT_PRESET]
    return PRESET_RESTRICTIVENESS.get(mode_name, PRESET_RESTRICTIVENESS[FALLBACK_PRESET])


for _policy in PRESETS.values():
    _policy.validate()

_unranked = set(PRESETS) - set(PRESET_RESTRICTIVENESS)
if _unranked:  # pragma: no cover - import-time guard, unreachable once satisfied
    raise RuntimeError(
        f"Permission presets without a restrictiveness rank: {sorted(_unranked)}. "
        "SWR-2509 compares modes to decide whether a session change may reach a "
        "persona-pinned agent; an unranked preset would make that comparison "
        "arbitrary. Add it to PRESET_RESTRICTIVENESS."
    )
