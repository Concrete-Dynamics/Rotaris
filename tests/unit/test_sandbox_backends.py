"""Sandbox backend selection, profile/argv rendering and the no-fallback rule.

The sandbox itself cannot run on native Windows, so every test here injects the
platform name, the executable lookup and the trial invocation instead of reading
the host: the whole macOS/Linux/Windows matrix must pass on any developer
machine and in CI.  What that buys is real coverage of the *decision* logic; it
does not and cannot prove that a rendered argv confines a real process, which is
what `docs/testing/sandbox-verification-protocol.md` exists for.
"""

from __future__ import annotations

import re
import shlex
from pathlib import Path

import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.sandbox import (
    BubblewrapBackend,
    SandboxMode,
    SandboxSpec,
    SandboxUnavailableError,
    SeatbeltBackend,
    UnavailableBackend,
    build_bubblewrap_argv,
    build_seatbelt_profile,
    probe_sandbox,
    reset_sandbox_probe_cache,
    resolve_backend,
    run_sandbox_trial,
)

pytestmark = pytest.mark.unit

COMPOUND_COMMAND = "echo $HOME && rm -rf 'a b'"

#: What a kernel with unprivileged user namespaces disabled actually prints.
BWRAP_NAMESPACE_REFUSAL = (
    "bwrap: No permissions to creating new namespace, likely because the kernel "
    "does not allow non-privileged user namespaces."
)


@pytest.fixture(autouse=True)
def _forget_trial_verdicts():
    """Keep the per-process trial cache from leaking between tests.

    The cache is keyed by trial argv, so a test that drives a *failing* trial
    would otherwise decide availability for every test that ran after it.  Reset
    on both sides so this file neither inherits nor leaves a verdict.
    """
    reset_sandbox_probe_cache()
    yield
    reset_sandbox_probe_cache()


def _which_finding(*available):
    """A ``shutil.which`` stand-in that only ever finds *available*."""
    found = set(available)

    def which(name):
        return f"/usr/bin/{name}" if name in found else None

    return which


def _trial_that_starts(argv):
    """A trial invocation standing in for a host whose sandbox works."""
    del argv
    return (True, "")


def _trial_that_fails(argv):
    """A trial invocation standing in for a `bwrap` that is present and broken."""
    del argv
    return (False, f"exit 1: {BWRAP_NAMESPACE_REFUSAL}")


def _trial_that_must_not_run(argv):
    raise AssertionError(f"the trial invocation should not have been reached: {argv!r}")


def _spec(tmp_path, *, mode=SandboxMode.WORKSPACE_WRITE, **kwargs):
    workspace = tmp_path / "project"
    workspace.mkdir(exist_ok=True)
    return SandboxSpec.for_workspace(workspace, mode=mode, **kwargs)


def _rule_index(lines, verb, tail):
    """Index of the ``verb`` rule whose path literal ends in *tail*.

    Matched on the tail rather than the whole path because Windows paths carry
    backslashes that the profile escapes; the trailing component is the same on
    every platform."""
    return next(
        index
        for index, line in enumerate(lines)
        if line.startswith(f"({verb} file-write* (subpath") and line.endswith(f'{tail}"))')
    )


@verifies(SWR.SWR_2507)
def test_macos_with_sandbox_exec_resolves_to_a_working_seatbelt_backend():
    """Productive use: a developer on macOS turns the sandbox on.
    Expected outcome: Seatbelt is selected and reports itself ready, so the
    session can actually run sandboxed."""
    backend = resolve_backend("darwin", _which_finding("sandbox-exec"), _trial_that_starts)

    assert isinstance(backend, SeatbeltBackend)
    availability = backend.probe()
    assert availability.available is True
    assert availability.backend == "seatbelt"


@verifies(SWR.SWR_2507)
def test_macos_without_sandbox_exec_reports_the_missing_tool():
    """Productive use: a developer on a macOS host with a broken PATH opts in.
    Expected outcome: the sandbox reports itself unavailable and names
    sandbox-exec, rather than the session running unsandboxed."""
    backend = resolve_backend("darwin", _which_finding(), _trial_that_must_not_run)

    availability = backend.probe()
    assert availability.available is False
    assert "sandbox-exec" in availability.reason
    assert availability.remediation


