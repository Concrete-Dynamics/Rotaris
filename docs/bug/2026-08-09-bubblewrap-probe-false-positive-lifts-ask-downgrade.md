# A `bwrap` that exists but cannot start reports the sandbox as available — and lifts the ask-mode safety net

> Found: 2026-08-09, while writing the SWR-2507 manual verification protocol.
> Status: **unverified prediction from reading the code.** Nobody has run it on such a host —
> that is the whole point of the protocol (`docs/testing/sandbox-verification-protocol.md`,
> step S2). Verify before fixing.
> Severity if real: **high** — protection is absent while every signal says it is present.

## The reasoning

`BubblewrapBackend.probe()` (`src/rotaris_core/sandbox/backends.py`, around line 314) decides
availability from two things: the platform string, and `shutil.which("bwrap")`. It never
attempts a trial invocation.

On a host that forbids unprivileged user namespaces — Ubuntu 24.04's
`kernel.apparmor_restrict_unprivileged_userns`, and many hardened or container-hosted
kernels — `bwrap` is installed and on `PATH`, but every invocation fails. The predicted
chain:

1. `probe()` reports available.
2. `sandbox_status` returns `(True, "bubblewrap")` — the function that is supposed to mean
   *configured **and** available*.
3. `SessionState.sandboxed` is `True`, the Rotaris badge says sandboxed, the `session.start`
   event says sandboxed.
4. **SWR-2508's downgrade is lifted**: an unattended autonomous run is no longer forced to
   `ask`, because the system believes a sandbox is protecting it.
5. Every terminal command then fails with a `bwrap:` error, which
   `HardenedTerminalExecutor` classifies as an ordinary non-zero exit — never as
   `sandbox_unavailable`.

Step 4 is what makes this more than a usability bug: the run is *less* protected than an
unsandboxed run would have been, because the fallback that exists for unsandboxed hosts has
been switched off by a false positive.

## What a fix would look like

Make `probe()` prove the backend actually works — a trial `bwrap --ro-bind / / true` (cheap,
run once per process and cached) rather than a `which`. Independently, teach the terminal
outcome classifier to recognise a `bwrap:`/`sandbox-exec:` startup failure as
`sandbox_unavailable` instead of a task failure, so the two failure modes stop looking
alike.

## How to confirm

Follow step S2 of `docs/testing/sandbox-verification-protocol.md` on a host with
unprivileged user namespaces disabled.

## What changed in code (2026-08-09) — status still **unverified**

Fixed on `unit/f5-sandbox-probe-carveout`. The status above does **not** change:
nothing here was executed on an affected host, because the machine this was written on is
native Windows and neither backend runs there. Everything below was verified through
injected mocks and rendered argv only. **Step S2 still has to be run on a real WSL2 host
before this report can be closed.**

- `BubblewrapBackend.probe()` and `SeatbeltBackend.probe()` now launch a throwaway sandbox
  after the `PATH` lookup, instead of stopping at it. The `bwrap` trial argv is rendered by
  `build_bubblewrap_argv` itself rather than hand-written, so it cannot drift from the
  invocation it stands in for — it exercises `--dev`, `--proc`, `--tmpfs` and `--unshare-net`
  as a real command would.
- The verdict is cached per process, keyed by `(argv, trial function)`, and cleared by
  `reset_sandbox_probe_cache()` so a test suite is not order-dependent. The trial timeout is
  5 s because `probe_sandbox` is called from the Rotaris GUI thread.
- **Anything inconclusive counts as unavailable** — a vanished binary, a refused namespace, a
  hung launch, an unexpected exception. The asymmetry is the reasoning: reporting unavailable
  on a working host costs a downgrade to `ask`, which is an annoyance; reporting available on
  a broken host is this bug.
- A `bwrap:` / `sandbox-exec:` startup failure now classifies as `sandbox_unavailable` rather
  than as an ordinary non-zero exit (step 5 of the chain above), on both the foreground path
  and the background poll/kill paths. The discriminator is that the launcher produced *all*
  of the output; a failing test suite inside a working sandbox stays a command failure, which
  matters more than the diagnosis itself — getting it wrong would make every red test run
  look like a broken sandbox.

Covered by `tests/integration/test_sandboxed_terminal.py::test_a_bwrap_that_cannot_start_still_forces_an_unattended_autonomous_run_to_ask`,
which drives the whole chain (probe → `sandbox_status` → `SessionState.sandboxed` → the
SWR-2508 downgrade) in one test, with a control asserting the same host keeps `autonomous`
when the trial succeeds.
