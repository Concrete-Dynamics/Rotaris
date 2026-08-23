"""Effective permission mode for unsandboxed autonomous runs (SWR-2508).

``autonomous`` (SWR-2503) is allow-by-default inside the workspace, which on a
host without the OS-level sandbox (SWR-2507) means an unattended run holds
unrestricted shell access.  That configuration must never be reached silently:
without a sandbox and without an explicit per-workspace opt-in
(``runtime.allow_unsandboxed_autonomous``), an unattended run is downgraded to
``ask``.

"Unattended" is decided by the session's approval host (SWR-2504): a session
whose host can present a prompt has a human who can answer it, so it keeps the
mode it asked for.  Everything else — CLI ``--background``, headless, and the
TUI, which registers no approval host — takes the downgrade.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from threading import RLock
from typing import TYPE_CHECKING, Any

from rotaris_core.permissions.engine import Decision
from rotaris_core.permissions.presets import (
    DEFAULT_PRESET,
    resolve_preset,
    restrictiveness_rank,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.session.state import SessionState

_log = logging.getLogger(__name__)

_overrides_lock = RLock()
_overrides: dict[str, str] = {}

#: The mode an unsandboxed unattended run falls back to.  ``ask`` is the
#: weakest mode the requirement permits ("ask or stricter"); in a headless host
#: it resolves further to deny via ``runtime.headless_approval_policy``.
DOWNGRADE_TARGET = "ask"


@traces(SWR.SWR_2508)
@dataclass(frozen=True)
class EffectiveMode:
    """The permission mode a run actually gets, and why."""

    #: Preset name applied to the policy engine.
    mode: str
    #: Preset name the config/persona asked for.
    requested: str
    downgraded: bool = False
    #: User-facing explanation; empty when nothing was downgraded.
    reason: str = ""
    #: Personas a mid-session change did *not* reach because their pin is
    #: stricter than the mode asked for (SWR-2509).  Sorted, so a caller can
    #: render it without deciding an order.  Empty for every resolution that is
    #: not a mid-session change, and empty when the change reached everything —
    #: "applied everywhere" and "applied except to these" are different facts
    #: and a confirmation must never be broader than what happened.
    skipped_personas: tuple[str, ...] = ()


@traces(SWR.SWR_2507, SWR.SWR_2508)
def sandbox_active(config: RotarisConfig) -> bool:
    """Whether terminal execution really runs inside the OS-level sandbox.

    *Configured and available*, never merely configured.  ``config`` is the
    run's own config object — the per-session copy the run was started with, the
    same object the SWR-2404 worktree binding is stamped onto — so a per-session
    sandbox toggle reaches this through ``runtime.sandbox_mode`` without any of
    the three call sites having to learn about sessions.

    The availability half matters more than the configuration half: returning
    ``True`` for a sandbox that cannot start would lift the SWR-2508 downgrade
    while the commands of an unattended autonomous run execute directly on the
    host — precisely the combination SWR-2508 exists to prevent.  A configured
    sandbox that cannot start yields ``False`` here *and* refuses to run any
    command in the terminal tool, so the run is restricted, not silently freed.
    """
    from rotaris_core.sandbox.session import sandbox_status

    active, _backend = sandbox_status(config)
    return active


@traces(SWR.SWR_2508)
def resolve_effective_mode(
    requested: str | None,
    *,
    interactive: bool,
    sandboxed: bool,
    opt_in: bool,
) -> EffectiveMode:
    """Resolve *requested* into the mode this run may actually use.

    A permissive mode (one whose preset allows by default — ``autonomous``
    today) is downgraded to :data:`DOWNGRADE_TARGET` when the run is unattended,
    unsandboxed and not opted in.  ``ask`` and ``restricted`` pass through
    untouched; an unrecognized name has already resolved to the strictest preset
    and is therefore never downgraded.  Never raises.
    """
    policy = resolve_preset(requested)
    resolved_name = policy.preset_name or (requested or DEFAULT_PRESET)
    if policy.default_decision is not Decision.ALLOW:
        return EffectiveMode(mode=resolved_name, requested=resolved_name)
    if interactive or sandboxed or opt_in:
        return EffectiveMode(mode=resolved_name, requested=resolved_name)
    return EffectiveMode(
        mode=DOWNGRADE_TARGET,
        requested=resolved_name,
        downgraded=True,
        reason=(
            f"Permission mode '{resolved_name}' was downgraded to "
            f"'{DOWNGRADE_TARGET}' for this run: it is unattended (no interactive "
            "approval available) and runs without the OS-level sandbox. Set "
            "runtime.allow_unsandboxed_autonomous: true in the workspace config "
            f"to run unattended in '{resolved_name}' mode anyway."
        ),
    )


@traces(SWR.SWR_2508)
def unattended_run_refusal(config: RotarisConfig) -> str:
    """Why an unattended run in this workspace would lose its tools, or ``""``.

    Asked *before* a run starts, by every surface that launches one without an
    approval UI — a requirement flow released from the board, the headless
    requirement command. It exists because the alternative was discovered the
    expensive way: a workspace on the default ``ask`` mode released a
    requirement, the agent's every unmatched tool call was answered by
    :func:`~rotaris_core.permissions.approval.ApprovalCoordinator._headless_decision`,
    and the run "succeeded" having done nothing at all.

    ``""`` for a workspace whose unattended runs can actually act — one that is
    sandboxed, or has opted in to unsandboxed autonomy. Otherwise a sentence
    naming the three settings that resolve it, so what a caller shows is a
    repair instruction rather than a verdict.

    A *sentence*, not a decision: ``ask`` is the shipped default
    (``runtime.permission_mode``), so a caller that turned this into a refusal
    would refuse every release in every workspace nobody has configured. Both
    callers state it and continue — the board on the release it accepts, the
    headless command on its progress channel — and the run itself is what
    reports the consequence, through
    :func:`~rotaris_core.requirements.execution.cli_host.tools_confiscated`.

    Deliberately not a check on *rules*: an ``ask`` workspace still allows
    whatever its read-only rules allow, so this is not "nothing will work". It
    is "everything that changes anything will be denied", which for a run whose
    whole purpose is to change something is the same thing.
    """
    from rotaris_core.permissions.presets import resolve_preset

    effective = resolve_effective_mode(
        requested_permission_mode(config),
        interactive=False,
        sandboxed=sandbox_active(config),
        opt_in=config.runtime.allow_unsandboxed_autonomous,
    )
    if resolve_preset(effective.mode).default_decision is Decision.ALLOW:
        return ""
    downgraded = (
        f" — '{effective.requested}' was downgraded because this run is unattended and unsandboxed"
        if effective.downgraded
        else ""
    )
    return (
        f"an unattended run under permission mode '{effective.mode}'{downgraded} would have"
        " every tool call denied, because nothing can answer an approval prompt in a"
        " requirement run. Set runtime.permission_mode: autonomous with"
        " runtime.allow_unsandboxed_autonomous: true, or turn on runtime.sandbox_mode,"
        " before releasing work"
    )


@traces(SWR.SWR_2503)
def set_session_mode_override(session_id: str, mode: str) -> None:
    """Record the mode a running session was switched to (SWR-2503).

    Stores the *requested* name, not the effective one: every agent built later
    re-resolves the SWR-2508 downgrade for its own context, which may differ
    from the context of the agent that was live when the user switched.
    """
    if not session_id:
        raise ValueError("A session mode override needs a non-empty session id.")
    with _overrides_lock:
        _overrides[session_id] = mode


@traces(SWR.SWR_2503)
def session_mode_override(session_id: str | None) -> str | None:
    """The mode *session_id* was switched to mid-run, or ``None``.

    Never falls back to another session's override: one run's mode change must
    not leak into a concurrent run.
    """
    if not session_id:
        return None
    with _overrides_lock:
        return _overrides.get(session_id)


@traces(SWR.SWR_2503)
def discard_session_mode_override(session_id: str | None) -> None:
    """Forget *session_id*'s override once its run is over.

    Without this a resumed session would silently inherit the mode a previous
    run of the same id was switched to, rather than the mode its config asks for.
    """
    if not session_id:
        return
    with _overrides_lock:
        _overrides.pop(session_id, None)


@traces(SWR.SWR_2503)
def reset_session_mode_overrides() -> None:
    """Clear every override (test isolation and full-process shutdown)."""
    with _overrides_lock:
        _overrides.clear()


@traces(SWR.SWR_2503, SWR.SWR_2506, SWR.SWR_2508)
def change_session_permission_mode(
    session_id: str,
    requested: str,
    *,
    config: RotarisConfig,
) -> EffectiveMode:
    """Switch a running session to *requested*, from the next tool dispatch on.

    Two halves, because a run has two kinds of agent: the ones already built and
    the ones still to come.  Live engines get the new preset through
    :meth:`PermissionEngine.set_policy`, which re-reads nothing eagerly, so the
    next dispatch of each sees the new rules; a session override records the
    choice for agents built afterwards — the next Ralph iteration's entry agent,
    any new child — which read it in ``_build_permission_engine``.

    The switch is re-resolved through SWR-2508 against the session's approval
    host, so asking for a permissive mode on an unattended, unsandboxed run is
    downgraded here exactly as it would be at run start.

    A persona pin outranks the selector **only in the widening direction**
    (SWR-2509).  A pin is a decision not to hand that persona more than a
    certain amount of rope; it is not a decision to keep it running permissively
    while the user is trying to rein the session in.  So a change that is at
    least as restrictive as the pin reaches the engine, and only a change that
    would loosen it is skipped — and whatever was skipped comes back in
    :attr:`EffectiveMode.skipped_personas` and lands in the audit entry, so the
    confirmation the user sees is never broader than what actually happened.

    Records the change in the session's audit log (SWR-2506).  Never raises —
    a failed audit write must not cost the user their mode change.
    """
    from rotaris_core.permissions.approval import resolve_approval_host
    from rotaris_core.permissions.registry import engines_for_session

    host = resolve_approval_host(session_id)
    effective = resolve_effective_mode(
        requested,
        interactive=host is not None and host.interactive,
        sandboxed=sandbox_active(config),
        opt_in=config.runtime.allow_unsandboxed_autonomous,
    )
    previous = session_mode_override(session_id) or requested_permission_mode(config)
    set_session_mode_override(session_id, requested)

    policy = resolve_preset(effective.mode)
    # Compare against what is actually being applied, not what was asked for:
    # ``requested`` may have been downgraded a few lines above, and a pin should
    # be measured against the rope the engine will really get.
    applied_rank = restrictiveness_rank(effective.mode)
    pinned = {
        name: persona.permission_mode
        for name, persona in config.personas.items()
        if persona.permission_mode
    }
    skipped: set[str] = set()
    for engine in engines_for_session(session_id).values():
        pin = pinned.get(engine.persona) if engine.persona else None
        if pin is not None and applied_rank > restrictiveness_rank(pin):
            skipped.add(engine.persona)
            continue
        engine.set_policy(policy)

    effective = replace(effective, skipped_personas=tuple(sorted(skipped)))
    if effective.downgraded:
        _log.warning("%s (session %s)", effective.reason, session_id)
    if skipped:
        _log.info(
            "Permission mode '%s' was not applied to persona-pinned agents %s "
            "(session %s): their pin is stricter than the mode chosen.",
            effective.mode,
            sorted(skipped),
            session_id,
        )
    _audit_mode_change(session_id, effective, previous=previous)
    return effective


def _audit_mode_change(session_id: str, effective: EffectiveMode, *, previous: str) -> None:
    """Append the mode change to the session's audit log, or shrug it off."""
    from rotaris_core.permissions.audit import resolve_audit_session

    session_dir = resolve_audit_session(session_id)
    if session_dir is None:
        return
    from rotaris_core.session.diagnostics import record_permission_mode_change

    try:
        record_permission_mode_change(
            session_dir,
            session_id=session_id,
            requested_mode=effective.requested,
            effective_mode=effective.mode,
            previous_mode=previous,
            source="user",
            reason=effective.reason,
            skipped_personas=effective.skipped_personas,
        )
    except Exception:  # noqa: BLE001 - auditing must never break the change
        _log.warning("Could not audit the permission mode change for session %s.", session_id)