@verifies(SWR.SWR_2507)
def test_linux_with_bwrap_resolves_to_a_working_bubblewrap_backend():
    """Productive use: a developer on Linux turns the sandbox on.
    Expected outcome: bubblewrap is selected and reports itself ready — which now
    means a throwaway `bwrap` launch really succeeded, not merely that the binary
    was found."""
    backend = resolve_backend("linux", _which_finding("bwrap"), _trial_that_starts)

    assert isinstance(backend, BubblewrapBackend)
    assert backend.probe().available is True
    assert backend.probe().backend == "bubblewrap"


@verifies(SWR.SWR_2507)
def test_linux_without_bwrap_names_the_package_to_install():
    """Productive use: a developer on Linux opts in before installing bubblewrap.
    Expected outcome: the failure tells them the exact package command for their
    distro family instead of leaving them to guess."""
    availability = probe_sandbox("linux", _which_finding(), _trial_that_must_not_run)

    assert availability.available is False
    assert "bwrap" in availability.reason
    assert "apt-get install bubblewrap" in availability.remediation
    assert "dnf install bubblewrap" in availability.remediation


@verifies(SWR.SWR_2507)
def test_wsl2_style_linux_platform_still_resolves_to_bubblewrap():
    """Productive use: a developer runs Rotaris inside WSL2.
    Expected outcome: the sandbox works there, since WSL2 reports a linux
    platform and is the documented Windows answer."""
    assert isinstance(
        resolve_backend("linux2", _which_finding("bwrap"), _trial_that_starts),
        BubblewrapBackend,
    )
    assert probe_sandbox("linux2", _which_finding("bwrap"), _trial_that_starts).available is True


@verifies(SWR.SWR_2507)
def test_native_windows_is_unavailable_and_points_at_wsl2():
    """Productive use: a developer on native Windows asks for a sandboxed session.
    Expected outcome: they are told native Windows is unsupported and pointed at
    WSL2, instead of getting an unsandboxed run."""
    backend = resolve_backend(
        "win32",
        _which_finding("bwrap", "sandbox-exec"),
        _trial_that_must_not_run,
    )

    assert isinstance(backend, UnavailableBackend)
    availability = backend.probe()
    assert availability.available is False
    assert availability.backend == "unavailable"
    assert "Windows" in availability.reason
    assert "WSL2" in availability.remediation


@verifies(SWR.SWR_2507)
def test_unknown_platform_is_unavailable_without_claiming_to_be_windows():
    """Productive use: a developer on an unusual OS asks for a sandboxed session.
    Expected outcome: the message names their actual platform, so the diagnosis
    is not misleading."""
    availability = probe_sandbox("freebsd14", _which_finding(), _trial_that_must_not_run)

    assert availability.available is False
    assert "freebsd14" in availability.reason
    assert "Windows" not in availability.reason


@verifies(SWR.SWR_2507)
def test_seatbelt_profile_denies_git_after_allowing_the_workspace(tmp_path):
    """Productive use: a developer runs a sandboxed session on macOS.
    Expected outcome: the profile allows writes in the workspace but revokes them
    for .git, and the deny comes last so it actually wins."""
    cache = tmp_path / "cache"
    cache.mkdir()
    spec = _spec(tmp_path, writable_roots=[cache])

    profile = build_seatbelt_profile(spec)
    lines = profile.splitlines()

    assert lines[0] == "(version 1)"
    assert lines[1] == "(deny default)"
    allow_workspace = _rule_index(lines, "allow", "project")
    allow_cache = _rule_index(lines, "allow", "cache")
    deny_git = _rule_index(lines, "deny", ".git")
    deny_rotaris = _rule_index(lines, "deny", ".rotaris")
    assert allow_workspace < deny_git
    assert allow_cache < deny_git
    assert allow_workspace < deny_rotaris


@verifies(SWR.SWR_2507)
def test_seatbelt_profile_closes_the_network_unless_asked_otherwise(tmp_path):
    """Productive use: a developer runs a sandboxed session with no egress allowed.
    Expected outcome: the profile denies network by default and only allows it
    when the policy says so."""
    closed = build_seatbelt_profile(_spec(tmp_path))
    opened = build_seatbelt_profile(_spec(tmp_path, allow_network=True))

    assert "(deny network*)" in closed
    assert "(allow network*)" not in closed
    assert "(allow network*)" in opened
    assert "(deny network*)" not in opened


