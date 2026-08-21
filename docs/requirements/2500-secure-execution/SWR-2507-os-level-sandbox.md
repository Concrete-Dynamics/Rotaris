---
req-id: SWR-2507
status: approved
trace: required
test: required
title: "Opt-in OS-level sandbox for terminal execution"
epic: SWR-2500
priority: P1
date: 2026-08-03
source: docs/research/marktanalyse-agentic-harnesses-2026-08.md
---

# SWR-2507 — Opt-in OS-level sandbox for terminal execution

Sessions MUST be launchable with an **OS-level sandbox** that confines every
terminal command the agent runs. The sandbox is applied *per command*, as a
wrapper around the command string — there is no container runtime, no image and
no daemon. This is the mechanism Codex CLI and Claude Code ship, and the one
Rotaris ships:

| Host | Backend | Mechanism |
| --- | --- | --- |
| macOS | Apple Seatbelt | `sandbox-exec -p <SBPL profile> /bin/sh -c <command>` |
| Linux, WSL2 | bubblewrap | `bwrap <binds> -- /bin/sh -c <command>` |
| native Windows | none | probes unavailable; remediation points at WSL2 |

- **Opt-in per session.** `runtime.sandbox_mode` (`off` | `workspace-write` |
  `read-only`, default `off`) plus the per-session toggle in the Rotaris session
  dialog, analogous to the worktree-isolation toggle (SWR-2404). The headless
  CLI is config-driven only; a dedicated launch flag is deferred.
- **The workspace — or its SWR-2404 worktree — is writable; the rest of the
  filesystem is readable but not writable.** `read-only` makes nothing writable
  except the temporary directory. `.git` and `.rotaris` stay read-only inside
  the writable root and that carve-out is not configurable: an agent that can
  rewrite `.git` can plant a hook that later runs *outside* the sandbox, and an
  agent that can rewrite `.rotaris` can widen its own sandbox.
- **No network unless the policy allows it.** Default is a closed network
  (`--unshare-net` / `(deny network*)`); `runtime.sandbox_allow_network` opens
  it. This is a binary kernel-level switch, not per-host filtering — see the
  limits below and SWR-2505.
- **The sandbox never silently falls back to unsandboxed execution.** When the
  host cannot provide the requested sandbox, or the wrapper cannot be built, the
  session surfaces the reason *and its remediation* and the command does not
  run. Every backend raises rather than returning an unwrapped command, so the
  fallback is unreachable by accident rather than merely unused.
- **The session snapshot records whether the run was sandboxed** and by which
  backend, so history and status displays can surface it (pattern of SWR-2402).
  "Sandboxed" means *configured and available*, never merely configured —
  including on the `session.start` event of the headless stream (SWR-1828).
- Relation to SWR-2102 (official Docker image, distribution): independent —
  this requirement is about confining *agent commands*, not about shipping
  Rotaris as a container.

## Why a per-command wrapper and not a container

Rejected on purpose. `HardenedTerminalExecutor.__call__` is a single chokepoint
and **both** spawn paths below it — the agent SDK's foreground terminal and the
background `subprocess.Popen(..., shell=True)` — carry a plain command *string*,
so a string→string wrapper covers both with one change. A container executor
would have had to replace the SDK's terminal wholesale and would *still* have
left the background spawn path running on the host. A container also costs an
image, a daemon and a mount model that the reference harnesses concluded is not
what an interactive coding agent needs.

## Known limits

These are deliberate, and stated rather than implied:

- **The sandbox cannot be exercised on native Windows**, which is the
  maintainer's platform. Every backend is a pure function of
  `(spec, platform_name, which)` with the platform and the executable lookup
  injected, so the whole macOS/Linux/Windows matrix is unit-tested from Windows.
  But **no end-to-end sandboxed execution has ever run in this repository's CI
  or on the maintainer's machine**: the evidence for the rendered Seatbelt
  profile and `bwrap` argv is that they are the documented invocations, not that
  they were observed confining a real process.
- **Network confinement is all-or-nothing.** The sandbox can close the network
  or leave it open; it cannot allow one host and deny another. Per-host control
  for terminal commands needs a proxy plus a kernel backstop and is deferred
  (SWR-2505).
- **No CLI launch flag.** `rotaris-cli` / `rotaris-headless` read
  `runtime.sandbox_mode` from config; only the desktop app offers a per-session
  override.

## Acceptance criteria

- A session configured with `sandbox_mode: workspace-write` on a supported host
  runs its terminal commands through the backend wrapper, including commands
  spawned in background mode.
- A session configured for a sandbox on a host that cannot provide one reports
  the reason and the remediation and runs nothing unsandboxed.
- `SessionState.sandboxed` / `.sandbox_backend`, the Rotaris workspace badge and
  `session.start.sandboxed` all report the same configured-and-available verdict.

## Test portfolio

| Level | Productive scenario | Exercised boundary | Planned/covering test |
| --- | --- | --- | --- |
| Unit | Mode/spec resolution, writable-root and carve-out construction, profile and argv rendering, availability probe per platform, the no-fallback raise | Sandbox spec and backend API | `tests/unit/test_sandbox_spec.py`, `tests/unit/test_sandbox_backends.py`, `tests/unit/test_sandbox_wiring.py`, `tests/unit/test_runtime_policy_sandbox_config.py` |
| Integration | The terminal executor wraps foreground and background commands, and refuses to run when the sandbox is unavailable; an unavailable sandbox is never reported as active | Terminal executor chokepoint, session status seam | `tests/integration/test_sandboxed_terminal.py`, `tests/integration/test_epic_seams.py` |
| User-flow E2E | A headless run configured for a sandbox reports `session.start.sandboxed` from the availability verdict, not from configuration; the Rotaris session dialog offers the mode the run will really apply | Public product boundary → user-observable result | `tests/integration/test_headless_stream.py::test_a_headless_stream_json_run_is_consumable_end_to_end`, `apps/rotaris/tests/test_sandbox_toggle.py` |

Sandboxed execution of a real process is **not** covered end-to-end; see
"Known limits".

Epic: [Secure Execution: Permissions & Sandbox](../2500-secure-execution.md)
