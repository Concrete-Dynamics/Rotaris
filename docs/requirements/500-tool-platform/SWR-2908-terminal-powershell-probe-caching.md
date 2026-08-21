---
req-id: SWR-2908
status: approved
trace: required
test: required
type: technical
derived-from: SWR-500
title: "Terminal PowerShell probe caching"
epic: SWR-500
date: 2026-08-11
---

# SWR-2908 — Terminal PowerShell probe caching

On Windows the SDK's terminal factory resolves a PowerShell binary by launching
every candidate (`pwsh.exe`, `pwsh`, `powershell.exe`, `powershell`) with a hard
5 s timeout, and it never caches the outcome — the probe reruns on every
executor construction. Under CPU load (parallel test runs, several sibling
agents starting at once) a cold PowerShell start routinely exceeds 5 s, every
candidate times out, and terminal construction fails with
`PowerShell is not available on this system` on machines that plainly have it.
This spuriously killed delegated agents before they produced a single event
(session `20260810-212722-080a1c3bc9af`, child `bg_11cc7309`) and causes the
flaky verifier-executor failures recorded in
`docs/bug/2026-08-08-verifier-executor-failure-reports-passed.md`.

Rotaris therefore wraps the vendor probe once per process before the first
`HardenedTerminalExecutor` builds its terminal session: candidates are first
resolved via `PATH` lookup (existence does not require a live launch), the
vendor probe remains the fallback for installs not on `PATH`, and any successful
resolution is cached so later constructions cannot fail transiently. This is
plumbing the terminal tool depends on to start reliably; it carries no product
behavior of its own beyond what SWR-500 already promises.

## Acceptance criteria

- A PowerShell candidate found on `PATH` is returned without launching a probe
  subprocess.
- A successful resolution is cached per process: subsequent probe calls return
  the cached value without re-probing.
- A failed resolution is not cached, so a later call may still succeed once the
  transient condition clears.
- Installing the wrapper is idempotent and happens before
  `HardenedTerminalExecutor` constructs its terminal session.

Derived from: [SWR-500 — Tool Platform & Integrations](../500-tool-platform.md)

Epic: [Tool Platform & Integrations](../500-tool-platform.md)
