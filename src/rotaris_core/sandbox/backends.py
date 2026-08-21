"""Per-command OS-level sandbox backends (SWR-2507).

Two backends ship: Apple Seatbelt (``sandbox-exec``) on macOS and bubblewrap
(``bwrap``) on Linux and WSL2.  Both take the same :class:`SandboxSpec` and both
answer the same question — *what shell command string runs this command under
the sandbox?* — because both call sites carry a plain command string (the
OpenHands SDK terminal for foreground work, ``subprocess.Popen(..., shell=True)``
for background work).

Native Windows probes as unavailable and points at WSL2, which is the shipped
stance of Claude Code.  A ``WindowsRestrictedTokenBackend`` is the intended
future drop-in; see :class:`UnavailableBackend`.

**Working directory.** Neither backend changes it.  The wrapper's job is
confinement, not relocation: the command arrives from a *persistent* shell whose
current directory is state the agent built up (``cd subdir && …``), and a
wrapper that reset it would make the same command mean different things
depending on which backend the host happens to have.  Seatbelt inherits the cwd
because ``sandbox-exec`` is an ordinary exec wrapper; bubblewrap inherits it
because ``bwrap`` keeps the caller's cwd when it still exists inside the sandbox
namespace, which the enclosing ``--ro-bind / /`` guarantees.  An earlier revision
emitted ``--chdir <workspace_root>`` on the bubblewrap side only; that was the
divergence, and it is gone.

Everything here is a pure function of ``(spec, platform_name, which, run_trial)``.
The platform, the executable lookup and the trial invocation are injected rather
than read from the host so the whole matrix is testable from any OS — the
sandbox itself cannot be exercised on native Windows, so untestable logic would
be untested logic.

**Availability is proved, not assumed.**  Finding the executable on ``PATH`` is
necessary but not sufficient: a host that forbids unprivileged user namespaces
(Ubuntu 24.04's ``kernel.apparmor_restrict_unprivileged_userns``, hardened and
container-hosted kernels) ships a ``bwrap`` that is present and never works.
:meth:`BubblewrapBackend.probe` and :meth:`SeatbeltBackend.probe` therefore
launch a throwaway sandbox once per process and cache the verdict; see
:func:`run_sandbox_trial` for which way an inconclusive trial falls.
"""

from __future__ import annotations

import shlex
import shutil
import subprocess
import sys
from pathlib import Path
from typing import TYPE_CHECKING, Protocol

from rotaris_core.reqtocode import SWR, traces
from rotaris_core.sandbox.spec import (
    SandboxAvailability,
    SandboxMode,
    SandboxSpec,
    SandboxUnavailableError,
)

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

#: Signature of :func:`shutil.which`, injected so tests can drive every branch.
type WhichFn = Callable[[str], str | None]

#: Signature of the trial-invocation seam: given the argv of a throwaway sandbox
#: launch, return ``(started, detail)``.  ``detail`` is the launcher's own
#: diagnostic when it did not start, and empty when it did.
type TrialRunFn = Callable[[Sequence[str]], tuple[bool, str]]

#: The shell a wrapped command is handed to.  Commands reaching this module are
#: arbitrary compound shell strings (``a && b | c``), so they are passed as a
#: single ``-c`` argument rather than split.
SHELL = "/bin/sh"

SEATBELT_EXECUTABLE = "sandbox-exec"
BUBBLEWRAP_EXECUTABLE = "bwrap"

#: The tolerant form of ``--ro-bind``: a missing bind *source* is skipped rather
#: than aborting the launch.  Used for a carve-out whose source exists (see
#: :func:`build_bubblewrap_argv`).
BUBBLEWRAP_RO_BIND_TRY = "--ro-bind-try"

#: An empty filesystem mounted at a destination that need not exist beforehand.
#: Paired with :data:`BUBBLEWRAP_REMOUNT_RO` this is how a carve-out is expressed
#: when there is nothing on the host to bind read-only.
BUBBLEWRAP_TMPFS = "--tmpfs"

#: Flips an already-mounted path to read-only.  ``--tmpfs`` alone is writable.
BUBBLEWRAP_REMOUNT_RO = "--remount-ro"

