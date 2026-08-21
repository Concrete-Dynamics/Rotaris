"""Trust gate for workspace-declared lifecycle hooks (SWR-2701).

Hooks are shell commands declared in configuration, and the most specific config
layer — ``<workspace>/.rotaris/agents.yaml`` — is an ordinary file inside a
repository, so it travels with a clone. Without a gate, cloning a repository and
opening it in Rotaris would run whatever the repository's author wrote, with no
user action beyond opening the project. That is remote code execution.

The gate:

* Hooks stamped ``source="global"`` (``~/.config/rotaris/``) and
  ``source="default"`` (the built-in :data:`DEFAULT_CONFIG`) always run — the
  user wrote those on their own machine.
* Hooks stamped ``source="workspace"`` run only after an explicit verdict
  recorded for *that* workspace and *that exact hook set*. Changing, adding,
  removing or reordering a workspace hook invalidates the verdict.
* Anything else — a source value this module does not recognise — is treated as
  untrusted and blocked. There is no "unknown means fine" branch.
* Until a verdict exists, workspace hooks are skipped and
  :func:`skipped_hooks_notice` gives the caller a sentence to show the user.

Known and intended property of the trust model
----------------------------------------------
Hooks loaded through the CLI's ``--config <path>`` override are **trusted**.
That path (``rotaris_core.cli.app._load_cli_config``) feeds raw YAML into the
merge without passing through the loader's per-scope stamping, so its entries
carry no stamp and resolve as ``source="default"``. This is deliberate, not an
oversight: the user typed that path on their own command line, which is a
materially different act from opening a directory that happened to arrive
inside a clone.

This module builds the mechanism only. It renders no UI, mutates no config and
wires nothing into the run path: the desktop trust prompt, the headless notice
and the runner call into these functions.

Deliberately import-light — no ``rotaris_core.config`` import at module scope
(that drags in ``openhands.sdk`` and costs tens of seconds), so the workspace
directory name is mirrored here rather than imported; a unit test pins the two
together.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from rotaris_core.fs import atomic_write
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence

    from rotaris_core.config.schema import RotarisConfig
    from rotaris_core.hooks.models import ResolvedHook

__all__ = [
    "TRUST_FILENAME",
    "HookTrustDecision",
    "HookTrustPrompt",
    "TrustedHookSet",
    "clear_trust",
    "load_trust",
    "partition_hooks",
    "pending_trust_prompt",
    "resolve_trusted_hooks",
    "skipped_hooks_notice",
    "store_trust",
    "trusted_hooks_for_config",
    "workspace_hook_digest",
]

#: Name of the per-workspace verdict file, under ``<workspace>/.rotaris/``.
TRUST_FILENAME = "hook-trust.json"

#: Mirrors :data:`rotaris_core.config.paths.WORKSPACE_CONFIG_DIR_NAME`. Copied
#: rather than imported to keep this module free of the config package; the two
#: are pinned together by a test.
_WORKSPACE_CONFIG_DIR_NAME = ".rotaris"

#: The config file a workspace declares its hooks in, named in the user-facing
#: notice so the user knows where to look.
_WORKSPACE_CONFIG_FILE = f"{_WORKSPACE_CONFIG_DIR_NAME}/agents.yaml"

#: The one scope that needs a verdict.
_WORKSPACE_SOURCE = "workspace"

#: Scopes the user authored on their own machine; these never need a verdict.
_ALWAYS_TRUSTED_SOURCES = frozenset({"default", "global"})

#: Format version of the on-disk verdict. A file without exactly this version is
#: not understood, and "not understood" means "not trusted".
_TRUST_FILE_VERSION = 1

#: Version tag mixed into the digest input. Bumping it invalidates every stored
#: verdict on purpose, which is what you want if the reviewed fields ever change.
_DIGEST_VERSION = 1

_DIGEST_LENGTH = 64
_HEX_DIGITS = frozenset("0123456789abcdef")


@traces(SWR.SWR_2701, SWR.SWR_2815)
@dataclass(frozen=True, slots=True)
class HookTrustPrompt:
    """What the user must be shown before deciding."""

    #: Resolved workspace path, as a string, for display.
    workspace: str
    #: Digest of the hook set awaiting the verdict; pass it back to
    #: :func:`store_trust` so the verdict cannot drift from what was reviewed.
    digest: str
    #: Exactly the workspace-sourced hooks awaiting a verdict, in declaration order.
    hooks: tuple[ResolvedHook, ...]


@traces(SWR.SWR_2701, SWR.SWR_2815)
@dataclass(frozen=True, slots=True)
class HookTrustDecision:
    """A recorded verdict. A refusal is a decision, not the absence of one."""

    trusted: bool
    digest: str
    decided_at: datetime


def _resolve_workspace(workspace: Path | str) -> Path:
    """Absolute, symlink-free form of *workspace*, so ``.`` and an absolute path agree."""
    path = Path(workspace)
    try:
        return path.resolve()
    except OSError:  # pragma: no cover - only on exotic/unreachable mounts
        return path.absolute()


def _trust_path(workspace: Path | str) -> Path:
    return _resolve_workspace(workspace) / _WORKSPACE_CONFIG_DIR_NAME / TRUST_FILENAME


def _workspace_hooks(hooks: Sequence[ResolvedHook]) -> tuple[ResolvedHook, ...]:
    return tuple(hook for hook in hooks if hook.source == _WORKSPACE_SOURCE)


def _is_digest(value: object) -> bool:
    return (
        isinstance(value, str)
        and len(value) == _DIGEST_LENGTH
        and all(char in _HEX_DIGITS for char in value)
    )


@traces(SWR.SWR_2701, SWR.SWR_2815)
def workspace_hook_digest(hooks: Sequence[ResolvedHook]) -> str:
    """Fingerprint the workspace-declared hooks in *hooks*.

    Only ``source="workspace"`` entries contribute, so a change to a global hook
    never revokes a workspace verdict and a change to a workspace hook never
    survives one. Every field a reviewer would want to have seen is covered —
    the name, the event, the matcher (it decides which tool calls a hook fires
    on), the command, the timeout and whether a failure blocks — as is their
    order, because reordering ``pre_tool`` hooks changes what runs before what.

    *hooks* may be the full resolved set; the filtering happens here. An empty
    workspace hook set has an ordinary digest and is not a special case.
    """
    payload = {
        "version": _DIGEST_VERSION,
        "hooks": [
            {
                "command": hook.command,
                "event": hook.event,
                "matcher": hook.matcher,
                "name": hook.name,
                "required": bool(hook.required),
                "timeout_seconds": float(hook.timeout_seconds),
            }
            for hook in _workspace_hooks(hooks)
        ],
    }
    canonical = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


@traces(SWR.SWR_2701, SWR.SWR_2815)
def load_trust(workspace: Path | str) -> HookTrustDecision | None:
    """Return the verdict recorded for *workspace*, or ``None`` when there is none.

    Fails closed and never raises. A missing, unreadable, truncated, malformed,
    wrongly-shaped or wrongly-versioned file — or a ``.rotaris`` path that is not
    a directory at all — all read as "no verdict", which callers treat as
    untrusted. ``None`` is also what you get for a file that parses but whose
    fields do not have the expected types, so a hostile repository cannot ship a
    hand-written ``hook-trust.json`` in a shape this reader would misread.
    """
    try:
        # `ValueError` covers `UnicodeDecodeError` on a binary/truncated file.
        raw = _trust_path(workspace).read_text(encoding="utf-8")
    except (OSError, ValueError):
        return None

    try:
        data = json.loads(raw)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None

    payload: dict[str, Any] = data
    if payload.get("version") != _TRUST_FILE_VERSION:
        return None

    digest = payload.get("digest")
    trusted = payload.get("trusted")
    decided_raw = payload.get("decided_at")
    # `trusted` is checked against `bool`, not truthiness: `"trusted": 1` or
    # `"trusted": "no"` are not verdicts this writer produces, so they are not
    # verdicts this reader honours.
    if not _is_digest(digest) or not isinstance(trusted, bool):
        return None
    if not isinstance(decided_raw, str):
        return None
    try:
        decided_at = datetime.fromisoformat(decided_raw)
    except ValueError:
        return None
    if decided_at.tzinfo is None:
        decided_at = decided_at.replace(tzinfo=UTC)

    return HookTrustDecision(trusted=trusted, digest=str(digest), decided_at=decided_at)


@traces(SWR.SWR_2701, SWR.SWR_2815)
def store_trust(workspace: Path | str, *, digest: str, trusted: bool) -> HookTrustDecision:
    """Record a verdict for *workspace* against *digest*, atomically.

    Raises rather than swallowing a failed write. A caller that believes it
    recorded trust but did not merely re-prompts, which is safe; a caller that
    believes it recorded a *refusal* but did not would keep running hooks the
    user just rejected. Since this is driven by a deliberate user action and not
    a hot loop, the write failure is the caller's to surface.

    :raises ValueError: *digest* is not a hex SHA-256 digest.
    :raises OSError: the workspace state directory or the file cannot be written.
    """
    if not _is_digest(digest):
        raise ValueError(f"Not a hook-set digest: {digest!r}")

    decided_at = datetime.now(UTC)
    path = _trust_path(workspace)
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write(
        path,
        json.dumps(
            {
                "version": _TRUST_FILE_VERSION,
                "digest": digest,
                "trusted": trusted,
                "decided_at": decided_at.isoformat(),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
    )
    return HookTrustDecision(trusted=trusted, digest=digest, decided_at=decided_at)


@traces(SWR.SWR_2701, SWR.SWR_2815)
def clear_trust(workspace: Path | str) -> None:
    """Forget the verdict recorded for *workspace*, so the next run re-prompts.

    A missing file is not an error. Any other failure to remove the file *is*
    raised: silently leaving a stale "trusted" verdict in place after the user
    asked to revoke it would fail open.
    """
    _trust_path(workspace).unlink(missing_ok=True)


@traces(SWR.SWR_2701, SWR.SWR_2815)
def pending_trust_prompt(
    workspace: Path | str,
    hooks: Sequence[ResolvedHook],
) -> HookTrustPrompt | None:
    """The review the user still owes for *workspace*, or ``None`` if none is due.

    ``None`` when the workspace declares no hooks at all, and ``None`` when a
    stored decision already covers the current hook set — *including a stored
    refusal*. Re-asking on every run would train the user to click the dialog
    away, so a refusal sticks until the hook set itself changes.
    """
    workspace_hooks = _workspace_hooks(hooks)
    if not workspace_hooks:
        return None

    digest = workspace_hook_digest(workspace_hooks)
    decision = load_trust(workspace)
    if decision is not None and decision.digest == digest:
        return None
    return HookTrustPrompt(
        workspace=str(_resolve_workspace(workspace)),
        digest=digest,
        hooks=workspace_hooks,
    )


@traces(SWR.SWR_2701, SWR.SWR_2815)
def partition_hooks(
    workspace: Path | str,
    hooks: Sequence[ResolvedHook],
) -> tuple[tuple[ResolvedHook, ...], tuple[ResolvedHook, ...]]:
    """Split *hooks* into ``(allowed, blocked)`` for *workspace*.

    Global and default hooks are always allowed. Workspace hooks are allowed
    only when the stored verdict is trust *and* its digest matches the hook set
    passed in; any other scope value is blocked. Declaration order is preserved
    within both tuples.

    The digest is taken from the very sequence being partitioned, so what the
    runner is cleared to execute is exactly what was fingerprinted — there is no
    window in which the config is re-read between the check and the run. Callers
    must therefore pass the in-memory resolved hook set, never a fresh load.
    """
    workspace_hooks = _workspace_hooks(hooks)
    workspace_trusted = False
    if workspace_hooks:
        # Only touch the disk when there is actually something to gate.
        decision = load_trust(workspace)
        workspace_trusted = (
            decision is not None
            and decision.trusted
            and decision.digest == workspace_hook_digest(workspace_hooks)
        )

    allowed: list[ResolvedHook] = []
    blocked: list[ResolvedHook] = []
    for hook in hooks:
        # An unrecognised scope falls through to `blocked`: there is no branch
        # here that treats "I don't know where this came from" as safe.
        user_authored = hook.source in _ALWAYS_TRUSTED_SOURCES
        reviewed = hook.source == _WORKSPACE_SOURCE and workspace_trusted
        if user_authored or reviewed:
            allowed.append(hook)
        else:
            blocked.append(hook)
    return tuple(allowed), tuple(blocked)


@traces(SWR.SWR_2701, SWR.SWR_2815)
def skipped_hooks_notice(blocked: Sequence[ResolvedHook]) -> str:
    """One sentence telling the user which hooks did not run, and why.

    Empty string when nothing was blocked. Deliberately reports only the count
    and the config file: hook names and commands are authored by whoever wrote
    the repository, and a notice printed into a terminal is the wrong place to
    render text the user has not agreed to look at. The full list belongs in the
    review prompt, which the user opened on purpose.
    """
    count = len(blocked)
    if count == 0:
        return ""
    noun = "hook" if count == 1 else "hooks"
    return (
        f"Skipped {count} {noun} declared by this workspace's "
        f"{_WORKSPACE_CONFIG_FILE}: workspace hooks run shell commands and this "
        f"workspace has not been reviewed and trusted yet. Review the hooks in "
        f"Rotaris to allow them to run."
    )


@traces(SWR.SWR_2815, SWR.SWR_2816)
@dataclass(frozen=True, slots=True)
class TrustedHookSet:
    """The hooks a run may actually execute, and what it had to do to get there."""

    #: Everything that runs, in declaration order: reviewed hooks plus anything
    #: reinstated from a lower scope.
    allowed: tuple[ResolvedHook, ...]
    #: Workspace hooks held back for want of a trust verdict.
    blocked: tuple[ResolvedHook, ...]
    #: Lower-scope hooks put back because the workspace list that replaced them
    #: was not trusted. Empty in the ordinary case.
    restored: tuple[ResolvedHook, ...]
    #: User-facing sentence, or ``""`` when nothing needs saying.
    notice: str


@traces(SWR.SWR_2701, SWR.SWR_2815, SWR.SWR_2816)
def resolve_trusted_hooks(
    workspace: Path | str,
    hooks: Sequence[ResolvedHook],
    *,
    superseded: Sequence[ResolvedHook] = (),
) -> TrustedHookSet:
    """Apply the trust gate, falling back to the hooks a workspace list replaced.

    :func:`partition_hooks` on its own leaves a gap. A workspace hook list
    *replaces* the inherited one (SWR-2701), so a repository that declares any
    list at all removes the user's global hooks from the config — and the trust
    gate then blocks the repository's own hooks for want of a verdict. The
    attacker gets no code execution, but the user silently loses the guardrails
    they wrote for themselves, without ever being asked.

    So when workspace hooks are refused, the entries they superseded come back.
    Only non-workspace entries are reinstated: a workspace list cannot smuggle
    itself in through the fallback path.
    """
    allowed, blocked = partition_hooks(workspace, hooks)
    if not blocked:
        return TrustedHookSet(allowed=allowed, blocked=(), restored=(), notice="")

    known = {hook.hook_id for hook in allowed}
    restored = tuple(
        hook
        for hook in superseded
        if hook.source in _ALWAYS_TRUSTED_SOURCES and hook.hook_id not in known
    )
    notice = skipped_hooks_notice(blocked)
    if restored:
        noun = "hook" if len(restored) == 1 else "hooks"
        notice = (
            f"{notice} Your own {len(restored)} configured {noun} still "
            f"{'runs' if len(restored) == 1 else 'run'}."
        )
    return TrustedHookSet(
        allowed=(*allowed, *restored),
        blocked=blocked,
        restored=restored,
        notice=notice,
    )


@traces(SWR.SWR_2701, SWR.SWR_2815, SWR.SWR_2816)
def trusted_hooks_for_config(config: RotarisConfig, workspace: Path | str) -> TrustedHookSet:
    """:func:`resolve_trusted_hooks` for a loaded config — what run hosts call."""
    from rotaris_core.hooks.models import resolve_hooks, superseded_hooks

    return resolve_trusted_hooks(
        workspace,
        resolve_hooks(config),
        superseded=superseded_hooks(config),
    )
