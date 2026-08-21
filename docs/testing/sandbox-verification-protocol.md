# OS-Level Sandbox — Manual Verification Protocol (SWR-2507)

> **Status: written, NOT YET EXECUTED.**
>
> No step in this document has been run. It was authored on native Windows,
> which is the one platform on which the sandbox provably cannot run
> (`UnavailableBackend`), so the author could not execute a single step and does
> not claim to have. Every "expected result" below is derived from reading the
> implementation and the documented behaviour of `bwrap` and `sandbox-exec` —
> it is a *prediction to be tested*, not an observation.
>
> **SWR-2507 remains unverified on a real host until the [results
> table](#results-table) at the end of this document is filled in and
> committed.** Until then the requirement's own "Known limits" bullet — *"no
> end-to-end sandboxed execution has ever run in this repository's CI or on the
> maintainer's machine"* — stands unchanged.
>
> Steps whose outcome the author is genuinely unsure of are marked
> **[UNCERTAIN]** and say what the doubt is. Treat those as questions, not as
> assertions. If reality disagrees with a prediction here, reality wins and the
> prediction is the defect — see [Recording the outcome](#recording-the-outcome).

## 1. Why a manual protocol exists

The guarantee in SWR-2507 is enforced by an OS kernel: Apple Seatbelt via
`sandbox-exec -p` on macOS, bubblewrap via `bwrap` on Linux and WSL2. A test
suite running on native Windows cannot exercise a kernel that is not there.

What the automated suite already covers is *everything above the kernel*, and it
covers it well — do not repeat it here:

| Already covered automatically | Where |
| --- | --- |
| Mode/spec resolution, writable roots, carve-out construction, profile and argv rendering, per-platform availability probe, the no-fallback raise | `tests/unit/test_sandbox_spec.py`, `tests/unit/test_sandbox_backends.py`, `tests/unit/test_sandbox_wiring.py`, `tests/unit/test_runtime_policy_sandbox_config.py` |
| The terminal executor wraps foreground **and** background commands; an unavailable sandbox stops the session instead of running unwrapped; the snapshot never claims a sandbox that did not run | `tests/integration/test_sandboxed_terminal.py` |
| `fetch` refuses a denied host before any socket is opened, including on a redirect hop | `tests/integration/test_fetch_egress_policy.py` |
| The SWR-2508 downgrade of an unattended autonomous run | `tests/unit/test_permission_modes.py`, `tests/integration/test_permission_denial_e2e.py` |

Those tests inject a `FakeBackend`. What they cannot answer is the only question
that matters for a *security* requirement:

> **When the real `bwrap` / `sandbox-exec` runs the exact string Rotaris builds,
> does the kernel actually refuse the writes and the network we believe it
> refuses?**

That is what this protocol answers.

## 2. Read this before running anything: what the sandbox does and does not confine

Two properties surprise people, and both are deliberate. Misreading either one
produces a false failure or, worse, a false pass.

**Reads are broad, by design.** SWR-2507 says the workspace is writable and
*"the rest of the filesystem is readable but not writable"*. The implementation
matches: the Seatbelt profile emits `(allow file-read* (subpath "/"))`
(`src/rotaris_core/sandbox/backends.py`, `build_seatbelt_profile`) and the
bubblewrap argv starts with `--ro-bind / /` (`build_bubblewrap_argv`).

> **Therefore `cat /etc/passwd` inside the sandbox is expected to SUCCEED.**
> A verifier who expects a refused read and records a FAIL has misread the
> requirement. A verifier who *gets* a refusal has found a divergence worth
> reporting, because the toolchain the agent needs would break the same way.
> Step **S8** exists precisely to pin this expectation down in writing.
> Confinement of secrets by *reading* is not a property SWR-2507 offers; if it
> is wanted, it is a new requirement, not a bug in this one.

**Terminal-side network is a binary kernel switch; per-host filtering belongs to
`fetch`.** SWR-2505's "Known limits" states it plainly: the sandbox can close
the network for a command or leave it open; it cannot allow `pypi.org` and deny
`evil.test` for the same `pip install`. Per-host allow/ask/deny applies to the
`fetch` tool, where Rotaris owns the socket — and `fetch` runs **inside the
Rotaris process, not inside the sandbox**, so `runtime.sandbox_allow_network`
has no effect on it whatsoever. Steps **S10/S11** verify the kernel switch;
step **S15** verifies the per-host filter and that the two are independent.

## 3. The methodology rule that prevents a false pass

A denied write and an ordinary failed write look almost identical in a terminal.
This is the single most likely way this verification produces a false pass.

> **Rule: every negative step is invalid without its control run.**
>
> A negative step consists of *two* executions of the same command:
>
> 1. **Control** — the same command, sandbox **off**, must **SUCCEED**.
> 2. **Sandboxed** — the same command, sandbox **on**, must **FAIL**.
>
> A negative step whose control run also fails proves nothing and is recorded as
> **INVALID**, never as PASS.

The classic trap: `echo x > /etc/rotaris-probe` fails for an unprivileged user
*whether or not a sandbox is present*. It is therefore useless as evidence, and
this protocol deliberately does **not** use it. The negative-write targets below
are all paths the operator can genuinely write to when unsandboxed:
`$HOME/…`, `<workspace>/.git/…`, `<workspace>/.rotaris/…`.

### Telling a genuine denial from an ordinary failure

| Signal | Genuine sandbox denial | Ordinary failure |
| --- | --- | --- |
| bubblewrap, write outside a writable root | `Read-only file system` (EROFS, errno 30) — the whole tree is `--ro-bind / /` | `Permission denied` (EACCES) from ordinary Unix permissions; `No such file or directory` (ENOENT) from a typo'd path |
| Seatbelt, write outside a writable root | `Operation not permitted` (EPERM, errno 1) plus a `deny file-write*` entry in the system log (see below) | `Permission denied` (EACCES, errno 13) |
| Seatbelt, network denied | `connect` fails with **EPERM (errno 1)** — the kernel refuses the syscall | `Connection refused` (ECONNREFUSED, errno 61 on macOS) means nothing was listening; that is *not* the sandbox |
| bubblewrap, network denied | The command runs in an empty net namespace: `/proc/net/dev` lists only `lo`, and a listener on the host's loopback is unreachable | DNS failure / timeout, which also happens on a host that is simply offline |
| Sandbox could not be *applied* at all | Rotaris returns an observation with `failure_kind: "sandbox_unavailable"` and `exit_code: 126`, and the command never runs (`HardenedTerminalExecutor.__call__`) | Any other `failure_kind` (`execution_error`, `timeout`, …) means the command *did* run |
| bubblewrap could not *start* | `bwrap:` prefix on stderr, e.g. `bwrap: No permissions to create new namespace` | Anything without a `bwrap:` prefix came from the command itself |
| Seatbelt could not parse the profile | `sandbox-exec: ... failed to parse` / `sandbox_apply: ...` on stderr | Anything without a `sandbox-exec:` / `sandbox_apply:` prefix |

Two of these are the same class of trap and deserve calling out:

- **A `bwrap:`- or `sandbox-exec:`-prefixed error is a *broken wrapper*, not a
  working sandbox.** The command was refused *before* the kernel ever applied a
  confinement rule. Recording that as "denial → PASS" is a false pass. It is
  recorded as **FAIL of S2**, the runtime smoke step.
- **On macOS, the system log is the authoritative discriminator.** Run the
  denied command, then check the log. **[UNCERTAIN]** The author could not test
  the predicate; something in the shape of
  `log show --last 2m --style compact --predicate 'eventMessage CONTAINS "deny file-write"'`
  is the intended starting point, and the verifier should adjust it until it
  yields the entry (Console.app, filtering on `Sandbox`, is the fallback). Record
  the predicate that actually worked so the next run does not have to rediscover
  it.

## 4. Shared preparation

Do this once per host, inside the OS being verified (i.e. *inside* the WSL2
distribution, not in Windows).

```sh
# 1. A checkout of Rotaris and its environment.
cd /path/to/Rotaris
uv sync --all-packages

# 2. A workspace to run the sandbox against.  A real git checkout, because the
#    .git carve-out is one of the things under test.
export WS=$HOME/sbx-workspace
git init "$WS"
mkdir -p "$WS/.rotaris"
echo baseline > "$WS/inside.txt"

# 3. A scratch dir for the driver scripts.  Outside $WS on purpose.
export SBX=$HOME/sbx-scratch
mkdir -p "$SBX"
```

Record the commit under test: `git -C /path/to/Rotaris rev-parse --short HEAD`.

### The driver script

Every filesystem and network step goes through this one script. It builds the
spec exactly as `resolve_sandbox_spec` does, resolves the backend the host really
has, prints the wrapped string so it can be inspected, and runs it.

```sh
cat > "$SBX/sbx_probe.py" <<'PY'
"""Manual SWR-2507 probe: wrap one command with the host's real sandbox and run it.

usage: python sbx_probe.py WORKSPACE MODE NET COMMAND
  MODE  off | workspace-write | read-only
  NET   0 (sandbox denies network) | 1 (sandbox allows network)
"""
import subprocess
import sys
from pathlib import Path

from rotaris_core.sandbox.backends import resolve_backend
from rotaris_core.sandbox.spec import SandboxMode, SandboxSpec

workspace, mode, net, command = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
spec = SandboxSpec.for_workspace(
    Path(workspace),
    mode=SandboxMode(mode),
    allow_network=net == "1",
)
backend = resolve_backend()
print("backend:", backend.name)
print("probe:  ", backend.probe())

wrapped = backend.wrap(command, spec)          # SandboxMode.OFF returns it unchanged
print("wrapped:", wrapped)
print("-" * 60)

proc = subprocess.run(wrapped, shell=True, cwd=workspace, capture_output=True, text=True)
print("exit:", proc.returncode)
print("stdout:", proc.stdout, end="")
print("stderr:", proc.stderr, end="")
PY
```

Run it as `uv run python "$SBX/sbx_probe.py" "$WS" <mode> <net> '<command>'`.

`MODE=off` is how every **control run** is performed: `SeatbeltBackend.wrap` /
`BubblewrapBackend.wrap` return the command unchanged for `SandboxMode.OFF`, so
the control executes the identical string with no wrapper. That is the whole
point — the two runs differ *only* by the sandbox.

> Note on the driver: this exercises the real backend and the real kernel, but
> it bypasses `HardenedTerminalExecutor`. Steps **S12–S14** close that gap by
> driving the executor itself. Do not skip them: the executor is the chokepoint
> SWR-2507 relies on, and a backend that confines correctly while the executor
> forgets to call it would still be a broken product.

## 5. Preconditions

### S1 — the backend is *available*, not merely configured

`sandbox_status` answers *configured **and** available*
(`src/rotaris_core/sandbox/session.py`). Confirm both halves separately.

```sh
uv run python - <<'PY'
from rotaris_core.sandbox.backends import probe_sandbox, resolve_backend
print("resolved backend:", resolve_backend().name)
print("availability:    ", probe_sandbox())
PY
```

**Expected:** `available=True` and `backend='bubblewrap'` (Linux/WSL2) or
`backend='seatbelt'` (macOS), with empty `reason` / `remediation`.

Then the configured-and-available verdict the product actually reports:

```sh
uv run python - <<'PY'
import os
from rotaris_core.config.schema import PersonaConfig, RotarisConfig
from rotaris_core.sandbox.session import sandbox_status

cfg = RotarisConfig(
    personas={"coder": PersonaConfig(name="coder", model="small_model")},
    default_persona="coder",
    workspace_root=os.environ["WS"],
)
cfg.runtime.sandbox_mode = "workspace-write"
print("sandbox_status:", sandbox_status(cfg))   # -> (True, '<backend>')
cfg.runtime.sandbox_mode = "off"
print("sandbox off:   ", sandbox_status(cfg))   # -> (False, '')
PY
```

**Expected:** `(True, 'bubblewrap')` / `(True, 'seatbelt')`, then `(False, '')`.

**What a "configured but unavailable" host looks like** — the failure mode that
silently disables protection, and the reason `sandbox_status` returns `(False,
'')` rather than trusting the config:

| Host | `sandbox_mode` | `probe_sandbox()` | `sandbox_status()` | Consequence |
| --- | --- | --- | --- | --- |
| native Windows | `workspace-write` | `available=False, backend='unavailable'`, remediation points at WSL2 | `(False, '')` | Session refuses to build its terminal (`SandboxUnavailableError`); SWR-2508 downgrade stays in force |
| Linux without `bwrap` on PATH | `workspace-write` | `available=False, backend='bubblewrap'`, remediation `sudo apt-get install bubblewrap` | `(False, '')` | Same |
| macOS with `/usr/bin` off PATH | `workspace-write` | `available=False, backend='seatbelt'` | `(False, '')` | Same |
| **Linux *with* `bwrap` but unable to unshare** | `workspace-write` | **`available=True`** | **`(True, 'bubblewrap')`** | **See S2 — the dangerous one** |

### S2 — the backend can actually start (the probe does not check this)

`BubblewrapBackend.probe()` and `SeatbeltBackend.probe()` check exactly two
things: the platform string, and `shutil.which(...)`. Neither attempts a launch.

That leaves a real hole on Linux/WSL2: a kernel or AppArmor policy that forbids
unprivileged user namespaces makes `bwrap` fail *at exec time* while
`shutil.which("bwrap")` still finds the binary. The session then reports
`sandboxed: true`, the SWR-2508 downgrade is lifted, and every agent command
fails with a `bwrap:` error that the executor classifies as an ordinary
non-zero exit — **not** as `sandbox_unavailable`. Verify explicitly:

```sh
# Linux / WSL2
bwrap --version
bwrap --ro-bind / / --unshare-net -- /bin/true ; echo "unshare exit: $?"

# Context worth recording when the above fails:
cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null   # Debian-family knob
sysctl kernel.apparmor_restrict_unprivileged_userns 2>/dev/null  # Ubuntu 24.04+
```

**Expected:** `unshare exit: 0`.

**If it is non-zero, stop.** The host is in the dangerous state above; record S2
as FAIL, do not run S3 onwards (their results would be meaningless), and file
the bug described in [Recording the outcome](#recording-the-outcome).

```sh
# macOS
sw_vers                              # record ProductVersion + BuildVersion
command -v sandbox-exec              # expect /usr/bin/sandbox-exec
uv run python "$SBX/sbx_probe.py" "$WS" workspace-write 0 '/usr/bin/true'
```

**Expected (macOS):** `exit: 0` with no `sandbox-exec:` / `sandbox_apply:` text
on stderr. `sandbox-exec` has no `--version`; record the macOS product version
and build number as the backend version instead.

> **[UNCERTAIN] — macOS, and the step most likely to fail.** The rendered
> profile is `(deny default)` plus `process-exec`, `process-fork`,
> `sysctl-read`, `signal`, broad `file-read*`, writes to the temp subpaths and
> the character devices, and the writable roots. It grants **no**
> `mach-lookup`. Real macOS binaries routinely need Mach lookups (opendirectoryd
> for `whoami`/`getpwuid`, notifyd, mDNSResponder), so it is plausible that
> ordinary commands fail under this profile even though the *confinement* rules
> are correct. If S3/S4 fail on macOS with `deny mach-lookup` in the system log,
> that is a real defect in the profile, not an error in the protocol — record it
> as such.

## 6. Positive cases

| Step | Command (via the driver) | Expected |
| --- | --- | --- |
| **S3** | `uv run python "$SBX/sbx_probe.py" "$WS" workspace-write 0 'echo hello'` | `exit: 0`, `stdout: hello`. Unchanged from an unsandboxed run. |
| **S4** | `... workspace-write 0 'echo written > "$WS/inside.txt" && cat "$WS/inside.txt"'` | `exit: 0`, `stdout: written`, and `cat "$WS/inside.txt"` **outside** the sandbox afterwards also shows `written` — proving the write landed on the real filesystem, not in a throwaway overlay. |
| **S5** | `... workspace-write 0 'cd "$WS" && git status --short'` | `exit: 0`. Reads of `.git` are permitted; only writes are carved out. If this fails, the carve-out is too broad and git is unusable inside the sandbox — a serious usability defect. |

For S4, note the driver runs with `cwd=workspace`, and neither backend emits a
`--chdir` (documented in the `backends.py` module docstring), so a relative
command like `echo x > inside.txt` also works and is worth trying once to
confirm the working directory really is inherited.

## 7. Negative cases — the point of the exercise

Every step here is **control run first**. `MODE=off` for the control,
`MODE=workspace-write` for the sandboxed run.

### S6 — writing outside the workspace root is refused

```sh
# Control (MUST SUCCEED)
uv run python "$SBX/sbx_probe.py" "$WS" off 0 'echo escaped > "$HOME/sbx-escape.txt"'
rm -f "$HOME/sbx-escape.txt"

# Sandboxed (MUST FAIL)
uv run python "$SBX/sbx_probe.py" "$WS" workspace-write 0 'echo escaped > "$HOME/sbx-escape.txt"'
test -e "$HOME/sbx-escape.txt" && echo "LEAKED"     # must print nothing
```

**Expected sandboxed result:** non-zero exit; stderr says `Read-only file
system` (bubblewrap) or `Operation not permitted` (Seatbelt); the file does not
exist afterwards.

> The exact non-zero exit code is **not** load-bearing and should not be
> asserted: a failed redirection exits `2` under `dash` and `1` under `bash`, and
> `SHELL` is `/bin/sh`, whose identity differs per distribution. Record what you
> saw; judge on the *message* and on the file's absence.

`$HOME` is used deliberately rather than `/etc`: the operator can write to
`$HOME` unsandboxed, so the control run genuinely succeeds and the contrast
proves something. A `/etc` target would fail in both runs and prove nothing.

### S7 — the `.git` carve-out holds inside the writable root

```sh
uv run python "$SBX/sbx_probe.py" "$WS" off 0 'echo x > "$WS/.git/sbx-probe"'   # control: succeeds
rm -f "$WS/.git/sbx-probe"
uv run python "$SBX/sbx_probe.py" "$WS" workspace-write 0 'echo x > "$WS/.git/sbx-probe"'
test -e "$WS/.git/sbx-probe" && echo "LEAKED"
```

**Expected:** control succeeds, sandboxed fails, no file. This is the rule that
stops an agent planting a git hook that later runs *outside* the sandbox, so a
failure here is a P0-grade finding.

Repeat against `$WS/.rotaris/sbx-probe` (the directory was created in
[Shared preparation](#4-shared-preparation)) — same expectation. That rule stops
an agent widening its own sandbox.

> **[UNCERTAIN] — SBPL `(subpath …)` on a `.git` *file*.** In an SWR-2404
> worktree, `.git` is a regular file, not a directory. The Seatbelt profile
> denies it with `(deny file-write* (subpath "<root>/.git"))`, and the author
> could not confirm that `subpath` matches a non-directory path. Worth a
> dedicated run on macOS: `git worktree add` a second checkout, point `$WS` at
> it, and repeat S7.

### S7b — a *missing* `.rotaris` carve-out (hypothesis: bubblewrap leaks)

This step tests a specific suspicion. Do not skip it, and do not pre-judge it.

`build_bubblewrap_argv` emits the carve-outs with `--ro-bind-try`, whose
docstring argues that a missing bind source is safe because *"the enclosing
`--ro-bind / /` already covers the path"*. But the writable `--bind <root>
<root>` is emitted **before** the carve-outs and shadows that enclosing bind for
the whole workspace subtree. If that reading is right, a workspace with **no**
`.rotaris` directory — exactly the state of a fresh SWR-2404 worktree, per the
same docstring — lets a sandboxed command *create* `.rotaris` and write into it.
Seatbelt should not have this problem: `(deny file-write* (subpath …))` is a
pattern rule and does not care whether the path exists.

```sh
export WS2=$HOME/sbx-workspace-norotaris
git init "$WS2"                        # deliberately NO .rotaris directory
uv run python "$SBX/sbx_probe.py" "$WS2" workspace-write 0 \
  'mkdir -p "$WS2/.rotaris" && echo pwned > "$WS2/.rotaris/agents.yaml"'
cat "$WS2/.rotaris/agents.yaml" 2>/dev/null
```

**Expected (the requirement's intent):** the command fails and no file exists —
`.rotaris` is protected whether or not it existed beforehand.

**If instead the file is created and contains `pwned`:** the carve-out does not
survive a missing source under bubblewrap, and a fresh worktree can write its
own `.rotaris/agents.yaml` — that is, widen or disable its own sandbox on the
next run. Record FAIL and file it as a security bug; it is the highest-value
finding this protocol can produce.

Run the same step on macOS to confirm the two backends agree; a divergence is
itself a defect, since the whole point of `SandboxSpec` is that one policy
decision is enforced identically everywhere.

### S8 — reading `/etc/passwd` is **expected to succeed** (see §2)

```sh
uv run python "$SBX/sbx_probe.py" "$WS" workspace-write 0 'head -1 /etc/passwd'
uv run python "$SBX/sbx_probe.py" "$WS" workspace-write 0 'echo x >> /etc/passwd'
```

**Expected:** the first exits `0` and prints a line (broad reads are the
documented policy). The second fails — but note it would fail unsandboxed too,
so it is recorded as *consistent*, never as evidence. The load-bearing
write-denial evidence is S6/S7, which have valid controls.

Record the read result honestly. `PASS` here means "read succeeded, as
specified". If the read is *refused*, record FAIL and note that the sandbox is
tighter than SWR-2507 describes — which breaks toolchains and is a real defect.

### S9 — `read-only` mode makes the workspace read-only, temp still writable

```sh
uv run python "$SBX/sbx_probe.py" "$WS" read-only 0 'echo x > "$WS/inside.txt"'   # must FAIL
uv run python "$SBX/sbx_probe.py" "$WS" read-only 0 'echo x > /tmp/sbx && cat /tmp/sbx'  # must SUCCEED
```

`effective_writable_roots()` returns `()` for `read-only`, and every backend
grants the temporary directory unconditionally ("a toolchain that cannot write a
temp file cannot run").

**Also record the temp-directory divergence between backends** — it is real and
undocumented outside the source:

| Path | bubblewrap | Seatbelt |
| --- | --- | --- |
| `/tmp` | fresh **tmpfs** — writable, but the host's `/tmp` contents are invisible and writes vanish with the sandbox | the **host's** `/tmp`, readable *and* writable; writes persist |
| `/var/tmp` | under `--ro-bind / /` → **read-only** | in `SEATBELT_TEMP_SUBPATHS` → **writable** |

Verify with `... 'ls /tmp'` inside vs outside, and `... 'echo x > /var/tmp/sbx'`
on both platforms. A command that relies on `/var/tmp` therefore behaves
differently per host, which is worth a follow-up requirement if it bites.

### S10 / S11 — the terminal network switch

Use a **local listener**, not the internet: it is deterministic, works offline,
and cannot produce a false pass from a flaky DNS server.

In a second shell on the host (outside any sandbox):

```sh
python3 -c "import socket;s=socket.socket();s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1);s.bind(('127.0.0.1',48231));s.listen(1);print('listening');s.accept()"
```

Save the client probe:

```sh
cat > "$SBX/netprobe.py" <<'PY'
import socket
s = socket.socket()
s.settimeout(5)
try:
    s.connect(("127.0.0.1", 48231))
    print("CONNECTED")
except OSError as exc:
    print("FAILED errno", exc.errno, exc)
PY
```

| Step | Command | Expected |
| --- | --- | --- |
| **S10** (closed) | `uv run python "$SBX/sbx_probe.py" "$WS" workspace-write 0 'python3 '"$SBX"'/netprobe.py'` | `FAILED`. On **Seatbelt** the errno is the discriminator: **1 = EPERM** means the kernel refused the syscall (genuine denial); 61 = ECONNREFUSED means nothing was listening (invalid — restart the listener and retry). On **bubblewrap** expect ECONNREFUSED (errno 111) because `--unshare-net` puts the command in a *separate* loopback; the discriminator there is S10b below, not the errno. |
| **S10b** (bubblewrap only) | `... workspace-write 0 'cat /proc/net/dev'` | Only the `lo` interface is listed. This is the definitive, offline, network-independent proof that `--unshare-net` took effect. |
| **S11** (open) | `uv run python "$SBX/sbx_probe.py" "$WS" workspace-write 1 'python3 '"$SBX"'/netprobe.py'` | `CONNECTED`. With `NET=1` no `--unshare-net` is emitted and the profile carries `(allow network*)`. On bubblewrap, `cat /proc/net/dev` now lists the host's real interfaces. |
| **S11b** (optional, needs internet) | `... workspace-write 0 'curl -sS -m 10 https://example.com'` then `... workspace-write 1 '…'` | Fails then succeeds. Optional because a failure with `NET=0` alone is indistinguishable from an offline host — only the A/B carries information. |

S10 and S11 together are the evidence; either alone is not.

> **[UNCERTAIN] — Seatbelt `(deny network*)` and AF_UNIX.** SBPL's `network*`
> family is understood to cover local (Unix-domain) sockets as well as IP.
> If so, denying the network may break unrelated machinery that talks to system
> daemons over Unix sockets, so ordinary commands could fail with `NET=0` on
> macOS while working fine with `NET=1`. Re-run S3 and S5 with `NET=0` on macOS
> and record whether they still pass. If they do not, the network switch is
> over-broad on Seatbelt and needs a narrower rule.

## 8. The chokepoint: `HardenedTerminalExecutor`

The driver script proves the *backend*. These steps prove the **product** uses
it, at the one place both spawn paths pass through
(`HardenedTerminalExecutor.__call__`, `src/rotaris_core/tools/terminal.py`).

```sh
cat > "$SBX/exec_probe.py" <<'PY'
"""Drive the real terminal executor with a real sandbox spec."""
import os
import sys
from pathlib import Path

from rotaris_core.sandbox.spec import SandboxMode, SandboxSpec
from rotaris_core.tools.terminal import HardenedTerminalAction, HardenedTerminalExecutor

ws = Path(os.environ["WS"]).resolve()
spec = SandboxSpec.for_workspace(ws, mode=SandboxMode.WORKSPACE_WRITE)
# sandbox_backend is left unset on purpose: __init__ then calls resolve_backend(),
# i.e. the same production path a real session takes.
ex = HardenedTerminalExecutor(working_dir=str(ws), sandbox_spec=spec)
try:
    obs = ex(HardenedTerminalAction(command=sys.argv[1], timeout=60, background=len(sys.argv) > 2))
    print("command echoed back:", obs.command)
    print("exit_code:  ", obs.exit_code)
    print("failure_kind:", obs.failure_kind)
    print("text:", (obs.text or "")[:2000])
finally:
    ex.cleanup()
PY
```

| Step | Command | Expected |
| --- | --- | --- |
| **S12** foreground | `uv run python "$SBX/exec_probe.py" 'echo hello'` then `... 'echo escaped > "$HOME/sbx-escape.txt"'` | The first succeeds. The second fails with the backend's denial message, and `$HOME/sbx-escape.txt` does not exist. In **both** cases `command echoed back` is the agent's own command, not the `bwrap`/`sandbox-exec` wrapper (`_with_display_command`). |
| **S13** background | `uv run python "$SBX/exec_probe.py" 'echo escaped > "$HOME/sbx-escape.txt"' bg` | Also refused, and no file. `background=True` routes through a separate `subprocess.Popen(..., shell=True)`; `_sandbox_applies` deliberately ranks `background` above `session_id` so it cannot be used as a one-flag escape. This is the step that proves it on a real kernel. |
| **S14** unavailable | `env PATH=/var/empty "$(uv run python -c 'import sys;print(sys.executable)')" "$SBX/exec_probe.py" 'echo hello'` | `failure_kind: sandbox_unavailable`, `exit_code: 126`, and the command did **not** run. Emptying `PATH` makes `shutil.which("bwrap")` return `None`, so the probe reports unavailable exactly as a host without the backend would. **[UNCERTAIN]** — an approximation of a genuinely backend-less host; if the interpreter cannot start with an empty `PATH`, instead move/rename the `bwrap` binary for the duration of this one step and put it back afterwards. |

For S14, "did not run" is checked the same way as everywhere else: the side
effect must be absent. Use `'echo ran > "$WS/s14.txt"'` as the command and
confirm `$WS/s14.txt` does not exist.

## 9. `fetch` egress: per-host, and independent of the sandbox (S15)

`fetch` is a Rotaris in-process tool. It is **not** sandboxed, and
`runtime.sandbox_allow_network` does not affect it. Its per-host allow/ask/deny
is what SWR-2505 actually delivers.

```sh
uv run python - <<'PY'
from rotaris_core.permissions.network import NetworkEgressPolicy
from rotaris_core.tools.fetch import FetchAction, FetchExecutor

url = "https://example.com/"

denied = NetworkEgressPolicy(disposition="allow", denied_hosts=("example.com",))
obs = FetchExecutor(egress_policy=denied)(FetchAction(url=url))
print("denied  ->", obs.failure_kind, "|", obs.detail)

allowed = NetworkEgressPolicy(disposition="deny", allowed_hosts=("example.com",))
obs = FetchExecutor(egress_policy=allowed)(FetchAction(url=url))
print("allowed ->", obs.failure_kind, obs.status_code)
PY
```

**Expected:**

- Denied: `failure_kind == "egress_denied"`, and `detail` names the host and the
  rule that blocked it. Note that `disposition="allow"` did **not** save it —
  precedence is deny → allow → default.
- Allowed: `failure_kind is None` and `status_code == 200` (needs internet).
  Note that `disposition="deny"` did **not** block it.

The *same URL* with opposite outcomes under two policies is the whole evidence;
a single run proves nothing, because an unreachable host also "fails".

**And the independence check:** repeat both halves once with the session's
`sandbox_allow_network` set to `false` and once with it `true`. The results must
be identical. If they differ, something is wiring the kernel switch into `fetch`,
which contradicts both requirements.

## 10. The SWR-2508 interaction (S17)

On a host with **no** sandbox backend, an unattended autonomous run must be
downgraded to `ask`. Perform this on native Windows (where the backend genuinely
cannot exist), or on Linux/macOS with the backend binary hidden.

Config — merge into `<workspace>/.rotaris/agents.yaml` (workspace scope; it
merges over the global scope):

```yaml
runtime:
  permission_mode: autonomous
  sandbox_mode: workspace-write        # asked for, but unavailable on this host
  allow_unsandboxed_autonomous: false  # the default; stated for clarity
```

Run it unattended. `rotaris-headless` has no approval UI, so it is unattended by
definition (SWR-2508: "sessions with no approval host, or with a host registered
for lifecycle reasons only … are unattended"):

```sh
cd "$WS"
uv run rotaris-headless run "List the files in this directory." \
  --output-format stream-json > run.jsonl 2> run.err
```

**How to observe the downgrade** — four independent observables, all produced by
`announce_effective_permission_mode` (`src/rotaris_core/permissions/modes.py`):

1. **The session snapshot** —
   `<workspace>/.rotaris/sessions/<session-id>/state/resume.json` must contain
   `"permission_mode": "ask"`, `"sandboxed": false`, `"sandbox_backend": ""`.
2. **The transcript** —
   `<workspace>/.rotaris/sessions/<session-id>/state/ui_transcript.json`
   contains a `system` message whose text is the downgrade reason, beginning
   `Permission mode 'autonomous' was downgraded to 'ask' for this run:`.
3. **The diagnostics timeline** —
   `<workspace>/.rotaris/sessions/<session-id>/timeline.jsonl` contains an entry
   of type `permission_mode_downgraded` with metadata
   `{"requested_mode": "autonomous", "effective_mode": "ask"}`. (Emitted only
   when a diagnostics object is passed; `cli/background.py` does pass one, the
   TUI does not.)
4. **The log** — `run.err` carries a `WARNING` line with the same reason text.

Then flip the opt-in to `allow_unsandboxed_autonomous: true`, rerun, and confirm
`resume.json` shows `"permission_mode": "autonomous"` while `"sandboxed"` stays
`false` — the opt-in buys the mode, never a sandbox that did not run.

> **Do not look for the downgrade in `session.start`.** `RalphLoop._publish_session_start`
> populates `permission_mode` from `self.config.runtime.permission_mode` — the
> **configured** value, not the resolved effective one — while `sandboxed` does
> come from the availability verdict. So a downgraded run still streams
> `"permission_mode": "autonomous"` with `"sandboxed": false`. The author
> believes this is a reporting gap worth raising separately; either way, the
> stream event is not a valid observation point for the downgrade, and the four
> observables above are.

### S16 — `session.start.sandboxed` on a host that *does* have a sandbox

Same run, on the WSL2/macOS host, with the sandbox available:

```sh
cd "$WS"
uv run rotaris-headless run "List the files in this directory." --output-format stream-json \
  | tee run.jsonl \
  | uv run python -c "import json,sys; [print(l.strip()) for l in sys.stdin if '\"session.start\"' in l]"
```

**Expected:** the `session.start` line carries `"sandboxed": true`, and
`resume.json` carries `"sandboxed": true` with `"sandbox_backend": "bubblewrap"`
or `"seatbelt"`. Requires working model credentials; if unavailable, mark S16
`N/A — no credentials` rather than guessing.

Optional, desktop only: with Rotaris running on the same host, confirm the
session dialog's sandbox toggle and the workspace badge report the same verdict
(the automated coverage is `apps/rotaris/tests/test_sandbox_toggle.py` and
`apps/rotaris/tests/test_settings_sandbox_egress.py`).

## Results table

Copy this block, fill it in, and commit it (see below). One block per host.

```
Date:              ____-__-__
Verifier:          ______________________
Host / hardware:   ______________________
OS + version:      ______________________   (Linux: `uname -a` + /etc/os-release;
                                             macOS: `sw_vers` ProductVersion + BuildVersion;
                                             WSL2: also `wsl.exe -l -v` from Windows)
Backend:           bubblewrap | seatbelt
Backend version:   ______________________   (`bwrap --version`; macOS: record the
                                             macOS build, sandbox-exec has no version)
Rotaris commit:    ______________________   (`git rev-parse --short HEAD`)
Shell (/bin/sh):   ______________________   (`ls -l /bin/sh` — dash vs bash vs zsh
                                             changes the exit codes you will see)
```

| Step | What it checks | Control run required | Control result | Sandboxed result | Verdict | Notes / exact message |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `probe_sandbox` / `sandbox_status` report *available*, not merely configured | no | — | | | |
| S2 | The backend can actually start (namespace / profile smoke) | no | — | | | |
| S3 | Ordinary command inside the workspace succeeds unchanged | no | — | | | |
| S4 | Write inside the workspace succeeds and persists on the real FS | no | — | | | |
| S5 | `git status` works inside the sandbox (carve-out is not too broad) | no | — | | | |
| S6 | Write outside the workspace root is refused | **yes** | | | | |
| S7 | `.git` and `.rotaris` stay read-only inside the writable root | **yes** | | | | |
| S7b | A *missing* `.rotaris` is still protected (bubblewrap `--ro-bind-try`) | **yes** | | | | |
| S8 | `/etc/passwd` **read succeeds** (documented policy, §2) | no | — | | | |
| S9 | `read-only` mode: workspace unwritable, temp writable; temp divergence recorded | **yes** | | | | |
| S10 | Network denied: terminal command cannot reach the local listener | **yes** (= S11) | | | | errno: |
| S10b | bubblewrap only: `/proc/net/dev` shows `lo` alone | no | — | | | |
| S11 | Network allowed: the same probe connects | no | — | | | |
| S11b | Optional internet A/B (`curl https://example.com`) | **yes** | | | | |
| S12 | Foreground command through `HardenedTerminalExecutor` really is wrapped | **yes** | | | | |
| S13 | `background=True` is equally wrapped (separate spawn path) | **yes** | | | | |
| S14 | Unavailable sandbox → `sandbox_unavailable`, exit 126, nothing ran | no | — | | | |
| S15 | `fetch`: same URL denied then allowed; unaffected by `sandbox_allow_network` | n/a (A/B) | | | | |
| S16 | `session.start.sandboxed` = true on a sandboxed host | no | — | | | |
| S17 | No backend → unattended autonomous run downgraded to `ask` (4 observables) | no | — | | | |

Verdicts: `PASS` · `FAIL` · `INVALID` (control run did not behave as required, so
the step proves nothing) · `N/A — <reason>` · `BLOCKED — <reason>`.

A bare `N/A` is insufficient, per the house rule in
[`test_strategy.md`](test_strategy.md).

## Recording the outcome

1. **Fill the table in this file** and commit it on a branch named
   `verify/swr-2507-<host-shorthand>` (e.g. `verify/swr-2507-wsl2-ubuntu2404`),
   then open a PR. The completed table *is* the record — there is no separate
   results store, and a run that is not committed here did not happen.
2. **Every FAIL gets a bug report** under `docs/bug/`, following the existing
   naming convention `YYYY-MM-DD-<slug>.md`. Include the exact wrapped command
   string the driver printed, the full stderr, and the control-run output —
   without the control run a report cannot be triaged.
3. **Only when every step on at least one macOS host *and* one Linux/WSL2 host
   is PASS** may SWR-2507's first "Known limits" bullet be amended. That edit
   belongs to whoever owns `docs/requirements/`; it is a separate change from
   this one, and it must cite the commit that carries the filled-in table.
4. **If a prediction in this document turns out to be wrong**, fix the
   prediction here in the same PR and say so in the notes column. A protocol
   that quietly keeps a wrong expectation will manufacture false failures for
   the next verifier.