SEATBELT_BACKEND = "seatbelt"
BUBBLEWRAP_BACKEND = "bubblewrap"
UNAVAILABLE_BACKEND = "unavailable"

#: Temporary directories that stay writable in every mode, including
#: ``read-only``: a toolchain that cannot write a temp file cannot run.
SEATBELT_TEMP_SUBPATHS: tuple[str, ...] = (
    "/tmp",
    "/private/tmp",
    "/var/tmp",
    "/private/var/tmp",
    "/private/var/folders",
)

#: Character devices a shell needs to write to for redirection to work.
SEATBELT_WRITABLE_DEVICES: tuple[str, ...] = (
    "/dev/null",
    "/dev/zero",
    "/dev/random",
    "/dev/urandom",
    "/dev/tty",
    "/dev/stdin",
    "/dev/stdout",
    "/dev/stderr",
    "/dev/dtracehelper",
)

WINDOWS_UNSUPPORTED_REASON = (
    "OS-level sandboxing is not supported on native Windows: Rotaris ships the "
    "Apple Seatbelt backend (macOS) and the bubblewrap backend (Linux, WSL2)."
)
WINDOWS_UNSUPPORTED_REMEDIATION = (
    "Run Rotaris inside a WSL2 distribution and install bubblewrap there "
    "(sudo apt-get install bubblewrap), or leave the sandbox off."
)
UNSUPPORTED_PLATFORM_REASON = (
    "OS-level sandboxing is not supported on platform {platform!r}: Rotaris "
    "ships the Apple Seatbelt backend (macOS) and the bubblewrap backend "
    "(Linux, WSL2)."
)
UNSUPPORTED_PLATFORM_REMEDIATION = (
    "Run Rotaris on macOS or on Linux/WSL2 to use the sandbox, or leave the sandbox off."
)

SEATBELT_WRONG_PLATFORM_REASON = (
    "The Seatbelt sandbox needs macOS; this host reports platform {platform!r}."
)
SEATBELT_WRONG_PLATFORM_REMEDIATION = (
    "Run Rotaris on macOS, or use the bubblewrap backend on Linux/WSL2."
)
SEATBELT_MISSING_REASON = "The Seatbelt sandbox needs 'sandbox-exec', which was not found on PATH."
SEATBELT_MISSING_REMEDIATION = (
    "sandbox-exec ships with macOS; check that /usr/bin is on PATH for this process."
)

BUBBLEWRAP_WRONG_PLATFORM_REASON = (
    "The bubblewrap sandbox needs Linux; this host reports platform {platform!r}."
)
BUBBLEWRAP_WRONG_PLATFORM_REMEDIATION = (
    "Run Rotaris on Linux or inside WSL2, or use the Seatbelt backend on macOS."
)
BUBBLEWRAP_MISSING_REASON = "The bubblewrap sandbox needs 'bwrap', which was not found on PATH."
BUBBLEWRAP_MISSING_REMEDIATION = (
    "Install bubblewrap: 'sudo apt-get install bubblewrap' on Debian/Ubuntu, "
    "'sudo dnf install bubblewrap' on Fedora/RHEL."
)

BUBBLEWRAP_TRIAL_FAILED_REASON = (
    "'bwrap' is installed but a trial sandbox could not be started on this host, "
    "so it cannot confine commands: {detail}"
)
BUBBLEWRAP_TRIAL_FAILED_REMEDIATION = (
    "The usual cause is that unprivileged user namespaces are disabled. Check "
    "'sysctl kernel.apparmor_restrict_unprivileged_userns' (Ubuntu 24.04+) and "
    "'cat /proc/sys/kernel/unprivileged_userns_clone' (Debian-family), or run "
    "'bwrap --ro-bind / / --proc /proc --unshare-net -- true' by hand to see the "
    "kernel's own message. Until it starts, the run counts as unsandboxed."
)
SEATBELT_TRIAL_FAILED_REASON = (
    "'sandbox-exec' is present but a trial sandbox could not be started on this "
    "host, so it cannot confine commands: {detail}"
)
SEATBELT_TRIAL_FAILED_REMEDIATION = (
    "Run 'sandbox-exec -p \"(version 1)(allow default)\" /usr/bin/true' by hand to "
    "see the system's own message. Until it starts, the run counts as unsandboxed."
)