@verifies(SWR.SWR_2507)
def test_seatbelt_profile_escapes_quotes_and_backslashes_in_paths(tmp_path):
    """Productive use: a developer's project lives under an awkwardly named path.
    Expected outcome: the path stays inside its profile literal instead of
    breaking out and changing the rules around it."""
    hostile = SandboxSpec(
        mode=SandboxMode.WORKSPACE_WRITE,
        workspace_root=Path('/odd"name\\dir'),
        writable_roots=(),
        readonly_subpaths=(),
    )

    profile = build_seatbelt_profile(hostile)
    line = next(entry for entry in profile.splitlines() if "name" in entry)

    assert '\\"name' in line
    assert "\\\\dir" in line
    # Once the escaped pairs are removed, only the two delimiting quotes may
    # remain: a surviving bare quote would end the literal and let the rest of
    # the path be read as further profile syntax.
    assert line.replace("\\\\", "").replace('\\"', "").count('"') == 2


@verifies(SWR.SWR_2507)
def test_seatbelt_read_only_mode_grants_no_writable_root(tmp_path):
    """Productive use: a developer runs a read-only sandboxed review session.
    Expected outcome: the profile carries no writable project root, so the agent
    cannot modify the code it is reviewing."""
    spec = _spec(tmp_path, mode=SandboxMode.READ_ONLY)

    profile = build_seatbelt_profile(spec)

    with pytest.raises(StopIteration):
        _rule_index(profile.splitlines(), "allow", "project")
    assert '(subpath "/tmp")' in profile


@verifies(SWR.SWR_2507)
def test_bubblewrap_argv_rebinds_git_read_only_after_the_workspace(tmp_path):
    """Productive use: a developer runs a sandboxed session on Linux.
    Expected outcome: the workspace is bound writable and .git is re-bound
    read-only afterwards, which is the order bubblewrap needs for the carve-out
    to take effect."""
    spec = _spec(tmp_path)
    # A real repository, so the carve-out has something to re-bind: the tolerant
    # bind form is what keeps `.git` *readable*, which `git status` needs.
    (spec.workspace_root / ".git").mkdir()
    workspace = str(spec.workspace_root)

    argv = build_bubblewrap_argv(spec)

    assert argv[0] == "bwrap"
    assert "--die-with-parent" in argv
    bind_workspace = argv.index("--bind")
    assert argv[bind_workspace + 1 : bind_workspace + 3] == [workspace, workspace]
    ro_git = argv.index(str(spec.workspace_root / ".git"))
    assert argv[ro_git - 1] == "--ro-bind-try"
    assert bind_workspace < ro_git


@verifies(SWR.SWR_2507)
def test_bubblewrap_argv_launches_when_a_protected_subpath_does_not_exist(tmp_path):
    """Productive use: a developer runs a sandboxed session on a fresh SWR-2404
    worktree, which has no gitignored `.rotaris` directory of its own.
    Expected outcome: bwrap still launches — no carve-out names a bind source
    that is not there, which is enough to make bwrap exit before running
    anything."""
    spec = _spec(tmp_path)
    missing = [path for path in spec.readonly_subpaths if not path.exists()]
    assert missing, "the fixture workspace must have no .git/.rotaris to be meaningful"

    argv = build_bubblewrap_argv(spec)

    for subpath in spec.readonly_subpaths:
        # An absent carve-out is expressed as an empty read-only filesystem, so
        # there is no source path for bwrap to fail to find.
        assert argv[argv.index(str(subpath)) - 1] == "--tmpfs"
    assert "--ro-bind" in argv  # the enclosing read-only root bind is still strict
    assert argv[argv.index("--ro-bind") + 1 : argv.index("--ro-bind") + 3] == ["/", "/"]


# ---------------------------------------------------------------------------
# Backend parity: the same policy has to confine the same way on both hosts
# ---------------------------------------------------------------------------
#
# The two readers below answer one question — "would this rendering let a
# command write *target*?" — by modelling the rule the real mechanism applies.
# They are the durable part of the `.rotaris` fix: asserting the two backends
# agree catches the *next* divergence too, which two hand-written per-backend
# assertions would not.  They model the mechanisms, they do not run them; only
# `docs/testing/sandbox-verification-protocol.md` can do that.

