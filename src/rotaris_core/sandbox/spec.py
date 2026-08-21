"""Platform-independent description of the terminal sandbox (SWR-2507).

Rotaris sandboxes terminal commands the way Codex CLI and Claude Code do: an
OS-level sandbox applied *per command* — Apple Seatbelt on macOS, bubblewrap on
Linux/WSL2 — rather than a container.  This module owns the value objects that
say *what* the sandbox must permit; :mod:`rotaris_core.sandbox.backends` turns
one of them into a concrete Seatbelt profile or ``bwrap`` argv.

Deliberately stdlib-only and config-agnostic.  The terminal tool consults this
on every command, and importing :mod:`rotaris_core.config` here would drag the
OpenHands SDK (~12s of import) into that path.  Callers build a
:class:`SandboxSpec` from config; this package never reads config itself.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from pathlib import Path
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Iterable

#: Workspace-relative paths that stay read-only even while the workspace itself
#: is writable.  Codex CLI carves these out deliberately and Rotaris keeps the
#: same protection: an agent that can rewrite ``.git`` can install a hook that
#: later runs *outside* the sandbox, and an agent that can rewrite ``.rotaris``
#: can turn its own sandbox off or widen its own writable roots.  Neither is a
#: change a sandbox may permit, so this carve-out is not configurable.
PROTECTED_SUBPATHS: tuple[str, ...] = (".git", ".rotaris")


@traces(SWR.SWR_2507)
class SandboxMode(StrEnum):
    """How much of the filesystem a sandboxed command may write."""

    #: No sandbox at all; commands run directly on the host.
    OFF = "off"
    #: The workspace (plus any extra writable roots) is writable, the rest of
    #: the filesystem is readable but not writable.
    WORKSPACE_WRITE = "workspace-write"
    #: Nothing is writable except the temporary directory.
    READ_ONLY = "read-only"


def _dedupe(paths: Iterable[Path]) -> tuple[Path, ...]:
    """Drop repeats while keeping first-seen order (rule order is meaningful)."""
    seen: dict[Path, None] = {}
    for path in paths:
        seen.setdefault(path, None)
    return tuple(seen)


@traces(SWR.SWR_2507)
@dataclass(frozen=True, slots=True)
class SandboxSpec:
    """What a sandboxed command may read, write and reach.

    Backend-neutral on purpose: the same spec renders to a Seatbelt profile and
    to a ``bwrap`` argv, so a policy decision is made once and enforced the same
    way on every supported host.
    """

    #: Requested mode; :attr:`SandboxMode.OFF` makes every backend a passthrough.
    mode: SandboxMode
    #: The workspace (or its SWR-2404 worktree); writable in ``workspace-write``.
    workspace_root: Path
    #: Extra writable roots *beyond* :attr:`workspace_root`.
    writable_roots: tuple[Path, ...] = ()
    #: Paths carved back *out* of the writable roots; see :data:`PROTECTED_SUBPATHS`.
    readonly_subpaths: tuple[Path, ...] = ()
    #: Default is no network, per SWR-2507; only an explicit policy opens it.
    allow_network: bool = False

    @classmethod
    def for_workspace(
        cls,
        workspace_root: Path | str,
        *,
        mode: SandboxMode,
        writable_roots: Iterable[Path | str] = (),
        allow_network: bool = False,
    ) -> SandboxSpec:
        """Build a spec for *workspace_root* with the standard carve-outs applied.

        Every path is resolved so the backends emit absolute, normalized
        literals, and :data:`PROTECTED_SUBPATHS` is always denied — a caller
        cannot forget the ``.git`` / ``.rotaris`` protection by construction.

        Raises :class:`ValueError` when a writable root is not absolute: a
        relative root would silently resolve against whatever the current
        working directory happens to be, which is not a sandbox boundary anyone
        can reason about.
        """
        root = Path(workspace_root).resolve()
        extra: list[Path] = []
        for entry in writable_roots:
            candidate = Path(entry)
            if not candidate.is_absolute():
                raise ValueError(
                    f"Sandbox writable root {str(entry)!r} is not an absolute path. "
                    "Writable roots must be absolute so the sandbox boundary does "
                    "not depend on the current working directory."
                )
            extra.append(candidate.resolve())
        # Joined onto the already-resolved root rather than resolved again: a
        # ``.git`` symlink (or the ``.git`` *file* of a worktree) must be denied
        # at the name the command will use, not at its target.
        readonly = tuple(root / name for name in PROTECTED_SUBPATHS)
        return cls(
            mode=mode,
            workspace_root=root,
            writable_roots=_dedupe(extra),
            readonly_subpaths=readonly,
            allow_network=allow_network,
        )

    def effective_writable_roots(self) -> tuple[Path, ...]:
        """The roots a backend should make writable, workspace first.

        Empty for :attr:`SandboxMode.READ_ONLY` (only the temporary directory
        stays writable, which every backend grants unconditionally) and for
        :attr:`SandboxMode.OFF` (nothing is rendered at all).
        """
        if self.mode is SandboxMode.OFF or self.mode is SandboxMode.READ_ONLY:
            return ()
        return _dedupe([self.workspace_root, *self.writable_roots])


@traces(SWR.SWR_2507)
@dataclass(frozen=True, slots=True)
class SandboxAvailability:
    """Whether an OS-level sandbox can be used on this host, and why not.

    Carries the remediation with the verdict so every surface — GUI status,
    CLI error, log line — tells the user the same actionable thing.
    """

    available: bool
    #: ``"seatbelt"`` | ``"bubblewrap"`` | ``"unavailable"``.
    backend: str
    #: Why the sandbox is unavailable; empty when :attr:`available` is ``True``.
    reason: str = ""
    #: What the user should do about it; empty when :attr:`available` is ``True``.
    remediation: str = ""


def _render_unavailable(availability: SandboxAvailability) -> str:
    """Reason and remediation on separate lines, for logs and dialogs alike."""
    lines = [availability.reason or "The OS-level sandbox is unavailable on this host."]
    if availability.remediation:
        lines.append(availability.remediation)
    return "\n".join(lines)


@traces(SWR.SWR_2507)
class SandboxUnavailableError(RuntimeError):
    """Raised instead of running a command unsandboxed.

    SWR-2507 forbids silently falling back to the host shell when the sandbox
    is unavailable or fails to start.  Every backend raises this rather than
    returning an unwrapped command, so the fallback is not reachable by
    accident — a caller has to catch this and decide, visibly, what to do.
    """

    def __init__(self, availability: SandboxAvailability) -> None:
        self.availability = availability
        super().__init__(_render_unavailable(availability))

    def __str__(self) -> str:
        return _render_unavailable(self.availability)