#: The Seatbelt equivalent: the most permissive profile that still exercises
#: ``sandbox_apply``, so a refusal here is about the mechanism, not the policy.
SEATBELT_TRIAL_ARGV: tuple[str, ...] = (
    SEATBELT_EXECUTABLE,
    "-p",
    "(version 1)(allow default)",
    "/usr/bin/true",
)

#: A trial that has not finished by now is not a sandbox anyone can work in.
#: Kept short because :func:`probe_sandbox` is called from the Rotaris GUI
#: thread, where this is the worst case the user can be made to wait.
SANDBOX_TRIAL_TIMEOUT_SECONDS = 5.0

#: Verdicts keyed by ``(trial argv, trial function)``.  The probe sits on the
#: terminal tool's hot path (every ``sandbox_status`` call, every status
#: repaint), and shelling out each time would be a real cost.  A host does not
#: gain or lose the ability to unshare a namespace mid-process, so once per
#: process is the right granularity; :func:`reset_sandbox_probe_cache` exists so
#: tests are not order-dependent.  The trial *function* is part of the key
#: because it is an injected seam: keying on argv alone would let one caller's
#: injected trial silently answer for another's.  Concurrent probes may both run
#: the trial before either stores its verdict — that costs one extra ``true``,
#: not a wrong answer, so no lock is taken.
_TRIAL_CACHE: dict[tuple[tuple[str, ...], TrialRunFn], tuple[bool, str]] = {}


@traces(SWR.SWR_2507)
def reset_sandbox_probe_cache() -> None:
    """Forget every cached trial verdict.

    Production has no reason to call this — the answer cannot change while the
    process runs.  Tests do: without it, the first test to drive a failing trial
    would decide the verdict for every test after it.
    """
    _TRIAL_CACHE.clear()