#: bwrap options that mount a *host* path writable at their destination.
_BWRAP_WRITABLE_OPS = {"--bind", "--bind-try", "--dev-bind", "--dev-bind-try", "--dir"}
#: bwrap options that mount something read-only at their destination.
_BWRAP_READONLY_OPS = {"--ro-bind", "--ro-bind-try", "--remount-ro"}
#: bwrap options that mount an empty, throwaway filesystem over their
#: destination.  The mount is writable in itself, but it shadows whatever was
#: there: a write lands in memory and never reaches the host path, so the next
#: run reads the untouched original.  That is the property SWR-2507 is about,
#: and it is why the missing-`.rotaris` carve-out is rendered as a `--tmpfs` in
#: the first place.  Modelling it as writable would also mis-read the ambient
#: `--tmpfs /tmp`, under which a test workspace usually lives.
_BWRAP_SHADOW_OPS = {"--tmpfs"}
#: How many arguments each option consumes, destination last.
_BWRAP_ARITY = {
    "--bind": 2,
    "--bind-try": 2,
    "--dev-bind": 2,
    "--dev-bind-try": 2,
    "--ro-bind": 2,
    "--ro-bind-try": 2,
    "--tmpfs": 1,
    "--dir": 1,
    "--remount-ro": 1,
    "--dev": 1,
    "--proc": 1,
}


def _bwrap_mounts(argv):
    """``(option, source, destination)`` for every mount operation in *argv*."""
    mounts = []
    index = 0
    while index < len(argv):
        option = argv[index]
        arity = _BWRAP_ARITY.get(option)
        if arity is None:
            index += 1
            continue
        operands = argv[index + 1 : index + 1 + arity]
        source = operands[0] if arity == 2 else None
        mounts.append((option, source, operands[-1]))
        index += 1 + arity
    return mounts


def _bubblewrap_allows_write(spec, target):
    """Whether the rendered bwrap argv would leave the *host* file at *target* writable.

    Replays the mounts in order, because bubblewrap applies them in order and
    the last one covering a path wins.  ``--ro-bind-try`` with a source that is
    not on the host is modelled as the no-op bwrap makes it — that no-op is
    precisely what made the missing `.rotaris` carve-out a hole.  A ``--tmpfs``
    covering the path shadows it instead of exposing it; see
    :data:`_BWRAP_SHADOW_OPS`.
    """
    writable = False  # the enclosing `--ro-bind / /` starts everything read-only
    for option, source, destination in _bwrap_mounts(build_bubblewrap_argv(spec)):
        covered = Path(destination) == target or Path(destination) in target.parents
        if not covered:
            continue
        if option.endswith("-try") and source is not None and not Path(source).exists():
            continue  # bwrap silently skips a tolerant bind with no source
        if option in _BWRAP_WRITABLE_OPS:
            writable = True
        elif option in _BWRAP_READONLY_OPS or option in _BWRAP_SHADOW_OPS:
            writable = False
    return writable


_SBPL_RULE = re.compile(r"^\((allow|deny) file-write\*\s+(.*)\)$")
_SBPL_LITERAL = re.compile(r'\((subpath|literal) "((?:[^"\\]|\\.)*)"\)')


def _sbpl_unescape(text):
    return text.replace('\\"', '"').replace("\\\\", "\\")


def _seatbelt_allows_write(spec, target):
    """Whether the rendered Seatbelt profile would leave *target* writable.

    SBPL is last-match-wins, so the profile is replayed in order too.  Unlike a
    bind, a ``subpath`` rule is a pattern evaluated per access and does not care
    whether the path exists — which is why Seatbelt never had bubblewrap's
    missing-carve-out hole, and why the parity assertion is worth having.
    """
    writable = False  # `(deny default)` is the first line of every profile
    for line in build_seatbelt_profile(spec).splitlines():
        rule = _SBPL_RULE.match(line)
        if rule is None:
            continue
        verb, body = rule.group(1), rule.group(2)
        for form, raw in _SBPL_LITERAL.findall(body):
            path = Path(_sbpl_unescape(raw))
            covered = path == target or (form == "subpath" and path in target.parents)
            if covered:
                writable = verb == "allow"
    return writable