@traces(SWR.SWR_2508)
def requested_permission_mode(config: RotarisConfig) -> str:
    """The mode the config asks for: entry persona's override, else the runtime default."""
    default_persona = config.personas.get(config.default_persona)
    return (
        default_persona.permission_mode if default_persona else None
    ) or config.runtime.permission_mode


@traces(SWR.SWR_2507, SWR.SWR_2508)
def announce_effective_permission_mode(
    state: SessionState,
    config: RotarisConfig,
    diagnostics: Any | None = None,
) -> EffectiveMode:
    """Record the run's effective mode on *state* and make a downgrade visible.

    Called at run start, once the approval host for the session is registered —
    :meth:`SessionManager.create_session` runs before that and can only record
    the requested mode.  A downgrade lands in the transcript (rendered by both
    Rotaris and the TUI), in the diagnostics timeline, and in the log; the
    permission audit log itself arrives with SWR-2506.

    Also stamps whether this run is sandboxed (SWR-2507) onto the snapshot: the
    sandbox verdict is resolved here anyway for the downgrade, and recording the
    same value that decided the mode keeps the snapshot from ever disagreeing
    with the permissions the run actually got.
    """
    from rotaris_core.permissions.approval import resolve_approval_host
    from rotaris_core.sandbox.session import sandbox_status

    sandboxed, sandbox_backend = sandbox_status(config)
    host = resolve_approval_host(state.session_id)
    effective = resolve_effective_mode(
        requested_permission_mode(config),
        interactive=host is not None and host.interactive,
        sandboxed=sandboxed,
        opt_in=config.runtime.allow_unsandboxed_autonomous,
    )
    state.permission_mode = effective.mode
    state.sandboxed = sandboxed
    state.sandbox_backend = sandbox_backend
    if effective.downgraded:
        from rotaris_core.session.transcript import resolve_transcript_recorder

        _log.warning("%s (session %s)", effective.reason, state.session_id)
        # Through the recorder when there is one, so the notice is indexed and
        # reaches whoever is watching the run, not only whoever reloads it. A
        # bare append is the fallback for a state with no run behind it.
        recorder = resolve_transcript_recorder(state.session_id)
        if recorder is not None:
            recorder.record_system(effective.reason)
        else:
            state.transcript_events.append({"role": "system", "content": effective.reason})
        if diagnostics is not None:
            diagnostics.timeline(
                "permission_mode_downgraded",
                actor="permissions",
                message=effective.reason,
                metadata={
                    "requested_mode": effective.requested,
                    "effective_mode": effective.mode,
                },
            )
    return effective