@traces(SWR.SWR_2507)
def run_sandbox_trial(argv: Sequence[str]) -> tuple[bool, str]:
    """Launch *argv* and report whether the sandbox actually started.

    **Inconclusive means unavailable.**  Every way this can fail to reach a
    clean exit — the executable vanished between the ``PATH`` lookup and the
    launch, the kernel refused the namespace, the trial hung, the process table
    is full — returns ``False``.  The asymmetry is deliberate and is the whole
    point of SWR-2508: reporting *unavailable* on a host whose sandbox actually
    works costs a downgrade to ``ask``, which is an annoyance; reporting
    *available* on a host whose sandbox cannot start lifts that downgrade and
    leaves an autonomous run unrestricted on the host, which is the defect this
    trial exists to close.
    """
    try:
        completed = subprocess.run(  # noqa: S603 - fixed argv, never shell
            list(argv),
            capture_output=True,
            text=True,
            errors="replace",
            timeout=SANDBOX_TRIAL_TIMEOUT_SECONDS,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return (
            False,
            f"the trial launch did not finish within {SANDBOX_TRIAL_TIMEOUT_SECONDS:.0f}s",
        )
    except OSError as exc:
        return (False, f"the trial launch could not be started ({exc})")
    except Exception as exc:  # noqa: BLE001 - unknown failure still means unproven
        return (False, f"the trial launch failed unexpectedly ({type(exc).__name__}: {exc})")
    if completed.returncode == 0:
        return (True, "")
    return (False, _trial_detail(completed))


def _trial_detail(completed: subprocess.CompletedProcess[str]) -> str:
    """The launcher's own first diagnostic line, or the bare exit code."""
    for stream in (completed.stderr, completed.stdout):
        for line in (stream or "").splitlines():
            if line.strip():
                return f"exit {completed.returncode}: {line.strip()}"
    return f"exit {completed.returncode} with no diagnostic output"


def _trial_verdict(argv: tuple[str, ...], run_trial: TrialRunFn) -> tuple[bool, str]:
    """The cached verdict for *argv*, running the trial at most once per process."""
    key = (argv, run_trial)
    cached = _TRIAL_CACHE.get(key)
    if cached is not None:
        return cached
    verdict = run_trial(argv)
    _TRIAL_CACHE[key] = verdict
    return verdict


@traces(SWR.SWR_2507)
class SandboxBackend(Protocol):
    """One OS-level sandbox mechanism.

    ``wrap`` returns a *new shell command string* that runs ``command`` under
    the sandbox.  It never returns ``command`` unchanged except when the spec
    asks for :attr:`SandboxMode.OFF`; anything else — unsupported host, missing
    executable — raises :class:`SandboxUnavailableError`, because silently
    running unsandboxed is the one outcome SWR-2507 rules out.
    """

    name: str

    def probe(self) -> SandboxAvailability:
        """Whether this backend can run on this host right now."""
        ...

    def wrap(self, command: str, spec: SandboxSpec) -> str:
        """Wrap *command* so it executes under this sandbox."""
        ...


def _seatbelt_literal(value: str | Path) -> str:
    """Quote *value* for a Seatbelt ``(subpath "…")`` / ``(literal "…")`` form.

    Backslashes first, then quotes: escaping quotes first would leave the
    inserted backslash to be escaped again, and a path carrying either
    character would otherwise break out of the string literal and change the
    meaning of the rule around it.
    """
    text = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'


@traces(SWR.SWR_2507)
def build_seatbelt_profile(spec: SandboxSpec) -> str:
    """Render *spec* as an Apple Seatbelt (SBPL) profile.

    Deny-by-default, reads allowed broadly (an agent needs its toolchain), and
    writes allowed only under the effective writable roots.  SBPL is
    last-match-wins, so the ``(deny file-write* …)`` rules for
    :attr:`SandboxSpec.readonly_subpaths` are emitted *after* every allow — the
    other order would silently leave ``.git`` writable.
    """
    lines = [
        "(version 1)",
        "(deny default)",
        "(allow process-exec)",
        "(allow process-fork)",
        "(allow sysctl-read)",
        "(allow signal)",
        # Reads stay broad: a default-deny read policy breaks every toolchain
        # the agent needs, which is why both reference harnesses rejected
        # AppContainer-style read isolation.
        '(allow file-read* (subpath "/"))',
    ]
    temp = " ".join(f"(subpath {_seatbelt_literal(path)})" for path in SEATBELT_TEMP_SUBPATHS)
    lines.append(f"(allow file-write* {temp})")
    devices = " ".join(f"(literal {_seatbelt_literal(path)})" for path in SEATBELT_WRITABLE_DEVICES)
    lines.append(f"(allow file-write-data {devices})")
    for root in spec.effective_writable_roots():
        lines.append(f"(allow file-write* (subpath {_seatbelt_literal(root)}))")
    # After the allows, deliberately: last match wins.
    for subpath in spec.readonly_subpaths:
        lines.append(f"(deny file-write* (subpath {_seatbelt_literal(subpath)}))")
    lines.append("(allow network*)" if spec.allow_network else "(deny network*)")
    return "\n".join(lines) + "\n"


@traces(SWR.SWR_2507)
def build_bubblewrap_argv(spec: SandboxSpec) -> list[str]:
    """Render *spec* as the ``bwrap`` argv that precedes ``-- /bin/sh -c …``.

    bubblewrap applies binds in argument order, so the read-only carve-outs for
    :attr:`SandboxSpec.readonly_subpaths` come *after* the writable ``--bind``
    of the workspace; reversing the two would leave ``.git`` writable.

    **A carve-out whose source is missing still has to deny writes.**  An
    earlier revision emitted ``--ro-bind-try`` unconditionally and argued that a
    skipped bind was safe because the enclosing ``--ro-bind / /`` already covered
    the path.  It does not: the writable ``--bind <workspace> <workspace>``
    emitted just above re-mounts that whole subtree, ``.rotaris`` included.  On a
    workspace with no ``.rotaris`` — a fresh SWR-2404 worktree, since ``.rotaris``
    is gitignored and lives on the main workspace — the agent could therefore
    create it and write its own ``agents.yaml``, which the *next* run would read
    as its own policy.  Seatbelt never had the problem, because
    ``(deny file-write* (subpath …))`` is a pattern evaluated per access; the two
    backends have to confine identically or the verification protocol's results
    do not transfer between platforms.

    So the carve-out is rendered three ways, on the two properties that decide
    which bubblewrap primitive can express it:

    - **Not inside any writable root** (``read-only`` mode, or a subpath of a
      workspace that is not itself writable) → nothing is emitted.  Here the
      enclosing ``--ro-bind / /`` really is the whole story, because no later
      bind shadows it.  Emitting a mount anyway would be worse than redundant:
      ``bwrap`` has to ``mkdir`` a mount point before mounting a tmpfs over it,
      and on a read-only tree that ``mkdir`` fails and takes the whole launch
      down with it.
    - **Inside a writable root, source present** → ``--ro-bind-try``, which keeps
      the real contents readable.  Reads matter: ``git status`` inside the
      sandbox has to work, so shadowing ``.git`` with an empty filesystem would
      be a usability defect.  The tolerant form is kept for the narrow window in
      which the path is deleted between this call and the launch.
    - **Inside a writable root, source absent** → ``--tmpfs`` plus
      ``--remount-ro``, an empty read-only filesystem mounted *over* the name.
      There is nothing to read, and the agent cannot create anything there.

    **Known artefact.**  That last form makes ``bwrap`` create the mount point,
    and because the writable bind shares inodes with the host, the empty
    directory survives the sandbox — a workspace with no ``.git`` gains an empty
    ``.git/``.  Bubblewrap offers no way to mount at a path without creating it,
    so this is the price of expressing the exclusion at all, and the trade is
    deliberate: an empty directory is recoverable, a sandbox that can widen
    itself is not.  It is one of the things step S7b of
    ``docs/testing/sandbox-verification-protocol.md`` has to confirm on a real
    host, since nothing here can be executed on native Windows.

    Reading the filesystem makes this function no longer a pure function of
    *spec*, which is the price of expressing the exclusion correctly.  The
    remaining race is benign in the direction that matters: a path created after
    this call is covered by the ``--tmpfs`` anyway, and a path deleted after this
    call falls back to the tolerant bind.  A dangling symlink counts as absent,
    so ``bwrap`` will refuse to mount over it and the session refuses to start —
    the safe direction.

    No ``--chdir`` is emitted: see the module docstring on working directory.
    """
    argv = [
        BUBBLEWRAP_EXECUTABLE,
        "--die-with-parent",
        "--ro-bind",
        "/",
        "/",
        "--dev",
        "/dev",
        "--proc",
        "/proc",
        BUBBLEWRAP_TMPFS,
        "/tmp",
    ]
    writable_roots = spec.effective_writable_roots()
    for root in writable_roots:
        argv += ["--bind", str(root), str(root)]
    for subpath in spec.readonly_subpaths:
        if not _is_inside_any(subpath, writable_roots):
            continue
        if subpath.exists():
            argv += [BUBBLEWRAP_RO_BIND_TRY, str(subpath), str(subpath)]
        else:
            argv += [
                BUBBLEWRAP_TMPFS,
                str(subpath),
                BUBBLEWRAP_REMOUNT_RO,
                str(subpath),
            ]
    if not spec.allow_network:
        argv.append("--unshare-net")
    return argv


def _is_inside_any(path: Path, roots: tuple[Path, ...]) -> bool:
    """Whether *path* sits under one of *roots* — i.e. a writable bind shadows it.

    Both sides are already resolved by :meth:`SandboxSpec.for_workspace`, so this
    is a pure name comparison and never touches the filesystem.
    """
    parents = set(path.parents)
    return any(root in parents for root in roots)


#: Throwaway launch that proves ``bwrap`` can build the namespace a real session
#: would need.  Rendered by :func:`build_bubblewrap_argv` itself rather than
#: hand-written, so the trial cannot drift away from the invocation it stands in
#: for: a host that refuses ``--proc`` or ``--unshare-net`` fails here instead of
#: passing the probe and then failing every command.  The spec is ``read-only``
#: with the filesystem root as its workspace, which renders the base mounts and
#: nothing else — no writable bind and no carve-out, so building it touches no
#: filesystem and leaves nothing behind.
#:
#: ``--unshare-net`` is included even though a session may ask for an open
#: network.  That is the fail-closed direction: a host that cannot unshare the
#: network is reported unavailable, which costs a downgrade to ``ask``, rather
#: than reported available and then failing at the first command.
BUBBLEWRAP_TRIAL_ARGV: tuple[str, ...] = (
    *build_bubblewrap_argv(
        SandboxSpec(
            mode=SandboxMode.READ_ONLY,
            workspace_root=Path("/"),
            readonly_subpaths=(),
        ),
    ),
    "--",
    "true",
)


def _ensure_available(availability: SandboxAvailability) -> None:
    """Raise rather than let a caller run the command unsandboxed."""
    if not availability.available:
        raise SandboxUnavailableError(availability)


def _shell_suffix(command: str) -> list[str]:
    """``/bin/sh -c '<command>'`` — one quoted argument, never interpolated."""
    return [SHELL, "-c", shlex.quote(command)]


@traces(SWR.SWR_2507)
class SeatbeltBackend:
    """macOS sandbox backend driven by ``sandbox-exec -p <profile>``."""

    name = SEATBELT_BACKEND

    def __init__(
        self,
        platform_name: str | None = None,
        which: WhichFn | None = None,
        run_trial: TrialRunFn | None = None,
    ) -> None:
        self._platform = sys.platform if platform_name is None else platform_name
        self._which: WhichFn = shutil.which if which is None else which
        self._run_trial: TrialRunFn = run_sandbox_trial if run_trial is None else run_trial

    def probe(self) -> SandboxAvailability:
        if self._platform != "darwin":
            return SandboxAvailability(
                available=False,
                backend=self.name,
                reason=SEATBELT_WRONG_PLATFORM_REASON.format(platform=self._platform),
                remediation=SEATBELT_WRONG_PLATFORM_REMEDIATION,
            )
        # The PATH lookup stays first: it is free, and it gives the more useful
        # diagnosis when the executable is simply not there.
        if self._which(SEATBELT_EXECUTABLE) is None:
            return SandboxAvailability(
                available=False,
                backend=self.name,
                reason=SEATBELT_MISSING_REASON,
                remediation=SEATBELT_MISSING_REMEDIATION,
            )
        started, detail = _trial_verdict(SEATBELT_TRIAL_ARGV, self._run_trial)
        if not started:
            return SandboxAvailability(
                available=False,
                backend=self.name,
                reason=SEATBELT_TRIAL_FAILED_REASON.format(detail=detail),
                remediation=SEATBELT_TRIAL_FAILED_REMEDIATION,
            )
        return SandboxAvailability(available=True, backend=self.name)

    def wrap(self, command: str, spec: SandboxSpec) -> str:
        if spec.mode is SandboxMode.OFF:
            return command
        _ensure_available(self.probe())
        parts = [
            SEATBELT_EXECUTABLE,
            "-p",
            shlex.quote(build_seatbelt_profile(spec)),
            *_shell_suffix(command),
        ]
        return " ".join(parts)


@traces(SWR.SWR_2507)
class BubblewrapBackend:
    """Linux and WSL2 sandbox backend driven by ``bwrap``."""

    name = BUBBLEWRAP_BACKEND

    def __init__(
        self,
        platform_name: str | None = None,
        which: WhichFn | None = None,
        run_trial: TrialRunFn | None = None,
    ) -> None:
        self._platform = sys.platform if platform_name is None else platform_name
        self._which: WhichFn = shutil.which if which is None else which
        self._run_trial: TrialRunFn = run_sandbox_trial if run_trial is None else run_trial

    def probe(self) -> SandboxAvailability:
        if not self._platform.startswith("linux"):
            return SandboxAvailability(
                available=False,
                backend=self.name,
                reason=BUBBLEWRAP_WRONG_PLATFORM_REASON.format(platform=self._platform),
                remediation=BUBBLEWRAP_WRONG_PLATFORM_REMEDIATION,
            )
        # The PATH lookup stays first: it is free, and "install bubblewrap" is a
        # better answer than a launch failure for a binary that is not there.
        if self._which(BUBBLEWRAP_EXECUTABLE) is None:
            return SandboxAvailability(
                available=False,
                backend=self.name,
                reason=BUBBLEWRAP_MISSING_REASON,
                remediation=BUBBLEWRAP_MISSING_REMEDIATION,
            )
        started, detail = _trial_verdict(BUBBLEWRAP_TRIAL_ARGV, self._run_trial)
        if not started:
            return SandboxAvailability(
                available=False,
                backend=self.name,
                reason=BUBBLEWRAP_TRIAL_FAILED_REASON.format(detail=detail),
                remediation=BUBBLEWRAP_TRIAL_FAILED_REMEDIATION,
            )
        return SandboxAvailability(available=True, backend=self.name)

    def wrap(self, command: str, spec: SandboxSpec) -> str:
        if spec.mode is SandboxMode.OFF:
            return command
        _ensure_available(self.probe())
        argv = [shlex.quote(item) for item in build_bubblewrap_argv(spec)]
        return " ".join([*argv, "--", *_shell_suffix(command)])


@traces(SWR.SWR_2507)
class UnavailableBackend:
    """The backend for hosts Rotaris cannot sandbox — today, native Windows.

    Claude Code's shipped answer on Windows is "run inside WSL2", and this
    backend says exactly that.  A ``WindowsRestrictedTokenBackend`` is the
    intended future drop-in: Codex CLI's approach of ``CreateRestrictedToken``
    with ``WRITE_RESTRICTED`` plus a synthetic SID, ACEs planted on the writable
    roots, and network control via Windows Firewall rules bound to a dedicated
    local account.  Because :class:`SandboxBackend` is a protocol, adding it is
    a new class here and one branch in :func:`resolve_backend`.
    """

    name = UNAVAILABLE_BACKEND

    def __init__(self, platform_name: str | None = None) -> None:
        self._platform = sys.platform if platform_name is None else platform_name

    def probe(self) -> SandboxAvailability:
        if self._platform.startswith("win"):
            return SandboxAvailability(
                available=False,
                backend=self.name,
                reason=WINDOWS_UNSUPPORTED_REASON,
                remediation=WINDOWS_UNSUPPORTED_REMEDIATION,
            )
        return SandboxAvailability(
            available=False,
            backend=self.name,
            reason=UNSUPPORTED_PLATFORM_REASON.format(platform=self._platform),
            remediation=UNSUPPORTED_PLATFORM_REMEDIATION,
        )

    def wrap(self, command: str, spec: SandboxSpec) -> str:
        # ``off`` is not an error path — no sandbox was asked for, so there is
        # nothing to fall back *from*.  Every other mode raises.
        if spec.mode is SandboxMode.OFF:
            return command
        raise SandboxUnavailableError(self.probe())


@traces(SWR.SWR_2507)
def resolve_backend(
    platform_name: str | None = None,
    which: WhichFn | None = None,
    run_trial: TrialRunFn | None = None,
) -> SandboxBackend:
    """Pick the backend for a platform, without deciding whether it can run.

    The returned backend's :meth:`~SandboxBackend.probe` answers that — a macOS
    host missing ``sandbox-exec`` still resolves to :class:`SeatbeltBackend`, so
    the diagnosis names the mechanism that failed.

    All three parameters default to :data:`sys.platform`, :func:`shutil.which`
    and :func:`run_sandbox_trial`, and exist so the whole matrix can be driven
    from any host.
    """
    platform = sys.platform if platform_name is None else platform_name
    lookup: WhichFn = shutil.which if which is None else which
    trial: TrialRunFn = run_sandbox_trial if run_trial is None else run_trial
    if platform == "darwin":
        return SeatbeltBackend(platform_name=platform, which=lookup, run_trial=trial)
    # ``linux2`` (legacy) and WSL2 both report a platform starting with "linux".
    if platform.startswith("linux"):
        return BubblewrapBackend(platform_name=platform, which=lookup, run_trial=trial)
    return UnavailableBackend(platform_name=platform)


@traces(SWR.SWR_2507)
def probe_sandbox(
    platform_name: str | None = None,
    which: WhichFn | None = None,
    run_trial: TrialRunFn | None = None,
) -> SandboxAvailability:
    """One-call availability check for status displays in the GUI and CLI."""
    return resolve_backend(
        platform_name=platform_name,
        which=which,
        run_trial=run_trial,
    ).probe()