#: One reader per backend, so a parity test can compare their verdicts directly.
WRITE_READERS = {
    "bubblewrap": _bubblewrap_allows_write,
    "seatbelt": _seatbelt_allows_write,
}


@verifies(SWR.SWR_2507)
def test_both_backends_deny_the_control_directory_that_does_not_exist_yet(tmp_path):
    """Productive use: an agent runs sandboxed in a fresh SWR-2404 worktree, which
    has no `.rotaris` directory yet, and tries to write its own `agents.yaml`
    there — configuration the *next* run would obey.
    Expected outcome: both backends refuse, identically. A backend that denied it
    only when the directory already existed would be widening its own sandbox on
    exactly the workspaces SWR-2404 creates."""
    spec = _spec(tmp_path)
    control_dir = spec.workspace_root / ".rotaris"
    assert not control_dir.exists(), "the point of this test is that it does not exist"
    target = control_dir / "agents.yaml"

    verdicts = {name: reader(spec, target) for name, reader in WRITE_READERS.items()}

    # One assertion over both backends: a divergence is itself the defect, and
    # reporting it as `{'bubblewrap': True, 'seatbelt': False}` names which one.
    assert verdicts == {"bubblewrap": False, "seatbelt": False}


@verifies(SWR.SWR_2507)
def test_both_backends_deny_the_control_directory_that_already_exists(tmp_path):
    """Productive use: an agent runs sandboxed in a workspace that already has a
    `.rotaris` directory and tries to rewrite its permission configuration.
    Expected outcome: both backends refuse, and they refuse for the same reason
    they refuse the missing one — whether the directory happens to exist is not
    a security boundary."""
    spec = _spec(tmp_path)
    (spec.workspace_root / ".rotaris").mkdir()
    (spec.workspace_root / ".git").mkdir()
    target = spec.workspace_root / ".rotaris" / "agents.yaml"

    verdicts = {name: reader(spec, target) for name, reader in WRITE_READERS.items()}

    assert verdicts == {"bubblewrap": False, "seatbelt": False}


@verifies(SWR.SWR_2507)
def test_both_backends_still_allow_ordinary_work_in_the_workspace(tmp_path):
    """Productive use: an agent edits source files in a sandboxed session.
    Expected outcome: both backends allow it. Without this control the two tests
    above would also pass on a sandbox that denied everything, which would be a
    useless sandbox rather than a safe one."""
    spec = _spec(tmp_path)
    target = spec.workspace_root / "src" / "main.py"

    verdicts = {name: reader(spec, target) for name, reader in WRITE_READERS.items()}

    assert verdicts == {"bubblewrap": True, "seatbelt": True}


@verifies(SWR.SWR_2507)
def test_the_bubblewrap_reader_would_have_caught_the_original_carve_out_hole(tmp_path):
    """Meta-test: proves the parity reader can actually fail.

    Productive use: a future revision reverts the carve-out to the unconditional
    `--ro-bind-try` that shipped before.
    Expected outcome: the reader reports the workspace subtree writable again, so
    the parity test above turns red instead of quietly agreeing."""
    spec = _spec(tmp_path)
    target = spec.workspace_root / ".rotaris" / "agents.yaml"

    # The argv the buggy revision produced, rebuilt by hand.
    old_argv = ["bwrap", "--ro-bind", "/", "/"]
    old_argv += ["--bind", str(spec.workspace_root), str(spec.workspace_root)]
    for subpath in spec.readonly_subpaths:
        old_argv += ["--ro-bind-try", str(subpath), str(subpath)]

    writable = False
    for option, source, destination in _bwrap_mounts(old_argv):
        covered = Path(destination) == target or Path(destination) in target.parents
        if not covered:
            continue
        if option.endswith("-try") and source is not None and not Path(source).exists():
            continue
        writable = option in _BWRAP_WRITABLE_OPS

    assert writable is True, "the reader must be able to see the hole it was written to catch"


# ---------------------------------------------------------------------------
# The probe proves availability rather than assuming it
# ---------------------------------------------------------------------------


@verifies(SWR.SWR_2507, SWR.SWR_2508)
def test_a_bwrap_that_is_installed_but_cannot_start_reports_unavailable():
    """Productive use: a developer opts into the sandbox on Ubuntu 24.04, where
    `bwrap` is installed but `kernel.apparmor_restrict_unprivileged_userns`
    makes every invocation fail.
    Expected outcome: the probe says unavailable and quotes the kernel's own
    refusal — instead of reporting a sandbox that would fail on first use, which
    would lift the SWR-2508 downgrade for an autonomous run."""
    availability = probe_sandbox("linux", _which_finding("bwrap"), _trial_that_fails)

    assert availability.available is False
    assert availability.backend == "bubblewrap"
    assert "non-privileged user namespaces" in availability.reason
    assert "apparmor_restrict_unprivileged_userns" in availability.remediation


@verifies(SWR.SWR_2507)
def test_a_sandbox_exec_that_cannot_start_reports_unavailable():
    """Productive use: a developer opts into the sandbox on a macOS host where
    `sandbox-exec` is present but refuses to apply a profile.
    Expected outcome: the same verdict as on Linux. Both backends prove
    themselves the same way, so the verification protocol's results transfer
    between platforms."""
    availability = probe_sandbox(
        "darwin",
        _which_finding("sandbox-exec"),
        lambda argv: (False, "exit 1: sandbox-exec: sandbox_apply: Operation not permitted"),
    )

    assert availability.available is False
    assert availability.backend == "seatbelt"
    assert "sandbox_apply" in availability.reason
    assert availability.remediation


@verifies(SWR.SWR_2507)
def test_the_trial_launch_runs_once_per_process_and_can_be_forgotten():
    """Productive use: a session repaints its sandbox badge and consults
    `sandbox_status` on every command.
    Expected outcome: the trial is paid for once, not once per call — and the
    cache can be cleared, so a test suite is not order-dependent."""
    calls = []

    def counting_trial(argv):
        calls.append(tuple(argv))
        return (True, "")

    for _ in range(5):
        assert probe_sandbox("linux", _which_finding("bwrap"), counting_trial).available is True
    assert len(calls) == 1

    reset_sandbox_probe_cache()
    assert probe_sandbox("linux", _which_finding("bwrap"), counting_trial).available is True
    assert len(calls) == 2


@verifies(SWR.SWR_2507)
def test_the_probe_does_not_pay_for_a_trial_it_cannot_use():
    """Productive use: a developer on native Windows, or on Linux before
    installing bubblewrap, opens the settings dialog.
    Expected outcome: no subprocess is spawned at all — the cheap checks come
    first, and the diagnosis still names the missing tool."""
    # `_trial_that_must_not_run` raises if reached, so reaching it fails here.
    hosts = [
        ("win32", _which_finding("bwrap")),
        ("linux", _which_finding()),
        ("darwin", _which_finding()),
    ]

    verdicts = [probe_sandbox(name, which, _trial_that_must_not_run) for name, which in hosts]

    assert [verdict.available for verdict in verdicts] == [False, False, False]
    assert all(verdict.remediation for verdict in verdicts)


@verifies(SWR.SWR_2507, SWR.SWR_2508)
def test_a_trial_that_cannot_be_run_at_all_counts_as_unavailable():
    """Productive use: the trial launch fails for a reason that has nothing to do
    with the sandbox — the binary vanished, the process table is full.
    Expected outcome: unavailable. The asymmetry is deliberate: reporting
    unavailable on a working host costs a downgrade to `ask`, while reporting
    available on a broken one leaves an autonomous run unrestricted on the host.

    This exercises the real `run_sandbox_trial` against a real subprocess call,
    which is the one part of the probe that can be tested on this Windows host."""
    started, detail = run_sandbox_trial(["rotaris-no-such-sandbox-launcher", "--version"])

    assert started is False
    assert detail


@verifies(SWR.SWR_2507)
def test_neither_backend_relocates_the_working_directory(tmp_path):
    """Productive use: an agent runs `cd subdir` and then a build command in the
    same persistent shell, with the sandbox on.
    Expected outcome: neither wrapper resets the working directory, so the same
    command means the same thing on macOS and on Linux."""
    spec = _spec(tmp_path)

    assert "--chdir" not in build_bubblewrap_argv(spec)
    # Also absent from what actually reaches the shell, so a later revision
    # cannot re-introduce it in the wrap step instead of the argv builder.
    bubblewrap = BubblewrapBackend("linux", _which_finding("bwrap"), _trial_that_starts).wrap(
        "pwd",
        spec,
    )
    seatbelt = SeatbeltBackend("darwin", _which_finding("sandbox-exec"), _trial_that_starts).wrap(
        "pwd",
        spec,
    )
    assert "--chdir" not in shlex.split(bubblewrap)
    assert "cd " not in seatbelt


@verifies(SWR.SWR_2507)
def test_bubblewrap_argv_unshares_the_network_unless_asked_otherwise(tmp_path):
    """Productive use: a developer runs a sandboxed Linux session with no egress.
    Expected outcome: the command runs in its own network namespace by default,
    and only keeps the host network when the policy allows it."""
    assert "--unshare-net" in build_bubblewrap_argv(_spec(tmp_path))
    assert "--unshare-net" not in build_bubblewrap_argv(_spec(tmp_path, allow_network=True))


@verifies(SWR.SWR_2507)
def test_bubblewrap_read_only_mode_binds_no_writable_root(tmp_path):
    """Productive use: a developer runs a read-only sandboxed session on Linux.
    Expected outcome: no writable bind is emitted, leaving the read-only root
    bind and the temp filesystem as the whole picture."""
    argv = build_bubblewrap_argv(_spec(tmp_path, mode=SandboxMode.READ_ONLY))

    assert "--bind" not in argv
    assert "--tmpfs" in argv


@verifies(SWR.SWR_2507)
def test_read_only_mode_emits_no_carve_out_that_bwrap_could_not_mount(tmp_path):
    """Productive use: a developer runs a read-only sandboxed review session on a
    workspace that is not a git repository and has no `.rotaris` directory.
    Expected outcome: bwrap still launches. Nothing under the workspace is
    writable in this mode, so no carve-out is needed — and emitting one would be
    fatal rather than redundant, because bwrap must create a mount point before
    mounting over it and that create would land on a read-only tree."""
    spec = _spec(tmp_path, mode=SandboxMode.READ_ONLY)

    argv = build_bubblewrap_argv(spec)

    for subpath in spec.readonly_subpaths:
        assert str(subpath) not in argv
    # The protection is still real: nothing re-mounts the workspace writable,
    # so the enclosing read-only root bind is genuinely the whole story here.
    assert argv[argv.index("--ro-bind") + 1 : argv.index("--ro-bind") + 3] == ["/", "/"]
    verdicts = {
        name: reader(spec, spec.workspace_root / ".rotaris" / "agents.yaml")
        for name, reader in WRITE_READERS.items()
    }
    assert verdicts == {"bubblewrap": False, "seatbelt": False}


@verifies(SWR.SWR_2507)
def test_the_trial_launch_is_the_argv_a_real_session_would_use(tmp_path):
    """Productive use: an operator's host allows user namespaces but forbids
    network ones, and they opt into the sandbox.
    Expected outcome: the probe's trial exercises the same mounts a real command
    gets, so the host fails the probe instead of passing it and then failing every
    command. A trial weaker than the real invocation proves nothing about it."""
    from rotaris_core.sandbox.backends import BUBBLEWRAP_TRIAL_ARGV

    real = build_bubblewrap_argv(_spec(tmp_path))

    assert BUBBLEWRAP_TRIAL_ARGV[-2:] == ("--", "true")
    for option in ("--ro-bind", "--dev", "--proc", "--tmpfs", "--unshare-net"):
        assert option in real
        assert option in BUBBLEWRAP_TRIAL_ARGV
    # Building it must not have touched the filesystem or left a carve-out behind.
    assert "--remount-ro" not in BUBBLEWRAP_TRIAL_ARGV
    assert "--bind" not in BUBBLEWRAP_TRIAL_ARGV


@verifies(SWR.SWR_2507)
def test_seatbelt_wrap_keeps_a_compound_command_intact(tmp_path):
    """Productive use: an agent runs a piped, quoted shell command in a sandbox.
    Expected outcome: the command reaches the shell as one argument, unchanged,
    instead of being re-split or partly interpreted by the wrapper."""
    backend = SeatbeltBackend("darwin", _which_finding("sandbox-exec"), _trial_that_starts)

    wrapped = backend.wrap(COMPOUND_COMMAND, _spec(tmp_path))
    tokens = shlex.split(wrapped)

    assert tokens[0] == "sandbox-exec"
    assert tokens[-3:] == ["/bin/sh", "-c", COMPOUND_COMMAND]
    assert tokens[1] == "-p"
    assert tokens[2] == build_seatbelt_profile(_spec(tmp_path))


@verifies(SWR.SWR_2507)
def test_bubblewrap_wrap_keeps_a_compound_command_intact(tmp_path):
    """Productive use: an agent runs a piped, quoted shell command in a sandbox.
    Expected outcome: the command survives as a single argument after the bwrap
    argument list, so quoting inside it is not lost."""
    backend = BubblewrapBackend("linux", _which_finding("bwrap"), _trial_that_starts)

    wrapped = backend.wrap(COMPOUND_COMMAND, _spec(tmp_path))
    tokens = shlex.split(wrapped)

    assert tokens[0] == "bwrap"
    assert tokens[-3:] == ["/bin/sh", "-c", COMPOUND_COMMAND]
    assert tokens[-4] == "--"
    assert tokens[: len(build_bubblewrap_argv(_spec(tmp_path)))] == build_bubblewrap_argv(
        _spec(tmp_path)
    )


@verifies(SWR.SWR_2507)
def test_unavailable_backend_refuses_to_run_the_command(tmp_path):
    """Productive use: a developer on native Windows asks for a sandboxed command.
    Expected outcome: the attempt raises with both the reason and the fix, and
    never hands back a runnable unsandboxed command."""
    backend = UnavailableBackend("win32")

    with pytest.raises(SandboxUnavailableError) as excinfo:
        backend.wrap(COMPOUND_COMMAND, _spec(tmp_path))

    message = str(excinfo.value)
    assert excinfo.value.availability.reason in message
    assert excinfo.value.availability.remediation in message
    assert "WSL2" in message


@verifies(SWR.SWR_2507)
def test_no_backend_returns_the_bare_command_when_a_sandbox_was_asked_for(tmp_path):
    """Productive use: a developer opts into the sandbox on any host.
    Expected outcome: every backend either wraps the command or raises — none of
    them silently falls back to running it unsandboxed."""
    spec = _spec(tmp_path)
    backends = [
        SeatbeltBackend("darwin", _which_finding("sandbox-exec"), _trial_that_starts),
        SeatbeltBackend("darwin", _which_finding(), _trial_that_must_not_run),
        SeatbeltBackend("linux", _which_finding("sandbox-exec"), _trial_that_must_not_run),
        BubblewrapBackend("linux", _which_finding("bwrap"), _trial_that_starts),
        BubblewrapBackend("linux", _which_finding(), _trial_that_must_not_run),
        BubblewrapBackend("darwin", _which_finding("bwrap"), _trial_that_must_not_run),
        UnavailableBackend("win32"),
        UnavailableBackend("freebsd14"),
    ]

    for backend in backends:
        try:
            wrapped = backend.wrap(COMPOUND_COMMAND, spec)
        except SandboxUnavailableError:
            continue
        assert wrapped != COMPOUND_COMMAND
        assert shlex.split(wrapped)[-1] == COMPOUND_COMMAND


@verifies(SWR.SWR_2507)
def test_sandbox_off_runs_the_command_unchanged_on_every_backend(tmp_path):
    """Productive use: a developer leaves the sandbox off and runs a command.
    Expected outcome: the command is untouched on every host, including hosts
    where no sandbox exists, so opting out costs nothing."""
    spec = _spec(tmp_path, mode=SandboxMode.OFF)
    # Every trial refuses to run: `off` must not even ask whether a sandbox is
    # available, let alone pay for a subprocess to find out.
    backends = [
        SeatbeltBackend("darwin", _which_finding("sandbox-exec"), _trial_that_must_not_run),
        SeatbeltBackend("win32", _which_finding(), _trial_that_must_not_run),
        BubblewrapBackend("linux", _which_finding("bwrap"), _trial_that_must_not_run),
        BubblewrapBackend("win32", _which_finding(), _trial_that_must_not_run),
        UnavailableBackend("win32"),
    ]

    for backend in backends:
        assert backend.wrap(COMPOUND_COMMAND, spec) == COMPOUND_COMMAND
